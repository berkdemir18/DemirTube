// DemirTube · Perde analizleri
//
// Her fonksiyon kütüphaneyi alır, ekranda tek bir cümleye dönüşecek bir sonuç
// verir. Kural: yeterli kanıt yoksa sonuç üretme (undefined) — üç oturumdan
// "gece kuşusun" demek analiz değil, falcılık.
import { isFinished, localDay, nextUp, siteLabel } from "./library";
import { percentWith } from "./turkish";
import type { MediaLibrary, MediaSession, MediaTitle } from "./types";

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Oturumun saniyelerini başladığı ve bittiği saatlere orantılı dağıtır. */
function spreadByHour(session: MediaSession, bins: number[]) {
  const start = new Date(session.startedAt).getTime();
  const end = Math.max(start + 1, new Date(session.endedAt).getTime());
  const span = end - start;
  let cursor = start;
  while (cursor < end) {
    const date = new Date(cursor);
    const hourEnd = new Date(date); hourEnd.setMinutes(60, 0, 0);
    const sliceEnd = Math.min(end, hourEnd.getTime());
    bins[date.getHours()] += session.seconds * ((sliceEnd - cursor) / span);
    cursor = sliceEnd;
  }
}

export interface WeekSummary {
  seconds: number;
  previousSeconds: number;
  /** Son 8 haftanın toplamları, en eski başta. */
  weeks: { start: string; seconds: number }[];
  youtubeSeconds?: number;
}

/** Son 7 gün, önceki 7 gün ve 8 haftalık seyir. */
export function weekSummary(library: MediaLibrary, now = new Date(), youtubeSeconds?: number): WeekSummary {
  const today = startOfDay(now).getTime();
  const weeks = Array.from({ length: 8 }, (_, index) => ({ start: localDay(new Date(today - (7 * (7 - index) + 6) * DAY_MS).toISOString()), seconds: 0 }));
  for (const [day, sites] of Object.entries(library.daily)) {
    const dayTime = startOfDay(new Date(`${day}T12:00:00`)).getTime();
    const age = Math.round((today - dayTime) / DAY_MS);
    if (age < 0 || age >= 56) continue;
    const bucket = 7 - Math.floor(age / 7);
    weeks[bucket].seconds += Object.values(sites).reduce((sum, value) => sum + value, 0);
  }
  return { seconds: weeks[7].seconds, previousSeconds: weeks[6].seconds, weeks, youtubeSeconds };
}

export interface ClockInsight {
  hours: number[];
  weekdays: number[];
  peakHour: number;
  lateNightShare: number;
  weekendShare: number;
  totalSeconds: number;
}

/** Günün saati ve haftanın günü. En az 3 saatlik kayıt ister. */
export function clockInsight(library: MediaLibrary, days = 60, now = new Date()): ClockInsight | undefined {
  const since = now.getTime() - days * DAY_MS;
  const sessions = (library.sessions ?? []).filter((session) => new Date(session.startedAt).getTime() >= since);
  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  for (const session of sessions) {
    spreadByHour(session, hours);
    // Pazartesi = 0
    weekdays[(new Date(session.startedAt).getDay() + 6) % 7] += session.seconds;
  }
  const totalSeconds = hours.reduce((sum, value) => sum + value, 0);
  if (totalSeconds < 3 * 3600) return undefined;
  const lateNight = hours.slice(0, 5).reduce((sum, value) => sum + value, 0);
  return {
    hours,
    weekdays,
    peakHour: hours.indexOf(Math.max(...hours)),
    lateNightShare: lateNight / totalSeconds,
    weekendShare: (weekdays[5] + weekdays[6]) / totalSeconds,
    totalSeconds,
  };
}

export interface Binge {
  titleKey: string;
  episodes: number;
  seconds: number;
  startedAt: string;
  endedAt: string;
}

export interface BingeInsight {
  longest: Binge;
  /** 3+ bölümlük maratonların sayısı. */
  count: number;
  /** Dizilerde bir oturuşta ortalama kaç bölüm. */
  episodesPerSitting: number;
}

