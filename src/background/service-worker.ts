import type { ExtensionMessage } from "../shared/messages";
import type { ArchivedWatchlistItem, ImportedHistoryEntry, VideoDecision, VideoMetadata, VideoRecord, WatchlistItem } from "../shared/types";
import { analyzeRegret } from "../analytics/regret-score";
import { analyzeEngagement } from "../analytics/engagement-score";
import { calculatePreference } from "../analytics/preference-score";
import { makeVideoDecision } from "../analytics/decision-assistant";
import { calculateDailyPulse } from "../analytics/daily-pulse";
import { derivePersonalModel, type PersonalModel } from "../analytics/personal-model";
import { buildTopicMemory, type TopicMemory } from "../analytics/topic-memory";
import {
  checkDataLoss, clearData, exportData, finalizeStaleSessions, generateAndStoreWeeklyReport, getDiagnostics, getSettings,
  importData, putCustomTopic, putKeywordRules, rebuildAllVideoSummaries, removeOrphanSessions,
  resetDataFingerprint, resetFeedback, saveFeedback, saveSession, setSettings, reclassifyTopics
} from "../storage/data-service";
import { videoRepository } from "../storage/video-repository";
import { sessionRepository } from "../storage/session-repository";
import { auxiliaryRepository } from "../storage/auxiliary-repository";
import { feedbackRepository } from "../storage/feedback-repository";
import { impressionRepository } from "../storage/impression-repository";
import { analyzeSelectionBias } from "../analytics/selection-bias";
import { configureCloud, getCloudStatus, isCloudConfigured, resetCloud, scheduleCloudSync, signInCloud, signOutCloud, signUpCloud, syncCloudData } from "../cloud/cloud-service";
import {
  analyzeVideoWithGroq, configureGroq, fingerprintCloudInput, getGroqStatus, resetGroq, testGroqConnection
} from "../cloud/groq-service";
import { repairUnknownChannels } from "./youtube-metadata";
import { backfillDetails, deleteMedia, dismissRecommendation, getMediaStatus, getRecommendationPool, rateMedia, getProviders, markEpisode, readLibrary, recordMediaProgress, rematchMedia, searchMedia, setApiKey, setMediaTracking, toggleFavorite } from "./media-service";
import { migrateTopicRules } from "../storage/data-service";
import { uid } from "../shared/utils";
import { isAllowedCaptionUrl } from "../content/caption-tracks";
import { dayKey, deriveBudgetState, endOfDayIso } from "../shared/budget";

// ── Kısa süreli yanıt önbelleği ──────────────────────────────────────────────
// Panel 5 saniyede bir aynı ağır istekleri gönderir; 30 saniyelik TTL ile
// veri yazılmadığı sürece aynı sonucu döndürürüz.
const RESPONSE_CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

function cacheGet<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown) {
  if (responseCache.size >= 200) responseCache.clear();
  responseCache.set(key, { expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS, value });
}

/**
 * Kişisel model tüm geçmişten türetilir ve en pahalı adımdır. Veri değişene
 * kadar (önbellek temizlenene kadar) panel ve keşfet aynı modeli paylaşır.
 */
function sharedPersonalModel(usable: VideoRecord[]) {
  const cached = cacheGet<PersonalModel>("model:shared");
  if (cached) return cached;
  const model = derivePersonalModel(usable);
  cacheSet("model:shared", model);
  return model;
}

/**
 * Konu hafızası da geçmişin tamamından türetilir. Keşfet taraması 40 kart
 * gönderiyor; her kart için yeniden kurmak taramayı karesel yapardı. Panel ve
 * kart AYNI hafızayı kullanmak zorunda: farklı konu çıkarsa aynı video iki
 * yerde farklı puan alır.
 */
function sharedTopicMemory(usable: VideoRecord[]) {
  const cached = cacheGet<TopicMemory>("topics:shared");
  if (cached) return cached;
  const memory = buildTopicMemory(usable);
  cacheSet("topics:shared", memory);
  return memory;
}

const CACHE_INVALIDATING = new Set([
  "SET_SETTINGS", "SAVE_SESSION", "SAVE_FEEDBACK", "RESET_FEEDBACK", "SET_LEAVE_REASON", "DELETE_VIDEO",
  "CLEAR_DATA", "IMPORT_DATA", "IMPORT_DATA_V2", "PUT_CUSTOM_TOPIC", "DELETE_CUSTOM_TOPIC",
  "PUT_KEYWORD_RULES", "RECLASSIFY_TOPICS", "REBUILD_SUMMARIES", "REMOVE_ORPHANS", "FINALIZE_STALE"
]);

