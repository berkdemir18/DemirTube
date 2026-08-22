import { describe, expect, it } from "vitest";
import { activeWatchSeconds, calculateCompletion, isEarlyAbandonment, mergeSegments } from "../src/analytics/completion";
import { calculateRegretScore } from "../src/analytics/regret-score";
import { calculateChannelAffinity } from "../src/analytics/channel-score";
import { classifyTopics } from "../src/analytics/topic-classifier";
import { durationBucket } from "../src/analytics/duration";
import { calculateKeywordStatistics } from "../src/analytics/keyword-statistics";
import { channelStats, topicStats } from "../src/dashboard/analytics";
import { formatDuration } from "../src/shared/utils";
import { sessionsInPeriod, videosInPeriod, watchTrend } from "../src/analytics/period";
import type { VideoRecord, WatchSession } from "../src/shared/types";
import { resolveVideoMetadata } from "../src/storage/video-repository";
import { classifyContentType } from "../src/analytics/content-type";
import { analyzeVideoIntelligence } from "../src/analytics/video-intelligence";

const video = (overrides: Partial<VideoRecord> = {}): VideoRecord => ({
  videoId: crypto.randomUUID(), title: "Yeni model karşılaştırması", channelName: "Test Kanalı",
  url: "https://www.youtube.com/watch?v=test", durationSeconds: 600, topics: ["Teknoloji"],
  firstSeenAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-01-01T00:10:00Z",
  totalWatchSeconds: 480, totalActiveWatchSeconds: 480, uniqueWatchedSeconds: 480, rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 480 }], completionRate: .8, sessionCount: 1,
  completed: false, regretScore: 10, engagementScore: 70, contentType: "standard", ...overrides
});

const session = (overrides: Partial<WatchSession> = {}): WatchSession => ({
  id: crypto.randomUUID(), videoId: "period-video", startedAt: new Date(2026, 6, 27, 10).toISOString(),
  watchSeconds: 60, maximumPosition: 60, pauseCount: 0, forwardSeekCount: 0, backwardSeekCount: 0,
  tabHiddenCount: 0, playbackSegments: [{ start: 0, end: 60 }], endedNaturally: false, ...overrides
});

describe("izleme hesaplamaları", () => {
  it("örtüşen ve yakın segmentleri birleştirir", () => {
    expect(mergeSegments([{ start: 0, end: 10 }, { start: 10.8, end: 20 }, { start: 40, end: 45 }]))
      .toEqual([{ start: 0, end: 20 }, { start: 40, end: 45 }]);
  });
  it("tamamlanmayı 0–1 aralığında hesaplar", () => {
    expect(calculateCompletion(75, 100)).toBe(.75);
    expect(calculateCompletion(150, 100)).toBe(1);
  });
  it("bir dakikanın altındaki süreyi sıfıra yuvarlamaz", () => {
    expect(formatDuration(12.4)).toBe("12 sn");
    expect(formatDuration(75)).toBe("1 dk");
  });
  it("yalnızca aktif, görünür ve hazır örnekleri sayar", () => {
    expect(activeWatchSeconds([{ elapsed: 2, playing: true, visible: true, ready: true }, { elapsed: 5, playing: false, visible: true, ready: true }, { elapsed: 3, playing: true, visible: false, ready: true }])).toBe(2);
  });
  it("10 saniye altındaki kazara tıklamayı erken terk saymaz", () => {
    expect(isEarlyAbandonment(9, .01)).toBe(false);
    expect(isEarlyAbandonment(48, .04)).toBe(true);
  });
});

