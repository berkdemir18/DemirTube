import { describe, expect, it, vi } from "vitest";
import { applyProgress, continueWatching } from "../src/media/library";
import { ensureFreshAuth, fetchHistory, pollDeviceToken, type TraktAuth, type TraktHistoryItem } from "../src/media/trakt";
import { applyTraktImport, traktTitleKeys } from "../src/media/trakt-import";
import { emptyLibrary, type MediaTitle } from "../src/media/types";

const show = { title: "Severance", year: 2022, ids: { trakt: 1, slug: "severance", tmdb: 95396 } };
const movie = { title: "Dune: Part Two", year: 2024, ids: { trakt: 2, slug: "dune-part-two-2024", tmdb: 693134 }, runtime: 166 };
const noTmdb = { title: "Bilinmeyen", year: 2020, ids: { trakt: 3, slug: "bilinmeyen", tmdb: null } };

const episodePlay = (id: number, season: number, number: number, watchedAt: string): TraktHistoryItem =>
  ({ id, watched_at: watchedAt, action: "watch", type: "episode", show, episode: { season, number, ids: { trakt: 100 + id }, runtime: 55 } });

const history: TraktHistoryItem[] = [
  episodePlay(11, 1, 1, "2026-09-01T21:00:00.000Z"),
  episodePlay(12, 1, 2, "2026-09-01T22:00:00.000Z"),
  { id: 13, watched_at: "2026-09-05T20:00:00.000Z", type: "movie", movie },
  { id: 14, watched_at: "2026-09-06T20:00:00.000Z", type: "movie", movie: noTmdb },
];