/**
 * Keşfette puanlanıp gösterilen kartları kaydeder. Model bugüne kadar yalnızca
 * AÇILAN videoları görüyordu; yüksek puan verip kullanıcının atladığı kart
 * hiçbir yere yazılmadığı için önerinin tutup tutmadığı ölçülemiyordu.
 *
 * Yazma bilerek beklenmez: keşfet taraması 250 ms'de bir çalışıyor ve rozet
 * gecikmesi kullanıcıya doğrudan yansıyor. Kayıt başarısız olursa analiz
 * eksik kalır, sayfa değil.
 */
function recordFeedImpressions(items: VideoMetadata[], decisions: VideoDecision[], watchedIds: Set<string>) {
  const entries = items
    .map((metadata, index) => ({ metadata, decision: decisions[index] }))
    // Zaten izlenmiş kartlar gösterim sayılmaz: onlar için "atladı" bilgisi
    // anlamsız, kullanıcı videoyu çoktan açmış.
    .filter(({ metadata, decision }) => decision && !watchedIds.has(metadata.videoId))
    .map(({ metadata, decision }) => ({
      videoId: metadata.videoId,
      title: metadata.title,
      channelName: metadata.channelName,
      score: decision.preference.score,
      estimatedCompletion: decision.preference.estimatedCompletion,
      modelVersion: decision.preference.model.version,
    }));
  if (!entries.length) return;
  void impressionRepository.record(entries).catch(() => undefined);
}

const WATCHLIST_ARCHIVE_KEY = "watchlistArchive";

async function archiveWatchlistItem(item: WatchlistItem) {
  const stored = (await chrome.storage.local.get(WATCHLIST_ARCHIVE_KEY))[WATCHLIST_ARCHIVE_KEY] as ArchivedWatchlistItem[] | undefined;
  const next = [{ ...item, removedAt: new Date().toISOString() }, ...(stored ?? []).filter((entry) => entry.videoId !== item.videoId)].slice(0, 200);
  await chrome.storage.local.set({ [WATCHLIST_ARCHIVE_KEY]: next });
}

async function recoverOpenYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  await Promise.allSettled(tabs.map(async (tab) => {
    if (!tab.id) return;
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          document.querySelectorAll([
            "#demirtube-panel-host", "#demirtube-player-hud", "#demirtube-shorts-dock",
            "#demirtube-budget-guard", ".demirtube-feed-analysis", ".dt-feed-mini-summary",
          ].join(",")).forEach((element) => element.remove());
        },
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["assets/content.js"] });
  }));
}

const CONTENT_RECOVERY_KEY = "contentRecoveryCompleted";

async function recoverOncePerExtensionLoad() {
  const stored = await chrome.storage.session.get(CONTENT_RECOVERY_KEY);
  if (stored[CONTENT_RECOVERY_KEY]) return;
  await chrome.storage.session.set({ [CONTENT_RECOVERY_KEY]: true });
  await recoverOpenYouTubeTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  getSettings().then(setSettings);
  chrome.alarms.create("demirtube-cloud-sync-periodic", { periodInMinutes: 15 });
  chrome.alarms.create("demirtube-weekly-report", { periodInMinutes: 10_080 });
  chrome.alarms.create("demirtube-local-backup-reminder", { periodInMinutes: 1_440 });
});

// Unpacked uzantıda Chrome'un "Yeniden yükle" düğmesi onInstalled olayını
// her zaman üretmez. Service worker yeniden uyandığında açık YouTube sekmelerini
// ping ile kontrol etmek, yalnızca yetim kalan sekmelere yeni betiği bağlar.
void recoverOncePerExtensionLoad().catch((error) => logError("RECOVER_OPEN_TABS", "background", error, false));

chrome.runtime.onStartup.addListener(() => {
  void finalizeStaleSessions();
  void scheduleCloudSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  // Bulut hiç yapılandırılmadıysa 15 dakikada bir hata loglamak, 100 kayıtlık
  // tanılama halkasını bir günde doldurup gerçek hataları görünmez yapıyordu.
  if (alarm.name.startsWith("demirtube-cloud-sync")) {
    void isCloudConfigured()
      .then((configured) => (configured ? syncCloudData() : undefined))
      .catch((error) => logError("CLOUD_SYNC", "background", error, false));
  }
  if (alarm.name === "demirtube-weekly-report") void notifyWeeklyReport();
  if (alarm.name === "demirtube-local-backup-reminder") {
    void notifyLocalBackup();
    void maybeAutoBackup();
    // Gösterim kaydı sınırsız büyümesin; günde bir kez budanır.
    void impressionRepository.prune().catch(() => undefined);
  }
});

