import type { ContentType, ExplainableScore, UserVideoFeedback } from "../shared/types";
import { clamp, round } from "../shared/utils";

export type EngagementInput = {
  completionRate: number;
  rewatchSeconds: number;
  backwardSeeks: number;
  sessionCount: number;
  endedNaturally: boolean;
  sameChannelContinuation?: boolean;
  earlyAbandoned: boolean;
  feedback?: UserVideoFeedback;
  contentType?: ContentType;
  totalActiveWatchSeconds?: number;
};

export type EngagementResult = ExplainableScore & { engagementScore: number; engagementLabel: string };

export function analyzeEngagement(input: EngagementInput): EngagementResult {
  const factors: string[] = [];
  if (input.feedback?.excludedFromAnalytics) return make(0, ["Analiz dışında bırakıldı."], "high", false);
  if (input.contentType === "livestream") return analyzeLivestreamEngagement(input);
  let score = input.completionRate * 50;
  if (input.completionRate >= .7) factors.push("Yüksek benzersiz tamamlama.");
  if (input.rewatchSeconds >= 30) { score += Math.min(18, input.rewatchSeconds / 20); factors.push("Bölümler yeniden izlendi."); }
  if (input.backwardSeeks > 0) { score += Math.min(10, input.backwardSeeks * 3); factors.push("Geri sarma etkileşimi var."); }
  if (input.sessionCount > 1) { score += Math.min(10, (input.sessionCount - 1) * 4); factors.push("Video yeniden açıldı."); }
  if (input.endedNaturally) { score += 12; factors.push("Video doğal olarak tamamlandı."); }
  if (input.sameChannelContinuation) { score += 5; factors.push("Aynı kanaldan izlemeye devam edildi."); }
  if (input.feedback?.liked === true) { score += 28; factors.push("Kullanıcı videoyu beğendi."); }
  if (input.feedback?.liked === false) { score -= 35; factors.push("Kullanıcı videoyu beğenmedi."); }
  if (input.earlyAbandoned) { score -= 25; factors.push("Video erken bırakıldı."); }
  const confidence = input.feedback?.liked !== undefined ? "high" : input.sessionCount > 1 || input.completionRate >= .3 ? "medium" : "low";
  return make(round(clamp(score)), factors, confidence, factors.length >= 2);
}

function analyzeLivestreamEngagement(input: EngagementInput): EngagementResult {
  const factors: string[] = [];
  const watched = Math.max(0, input.totalActiveWatchSeconds ?? 0);
  let score = Math.min(55, watched / 18);
  if (watched >= 900) factors.push("Canlı yayın en az 15 dakika izlendi.");
  else if (watched >= 180) factors.push(`${Math.round(watched / 60)} dakika canlı izlendi.`);
  else factors.push("Canlı yayın kısa süre izlendi.");
  if (input.rewatchSeconds >= 30) { score += Math.min(12, input.rewatchSeconds / 30); factors.push("Yayının bölümleri yeniden izlendi."); }
  if (input.backwardSeeks > 0) { score += Math.min(8, input.backwardSeeks * 2); factors.push("Geri sarma etkileşimi var."); }
  if (input.sessionCount > 1) { score += Math.min(12, (input.sessionCount - 1) * 5); factors.push("Canlı yayın yeniden açıldı."); }
  if (input.feedback?.liked === true) { score += 28; factors.push("Kullanıcı yayını beğendi."); }
  if (input.feedback?.liked === false) { score -= 35; factors.push("Kullanıcı yayını beğenmedi."); }
  if (watched < 60 && input.earlyAbandoned) { score -= 18; factors.push("Yayından ilk dakika içinde çıkıldı."); }
  const confidence = input.feedback?.liked !== undefined ? "high" : watched >= 180 || input.sessionCount > 1 ? "medium" : "low";
  return make(round(clamp(score)), factors, confidence, factors.length >= 2);
}

function make(score: number, factors: string[], confidence: "low" | "medium" | "high", enoughData: boolean): EngagementResult {
  const engagementLabel = score < 30 ? "Sarmadı" : score < 60 ? "Orta" : score < 80 ? "Sardı" : "Çok sardı";
  return { score, engagementScore: score, label: engagementLabel, engagementLabel, explanation: factors[0] ?? "Henüz yeterli sinyal yok.", contributingFactors: factors, confidence, enoughData } as EngagementResult & { explanation: string };
}
