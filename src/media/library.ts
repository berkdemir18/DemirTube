// DemirTube · Perde kütüphanesi — saf fonksiyonlar
//
// Depolama ve ağ burada yok; service worker bu fonksiyonlara kütüphaneyi verir,
// yeni kütüphaneyi geri alır. Böylece "bölüm bitti mi", "sıradaki ne" gibi
// kararların hepsi testle sabitlenebiliyor.
import { normalizeTitle } from "./title-parser";
import type { MediaKind, MediaLibrary, MediaProgress, MediaProgressReport, MediaTitle, ParsedMediaTitle, TmdbSearchResult } from "./types";

/** Jenerik müziğini izlemeyen için: %92'yi geçen ya da sonuna 4 dakikadan az kalan bölüm bitmiş sayılır. */
export function isFinished(position: number, duration: number) {
  if (!(duration > 0)) return false;
  return position / duration >= 0.92 || duration - position <= 240;
}

/** Fragman, reklam ve kısa klipleri elemek için alt sınır. */
export const MIN_MEDIA_DURATION_SECONDS = 15 * 60;

export function rawKey(query: string) {
  return `raw:${normalizeTitle(query)}`;
}

export function tmdbKey(kind: "tv" | "movie", id: number) {
  return `tmdb:${kind}:${id}`;
}

export function progressId(titleKey: string, season: number, episode: number) {
  return `${titleKey}|${season}|${episode}`;
}