// Alt+D (veya kullanıcının tanımladığı kısayol) → aktif YouTube sekmesinde paneli aç/kapat.
chrome.commands?.onCommand.addListener((command) => {
  if (command !== "toggle-panel") return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab?.id) return;
    void chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => undefined);
  });
});

chrome.notifications?.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("demirtube-")) void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  const handle = async () => {
    if (CACHE_INVALIDATING.has(message.type)) responseCache.clear();
    switch (message.type) {
      case "GET_SETTINGS": return getSettings();
      case "SET_SETTINGS": return setSettings(message.settings);
      case "SAVE_SESSION": {
        const saved = await saveSession(message.metadata, message.session);
        await scheduleCloudSync();
        return saved;
      }
      case "SAVE_FEEDBACK": {
        const saved = await saveFeedback(message.feedback);
        await scheduleCloudSync();
        return saved;
      }
      case "GET_VIDEO_CONTEXT": {
        const cacheKey = `ctx:${message.videoId}`;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;
        const video = await videoRepository.get(message.videoId);
        const value = {
          video,
          feedback: await feedbackRepository.get(message.videoId),
          sessions: await sessionRepository.byVideo(message.videoId),
          channelVideoCount: video ? (await videoRepository.byChannel(video.channelName)).length : 0
        };
        cacheSet(cacheKey, value);
        return value;
      }
      case "RESET_FEEDBACK": return resetFeedback(message.videoId);
      case "SET_LEAVE_REASON": {
        const session = await sessionRepository.updateLeaveReason(message.sessionId, message.reason, message.reasonText);
        await videoRepository.rebuildExisting(session.videoId);
        return session;
      }
      case "GET_DATA": {
        // Bu iki iş panelin açılışını bekletmez. Başlık onarımı ağa çıkıyor
        // (video başına bir oEmbed isteği), konu göçü de tüm kütüphaneyi
        // yeniden sınıflıyor; ikisi de birkaç saniye sürebilir ve sonucu bir
        // sonraki açılışta görünür. Ölçüm: 1500 videoda göç ~10 sn.
        void repairUnknownChannels().then(async (repaired) => { if (repaired) await scheduleCloudSync(); }).catch(() => undefined);
        void migrateTopicRules().catch(() => undefined);
        return exportData();
      }
      case "EXPORT_DATA": return exportData();
      case "IMPORT_DATA": return importData(message.data);
      case "IMPORT_DATA_V2": return importData(message.data, message.mode);
      case "CLEAR_DATA": return clearData();
      case "DELETE_VIDEO": {
        const removed = await videoRepository.remove(message.videoId);
        await resetDataFingerprint();
        return removed;
      }
      case "GET_DATA_HEALTH": return checkDataLoss();
      case "DISMISS_DATA_LOSS": return resetDataFingerprint();
      case "GET_DIAGNOSTICS": return getDiagnostics();
      case "REBUILD_SUMMARIES": return rebuildAllVideoSummaries();
      case "RECLASSIFY_TOPICS": return reclassifyTopics();
      case "FINALIZE_STALE": return finalizeStaleSessions(0);
      case "REMOVE_ORPHANS": return removeOrphanSessions();
      case "GENERATE_WEEKLY_REPORT": return generateAndStoreWeeklyReport();
      case "PUT_CUSTOM_TOPIC": return putCustomTopic(message.rule);
      case "DELETE_CUSTOM_TOPIC": return auxiliaryRepository.removeCustomTopic(message.id);
      case "PUT_KEYWORD_RULES": return putKeywordRules(message.rules);
      case "CONTENT_STATE": return chrome.storage.local.set({ contentScriptState: message.state });
      // Panel/dock React paketi yalnızca izlenebilir bir video rotasına girildiğinde,
      // içerik betiğiyle aynı izole dünyaya enjekte edilir. Aynı sekmeye tekrar
      // enjekte edilmesi zararsızdır: video-ui kendini yalnızca bir kez kaydeder.
      case "INJECT_VIDEO_UI": {
        const tabId = sender.tab?.id;
        if (tabId === undefined) throw new Error("Video arayüzü enjeksiyonu için sekme bulunamadı.");
        await chrome.scripting.executeScript({
          target: sender.frameId === undefined ? { tabId } : { tabId, frameIds: [sender.frameId] },
          files: ["assets/video-ui.js"],
        });
        return true;
      }
      case "FEED_STATE": return chrome.storage.local.set({ feedRuntimeStatus: message.status });
      case "GET_FEED_STATE": return (await chrome.storage.local.get("feedRuntimeStatus")).feedRuntimeStatus;
      case "GET_RECOMMENDATION": {
        const cacheKey = `rec:${message.metadata.videoId}`;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;
        const usable = (await videoRepository.all()).filter((video) => !video.excludedFromAnalytics);
        const watched = usable.some((video) => video.videoId === message.metadata.videoId);
        const value = calculatePreference(
          message.metadata, usable,
          watched ? undefined : sharedPersonalModel(usable),
          sharedTopicMemory(usable)
        );
        cacheSet(cacheKey, value);
        return value;
      }
      case "GET_FEED_RECOMMENDATIONS": {
        const history = (await videoRepository.all()).filter((video) => !video.excludedFromAnalytics);
        const watchedIds = new Set(history.map((video) => video.videoId));
        const sharedModel = sharedPersonalModel(history);
        const sharedTopics = sharedTopicMemory(history);
        return message.items.slice(0, 40).map((metadata) =>
          calculatePreference(
            metadata, history,
            watchedIds.has(metadata.videoId) ? undefined : sharedModel,
            sharedTopics
          )
        );
      }
      case "GET_VIDEO_DECISION": {
        const cacheKey = `dec:${message.metadata.videoId}`;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;
        const [history, feedback, settings, sessions] = await Promise.all([videoRepository.all(), feedbackRepository.all(), getSettings(), sessionRepository.all()]);
        const usable = history.filter((video) => !video.excludedFromAnalytics);
        const existing = history.find((video) => video.videoId === message.metadata.videoId);
        // Keşfet taramasıyla birebir aynı kişisel model kullanılır: hem panel
        // aynı puanı üretir hem de ağır model her istekte yeniden türetilmez.
        const decision = makeVideoDecision(
          message.metadata, usable, feedback, settings, sessions,
          existing ? undefined : sharedPersonalModel(usable),
          sharedTopicMemory(usable)
        );
        const value: VideoDecision = existing
          ? { ...decision, existingWatch: { lastSeenAt: existing.lastSeenAt, completionRate: existing.completionRate } }
          : decision;
        cacheSet(cacheKey, value);
        return value;
      }
      case "GET_FEED_DECISIONS": {
        const [history, feedback, settings, sessions] = await Promise.all([videoRepository.all(), feedbackRepository.all(), getSettings(), sessionRepository.all()]);
        const usable = history.filter((video) => !video.excludedFromAnalytics);
        const watchedById = new Map(history.map((video) => [video.videoId, video]));
        // Kartların büyük çoğunluğu henüz izlenmemiş videolardır ve aynı kişisel
        // modeli kullanır. Karesel maliyetli modeli her kart için yeniden üretmek
        // geçmiş büyüdükçe service worker'ı dakikalarca meşgul edebiliyordu.
        const sharedModel = sharedPersonalModel(usable);
        const sharedTopics = sharedTopicMemory(usable);
        const results = message.items.slice(0, 40).map((metadata) => {
          const cacheKey = `dec:${metadata.videoId}`;
          const cached = cacheGet<VideoDecision>(cacheKey);
          if (cached) return cached;
          const existing = watchedById.get(metadata.videoId);
          const decision = makeVideoDecision(
            metadata,
            usable,
            feedback,
            settings,
            sessions,
            existing ? undefined : sharedModel,
            sharedTopics
          );
          const value: VideoDecision = existing
            ? { ...decision, existingWatch: { lastSeenAt: existing.lastSeenAt, completionRate: existing.completionRate } }
            : decision;
          cacheSet(cacheKey, value);
          return value;
        });
        recordFeedImpressions(message.items.slice(0, 40), results, new Set(watchedById.keys()));
        return results;
      }
      case "GET_SELECTION_BIAS": {
        const [impressions, history] = await Promise.all([impressionRepository.all(), videoRepository.all()]);
        return analyzeSelectionBias(impressions, history);
      }
      case "FETCH_YOUTUBE_CAPTIONS": {
        if (!isAllowedCaptionUrl(message.url)) throw new Error("Geçersiz YouTube altyazı adresi.");
        const response = await fetch(message.url, {
          credentials: "omit",
          signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) throw new Error(`YouTube altyazı isteği başarısız (${response.status}).`);
        const declaredSize = Number(response.headers.get("content-length") ?? 0);
        if (declaredSize > 4_000_000) throw new Error("YouTube altyazı yanıtı güvenli boyut sınırını aştı.");
        const source = await response.text();
        if (source.length > 4_000_000) throw new Error("YouTube altyazı yanıtı güvenli boyut sınırını aştı.");
        return { source };
      }
      case "WATCHLIST_UPDATE": {
        const items = ((await chrome.storage.local.get("watchlistItems")).watchlistItems ?? []) as WatchlistItem[];
        if (!items.some(item => item.videoId === message.videoId)) throw new Error("Video artık listede değil.");
        const next = items.map(item => item.videoId === message.videoId ? { ...item, ...message.patch, updatedAt: new Date().toISOString() } : item);
        await chrome.storage.local.set({ watchlistItems: next });
        await scheduleCloudSync().catch(() => undefined);
        return next;
      }
      case "WATCHLIST_PRESENTATION": {
        const [stored, history, feedback, settings, sessions] = await Promise.all([chrome.storage.local.get("watchlistItems"), videoRepository.all(), feedbackRepository.all(), getSettings(), sessionRepository.all()]);
        const usable = history.filter(video => !video.excludedFromAnalytics);
        const model = sharedPersonalModel(usable);
        const topics = sharedTopicMemory(usable);
        return ((stored.watchlistItems ?? []) as WatchlistItem[]).map(item => {
          const video = history.find(video => video.videoId === item.videoId);
          const channel = history.find(video => (item.channelId ? video.channelId === item.channelId : video.channelName === item.channelName) && video.channelAvatarUrl);
          const metadata: VideoMetadata = { ...item, title: video?.title || item.title, contentType: video?.contentType ?? "unknown", thumbnailUrl: item.thumbnailUrl || video?.thumbnailUrl, channelAvatarUrl: item.channelAvatarUrl || video?.channelAvatarUrl || channel?.channelAvatarUrl };
          const decision = makeVideoDecision(metadata, usable, feedback, settings, sessions, video ? undefined : model, topics);
          return { videoId: item.videoId, title: metadata.title, thumbnailUrl: metadata.thumbnailUrl, channelAvatarUrl: metadata.channelAvatarUrl, score: decision.score, label: decision.decisionLabel };
        });
      }
      case "WATCHLIST_GET": return ((await chrome.storage.local.get("watchlistItems")).watchlistItems ?? []);
      case "WATCHLIST_TOGGLE": {
        const items = ((await chrome.storage.local.get("watchlistItems")).watchlistItems ?? []) as typeof message.item[];
        const exists = items.some((item) => item.videoId === message.item.videoId);
        if (exists) {
          const removed = items.find((item) => item.videoId === message.item.videoId);
          if (removed) await archiveWatchlistItem(removed);
        }
        const next = exists ? items.filter((item) => item.videoId !== message.item.videoId) : [message.item, ...items].slice(0, 100);
        await chrome.storage.local.set({ watchlistItems: next });
        return { saved: !exists, items: next };
      }
      case "WATCHLIST_REMOVE": {
        const items = ((await chrome.storage.local.get("watchlistItems")).watchlistItems ?? []) as WatchlistItem[];
        const removed = items.find((item) => item.videoId === message.videoId);
        const next = items.filter((item) => item.videoId !== message.videoId);
        await chrome.storage.local.set({ watchlistItems: next });
        if (removed) await archiveWatchlistItem(removed);
        return next;
      }
      case "WATCHLIST_ARCHIVE_GET":
        return ((await chrome.storage.local.get(WATCHLIST_ARCHIVE_KEY))[WATCHLIST_ARCHIVE_KEY] ?? []) as ArchivedWatchlistItem[];
      case "GET_CHANNEL_STATS": {
        const threshold = message.days ? Date.now() - message.days * 86_400_000 : 0;
        const videos = (await videoRepository.byChannel(message.channelName)).filter((video) =>
          !video.excludedFromAnalytics && new Date(video.lastSeenAt).getTime() >= threshold
        );
        const longVideos = videos.filter((video) => video.durationSeconds >= 1_200);
        const shortVideos = videos.filter((video) => video.durationSeconds > 0 && video.durationSeconds <= 240);
        return {
          videoCount: videos.length,
          averageCompletion: videos.length ? Math.round(videos.reduce((sum, video) => sum + video.completionRate, 0) / videos.length * 100) : null,
          averageRegret: videos.length ? Math.round(videos.reduce((sum, video) => sum + video.regretScore, 0) / videos.length) : null,
          totalWatchSeconds: videos.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0),
          completedCount: videos.filter((video) => video.completed).length,
          repeatCount: videos.filter((video) => video.rewatchSeconds > 15 || video.sessionCount > 1).length,
          longFormCompletion: longVideos.length
            ? Math.round(longVideos.reduce((sum, video) => sum + video.completionRate, 0) / longVideos.length * 100)
            : null,
          longFormCount: longVideos.length,
          shortEarlyExitCount: shortVideos.filter((video) => video.completionRate < 0.35).length,
          shortCount: shortVideos.length
        };
      }
      case "REQUEST_HISTORY_IMPORT": {
        await chrome.storage.local.set({
          historyImportRequest: { days: message.days, requestedAt: new Date().toISOString() }
        });
        return { requested: true };
      }
      case "GET_HISTORY_IMPORT_REQUEST": {
        const stored = (await chrome.storage.local.get("historyImportRequest")).historyImportRequest;
        // İstek tek kullanımlıktır: kullanıcı geçmiş sayfasını sonra tekrar
        // açtığında tarama kendiliğinden başlamamalı.
        if (stored) await chrome.storage.local.remove("historyImportRequest");
        return stored;
      }
      case "IMPORT_WATCH_HISTORY": return importWatchHistory(message.entries);
      case "GET_DAILY_PULSE": {
        const [videos, sessions, settings] = await Promise.all([
          videoRepository.all(), sessionRepository.all(), getSettings()
        ]);
        return calculateDailyPulse(videos, sessions, settings);
      }
      case "GET_BUDGET_STATE": return readBudgetState();
      case "SET_SHORTS_PAUSE": {
        await chrome.storage.local.set({
          shortsPauseUntil: message.active ? endOfDayIso() : undefined,
          // Duraklatmayı seçen kullanıcıya aynı şeridi tekrar göstermeyiz.
          budgetNoticeDismissedFor: message.active ? dayKey() : undefined
        });
        return readBudgetState();
      }
      case "DISMISS_BUDGET_NOTICE": {
        await chrome.storage.local.set({ budgetNoticeDismissedFor: dayKey() });
        return readBudgetState();
      }
      case "GET_TODAY_WATCH": {
        const [seconds, settings] = await Promise.all([todayWatchSeconds(), getSettings()]);
        return { seconds, budgetMinutes: settings.dailyWatchBudgetMinutes };
      }
      case "NTFY_TEST": {
        const sent = await pushNtfy("DemirTube test bildirimi", "ntfy bağlantısı çalışıyor 🎉");
        if (!sent) throw new Error("ntfy gönderilemedi; konu adını ve izni kontrol et.");
        return { sent };
      }
      case "AI_GET_STATUS": return getGroqStatus();
      case "AI_CONFIGURE": return configureGroq(message.apiKey, message.config);
      case "AI_TEST": return testGroqConnection();
      case "AI_RESET": return resetGroq();
      case "AI_ANALYZE_VIDEO": {
        const status = await getGroqStatus();
        if (!status.configured) throw new Error("Groq bağlantısı kurulmadı; yerel analiz kullanılacak.");
        const existing = await videoRepository.get(message.input.videoId);
        const fingerprint = fingerprintCloudInput(message.input);
        if (existing?.cloudAnalysis?.inputFingerprint === fingerprint && existing.cloudAnalysis.model === status.model) {
          return existing.cloudAnalysis;
        }
        const analysis = await analyzeVideoWithGroq(message.input);
        if (existing) await videoRepository.saveCloudAnalysis(message.input.videoId, analysis);
        return analysis;
      }
      case "CLOUD_GET_STATUS": return getCloudStatus();
      case "CLOUD_CONFIGURE": return configureCloud(message.config);
      case "CLOUD_SIGN_IN": return signInCloud(message.email, message.password);
      case "CLOUD_SIGN_UP": return signUpCloud(message.email, message.password);
      case "CLOUD_SIGN_OUT": return signOutCloud();
      case "CLOUD_RESET": return resetCloud();
      case "CLOUD_SYNC": return syncCloudData();
      case "MEDIA_PROGRESS": return recordMediaProgress(message.report, sender, (await getSettings()).trackingEnabled);
      case "MEDIA_GET": return { library: await readLibrary(), status: await getMediaStatus() };
      case "MEDIA_SET_API_KEY": return setApiKey(message.apiKey);
      case "MEDIA_SET_TRACKING": return setMediaTracking(message.enabled);
      case "MEDIA_SEARCH": return searchMedia(message.query);
      case "MEDIA_TOGGLE_FAVORITE": return toggleFavorite(message);
      case "MEDIA_REMATCH": return rematchMedia(message.titleKey, message.result);
      case "MEDIA_DELETE": return deleteMedia(message.titleKey);
      case "MEDIA_MARK_EPISODE": return markEpisode(message.progressId, message.completed);
      case "MEDIA_PROVIDERS": return getProviders(message.kind, message.tmdbId);
      case "MEDIA_BACKFILL": return backfillDetails();
      case "MEDIA_REC_POOL": return (await getRecommendationPool(message.force)) ?? null;
      case "MEDIA_RATE": return rateMedia(message);
      case "MEDIA_DISMISS": return dismissRecommendation(message.result);
    }
  };
  handle().then(sendResponse).catch(async (error: unknown) => {
    await logError(`MESSAGE_${message.type}`, "service-worker", error, false);
    sendResponse({ error: error instanceof Error ? error.message : "Beklenmeyen hata" });
  });
  return true;
});



