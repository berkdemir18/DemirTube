import type { VideoRecord,
  AppData,
  ArchivedWatchlistItem,
  CustomTopicRule,
  DataFingerprint,
  DataLossReport,
  DiagnosticsReport,
  KeywordRules,
  LegacyAppData,
  Settings,
  UserVideoFeedback,
  VideoMetadata,
  WatchSession,
  WatchlistItem
} from "../shared/types";
import { APP_VERSION, DB_VERSION, DEFAULT_KEYWORD_RULES, DEFAULT_SETTINGS } from "../shared/constants";
import { getDatabase } from "./database";
import { mergeLibraries } from "../media/library";
import { emptyLibrary, type MediaLibrary } from "../media/types";
import { sessionRepository } from "./session-repository";
import { videoRepository } from "./video-repository";
import { feedbackRepository } from "./feedback-repository";
import { auxiliaryRepository } from "./auxiliary-repository";
import { generateWeeklyReport } from "../analytics/weekly-report";
import { matchCustomTopics } from "../analytics/custom-topics";
import { classifyTopics } from "../analytics/topic-classifier";
import { buildTopicMemory } from "../analytics/topic-memory";

export async function getSettings(): Promise<Settings> {
  if (!globalThis.chrome?.storage) return DEFAULT_SETTINGS;
  const result = await chrome.storage.local.get("settings");
  const stored = result.settings as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored, goals: { ...DEFAULT_SETTINGS.goals, ...stored?.goals } };
}

export async function setSettings(settings: Settings) {
  const normalized = { ...DEFAULT_SETTINGS, ...settings, goals: { ...DEFAULT_SETTINGS.goals, ...settings.goals } };
  await chrome.storage.local.set({ settings: normalized });
  return normalized;
}

// ── Veri kaybı dedektörü ─────────────────────────────────────────────────────
// IndexedDB, eklentinin kontrolü dışında sıfırlanabilir (tarayıcı site verisi
// temizliği, eklentinin kaldırılıp yeniden yüklenmesi, leveldb bozulması).
// Böyle bir durumda dashboard sessizce bomboş açılır ve kullanıcı verisinin
// gittiğini haftalar sonra fark eder. Bunu yakalamak için kayıt sayısının en
// yüksek gördüğü değeri chrome.storage.local'da tutarız: storage.local ayrı bir
// depodur ve IndexedDB silindiğinde ayakta kalır.
const DATA_FINGERPRINT_KEY = "dataFingerprint";
/** Bu sayının altındaki kayıp "yeni kurulum" gürültüsüdür, uyarı üretmez. */
const LOSS_ALERT_MIN_VIDEOS = 10;

export async function readDataFingerprint(): Promise<DataFingerprint | undefined> {
  if (!globalThis.chrome?.storage) return undefined;
  const stored = (await chrome.storage.local.get(DATA_FINGERPRINT_KEY))[DATA_FINGERPRINT_KEY] as DataFingerprint | undefined;
  return typeof stored?.videos === "number" ? stored : undefined;
}

async function countRecords() {
  const database = await getDatabase();
  const [videos, sessions] = await Promise.all([database.count("videos"), database.count("sessions")]);
  return { videos, sessions };
}

/**
 * Normal yazma sonrası çağrılır. Yalnızca yukarı doğru hareket eder: kayıptan
 * sonra izlenen ilk video, kaybın kanıtını silmesin diye.
 */
export async function recordDataFingerprint() {
  if (!globalThis.chrome?.storage) return undefined;
  const [current, previous] = await Promise.all([countRecords(), readDataFingerprint()]);
  const next: DataFingerprint = {
    videos: Math.max(current.videos, previous?.videos ?? 0),
    sessions: Math.max(current.sessions, previous?.sessions ?? 0),
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [DATA_FINGERPRINT_KEY]: next });
  return next;
}

/** Kasıtlı küçülmelerden sonra (video silme, yetim temizliği, replace import, uyarıyı yoksayma). */
export async function resetDataFingerprint() {
  if (!globalThis.chrome?.storage) return undefined;
  const next: DataFingerprint = { ...(await countRecords()), updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [DATA_FINGERPRINT_KEY]: next });
  return next;
}

