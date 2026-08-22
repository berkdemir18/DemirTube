import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION, DEFAULT_KEYWORD_RULES, DEFAULT_SETTINGS, DB_NAME } from "../src/shared/constants";
import { checksumPayload, clearData, exportData, importData } from "../src/storage/data-service";
import { getDatabase, resetDatabaseConnectionForTests } from "../src/storage/database";
import type { AppData, ArchivedWatchlistItem, WatchlistItem } from "../src/shared/types";

const storage: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.filter((key) => key in storage).map((key) => [key, storage[key]]));
        },
        set: async (items: Record<string, unknown>) => Object.assign(storage, items),
        remove: async (keys: string | string[]) => {
          for (const key of (Array.isArray(keys) ? keys : [keys])) delete storage[key];
        }
      }
    }
  });
});

afterEach(async () => {
  (await getDatabase()).close();
  resetDatabaseConnectionForTests();
  vi.unstubAllGlobals();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test veritabanı bağlantısı kapanmadı."));
  });
});

const watchlistItem = (overrides: Partial<WatchlistItem> = {}): WatchlistItem => ({
  videoId: "video-1",
  title: "Kişisel liste videosu",
  channelName: "Test Kanalı",
  url: "https://www.youtube.com/watch?v=video-1",
  topics: ["Programlama"],
  durationSeconds: 600,
  addedAt: "2026-07-01T10:00:00Z",
  ...overrides
});

const archiveItem = (overrides: Partial<ArchivedWatchlistItem> = {}): ArchivedWatchlistItem => ({
  ...watchlistItem(),
  removedAt: "2026-07-02T10:00:00Z",
  ...overrides
});

function backup(overrides: Partial<Omit<AppData, "checksum">> = {}): AppData {
  const base = {
    version: 2 as const,
    schemaVersion: 2 as const,
    appVersion: APP_VERSION,
    exportedAt: "2026-07-30T10:00:00Z",
    counts: { videos: 0, sessions: 0, feedback: 0, customTopics: 0 },
    videos: [],
    sessions: [],
    feedback: [],
    customTopics: [],
    keywordRules: DEFAULT_KEYWORD_RULES,
    weeklyReports: [],
    diagnostics: [],
    settings: DEFAULT_SETTINGS,
    ...overrides
  };
  return { ...base, checksum: checksumPayload(base) };
}

describe("kişisel liste yedeği", () => {
  it("aktif ve arşiv listelerini dışa aktarır", async () => {
    storage.watchlistItems = [watchlistItem()];
    storage.watchlistArchive = [archiveItem()];

    const exported = await exportData();

    expect(exported.watchlist).toEqual([watchlistItem()]);
    expect(exported.watchlistArchive).toEqual([archiveItem()]);
  });

  it("birleştirmede daha yeni aktif ve arşiv kayıtlarını korur", async () => {
    storage.watchlistItems = [watchlistItem({ title: "Eski başlık" })];
    storage.watchlistArchive = [archiveItem({ title: "Eski arşiv" })];

    await importData(backup({
      watchlist: [watchlistItem({ title: "Yeni başlık", addedAt: "2026-07-03T10:00:00Z" })],
      watchlistArchive: [archiveItem({ title: "Yeni arşiv", removedAt: "2026-07-04T10:00:00Z" })]
    }));

    expect(storage.watchlistItems).toEqual([watchlistItem({ title: "Yeni başlık", addedAt: "2026-07-03T10:00:00Z" })]);
    expect(storage.watchlistArchive).toEqual([archiveItem({ title: "Yeni arşiv", removedAt: "2026-07-04T10:00:00Z" })]);
  });

  it("yerine koy içe aktarmasında yedekte olmayan eski liste verisini temizler", async () => {
    storage.watchlistItems = [watchlistItem()];
    storage.watchlistArchive = [archiveItem()];

    await importData(backup(), "replace");

    expect(storage).not.toHaveProperty("watchlistItems");
    expect(storage).not.toHaveProperty("watchlistArchive");

    storage.watchlistItems = [watchlistItem()];
    storage.watchlistArchive = [archiveItem()];
    await clearData();
    expect(storage).not.toHaveProperty("watchlistItems");
    expect(storage).not.toHaveProperty("watchlistArchive");
  });
});