/**
 * Geçmiş sayfasından okunan kayıtları video deposuna ekler.
 *
 * İki kural: (1) izlenerek kaydedilmiş bir video asla ezilmez — gerçek oturum
 * verisi, ilerleme çubuğundan tahmin edilen orandan her zaman iyidir.
 * (2) İçe aktarılan kayıt `source: "imported"` ile işaretlenir; oturumu
 * olmadığı için ritim/ısı haritası gibi oturum tabanlı analizlere zaten girmez,
 * ama modele kanıt olur.
 */
async function importWatchHistory(entries: ImportedHistoryEntry[]) {
  const existing = new Set((await videoRepository.all()).map((video) => video.videoId));
  let added = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (existing.has(entry.videoId)) { skipped += 1; continue; }
    if (!entry.durationSeconds || entry.durationSeconds <= 0) { skipped += 1; continue; }
    // İlerleme çubuğu olmayan kart, videonun hiç izlenmediği anlamına gelmez:
    // YouTube çubuğu yalnızca kaydedilmiş bir konum varken gösterir. Tamamlanma
    // oranını 0 varsaymak modele olmayan bir başarısızlık öğretirdi, o yüzden
    // ölçülemeyen kayıt hiç alınmaz.
    if (entry.progressPercent === undefined) { skipped += 1; continue; }

    const completionRate = clamp01(entry.progressPercent / 100);
    const watchedSeconds = Math.round(entry.durationSeconds * completionRate);
    const seenAt = entry.watchedAt ?? new Date().toISOString();
    const regret = analyzeRegret({
      title: entry.title,
      totalActiveWatchSeconds: watchedSeconds,
      durationSeconds: entry.durationSeconds,
      completionRate,
      reopened: false,
      followedByAnotherVideo: false,
      endedNaturally: completionRate >= 0.9,
      contentType: entry.contentType,
    });
    const engagement = analyzeEngagement({
      completionRate,
      totalActiveWatchSeconds: watchedSeconds,
      sessionCount: 1,
      rewatchSeconds: 0,
      backwardSeeks: 0,
      endedNaturally: completionRate >= 0.9,
      earlyAbandoned: completionRate < 0.15,
      contentType: entry.contentType,
    });

    await videoRepository.put({
      videoId: entry.videoId,
      title: entry.title,
      channelName: entry.channelName,
      url: entry.url,
      durationSeconds: entry.durationSeconds,
      topics: entry.topics,
      inferredTopics: entry.topics,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      totalWatchSeconds: watchedSeconds,
      totalActiveWatchSeconds: watchedSeconds,
      uniqueWatchedSeconds: watchedSeconds,
      rewatchSeconds: 0,
      uniquePlaybackSegments: watchedSeconds > 0 ? [{ start: 0, end: watchedSeconds }] : [],
      completionRate,
      sessionCount: 0,
      completed: completionRate >= 0.9,
      regretScore: regret.regretScore,
      regretLabel: regret.regretLabel,
      regretFactors: regret.contributingFactors,
      regretConfidence: "low",
      engagementScore: engagement.score,
      engagementLabel: engagement.label,
      engagementFactors: engagement.contributingFactors,
      engagementConfidence: "low",
      contentType: entry.contentType,
      source: "imported",
      importedAt: new Date().toISOString(),
    });
    existing.add(entry.videoId);
    added += 1;
  }

  if (added) await resetDataFingerprint();
  return { added, skipped };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Bugün başlayan oturumların toplam aktif süresi (saniye). */