export async function checkDataLoss(): Promise<DataLossReport> {
  const [expected, actual] = await Promise.all([readDataFingerprint(), countRecords()]);
  const lost = Boolean(
    expected
    && expected.videos >= LOSS_ALERT_MIN_VIDEOS
    && actual.videos * 2 < expected.videos
  );
  return { lost, expected, actual };
}

export async function saveSession(metadata: VideoMetadata, session: WatchSession) {
  await sessionRepository.put(session);
  const [feedback, customTopics] = await Promise.all([
    feedbackRepository.get(metadata.videoId),
    auxiliaryRepository.customTopics()
  ]);
  const matched = matchCustomTopics(
    metadata.title,
    metadata.channelName,
    customTopics,
    `${metadata.description ?? ""} ${(metadata.hashtags ?? []).join(" ")}`
  );
  const enrichedMetadata = matched.length
    ? { ...metadata, topics: [...new Set([...matched, ...metadata.topics])] }
    : metadata;
  const saved = await videoRepository.rebuild(enrichedMetadata, await sessionRepository.byVideo(metadata.videoId), feedback);
  await chrome.storage.local.set({ lastSuccessfulCheckpoint: new Date().toISOString() });
  await recordDataFingerprint();
  return saved;
}

export async function saveFeedback(feedback: UserVideoFeedback) {
  const normalized = { ...feedback, updatedAt: new Date().toISOString() };
  await feedbackRepository.put(normalized);
  await videoRepository.rebuildExisting(feedback.videoId, normalized);
  return normalized;
}

export async function resetFeedback(videoId: string) {
  await feedbackRepository.remove(videoId);
  await videoRepository.rebuildExisting(videoId);
}

export async function finalizeStaleSessions(staleAfterMs = 120_000) {
  const sessions = await sessionRepository.all();
  const stale = sessions.filter((session) =>
    session.active && Date.now() - new Date(session.updatedAt ?? session.startedAt).getTime() >= staleAfterMs
  );
  if (!stale.length) return 0;
  await Promise.all(stale.map(async (session) => {
    const endedAt = session.updatedAt ?? session.startedAt;
    await sessionRepository.put({ ...session, active: false, endedAt });
  }));
  const feedback = new Map((await feedbackRepository.all()).map((item) => [item.videoId, item]));
  await Promise.all([...new Set(stale.map((session) => session.videoId))].map((videoId) => videoRepository.rebuildExisting(videoId, feedback.get(videoId))));
  return stale.length;
}

export async function rebuildAllVideoSummaries() {
  const [videos, feedback] = await Promise.all([videoRepository.all(), feedbackRepository.all()]);
  const feedbackMap = new Map(feedback.map((item) => [item.videoId, item]));
  let rebuilt = 0;
  for (const video of videos) {
    await videoRepository.rebuildExisting(video.videoId, feedbackMap.get(video.videoId));
    rebuilt += 1;
  }
  return rebuilt;
}

/** İki konu listesi aynı mı — sıra dahil. */
const sameTopics = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((topic, index) => topic === right[index]);

/** Tek seferde yazılan video sayısı; her öbek ayrı bir IndexedDB işlemidir. */
const RECLASSIFY_CHUNK = 200;

/**
 * Kayıtlı videoların konularını yeniden hesaplar.
 *
 * İki şey ölçülerek değişti (1500 videoluk ölçüm, 2026-09-13):
 *   • Video başına ayrı `put` çağrısı toplam sürenin ~%80'iydi. Artık yalnızca
 *     konusu GERÇEKTEN değişen videolar yazılıyor ve yazma öbekler hâlinde
 *     tek işlemde yapılıyor.
 *   • Hesap tarafı (sınıflandırma) 1500 videoda ~1.9 sn; bu yüzden işlem
 *     panelin açılışını bekletmemeli, arka planda yürümeli.
 */
