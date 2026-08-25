import { describe, expect, it } from "vitest";
import { analyzeSelectionBias, discriminationAuc, discriminationLabel } from "../src/analytics/selection-bias";
import type { FeedImpression, VideoRecord } from "../src/shared/types";

const SHOWN_AT = "2026-07-01T10:00:00.000Z";
const WATCHED_AT = "2026-07-01T12:00:00.000Z";

function impression(videoId: string, score: number, extra: Partial<FeedImpression> = {}): FeedImpression {
  return {
    videoId,
    title: `${videoId} başlık`,
    channelName: "Kanal",
    score,
    estimatedCompletion: score,
    modelVersion: "adaptive-v5",
    firstShownAt: SHOWN_AT,
    lastShownAt: SHOWN_AT,
    shownCount: 1,
    ...extra,
  };
}

function watched(videoId: string, lastSeenAt = WATCHED_AT): VideoRecord {
  return {
    videoId,
    title: `${videoId} başlık`,
    channelName: "Kanal",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationSeconds: 900,
    topics: ["Teknoloji"],
    firstSeenAt: lastSeenAt,
    lastSeenAt,
    totalWatchSeconds: 500,
    totalActiveWatchSeconds: 500,
    uniqueWatchedSeconds: 500,
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    completionRate: .6,
    sessionCount: 1,
    completed: false,
    regretScore: 10,
    engagementScore: 50,
    contentType: "standard",
  } as VideoRecord;
}

describe("ayırt etme gücü (AUC)", () => {
  it("kusursuz ayrımda 1, tam terste 0 verir", () => {
    expect(discriminationAuc([80, 90, 95], [10, 20, 30])).toBe(1);
    expect(discriminationAuc([10, 20, 30], [80, 90, 95])).toBe(0);
  });

  it("beraberlikleri ortalama sırayla sayar: aynı puanlar 0.5 verir", () => {
    // Tüm kartlar aynı puanı aldıysa puan hiçbir şey ayırt etmiyordur.
    expect(discriminationAuc([50, 50, 50], [50, 50, 50])).toBeCloseTo(.5, 5);
  });

  it("bir taraf boşsa ölçüm yapmaz", () => {
    expect(discriminationAuc([], [10, 20])).toBe(.5);
    expect(discriminationAuc([10, 20], [])).toBe(.5);
  });
});

describe("seçim yanlılığı raporu", () => {
  /** Yüksek puanlılar açılmış, düşük puanlılar atlanmış: model iyi çalışıyor. */
  const goodImpressions = [
    ...Array.from({ length: 12 }, (_, index) => impression(`acilan${index}`, 85)),
    ...Array.from({ length: 12 }, (_, index) => impression(`atlanan${index}`, 30)),
  ];
  const goodHistory = Array.from({ length: 12 }, (_, index) => watched(`acilan${index}`));

  it("modelin seçimleri öngörme gücünü ölçer", () => {
    const report = analyzeSelectionBias(goodImpressions, goodHistory);

    expect(report.enoughData).toBe(true);
    expect(report.shown).toBe(24);
    expect(report.opened).toBe(12);
    expect(report.openRate).toBe(50);
    expect(report.discrimination).toBe(1);
    expect(report.openedAverageScore).toBe(85);
    expect(report.skippedAverageScore).toBe(30);
  });

  it("puan seçimle ilgisizse bunu gizlemez", () => {
    // Açılanlar ve atlananlar birebir aynı puan dağılımından geliyor: dörtlü
    // bloklar halinde 50/60/70/80 puanlar, bloklar dönüşümlü olarak açılıyor.
    const mixed = Array.from({ length: 24 }, (_, index) => impression(`v${index}`, 50 + (index % 4) * 10));
    const history = Array.from({ length: 24 }, (_, index) => index)
      .filter((index) => Math.floor(index / 4) % 2 === 0)
      .map((index) => watched(`v${index}`));
    const report = analyzeSelectionBias(mixed, history);

    expect(report.discrimination).toBeGreaterThan(.35);
    expect(report.discrimination).toBeLessThan(.65);
    expect(discriminationLabel(report.discrimination)).toContain("öngörmüyor");
  });

  it("gösterimden ÖNCE izlenmiş videoyu 'öneri tuttu' saymaz", () => {
    // Kullanıcı videoyu kart gösterilmeden önce izlemişse bu bir öneri başarısı değildir.
    const history = [watched("acilan0", "2026-06-01T09:00:00.000Z")];
    const report = analyzeSelectionBias(goodImpressions, history);

    expect(report.opened).toBe(0);
  });

  it("yüksek puanlı ama açılmamış kartları kör nokta olarak sayar", () => {
    const report = analyzeSelectionBias(goodImpressions, []);
    expect(report.overconfident).toBe(12);
    // Hiç açılan yoksa ölçüm anlamlı değildir; rapor bunu itiraf eder.
    expect(report.enoughData).toBe(false);
  });

  it("az veriyle sonuç uydurmaz", () => {
    const report = analyzeSelectionBias([impression("a", 90), impression("b", 20)], [watched("a")]);
    expect(report.enoughData).toBe(false);
    expect(report.confidence).toBe("low");
  });

  it("puansız kayıtlar ve boş girdi çökertmez", () => {
    expect(analyzeSelectionBias([], []).shown).toBe(0);
    expect(analyzeSelectionBias([impression("a", 0, { score: undefined })], []).shown).toBe(0);
  });

  it("puan bantlarına göre açılma oranını raporlar", () => {
    const report = analyzeSelectionBias(goodImpressions, goodHistory);
    const high = report.bands.find((band) => band.label === "80+")!;
    const low = report.bands.find((band) => band.label === "0–40")!;

    expect(high.openRate).toBe(100);
    expect(low.openRate).toBe(0);
  });
});
