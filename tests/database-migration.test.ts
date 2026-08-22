import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
import { DB_NAME, DB_VERSION } from "../src/shared/constants";
import { getDatabase, resetDatabaseConnectionForTests } from "../src/storage/database";

afterEach(async () => {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
});

describe("IndexedDB şema yükseltmesi", () => {
  it("v1 video ve oturumlarını silmeden v2 mağazalarını ekler", async () => {
    const legacy = await openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore("videos", { keyPath: "videoId" });
        const sessions = database.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-video", "videoId");
        sessions.createIndex("by-started", "startedAt");
      }
    });
    await legacy.put("videos", {
      videoId: "legacy", title: "Eski kayıt", channelName: "Kanal", url: "https://youtube.com/watch?v=legacy",
      durationSeconds: 60, topics: ["Diğer"], firstSeenAt: "2026-01-01", lastSeenAt: "2026-01-01",
      totalWatchSeconds: 20, completionRate: .33, sessionCount: 1, completed: false, regretScore: 0
    });
    legacy.close();

    resetDatabaseConnectionForTests();
    const upgraded = await getDatabase();
    expect(upgraded.version).toBe(DB_VERSION);
    expect(await upgraded.get("videos", "legacy")).toMatchObject({ videoId: "legacy", title: "Eski kayıt" });
    expect([...upgraded.objectStoreNames]).toEqual(expect.arrayContaining([
      "feedback", "customTopics", "keywordRules", "diagnostics", "weeklyReports"
    ]));
    upgraded.close();
  });
});
