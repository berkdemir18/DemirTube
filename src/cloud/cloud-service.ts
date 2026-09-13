// DemirTube · bulut yedekleme orkestrasyonu
//
// Sağlayıcıdan bağımsız kısım burada: yapılandırma/oturum saklama, oturum
// tazeleme, yerel ile uzak yedeğin birleştirilmesi, zamanlama ve durum.
// Supabase ve Firebase'e özgü istekler provider dosyalarındadır.
import type { AppData, CloudConfig, CloudProviderId, CloudStatus, LegacyAppData, VideoRecord } from "../shared/types";
import { checksumPayload, exportData, finalizeStaleSessions, importData } from "../storage/data-service";
import type { CloudAuth, CloudProvider } from "./provider";
import { firebaseProvider } from "./firebase-provider";
import { supabaseProvider } from "./supabase-provider";

const CONFIG_KEY = "cloudConfig";
const AUTH_KEY = "cloudAuth";
const META_KEY = "cloudMeta";

export const DEFAULT_CLOUD_PROVIDER: CloudProviderId = "firebase";

/** Arayüz, sağlayıcı seçilirken hangi origin iznini isteyeceğini buradan öğrenir. */
export function cloudHostPermissions(provider: CloudProviderId) {
  return (provider === "firebase" ? firebaseProvider : supabaseProvider).hostPermissions;
}

function providerFor(config: CloudConfig): CloudProvider<CloudConfig> {
  return config.provider === "firebase" ? firebaseProvider : supabaseProvider;
}

async function readStored<T>(key: string): Promise<T | undefined> {
  return (await chrome.storage.local.get(key))[key] as T | undefined;
}

async function writeStored(key: string, value: unknown) {
  await chrome.storage.local.set({ [key]: value });
}

/** Depoda sağlayıcıya göre farklı alanlar bulunur; okuma tarafı hepsini isteğe bağlı görür. */
type StoredCloudConfig = {
  provider?: CloudProviderId;
  supabaseUrl?: string;
  anonKey?: string;
  apiKey?: string;
  databaseUrl?: string;
  autoSync?: boolean;
};

/** Sağlayıcı alanı eklenmeden önce kaydedilmiş yapılandırmalar Supabase'tir. */
function normalizeConfig(stored: StoredCloudConfig | undefined): CloudConfig | undefined {
  if (!stored) return undefined;
  if (stored.provider === "firebase") {
    return { provider: "firebase", apiKey: stored.apiKey ?? "", databaseUrl: stored.databaseUrl ?? "", autoSync: stored.autoSync ?? true };
  }
  if (!stored.supabaseUrl) return undefined;
  return { provider: "supabase", supabaseUrl: stored.supabaseUrl, anonKey: stored.anonKey ?? "", autoSync: stored.autoSync ?? true };
}

async function getConfig() {
  return normalizeConfig(await readStored<StoredCloudConfig>(CONFIG_KEY));
}

async function getAuth() {
  return readStored<CloudAuth>(AUTH_KEY);
}

async function ensureAuth(config: CloudConfig) {
  const auth = await getAuth();
  if (!auth) throw new Error("Önce bulut hesabına giriş yap.");
  if (auth.expiresAt > Date.now() + 60_000) return auth;
  const refreshed = await providerFor(config).refresh(config, auth);
  await writeStored(AUTH_KEY, refreshed);
  return refreshed;
}

/** Bulut yedekleme hiç kurulmadıysa periyodik senkron denemesi anlamsızdır; çağıran taraf bunu sorar. */
export async function isCloudConfigured() {
  return Boolean(await getConfig());
}

export async function configureCloud(config: CloudConfig) {
  const validated = providerFor(config).validateConfig(config);
  await writeStored(CONFIG_KEY, validated);
  return getCloudStatus();
}

async function requireConfig() {
  const config = await getConfig();
  if (!config) throw new Error("Önce bulut proje bilgilerini kaydet.");
  return config;
}

export async function signInCloud(email: string, password: string) {
  const config = await requireConfig();
  const auth = await providerFor(config).signIn(config, email.trim(), password);
  await writeStored(AUTH_KEY, auth);
  await syncCloudData();
  return getCloudStatus();
}

export async function signUpCloud(email: string, password: string) {
  const config = await requireConfig();
  const auth = await providerFor(config).signUp(config, email.trim(), password);
  if (auth) {
    await writeStored(AUTH_KEY, auth);
    await syncCloudData();
    return { ...(await getCloudStatus()), message: "Hesap oluşturuldu ve senkronizasyon başladı." };
  }
  return { ...(await getCloudStatus()), message: "Hesap oluşturuldu. E-postadaki doğrulama bağlantısından sonra giriş yap." };
}

export async function signOutCloud() {
  await chrome.storage.local.remove(AUTH_KEY);
  return getCloudStatus();
}

export async function resetCloud() {
  await chrome.storage.local.remove([CONFIG_KEY, AUTH_KEY, META_KEY]);
  return getCloudStatus();
}

