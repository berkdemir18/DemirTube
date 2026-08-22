import { describe, expect, it } from "vitest";
import { makeVideoDecision } from "../src/analytics/decision-assistant";
import { calculatePreference } from "../src/analytics/preference-score";
import { toScoringMetadata } from "../src/analytics/scoring-metadata";
import { DEFAULT_SETTINGS } from "../src/shared/constants";
import { channelKey, normalizeChannelName } from "../src/shared/utils";
import type { VideoMetadata, VideoRecord } from "../src/shared/types";

const historyVideo = (index: number): VideoRecord => ({
  videoId: `history-${index}`,
  title: `Rust ile mikro servis ${index}`,
  channelName: "Kod Kanalı",
  url: `https://youtube.com/watch?v=history-${index}`,
  durationSeconds: 900,
  topics: ["Programlama"],
  firstSeenAt: "2026-07-27T10:00:00Z",
  lastSeenAt: "2026-07-28T10:00:00Z",
  totalWatchSeconds: 720,
  totalActiveWatchSeconds: 720,
  uniqueWatchedSeconds: 720,
  rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 720 }],
  completionRate: 0.8,
  sessionCount: 1,
  completed: false,
  regretScore: 10,
  engagementScore: 70,
  contentType: "standard",
});

const history = Array.from({ length: 10 }, (_, index) => historyVideo(index));

/** Keşfet kartının görebildiği her şey: başlık, kanal satırı ve süre rozeti. */
const feedMetadata: VideoMetadata = {
  videoId: "candidate",
  title: "Rust ile kendi web sunucunu yaz",
  // YouTube kart satırı kanal adını görüntüleme sayısıyla birlikte veriyor.
  channelName: normalizeChannelName("Kod Kanalı • 128 B görüntüleme • 2 gün önce"),
  url: "https://www.youtube.com/watch?v=candidate",
  durationSeconds: 1_500,
  topics: ["Programlama"],
  contentType: "standard",
};

/** İzleme sayfasında ayrıca açıklama, hashtag ve bölüm işaretleri okunuyor. */
const watchMetadata: VideoMetadata = {
  ...feedMetadata,
  channelName: "Kod Kanalı\n\n  ",
  durationSeconds: 1_500.42,
  topics: ["Programlama", "Oyun", "Eğlence"],
  contentType: "podcast",
  description: "Bu bölümde konuk sohbet ediyoruz. Podcast bölüm 12 · oyun ve eğlence üzerine uzun sohbet.",
  hashtags: ["#podcast", "#oyun", "#eglence"],
  chapterCount: 6,
};

describe("keşfet kartı ile izleme paneli aynı puanı gösterir", () => {
  it("aynı video için karttaki ve paneldeki puan birebir eşleşir", () => {
    const feed = makeVideoDecision(feedMetadata, history, [], DEFAULT_SETTINGS, []);
    const panel = makeVideoDecision(watchMetadata, history, [], DEFAULT_SETTINGS, []);

    expect(panel.score).toBe(feed.score);
    expect(panel.decisionLabel).toBe(feed.decisionLabel);
    expect(panel.recommendation).toBe(feed.recommendation);
    expect(panel.goalFit).toBe(feed.goalFit);
    expect(panel.scoreContributions).toEqual(feed.scoreContributions);
    expect(panel.channelTrust).toEqual(feed.channelTrust);
    expect(panel.preference.score).toBe(feed.preference.score);
  });

  it("açıklama ve altyazı yalnızca içerik analizini zenginleştirir, puanı kaydırmaz", () => {
    const panel = calculatePreference(watchMetadata, history);
    const feed = calculatePreference(feedMetadata, history);

    expect(panel.score).toBe(feed.score);
    // Panelin içerik sekmesi zengin analizi göstermeye devam eder.
    expect(panel.contentIntelligence.format).not.toBe(panel.intelligence.format);
    expect(feed.contentIntelligence).toBe(feed.intelligence);
  });

  it("kart satırındaki kanal adı geçmişteki kanalla eşleşir", () => {
    const feed = makeVideoDecision(feedMetadata, history, [], DEFAULT_SETTINGS, []);
    expect(feed.channelTrust.sampleCount).toBe(history.length);
    expect(feed.channelTrust.score).toBeDefined();
  });

  it("büyük geçmişte karar süresi panel zaman aşımının çok altında kalır", () => {
    // Regresyon: kişisel model her kayıt için tüm geçmişi tarıyordu (O(n²)).
    // 1.200 videoda tek karar ~60 sn sürüyor, panel 7 sn'de "Puanlama yanıt
    // vermedi" hatasına düşüyordu.
    const large = Array.from({ length: 1_200 }, (_, index) => ({
      ...historyVideo(index),
      channelName: `Kanal ${index % 30}`,
      title: `Video ${index} nasil yapilir adim adim rehber inceleme`,
    }));
    const startedAt = performance.now();
    const decision = makeVideoDecision(watchMetadata, large, [], DEFAULT_SETTINGS, []);
    const elapsed = performance.now() - startedAt;

    expect(decision.score).toBeDefined();
    expect(elapsed).toBeLessThan(3_000);
  }, 60_000);

  it("ortak taban başlık, kanal ve süreyi tek biçime indirir", () => {
    const scoring = toScoringMetadata(watchMetadata);
    expect(scoring.channelName).toBe("Kod Kanalı");
    expect(scoring.durationSeconds).toBe(1_500);
    expect(scoring.description).toBeUndefined();
    expect(scoring.transcriptAnalysis).toBeUndefined();
    expect(scoring.topics).toEqual(toScoringMetadata(feedMetadata).topics);
    expect(channelKey("@Kod Kanalı")).toBe(channelKey("Kod Kanalı"));
  });
});
