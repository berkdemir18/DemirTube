import { describe, expect, it } from "vitest";
import { applyProgress } from "../src/media/library";
import { bayesianRating, recommendationSeeds, scoreRecommendations, tasteProfile, titleAffinity, upcomingEpisodes } from "../src/media/recommend";
import { emptyLibrary, type MediaLibrary, type MediaTitle, type RecCandidate, type RecPool } from "../src/media/types";

const NOW = new Date(2026, 8, 15, 22, 0, 0);
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

const title = (id: number, name: string, genres: string[], kind: "tv" | "movie" = "tv", extra: Partial<MediaTitle> = {}): MediaTitle => ({
  key: `tmdb:${kind}:${id}`, tmdbId: id, kind, name, genres, favorite: false, addedAt: iso(90), updatedAt: iso(90),
  seasons: kind === "tv" ? [{ season: 1, episodeCount: 10 }] : undefined, ...extra,
});

const SEVERANCE = title(1, "Severance", ["Dram", "Gizem"]);
const BEAR = title(2, "The Bear", ["Komedi", "Dram"]);
const DARK = title(3, "Dark", ["Suç", "Gizem"]);

function watch(library: MediaLibrary, show: MediaTitle, episodes: number, daysAgo: number, stopAt = 1): MediaLibrary {
  let next = library;
  for (let episode = 1; episode <= episodes; episode += 1) {
    const last = episode === episodes;
    const share = last ? stopAt : 1;
    next = applyProgress(next, {
      documentTitle: "", pageUrl: "https://x.example", site: "x.example", position: 3000 * share, duration: 3000,
      watchedDelta: 60, reportedAt: iso(daysAgo - episode * 0.01),
    }, { query: show.name, kind: show.kind, season: 1, episode }, next.titles[show.key] ?? show);
  }
  return next;
}

const candidate = (id: number, name: string, genreIds: number[], voteAverage = 8, voteCount = 2000, kind: "tv" | "movie" = "tv"): RecCandidate =>
  ({ tmdbId: id, kind, name, genreIds, voteAverage, voteCount, popularity: 50 });

const GENRES = { "18": "Dram", "9648": "Gizem", "35": "Komedi", "80": "Suç", "10765": "Bilim Kurgu & Fantazi" };

describe("titleAffinity", () => {
  it("çok bölüm bitirilen dizi yüksek, ilk bölümde bırakılan eksi", () => {
    let library = watch(emptyLibrary(), SEVERANCE, 9, 3);
    library = watch(library, DARK, 1, 30, 0.3);
    expect(titleAffinity(library, library.titles[SEVERANCE.key], NOW).score).toBeGreaterThan(0.6);
    expect(titleAffinity(library, library.titles[DARK.key], NOW)).toMatchObject({ basis: "ilk bölümlerde bıraktın" });
    expect(titleAffinity(library, library.titles[DARK.key], NOW).score).toBeLessThan(-0.3);
  });

  it("açık yargı davranışı ezer", () => {
    const library = watch(emptyLibrary(), DARK, 1, 30, 0.3);
    const liked = { ...library.titles[DARK.key], userRating: "liked" as const };
    expect(titleAffinity(library, liked, NOW).score).toBe(1);
  });

  it("aynı sevgi eskidikçe hafifler ama yarıdan aşağı düşmez", () => {
    // Bitmiş dizi: uzun süre dokunulmamış yarım dizi cezası devreye girmesin, yalnızca eskime ölçülsün.
    const fresh = watch(emptyLibrary(), SEVERANCE, 10, 1);
    const old = watch(emptyLibrary(), SEVERANCE, 10, 300);
    const a = titleAffinity(fresh, fresh.titles[SEVERANCE.key], NOW).score;
    const b = titleAffinity(old, old.titles[SEVERANCE.key], NOW).score;
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(a * 0.45);
  });
});

describe("tasteProfile", () => {
  it("sevilen yapımların türleri artı, bırakılanların türleri eksi", () => {
    let library = watch(emptyLibrary(), SEVERANCE, 9, 3);
    library = watch(library, BEAR, 8, 5);
    library = watch(library, DARK, 1, 30, 0.3);
    const profile = tasteProfile(library, NOW);
    const weight = (name: string) => profile.genres.find((genre) => genre.name === name)!.weight;
    expect(weight("Dram")).toBeGreaterThan(0.3);
    expect(weight("Suç")).toBeLessThan(0);
    expect(profile.loved.map((item) => item.title.name)).toEqual(expect.arrayContaining(["Severance", "The Bear"]));
    expect(profile.disliked.map((item) => item.title.name)).toEqual(["Dark"]);
  });
});

