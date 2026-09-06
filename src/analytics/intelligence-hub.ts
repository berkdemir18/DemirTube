import type { Confidence, UserVideoFeedback, VideoRecord, WatchSession } from "../shared/types";
import { derivePersonalModel, strongestModelSignal } from "./personal-model";
import { hasProspectivePrediction, calibrationFromHistory, type BacktestResult } from "./model-calibration";
import { skillPercent } from "./model-training";
import { analyzeVideoIntelligence } from "./video-intelligence";
import { evidenceLevel } from "./evidence";
import { normalizeText, round } from "../shared/utils";

export type SessionIntelligence = {
  mode: "learning" | "research" | "entertainment" | "shorts_loop" | "browsing" | "mixed" | "idle";
  label: string;
  explanation: string;
  videoCount: number;
  watchSeconds: number;
  confidence: Confidence;
};

export type KnowledgeNode = { topic: string; videoCount: number; watchSeconds: number; depth: number };
export type KnowledgeEdge = { source: string; target: string; strength: number };
export type KnowledgeMap = { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] };

export type RevisitRecommendation = {
  video: VideoRecord;
  reason: string;
  score: number;
};

export type PredictionAccuracy = {
  sampleCount: number;
  accuracyRate: number;
  meanAbsoluteError: number;
  confidence: Confidence;
  strongestSignal: string;
  improving: boolean;
  /**
   * Sistematik sapma: pozitifse model olduğundan düşük, negatifse olduğundan
   * yüksek tahmin ediyor. Modelin kendini düzeltmek için kullandığı sayı bu.
   */
  systematicBias: number;
  /** Tahmine uygulanan düzeltme (puan). */
  appliedCorrection: number;
  /**
   * Dürüst sınama: ağırlıkların görmediği dilimde ölçülen hata. Yukarıdaki
   * `meanAbsoluteError` yalnızca gerçekten izlenmiş videoların snapshot'larını
   * karşılaştırır ve model bu kayıtları zaten görmüştür; asıl soru "model, hep
   * kişisel ortalamayı söyleyen taban modelden iyi mi?" idi ve bugüne kadar
   * hiçbir yerde cevaplanmıyordu.
   */
  backtest: BacktestResult;
  /** Modelin taban çizgisine göre sildiği hata payı (%). Negatif = tabandan kötü. */
  skillPercent: number;
  /** Model taban çizgisini gerçekten yeniyor mu? */
  beatsBaseline: boolean;
  /** Ağırlıklar geçmişten arandı mı, yoksa öncülde mi kalındı? */
  weightsLearned: boolean;
};

