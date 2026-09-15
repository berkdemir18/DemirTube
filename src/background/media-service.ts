// DemirTube · Perde servisi (film ve dizi) (service worker tarafı)
//
// Birden fazla sekme/iframe aynı anda ilerleme yollayabilir. chrome.storage'da
// "oku → değiştir → yaz" yarışı son yazanın öncekini silmesine yol açar; bu
// yüzden kütüphaneye dokunan her işlem tek bir sıraya dizilir.
import { applyProgress, rawKey, rematchTitle, removeTitle, titleFromSearch } from "../media/library";
import { isGenericTitle, normalizeTitle, parseMediaTitle } from "../media/title-parser";
import { pickBestMatch, searchTitles, testApiKey, titleDetails, watchProviders } from "../media/tmdb";
import { emptyLibrary, type MediaLibrary, type MediaProgressReport, type MediaStatus, type MediaTitle, type ParsedMediaTitle, type TmdbSearchResult, type WatchProviders } from "../media/types";

const LIBRARY_KEY = "mediaLibrary";
const API_KEY = "tmdbApiKey";
const TRACKING_KEY = "mediaTrackingEnabled";
const PROVIDERS_KEY = "mediaProviders";
const PROVIDER_TTL_MS = 24 * 60 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export async function readLibrary(): Promise<MediaLibrary> {
  const stored = (await chrome.storage.local.get(LIBRARY_KEY))[LIBRARY_KEY] as MediaLibrary | undefined;
  return stored?.version === 1 ? { ...emptyLibrary(), ...stored } : emptyLibrary();
}

async function writeLibrary(library: MediaLibrary) {
  await chrome.storage.local.set({ [LIBRARY_KEY]: library });
  return library;
}

function update(change: (library: MediaLibrary) => Promise<MediaLibrary> | MediaLibrary) {
  return serialized(async () => writeLibrary(await change(await readLibrary())));
}

async function apiKey() {
  return ((await chrome.storage.local.get(API_KEY))[API_KEY] as string | undefined)?.trim() || undefined;
}

export async function getMediaStatus(): Promise<MediaStatus> {
  const stored = await chrome.storage.local.get([API_KEY, TRACKING_KEY]);
  return { hasApiKey: Boolean(stored[API_KEY]), trackingEnabled: stored[TRACKING_KEY] !== false };
}

export async function setMediaTracking(enabled: boolean) {
  await chrome.storage.local.set({ [TRACKING_KEY]: enabled });
  return getMediaStatus();
}

/** Anahtarı dener, kaydeder ve daha önce eşleşemeyen başlıkları yeniden eşleştirir. */
export async function setApiKey(value: string) {
  const key = value.trim();
  if (!key) {
    await chrome.storage.local.remove(API_KEY);
    return getMediaStatus();
  }
  await testApiKey(key);
  await chrome.storage.local.set({ [API_KEY]: key });
  await update(async (library) => {
    let next = library;
    for (const title of Object.values(library.titles)) {
      if (title.tmdbId || title.manualMatch) continue;
      const match = await findMatch(key, { query: title.name, kind: title.kind }).catch(() => undefined);
      if (match) next = rematchTitle(next, title.key, await enrich(key, titleFromSearch(match, new Date().toISOString(), next.titles[title.key])), false);
    }
    return next;
  });
  return getMediaStatus();
}

async function findMatch(key: string, parsed: ParsedMediaTitle) {
  return pickBestMatch(parsed, await searchTitles(key, parsed.query));
}

const DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function enrich(key: string, title: MediaTitle): Promise<MediaTitle> {
  if (!title.tmdbId || title.kind === "unknown") return title;
  // Devam eden dizide yeni bölüm yayınlanır; sezon sayıları haftada bir tazelenir.
  if (title.detailsFetchedAt && Date.now() - new Date(title.detailsFetchedAt).getTime() < DETAILS_TTL_MS) return title;
  const details = await titleDetails(key, title.kind, title.tmdbId).catch(() => undefined);
  if (!details) return title;
  return { ...title, ...details, seasons: details.seasons ?? title.seasons, detailsFetchedAt: new Date().toISOString() };
}

/** Tür/puan bilgisi olmayan başlıkları tamamlar (ilk sürümde eşleşenler, çevrimdışı eşleşenler). */
export async function backfillDetails(limit = 25) {
  const key = await apiKey();
  if (!key) return { updated: 0 };
  const pending = Object.values((await readLibrary()).titles).filter((title) => title.tmdbId && title.kind !== "unknown" && !title.detailsFetchedAt).slice(0, limit);
  if (!pending.length) return { updated: 0 };
  const enriched = await Promise.all(pending.map((title) => enrich(key, title)));
  await update((library) => {
    const titles = { ...library.titles };
    for (const title of enriched) if (titles[title.key]) titles[title.key] = { ...titles[title.key], ...title, favorite: titles[title.key].favorite };
    return { ...library, titles };
  });
  return { updated: enriched.filter((title) => title.detailsFetchedAt).length };
}

function resolvedKey(parsed: ParsedMediaTitle) {
  return `${normalizeTitle(parsed.query)}|${parsed.year ?? ""}`;
}