describe("scoreRecommendations", () => {
  function setup() {
    let library = watch(emptyLibrary(), SEVERANCE, 9, 3);
    library = watch(library, BEAR, 8, 5);
    library = watch(library, DARK, 1, 30, 0.3);
    const pool: RecPool = {
      fetchedAt: NOW.toISOString(), seedKeys: [], genres: GENRES,
      bySeed: {
        [SEVERANCE.key]: [candidate(10, "Silo", [18, 9648]), candidate(11, "Ortak Aday", [18, 35]), candidate(12, "Suç Dizisi", [80], 8.2)],
        [BEAR.key]: [candidate(11, "Ortak Aday", [18, 35]), candidate(13, "Az Oylu Şaheser", [35], 9.6, 12)],
        // Dark sevilmediği için tohum değil; önerisi sayılmamalı.
        [DARK.key]: [candidate(14, "Dark'tan Gelen", [80, 9648])],
      },
    };
    return { library, pool };
  }

  it("iki sevilen yapımın ortak önerisini tek tohumlulardan öne alır", () => {
    const { library, pool } = setup();
    const recs = scoreRecommendations(library, pool, NOW);
    expect(recs[0].candidate.name).toBe("Ortak Aday");
    expect(recs[0].reasons[0]).toMatch(/^2 sevdiğin yapım öneriyor: (Severance, The Bear|The Bear, Severance)$/);
  });

  it("sevilmeyen tohumun önerisini hiç almaz, kütüphanedekini ve reddedileni atar", () => {
    const { library, pool } = setup();
    const withDismissed: MediaLibrary = { ...library, dismissed: { "tmdb:tv:10": { at: NOW.toISOString(), genres: ["Dram"] } } };
    const names = scoreRecommendations(withDismissed, pool, NOW).map((item) => item.candidate.name);
    expect(names).not.toContain("Dark'tan Gelen");
    expect(names).not.toContain("Silo");
    const inLibrary: MediaLibrary = { ...library, titles: { ...library.titles, "tmdb:tv:11": title(11, "Ortak Aday", []) } };
    expect(scoreRecommendations(inLibrary, pool, NOW).map((item) => item.candidate.name)).not.toContain("Ortak Aday");
  });

  it("bırakılan türdeki öneriyi uyarıyla ve daha düşük puanla verir", () => {
    const { library, pool } = setup();
    const recs = scoreRecommendations(library, pool, NOW);
    const crime = recs.find((item) => item.candidate.name === "Suç Dizisi")!;
    const silo = recs.find((item) => item.candidate.name === "Silo")!;
    expect(crime.score).toBeLessThan(silo.score);
    expect(crime.reasons.some((reason) => reason.startsWith("Dikkat: suç"))).toBe(true);
  });

  it("12 oylu 9,6'yı 2000 oylu 8'in önüne geçirmez", () => {
    expect(bayesianRating(9.6, 12)).toBeLessThan(bayesianRating(8, 2000));
  });

  it("tohum listesi yalnızca sevilenlerden oluşur", () => {
    const { library } = setup();
    expect(recommendationSeeds(library, NOW).map((item) => item.title.name)).not.toContain("Dark");
  });
});

describe("upcomingEpisodes", () => {
  it("izlenen dizinin yakın tarihli yeni bölümünü verir, geçmiş tarihi ve izlenmeyeni vermez", () => {
    let library = watch(emptyLibrary(), SEVERANCE, 9, 3);
    library = { ...library, titles: {
      ...library.titles,
      [SEVERANCE.key]: { ...library.titles[SEVERANCE.key], nextEpisode: { season: 2, episode: 1, airDate: "2026-09-19" } },
      "tmdb:tv:99": title(99, "Hiç İzlenmedi", [], "tv", { nextEpisode: { season: 1, episode: 2, airDate: "2026-09-17" } }),
      [BEAR.key]: { ...BEAR, nextEpisode: { season: 3, episode: 1, airDate: "2026-09-01" } },
    } };
    library = watch(library, BEAR, 2, 4);
    expect(upcomingEpisodes(library, NOW).map((item) => [item.title.name, item.daysUntil])).toEqual([["Severance", 4]]);
  });
});
