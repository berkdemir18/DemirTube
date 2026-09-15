import { describe, expect, it } from "vitest";
import { appendSession, applyProgress } from "../src/media/library";
import { bingeInsight, clockInsight, finishInsight, genreShares, showPaces, stalledTitles, tasteGaps, titleSummaries, weekSummary } from "../src/media/insights";
import { emptyLibrary, type MediaLibrary, type MediaSession, type MediaTitle } from "../src/media/types";

const NOW = new Date(2026, 8, 15, 22, 0, 0); // 15 Eylül 2026 Salı, 22:00

const LOKI: MediaTitle = {
  key: "tmdb:tv:84958", tmdbId: 84958, kind: "tv", name: "Loki", favorite: false, genres: ["Bilim Kurgu", "Dram"], voteAverage: 8.2,
  seasons: [{ season: 1, episodeCount: 6 }, { season: 2, episodeCount: 6 }],
  addedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
};
const DUNE: MediaTitle = { key: "tmdb:movie:693134", tmdbId: 693134, kind: "movie", name: "Dune: Part Two", favorite: false, genres: ["Bilim Kurgu"], addedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };

function at(day: number, hour: number, minute = 0) {
  return new Date(2026, 8, day, hour, minute).toISOString();
}

/** Bir bölümü baştan sona 15 saniyelik bildirimlerle "izler". */
function watchEpisode(library: MediaLibrary, title: MediaTitle, season: number, episode: number, startIso: string, minutes = 48, stopAt = 1): MediaLibrary {
  const duration = minutes * 60;
  let next = library;
  const start = new Date(startIso).getTime();
  for (let second = 15; second <= duration * stopAt; second += 15) {
    next = applyProgress(next, {
      documentTitle: "", pageUrl: "https://ornek.example/izle", site: "ornek.example",
      position: second, duration, watchedDelta: 15, reportedAt: new Date(start + second * 1000).toISOString(),
    }, { query: title.name, season, episode, kind: title.kind }, next.titles[title.key] ?? title);
  }
  return next;
}

describe("appendSession", () => {
  it("aynı bölüme 5 dakikadan kısa arayla gelen bildirimi aynı oturuma ekler, uzun arada yenisini açar", () => {
    let sessions: MediaSession[] = [];
    const base = { titleKey: "t", season: 1, episode: 1, site: "x", seconds: 15 };
    sessions = appendSession(sessions, { ...base, at: at(10, 21, 0) });
    sessions = appendSession(sessions, { ...base, at: at(10, 21, 4) });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].seconds).toBe(30);
    sessions = appendSession(sessions, { ...base, at: at(10, 21, 30) });
    expect(sessions).toHaveLength(2);
  });
});

describe("bingeInsight", () => {
  it("45 dakikadan kısa aralarla izlenen bölümleri tek maraton sayar", () => {
    let library = emptyLibrary();
    // 12 Eylül gecesi: 4 bölüm art arda
    for (let episode = 1; episode <= 4; episode += 1) library = watchEpisode(library, LOKI, 1, episode, at(12, 21 + (episode - 1), 5));
    // Başka günler tek bölüm
    library = watchEpisode(library, LOKI, 1, 5, at(13, 20));
    library = watchEpisode(library, LOKI, 1, 6, at(14, 20));
    const insight = bingeInsight(library)!;
    expect(insight.longest).toMatchObject({ titleKey: LOKI.key, episodes: 4 });
    expect(insight.count).toBe(1);
    expect(insight.episodesPerSitting).toBeCloseTo(2, 5);
  });

  it("üç oturuştan azında sonuç üretmez", () => {
    const library = watchEpisode(emptyLibrary(), LOKI, 1, 1, at(12, 21));
    expect(bingeInsight(library)).toBeUndefined();
  });
});