/** Aynı dizinin bölümleri arasında bu kadar ara yoksa aynı oturuş sayılır. */
export const SITTING_GAP_MS = 45 * 60 * 1000;

/** Art arda bölüm maratonları. Oturuş = aynı dizi, aralar 45 dakikadan kısa. */
export function bingeInsight(library: MediaLibrary): BingeInsight | undefined {
  const byTitle = new Map<string, MediaSession[]>();
  for (const session of library.sessions ?? []) {
    if (session.episode === 0 || session.seconds < 120) continue;
    byTitle.set(session.titleKey, [...(byTitle.get(session.titleKey) ?? []), session]);
  }
  const sittings: Binge[] = [];
  for (const [titleKey, sessions] of byTitle) {
    const ordered = sessions.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt));
    let current: { episodes: Set<string>; seconds: number; startedAt: string; endedAt: string } | undefined;
    for (const session of ordered) {
      const gap = current ? new Date(session.startedAt).getTime() - new Date(current.endedAt).getTime() : Infinity;
      if (!current || gap > SITTING_GAP_MS) {
        if (current) sittings.push({ titleKey, episodes: current.episodes.size, seconds: current.seconds, startedAt: current.startedAt, endedAt: current.endedAt });
        current = { episodes: new Set(), seconds: 0, startedAt: session.startedAt, endedAt: session.endedAt };
      }
      current.episodes.add(`${session.season}|${session.episode}`);
      current.seconds += session.seconds;
      if (session.endedAt > current.endedAt) current.endedAt = session.endedAt;
    }
    if (current) sittings.push({ titleKey, episodes: current.episodes.size, seconds: current.seconds, startedAt: current.startedAt, endedAt: current.endedAt });
  }
  if (sittings.length < 3) return undefined;
  const binges = sittings.filter((sitting) => sitting.episodes >= 3);
  const longest = sittings.toSorted((a, b) => b.episodes - a.episodes || b.seconds - a.seconds)[0];
  return {
    longest,
    count: binges.length,
    episodesPerSitting: sittings.reduce((sum, sitting) => sum + sitting.episodes, 0) / sittings.length,
  };
}

export interface ShowPace {
  title: MediaTitle;
  finishedEpisodes: number;
  totalEpisodes?: number;
  remainingEpisodes?: number;
  /** Son 21 günde bitirilen bölüm / gün. */
  episodesPerDay: number;
  /** Bu hızla kalanların kaç günde biteceği. */
  etaDays?: number;
  percent?: number;
}

/** Aktif dizilerin temposu ve bitiş tahmini. */
export function showPaces(library: MediaLibrary, now = new Date()): ShowPace[] {
  const since = now.getTime() - 21 * DAY_MS;
  const progress = Object.values(library.progress);
  const result: ShowPace[] = [];
  for (const title of Object.values(library.titles)) {
    if (title.kind !== "tv") continue;
    const own = progress.filter((item) => item.titleKey === title.key && item.episode > 0);
    const finished = own.filter((item) => item.completed);
    const recent = finished.filter((item) => new Date(item.lastWatchedAt).getTime() >= since);
    if (!recent.length) continue;
    const next = nextUp(title, own);
    if (next?.state === "caught-up") continue;
    const seasons = title.seasons?.filter((season) => season.season > 0);
    const totalEpisodes = seasons?.length ? seasons.reduce((sum, season) => sum + season.episodeCount, 0) : undefined;
    // Kalan: en son izlenen konumdan sonraki bölümler (atlanan eski bölümler sayılmaz).
    const last = own.toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))[0];
    let remainingEpisodes: number | undefined;
    if (seasons?.length && last) {
      remainingEpisodes = seasons.reduce((sum, season) => {
        if (season.season < last.season) return sum;
        if (season.season === last.season) return sum + Math.max(0, season.episodeCount - last.episode + (last.completed ? 0 : 1));
        return sum + season.episodeCount;
      }, 0);
    }
    const firstRecent = Math.min(...recent.map((item) => new Date(item.lastWatchedAt).getTime()));
    const spanDays = Math.max(7, (now.getTime() - firstRecent) / DAY_MS);
    const episodesPerDay = recent.length / spanDays;
    result.push({
      title,
      finishedEpisodes: finished.length,
      totalEpisodes,
      remainingEpisodes,
      episodesPerDay,
      etaDays: remainingEpisodes !== undefined && episodesPerDay > 0 ? Math.ceil(remainingEpisodes / episodesPerDay) : undefined,
      percent: totalEpisodes && remainingEpisodes !== undefined ? Math.round(((totalEpisodes - remainingEpisodes) / totalEpisodes) * 100) : undefined,
    });
  }
  return result.toSorted((a, b) => b.episodesPerDay - a.episodesPerDay).slice(0, 6);
}

