import { describe, expect, it } from "vitest";
import { videosToCsv } from "../src/analytics/csv-export";
import { dailyNoteLine, dailyNoteMarkdown } from "../src/analytics/daily-note";
import { monthlyCapsule, yearlyWrapped } from "../src/analytics/monthly-capsule";
import type { VideoRecord, WatchSession } from "../src/shared/types";

const video = (overrides: Partial<VideoRecord> = {}): VideoRecord => ({
  videoId: "v1", title: "YBS detayları", channelName: "Can Değer", url: "https://youtube.com/watch?v=v1",
  durationSeconds: 720, topics: ["Hazırlık"], firstSeenAt: "2026-07-10T10:00:00Z", lastSeenAt: "2026-07-10T10:12:00Z",
  totalWatchSeconds: 600, totalActiveWatchSeconds: 600, uniqueWatchedSeconds: 600, rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 600 }], completionRate: .83, sessionCount: 1, completed: true,
  regretScore: 5, engagementScore: 80, contentType: "standard", ...overrides
});

const session = (id: string, videoId: string, startedAt: string, watchSeconds: number): WatchSession => ({
  id, videoId, startedAt, watchSeconds, maximumPosition: watchSeconds, pauseCount: 0, forwardSeekCount: 0,
  backwardSeekCount: 0, tabHiddenCount: 0, playbackSegments: [{ start: 0, end: watchSeconds }],
  endedNaturally: false, active: false
});

describe("CSV dışa aktarımı", () => {
  it("Excel uyumlu başlık ve satır üretir, noktalı virgül ve kaçış uygular", () => {
    const csv = videosToCsv([video({ title: 'Noktalı; "tırnaklı" başlık' })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Başlık;Kanal");
    expect(lines[1]).toContain('"Noktalı; ""tırnaklı"" başlık"');
    expect(lines[1]).toContain("Hazırlık");
  });

  it("boş listede yalnızca başlık döner", () => {
    expect(videosToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("Obsidian günlük notu", () => {
  const videos = [video(), video({ videoId: "v2", topics: ["Oyun"] })];
  const sessions = [
    session("s1", "v1", "2026-07-27T09:00:00Z", 600),
    session("s2", "v2", "2026-07-27T11:00:00Z", 300),
    session("s3", "v1", "2026-07-26T11:00:00Z", 900)
  ];

  it("günün özetini tek satır Markdown olarak üretir", () => {
    const line = dailyNoteLine(videos, sessions, new Date("2026-07-27T15:00:00"));
    expect(line).toMatch(/^- \*\*DemirTube\*\*/);
    expect(line).toContain("15 dk");
    expect(line).toContain("2 video");
    expect(line).toContain("Hazırlık");
  });

  it("başka günün oturumlarını dahil etmez", () => {
    const line = dailyNoteLine(videos, sessions, new Date("2026-07-26T15:00:00"));
    expect(line).toContain("15 dk");
    expect(line).toContain("1 video");
  });

  it("md çıktısı başlık içerir", () => {
    expect(dailyNoteMarkdown(videos, sessions, new Date("2026-07-27T15:00:00"))).toContain("## 2026-07-27 DemirTube Özeti");
  });
});

describe("aylık kapsül ve yıllık wrapped", () => {
  const videos = [
    video({ lastSeenAt: "2026-07-20T10:00:00Z" }),
    video({ videoId: "v2", topics: ["Programlama"], channelName: "Kod Kanalı", rewatchSeconds: 120, engagementScore: 95 }),
    video({ videoId: "v3", topics: ["Oyun"], excludedFromAnalytics: true })
  ];
  const sessions = [
    session("s1", "v1", "2026-07-05T10:00:00Z", 1_800),
    session("s2", "v2", "2026-07-20T10:00:00Z", 3_600),
    session("s3", "v1", "2026-06-10T10:00:00Z", 600),
    session("s4", "v3", "2026-07-21T10:00:00Z", 9_999)
  ];
  const now = new Date("2026-07-27T12:00:00");

  it("aylık kapsül cari ayı, hazırlık süresini ve en uzun günü hesaplar", () => {
    const capsule = monthlyCapsule(videos, sessions, now);
    expect(capsule.videoCount).toBe(2);
    // Süre, haftalık raporla aynı desende tüm oturumları sayar (hariç tutulan video dahil).
    expect(capsule.totalWatchSeconds).toBe(15_399);
    expect(capsule.preparationSeconds).toBe(1_800);
    expect(capsule.longestDaySeconds).toBe(9_999);
    expect(capsule.topTopics).toContain("Hazırlık");
    expect(capsule.previousWatchSeconds).toBe(600);
  });

  it("yıllık wrapped yıl başından beri toplar ve tekrar/engagement şampiyonlarını bulur", () => {
    const wrapped = yearlyWrapped(videos, sessions, now);
    expect(wrapped.totalWatchSeconds).toBe(15_999);
    expect(wrapped.videoCount).toBe(2);
    expect(wrapped.mostRewatchedTitle).toBe("YBS detayları");
    expect(wrapped.strongestEngagementTitle).toBe("YBS detayları");
    expect(wrapped.preparationSeconds).toBe(2_400);
  });

  it("veri yoksa güvenli sıfırlar döner", () => {
    const capsule = monthlyCapsule([], [], now);
    expect(capsule.totalWatchSeconds).toBe(0);
    expect(capsule.monthOverMonthPercent).toBeUndefined();
  });
});
