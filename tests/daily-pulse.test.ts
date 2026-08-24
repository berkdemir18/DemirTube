import { describe, expect, it } from "vitest";
import { calculateDailyPulse } from "../src/analytics/daily-pulse";
import type { VideoRecord, WatchSession } from "../src/shared/types";

const NOW = new Date(2026, 6, 15, 21, 0, 0); // 15 Temmuz 2026, Çarşamba

function video(partial: Partial<VideoRecord> & { videoId: string }): VideoRecord {
  return {
    title: `${partial.videoId} başlık`,
    channelName: "Kanal",
    url: `https://www.youtube.com/watch?v=${partial.videoId}`,
    durationSeconds: 600,
    topics: ["Teknoloji"],
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    totalWatchSeconds: 300,
    totalActiveWatchSeconds: 300,
    uniqueWatchedSeconds: 300,
    rewatchSeconds: 0,
    uniquePlaybackSegments: [{ start: 0, end: 300 }],
    completionRate: .5,
    sessionCount: 1,
    completed: false,
    regretScore: 20,
    engagementScore: 50,
    contentType: "standard",
    ...partial
  } as VideoRecord;
}

function session(partial: Partial<WatchSession> & { id: string; videoId: string; startedAt: string }): WatchSession {
  return {
    watchSeconds: 300,
    maximumPosition: 300,
    pauseCount: 0,
    forwardSeekCount: 0,
    backwardSeekCount: 0,
    tabHiddenCount: 0,
    playbackSegments: [{ start: 0, end: 300 }],
    endedNaturally: false,
    ...partial
  } as WatchSession;
}

const localIso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
const daysAgo = (days: number, hour = 12) =>
  localIso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, hour));

describe("günlük nabız", () => {
  it("bugünkü aktif süreyi, video sayısını ve Shorts payını hesaplar", () => {
    const videos = [
      video({ videoId: "a", totalActiveWatchSeconds: 600, completed: true, completionRate: 1 }),
      video({ videoId: "s1", contentType: "short", durationSeconds: 30, totalActiveWatchSeconds: 200 })
    ];
    const sessions = [
      session({ id: "1", videoId: "a", startedAt: daysAgo(0, 9), watchSeconds: 600, endedNaturally: true, playbackSegments: [{ start: 0, end: 600 }], maximumPosition: 600 }),
      session({ id: "2", videoId: "s1", startedAt: daysAgo(0, 10), watchSeconds: 200, playbackSegments: [{ start: 0, end: 30 }], maximumPosition: 30 })
    ];

    const pulse = calculateDailyPulse(videos, sessions, { dailyWatchBudgetMinutes: 60 }, NOW);

    expect(pulse.activeSeconds).toBe(800);
    expect(pulse.videoCount).toBe(2);
    // Shorts baştan sona izlendiği için o da tamamlanmış sayılır.
    expect(pulse.completedCount).toBe(2);
    expect(pulse.shortsCount).toBe(1);
    expect(pulse.budgetPercent).toBeCloseTo(22.2, 1);
    expect(pulse.budgetState).toBe("safe");
    expect(pulse.topTopic?.topic).toBe("Teknoloji");
  });

  it("bütçe aşımını ve yaklaşmayı ayırır, bütçe kapalıyken durumu 'off' bırakır", () => {
    const videos = [video({ videoId: "a" })];
    const withMinutes = (minutes: number, budget: number) => calculateDailyPulse(
      videos,
      [session({ id: "1", videoId: "a", startedAt: daysAgo(0), watchSeconds: minutes * 60 })],
      { dailyWatchBudgetMinutes: budget },
      NOW
    );

    expect(withMinutes(50, 60).budgetState).toBe("near");
    expect(withMinutes(70, 60).budgetState).toBe("over");
    expect(withMinutes(70, 0).budgetState).toBe("off");
    expect(withMinutes(70, 0).budgetPercent).toBe(0);
  });

  it("kesintisiz izleme serisini sayar ve boş gün görünce durur", () => {
    const videos = [video({ videoId: "a" })];
    const sessions = [0, 1, 2, 4].map((days) =>
      session({ id: `s${days}`, videoId: "a", startedAt: daysAgo(days), watchSeconds: 120 })
    );

    expect(calculateDailyPulse(videos, sessions, { dailyWatchBudgetMinutes: 0 }, NOW).streakDays).toBe(3);
  });

  it("bugün henüz izleme yoksa dünkü seriyi kırılmış saymaz", () => {
    const videos = [video({ videoId: "a" })];
    const sessions = [1, 2].map((days) =>
      session({ id: `s${days}`, videoId: "a", startedAt: daysAgo(days), watchSeconds: 120 })
    );

    const pulse = calculateDailyPulse(videos, sessions, { dailyWatchBudgetMinutes: 0 }, NOW);
    expect(pulse.activeSeconds).toBe(0);
    expect(pulse.streakDays).toBe(2);
    expect(pulse.shortsPercent).toBe(0);
  });

  it("son yedi günü eskiden yeniye verir ve bugünü işaretler", () => {
    const videos = [video({ videoId: "a" })];
    const sessions = [
      session({ id: "s0", videoId: "a", startedAt: daysAgo(0), watchSeconds: 600 }),
      session({ id: "s3", videoId: "a", startedAt: daysAgo(3), watchSeconds: 300 })
    ];

    const pulse = calculateDailyPulse(videos, sessions, { dailyWatchBudgetMinutes: 0 }, NOW);

    expect(pulse.weekBars).toHaveLength(7);
    expect(pulse.weekBars.at(-1)?.isToday).toBe(true);
    expect(pulse.weekBars.at(-1)?.seconds).toBe(600);
    expect(pulse.weekBars.filter((bar) => bar.isToday)).toHaveLength(1);
    expect(pulse.weekBars[3].seconds).toBe(300);
    // Önceki altı günün ortalaması: yalnızca 300 sn'lik tek gün var.
    expect(pulse.recentAverageSeconds).toBe(50);
    expect(pulse.deltaPercent).toBe(1100);
  });

  it("veri yokken çökmez ve nötr değerler döndürür", () => {
    const pulse = calculateDailyPulse([], [], { dailyWatchBudgetMinutes: 45 }, NOW);

    expect(pulse.activeSeconds).toBe(0);
    expect(pulse.videoCount).toBe(0);
    expect(pulse.streakDays).toBe(0);
    expect(pulse.deltaPercent).toBeUndefined();
    expect(pulse.topTopic).toBeUndefined();
    expect(pulse.lastVideo).toBeUndefined();
    expect(pulse.weekBars.every((bar) => bar.seconds === 0)).toBe(true);
  });
});
