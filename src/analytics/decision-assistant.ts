import { calculatePreference } from "./preference-score";
import { toScoringMetadata } from "./scoring-metadata";
import type { PersonalModel } from "./personal-model";
import { buildTopicMemory, type TopicMemory } from "./topic-memory";
import type { Settings, UserVideoFeedback, VideoDecision, VideoMetadata, VideoRecord, WatchSession } from "../shared/types";
import { channelKey, clamp, round } from "../shared/utils";

const words = (value: string) =>
  new Set(value.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 2));
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((word) => { if (b.has(word)) shared += 1; });
  return shared / Math.max(1, Math.min(a.size, b.size));
};

// video-intelligence.ts'deki "educational" konu listesiyle aynı tutulur.
const LEARNING_TOPICS: ReadonlySet<string> = new Set(["Eğitim", "Programlama", "Yapay zekâ", "Siber güvenlik"]);

export function makeVideoDecision(
  fullMetadata: VideoMetadata,
  history: VideoRecord[],
  feedback: UserVideoFeedback[],
  settings: Settings,
  _sessions: WatchSession[] = [],   // bütçe hesabında kullanılmıyor artık
  precomputedModel?: PersonalModel,
  precomputedTopicMemory?: TopicMemory
): VideoDecision {
  const topicMemory = precomputedTopicMemory ?? buildTopicMemory(history);
  const preference = calculatePreference(fullMetadata, history, precomputedModel, topicMemory);
  // Karar da puanla aynı ortak tabandan okunur; keşfet kartı ile panel arasında
  // etiket ve kanal eşleşmesi ayrışmasın.
  const metadata = toScoringMetadata(fullMetadata, topicMemory);
  const metadataChannel = channelKey(metadata.channelName);

  // ── Kanal güveni ────────────────────────────────────────────────────────────
  const channelVideos = history.filter((video) => channelKey(video.channelName) === metadataChannel);
  const channelCompletion = channelVideos.length
    ? channelVideos.reduce((sum, video) => sum + video.completionRate, 0) / channelVideos.length * 100
    : 0;
  const clickbaitCount = feedback.filter(
    (item) => item.clickbait && channelVideos.some((video) => video.videoId === item.videoId)
  ).length;
  const channelScore = channelVideos.length >= 3
    ? round(clamp(channelCompletion - clickbaitCount * 12), 0)
    : undefined;
  const channelTrust = {
    score: channelScore,
    label: channelScore !== undefined
      ? channelScore >= 65 ? "Geçmişinde iyi çalışmış" : "Geçmişinde zayıf kalmış"
      : "Kanal verisi yetersiz",
    evidence: channelVideos.length
      ? `${channelVideos.length} önceki video · ortalama tamamlama %${round(channelCompletion, 0)}`
      : "Bu kanal için geçmiş oluşmadı.",
    sampleCount: channelVideos.length,
  };

  // ── Özgünlük ────────────────────────────────────────────────────────────────
  const titleOverlap = history
    .map((video) => overlap(words(metadata.title), words(video.title)))
    .sort((a, b) => b - a)[0] ?? 0;
  const noveltyScore = history.length >= 5 ? round((1 - titleOverlap) * 100, 0) : undefined;
  const novelty = {
    score: noveltyScore,
    label: noveltyScore === undefined
      ? "Karşılaştırma verisi yetersiz"
      : titleOverlap > 0.55 ? "Benzer başlık bulundu" : "Benzer başlık bulunmadı",
    evidence: noveltyScore === undefined
      ? `Başlık yeniliği için en az 5 geçmiş video gerekli; şu an ${history.length} var.`
      : titleOverlap > 0.55
        ? "Başlık geçmişte izlediklerinle belirgin biçimde örtüşüyor."
        : `${history.length} geçmiş başlık içinde güçlü bir tekrar eşleşmesi yok.`,
    sampleCount: history.length,
  };

  // ── Amaç uyumu ──────────────────────────────────────────────────────────────
  // Bug 1 düzeltmesi: timeFit artık bütçe tabanlı değil; sabit bir değer.
  // Bütçe kısıtlaması izleme tavsiyesini etkilemiyor.
  const timeFit = 75; // nötr sabit; save/skip kararını etkilemez

  const intent = preference.intelligence.valueType;
  const goalFit: number = (() => {
    switch (settings.watchIntent) {
      case "learn":
      case "research":
        return intent === "learning" ? 92 : intent === "mixed" ? 62 : 38;
      case "focus":
        // Odak modunda çok uzun video biraz düşürülür ama "skip" ettirilmez
        return metadata.durationSeconds && metadata.durationSeconds > 3600 ? 60 : 82;
      case "relax":
        if (metadata.durationSeconds > 1_200) return 42;
        return intent === "entertainment" ? 90 : intent === "mixed" ? 72 : 58;
      case "open":
      default: {
        // Serbest izlemede geçmiş dağılımına göre dinamik: öğrenme ağırlıklıysa öğrenmeye puan ver
        const learningRatio = history.length
          ? history.filter((video) => video.topics.some((topic) => LEARNING_TOPICS.has(topic))).length / history.length
          : 0.5;
        return intent === "learning" && learningRatio > 0.4 ? 82 : 72;
      }
    }
  })();

  // ── Nihai skor ──────────────────────────────────────────────────────────────
  // Kişisel modelin dağılımını koru. İzleme amacı ortalama alıp puanları tekrar
  // 50-70 bandına sıkıştırmak yerine en fazla yaklaşık ±5 puanlık düzeltme yapar.
  const score = preference.enoughData
    ? round(clamp((preference.score ?? 50) + (goalFit - 50) * 0.12, 0))
    : undefined;

  const scoreContributions: VideoDecision["scoreContributions"] = [];
  if (score !== undefined) {
    const weights = preference.model.weights;
    const candidates: Array<[VideoDecision["scoreContributions"][number]["key"], string, number | undefined, number, string]> = [
      ["channel", "Kanal geçmişi", preference.signals?.channel, weights.channel, preference.signalEvidence?.channel ?? "Kanal kanıtı oluşmadı."],
      ["topic", "Konu uyumu", preference.signals?.topic, weights.topic, preference.signalEvidence?.topic ?? "Konu kanıtı oluşmadı."],
      ["duration", "Süre uygunluğu", preference.signals?.duration, weights.duration, preference.signalEvidence?.duration ?? "Süre kanıtı oluşmadı."],
      ["title", "Başlık benzerliği", preference.signals?.keyword, weights.title, preference.signalEvidence?.keyword ?? "Başlık kanıtı oluşmadı."],
      ["format", "Video formatı", preference.signals?.format, weights.format, preference.signalEvidence?.format ?? "Format kanıtı oluşmadı."],
      ["intent", "İzleme modu", goalFit, 0.12, `Seçili amaç için uyum ${goalFit}/100.`],
    ];
    candidates.forEach(([key, label, value, weight, evidence]) => {
      if (value === undefined) return;
      scoreContributions.push({ key, label, points: round((value - 50) * weight, 0), evidence });
    });
    // Katkıların 50 puanlık nötr başlangıçtan nihai skora tam olarak ulaşmasını sağla.
    const residual = score - 50 - scoreContributions.reduce((sum, item) => sum + item.points, 0);
    const dominant = scoreContributions.toSorted((a, b) => Math.abs(b.points) - Math.abs(a.points))[0];
    if (dominant) dominant.points += residual;
  }

  // Bug 1 düzeltmesi: timeFit artık save/skip kararını tetiklemiyor
  const warning = preference.intelligence.signals.some((signal) => signal.tone === "warning");
  const recommendation = warning || (score !== undefined && score < 38)
    ? "skip"
    : noveltyScore !== undefined && noveltyScore < 35 ? "save" : "watch";

  const decisionLabel: VideoDecision["decisionLabel"] = score === undefined
    ? "Veri yetersiz"
    : recommendation === "skip"
      ? "Dikkatli seç"
      : noveltyScore !== undefined && noveltyScore >= 75 && score >= 45
        ? "Yeni keşif"
        : score >= 72
          ? "Güçlü eşleşme"
          : score >= 48
            ? "Uyumlu seçim"
            : "Dikkatli seç";
  const expectedCompletion = preference.estimatedCompletion ?? 100;
  const estimatedActiveMinutes = metadata.durationSeconds > 0
    ? Math.max(1, round(metadata.durationSeconds * expectedCompletion / 100 / 60, 0))
    : 0;

  const intentLabel = {
    open: "Serbest izleme",
    learn: "Öğrenme",
    research: "Araştırma",
    focus: "Odak",
    relax: "Rahatlama",
  }[settings.watchIntent] ?? "Serbest izleme";

  const reasons = [
    `Seçili izleme amacı: ${intentLabel}.`,
    channelTrust.evidence,
    novelty.evidence,
    preference.enoughData
      ? `Kişisel tercih skoru ${score}/100; ${preference.model.sampleCount} geçmiş videoya dayanıyor.`
      : "Kişisel puan gösterilmiyor; en az 5 geçmiş video gerekli.",
  ];

  return {
    preference,
    score,
    recommendation,
    goalFit,
    timeFit,
    channelTrust,
    novelty,
    scoreContributions,
    decisionLabel,
    estimatedActiveMinutes,
    reasons
  };
}