export function localDay(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function titleFromSearch(result: TmdbSearchResult, now: string, existing?: MediaTitle): MediaTitle {
  return {
    key: tmdbKey(result.kind, result.tmdbId),
    tmdbId: result.tmdbId,
    kind: result.kind,
    name: result.name,
    originalName: result.originalName,
    year: result.year,
    posterPath: result.posterPath,
    backdropPath: result.backdropPath,
    overview: result.overview,
    seasons: existing?.seasons,
    favorite: existing?.favorite ?? false,
    manualMatch: existing?.manualMatch,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
    lastWatchedAt: existing?.lastWatchedAt,
  };
}

/**
 * Bir ilerleme bildirimini kütüphaneye işler. `titleKey` çağıran tarafından
 * önceden çözülmüş olmalı (TMDB eşleşmesi ya da ham anahtar).
 */
export function applyProgress(
  library: MediaLibrary,
  report: MediaProgressReport,
  parsed: ParsedMediaTitle,
  title: MediaTitle,
): MediaLibrary {
  const now = report.reportedAt;
  const kind: MediaKind = title.kind !== "unknown" ? title.kind : parsed.kind;
  const season = kind === "movie" ? 0 : parsed.season ?? (parsed.episode ? 1 : 0);
  const episode = kind === "movie" ? 0 : parsed.episode ?? 0;
  const id = progressId(title.key, season, episode);
  const previous = library.progress[id];
  const delta = Math.max(0, Math.min(report.watchedDelta, 120));
  const position = Math.max(0, report.position);
  const next: MediaProgress = {
    id,
    titleKey: title.key,
    season,
    episode,
    position,
    duration: report.duration,
    watchedSeconds: (previous?.watchedSeconds ?? 0) + delta,
    // Bir kez bitmiş bölümü baştan açıp birkaç saniye bakmak "bitmedi"ye çevirmesin.
    completed: Boolean(previous?.completed) || isFinished(position, report.duration),
    site: report.site,
    lastUrl: report.pageUrl,
    rawTitle: report.platformTitle ? [report.platformTitle, report.platformSubtitle].filter(Boolean).join(" · ") : report.documentTitle,
    firstWatchedAt: previous?.firstWatchedAt ?? now,
    lastWatchedAt: now,
  };
  const day = localDay(now);
  const daily = { ...library.daily, [day]: { ...library.daily[day], [report.site]: (library.daily[day]?.[report.site] ?? 0) + delta } };
  return {
    ...library,
    titles: { ...library.titles, [title.key]: { ...title, kind, lastWatchedAt: now, updatedAt: now } },
    progress: { ...library.progress, [id]: next },
    daily,
  };
}

/** Yanlış eşleşmeyi düzeltir: eski anahtarın tüm ilerlemesini yeni başlığa taşır. */
export function rematchTitle(library: MediaLibrary, fromKey: string, target: MediaTitle, manual = true): MediaLibrary {
  if (fromKey === target.key) return { ...library, titles: { ...library.titles, [target.key]: { ...target, manualMatch: manual || target.manualMatch } } };
  const old = library.titles[fromKey];
  const titles = { ...library.titles };
  delete titles[fromKey];
  const existing = titles[target.key];
  titles[target.key] = {
    ...target,
    favorite: Boolean(existing?.favorite || old?.favorite || target.favorite),
    manualMatch: manual || existing?.manualMatch,
    addedAt: [existing?.addedAt, old?.addedAt, target.addedAt].filter(Boolean).sort()[0] ?? target.addedAt,
    lastWatchedAt: [existing?.lastWatchedAt, old?.lastWatchedAt].filter(Boolean).sort().at(-1),
  };
  const progress: Record<string, MediaProgress> = {};
  for (const item of Object.values(library.progress)) {
    if (item.titleKey !== fromKey) { progress[item.id] = item; continue; }
    const season = target.kind === "movie" ? 0 : item.season;
    const episode = target.kind === "movie" ? 0 : item.episode;
    const id = progressId(target.key, season, episode);
    const clash = progress[id] ?? library.progress[id];
    progress[id] = clash && clash.lastWatchedAt > item.lastWatchedAt
      ? { ...clash, watchedSeconds: clash.watchedSeconds + item.watchedSeconds }
      : { ...item, id, titleKey: target.key, season, episode, watchedSeconds: item.watchedSeconds + (clash?.watchedSeconds ?? 0) };
  }
  const resolved = Object.fromEntries(Object.entries(library.resolved).map(([query, key]) => [query, key === fromKey ? target.key : key]));
  return { ...library, titles, progress, resolved };
}

/** Yedekten birleştirme: her kayıtta en yeni sürüm kazanır, günlük süreler büyük olan alınır (iki kez sayılmasın). */
export function mergeLibraries(current: MediaLibrary, incoming: MediaLibrary): MediaLibrary {
  const newer = <T,>(a: T | undefined, b: T, stamp: (item: T) => string) => (!a || stamp(b) >= stamp(a) ? b : a);
  const titles = { ...current.titles };
  for (const title of Object.values(incoming.titles ?? {})) titles[title.key] = newer(titles[title.key], title, (item) => item.updatedAt);
  const progress = { ...current.progress };
  for (const item of Object.values(incoming.progress ?? {})) progress[item.id] = newer(progress[item.id], item, (entry) => entry.lastWatchedAt);
  const daily = { ...current.daily };
  for (const [day, sites] of Object.entries(incoming.daily ?? {})) {
    daily[day] = { ...daily[day] };
    for (const [site, seconds] of Object.entries(sites)) daily[day][site] = Math.max(daily[day][site] ?? 0, seconds);
  }
  return { version: 1, titles, progress, daily, resolved: { ...incoming.resolved, ...current.resolved } };
}

export function removeTitle(library: MediaLibrary, key: string): MediaLibrary {
  const titles = { ...library.titles };
  delete titles[key];
  const progress = Object.fromEntries(Object.entries(library.progress).filter(([, item]) => item.titleKey !== key));
  const resolved = Object.fromEntries(Object.entries(library.resolved).filter(([, value]) => value !== key));
  return { ...library, titles, progress, resolved };
}

export type NextUp =
  | { state: "resume"; season: number; episode: number; position: number; duration: number; percent: number }
  | { state: "next"; season: number; episode: number }
  | { state: "caught-up" }
  | { state: "finished-movie" };

/**
 * Sıradaki adımı hesaplar. Son izlenen bölüm yarımsa oradan devam; bitmişse bir
 * sonraki bölüm. Sezon sonu TMDB'den gelen bölüm sayısıyla anlaşılır; sayı
 * bilinmiyorsa aynı sezonda bir sonraki bölüm varsayılır.
 */
export function nextUp(title: MediaTitle, progress: MediaProgress[]): NextUp | undefined {
  const own = progress.filter((item) => item.titleKey === title.key);
  if (!own.length) return undefined;
  const last = own.toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))[0];
  if (!last.completed) {
    return { state: "resume", season: last.season, episode: last.episode, position: last.position, duration: last.duration, percent: last.duration > 0 ? Math.round((last.position / last.duration) * 100) : 0 };
  }
  if (title.kind === "movie" || (last.season === 0 && last.episode === 0)) return { state: "finished-movie" };
  const seasons = title.seasons?.filter((item) => item.season > 0).toSorted((a, b) => a.season - b.season);
  const current = seasons?.find((item) => item.season === last.season);
  if (current && last.episode >= current.episodeCount) {
    const following = seasons?.find((item) => item.season > last.season && item.episodeCount > 0);
    return following ? { state: "next", season: following.season, episode: 1 } : { state: "caught-up" };
  }
  return { state: "next", season: last.season, episode: last.episode + 1 };
}

