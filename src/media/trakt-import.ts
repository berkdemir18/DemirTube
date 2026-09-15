// DemirTube · Trakt verisini Perde kütüphanesine işleme (saf)
//
// Kurallar:
// - TMDB kimliği olmayan kayıt alınmaz; Perde her şeyi TMDB anahtarıyla tutuyor.
// - Aynı izleme hem Perde'nin kendi takibinde hem Trakt'ta varsa (aynı bölüm,
//   12 saat içinde) süre ikinci kez yazılmaz; yalnızca "bitti" işareti tamamlanır.
// - Tekrar senkron zararsızdır: Trakt geçmiş kimliği oturum kimliğine gömülür.
// - Kullanıcının Perde'de verdiği beğendim/beğenmedim, Trakt puanıyla ezilmez.
import { localDay, progressId } from "./library";
import type { TraktHistoryItem, TraktRatingItem, TraktWatchlistItem } from "./trakt";
import type { MediaLibrary, MediaProgress, MediaSession, MediaTitle } from "./types";

export const TRAKT_SITE = "trakt.tv";
const DEFAULT_EPISODE_MINUTES = 45;
const DEFAULT_MOVIE_MINUTES = 110;
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface TraktImportInput {
  history: TraktHistoryItem[];
  ratings: TraktRatingItem[];
  watchlist: TraktWatchlistItem[];
}

export interface TraktImportResult {
  library: MediaLibrary;
  seenIds: number[];
  plays: number;
  duplicates: number;
  alreadyImported: number;
  skippedNoTmdb: number;
  newTitles: number;
  ratings: number;
  watchlist: number;
}

export function traktKey(type: "movie" | "show", tmdb?: number | null) {
  return tmdb ? `tmdb:${type === "movie" ? "movie" : "tv"}:${tmdb}` : undefined;
}

/** İçe aktarmada TMDB ayrıntısı çekilecek başlık anahtarları (henüz kütüphanede olmayanlar). */
export function traktTitleKeys(input: TraktImportInput, library: MediaLibrary): { key: string; kind: "tv" | "movie"; tmdbId: number; name: string; year?: number }[] {
  const found = new Map<string, { key: string; kind: "tv" | "movie"; tmdbId: number; name: string; year?: number }>();
  const add = (type: "movie" | "show", media?: { title: string; year?: number | null; ids: { tmdb?: number | null } }) => {
    const key = traktKey(type, media?.ids.tmdb);
    if (!key || !media || library.titles[key] || found.has(key)) return;
    found.set(key, { key, kind: type === "movie" ? "movie" : "tv", tmdbId: media.ids.tmdb!, name: media.title, year: media.year ?? undefined });
  };
  for (const item of input.history) item.type === "movie" ? add("movie", item.movie) : add("show", item.show);
  for (const item of [...input.ratings, ...input.watchlist]) if (item.type === "movie" || item.type === "show") add(item.type, item.type === "movie" ? item.movie : item.show);
  return [...found.values()];
}

function traktUrl(item: TraktHistoryItem) {
  if (item.type === "movie") return item.movie?.ids.slug ? `https://trakt.tv/movies/${item.movie.ids.slug}` : "https://trakt.tv";
  const slug = item.show?.ids.slug;
  return slug && item.episode ? `https://trakt.tv/shows/${slug}/seasons/${item.episode.season}/episodes/${item.episode.number}` : "https://trakt.tv";
}

/**
 * @param details İçe aktarmadan önce TMDB'den çekilmiş başlıklar (poster, tür, süre).
 *   Olmayanlar Trakt'taki ad ve yılla, varsayılan süreyle oluşturulur.
 */
