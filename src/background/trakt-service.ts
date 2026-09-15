// DemirTube · Trakt bağlantısı (service worker tarafı)
//
// Ağ işleri (geçmiş sayfaları, TMDB ayrıntıları) kütüphane kilidinin dışında
// yapılır; kilit yalnızca hesaplanmış sonucu yazarken tutulur. Böylece büyük
// bir içe aktarma sürerken açık sekmelerden gelen izleme bildirimleri beklemez.
import { titleDetails } from "../media/tmdb";
import { ensureFreshAuth, fetchHistory, fetchRatings, fetchUsername, fetchWatchlist, pollDeviceToken, requestDeviceCode, type DeviceCode, type TraktAuth } from "../media/trakt";
import { applyTraktImport, traktTitleKeys, type TraktImportInput } from "../media/trakt-import";
import type { MediaTitle } from "../media/types";
import { readLibrary, updateLibrary } from "./media-service";

const AUTH_KEY = "traktAuth";
const SEEN_KEY = "traktSeen";
const DEVICE_KEY = "traktDevice";
const TMDB_KEY = "tmdbApiKey";
const EXPORT_KEY = "traktExportImport";
/** Otomatik senkron aralığı; Perde açıldığında bu süre geçtiyse arka planda çalışır. */
export const TRAKT_AUTO_SYNC_MS = 6 * 60 * 60 * 1000;

export interface TraktStatus {
  configured: boolean;
  connected: boolean;
  username?: string;
  lastSyncAt?: string;
  lastResult?: TraktSyncSummary;
  syncing: boolean;
  /** Dışa aktarım dosyasından son yükleme (VIP gerektirmeyen yol). */
  lastFileImport?: TraktSyncSummary;
}

export interface TraktSyncSummary {
  plays: number;
  duplicates: number;
  alreadyImported: number;
  skippedNoTmdb: number;
  newTitles: number;
  ratings: number;
  watchlist: number;
  historyItems: number;
  at: string;
}

let syncing: Promise<TraktSyncSummary> | undefined;

async function readAuth() {
  return (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY] as (TraktAuth & { lastResult?: TraktSyncSummary }) | undefined;
}

async function writeAuth(auth: TraktAuth & { lastResult?: TraktSyncSummary }) {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function traktStatus(): Promise<TraktStatus> {
  const auth = await readAuth();
  return {
    configured: Boolean(auth?.clientId && auth.clientSecret),
    connected: Boolean(auth?.accessToken),
    username: auth?.username,
    lastSyncAt: auth?.lastSyncAt,
    lastResult: auth?.lastResult,
    syncing: Boolean(syncing),
    lastFileImport: (await chrome.storage.local.get(EXPORT_KEY))[EXPORT_KEY] as TraktSyncSummary | undefined,
  };
}

export async function traktSaveApp(clientId: string, clientSecret: string) {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (id.length < 20 || secret.length < 20) throw new Error("Client ID ve Client Secret uzun karakter dizileri; eksik kopyalanmış olabilir.");
  const current = await readAuth();
  // Uygulama değiştiyse eski belirteçler geçersizdir.
  const sameApp = current?.clientId === id && current.clientSecret === secret;
  await writeAuth(sameApp ? current : { clientId: id, clientSecret: secret });
  return traktStatus();
}

export async function traktStartDevice(): Promise<DeviceCode> {
  const auth = await readAuth();
  if (!auth?.clientId) throw new Error("Önce Trakt uygulama bilgilerini gir.");
  const code = await requestDeviceCode(auth.clientId);
  await chrome.storage.session.set({ [DEVICE_KEY]: { ...code, requestedAt: Date.now() } });
  return code;
}

export async function traktPoll() {
  const auth = await readAuth();
  const device = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY] as (DeviceCode & { requestedAt: number }) | undefined;
  if (!auth || !device) return { state: "expired" as const };
  if (Date.now() - device.requestedAt > device.expires_in * 1000) return { state: "expired" as const };
  const result = await pollDeviceToken(auth, device.device_code);
  if (result.state !== "authorized") return { state: result.state };
  const username = await fetchUsername(result.auth).catch(() => undefined);
  await writeAuth({ ...result.auth, username });
  await chrome.storage.session.remove(DEVICE_KEY);
  return { state: "authorized" as const, username };
}

