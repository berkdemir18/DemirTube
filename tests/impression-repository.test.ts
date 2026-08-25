import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
import { DB_NAME, DB_VERSION } from "../src/shared/constants";
import { getDatabase, resetDatabaseConnectionForTests } from "../src/storage/database";
import { IMPRESSION_RETENTION_DAYS, impressionRepository } from "../src/storage/impression-repository";

afterEach(async () => {
  // Açık bağlantı kapatılmazsa deleteDatabase engellenir ve bir sonraki test
  // eski veriyle ya da askıda kalır.
  await getDatabase().then((database) => database.close()).catch(() => undefined);
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
});

const entry = (videoId: string, score: number) => ({
  videoId,
  title: `${videoId} başlık`,
  channelName: "Kanal",
  score,
  estimatedCompletion: score,
  modelVersion: "adaptive-v5",
});

describe("gösterim deposu", () => {
  it("v2 veritabanını veri kaybetmeden v3'e yükseltir", async () => {
    const legacy = await openDB(DB_NAME, 2, {
      upgrade(database) {
        database.createObjectStore("videos", { keyPath: "videoId" });
        const sessions = database.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-video", "videoId");
        sessions.createIndex("by-started", "startedAt");
        database.createObjectStore("feedback", { keyPath: "videoId" });
        database.createObjectStore("customTopics", { keyPath: "id" });
        database.createObjectStore("keywordRules", { keyPath: "id" });
        database.createObjectStore("diagnostics", { keyPath: "id" });
        database.createObjectStore("weeklyReports", { keyPath: "id" });
      },
    });
    await legacy.put("videos", { videoId: "eski", title: "Eski kayıt" } as never);
    legacy.close();

    resetDatabaseConnectionForTests();
    const upgraded = await getDatabase();

    expect(upgraded.version).toBe(DB_VERSION);
    expect([...upgraded.objectStoreNames]).toContain("impressions");
    // Yeni mağaza eklemek eski veriyi silmemeli.
    expect(await upgraded.get("videos", "eski")).toMatchObject({ videoId: "eski" });
    upgraded.close();
  });

  it("aynı kart tekrar gösterildiğinde ilk görülme zamanını korur, sayacı artırır", async () => {
    const first = new Date("2026-07-01T10:00:00.000Z");
    const second = new Date("2026-07-03T10:00:00.000Z");

    await impressionRepository.record([entry("a", 80), entry("b", 40)], first);
    await impressionRepository.record([entry("a", 85)], second);

    const all = await impressionRepository.all();
    const a = all.find((item) => item.videoId === "a")!;

    expect(all).toHaveLength(2);
    expect(a.shownCount).toBe(2);
    expect(a.firstShownAt).toBe(first.toISOString());
    expect(a.lastShownAt).toBe(second.toISOString());
    // Güncel puan yazılır: model değiştiyse kartın son gösterdiği sayı geçerlidir.
    expect(a.score).toBe(85);
  });

  it("boş listede yazma yapmaz", async () => {
    await impressionRepository.record([]);
    expect(await impressionRepository.all()).toHaveLength(0);
  });

  it("süresi dolmuş kayıtları budar, tazeleri bırakır", async () => {
    const old = new Date("2026-01-01T10:00:00.000Z");
    const fresh = new Date(old.getTime() + (IMPRESSION_RETENTION_DAYS + 5) * 86_400_000);

    await impressionRepository.record([entry("eski", 70)], old);
    await impressionRepository.record([entry("taze", 70)], fresh);

    const removed = await impressionRepository.prune(fresh);
    const remaining = await impressionRepository.all();

    expect(removed).toBe(1);
    expect(remaining.map((item) => item.videoId)).toEqual(["taze"]);
  });
});
