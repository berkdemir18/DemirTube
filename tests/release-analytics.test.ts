import { describe, expect, it } from "vitest";
import { calculatePlaybackMetrics } from "../src/analytics/completion";
import { classifyContentType } from "../src/analytics/content-type";
import { matchCustomTopics } from "../src/analytics/custom-topics";
import { analyzeEngagement } from "../src/analytics/engagement-score";
import { analyzeRegret } from "../src/analytics/regret-score";
import { titleTokens } from "../src/analytics/keyword-statistics";
import { timeOfDayAnalytics, weekdayWeekendAnalytics } from "../src/analytics/time-analytics";
import { generateWeeklyReport } from "../src/analytics/weekly-report";
import { checksumPayload, validateImport } from "../src/storage/data-service";
import { APP_VERSION, DEFAULT_KEYWORD_RULES, DEFAULT_SETTINGS } from "../src/shared/constants";
import type { AppData, VideoRecord, WatchSession } from "../src/shared/types";
import { evidenceLevel } from "../src/analytics/evidence";
import { selectionReasons } from "../src/analytics/selection-reasons";
import { shortsAnalytics } from "../src/analytics/shorts-analytics";
import { calendarAnalytics } from "../src/analytics/calendar-analytics";
import { feedbackQueue } from "../src/analytics/feedback-queue";
import { classifyTopics } from "../src/analytics/topic-classifier";
import { analyzeVideoIntelligence, autonomousInsights, evaluateWatchOutcome, formatOf, VIDEO_FORMAT_OPTIONS } from "../src/analytics/video-intelligence";
import { analyzeTranscript } from "../src/analytics/transcript-analysis";
import { derivePersonalModel } from "../src/analytics/personal-model";
import { calculatePreference } from "../src/analytics/preference-score";
import {
  analyzeCurrentSession, buildKnowledgeMap, predictionAccuracy, revisitRecommendations, semanticVideoSearch
} from "../src/analytics/intelligence-hub";
import { fingerprintCloudInput, groqCompletionPayload, groqModelPath, normalizeGroqAnalysis } from "../src/cloud/groq-service";
import { playerResponseIsLive } from "../src/content/video-metadata";
import { captionTracksFromSource, parseJson3Transcript, parseTimedTextXml, rankCaptionTracks } from "../src/content/transcript-reader";
import { captionTracksFromPlayerResponse, isAllowedCaptionUrl, videoIdFromPlayerResponse } from "../src/content/caption-tracks";

const session = (id: string, start: number, end: number, watch = end - start): WatchSession => ({
  id, videoId: "video", startedAt: "2026-07-27T10:00:00Z", watchSeconds: watch,
  maximumPosition: end, pauseCount: 0, forwardSeekCount: 0, backwardSeekCount: 0,
  tabHiddenCount: 0, playbackSegments: [{ start, end }], endedNaturally: false, active: false
});
const video: VideoRecord = {
  videoId: "video", title: "Yapay zeka rehberi", channelName: "Test Kanalı", url: "https://youtube.com/watch?v=video",
  durationSeconds: 120, topics: ["Yapay zekâ"], firstSeenAt: "2026-07-27T10:00:00Z", lastSeenAt: "2026-07-27T10:02:00Z",
  totalWatchSeconds: 60, totalActiveWatchSeconds: 60, uniqueWatchedSeconds: 60, rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 60 }], completionRate: .5, sessionCount: 1, completed: false,
  regretScore: 10, engagementScore: 50, contentType: "standard"
};