describe("clockInsight", () => {
  it("gece yarısını geçen oturumu saatlerine böler ve gece payını hesaplar", () => {
    let library = emptyLibrary();
    library = watchEpisode(library, LOKI, 1, 1, at(12, 23, 30), 60); // 23:30–00:30
    library = watchEpisode(library, LOKI, 1, 2, at(13, 1, 0), 45);   // 01:00–01:45
    library = watchEpisode(library, DUNE, 0, 0, at(14, 20, 0), 120); // 20:00–22:00
    const insight = clockInsight(library, 60, NOW)!;
    expect(Math.round(insight.hours[23] / 60)).toBe(30);
    expect(Math.round(insight.hours[0] / 60)).toBe(30);
    expect(insight.lateNightShare).toBeCloseTo(75 / 225, 2);
    expect([20, 21]).toContain(insight.peakHour);
  });

  it("3 saatten az kayıtta konuşmaz", () => {
    expect(clockInsight(watchEpisode(emptyLibrary(), LOKI, 1, 1, at(12, 21)), 60, NOW)).toBeUndefined();
  });
});

describe("showPaces ve stalledTitles", () => {
  it("son 21 günün hızıyla kalan bölümlerin bitiş gününü tahmin eder", () => {
    let library = emptyLibrary();
    for (let episode = 1; episode <= 6; episode += 1) library = watchEpisode(library, LOKI, 1, episode, at(1 + episode * 2, 21));
    const pace = showPaces(library, NOW)[0];
    expect(pace).toMatchObject({ finishedEpisodes: 6, totalEpisodes: 12, remainingEpisodes: 6, percent: 50 });
    // 6 bölüm / ~12 gün ≈ 0,5 bölüm/gün → 12 gün
    expect(pace.etaDays).toBeGreaterThanOrEqual(11);
    expect(pace.etaDays).toBeLessThanOrEqual(13);
  });

  it("iki haftadır dokunulmamış yarım diziyi yakalar, güncel olanı yakalamaz", () => {
    let library = watchEpisode(emptyLibrary(), LOKI, 2, 3, at(1, 21), 48, 0.4);
    library = watchEpisode(library, DUNE, 0, 0, at(14, 20), 150);
    const stalled = stalledTitles(library, NOW);
    expect(stalled.map((item) => item.title.name)).toEqual(["Loki"]);
    expect(stalled[0].label).toBe("2. sezon 3. bölümün %40'ında bıraktın");
    expect(tasteGaps(library, NOW).map((item) => item.title.name)).toEqual(["Loki"]);
  });
});

describe("genreShares, finishInsight, titleSummaries, weekSummary", () => {
  it("süreyi türlere böler ve film bitirme oranını sayar", () => {
    let library = emptyLibrary();
    library = watchEpisode(library, LOKI, 1, 1, at(10, 21), 60);
    library = watchEpisode(library, DUNE, 0, 0, at(11, 20), 60, 0.3);
    const genres = genreShares(library)!;
    // Loki 60 dk → Bilim Kurgu 30 + Dram 30; Dune 18 dk → Bilim Kurgu
    expect(genres[0]).toMatchObject({ label: "Bilim Kurgu" });
    expect(genres[0].share).toBeCloseTo(48 / 78, 2);
    expect(finishInsight(library, NOW)).toMatchObject({ moviesStarted: 1, moviesFinished: 0, moviesAbandoned: 0, episodesFinished: 1 });
    const summaries = titleSummaries(library, NOW);
    expect(summaries.find((item) => item.title.key === DUNE.key)).toMatchObject({ status: "watching", percent: 30 });
  });

  it("son 7 günü önceki haftayla ayırır", () => {
    const library: MediaLibrary = { ...emptyLibrary(), daily: { "2026-09-15": { a: 3600 }, "2026-09-09": { a: 1800 }, "2026-09-08": { a: 900 }, "2026-07-01": { a: 99 } } };
    const summary = weekSummary(library, NOW, 7200);
    expect(summary.seconds).toBe(5400);
    expect(summary.previousSeconds).toBe(900);
    expect(summary.weeks).toHaveLength(8);
    expect(summary.youtubeSeconds).toBe(7200);
  });
});