export async function traktDisconnect() {
  const auth = await readAuth();
  if (auth) await writeAuth({ clientId: auth.clientId, clientSecret: auth.clientSecret });
  await chrome.storage.local.remove(SEEN_KEY);
  return traktStatus();
}

async function enrichNewTitles(keys: ReturnType<typeof traktTitleKeys>, limit = 400): Promise<Record<string, MediaTitle>> {
  const apiKey = ((await chrome.storage.local.get(TMDB_KEY))[TMDB_KEY] as string | undefined)?.trim();
  if (!apiKey) return {};
  const result: Record<string, MediaTitle> = {};
  const queue = keys.slice(0, limit);
  const now = new Date().toISOString();
  // TMDB'yi boğmamak için aynı anda 4 istek.
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const fetched = await titleDetails(apiKey, entry.kind, entry.tmdbId).catch(() => undefined);
      if (!fetched) continue;
      const { identity, ...details } = fetched;
      result[entry.key] = {
        key: entry.key, tmdbId: entry.tmdbId, kind: entry.kind,
        ...identity, name: identity.name ?? entry.name, year: identity.year ?? entry.year,
        ...details, detailsFetchedAt: now, favorite: false, addedAt: now, updatedAt: now,
      };
    }
  }));
  return result;
}

/** API senkronu ve dosyadan yükleme için ortak yol: yeni başlıkları TMDB'den tamamla, kütüphaneye işle. */
async function importInput(input: TraktImportInput): Promise<TraktSyncSummary> {
  const details = await enrichNewTitles(traktTitleKeys(input, await readLibrary()));
  const seen = new Set<number>(((await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] as number[] | undefined) ?? []);
  let summary: TraktSyncSummary | undefined;
  let seenIds: number[] = [];
  await updateLibrary((library) => {
    const result = applyTraktImport(library, input, details, new Date(), seen);
    seenIds = result.seenIds;
    summary = { plays: result.plays, duplicates: result.duplicates, alreadyImported: result.alreadyImported, skippedNoTmdb: result.skippedNoTmdb, newTitles: result.newTitles, ratings: result.ratings, watchlist: result.watchlist, historyItems: input.history.length, at: new Date().toISOString() };
    return result.library;
  });
  await chrome.storage.local.set({ [SEEN_KEY]: seenIds });
  return summary!;
}

/** trakt.tv/settings/data'dan indirilen dışa aktarımı işler. VIP gerekmez. */
export function traktImportExport(input: TraktImportInput): Promise<TraktSyncSummary> {
  // Süren işe katılmak, bu dosyayı hiç işlemeden öncekinin sonucunu döndürürdü.
  if (syncing) return Promise.reject(new Error("Başka bir Trakt içe aktarması sürüyor; bitince tekrar dene."));
  syncing = (async () => {
    try {
      const summary = await importInput(input);
      await chrome.storage.local.set({ [EXPORT_KEY]: summary });
      return summary;
    } finally {
      syncing = undefined;
    }
  })();
  return syncing;
}

/** Trakt'tan geçmiş, puan ve izleme listesini çekip kütüphaneye işler. */
export function traktSync(full = false): Promise<TraktSyncSummary> {
  syncing ??= (async () => {
    try {
      const stored = await readAuth();
      if (!stored?.accessToken) throw new Error("Trakt bağlı değil.");
      const auth = await ensureFreshAuth(stored);
      if (auth !== stored) await writeAuth({ ...stored, ...auth });

      // Artımlı senkronda bir gün geriden başla: saat dilimi ve geç düşen izlemeler kaçmasın. Tekrarları kimlik ayıklar.
      const startAt = !full && stored.lastSyncAt ? new Date(new Date(stored.lastSyncAt).getTime() - 86_400_000).toISOString() : undefined;
      const [history, ratings, watchlist] = await Promise.all([fetchHistory(auth, startAt), fetchRatings(auth), fetchWatchlist(auth)]);
      const input = { history, ratings, watchlist };

      const summary = await importInput(input);
      const latest = (await readAuth()) ?? auth;
      await writeAuth({ ...latest, lastSyncAt: summary.at, lastResult: summary });
      return summary;
    } finally {
      syncing = undefined;
    }
  })();
  return syncing;
}