async function resolveTitle(library: MediaLibrary, parsed: ParsedMediaTitle, now: string): Promise<{ library: MediaLibrary; title: MediaTitle }> {
  const cacheKey = resolvedKey(parsed);
  const known = library.resolved[cacheKey];
  if (known && library.titles[known]) return { library, title: library.titles[known] };

  const key = await apiKey();
  // Anahtar yoksa tekrar tekrar sormayız; anahtar girildiğinde setApiKey ham başlıkları yeniden eşler.
  const match = key ? await findMatch(key, parsed).catch(() => undefined) : undefined;
  const title: MediaTitle = match && key
    ? await enrich(key, titleFromSearch(match, now, library.titles[`tmdb:${match.kind}:${match.tmdbId}`]))
    : library.titles[rawKey(parsed.query)] ?? { key: rawKey(parsed.query), kind: parsed.kind, name: parsed.query, year: parsed.year, favorite: false, addedAt: now, updatedAt: now };
  return { library: { ...library, resolved: { ...library.resolved, [cacheKey]: title.key } }, title };
}

type Sender = { tab?: { title?: string; url?: string }; frameId?: number };

export async function recordMediaProgress(report: MediaProgressReport, sender: Sender, trackingAllowed: boolean) {
  if (!trackingAllowed || !(await getMediaStatus()).trackingEnabled) return { ignored: "tracking-off" };
  if (!(report.duration > 0)) return { ignored: "no-duration" };

  // iframe'deki oynatıcı sayfa başlığını göremez; sekmenin kendisinden tamamla.
  const tabUrl = sender.tab?.url ?? "";
  let host = report.site;
  try { if (tabUrl) host = new URL(tabUrl).hostname; } catch { /* geçersiz URL: raporu kullan */ }
  if (/(^|\.)youtube\.com$/.test(host)) return { ignored: "youtube" };
  const full: MediaProgressReport = {
    ...report,
    documentTitle: report.documentTitle || sender.tab?.title || "",
    pageUrl: report.pageUrl || tabUrl,
    site: host.replace(/^www\./, ""),
  };
  const parsed = parseMediaTitle(full);
  if (!parsed || isGenericTitle(parsed.query, host)) return { ignored: "no-title" };

  const library = await update(async (current) => {
    const resolved = await resolveTitle(current, parsed, full.reportedAt);
    return applyProgress(resolved.library, full, parsed, resolved.title);
  });
  return { saved: true, titles: Object.keys(library.titles).length };
}

export async function searchMedia(query: string): Promise<TmdbSearchResult[]> {
  const key = await apiKey();
  if (!key) throw new Error("Önce TMDB anahtarını gir.");
  return searchTitles(key, query);
}

export function toggleFavorite(input: { titleKey?: string; result?: TmdbSearchResult }) {
  return update(async (library) => {
    const now = new Date().toISOString();
    if (input.titleKey) {
      const title = library.titles[input.titleKey];
      if (!title) throw new Error("Başlık bulunamadı.");
      return { ...library, titles: { ...library.titles, [title.key]: { ...title, favorite: !title.favorite, updatedAt: now } } };
    }
    if (!input.result) throw new Error("Eklenecek başlık yok.");
    const existing = library.titles[`tmdb:${input.result.kind}:${input.result.tmdbId}`];
    const key = await apiKey();
    let title = titleFromSearch(input.result, now, existing);
    title = { ...title, favorite: !existing?.favorite };
    if (key) title = await enrich(key, title);
    return { ...library, titles: { ...library.titles, [title.key]: title } };
  });
}

export function rematchMedia(fromKey: string, result: TmdbSearchResult) {
  return update(async (library) => {
    const key = await apiKey();
    let target = titleFromSearch(result, new Date().toISOString(), library.titles[`tmdb:${result.kind}:${result.tmdbId}`]);
    if (key) target = await enrich(key, target);
    return rematchTitle(library, fromKey, target, true);
  });
}

export function deleteMedia(titleKey: string) {
  return update((library) => removeTitle(library, titleKey));
}

/** Bir bölümü elle "izledim" / "izlemedim" diye işaretler. */
export function markEpisode(progressIdValue: string, completed: boolean) {
  return update((library) => {
    const item = library.progress[progressIdValue];
    if (!item) throw new Error("Kayıt bulunamadı.");
    return { ...library, progress: { ...library.progress, [item.id]: { ...item, completed, position: completed ? item.duration : 0 } } };
  });
}

export async function getProviders(kind: "tv" | "movie", tmdbId: number): Promise<WatchProviders> {
  const cacheId = `${kind}:${tmdbId}`;
  const cache = ((await chrome.storage.local.get(PROVIDERS_KEY))[PROVIDERS_KEY] ?? {}) as Record<string, WatchProviders>;
  const cached = cache[cacheId];
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < PROVIDER_TTL_MS) return cached;
  const key = await apiKey();
  if (!key) throw new Error("Önce TMDB anahtarını gir.");
  const fresh = await watchProviders(key, kind, tmdbId);
  // Önbellek sınırsız büyümesin: en yeni 200 kayıt.
  const entries = Object.entries({ ...cache, [cacheId]: fresh }).toSorted((a, b) => b[1].fetchedAt.localeCompare(a[1].fetchedAt)).slice(0, 200);
  await chrome.storage.local.set({ [PROVIDERS_KEY]: Object.fromEntries(entries) });
  return fresh;
}