export async function reclassifyTopics() {
  const [videos, feedback, customTopics] = await Promise.all([videoRepository.all(), feedbackRepository.all(), auxiliaryRepository.customTopics()]);
  const feedbackByVideo = new Map(feedback.map((item) => [item.videoId, item]));
  const database = await getDatabase();
  // Hafıza yeniden sınıflamadan ÖNCE bir kez kurulur: elle düzeltilen konular
  // ve kanal tutarlılığı, anlaşılamamış başlıkları da kurtarabilsin.
  const memory = buildTopicMemory(videos);
  const changed: VideoRecord[] = [];
  for (const video of videos) {
    if (feedbackByVideo.get(video.videoId)?.manualTopics?.length) continue;
    const context = `${video.description ?? ""} ${(video.hashtags ?? []).join(" ")}`;
    const inferred = classifyTopics(video.title, video.channelName, context, memory);
    // Kullanıcının kendi konu kuralları da yeniden uygulanır; önceden yeniden
    // sınıflama bunları siliyor, bir sonraki izlemede geri geliyorlardı.
    const custom = matchCustomTopics(video.title, video.channelName, customTopics, context);
    const topics = custom.length ? [...new Set([...custom, ...inferred.filter((topic) => topic !== "Diğer")])] : inferred;
    if (sameTopics(video.topics, topics) && sameTopics(video.inferredTopics ?? [], inferred)) continue;
    changed.push({ ...video, topics, inferredTopics: inferred });
  }
  for (let index = 0; index < changed.length; index += RECLASSIFY_CHUNK) {
    const transaction = database.transaction("videos", "readwrite");
    await Promise.all(changed.slice(index, index + RECLASSIFY_CHUNK).map((video) => transaction.store.put(video)));
    await transaction.done;
  }
  return changed.length;
}

/**
 * Konu kuralları değiştiğinde kayıtlı videolar eski etiketlerle kalır. Sürüm
 * artınca bir kez, kullanıcı hiçbir şeye basmadan yeniden sınıflanır.
 */
const TOPIC_RULES_VERSION = 2;

let topicMigrationRunning = false;

/**
 * Panel açılışını bekletmez: çağıran `await` etmez, iş arka planda yürür ve
 * sonucu bir sonraki açılışta görünür. Aynı anda iki kez başlamasın diye
 * bayrakla korunur.
 */
export async function migrateTopicRules() {
  if (topicMigrationRunning) return;
  const { topicRulesVersion } = await chrome.storage.local.get("topicRulesVersion");
  if (Number(topicRulesVersion ?? 0) >= TOPIC_RULES_VERSION) return;
  topicMigrationRunning = true;
  try {
    await reclassifyTopics();
    await chrome.storage.local.set({ topicRulesVersion: TOPIC_RULES_VERSION });
  } finally {
    topicMigrationRunning = false;
  }
}

async function migrateLegacySummaries() {
  const videos = await videoRepository.all();
  if (videos.some((video) =>
    video.totalActiveWatchSeconds === undefined || !video.contentType
    || video.engagementScore === undefined
  )) {
    await rebuildAllVideoSummaries();
  }
}

export function checksumPayload(value: unknown) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function exportData(): Promise<AppData> {
  await finalizeStaleSessions();
  await migrateLegacySummaries();
  const [videos, sessions, feedback, customTopics, keywordRules, weeklyReports, diagnostics, settings, storedWatchlist] = await Promise.all([
    videoRepository.all(),
    sessionRepository.all(),
    feedbackRepository.all(),
    auxiliaryRepository.customTopics(),
    auxiliaryRepository.keywordRules(),
    auxiliaryRepository.reports(),
    auxiliaryRepository.diagnostics(),
    getSettings(),
    chrome.storage.local.get(["watchlistItems", "watchlistArchive", "mediaLibrary"])
  ]);
  const base = {
    version: 2 as const,
    schemaVersion: 2 as const,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { videos: videos.length, sessions: sessions.length, feedback: feedback.length, customTopics: customTopics.length },
    videos,
    sessions,
    feedback,
    customTopics,
    keywordRules,
    weeklyReports,
    diagnostics: diagnostics.map(({ stack: _stack, ...safe }) => safe),
    settings,
    watchlist: (storedWatchlist.watchlistItems ?? []) as WatchlistItem[],
    watchlistArchive: (storedWatchlist.watchlistArchive ?? []) as ArchivedWatchlistItem[],
    ...(storedWatchlist.mediaLibrary ? { media: storedWatchlist.mediaLibrary as MediaLibrary } : {})
  };
  return { ...base, checksum: checksumPayload(base) };
}