async function todayWatchSeconds() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessions = await sessionRepository.startedSince(dayStart.toISOString());
  const todayKey = now.toDateString();
  return sessions
    .filter((session) => new Date(session.startedAt).toDateString() === todayKey)
    .reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0);
}

/** Bugünkü aktif süreyi, bütçeyi ve Shorts duraklatmasını tek durumda toplar. */
async function readBudgetState() {
  const [seconds, settings, stored] = await Promise.all([
    todayWatchSeconds(),
    getSettings(),
    chrome.storage.local.get(["shortsPauseUntil", "budgetNoticeDismissedFor"])
  ]);
  return deriveBudgetState({
    seconds,
    budgetMinutes: settings.dailyWatchBudgetMinutes,
    shortsPauseUntil: stored.shortsPauseUntil as string | undefined,
    noticeDismissedFor: stored.budgetNoticeDismissedFor as string | undefined
  });
}

async function logError(errorCode: string, component: string, error: unknown, recovered: boolean) {
  const value = error instanceof Error ? error : new Error(String(error));
  await auxiliaryRepository.log({
    id: uid(),
    errorCode,
    timestamp: new Date().toISOString(),
    component,
    safeMessage: value.message.slice(0, 500),
    stack: value.stack?.slice(0, 4_000),
    recovered
  }).catch(() => undefined);
}

