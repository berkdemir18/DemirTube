import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DB_NAME } from "../src/shared/constants";
import type { VideoRecord, WatchSession } from "../src/shared/types";
import { getDatabase, resetDatabaseConnectionForTests } from "../src/storage/database";
import { videoRepository } from "../src/storage/video-repository";

afterEach(async () => {
  vi.useRealTimers();
  await getDatabase().then((database) => database.close());
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

const imported = (): VideoRecord => ({
  videoId: "imported", title: "Fizik dersi", channelName: "Kanal", url: "https://youtube.com/watch?v=imported",
  durationSeconds: 600, topics: ["Eğitim"], firstSeenAt: "2026-07-01T12:00:00.000Z", lastSeenAt: "2026-07-01T12:00:00.000Z",
  totalWatchSeconds: 480, totalActiveWatchSeconds: 480, uniqueWatchedSeconds: 480,
  uniquePlaybackSegments: [], rewatchSeconds: 0, completionRate: .8, completed: false, sessionCount: 0,
  regretScore: 10, engagementScore: 70, contentType: "standard", source: "imported",
  importedAt: "2026-09-01T12:00:00.000Z",
});

describe("özet ve tahmin koruması", () => {
  it("oturumsuz geçmiş tekrar yeniden hesaplandığında izleme verisini korur", async () => {
    const original = imported();
    await videoRepository.put(original);
    await videoRepository.rebuildExisting(original.videoId);
    const result = await videoRepository.rebuildExisting(original.videoId);
    expect(result).toMatchObject(original);
    expect(result?.predictionSnapshot).toBeUndefined();
    // The same protection applies to sessionless legacy records without source tags.
    await videoRepository.put({ ...original, source: undefined });
    expect(await videoRepository.rebuildExisting(original.videoId)).toMatchObject({ completionRate: .8, uniqueWatchedSeconds: 480 });
  });

  it("tamamlanmış eski oturumlar için bugünden tahmin üretmez", async () => {
    const original = imported();
    await videoRepository.put({ ...original, source: "tracked" });
    const database = await getDatabase();
    await database.put("sessions", { id: "old", videoId: original.videoId, startedAt: original.firstSeenAt,
      endedAt: original.lastSeenAt, active: false, watchSeconds: 480, playbackSegments: [{ start: 0, end: 480 }],
      backwardSeekCount: 0, forwardSeekCount: 0 } as WatchSession);
    expect((await videoRepository.rebuildExisting(original.videoId))?.predictionSnapshot).toBeUndefined();
  });

  it("yeni açılışın tahminini bir kez kaydeder ve sonraki yeniden hesaplamada korur", async () => {
    const original = imported();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(original.firstSeenAt));
    const session = { id: "new", videoId: original.videoId, startedAt: original.firstSeenAt,
      updatedAt: original.firstSeenAt, active: true, watchSeconds: 0, playbackSegments: [],
      backwardSeekCount: 0, forwardSeekCount: 0 } as unknown as WatchSession;
    const first = await videoRepository.rebuild(original, [session]);
    expect(first.predictionSnapshot?.provenance).toBe("first-watch");
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
    const later = await videoRepository.rebuild(original, [{ ...session, active: false }]);
    expect(later.predictionSnapshot).toEqual(first.predictionSnapshot);
  });
});