function mergeByMostRecent<T extends { videoId: string }>(current: T[], incoming: T[], timestamp: (item: T) => string) {
  const merged = new Map(current.map((item) => [item.videoId, item]));
  for (const item of incoming) {
    const existing = merged.get(item.videoId);
    if (!existing || timestamp(item) >= timestamp(existing)) merged.set(item.videoId, item);
  }
  return [...merged.values()];
}

export function validateImport(input: unknown): { valid: boolean; version?: 1 | 2; error?: string } {
  if (!input || typeof input !== "object") return { valid: false, error: "Dosya bir JSON nesnesi değil." };
  const data = input as Partial<AppData> | Partial<LegacyAppData>;
  if (data.version !== 1 && data.version !== 2) return { valid: false, error: "Desteklenmeyen yedek sürümü." };
  if (!Array.isArray(data.videos) || !Array.isArray(data.sessions)) return { valid: false, error: "Video veya oturum listesi eksik." };
  if (data.version === 2) {
    const current = data as Partial<AppData>;
    if (current.schemaVersion !== 2 || typeof current.checksum !== "string") return { valid: false, error: "Şema veya doğrulama bilgisi eksik." };
    const { checksum: _checksum, ...base } = current as AppData;
    if (checksumPayload(base) !== current.checksum) return { valid: false, error: "Yedek doğrulaması başarısız; dosya bozulmuş olabilir." };
  }
  return { valid: true, version: data.version };
}

export async function importData(input: AppData | LegacyAppData, mode: "merge" | "replace" = "merge") {
  const validation = validateImport(input);
  if (!validation.valid) throw new Error(validation.error);
  const database = await getDatabase();
  if (mode === "replace") {
    const transaction = database.transaction(["videos", "sessions", "feedback", "customTopics", "keywordRules", "weeklyReports"], "readwrite");
    await Promise.all([...transaction.objectStoreNames].map((name) => transaction.objectStore(name).clear()));
    await transaction.done;
  }
  const sessions = new Map((await sessionRepository.all()).map((session) => [session.id, session]));
  for (const session of input.sessions) {
    const existing = sessions.get(session.id);
    const nextTime = session.updatedAt ?? session.endedAt ?? session.startedAt;
    const oldTime = existing?.updatedAt ?? existing?.endedAt ?? existing?.startedAt ?? "";
    if (!existing || nextTime >= oldTime) sessions.set(session.id, session);
  }
  await Promise.all([...sessions.values()].map((session) => sessionRepository.put(session)));
  for (const video of input.videos) {
    await database.put("videos", {
      contentType: "unknown",
      totalActiveWatchSeconds: video.totalWatchSeconds,
      uniqueWatchedSeconds: Math.min(video.totalWatchSeconds, video.durationSeconds),
      rewatchSeconds: 0,
      uniquePlaybackSegments: [],
      engagementScore: 0,
      ...video
    } as never);
  }
  if (input.version === 2) {
    await Promise.all(input.feedback.map((item) => feedbackRepository.put(item)));
    await Promise.all(input.customTopics.map((item) => auxiliaryRepository.putCustomTopic(item)));
    await auxiliaryRepository.putKeywordRules(input.keywordRules ?? DEFAULT_KEYWORD_RULES);
    await Promise.all(input.weeklyReports.map((item) => auxiliaryRepository.putReport(item)));
  }
  await setSettings({ ...DEFAULT_SETTINGS, ...input.settings });
  const storedLists = await chrome.storage.local.get(["watchlistItems", "watchlistArchive", "mediaLibrary"]);
  const incomingMedia = input.version === 2 && input.media?.version === 1 ? input.media : undefined;
  if (mode === "replace") {
    if (incomingMedia) await chrome.storage.local.set({ mediaLibrary: incomingMedia });
    else await chrome.storage.local.remove("mediaLibrary");
    if (input.version === 2 && input.watchlist?.length) await chrome.storage.local.set({ watchlistItems: input.watchlist });
    else await chrome.storage.local.remove("watchlistItems");
    if (input.version === 2 && input.watchlistArchive?.length) await chrome.storage.local.set({ watchlistArchive: input.watchlistArchive });
    else await chrome.storage.local.remove("watchlistArchive");
  } else if (input.version === 2) {
    if (incomingMedia) {
      const currentMedia = (storedLists.mediaLibrary as MediaLibrary | undefined) ?? emptyLibrary();
      await chrome.storage.local.set({ mediaLibrary: mergeLibraries(currentMedia, incomingMedia) });
    }
    const currentWatchlist = (storedLists.watchlistItems ?? []) as WatchlistItem[];
    const currentArchive = (storedLists.watchlistArchive ?? []) as ArchivedWatchlistItem[];
    await chrome.storage.local.set({
      watchlistItems: mergeByMostRecent(currentWatchlist, input.watchlist ?? [], (item) => item.updatedAt ?? item.addedAt),
      watchlistArchive: mergeByMostRecent(currentArchive, input.watchlistArchive ?? [], (item) => item.removedAt)
    });
  }
  await rebuildAllVideoSummaries();
  // Yedekten geri yükleme kaybı telafi eder; beklenen sayı buradan yeniden kurulur.
  await resetDataFingerprint();
  return {
    importedVideos: input.videos.length,
    importedSessions: input.sessions.length,
    skippedInvalid: 0,
    mode
  };
}