describe("applyTraktImport", () => {
  it("bölüm ve filmleri tamamlanmış ilerleme, oturum ve günlük süre olarak işler", () => {
    const result = applyTraktImport(emptyLibrary(), { history, ratings: [], watchlist: [] }, {}, new Date("2026-09-15T12:00:00Z"));
    expect(result).toMatchObject({ plays: 3, skippedNoTmdb: 1, newTitles: 2, duplicates: 0 });
    const episode = result.library.progress["tmdb:tv:95396|1|2"];
    expect(episode).toMatchObject({ completed: true, watchedSeconds: 55 * 60, site: "trakt.tv", lastUrl: "https://trakt.tv/shows/severance/seasons/1/episodes/2" });
    expect(result.library.progress["tmdb:movie:693134|0|0"]).toMatchObject({ completed: true, watchedSeconds: 166 * 60 });
    const session = result.library.sessions!.find((item) => item.id === "trakt:12")!;
    expect(session.endedAt).toBe("2026-09-01T22:00:00.000Z");
    expect(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()).toBe(55 * 60 * 1000);
    expect(result.seenIds).toEqual(expect.arrayContaining([11, 12, 13]));
  });

  it("aynı senkronu iki kez çalıştırmak süreyi ikiye katlamaz", () => {
    const first = applyTraktImport(emptyLibrary(), { history, ratings: [], watchlist: [] });
    const second = applyTraktImport(first.library, { history, ratings: [], watchlist: [] }, {}, new Date(), new Set(first.seenIds));
    expect(second.plays).toBe(0);
    expect(second.alreadyImported).toBe(3);
    expect(second.library.progress["tmdb:tv:95396|1|1"].watchedSeconds).toBe(55 * 60);
  });

  it("oturum kaydından budanmış eski izleme, görülenler listesi sayesinde yine iki kez sayılmaz", () => {
    const first = applyTraktImport(emptyLibrary(), { history, ratings: [], watchlist: [] });
    const pruned = { ...first.library, sessions: [] };
    const again = applyTraktImport(pruned, { history, ratings: [], watchlist: [] }, {}, new Date(), new Set(first.seenIds));
    expect(again.library.progress["tmdb:movie:693134|0|0"].watchedSeconds).toBe(166 * 60);
  });

  it("Perde'nin kendi yakaladığı izlemeyi Trakt'tan ikinci kez yazmaz", () => {
    const title: MediaTitle = { key: "tmdb:tv:95396", tmdbId: 95396, kind: "tv", name: "Severance", favorite: false, addedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
    let library = emptyLibrary();
    for (let second = 30; second <= 3300; second += 30) {
      library = applyProgress(library, { documentTitle: "", pageUrl: "https://tv.apple.com", site: "tv.apple.com", position: second, duration: 3300, watchedDelta: 30, reportedAt: new Date(Date.parse("2026-09-01T20:05:00Z") + second * 1000).toISOString() },
        { query: "Severance", kind: "tv", season: 1, episode: 1 }, library.titles[title.key] ?? title);
    }
    const before = library.progress["tmdb:tv:95396|1|1"].watchedSeconds;
    const result = applyTraktImport(library, { history: [history[0]], ratings: [], watchlist: [] });
    expect(result.duplicates).toBe(1);
    expect(result.library.progress["tmdb:tv:95396|1|1"].watchedSeconds).toBe(before);
    expect(result.library.progress["tmdb:tv:95396|1|1"].site).toBe("tv.apple.com");
  });

  it("puanları beğendim/beğenmedim yapar ama Perde'de verilmiş yargıyı ezmez; izleme listesi Listem olur", () => {
    const base = applyTraktImport(emptyLibrary(), { history, ratings: [], watchlist: [] }).library;
    const withManual = { ...base, titles: { ...base.titles, "tmdb:movie:693134": { ...base.titles["tmdb:movie:693134"], userRating: "disliked" as const } } };
    const result = applyTraktImport(withManual, {
      history: [],
      ratings: [
        { rated_at: "2026-09-02T00:00:00Z", rating: 9, type: "show", show },
        { rated_at: "2026-09-02T00:00:00Z", rating: 10, type: "movie", movie },
        { rated_at: "2026-09-02T00:00:00Z", rating: 2, type: "show", show: { title: "Kötü Dizi", year: 2021, ids: { tmdb: 777 } } },
      ],
      watchlist: [{ listed_at: "2026-09-03T00:00:00Z", type: "movie", movie: { title: "Interstellar", year: 2014, ids: { tmdb: 157336 } } }],
    });
    expect(result.library.titles["tmdb:tv:95396"].userRating).toBe("liked");
    expect(result.library.titles["tmdb:movie:693134"].userRating).toBe("disliked");
    expect(result.library.titles["tmdb:tv:777"].userRating).toBe("disliked");
    expect(result.library.titles["tmdb:movie:157336"].favorite).toBe(true);
  });

  it("ayrıntısı çekilecek yeni başlıkları tekrarsız listeler", () => {
    const keys = traktTitleKeys({ history, ratings: [], watchlist: [] }, emptyLibrary()).map((item) => item.key);
    expect(keys).toEqual(["tmdb:tv:95396", "tmdb:movie:693134"]);
  });

  it("yıllar önce izlenmiş dizi Devam et rafına girmez", () => {
    const old = applyTraktImport(emptyLibrary(), { history: [episodePlay(21, 1, 1, "2023-01-01T20:00:00Z")], ratings: [], watchlist: [] }).library;
    expect(continueWatching(old, 12, new Date("2026-09-15T12:00:00Z"))).toEqual([]);
  });
});

const response = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Trakt istemcisi", () => {
  const auth: TraktAuth = { clientId: "c".repeat(64), clientSecret: "s".repeat(64) };

  it("cihaz kodu yoklamasında durum kodlarını anlamlandırır ve belirteci süresiyle yazar", async () => {
    expect(await pollDeviceToken(auth, "d", vi.fn(async () => response(400)))).toEqual({ state: "pending" });
    expect(await pollDeviceToken(auth, "d", vi.fn(async () => response(418)))).toEqual({ state: "denied" });
    expect(await pollDeviceToken(auth, "d", vi.fn(async () => response(410)))).toEqual({ state: "expired" });
    const ok = await pollDeviceToken(auth, "d", vi.fn(async () => response(200, { access_token: "a", refresh_token: "r", expires_in: 86400, created_at: 1_800_000_000 })));
    expect(ok).toEqual({ state: "authorized", auth: { ...auth, accessToken: "a", refreshToken: "r", expiresAt: 1_800_000_000_000 + 86_400_000 } });
  });

  it("süresi dolmak üzere olan belirteci yeniler, tazeyi olduğu gibi bırakır", async () => {
    const fetcher = vi.fn(async () => response(200, { access_token: "yeni", refresh_token: "r2", expires_in: 86400, created_at: 1_900_000_000 }));
    const now = 1_000_000;
    const fresh = { ...auth, accessToken: "a", refreshToken: "r", expiresAt: now + 3_600_000 };
    expect(await ensureFreshAuth(fresh, fetcher, now)).toBe(fresh);
    expect(fetcher).not.toHaveBeenCalled();
    const stale = { ...fresh, expiresAt: now + 60_000 };
    expect(await ensureFreshAuth(stale, fetcher, now)).toMatchObject({ accessToken: "yeni", refreshToken: "r2" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.trakt.tv/oauth/token");
    expect(JSON.parse(String(init.body))).toMatchObject({ grant_type: "refresh_token", refresh_token: "r", redirect_uri: "urn:ietf:wg:oauth:2.0:oob" });
  });

  it("geçmişi sayfa sayfa çeker ve başlıkları gönderir", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return response(200, [episodePlay(page, 1, page, "2026-09-01T20:00:00Z")], { "X-Pagination-Page-Count": "3" });
    });
    const items = await fetchHistory({ ...auth, accessToken: "a" }, "2026-09-01T00:00:00Z", fetcher as unknown as typeof fetch);
    expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("start_at=2026-09-01T00%3A00%3A00Z");
    expect(init.headers).toMatchObject({ "trakt-api-version": "2", "trakt-api-key": auth.clientId, Authorization: "Bearer a" });
  });
});
