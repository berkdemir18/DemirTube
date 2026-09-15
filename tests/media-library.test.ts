import { describe, expect, it } from "vitest";
import { applyProgress, continueWatching, isFinished, mediaStats, mergeLibraries, nextUp, rawKey, rematchTitle, siteLabel } from "../src/media/library";
import { pickBestMatch } from "../src/media/tmdb";
import { emptyLibrary, type MediaLibrary, type MediaProgressReport, type MediaTitle, type ParsedMediaTitle, type TmdbSearchResult } from "../src/media/types";

const LOKI: MediaTitle = {
  key: "tmdb:tv:84958", tmdbId: 84958, kind: "tv", name: "Loki", favorite: false,
  seasons: [{ season: 0, episodeCount: 2 }, { season: 1, episodeCount: 6 }, { season: 2, episodeCount: 6 }],
  addedAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z",
};

function report(partial: Partial<MediaProgressReport> = {}): MediaProgressReport {
  return {
    documentTitle: "Loki 2. Sezon 4. Bölüm izle", pageUrl: "https://dizisitesi.example/loki-2-4", site: "dizisitesi.example",
    position: 600, duration: 2800, watchedDelta: 15, reportedAt: "2026-09-14T20:00:00.000Z", ...partial,
  };
}

const episode = (season: number, ep: number): ParsedMediaTitle => ({ query: "Loki", season, episode: ep, kind: "tv" });

function watch(library: MediaLibrary, season: number, ep: number, partial: Partial<MediaProgressReport> = {}) {
  return applyProgress(library, report(partial), episode(season, ep), library.titles[LOKI.key] ?? LOKI);
}

describe("isFinished", () => {
  it("jeneriği izlemeyen için sonu 4 dakika kalan bölümü bitmiş sayar", () => {
    expect(isFinished(2800 - 200, 2800)).toBe(true);
    expect(isFinished(1400, 2800)).toBe(false);
    expect(isFinished(100, 0)).toBe(false);
  });
});

describe("applyProgress", () => {
  it("izlenen süreyi biriktirir ve günlük site toplamına yazar", () => {
    let library = watch(emptyLibrary(), 2, 4);
    library = watch(library, 2, 4, { position: 615, reportedAt: "2026-09-14T20:00:15.000Z" });
    const item = library.progress["tmdb:tv:84958|2|4"];
    expect(item).toMatchObject({ watchedSeconds: 30, position: 615, completed: false, lastUrl: "https://dizisitesi.example/loki-2-4" });
    expect(Object.values(library.daily)[0]).toEqual({ "dizisitesi.example": 30 });
  });

  it("tek bildirimde 2 dakikadan fazla süre yazmaz (uyuyan sekme, saat atlaması)", () => {
    const library = watch(emptyLibrary(), 2, 4, { watchedDelta: 5000 });
    expect(library.progress["tmdb:tv:84958|2|4"].watchedSeconds).toBe(120);
  });

  it("bitmiş bölüm baştan açılınca bitmemişe dönmez", () => {
    let library = watch(emptyLibrary(), 2, 4, { position: 2700 });
    library = watch(library, 2, 4, { position: 20, reportedAt: "2026-09-15T20:00:00.000Z" });
    expect(library.progress["tmdb:tv:84958|2|4"].completed).toBe(true);
  });
});

describe("nextUp", () => {
  it("yarım bölümde kaldığı yeri ve yüzdeyi verir", () => {
    const library = watch(emptyLibrary(), 2, 4, { position: 1400 });
    expect(nextUp(LOKI, Object.values(library.progress))).toEqual({ state: "resume", season: 2, episode: 4, position: 1400, duration: 2800, percent: 50 });
  });

  it("bitmiş bölümden sonra bir sonrakini önerir", () => {
    const library = watch(emptyLibrary(), 2, 4, { position: 2750 });
    expect(nextUp(LOKI, Object.values(library.progress))).toEqual({ state: "next", season: 2, episode: 5 });
  });

  it("sezon sonunda bir sonraki sezonun ilk bölümüne geçer, özel bölümleri (sezon 0) atlar", () => {
    const library = watch(emptyLibrary(), 1, 6, { position: 2750 });
    expect(nextUp(LOKI, Object.values(library.progress))).toEqual({ state: "next", season: 2, episode: 1 });
  });

  it("son sezonun son bölümünden sonra güncel olduğunu söyler", () => {
    const library = watch(emptyLibrary(), 2, 6, { position: 2750 });
    expect(nextUp(LOKI, Object.values(library.progress))).toEqual({ state: "caught-up" });
  });

  it("en son izleneni esas alır, en yüksek bölüm numarasını değil", () => {
    let library = watch(emptyLibrary(), 2, 5, { position: 2750, reportedAt: "2026-09-10T20:00:00.000Z" });
    library = watch(library, 1, 3, { position: 900, reportedAt: "2026-09-14T20:00:00.000Z" });
    expect(nextUp(LOKI, Object.values(library.progress))).toMatchObject({ state: "resume", season: 1, episode: 3 });
  });
});