export function analyzeCurrentSession(
  videos: VideoRecord[],
  sessions: WatchSession[],
  now = new Date(),
  windowMinutes = 60
): SessionIntelligence {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  const recent = sessions.filter((session) => new Date(session.startedAt).getTime() >= cutoff);
  const ids = new Set(recent.map((session) => session.videoId));
  const sessionVideos = videos.filter((video) => ids.has(video.videoId));
  const watchSeconds = recent.reduce((sum, session) => sum + session.watchSeconds, 0);
  if (!recent.length) return {
    mode: "idle", label: "Aktif oturum yok", explanation: `Son ${windowMinutes} dakikada izleme kaydı oluşmadı.`,
    videoCount: 0, watchSeconds: 0, confidence: "low"
  };
  const shorts = sessionVideos.filter((video) => video.contentType === "short").length;
  const profiles = sessionVideos.map((video) => analyzeVideoIntelligence(video, videos));
  const learning = profiles.filter((profile) => profile.valueType === "learning").length;
  const dominantTopic = new Map<string, number>();
  for (const video of sessionVideos) for (const topic of video.topics) dominantTopic.set(topic, (dominantTopic.get(topic) ?? 0) + 1);
  const topTopicCount = [...dominantTopic.values()].toSorted((a, b) => b - a)[0] ?? 0;
  let mode: SessionIntelligence["mode"] = "mixed";
  let label = "Karma izleme";
  let explanation = "Farklı amaç ve konulardaki videolar arasında geçiş yapıyorsun.";
  if (shorts >= 4 && shorts / Math.max(sessionVideos.length, 1) >= .65) {
    mode = "shorts_loop"; label = "Shorts döngüsü";
    explanation = `${shorts} kısa video peş peşe açıldı; seçimlerin hızlı tüketim biçimine kaymış görünüyor.`;
  } else if (sessionVideos.length >= 3 && topTopicCount / sessionVideos.length >= .7) {
    mode = "research"; label = "Araştırma oturumu";
    explanation = "Aynı konu çevresinde art arda videolar açtın; karşılaştırmalı araştırma yapıyor olabilirsin.";
  } else if (learning / Math.max(profiles.length, 1) >= .65) {
    mode = "learning"; label = "Öğrenme oturumu";
    explanation = "İzlediğin videoların çoğu öğretici veya bilgi yoğunluğu taşıyor.";
  } else if (profiles.filter((profile) => profile.valueType === "entertainment").length / Math.max(profiles.length, 1) >= .65) {
    mode = "entertainment"; label = "Eğlence oturumu";
    explanation = "Mevcut seçimlerin ağırlıklı olarak eğlence odaklı.";
  } else if (sessionVideos.length >= 5 && watchSeconds / sessionVideos.length < 45) {
    mode = "browsing"; label = "Kararsız gezinme";
    explanation = "Çok sayıda videoyu kısa süre açıp değiştirdin; aradığın içeriği henüz bulamamış olabilirsin.";
  }
  return {
    mode, label, explanation, videoCount: ids.size, watchSeconds,
    confidence: evidenceLevel(recent.length, 3, 8).confidence
  };
}

export function buildKnowledgeMap(videos: VideoRecord[]): KnowledgeMap {
  const eligible = videos.filter((video) => !video.excludedFromAnalytics);
  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();
  for (const video of eligible) {
    for (const topic of video.topics) {
      const current = nodes.get(topic) ?? { topic, videoCount: 0, watchSeconds: 0, depth: 0 };
      current.videoCount += 1;
      current.watchSeconds += video.totalActiveWatchSeconds;
      current.depth += video.completionRate * (video.transcriptAnalysis?.informationDensity ?? 50) / 100;
      nodes.set(topic, current);
    }
    const topics = [...new Set(video.topics)].toSorted();
    for (let left = 0; left < topics.length; left += 1) for (let right = left + 1; right < topics.length; right += 1) {
      const key = `${topics[left]}::${topics[right]}`;
      const edge = edges.get(key) ?? { source: topics[left], target: topics[right], strength: 0 };
      edge.strength += 1;
      edges.set(key, edge);
    }
  }
  return {
    nodes: [...nodes.values()]
      .map((node) => ({ ...node, depth: round(node.depth / Math.max(node.videoCount, 1) * 100) }))
      .toSorted((a, b) => b.watchSeconds - a.watchSeconds),
    edges: [...edges.values()].toSorted((a, b) => b.strength - a.strength)
  };
}

function queryDateCutoff(query: string, now: Date) {
  if (/bugün|today/.test(query)) return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (/son iki hafta|last two weeks/.test(query)) return now.getTime() - 14 * 86_400_000;
  if (/geçen ay|son ay|last month/.test(query)) return now.getTime() - 30 * 86_400_000;
  if (/bu hafta|this week/.test(query)) return now.getTime() - 7 * 86_400_000;
  return undefined;
}