function mergeData(local: AppData, remote?: AppData | LegacyAppData): AppData {
  if (!remote) return local;
  const sessions = new Map(remote.sessions.map((session) => [session.id, session]));
  for (const session of local.sessions) {
    const previous = sessions.get(session.id);
    const previousTime = previous?.updatedAt ?? previous?.endedAt ?? previous?.startedAt ?? "";
    const nextTime = session.updatedAt ?? session.endedAt ?? session.startedAt;
    if (!previous || nextTime >= previousTime) sessions.set(session.id, session);
  }
  const videos = new Map<string, VideoRecord>(remote.videos.map((video) => [video.videoId, {
    totalActiveWatchSeconds: video.totalWatchSeconds,
    uniqueWatchedSeconds: Math.min(video.totalWatchSeconds, video.durationSeconds),
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    engagementScore: 0,
    contentType: "unknown",
    ...video
  } as VideoRecord]));
  for (const video of local.videos) {
    const previous = videos.get(video.videoId);
    if (!previous || video.lastSeenAt >= previous.lastSeenAt) videos.set(video.videoId, video);
  }
  const feedback = new Map((remote.version === 2 ? remote.feedback : []).map((item) => [item.videoId, item]));
  for (const item of local.feedback) {
    const previous = feedback.get(item.videoId);
    if (!previous || item.updatedAt >= previous.updatedAt) feedback.set(item.videoId, item);
  }
  const customTopics = new Map((remote.version === 2 ? remote.customTopics : []).map((item) => [item.id, item]));
  for (const item of local.customTopics) {
    const previous = customTopics.get(item.id);
    if (!previous || item.updatedAt >= previous.updatedAt) customTopics.set(item.id, item);
  }
  const reports = new Map((remote.version === 2 ? remote.weeklyReports : []).map((item) => [item.id, item]));
  for (const item of local.weeklyReports) reports.set(item.id, item);
  const mergedVideos = [...videos.values()];
  const mergedSessions = [...sessions.values()];
  const mergedFeedback = [...feedback.values()];
  const mergedTopics = [...customTopics.values()];
  const base = {
    version: 2 as const,
    schemaVersion: 2 as const,
    appVersion: local.appVersion,
    exportedAt: new Date().toISOString(),
    counts: {
      videos: mergedVideos.length,
      sessions: mergedSessions.length,
      feedback: mergedFeedback.length,
      customTopics: mergedTopics.length
    },
    videos: mergedVideos,
    sessions: mergedSessions,
    feedback: mergedFeedback,
    customTopics: mergedTopics,
    keywordRules: remote.version === 2 && local.keywordRules.updatedAt < remote.keywordRules.updatedAt ? remote.keywordRules : local.keywordRules,
    weeklyReports: [...reports.values()],
    diagnostics: [...(remote.version === 2 ? remote.diagnostics : []), ...local.diagnostics].slice(-100),
    settings: local.settings,
    watchlist: mergeLists(local.watchlist ?? [], remote.version === 2 ? remote.watchlist ?? [] : [], item => item.updatedAt ?? item.addedAt),
    watchlistArchive: mergeLists(local.watchlistArchive ?? [], remote.version === 2 ? remote.watchlistArchive ?? [] : [], item => item.removedAt)
  };
  return { ...base, checksum: checksumPayload(base) };
}

function mergeLists<T extends { videoId: string }>(local: T[], remote: T[], timestamp: (item: T) => string): T[] {
  const merged = new Map(remote.map(item => [item.videoId, item]));
  for (const item of local) { const previous = merged.get(item.videoId); if (!previous || timestamp(item) >= timestamp(previous)) merged.set(item.videoId, item); }
  return [...merged.values()];
}

export async function syncCloudData() {
  const config = await requireConfig();
  const provider = providerFor(config);
  const auth = await ensureAuth(config);
  try {
    const [local, remote] = await Promise.all([exportData(), provider.readBackup(config, auth)]);
    const merged = mergeData(local, remote);
    await importData(merged);
    await finalizeStaleSessions();
    await provider.writeBackup(config, auth, await exportData());
    await writeStored(META_KEY, { lastSyncedAt: new Date().toISOString(), lastError: undefined });
    return getCloudStatus();
  } catch (error) {
    await writeStored(META_KEY, { ...(await readStored<Record<string, unknown>>(META_KEY)), lastError: error instanceof Error ? error.message : "Senkronizasyon hatası" });
    throw error;
  }
}

export async function getCloudStatus(): Promise<CloudStatus> {
  const [config, auth, meta] = await Promise.all([
    getConfig(),
    getAuth(),
    readStored<{ lastSyncedAt?: string; lastError?: string }>(META_KEY)
  ]);
  return {
    configured: Boolean(config),
    provider: config?.provider ?? DEFAULT_CLOUD_PROVIDER,
    signedIn: Boolean(auth),
    email: auth?.email,
    autoSync: config?.autoSync ?? true,
    lastSyncedAt: meta?.lastSyncedAt,
    lastError: meta?.lastError
  };
}

export async function scheduleCloudSync() {
  const [config, auth] = await Promise.all([getConfig(), getAuth()]);
  if (!config?.autoSync || !auth) return;
  await chrome.alarms.create("demirtube-cloud-sync-soon", { delayInMinutes: 0.5 });
}
