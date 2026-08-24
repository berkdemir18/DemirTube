import { describe, expect, it } from "vitest";
import { calculateTimeCost } from "../src/analytics/time-cost";
import type { VideoRecord } from "../src/shared/types";

function video(partial: Partial<VideoRecord> & { videoId: string }): VideoRecord {
  return {
    title: `${partial.videoId} başlık`,
    channelName: "Kanal A",
    url: `https://www.youtube.com/watch?v=${partial.videoId}`,
    durationSeconds: 600,
    topics: ["Teknoloji"],
    firstSeenAt: "2026-07-01T10:00:00.000Z",
    lastSeenAt: "2026-07-01T10:00:00.000Z",
    totalWatchSeconds: 600,
    totalActiveWatchSeconds: 600,
    uniqueWatchedSeconds: 600,
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    completionRate: .5,
    sessionCount: 1,
    completed: false,
    regretScore: 0,
    engagementScore: 50,
    contentType: "standard",
    ...partial
  } as VideoRecord;
}

describe("zaman maliyeti", () => {
  it("maliyeti aktif süre × pişmanlık ağırlığı olarak hesaplar", () => {
    const report = calculateTimeCost([
      video({ videoId: "a", totalActiveWatchSeconds: 600, regretScore: 100 }),
      video({ videoId: "b", totalActiveWatchSeconds: 600, regretScore: 50 }),
      video({ videoId: "c", totalActiveWatchSeconds: 600, regretScore: 0 })
    ]);

    expect(report.activeSeconds).toBe(1800);
    expect(report.costSeconds).toBe(900);
    expect(report.costPercent).toBe(50);
    expect(report.highRegretCount).toBe(1);
  });

  it("ölçülemeyen, analiz dışı ve izlenmekte olan kayıtları hesaba katmaz", () => {
    const report = calculateTimeCost([
      video({ videoId: "ok", totalActiveWatchSeconds: 200, regretScore: 100 }),
      video({ videoId: "süresiz", durationSeconds: 0, totalActiveWatchSeconds: 900, regretScore: 100 }),
      video({ videoId: "dışlanan", excludedFromAnalytics: true, totalActiveWatchSeconds: 900, regretScore: 100 }),
      video({ videoId: "izleniyor", isCurrentlyWatching: true, totalActiveWatchSeconds: 900, regretScore: 100 }),
      video({ videoId: "izlenmemiş", totalActiveWatchSeconds: 0, regretScore: 100 })
    ]);

    expect(report.measuredVideoCount).toBe(1);
    expect(report.costSeconds).toBe(200);
  });

  it("maliyeti kanal ve konu bazında paylara böler", () => {
    const report = calculateTimeCost([
      video({ videoId: "a", channelName: "Pahalı Kanal", topics: ["Eğlence"], totalActiveWatchSeconds: 600, regretScore: 100 }),
      video({ videoId: "b", channelName: "Pahalı Kanal", topics: ["Eğlence"], totalActiveWatchSeconds: 200, regretScore: 100 }),
      video({ videoId: "c", channelName: "Ucuz Kanal", topics: ["Eğitim"], totalActiveWatchSeconds: 200, regretScore: 100 })
    ]);

    expect(report.channels[0]).toMatchObject({ key: "Pahalı Kanal", costSeconds: 800, videoCount: 2, sharePercent: 80 });
    expect(report.channels[1]).toMatchObject({ key: "Ucuz Kanal", costSeconds: 200 });
    expect(report.topics[0]).toMatchObject({ key: "Eğlence", sharePercent: 80 });
    expect(report.topChannelSharePercent).toBe(100);
  });

  it("konusu olmayan videoyu 'Diğer' kovasında toplar", () => {
    const report = calculateTimeCost([video({ videoId: "a", topics: [], regretScore: 80 })]);

    expect(report.topics[0].key).toBe("Diğer");
  });

  it("maliyeti en yüksek videoları puan ve gerekçeyle sıralar", () => {
    const report = calculateTimeCost([
      video({ videoId: "küçük", totalActiveWatchSeconds: 100, regretScore: 50 }),
      video({ videoId: "büyük", totalActiveWatchSeconds: 900, regretScore: 90, regretFactors: ["Başlıkta yanıltıcı ifade var."] }),
      // Maliyeti 30 saniyenin altında kalan kayıt listeye girmez.
      video({ videoId: "önemsiz", totalActiveWatchSeconds: 100, regretScore: 10 })
    ]);

    expect(report.worstVideos.map((item) => item.videoId)).toEqual(["büyük", "küçük"]);
    expect(report.worstVideos[0].factors).toEqual(["Başlıkta yanıltıcı ifade var."]);
  });

  it("örnek azken düşük, geri bildirimli geniş örnekte yüksek güven verir", () => {
    const few = calculateTimeCost([video({ videoId: "a", regretScore: 40 })]);
    expect(few.confidence).toBe("low");

    const many = Array.from({ length: 30 }, (_, index) => video({ videoId: `v${index}`, regretScore: 40 }));
    const feedback = ["v1", "v2", "v3"].map((videoId) => ({ videoId, clickbait: true, updatedAt: "2026-07-01T10:00:00.000Z" }));
    expect(calculateTimeCost(many, feedback).confidence).toBe("high");
  });

  it("veri yokken ve maliyet sıfırken sahte kesinlik üretmez", () => {
    expect(calculateTimeCost([]).verdict).toBe("Bu dönemde ölçülebilir kayıt yok.");
    expect(calculateTimeCost([]).costSeconds).toBe(0);

    const clean = calculateTimeCost([video({ videoId: "a", regretScore: 0 })]);
    expect(clean.costSeconds).toBe(0);
    expect(clean.verdict).toBe("Bu dönemde ölçülebilir bir zaman kaybı görünmüyor.");
  });
});