export function semanticVideoSearch(
  rawQuery: string,
  videos: VideoRecord[],
  feedback: UserVideoFeedback[] = [],
  now = new Date()
) {
  const query = normalizeText(rawQuery.trim());
  if (!query) return [];
  const cutoff = queryDateCutoff(query, now);
  const feedbackMap = new Map(feedback.map((item) => [item.videoId, item]));
  const tokens = query.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((token) => token.length >= 3);
  return videos.map((video) => {
    const user = feedbackMap.get(video.videoId);
    const intelligence = analyzeVideoIntelligence(video, videos);
    const haystack = normalizeText([
      video.title, video.channelName, video.description, video.topics.join(" "),
      video.hashtags?.join(" "), video.transcriptAnalysis?.keywords.join(" "), intelligence.intentLabel
    ].filter(Boolean).join(" "));
    let score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 5 : 0), 0);
    if (/beğendiğim|sevdigim|liked/.test(query)) score += user?.liked === true ? 20 : -20;
    if (/tamamlamadığım|yarım|unfinished/.test(query)) score += video.completionRate < .9 ? 15 : -15;
    if (/pişman|regret/.test(query)) score += video.regretScore >= 60 ? 15 : -10;
    if (/uzun|long/.test(query)) score += video.durationSeconds >= 1_200 ? 10 : -5;
    if (/short|kısa/.test(query)) score += video.contentType === "short" ? 10 : -5;
    if (/öğren|eğitim|ders/.test(query)) score += intelligence.valueType === "learning" ? 12 : -5;
    if (cutoff) score += new Date(video.lastSeenAt).getTime() >= cutoff ? 10 : -20;
    return { video, score };
  }).filter((item) => item.score > 0).toSorted((a, b) => b.score - a.score || b.video.lastSeenAt.localeCompare(a.video.lastSeenAt));
}

export function revisitRecommendations(videos: VideoRecord[], now = new Date()): RevisitRecommendation[] {
  return videos
    .filter((video) => !video.excludedFromAnalytics && !video.isCurrentlyWatching)
    .map((video) => {
      const ageDays = Math.max(0, (now.getTime() - new Date(video.lastSeenAt).getTime()) / 86_400_000);
      let score = 0;
      const reasons: string[] = [];
      if (video.engagementScore >= 60 && video.completionRate < .9) { score += 35; reasons.push("sardı ama yarım kaldı"); }
      if (video.rewatchSeconds >= 20) { score += 25; reasons.push("bazı bölümlerini tekrar izledin"); }
      if (video.transcriptAnalysis?.available && video.transcriptAnalysis.informationDensity >= 55) { score += 15; reasons.push("bilgi yoğunluğu yüksek"); }
      if (ageDays >= 14 && video.engagementScore >= 50) { score += 10; reasons.push(`${Math.round(ageDays)} gündür açmadın`); }
      if (video.regretScore >= 60) score -= 40;
      return { video, score, reason: reasons.join(" · ") };
    })
    .filter((item) => item.score > 20)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function predictionAccuracy(videos: VideoRecord[]): PredictionAccuracy {
  const samples = videos.filter(hasProspectivePrediction).toSorted((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt));
  const errors = samples.map((video) =>
    Math.abs((video.predictionSnapshot?.estimatedCompletion ?? 0) - video.completionRate * 100)
  );
  // Doğruluk ve sapma model ile aynı kaynaktan okunur; ekranda gösterilen sayı
  // ile modelin kendini düzeltirken kullandığı sayı ayrışmasın.
  const calibration = calibrationFromHistory(videos);
  const meanAbsoluteError = errors.length ? errors.reduce((sum, error) => sum + error, 0) / errors.length : 0;
  const accurate = errors.filter((error) => error <= 20).length;
  const midpoint = Math.floor(errors.length / 2);
  const first = errors.slice(0, midpoint);
  const recent = errors.slice(midpoint);
  const average = (items: number[]) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : 100;
  const model = derivePersonalModel(videos);
  return {
    sampleCount: samples.length,
    accuracyRate: round(accurate / Math.max(samples.length, 1) * 100),
    meanAbsoluteError: round(meanAbsoluteError),
    confidence: evidenceLevel(samples.length, 5, 15).confidence,
    strongestSignal: strongestModelSignal(model).label,
    improving: samples.length >= 6 && average(recent) < average(first),
    systematicBias: calibration.medianSignedError,
    appliedCorrection: calibration.correction,
    backtest: model.benchmark,
    skillPercent: skillPercent(model.benchmark),
    beatsBaseline: model.benchmark.sampleCount >= 5 && model.benchmark.skill > 0,
    weightsLearned: model.weightsLearned
  };
}