export interface StalledTitle {
  title: MediaTitle;
  daysIdle: number;
  label: string;
  watchedSeconds: number;
}

/** 14 günden uzun süredir dokunulmamış yarım diziler ve filmler. */
export function stalledTitles(library: MediaLibrary, now = new Date(), minIdleDays = 14): StalledTitle[] {
  const progress = Object.values(library.progress);
  const result: StalledTitle[] = [];
  for (const title of Object.values(library.titles)) {
    const own = progress.filter((item) => item.titleKey === title.key);
    const next = nextUp(title, own);
    if (!next || next.state === "caught-up" || next.state === "finished-movie") continue;
    const last = own.toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))[0];
    const daysIdle = Math.floor((now.getTime() - new Date(last.lastWatchedAt).getTime()) / DAY_MS);
    if (daysIdle < minIdleDays) continue;
    const label = next.state === "resume"
      ? (next.episode === 0 ? `${percentWith(next.percent, "possessive-locative")} bıraktın` : `${next.season}. sezon ${next.episode}. bölümün ${percentWith(next.percent, "possessive-locative")} bıraktın`)
      : `Sırada ${next.season}. sezon ${next.episode}. bölüm vardı`;
    result.push({ title, daysIdle, label, watchedSeconds: own.reduce((sum, item) => sum + item.watchedSeconds, 0) });
  }
  return result.toSorted((a, b) => b.watchedSeconds - a.watchedSeconds).slice(0, 8);
}

export interface Share {
  label: string;
  seconds: number;
  share: number;
}

/** İzleme süresine göre tür dağılımı. Birden fazla türü olan yapımın süresi türlerine eşit bölünür. */
export function genreShares(library: MediaLibrary, limit = 6): Share[] | undefined {
  const secondsByTitle = new Map<string, number>();
  for (const item of Object.values(library.progress)) secondsByTitle.set(item.titleKey, (secondsByTitle.get(item.titleKey) ?? 0) + item.watchedSeconds);
  const totals = new Map<string, number>();
  let covered = 0;
  for (const [key, seconds] of secondsByTitle) {
    const genres = library.titles[key]?.genres;
    if (!genres?.length) continue;
    covered += seconds;
    for (const genre of genres) totals.set(genre, (totals.get(genre) ?? 0) + seconds / genres.length);
  }
  if (covered < 3600) return undefined;
  const sorted = [...totals.entries()].toSorted((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, limit).map(([label, seconds]) => ({ label, seconds, share: seconds / covered }));
  const rest = sorted.slice(limit).reduce((sum, [, seconds]) => sum + seconds, 0);
  return rest > 0 ? [...head, { label: "Diğer", seconds: rest, share: rest / covered }] : head;
}

/** Son 30 günde süre dağılımı: tanınan platformlar ayrı, geri kalan siteler tek tek. */
export function siteShares(library: MediaLibrary, now = new Date(), days = 30): Share[] {
  const since = localDay(new Date(startOfDay(now).getTime() - (days - 1) * DAY_MS).toISOString());
  const totals = new Map<string, number>();
  for (const [day, sites] of Object.entries(library.daily)) {
    if (day < since) continue;
    for (const [site, seconds] of Object.entries(sites)) totals.set(siteLabel(site), (totals.get(siteLabel(site)) ?? 0) + seconds);
  }
  const all = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()].map(([label, seconds]) => ({ label, seconds, share: all ? seconds / all : 0 })).toSorted((a, b) => b.seconds - a.seconds);
}

