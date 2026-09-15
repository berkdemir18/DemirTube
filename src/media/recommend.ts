// DemirTube · Perde öneri motoru
//
// Üç soru, üç sinyal:
//   1. Sevdiğin yapımlardan kaçı bunu öneriyor?  (TMDB öneri listeleri, sevgi ağırlıklı)
//   2. Türü senin zevkine ne kadar uyuyor?       (izleme davranışından çıkan tür profili)
//   3. Kendi başına sağlam mı?                   (oy sayısıyla düzeltilmiş TMDB puanı)
// "Sevgi" beyana değil davranışa bakar: bitirdiğin, art arda izlediğin artı;
// ilk bölümde bıraktığın eksi. Açıkça "beğendim/beğenmedim" dediğin her şeyi ezer.
// Her önerinin gerekçesi yazılır; kutu kapalı değil.
import { nextUp } from "./library";
import { percentWith } from "./turkish";
import type { MediaLibrary, MediaTitle, RecCandidate, RecPool } from "./types";

const DAY_MS = 86_400_000;

export interface Affinity {
  title: MediaTitle;
  /** -1 (sevmedi) … +1 (çok sevdi) */
  score: number;
  /** Bu puanın nereden geldiği, ekranda gösterilir. */
  basis: string;
}

/** Bir yapımı ne kadar sevdiğinin davranıştan tahmini. */
export function titleAffinity(library: MediaLibrary, title: MediaTitle, now = new Date()): Affinity {
  if (title.userRating === "liked") return { title, score: 1, basis: "beğendim dedin" };
  if (title.userRating === "disliked") return { title, score: -1, basis: "beğenmedim dedin" };

  const own = Object.values(library.progress).filter((item) => item.titleKey === title.key);
  if (!own.length) return { title, score: title.favorite ? 0.4 : 0, basis: title.favorite ? "listene ekledin" : "henüz izlemedin" };

  const last = own.toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))[0];
  const idleDays = (now.getTime() - new Date(last.lastWatchedAt).getTime()) / DAY_MS;
  // Eski zevk bugünkü öneriyi yarı yarıya etkiler; iki ayda bir yarılanır.
  const recency = 0.5 + 0.5 * Math.exp(-idleDays / 60);
  let score: number;
  let basis: string;

  if (title.kind === "movie" || (own.length === 1 && own[0].episode === 0)) {
    const movie = own[0];
    const share = movie.duration ? movie.position / movie.duration : 0;
    if (movie.completed) { score = 0.75; basis = "sonuna kadar izledin"; }
    else if (idleDays > 7 && share < 0.6) { score = -0.6; basis = `${percentWith(share * 100, "locative")} bıraktın`; }
    else { score = 0.25; basis = "izlemeye başladın"; }
  } else {
    const finished = own.filter((item) => item.completed).length;
    const started = own.length;
    const completion = finished / started;
    const depth = Math.min(1, Math.log2(1 + finished) / Math.log2(1 + 10));
    const next = nextUp(title, own);
    const caughtUp = next?.state === "caught-up";
    if (idleDays >= 14 && finished <= 1 && !caughtUp) { score = -0.55; basis = "ilk bölümlerde bıraktın"; }
    else {
      score = 0.25 + 0.45 * depth + 0.2 * completion + (caughtUp ? 0.15 : 0) - (idleDays >= 30 && !caughtUp ? 0.2 : 0);
      basis = caughtUp ? "hepsini bitirdin" : `${finished} bölüm bitirdin`;
    }
  }
  if (title.favorite) score += 0.1;
  return { title, score: Math.max(-1, Math.min(1, score * recency)), basis };
}

/** Öneri havuzunu kuracak tohumlar: sevdiğin, TMDB'de karşılığı olan yapımlar. */
export function recommendationSeeds(library: MediaLibrary, now = new Date()): Affinity[] {
  return Object.values(library.titles)
    .filter((title) => title.tmdbId && title.kind !== "unknown")
    .map((title) => titleAffinity(library, title, now))
    .filter((affinity) => affinity.score >= 0.3)
    .toSorted((a, b) => b.score - a.score);
}

export interface TasteProfile {
  genres: { name: string; weight: number }[];
  loved: Affinity[];
  disliked: Affinity[];
}

/** Tür profili: her türün, o türdeki yapımlara duyduğun sevginin ortalaması (-1…+1). */
export function tasteProfile(library: MediaLibrary, now = new Date()): TasteProfile {
  const affinities = Object.values(library.titles).map((title) => titleAffinity(library, title, now)).filter((item) => item.score !== 0);
  const sums = new Map<string, { total: number; weight: number }>();
  for (const affinity of affinities) {
    for (const genre of affinity.title.genres ?? []) {
      const entry = sums.get(genre) ?? { total: 0, weight: 0 };
      entry.total += affinity.score;
      entry.weight += 1;
      sums.set(genre, entry);
    }
  }
  for (const { genres } of Object.values(library.dismissed ?? {})) {
    for (const genre of genres) {
      const entry = sums.get(genre) ?? { total: 0, weight: 0 };
      entry.total -= 0.3;
      entry.weight += 1;
      sums.set(genre, entry);
    }
  }
  // Tek yapımdan gelen tür profili aşırı uç olmasın: her türe iki "nötr" gözlem eklenir.
  const genres = [...sums.entries()]
    .map(([name, { total, weight }]) => ({ name, weight: total / (weight + 2) }))
    .toSorted((a, b) => b.weight - a.weight);
  return {
    genres,
    loved: affinities.filter((item) => item.score >= 0.3).toSorted((a, b) => b.score - a.score),
    disliked: affinities.filter((item) => item.score <= -0.3).toSorted((a, b) => a.score - b.score),
  };
}