export interface ContinueItem {
  title: MediaTitle;
  next: NextUp;
  last: MediaProgress;
}

/** "Devam et" rafı: yarım kalanlar ve sırada bölümü olan diziler, en son izlenen başta. */
export function continueWatching(library: MediaLibrary, limit = 12): ContinueItem[] {
  const progress = Object.values(library.progress);
  const items: ContinueItem[] = [];
  for (const title of Object.values(library.titles)) {
    const next = nextUp(title, progress);
    if (!next || next.state === "caught-up" || next.state === "finished-movie") continue;
    const last = progress.filter((item) => item.titleKey === title.key).toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))[0];
    items.push({ title, next, last });
  }
  return items.toSorted((a, b) => b.last.lastWatchedAt.localeCompare(a.last.lastWatchedAt)).slice(0, limit);
}

export interface MediaStats {
  weekSeconds: number;
  monthSeconds: number;
  episodesThisMonth: number;
  moviesThisMonth: number;
  sites: { site: string; seconds: number }[];
}

export function mediaStats(library: MediaLibrary, now = new Date()): MediaStats {
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now); monthStart.setHours(0, 0, 0, 0); monthStart.setDate(monthStart.getDate() - 29);
  const weekKey = localDay(weekStart.toISOString());
  const monthKey = localDay(monthStart.toISOString());
  let weekSeconds = 0, monthSeconds = 0;
  const bySite = new Map<string, number>();
  for (const [day, sites] of Object.entries(library.daily)) {
    for (const [site, seconds] of Object.entries(sites)) {
      if (day >= weekKey) weekSeconds += seconds;
      if (day >= monthKey) { monthSeconds += seconds; bySite.set(site, (bySite.get(site) ?? 0) + seconds); }
    }
  }
  const finishedThisMonth = Object.values(library.progress).filter((item) => item.completed && localDay(item.lastWatchedAt) >= monthKey);
  return {
    weekSeconds,
    monthSeconds,
    episodesThisMonth: finishedThisMonth.filter((item) => item.episode > 0).length,
    moviesThisMonth: finishedThisMonth.filter((item) => item.episode === 0).length,
    sites: [...bySite.entries()].map(([site, seconds]) => ({ site, seconds })).toSorted((a, b) => b.seconds - a.seconds),
  };
}

/** Platform alan adını okunur ada çevirir; tanınmayanlar olduğu gibi kalır. */
export function siteLabel(site: string) {
  const host = site.replace(/^www\./, "");
  const known: [RegExp, string][] = [
    [/netflix\./, "Netflix"], [/primevideo\.|amazon\./, "Prime Video"], [/(?:^|\.)max\.com$|hbomax\./, "HBO Max"],
    [/disneyplus\./, "Disney+"], [/tv\.apple\./, "Apple TV+"], [/mubi\./, "MUBI"], [/tabii\./, "tabii"],
    [/exxen\./, "Exxen"], [/gain\.tv/, "Gain"], [/tod\.tv|todtv\./, "TOD"], [/puhutv\./, "puhutv"], [/blutv\./, "BluTV"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host;
}