describe("continueWatching", () => {
  it("biten filmleri ve güncel dizileri rafa koymaz", () => {
    const movie: MediaTitle = { key: "tmdb:movie:693134", tmdbId: 693134, kind: "movie", name: "Dune: Part Two", favorite: false, addedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
    let library = watch(emptyLibrary(), 2, 6, { position: 2750 });
    library = applyProgress(library, report({ position: 9500, duration: 9960 }), { query: "Dune: Part Two", kind: "movie" }, movie);
    expect(continueWatching(library)).toEqual([]);
    library = watch(library, 2, 3, { position: 300, reportedAt: "2026-09-15T21:00:00.000Z" });
    expect(continueWatching(library).map((item) => item.title.name)).toEqual(["Loki"]);
  });
});

describe("rematchTitle", () => {
  it("ham başlığın ilerlemesini TMDB başlığına taşır ve favoriyi korur", () => {
    const raw: MediaTitle = { key: rawKey("loki dizi"), kind: "tv", name: "loki dizi", favorite: true, addedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
    let library = applyProgress(emptyLibrary(), report(), episode(2, 4), raw);
    library = { ...library, resolved: { "loki dizi|": raw.key } };
    const moved = rematchTitle(library, raw.key, LOKI);
    expect(moved.titles[raw.key]).toBeUndefined();
    expect(moved.titles[LOKI.key]).toMatchObject({ favorite: true, manualMatch: true });
    expect(moved.progress["tmdb:tv:84958|2|4"]).toMatchObject({ titleKey: LOKI.key, watchedSeconds: 15 });
    expect(moved.resolved["loki dizi|"]).toBe(LOKI.key);
  });
});

describe("mediaStats ve siteLabel", () => {
  it("son 7 ve 30 günü ayrı toplar", () => {
    const library: MediaLibrary = { ...emptyLibrary(), daily: { "2026-09-15": { "netflix.com": 3600 }, "2026-09-01": { "dizisitesi.example": 1800 }, "2026-07-01": { "x.com": 999 } } };
    const stats = mediaStats(library, new Date(2026, 8, 15, 22));
    expect(stats.weekSeconds).toBe(3600);
    expect(stats.monthSeconds).toBe(5400);
    expect(stats.sites.map((item) => item.site)).toEqual(["netflix.com", "dizisitesi.example"]);
  });

  it("tanınan platformlara okunur ad verir", () => {
    expect(siteLabel("www.netflix.com")).toBe("Netflix");
    expect(siteLabel("play.max.com")).toBe("HBO Max");
    expect(siteLabel("dizisitesi.example")).toBe("dizisitesi.example");
  });
});

describe("pickBestMatch", () => {
  const results: TmdbSearchResult[] = [
    { tmdbId: 1, kind: "movie", name: "Loki", year: 2019, popularity: 2 },
    { tmdbId: 84958, kind: "tv", name: "Loki", year: 2021, popularity: 90 },
    { tmdbId: 3, kind: "tv", name: "Loki: Behind the Scenes", year: 2021, popularity: 1 },
  ];

  it("bölüm bilgisi varsa aynı adlı filme değil diziye bağlar", () => {
    expect(pickBestMatch({ query: "Loki", season: 2, episode: 4, kind: "tv" }, results)?.tmdbId).toBe(84958);
  });

  it("yıl verilmişse yılı tutanı seçer", () => {
    expect(pickBestMatch({ query: "Loki", year: 2019, kind: "unknown" }, results)?.tmdbId).toBe(1);
  });

  it("ad tutmuyorsa hiç eşleştirmez", () => {
    expect(pickBestMatch({ query: "Lokum", kind: "tv" }, results)).toBeUndefined();
  });

  it("Türkçe adı olan diziyi özgün adıyla da bulur", () => {
    const turkish: TmdbSearchResult[] = [{ tmdbId: 1399, kind: "tv", name: "Taht Oyunları", originalName: "Game of Thrones", year: 2011, popularity: 300 }];
    expect(pickBestMatch({ query: "Game of Thrones", season: 1, episode: 1, kind: "tv" }, turkish)?.tmdbId).toBe(1399);
  });
});

describe("mergeLibraries", () => {
  it("yedekle birleştirirken en yeni ilerlemeyi alır ve günlük süreyi iki kez saymaz", () => {
    const older = watch(emptyLibrary(), 2, 4, { position: 500, reportedAt: "2026-09-10T20:00:00.000Z" });
    const newer = watch(emptyLibrary(), 2, 4, { position: 1800, reportedAt: "2026-09-12T20:00:00.000Z" });
    const merged = mergeLibraries(older, { ...newer, daily: { ...older.daily } });
    expect(merged.progress["tmdb:tv:84958|2|4"].position).toBe(1800);
    expect(merged.daily).toEqual(older.daily);
    expect(mergeLibraries(newer, older).progress["tmdb:tv:84958|2|4"].position).toBe(1800);
  });
});