export async function getDiagnostics(): Promise<DiagnosticsReport> {
  const [videos, sessions, settings, logs] = await Promise.all([
    videoRepository.all(), sessionRepository.all(), getSettings(), auxiliaryRepository.diagnostics()
  ]);
  const ids = new Set(videos.map((video) => video.videoId));
  const storage = await chrome.storage.local.get(["lastSuccessfulCheckpoint", "cloudMeta", "contentScriptState"]);
  return {
    extensionVersion: chrome.runtime.getManifest().version,
    databaseVersion: DB_VERSION,
    videoCount: videos.length,
    sessionCount: sessions.length,
    activeSessionCount: sessions.filter((session) => session.active).length,
    malformedRecords: videos.filter((video) => !video.videoId || !video.title || !Number.isFinite(video.totalWatchSeconds)).length,
    missingMetadata: videos.filter((video) => !video.channelName || video.channelName === "Bilinmeyen kanal").length,
    sessionsMissingDuration: sessions.filter((session) => !ids.has(session.videoId)).length,
    orphanSessions: sessions.filter((session) => !ids.has(session.videoId)).length,
    duplicateSessions: sessions.length - new Set(sessions.map((session) => session.id)).size,
    lastSuccessfulCheckpoint: storage.lastSuccessfulCheckpoint as string | undefined,
    lastBackgroundError: logs.toSorted((a, b) => b.timestamp.localeCompare(a.timestamp))[0],
    lastSyncResult: (storage.cloudMeta as { lastSyncedAt?: string } | undefined)?.lastSyncedAt,
    trackingEnabled: settings.trackingEnabled,
    contentScriptState: storage.contentScriptState as string | undefined,
    generatedAt: new Date().toISOString()
  };
}

export async function removeOrphanSessions() {
  const [videos, sessions] = await Promise.all([videoRepository.all(), sessionRepository.all()]);
  const ids = new Set(videos.map((video) => video.videoId));
  const database = await getDatabase();
  const orphan = sessions.filter((session) => !ids.has(session.videoId));
  await Promise.all(orphan.map((session) => database.delete("sessions", session.id)));
  await resetDataFingerprint();
  return orphan.length;
}

export async function generateAndStoreWeeklyReport() {
  const [videos, sessions, feedback] = await Promise.all([videoRepository.all(), sessionRepository.all(), feedbackRepository.all()]);
  return auxiliaryRepository.putReport(generateWeeklyReport(videos, sessions, new Date(), feedback));
}

export async function putCustomTopic(rule: CustomTopicRule) {
  return auxiliaryRepository.putCustomTopic(rule);
}

export async function putKeywordRules(rules: KeywordRules) {
  return auxiliaryRepository.putKeywordRules(rules);
}

export async function clearData() {
  const database = await getDatabase();
  const names = ["videos", "sessions", "feedback", "customTopics", "keywordRules", "weeklyReports", "diagnostics", "impressions"] as const;
  const transaction = database.transaction(names, "readwrite");
  await Promise.all(names.map((name) => transaction.objectStore(name).clear()));
  await transaction.done;
  await chrome.storage.local.remove(["watchlistItems", "watchlistArchive", "mediaLibrary", "mediaProviders", "mediaRecPool", "traktSeen", DATA_FINGERPRINT_KEY]);
}