async function notifyWeeklyReport() {
  try {
    const settings = await getSettings();
    const report = await generateAndStoreWeeklyReport();
    const summary = `${Math.round(report.totalWatchSeconds / 60)} dakika · ${report.videoCount} video · %${report.averageCompletion} tamamlama`;
    // ntfy.sh push, Chrome bildirim ayarından bağımsızdır: konu adı varsa her hafta gönderilir.
    await pushNtfy("DemirTube haftalık raporun hazır", summary);
    if (!settings.weeklyNotificationEnabled || !chrome.notifications) return;
    const permission = await chrome.permissions.contains({ permissions: ["notifications"] });
    if (!permission) return;
    await chrome.notifications.create(`demirtube-weekly-${report.id}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon-128.png"),
      title: "DemirTube haftalık raporun hazır",
      message: summary
    });
  } catch (error) {
    await logError("WEEKLY_REPORT", "background", error, false);
  }
}

/** ntfy.sh üzerinden ücretsiz push bildirimi gönderir. Konu adı yoksa/izin yoksa false döner. */
async function pushNtfy(title: string, body: string): Promise<boolean> {
  try {
    const settings = await getSettings();
    const topic = settings.ntfyTopic?.trim();
    if (!topic || !/^[a-zA-Z0-9_-]{1,64}$/.test(topic)) return false;
    const granted = await chrome.permissions.contains({ origins: ["https://ntfy.sh/*"] });
    if (!granted) return false;
    const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: { Title: title, Tags: "bar_chart", Priority: "3" },
      body
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Otomatik JSON yedeği: ayar açıksa ve süre dolduysa sessizce İndirilenler/DemirTube altına indirir. */
async function maybeAutoBackup() {
  try {
    const settings = await getSettings();
    if (!settings.autoBackupEnabled || !chrome.downloads) return;
    const granted = await chrome.permissions.contains({ permissions: ["downloads"] });
    if (!granted) return;
    const last = settings.lastLocalExportAt ? new Date(settings.lastLocalExportAt).getTime() : 0;
    if (Date.now() - last < settings.backupReminderDays * 86_400_000) return;
    const data = await exportData();
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data))}`;
    await chrome.downloads.download({
      url,
      filename: `DemirTube/demirtube-yedek-${new Date().toISOString().slice(0, 10)}.json`,
      saveAs: false,
      conflictAction: "uniquify"
    });
    await setSettings({ ...settings, lastLocalExportAt: new Date().toISOString() });
  } catch (error) {
    await logError("AUTO_BACKUP", "background", error, false);
  }
}

async function notifyLocalBackup() {
  try {
    const settings = await getSettings();
    if (!settings.backupReminderEnabled || !chrome.notifications) return;
    const permission = await chrome.permissions.contains({ permissions: ["notifications"] });
    if (!permission) return;
    const last = settings.lastLocalExportAt ? new Date(settings.lastLocalExportAt).getTime() : 0;
    if (Date.now() - last < settings.backupReminderDays * 86_400_000) return;
    await chrome.notifications.create("demirtube-local-backup", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon-128.png"),
      title: "DemirTube yerel yedeğini güncelle",
      message: "Ayarlar → Yerel veriler bölümünden güncel JSON yedeğini indirebilirsin."
    });
  } catch (error) {
    await logError("LOCAL_BACKUP_REMINDER", "background", error, false);
  }
}