export interface Recommendation {
  candidate: RecCandidate;
  key: string;
  /** 0–100 uyum */
  score: number;
  genres: string[];
  becauseOf: MediaTitle[];
  reasons: string[];
  signals: { seeds: number; taste: number; quality: number };
}

/** Oy sayısıyla düzeltilmiş puan (az oylu 9,5'lar tavan yapmasın). */
export function bayesianRating(voteAverage = 0, voteCount = 0, prior = 6.6, weight = 250) {
  return (voteAverage * voteCount + prior * weight) / (voteCount + weight);
}

export function scoreRecommendations(library: MediaLibrary, pool: RecPool, now = new Date()): Recommendation[] {
  const profile = tasteProfile(library, now);
  const genreWeight = new Map(profile.genres.map((genre) => [genre.name, genre.weight]));
  const affinityByKey = new Map(recommendationSeeds(library, now).map((item) => [item.title.key, item]));

  const merged = new Map<string, { candidate: RecCandidate; support: number; seeds: { title: MediaTitle; contribution: number }[] }>();
  for (const [seedKey, list] of Object.entries(pool.bySeed)) {
    const seed = affinityByKey.get(seedKey);
    if (!seed) continue; // Tohum artık sevilmiyor (beğenmedim dendi, bırakıldı): önerileri de düşer.
    list.forEach((candidate, rank) => {
      const key = `tmdb:${candidate.kind}:${candidate.tmdbId}`;
      if (library.titles[key] || library.dismissed?.[key]) return;
      const contribution = seed.score * Math.max(0.2, 1 - rank / 25);
      const entry = merged.get(key) ?? { candidate, support: 0, seeds: [] };
      entry.support += contribution;
      entry.seeds.push({ title: seed.title, contribution });
      merged.set(key, entry);
    });
  }

  const result: Recommendation[] = [];
  for (const [key, entry] of merged) {
    const { candidate } = entry;
    const genres = candidate.genreIds.map((id) => pool.genres[String(id)]).filter(Boolean);
    const seedSignal = 1 - Math.exp(-entry.support / 0.9);
    const known = genres.filter((genre) => genreWeight.has(genre));
    const taste = known.length ? known.reduce((sum, genre) => sum + genreWeight.get(genre)!, 0) / known.length : 0;
    const tasteSignal = (Math.max(-1, Math.min(1, taste * 1.6)) + 1) / 2;
    const rating = bayesianRating(candidate.voteAverage, candidate.voteCount);
    const qualitySignal = Math.max(0, Math.min(1, (rating - 5.8) / 2.6));
    const score = Math.round(100 * Math.max(0, Math.min(1, 0.5 * seedSignal + 0.3 * tasteSignal + 0.2 * qualitySignal)));

    const becauseOf = entry.seeds.toSorted((a, b) => b.contribution - a.contribution).map((item) => item.title);
    const reasons: string[] = [];
    reasons.push(becauseOf.length > 1 ? `${becauseOf.length} sevdiğin yapım öneriyor: ${becauseOf.slice(0, 3).map((title) => title.name).join(", ")}` : `${becauseOf[0].name} izleyenler bunu da sevmiş`);
    const liked = known.filter((genre) => genreWeight.get(genre)! >= 0.15).slice(0, 2);
    const cold = known.filter((genre) => genreWeight.get(genre)! <= -0.1);
    if (liked.length) reasons.push(`Sevdiğin türden: ${liked.join(", ").toLocaleLowerCase("tr-TR")}`);
    if (cold.length) reasons.push(`Dikkat: ${cold[0].toLocaleLowerCase("tr-TR")} türünde yarıda bıraktıkların var`);
    if (candidate.voteCount && candidate.voteCount >= 50) reasons.push(`TMDB ${candidate.voteAverage?.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} · ${candidate.voteCount.toLocaleString("tr-TR")} oy`);

    result.push({ candidate, key, score, genres, becauseOf, reasons, signals: { seeds: seedSignal, taste: tasteSignal, quality: qualitySignal } });
  }
  return result.toSorted((a, b) => b.score - a.score || (b.candidate.popularity ?? 0) - (a.candidate.popularity ?? 0));
}

export interface UpcomingEpisode {
  title: MediaTitle;
  season: number;
  episode: number;
  airDate: string;
  daysUntil: number;
}

/** İzlediğin dizilerin yayın tarihi belli yeni bölümleri, en yakın başta. */
export function upcomingEpisodes(library: MediaLibrary, now = new Date(), horizonDays = 60): UpcomingEpisode[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const watchedKeys = new Set(Object.values(library.progress).map((item) => item.titleKey));
  return Object.values(library.titles)
    .filter((title) => title.nextEpisode && (watchedKeys.has(title.key) || title.favorite) && title.userRating !== "disliked")
    .map((title) => {
      const air = new Date(`${title.nextEpisode!.airDate}T00:00:00`);
      return { title, season: title.nextEpisode!.season, episode: title.nextEpisode!.episode, airDate: title.nextEpisode!.airDate, daysUntil: Math.round((air.getTime() - today.getTime()) / DAY_MS) };
    })
    .filter((item) => item.daysUntil >= 0 && item.daysUntil <= horizonDays)
    .toSorted((a, b) => a.daysUntil - b.daysUntil);
}
