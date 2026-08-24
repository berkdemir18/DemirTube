import type { ExtensionMessage } from "../shared/messages";
import type { ArchivedWatchlistItem, VideoDecision, VideoRecord, WatchlistItem } from "../shared/types";
import { calculatePreference } from "../analytics/preference-score";
import { makeVideoDecision } from "../analytics/decision-assistant";
import { calculateDailyPulse } from "../analytics/daily-pulse";
import { derivePersonalModel, type PersonalModel } from "../analytics/personal-model";
import {
  checkDataLoss, clearData, exportData, finalizeStaleSessions, generateAndStoreWeeklyReport, getDiagnostics, getSettings,
  importData, putCustomTopic, putKeywordRules, rebuildAllVideoSummaries, removeOrphanSessions,
  resetDataFingerprint, resetFeedback, saveFeedback, saveSession, setSettings, reclassifyTopics
} from "../storage/data-service";
import { videoRepository } from "../storage/video-repository";
import { sessionRepository } from "../storage/session-repository";
import { auxiliaryRepository } from "../storage/auxiliary-repository";
import { feedbackRepository } from "../storage/feedback-repository";
import { configureCloud, getCloudStatus, isCloudConfigured, resetCloud, scheduleCloudSync, signInCloud, signOutCloud, signUpCloud, syncCloudData } from "../cloud/cloud-service";
import {
  analyzeVideoWithGroq, configureGroq, fingerprintCloudInput, getGroqStatus, resetGroq, testGroqConnection
} from "../cloud/groq-service";
import { repairUnknownChannels } from "./youtube-metadata";
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

const CACHE_INVALIDATING = new Set([
  "SET_SETTINGS", "SAVE_SESSION", "SAVE_FEEDBACK", "RESET_FEEDBACK", "SET_LEAVE_REASON", "DELETE_VIDEO",
  "CLEAR_DATA", "IMPORT_DATA", "IMPORT_DATA_V2", "PUT_CUSTOM_TOPIC", "DELETE_CUSTOM_TOPIC",
  "PUT_KEYWORD_RULES", "RECLASSIFY_TOPICS", "REBUILD_SUMMARIES", "REMOVE_ORPHANS", "FINALIZE_STALE"
]);

const WATCHLIST_ARCHIVE_KEY = "watchlistArchive";

async function archiveWatchlistItem(item: WatchlistItem) {
  const stored = (await chrome.storage.local.get(WATCHLIST_ARCHIVE_KEY))[WATCHLIST_ARCHIVE_KEY] as ArchivedWatchlistItem[] | undefined;
  const next = [{ ...item, removedAt: new Date().toISOString() }, ...(stored ?? []).filter((entry) => entry.videoId !== item.videoId)].slice(0, 200);
  await chrome.storage.local.set({ [WATCHLIST_ARCHIVE_KEY]: next });
}

chrome.runtime.onInstalled.addListener(() => {
  getSettings().then(setSettings);
  chrome.alarms.create("demirtube-cloud-sync-periodic", { periodInMinutes: 15 });
  chrome.alarms.create("demirtube-weekly-report", { periodInMinutes: 10_080 });
  chrome.alarms.create("demirtube-local-backup-reminder", { periodInMinutes: 1_440 });
});

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

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
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
        if (await repairUnknownChannels()) await scheduleCloudSync();
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
        const tabId = _sender.tab?.id;
        if (tabId === undefined) throw new Error("Video arayüzü enjeksiyonu için sekme bulunamadı.");
        await chrome.scripting.executeScript({
          target: _sender.frameId === undefined ? { tabId } : { tabId, frameIds: [_sender.frameId] },
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
        const value = calculatePreference(message.metadata, usable, watched ? undefined : sharedPersonalModel(usable));
        cacheSet(cacheKey, value);
        return value;
      }
      case "GET_FEED_RECOMMENDATIONS": {
        const history = (await videoRepository.all()).filter((video) => !video.excludedFromAnalytics);
        const watchedIds = new Set(history.map((video) => video.videoId));
        const sharedModel = sharedPersonalModel(history);
        return message.items.slice(0, 40).map((metadata) =>
          calculatePreference(metadata, history, watchedIds.has(metadata.videoId) ? undefined : sharedModel)
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
          existing ? undefined : sharedPersonalModel(usable)
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
        return message.items.slice(0, 40).map((metadata) => {
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
            existing ? undefined : sharedModel
          );
          const value: VideoDecision = existing
            ? { ...decision, existingWatch: { lastSeenAt: existing.lastSeenAt, completionRate: existing.completionRate } }
            : decision;
          cacheSet(cacheKey, value);
          return value;
        });
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
    }
  };
  handle().then(sendResponse).catch(async (error: unknown) => {
    await logError(`MESSAGE_${message.type}`, "service-worker", error, false);
    sendResponse({ error: error instanceof Error ? error.message : "Beklenmeyen hata" });
  });
  return true;
});


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