describe("davranış analitiği", () => {
  it("belirgin erken çıkışa yüksek pişmanlık puanı verir", () => {
    expect(calculateRegretScore({ title: "ŞOK! Her şey değişti", watchSeconds: 48, durationSeconds: 1440, completionRate: .033, reopened: false, followedByAnotherVideo: true })).toBeGreaterThanOrEqual(80);
    expect(calculateRegretScore({ title: "Yanlışlıkla açıldı", watchSeconds: 5, durationSeconds: 600, completionRate: .01, reopened: false, followedByAnotherVideo: true })).toBe(0);
  });
  it("üç videodan önce kanal skoru üretmez", () => {
    expect(calculateChannelAffinity([video(), video()])).toBeUndefined();
    expect(calculateChannelAffinity([video(), video({ sessionCount: 2 }), video({ completionRate: .9 })])).toBeGreaterThan(60);
  });
  it("aktif oturumu erken çıkış ve kanal güven örneği saymaz", () => {
    const active = video({ totalWatchSeconds: 20, completionRate: .02, isCurrentlyWatching: true });
    expect(topicStats([active])[0].earlyExitRate).toBe(0);
    expect(channelStats([video(), video(), video(), active])[0].affinityScore).toBeDefined();
    expect(calculateChannelAffinity([video(), video(), active])).toBeUndefined();
  });
  it("Türkçe ve İngilizce konu anahtarlarını çoklu sınıflandırır", () => {
    expect(classifyTopics("Beşiktaş yeni transfer analizi", "Futbol TV")).toEqual(expect.arrayContaining(["Futbol", "Beşiktaş"]));
    expect(classifyTopics("GPT ile Python coding", "AI Lab")).toEqual(expect.arrayContaining(["Yapay zekâ", "Programlama"]));
  });
  it("süre sınırlarını doğru kovaya ayırır", () => {
    expect(durationBucket(299)).toBe("0–5 dakika");
    expect(durationBucket(600)).toBe("10–20 dakika");
    expect(durationBucket(2400)).toBe("40+ dakika");
  });
  it("başlık kelimelerinde minimum örnek sayısını uygular", () => {
    const stats = calculateKeywordStatistics([video(), video({ title: "Yeni model açıklandı" }), video({ title: "Bambaşka video" })], 2);
    expect(stats.map((item) => item.keyword)).toEqual(expect.arrayContaining(["yeni", "model"]));
    expect(stats.some((item) => item.keyword === "bambaşka")).toBe(false);
  });
  it("tek örnekli başlık kelimelerini ön analiz için üretebilir", () => {
    expect(calculateKeywordStatistics([video({ title: "Eşsiz başlık kelimesi" })], 1).map((item) => item.keyword))
      .toEqual(expect.arrayContaining(["eşsiz", "başlık", "kelimesi"]));
  });
  it("geçici bilinmeyen kanal değeri doğru kanal bilgisini ezmez", () => {
    const existing = video({ channelName: "Gerçek Kanal", channelId: "UC-test" });
    const resolved = resolveVideoMetadata({
      videoId: existing.videoId, title: existing.title, channelName: "Bilinmeyen kanal", url: existing.url,
      durationSeconds: existing.durationSeconds, topics: existing.topics, contentType: existing.contentType
    }, existing);
    expect(resolved.channelName).toBe("Gerçek Kanal");
    expect(resolved.channelId).toBe("UC-test");
  });
});

describe("video türü ve format zekâsı", () => {
  it("metadata sinyallerinden podcast ve müzik türlerini ayırır", () => {
    expect(classifyContentType({ title: "Girişimcilik Podcast Bölüm 12", durationSeconds: 4_200 })).toBe("podcast");
    expect(classifyContentType({ title: "Official Music Video", channelName: "Artist VEVO", durationSeconds: 210 })).toBe("music");
  });
  it("yerel video zekâsı öğretici formatı ve fragmanı tanır", () => {
    const tutorial = analyzeVideoIntelligence({
      videoId: "tutorial", title: "React ile birlikte proje yapalım: adım adım", channelName: "Kod Kanalı",
      url: "https://youtube.com/watch?v=tutorial", durationSeconds: 1_200, topics: ["Programlama"], contentType: "standard"
    });
    const trailer = analyzeVideoIntelligence({
      videoId: "trailer", title: "Yeni dizi resmi fragman", channelName: "Stüdyo",
      url: "https://youtube.com/watch?v=trailer", durationSeconds: 120, topics: ["Dizi ve film"], contentType: "standard"
    });
    expect(tutorial.format).toBe("step_by_step");
    expect(tutorial.formatLabel).toBe("Uygulamalı rehber");
    expect(trailer.format).toBe("trailer");
  });
});

describe("analiz dönemi", () => {
  const now = new Date(2026, 6, 27, 12);
  const sessions = [
    session(),
    session({ id: "week", startedAt: new Date(2026, 6, 21, 10).toISOString(), watchSeconds: 120 }),
    session({ id: "month", startedAt: new Date(2026, 5, 28, 10).toISOString(), watchSeconds: 180 }),
    session({ id: "old", startedAt: new Date(2026, 5, 27, 10).toISOString(), watchSeconds: 240 })
  ];

  it("günlük, haftalık ve aylık kayıt sınırlarını doğru uygular", () => {
    expect(sessionsInPeriod(sessions, "day", now).map((item) => item.id)).toEqual([sessions[0].id]);
    expect(sessionsInPeriod(sessions, "week", now)).toHaveLength(2);
    // month artık "son 30 gün" değil, takvim ayı (Temmuz 2026: 1-31).
    expect(sessionsInPeriod(sessions, "month", now)).toHaveLength(2);
  });

  it("dönem kartlarını tüm zamanlar toplamıyla şişirmez", () => {
    const records = [video({ videoId: "period-video", totalWatchSeconds: 999, completionRate: .99, durationSeconds: 600 })];
    const snapshot = videosInPeriod(records, sessions, "day", now);
    expect(snapshot[0].totalWatchSeconds).toBe(60);
    expect(snapshot[0].completionRate).toBe(.1);
    expect(snapshot[0].sessionCount).toBe(1);
  });

  it("günlük grafiği dört saatlik dilimlere yerleştirir", () => {
    const trend = watchTrend(sessions, "day", now);
    expect(trend).toHaveLength(6);
    expect(trend[2]).toEqual({ label: "08–12", seconds: 60 });
  });
});