describe("0.7 Groq analiz güvenlik katmanı", () => {
  it("model adındaki sağlayıcı ayracını URL içinde korur", () => {
    expect(groqModelPath("openai/gpt-oss-20b")).toBe("models/openai/gpt-oss-20b");
    expect(groqModelPath("openai/gpt-oss-120b")).toBe("models/openai/gpt-oss-120b");
  });

  it("model yanıtını güvenli ve sınırlı kayıt biçimine dönüştürür", () => {
    const result = normalizeGroqAnalysis({
      summary: "  Faydalı bir eğitim videosu.  ",
      keyPoints: ["Birinci nokta", 12, "İkinci nokta"],
      titleVerdict: "fulfilled",
      valueAssessment: "Uygulamalı değer sunuyor.",
      recommendation: "Bölümler halinde izle.",
      risks: ["Bazı örnekler güncel olmayabilir."],
      confidence: "high"
    }, "openai/gpt-oss-120b", "abc123", new Date("2026-07-27T12:00:00Z"));
    expect(result).toMatchObject({
      provider: "groq",
      summary: "Faydalı bir eğitim videosu.",
      keyPoints: ["Birinci nokta", "İkinci nokta"],
      titleVerdict: "fulfilled",
      confidence: "high",
      inputFingerprint: "abc123"
    });
  });

  it("GPT-OSS için katı JSON şeması ve yeterli çıktı bütçesi kullanır", () => {
    const payload = groqCompletionPayload("openai/gpt-oss-120b", [
      { role: "user", content: "{}" }
    ]);
    expect(payload.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: { additionalProperties: false }
      }
    });
    expect(payload.response_format.json_schema.schema.required).toHaveLength(7);
    expect(payload.max_completion_tokens).toBeGreaterThanOrEqual(1_000);
    expect(payload.reasoning_effort).toBe("low");
  });

  it("önbellek parmak izini içerik değişince yeniler", () => {
    const base = {
      videoId: "video",
      title: "TypeScript rehberi",
      channelName: "Test",
      topics: ["Programlama"],
      durationSeconds: 600,
      contentType: "standard" as const
    };
    expect(fingerprintCloudInput(base)).toBe(fingerprintCloudInput({ ...base }));
    expect(fingerprintCloudInput(base)).not.toBe(fingerprintCloudInput({ ...base, title: "React rehberi" }));
  });
});

describe("0.3 benzersiz izleme modeli", () => {
  it("aynı bölüm iki oturumda izlense de tamamlama oranını şişirmez", () => {
    const result = calculatePlaybackMetrics([session("a", 0, 60), session("b", 0, 60)], 120);
    expect(result.totalActiveWatchSeconds).toBe(120);
    expect(result.uniqueWatchedSeconds).toBe(60);
    expect(result.rewatchSeconds).toBe(60);
    expect(result.completionRate).toBe(.5);
  });
  it("örtüşen oturumları birleştirip video süresinde sınırlar", () => {
    const result = calculatePlaybackMetrics([session("a", 0, 80), session("b", 50, 140, 90)], 100);
    expect(result.uniquePlaybackSegments).toEqual([{ start: 0, end: 100 }]);
    expect(result.completionRate).toBe(1);
    expect(result.rewatchSeconds).toBe(70);
  });
  it("oynatma hızı nedeniyle aktif süre ile medya süresini tekrar izleme sanmaz", () => {
    const slow = calculatePlaybackMetrics([session("slow", 0, 30, 60)], 120);
    const fast = calculatePlaybackMetrics([session("fast", 0, 90, 60)], 120);
    expect(slow.rewatchSeconds).toBe(0);
    expect(fast.rewatchSeconds).toBe(0);
  });
});

