import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_NAME } from "../src/shared/constants";
import {
  checkDataLoss, clearData, readDataFingerprint, recordDataFingerprint, resetDataFingerprint
} from "../src/storage/data-service";
import { getDatabase, resetDatabaseConnectionForTests } from "../src/storage/database";
import type { VideoRecord } from "../src/shared/types";

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

async function seedVideos(count: number) {
  const database = await getDatabase();
  for (let index = 0; index < count; index += 1) {
    await database.put("videos", { videoId: `video-${index}`, lastSeenAt: "2026-08-10T10:00:00Z" } as unknown as VideoRecord);
  }
}

/** IndexedDB'nin tarayıcı tarafından silinmesini taklit eder; storage.local dokunulmaz. */
async function wipeIndexedDatabase() {
  const database = await getDatabase();
  const transaction = database.transaction(["videos", "sessions"], "readwrite");
  await Promise.all([transaction.objectStore("videos").clear(), transaction.objectStore("sessions").clear()]);
  await transaction.done;
}

describe("veri kaybı dedektörü", () => {
  it("veritabanı dışarıdan silindiğinde kaybı bildirir", async () => {
    await seedVideos(40);
    await recordDataFingerprint();

    await wipeIndexedDatabase();
    const report = await checkDataLoss();

    expect(report.lost).toBe(true);
    expect(report.expected?.videos).toBe(40);
    expect(report.actual.videos).toBe(0);
  });

  it("kayıptan sonraki ilk kayıt beklenen sayıyı düşürmez", async () => {
    await seedVideos(40);
    await recordDataFingerprint();
    await wipeIndexedDatabase();

    await seedVideos(1);
    await recordDataFingerprint();

    expect((await readDataFingerprint())?.videos).toBe(40);
    expect((await checkDataLoss()).lost).toBe(true);
  });

  it("veri sağlamken uyarı üretmez", async () => {
    await seedVideos(40);
    await recordDataFingerprint();

    expect((await checkDataLoss()).lost).toBe(false);
  });

  it("yeni kurulumun ilk birkaç videosunu kayıp saymaz", async () => {
    await seedVideos(6);
    await recordDataFingerprint();
    await wipeIndexedDatabase();

    expect((await checkDataLoss()).lost).toBe(false);
  });

  it("kullanıcı uyarıyı yoksayınca beklenen sayı gerçek sayıya iner", async () => {
    await seedVideos(40);
    await recordDataFingerprint();
    await wipeIndexedDatabase();
    await seedVideos(3);

    await resetDataFingerprint();

    expect((await readDataFingerprint())?.videos).toBe(3);
    expect((await checkDataLoss()).lost).toBe(false);
  });

  it("kasıtlı tam silmeden sonra kayıp uyarısı vermez", async () => {
    await seedVideos(40);
    await recordDataFingerprint();

    await clearData();

    expect(await readDataFingerprint()).toBeUndefined();
    expect((await checkDataLoss()).lost).toBe(false);
  });
});