export function applyTraktImport(library: MediaLibrary, input: TraktImportInput, details: Record<string, MediaTitle> = {}, now = new Date(), seen: ReadonlySet<number> = new Set()): TraktImportResult {
  const nowIso = now.toISOString();
  const titles = { ...library.titles };
  const progress = { ...library.progress };
  const daily = { ...library.daily };
  const sessions = (library.sessions ?? []).slice();
  const sessionIds = new Set(sessions.map((session) => session.id));
  // Oturum kaydı 4000'de budanır; budanmış eski Trakt izlemeleri yeniden gelirse süre iki kez yazılmasın.
  const seenIds = new Set(seen);
  let plays = 0, duplicates = 0, alreadyImported = 0, skippedNoTmdb = 0, newTitles = 0, ratingCount = 0, watchlistCount = 0;

  const ensureTitle = (type: "movie" | "show", media: { title: string; year?: number | null; ids: { tmdb?: number | null } }, at: string): MediaTitle | undefined => {
    const key = traktKey(type, media.ids.tmdb);
    if (!key) return undefined;
    if (!titles[key]) {
      const base = details[key];
      titles[key] = base
        ? { ...base, favorite: base.favorite ?? false, addedAt: at, updatedAt: nowIso }
        : { key, tmdbId: media.ids.tmdb!, kind: type === "movie" ? "movie" : "tv", name: media.title, year: media.year ?? undefined, favorite: false, addedAt: at, updatedAt: nowIso };
      newTitles += 1;
    }
    return titles[key];
  };

  // Eskiden yeniye: ilk/son izleme tarihleri doğru dolsun.
  const ordered = input.history.toSorted((a, b) => a.watched_at.localeCompare(b.watched_at));
  for (const item of ordered) {
    const type = item.type === "movie" ? "movie" : "show";
    const media = item.type === "movie" ? item.movie : item.show;
    if (!media || (item.type === "episode" && !item.episode)) continue;
    const title = ensureTitle(type, media, item.watched_at);
    if (!title) { skippedNoTmdb += 1; continue; }

    const sessionId = `trakt:${item.id}`;
    if (sessionIds.has(sessionId) || seenIds.has(item.id)) { alreadyImported += 1; continue; }
    seenIds.add(item.id);

    const season = item.type === "movie" ? 0 : item.episode!.season;
    const episode = item.type === "movie" ? 0 : item.episode!.number;
    const minutes = item.type === "movie"
      ? item.movie?.runtime || title.runtimeMinutes || DEFAULT_MOVIE_MINUTES
      : item.episode?.runtime || title.runtimeMinutes || DEFAULT_EPISODE_MINUTES;
    const seconds = minutes * 60;
    const endedAt = item.watched_at;
    const endMs = new Date(endedAt).getTime();

    const duplicate = sessions.some((session) => !session.id.startsWith("trakt:") && session.titleKey === title.key && session.season === season && session.episode === episode
      && Math.abs(new Date(session.endedAt).getTime() - endMs) <= DUPLICATE_WINDOW_MS);

    const id = progressId(title.key, season, episode);
    const previous: MediaProgress | undefined = progress[id];
    progress[id] = {
      id, titleKey: title.key, season, episode,
      position: previous?.duration || seconds,
      duration: previous?.duration || seconds,
      watchedSeconds: (previous?.watchedSeconds ?? 0) + (duplicate ? 0 : seconds),
      completed: true,
      site: previous && previous.lastWatchedAt > endedAt ? previous.site : duplicate ? previous?.site ?? TRAKT_SITE : TRAKT_SITE,
      lastUrl: previous && previous.lastWatchedAt > endedAt ? previous.lastUrl : duplicate ? previous?.lastUrl ?? traktUrl(item) : traktUrl(item),
      rawTitle: item.type === "movie" ? media.title : `${media.title} S${season}E${episode}`,
      firstWatchedAt: previous && previous.firstWatchedAt < endedAt ? previous.firstWatchedAt : endedAt,
      lastWatchedAt: previous && previous.lastWatchedAt > endedAt ? previous.lastWatchedAt : endedAt,
    };
    if (!titles[title.key].lastWatchedAt || titles[title.key].lastWatchedAt! < endedAt) titles[title.key] = { ...titles[title.key], lastWatchedAt: endedAt };

    if (duplicate) { duplicates += 1; continue; }
    const session: MediaSession = { id: sessionId, titleKey: title.key, season, episode, site: TRAKT_SITE, startedAt: new Date(endMs - seconds * 1000).toISOString(), endedAt, seconds };
    sessions.push(session);
    sessionIds.add(sessionId);
    const day = localDay(endedAt);
    daily[day] = { ...daily[day], [TRAKT_SITE]: (daily[day]?.[TRAKT_SITE] ?? 0) + seconds };
    plays += 1;
  }

  for (const item of input.ratings) {
    if (item.type !== "movie" && item.type !== "show") continue;
    const media = item.type === "movie" ? item.movie : item.show;
    if (!media) continue;
    const title = ensureTitle(item.type, media, item.rated_at);
    if (!title || title.userRating) continue;
    const rating = item.rating >= 7 ? "liked" : item.rating <= 4 ? "disliked" : undefined;
    if (!rating) continue;
    titles[title.key] = { ...titles[title.key], userRating: rating, updatedAt: nowIso };
    ratingCount += 1;
  }

  for (const item of input.watchlist) {
    if (item.type !== "movie" && item.type !== "show") continue;
    const media = item.type === "movie" ? item.movie : item.show;
    if (!media) continue;
    const title = ensureTitle(item.type, media, item.listed_at);
    if (!title || title.favorite) continue;
    titles[title.key] = { ...titles[title.key], favorite: true, updatedAt: nowIso };
    watchlistCount += 1;
  }

  const sortedSessions = sessions.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-4000);
  return {
    library: { ...library, titles, progress, daily, sessions: sortedSessions },
    seenIds: [...seenIds],
    plays, duplicates, alreadyImported, skippedNoTmdb, newTitles, ratings: ratingCount, watchlist: watchlistCount,
  };
}