describe("0.3 zaman, rapor ve yedek doğrulaması", () => {
  it("yerel saate ve hafta içi/sonuna göre oturumları kovalar", () => {
    const monday = session("monday", 0, 60);
    monday.startedAt = new Date(2026, 6, 27, 10).toISOString();
    expect(timeOfDayAnalytics([video], [monday]).find((item) => item.label === "Sabah")?.videoCount).toBe(1);
    expect(weekdayWeekendAnalytics([video], [monday]).find((item) => item.label === "Hafta içi")?.totalWatchSeconds).toBe(60);
  });
  it("deterministik haftalık rapor üretir", () => {
    const watched = session("weekly", 0, 60);
    watched.startedAt = "2026-07-27T10:00:00Z";
    const report = generateWeeklyReport([video], [watched], new Date("2026-07-27T12:00:00Z"));
    expect(report.videoCount).toBe(1);
    expect(report.text).toContain("1 video");
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
  it("checksum bozulmuş v2 yedeğini reddeder", () => {
    const base = {
      version: 2 as const, schemaVersion: 2 as const, appVersion: APP_VERSION, exportedAt: "2026-07-27T12:00:00Z",
      counts: { videos: 1, sessions: 0, feedback: 0, customTopics: 0 }, videos: [video], sessions: [],
      feedback: [], customTopics: [], keywordRules: DEFAULT_KEYWORD_RULES, weeklyReports: [], diagnostics: [], settings: DEFAULT_SETTINGS
    };
    const valid: AppData = { ...base, checksum: checksumPayload(base) };
    expect(validateImport(valid).valid).toBe(true);
    expect(validateImport({ ...valid, videos: [] }).valid).toBe(false);
  });
});

describe("0.4 kişisel içgörü katmanı", () => {
  it("örnek sayısını düşük, orta ve yüksek güvene dönüştürür", () => {
    expect(evidenceLevel(2).confidence).toBe("low");
    expect(evidenceLevel(5).confidence).toBe("medium");
    expect(evidenceLevel(12).confidence).toBe("high");
  });
  it("video seçimini kanal, konu, süre, başlık ve tür sinyalleriyle açıklar", () => {
    const history = Array.from({ length: 4 }, (_, index) => ({ ...video, videoId: `history-${index}`, engagementScore: 80 }));
    const reasons = selectionReasons({ ...video, videoId: "current" }, history);
    expect(reasons.map((item) => item.key)).toEqual(expect.arrayContaining(["channel", "topic", "duration", "title", "content_type"]));
    expect(reasons[0].score).toBeGreaterThan(0);
  });
  it("Shorts davranışını standart videolardan ayırır", () => {
    const short = { ...video, videoId: "short", contentType: "short" as const };
    const shortSession = { ...session("short-session", 0, 45), videoId: "short" };
    const stats = shortsAnalytics([short, video], [shortSession]);
    expect(stats.count).toBe(1);
    expect(stats.totalWatchSeconds).toBe(45);
  });
  it("takvimde gün bazında süre, konu ve video kimliği üretir", () => {
    const watched = session("calendar", 0, 60);
    watched.startedAt = "2026-07-27T10:00:00Z";
    const days = calendarAnalytics([video], [watched], 1, new Date("2026-07-27T12:00:00Z"));
    expect(days[0]).toMatchObject({ watchSeconds: 60, videoCount: 1, videoIds: ["video"] });
  });
  it("belirsiz ve geri bildirimsiz kayıtları doğrulama kuyruğuna alır", () => {
    const uncertain = { ...video, topics: ["Diğer"], contentType: "unknown" as const, regretConfidence: "low" as const };
    expect(feedbackQueue([uncertain], [])[0].reason).toBe("Konusu belirsiz");
    expect(feedbackQueue([uncertain], [{ videoId: uncertain.videoId, liked: true, manualTopics: ["Eğitim"], manualContentType: "standard", clickbait: false, updatedAt: "" }])).toHaveLength(1);
  });
  it("haftalık rapora Shorts, pişmanlık, bilinçli seçim ve konu değişimlerini ekler", () => {
    const short = {
      ...video,
      contentType: "short" as const,
      predictionSnapshot: {
        estimatedCompletion: 55,
        confidence: "medium" as const,
        modelVersion: "adaptive-v2",
        predictedAt: "2026-07-27T09:55:00Z",
        signals: ["konu"]
      }
    };
    const watched = session("report-new", 0, 60); watched.startedAt = "2026-07-27T10:00:00Z";
    const report = generateWeeklyReport([short], [watched], new Date("2026-07-27T12:00:00Z"), [{ videoId: "video", liked: true, updatedAt: "" }]);
    expect(report.shortsWatchSeconds).toBe(60);
    expect(report.consciousSelectionRate).toBe(100);
    expect(report.topicChanges?.[0].topic).toBe("Yapay zekâ");
    expect(report.discoveryInsights).toHaveLength(4);
    expect(report.predictionAccuracy).toMatchObject({ sampleCount: 1, nearCount: 1, meanError: 5 });
  });
});

describe("0.5 yerel video zekâsı", () => {
  it("başlık, açıklama, hashtag ve bölümlerden videonun amacını ve derinliğini çıkarır", () => {
    const intelligence = analyzeVideoIntelligence({
      videoId: "smart", title: "React nasıl öğrenilir? Adım adım rehber", channelName: "Kod Okulu",
      url: "https://youtube.com/watch?v=smart", durationSeconds: 2_100, topics: ["Programlama"],
      contentType: "standard", description: "TypeScript ile uygulamalı tutorial #react #typescript",
      hashtags: ["#react", "#typescript"], chapterCount: 7
    });
    expect(intelligence.intent).toBe("tutorial");
    expect(intelligence.depthLabel).toBe("Derinlemesine");
    expect(intelligence.valueType).toBe("learning");
    expect(intelligence.signals.length).toBeGreaterThanOrEqual(2);
  });
  it("başlıktan güçlü, açıklama ve konu bağlamından destekleyici video türü sinyalleri üretir", () => {
    const gameplay = analyzeVideoIntelligence({
      videoId: "game", title: "Mr. Robot Bölüm 2 oynanış", channelName: "Oyun Kanalı",
      url: "https://youtube.com/watch?v=game", durationSeconds: 1_200, topics: ["Oyun"],
      contentType: "standard", description: "Hikâye görevlerini tamamladığımız gameplay serisi."
    });
    const sports = analyzeVideoIntelligence({
      videoId: "sports", title: "Derbi maç özeti ve goller", channelName: "Spor",
      url: "https://youtube.com/watch?v=sports", durationSeconds: 600, topics: ["Futbol"],
      contentType: "standard", description: "Haftanın önemli pozisyonları."
    });
    expect(gameplay.intent).toBe("gameplay");
    expect(gameplay.valueType).toBe("entertainment");
    expect(sports.intent).toBe("sports");
  });
  it("keskin vaatli başlığı açıklanabilir risk sinyali olarak gösterir", () => {
    const intelligence = analyzeVideoIntelligence({
      videoId: "risk", title: "ŞOK! Bunu kimse bilmiyor, her şey değişti", channelName: "Kanal",
      url: "https://youtube.com/watch?v=risk", durationSeconds: 600, topics: ["Diğer"], contentType: "standard"
    });
    expect(intelligence.titlePatterns).toContain("yüksek merak dili");
    expect(intelligence.signals).toContainEqual(expect.objectContaining({ tone: "warning" }));
  });
  it("izleme sonucu oluşmadan kesin hüküm vermez, yeterli davranıştan sonra sonucu açıklar", () => {
    const intelligence = analyzeVideoIntelligence(video);
    expect(evaluateWatchOutcome({ ...video, isCurrentlyWatching: true }, intelligence)).toBeUndefined();
    expect(evaluateWatchOutcome({ ...video, engagementScore: 82, regretScore: 10, completed: true }, intelligence)?.tone).toBe("positive");
    expect(evaluateWatchOutcome({ ...video, engagementScore: 15, regretScore: 78 }, intelligence)?.tone).toBe("warning");
  });
  it("dashboard için davranışa dayalı otonom örüntüler üretir", () => {
    const history = [
      { ...video, videoId: "one", title: "Python nasıl öğrenilir rehber", engagementScore: 85 },
      { ...video, videoId: "two", title: "React adım adım tutorial", engagementScore: 75 },
      { ...video, videoId: "three", title: "ŞOK her şey değişti", regretScore: 80 }
    ];
    const insights = autonomousInsights(history);
    expect(insights.length).toBeGreaterThanOrEqual(2);
    expect(insights.map((item) => item.key)).toContain("value-balance");
  });
  it("özel konu kurallarını açıklama ve hashtag bağlamında da eşleştirir", () => {
    const rule = { id: "space", name: "Uzay", keywords: ["mars"], channels: [], priority: 1, enabled: true, createdAt: "", updatedAt: "" };
    expect(matchCustomTopics("Yeni görev", "Bilim", [rule], "Kızıl gezegen Mars yolculuğu #uzay")).toEqual(["Uzay"]);
  });
  it("canlı yayını tamamlanma yerine akış süresi ve anlık bağlamla analiz eder", () => {
    const liveMetadata = {
      videoId: "live", title: "Haftalık gündem canlı yayını", channelName: "Haber Kanalı",
      url: "https://youtube.com/watch?v=live", durationSeconds: 0, topics: ["Haber"],
      contentType: "livestream" as const
    };
    const intelligence = analyzeVideoIntelligence(liveMetadata);
    expect(intelligence.depthLabel).toBe("Akış süresi değişken");
    expect(intelligence.attentionLabel).toBe("Canlı odak");
    expect(intelligence.summary).toContain("tamamlanma yerine aktif izleme süresi");
    expect(calculatePreference(liveMetadata, Array.from({ length: 5 }, (_, index) => ({
      ...video, videoId: `live-history-${index}`, contentType: "livestream" as const,
      durationSeconds: 0, totalActiveWatchSeconds: 900
    }))).estimatedCompletion).toBeUndefined();
  });
});

describe("kanıta dayalı kişisel sinyaller", () => {
  it("eşleşmeyen konu, süre ve başlığı ölçülmüş yüzde gibi göstermez", () => {
    const history = Array.from({ length: 6 }, (_, index) => ({
      ...video,
      videoId: `unrelated-${index}`,
      title: `Futbol gündemi ${index}`,
      channelName: `Spor ${index}`,
      topics: ["Futbol"],
      durationSeconds: 3_600
    }));
    const result = calculatePreference({
      videoId: "target-intelligence", title: "React bileşen mimarisi", channelName: "Kod",
      url: "https://youtube.com/watch?v=target", durationSeconds: 600,
      topics: ["Programlama"], contentType: "standard"
    }, history);
    expect(result.enoughData).toBe(true);
    expect(result.signals).toMatchObject({
      channel: undefined,
      topic: undefined,
      duration: undefined,
      keyword: undefined
    });
    expect(result.signalEvidence?.topic).toContain("nötr öncül");
  });
});

describe("0.6 akıllı yardımcı", () => {
  it("YouTube oynatıcı yanıtından altyazı izini ve JSON/XML segmentlerini ayrıştırır", () => {
    const tracks = captionTracksFromSource(
      `<script>var player={"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test","languageCode":"tr"}]}}}</script>`
    );
    expect(tracks[0]?.languageCode).toBe("tr");
    expect(parseJson3Transcript({ events: [{ tStartMs: 2_500, segs: [{ utf8: "Merhaba " }, { utf8: "dünya" }] }] }))
      .toEqual([{ startSeconds: 2.5, text: "Merhaba dünya" }]);
    expect(parseTimedTextXml(`<transcript><text start="3.2">İlk bölüm</text><p t="7100">İkinci bölüm</p></transcript>`))
      .toEqual([{ startSeconds: 3.2, text: "İlk bölüm" }, { startSeconds: 7.1, text: "İkinci bölüm" }]);
  });
  it("canlı oynatıcı nesnesindeki altyazı izini video kimliğiyle birlikte okur", () => {
    const playerResponse = {
      videoDetails: { videoId: "abc123xyz00" },
      captions: { playerCaptionsTracklistRenderer: {
        captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=abc123xyz00", languageCode: "tr" }]
      } }
    };
    expect(videoIdFromPlayerResponse(playerResponse)).toBe("abc123xyz00");
    expect(captionTracksFromPlayerResponse(playerResponse)[0]?.languageCode).toBe("tr");
  });
  it("altyazı izlerinde Türkçe ve insan üretimi olanları önce dener", () => {
    const ranked = rankCaptionTracks([
      { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en", languageCode: "en" },
      { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=tr&kind=asr", languageCode: "tr", kind: "asr" },
      { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=tr", languageCode: "tr" },
    ]);
    expect(ranked.map((track) => `${track.languageCode}:${track.kind ?? "human"}`))
      .toEqual(["tr:human", "tr:asr", "en:human"]);
  });
  it("service worker altyazı proxy'sini yalnızca YouTube timedtext adresiyle sınırlar", () => {
    expect(isAllowedCaptionUrl("https://www.youtube.com/api/timedtext?v=test&lang=tr")).toBe(true);
    expect(isAllowedCaptionUrl("https://www.youtube.com/watch?v=test")).toBe(false);
    expect(isAllowedCaptionUrl("https://example.com/api/timedtext?v=test")).toBe(false);
    expect(isAllowedCaptionUrl("http://www.youtube.com/api/timedtext?v=test")).toBe(false);
  });
  it("altyazıdan anahtar kavram, bilgi yoğunluğu ve başlık vaadi çıkarır; ham metni sonuçta tutmaz", () => {
    const analysis = analyzeTranscript([
      { startSeconds: 0, text: "TypeScript ile React uygulaması kuruyoruz ve bileşen mimarisini anlatıyoruz." },
      { startSeconds: 45, text: "React bileşenleri, TypeScript tipleri ve uygulama mimarisi üzerinde çalışıyoruz." },
      { startSeconds: 90, text: "Son bölümde TypeScript ile güvenli React bileşeni yazıyoruz." }
    ], "TypeScript ile React uygulaması nasıl yapılır?", "Uygulamalı React rehberi", "tr");
    expect(analysis.available).toBe(true);
    expect(analysis.keywords).toEqual(expect.arrayContaining(["typescript", "react"]));
    expect(analysis.titlePromiseCoverage).toBeGreaterThan(30);
    expect(analysis).not.toHaveProperty("transcript");
  });
  it("kişisel modelin ağırlıklarını geçmiş güvenilirliğine göre normalize eder", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      ...video,
      videoId: `adaptive-${index}`,
      channelName: index < 5 ? "Güçlü Kanal" : `Kanal ${index}`,
      completionRate: index < 5 ? .9 : .2 + index / 100
    }));
    const model = derivePersonalModel(history);
    expect(Object.values(model.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 2);
    expect(model.sampleCount).toBe(10);
    expect(model.confidence).toBe("medium");
  });
  it("doğrulanmış video formatını kişisel tahmin sinyali olarak kullanır", () => {
    const history = [
      ...Array.from({ length: 6 }, (_, index) => ({
        ...video,
        videoId: `format-${index}`,
        channelName: `Kanal ${index}`,
        topics: [`Konu ${index}`],
        videoFormat: "step_by_step" as const,
        completionRate: .85,
        engagementScore: 80
      })),
      // Karşılaştırma tabanı: sinyal, kullanıcının kendi ortalamasına göre ölçülür.
      // Geçmişin tamamı aynı formatta olsaydı "bu format daha iyi" diyecek kanıt olmazdı.
      ...Array.from({ length: 6 }, (_, index) => ({
        ...video,
        videoId: `other-format-${index}`,
        channelName: `Diğer kanal ${index}`,
        topics: [`Başka konu ${index}`],
        videoFormat: "news_update" as const,
        completionRate: .15,
        engagementScore: 25
      }))
    ];
    const result = calculatePreference({
      videoId: "next-format",
      title: "Birlikte uygulama geliştirelim",
      channelName: "Yeni Kanal",
      url: "https://youtube.com/watch?v=next-format",
      durationSeconds: 900,
      topics: ["Yeni konu"],
      contentType: "standard",
      videoFormat: "step_by_step"
    }, history);
    expect(result.signals?.format).toBeGreaterThan(70);
    expect(result.model.weights.format).toBeGreaterThan(0);
    expect(result.signalEvidence?.format).toContain("6 aynı formattaki");
  });
  it("ayrıntılı formatları özelden genele doğru ayırır ve tümünü seçim listesine koyar", () => {
    const metadata = {
      videoId: "format-detail", title: "React ile canlı kodlama: birlikte proje geliştirelim",
      channelName: "Kod", url: "https://youtube.com/watch?v=format-detail",
      durationSeconds: 2_400, topics: ["Programlama"], contentType: "long_form" as const
    };
    expect(formatOf(metadata, { intent: "tutorial" }).format).toBe("coding_build");
    expect(formatOf({ ...metadata, title: "Yeni telefonu kutudan çıkarıyoruz: unboxing" }, { intent: "review" }).format).toBe("unboxing");
    expect(VIDEO_FORMAT_OPTIONS.length).toBeGreaterThanOrEqual(35);
    expect(new Set(VIDEO_FORMAT_OPTIONS.map((option) => option.value)).size).toBe(VIDEO_FORMAT_OPTIONS.length);
  });
  it("güçlü ve zayıf kişisel eşleşmeleri dar bir nötr banda sıkıştırmaz", () => {
    const history = [
      ...Array.from({ length: 6 }, (_, index) => ({
        ...video, videoId: `liked-${index}`, channelName: "Sevilen Kanal",
        title: `React proje geliştirme ${index}`, topics: ["Programlama"],
        durationSeconds: 600, videoFormat: "coding_build" as const,
        completionRate: .95, totalActiveWatchSeconds: 570, uniqueWatchedSeconds: 570,
        engagementScore: 92, regretScore: 2
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        ...video, videoId: `disliked-${index}`, channelName: "Zayıf Kanal",
        title: `Ünlü tepki videosu ${index}`, topics: ["Eğlence"],
        durationSeconds: 3_600, videoFormat: "reaction" as const,
        completionRate: .08, totalActiveWatchSeconds: 120, uniqueWatchedSeconds: 120,
        engagementScore: 8, regretScore: 80
      }))
    ];
    const liked = calculatePreference({
      videoId: "liked-next", title: "React ile canlı kodlama projesi", channelName: "Sevilen Kanal",
      url: "https://youtube.com/watch?v=liked-next", durationSeconds: 600,
      topics: ["Programlama"], contentType: "standard", videoFormat: "coding_build"
    }, history);
    const disliked = calculatePreference({
      videoId: "disliked-next", title: "Yeni tepki videosu", channelName: "Zayıf Kanal",
      url: "https://youtube.com/watch?v=disliked-next", durationSeconds: 3_600,
      topics: ["Eğlence"], contentType: "standard", videoFormat: "reaction"
    }, history);
    expect((liked.score ?? 0) - (disliked.score ?? 100)).toBeGreaterThanOrEqual(30);
    expect(liked.score).toBeGreaterThan(70);
    expect(disliked.score).toBeLessThan(40);
  });
  it("arka arkaya kısa videoları Shorts döngüsü olarak tanır", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const shorts = Array.from({ length: 5 }, (_, index) => ({ ...video, videoId: `short-${index}`, contentType: "short" as const }));
    const recent = shorts.map((item, index) => ({
      ...session(`session-${index}`, 0, 20),
      videoId: item.videoId,
      startedAt: new Date(now.getTime() - index * 60_000).toISOString()
    }));
    expect(analyzeCurrentSession(shorts, recent, now).mode).toBe("shorts_loop");
  });
  it("konu bağlantılarından bilgi haritası üretir", () => {
    const map = buildKnowledgeMap([
      { ...video, videoId: "map-1", topics: ["Yapay zekâ", "Programlama"] },
      { ...video, videoId: "map-2", topics: ["Programlama", "Eğitim"] }
    ]);
    expect(map.nodes.map((node) => node.topic)).toContain("Programlama");
    expect(map.edges).toContainEqual(expect.objectContaining({ source: "Programlama", target: "Yapay zekâ" }));
  });
  it("doğal dil aramasında beğeni, yarım bırakma ve konu niyetini uygular", () => {
    const liked = { ...video, videoId: "liked", completionRate: .4, topics: ["Yapay zekâ"], title: "Yapay zekâ rehberi" };
    const other = { ...video, videoId: "other", completionRate: 1, topics: ["Oyun"], title: "Oyun videosu" };
    const result = semanticVideoSearch("Beğendiğim ama tamamlamadığım yapay zekâ videoları", [liked, other], [
      { videoId: "liked", liked: true, updatedAt: "" }
    ]);
    expect(result[0].video.videoId).toBe("liked");
  });
  it("sardı fakat yarım kalan videoyu yeniden izleme adayı yapar", () => {
    const candidate = { ...video, engagementScore: 82, completionRate: .45, regretScore: 10 };
    expect(revisitRecommendations([candidate], new Date("2026-08-27T12:00:00Z"))[0].reason).toContain("yarım kaldı");
  });
  it("saklanan ön tahminlerle gerçek tamamlanma arasındaki doğruluğu ölçer", () => {
    const predicted = Array.from({ length: 6 }, (_, index) => ({
      ...video,
      videoId: `prediction-${index}`,
      completionRate: .7,
      predictionSnapshot: {
        estimatedCompletion: 72 + index,
        confidence: "medium" as const,
        modelVersion: "adaptive-v1",
        predictedAt: "",
        signals: ["konu"]
      }
    }));
    const accuracy = predictionAccuracy(predicted);
    expect(accuracy.sampleCount).toBe(6);
    expect(accuracy.accuracyRate).toBe(100);
    expect(accuracy.meanAbsoluteError).toBeLessThan(10);
  });
});

describe("0.3 geri bildirim ve sınıflandırma", () => {
  it("kazara tıklama pişmanlık olarak sayılmaz", () => {
    expect(analyzeRegret({ title: "ŞOK", totalActiveWatchSeconds: 15, durationSeconds: 600, completionRate: .02, reopened: false, followedByAnotherVideo: true, feedback: { videoId: "v", accidentalClick: true, updatedAt: "" } }).score).toBe(0);
  });
  it("açık beğeni sarılma puanını yükseltir", () => {
    const base = { completionRate: .5, rewatchSeconds: 0, backwardSeeks: 0, sessionCount: 1, endedNaturally: false, earlyAbandoned: false };
    expect(analyzeEngagement({ ...base, feedback: { videoId: "v", liked: true, updatedAt: "" } }).score)
      .toBeGreaterThan(analyzeEngagement(base).score);
  });
  it("short, canlı yayın, podcast ve uzun formatı ayırır", () => {
    expect(classifyContentType({ path: "/shorts/id", durationSeconds: 45 })).toBe("short");
    expect(classifyContentType({ path: "/watch", title: "Kısa bir duyuru", durationSeconds: 45 })).toBe("standard");
    expect(classifyContentType({ path: "/watch", title: "Yeni özellik #shorts", durationSeconds: 55 })).toBe("short");
    expect(classifyContentType({ isLive: true })).toBe("livestream");
    expect(classifyContentType({
      path: "/watch",
      title: "YouTube canlı yayın nasıl yapılır?",
      description: "Canlı yayın kurulumu için kayıtlı eğitim videosu.",
      durationSeconds: 600
    })).toBe("standard");
    expect(classifyContentType({ title: "Yeni bölüm", channelName: "Haftalık Podcast", description: "Konukla uzun sohbet", durationSeconds: 1800 })).toBe("podcast");
    expect(classifyContentType({ title: "Yeni Şarkı (Official Music Video)", channelName: "Sanatçı VEVO", durationSeconds: 240 })).toBe("music");
    expect(classifyContentType({ durationSeconds: 3600 })).toBe("long_form");
  });
  it("oynatıcı mikroformatından aktif ve bitmiş canlı yayını ayırır", () => {
    expect(playerResponseIsLive({
      videoDetails: { videoId: "current", isLiveContent: true },
      microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true } } }
    }, "current")).toBe(true);
    expect(playerResponseIsLive({
      videoDetails: { videoId: "current", isLiveContent: true },
      microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { endTimestamp: "2026-07-30T12:00:00Z" } } },
      playabilityStatus: { liveStreamability: {} }
    }, "current")).toBe(false);
  });
  it("SPA geçişinde önceki videonun canlı durumunu yeni videoya taşımaz", () => {
    expect(playerResponseIsLive({
      videoDetails: { videoId: "previous-live", isLiveContent: true },
      microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true } } },
      playabilityStatus: { liveStreamability: {} }
    }, "current-normal")).toBe(false);
  });
  it("canlı yayın puanlarında klasik tamamlanma cezasını kullanmaz", () => {
    const regret = analyzeRegret({
      title: "Canlı yayın", totalActiveWatchSeconds: 600, durationSeconds: 0, completionRate: 0,
      reopened: false, followedByAnotherVideo: false, contentType: "livestream"
    });
    const engagement = analyzeEngagement({
      completionRate: 0, rewatchSeconds: 0, backwardSeeks: 0, sessionCount: 1,
      endedNaturally: false, earlyAbandoned: false, contentType: "livestream", totalActiveWatchSeconds: 600
    });
    expect(regret.contributingFactors).not.toContain("Benzersiz tamamlama çok düşük.");
    expect(regret.regretScore).toBeLessThan(30);
    expect(engagement.engagementScore).toBeGreaterThan(0);
    expect(engagement.contributingFactors.join(" ")).toContain("dakika canlı izlendi");
  });
  it("başlık, kanal ve açıklama bağlamıyla birden fazla konuyu önceliklendirir", () => {
    expect(classifyTopics("Mars görevi ve yapay zekâ", "NASA", "astronomi belgeseli")).toEqual(expect.arrayContaining(["Bilim", "Yapay zekâ"]));
    expect(classifyTopics("Bitcoin yatırım rehberi", "Finans Okulu", "ekonomi ve borsa")[0]).toBe("Finans");
  });
  it("özel konuyu kelime veya kanaldan eşleştirir", () => {
    const rule = { id: "1", name: "Uzay", keywords: ["mars"], channels: ["NASA"], priority: 1, enabled: true, createdAt: "", updatedAt: "" };
    expect(matchCustomTopics("Mars görevi", "Bilim", [rule])).toEqual(["Uzay"]);
    expect(matchCustomTopics("Yeni görev", "NASA Türkçe", [rule])).toEqual(["Uzay"]);
  });
  it("tek kelimelerin yanında iki ve üç kelimelik cümlecikler üretir", () => {
    expect(titleTokens("Yeni yapay zeka modeli")).toEqual(expect.arrayContaining(["yapay zeka", "yapay zeka modeli"]));
  });
});
