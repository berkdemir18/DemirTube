import { describe, expect, it } from "vitest";
import { sessionsInPeriod, videosInPeriod, periodStart, periodEnd, periodDateLabel } from "../src/analytics/period";
import { watchTrend } from "../src/analytics/period";
import type { VideoRecord, WatchSession } from "../src/shared/types";

const video = (overrides: Partial<VideoRecord> = {}): VideoRecord => ({
  videoId: "v1", title: "Test", channelName: "Kanal", url: "https://youtube.com/watch?v=v1",
  durationSeconds: 600, topics: [], firstSeenAt: "2026-07-01T10:00:00Z", lastSeenAt: "2026-07-01T10:10:00Z",
  totalWatchSeconds: 500, totalActiveWatchSeconds: 500, uniqueWatchedSeconds: 500, rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 500 }], completionRate: .83, sessionCount: 1, completed: true,
  regretScore: 5, engagementScore: 70, contentType: "standard", ...overrides
});

const session = (id: string, startedAt: string): WatchSession => ({
  id, videoId: "v1", startedAt, watchSeconds: 60, maximumPosition: 60, pauseCount: 0, forwardSeekCount: 0,
  backwardSeekCount: 0, tabHiddenCount: 0, playbackSegments: [{ start: 0, end: 60 }],
  endedNaturally: false, active: false
});

describe("dönem navigasyonu (anchor)", () => {
  const sessions = [
    session("s1", "2026-07-15T10:00:00Z"),
    session("s2", "2026-07-20T10:00:00Z"),
    session("s3", "2026-06-28T10:00:00Z")
  ];

  it("farklı anchor ile farklı gün dilimleri döner", () => {
    const dayAnchor = new Date(2026, 6, 15, 12);
    expect(sessionsInPeriod(sessions, "day", dayAnchor)).toHaveLength(1);
  });

  it("month anchor belirli bir takvim ayını tarar", () => {
    const monthAnchor = new Date(2026, 6, 10, 12); // Temmuz 2026
    expect(sessionsInPeriod(sessions, "month", monthAnchor)).toHaveLength(2);
    const prevMonth = new Date(2026, 5, 15, 12); // Haziran 2026
    expect(sessionsInPeriod(sessions, "month", prevMonth)).toHaveLength(1);
  });

  it("tüm zamanlar bütün oturumları ve video toplamını korur", () => {
    expect(sessionsInPeriod(sessions, "all", new Date(2026, 6, 20))).toHaveLength(3);
    expect(videosInPeriod([video()], sessions, "all", new Date(2026, 6, 20))).toHaveLength(1);
    expect(watchTrend(sessions, "all", new Date(2026, 6, 20)).length).toBeGreaterThanOrEqual(2);
  });

  it("periodEnd gelecekteki değerleri bugüne kırpar", () => {
    const future = new Date(2030, 0, 1);
    const end = periodEnd("day", future);
    expect(end.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("periodDateLabel anchor'a göre ay adı döndürür", () => {
    const monthAnchor = new Date(2026, 6, 10);
    expect(periodDateLabel("month", monthAnchor)).toContain("Temmuz");
  });

  it("weekTrend günlük dönemde 6 dilim üretir", () => {
    const now = new Date(2026, 6, 27, 12);
    const trend = watchTrend(sessions, "day", now);
    expect(trend).toHaveLength(6);
  });
});
