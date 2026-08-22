import { describe, expect, it } from "vitest";
import { advancedStatistics } from "../src/analytics/statistics";
import type { VideoRecord, WatchSession } from "../src/shared/types";

describe("gelişmiş istatistikler", () => {
  it("oturum, tekrar ve aktif gün değerlerini deterministik hesaplar", () => {
    const video = { videoId: "v", completed: true, completionRate: .8, sessionCount: 2, uniqueWatchedSeconds: 80, rewatchSeconds: 20, totalActiveWatchSeconds: 100, contentType: "standard" } as VideoRecord;
    const sessions = [
      { id: "s1", videoId: "v", startedAt: "2026-07-01T10:00:00", watchSeconds: 40 },
      { id: "s2", videoId: "v", startedAt: "2026-07-02T10:00:00", watchSeconds: 60 }
    ] as WatchSession[];
    const result = advancedStatistics([video], sessions);
    expect(result.activeWatchSeconds).toBe(100);
    expect(result.averageSessionSeconds).toBe(50);
    expect(result.activeDayCount).toBe(2);
    expect(result.revisitRate).toBe(100);
  });
});
