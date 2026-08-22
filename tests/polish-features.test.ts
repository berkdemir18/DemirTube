import { describe, expect, it } from "vitest";
import { dataLevel } from "../src/analytics/data-level";
import { lastMonthSameDay } from "../src/analytics/nostalgia";
import { channelDiversity } from "../src/analytics/diversity";
import type { VideoRecord, WatchSession } from "../src/shared/types";

const video = (overrides: Partial<VideoRecord> = {}): VideoRecord => ({
  videoId: "v1", title: "Video", channelName: "Kanal A", url: "https://youtube.com/watch?v=v1",
  durationSeconds: 600, topics: ["Programlama"], firstSeenAt: "2026-06-27T10:00:00Z", lastSeenAt: "2026-06-27T10:10:00Z",
  totalWatchSeconds: 500, totalActiveWatchSeconds: 500, uniqueWatchedSeconds: 500, rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 500 }], completionRate: .83, sessionCount: 1, completed: true,
  regretScore: 5, engagementScore: 70, contentType: "standard", ...overrides
});

const session = (id: string, videoId: string, startedAt: string, watchSeconds: number): WatchSession => ({
  id, videoId, startedAt, watchSeconds, maximumPosition: watchSeconds, pauseCount: 0, forwardSeekCount: 0,
  backwardSeekCount: 0, tabHiddenCount: 0, playbackSegments: [{ start: 0, end: watchSeconds }],
  endedNaturally: false, active: false
});

describe("veri seviyesi", () => {
  it("eşiklerde doğru seviyeyi verir", () => {
    expect(dataLevel(0).level).toBe(1);
    expect(dataLevel(4).label).toBe("Isınma Turu");
    expect(dataLevel(5).label).toBe("Öğreniyor");
    expect(dataLevel(49).nextAt).toBe(50);
    expect(dataLevel(300).label).toBe("Ruh İkizi");
    expect(dataLevel(300).progress).toBe(100);
  });

  it("seviye içi ilerlemeyi hesaplar", () => {
    const mid = dataLevel(12); // 5-20 arası: 7/15 ≈ 47
    expect(mid.progress).toBe(47);
    expect(mid.nextAt).toBe(20);
  });
});

describe("geçen ay bugün nostaljisi", () => {
  const videos = [video(), video({ videoId: "v2", topics: ["Formula 1"] })];
  const sessions = [
    session("s1", "v1", "2026-06-27T20:00:00Z", 1_200),
    session("s2", "v2", "2026-06-27T21:00:00Z", 600),
    session("s3", "v1", "2026-07-27T10:00:00Z", 900)
  ];

  it("bir ay önceki aynı günün özetini döndürür", () => {
    const flash = lastMonthSameDay(videos, sessions, new Date("2026-07-27T15:00:00"));
    expect(flash?.watchSeconds).toBe(1_800);
    expect(flash?.videoCount).toBe(2);
    expect(flash?.topTopic).toBe("Programlama");
  });

  it("o gün kayıt yoksa undefined döner", () => {
    expect(lastMonthSameDay(videos, sessions, new Date("2026-07-15T15:00:00"))).toBeUndefined();
  });
});

describe("kanal çeşitliliği", () => {
  it("tek kanal baskınlığını ve etiketi hesaplar", () => {
    const videos = [
      video({ totalActiveWatchSeconds: 8_000 }),
      video({ videoId: "v2", channelName: "Kanal B", totalActiveWatchSeconds: 2_000 }),
      video({ videoId: "v3", channelName: "Kanal C", totalActiveWatchSeconds: 1_000, excludedFromAnalytics: true })
    ];
    const diversity = channelDiversity(videos);
    expect(diversity.channelCount).toBe(2);
    expect(diversity.topShare).toBe(80);
    expect(diversity.label).toContain("gömülmüş");
  });

  it("dengeli dağılımda keşif etiketi verir", () => {
    const videos = ["A", "B", "C", "D"].map((name, i) => video({ videoId: `v${i}`, channelName: name, totalActiveWatchSeconds: 1_000 }));
    expect(channelDiversity(videos).label).toContain("yelpaze");
  });

  it("boş listede güvenli döner", () => {
    expect(channelDiversity([]).channelCount).toBe(0);
  });
});