export interface FinishInsight {
  moviesStarted: number;
  moviesFinished: number;
  /** Başlanıp 7 günden uzun süredir bitirilmemiş film sayısı. */
  moviesAbandoned: number;
  averageStopPercent?: number;
  episodesFinished: number;
}

export function finishInsight(library: MediaLibrary, now = new Date()): FinishInsight {
  const movies = Object.values(library.progress).filter((item) => item.episode === 0 && item.season === 0);
  const abandoned = movies.filter((item) => !item.completed && now.getTime() - new Date(item.lastWatchedAt).getTime() > 7 * DAY_MS);
  return {
    moviesStarted: movies.length,
    moviesFinished: movies.filter((item) => item.completed).length,
    moviesAbandoned: abandoned.length,
    averageStopPercent: abandoned.length ? Math.round(abandoned.reduce((sum, item) => sum + (item.duration ? item.position / item.duration : 0), 0) / abandoned.length * 100) : undefined,
    episodesFinished: Object.values(library.progress).filter((item) => item.episode > 0 && item.completed).length,
  };
}

export interface TasteGap {
  title: MediaTitle;
  voteAverage: number;
  finishedShare: number;
}

/** TMDB'de yüksek puanlı ama senin yarıda bıraktığın yapımlar: "herkes sevdi, sen tutunamadın". */
export function tasteGaps(library: MediaLibrary, now = new Date()): TasteGap[] {
  return stalledTitles(library, now, 10)
    .filter((item) => (item.title.voteAverage ?? 0) >= 7.8)
    .map((item) => {
      const own = Object.values(library.progress).filter((entry) => entry.titleKey === item.title.key);
      const finished = own.filter((entry) => entry.completed || isFinished(entry.position, entry.duration)).length;
      return { title: item.title, voteAverage: item.title.voteAverage!, finishedShare: own.length ? finished / own.length : 0 };
    })
    .slice(0, 4);
}

export interface TitleSummary {
  title: MediaTitle;
  watchedSeconds: number;
  finishedEpisodes: number;
  status: "watching" | "finished" | "stalled" | "planned";
  lastWatchedAt?: string;
  percent?: number;
}

/** Kütüphane görünümü için her başlığın özeti. */
export function titleSummaries(library: MediaLibrary, now = new Date()): TitleSummary[] {
  const progress = Object.values(library.progress);
  return Object.values(library.titles).map((title) => {
    const own = progress.filter((item) => item.titleKey === title.key);
    const next = nextUp(title, own);
    const lastWatchedAt = own.map((item) => item.lastWatchedAt).toSorted().at(-1);
    const idleDays = lastWatchedAt ? (now.getTime() - new Date(lastWatchedAt).getTime()) / DAY_MS : Infinity;
    const status: TitleSummary["status"] = !next ? "planned"
      : next.state === "caught-up" || next.state === "finished-movie" ? "finished"
      : idleDays >= 14 ? "stalled" : "watching";
    const seasons = title.seasons?.filter((season) => season.season > 0);
    const totalEpisodes = seasons?.reduce((sum, season) => sum + season.episodeCount, 0);
    const finishedEpisodes = own.filter((item) => item.completed && item.episode > 0).length;
    const percent = title.kind === "movie"
      ? (own[0] ? (own[0].completed ? 100 : Math.round((own[0].position / Math.max(1, own[0].duration)) * 100)) : undefined)
      : totalEpisodes ? Math.min(100, Math.round((finishedEpisodes / totalEpisodes) * 100)) : undefined;
    return { title, watchedSeconds: own.reduce((sum, item) => sum + item.watchedSeconds, 0), finishedEpisodes, status, lastWatchedAt, percent };
  });
}
