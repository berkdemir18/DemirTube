import { CLICKBAIT_TERMS } from "../shared/constants";
import type { ContentType, ExplainableScore, LeaveReason, UserVideoFeedback } from "../shared/types";
import { clamp, normalizeText, round } from "../shared/utils";

export type RegretInput = {
  title: string;
  totalActiveWatchSeconds: number;
  durationSeconds: number;
  completionRate: number;
  reopened: boolean;
  followedByAnotherVideo: boolean;
  endedNaturally?: boolean;
  active?: boolean;
  feedback?: UserVideoFeedback;
  leaveReason?: LeaveReason;
  contentType?: ContentType;
};

export type RegretResult = ExplainableScore & { regretScore: number; regretLabel: string };

export function analyzeRegret(input: RegretInput): RegretResult {
  const factors: string[] = [];
  const feedback = input.feedback;
  if (feedback?.excludedFromAnalytics || feedback?.accidentalClick || input.leaveReason === "accidental") {
    return result(0, factors.concat(feedback?.excludedFromAnalytics ? "Analiz dışında bırakıldı." : "Kazara açılış olarak işaretlendi."), "high", false);
  }
  if (input.active) return result(0, ["Video hâlâ izleniyor."], "low", false);
  if (input.totalActiveWatchSeconds < 10 && feedback?.clickbait !== true) {
    return result(0, ["10 saniyenin altındaki açılış puanlanmadı."], "low", false);
  }
  const reason = input.leaveReason ?? feedback?.reason;
  if (feedback?.clickbait !== true && reason !== "misleading_title") {
    if (reason === "answer_found") return result(0, ["Kullanıcı aradığı cevabı buldu."], "high", true);
    if (reason === "already_knew" || reason === "no_time") return result(0, [reason === "already_knew" ? "İçerik zaten biliniyordu; memnuniyet çıkarılamaz." : "Zaman kısıtı nedeniyle çıkıldı; memnuniyet çıkarılamaz."], "low", false);
  }
  if (input.contentType === "livestream") return analyzeLivestreamRegret(input);

  let score = 0;
  if (input.completionRate < .15) { score += 32; factors.push("Benzersiz tamamlama çok düşük."); }
  else if (input.completionRate < .3) { score += 16; factors.push("Benzersiz tamamlama düşük."); }
  if (input.totalActiveWatchSeconds <= 120) { score += 20; factors.push("İlk iki dakika içinde çıkıldı."); }
  if (input.followedByAnotherVideo) { score += 10; factors.push("Hemen başka videoya geçildi."); }
  if (!input.reopened) { score += 7; factors.push("Video daha sonra yeniden açılmadı."); }
  if (input.durationSeconds >= 600 && input.completionRate < .1) { score += 7; factors.push("Uzun videonun çok küçük bölümü izlendi."); }
  if (CLICKBAIT_TERMS.some((term) => normalizeText(input.title).includes(term))) { score += 10; factors.push("Başlıkta yanıltıcı olabilecek ifade var."); }
  if (feedback?.clickbait === true || input.leaveReason === "misleading_title") { score += 42; factors.push("Yanıltıcı başlık kullanıcı tarafından doğrulandı."); }
  if (feedback?.clickbait === false) { score -= 28; factors.push("Kullanıcı başlığın yanıltıcı olmadığını belirtti."); }
  if (input.leaveReason === "watch_later") { score -= 30; factors.push("Daha sonra izlenecek olarak işaretlendi."); }
  if (input.endedNaturally) { score -= 45; factors.push("Video doğal olarak tamamlandı."); }
  if (input.completionRate >= .5) { score -= 22; factors.push("Videonun önemli bölümü izlendi."); }
  if (input.reopened && input.totalActiveWatchSeconds >= 120) { score -= 18; factors.push("Video yeniden açılıp anlamlı süre izlendi."); }

  const confidence = feedback?.clickbait !== undefined || input.leaveReason === "misleading_title" ? "high" : input.totalActiveWatchSeconds >= 30 ? "medium" : "low";
  return result(round(clamp(score)), factors, confidence, factors.length >= 2);
}

function analyzeLivestreamRegret(input: RegretInput): RegretResult {
  const factors: string[] = [];
  const feedback = input.feedback;
  let score = 0;
  if (input.totalActiveWatchSeconds < 60) {
    score += 28;
    factors.push("Canlı yayından ilk dakika içinde çıkıldı.");
  } else if (input.totalActiveWatchSeconds < 180) {
    score += 12;
    factors.push("Canlı yayın kısa süre izlendi.");
  } else {
    factors.push(`${Math.round(input.totalActiveWatchSeconds / 60)} dakika canlı izlendi.`);
  }
  if (input.followedByAnotherVideo) { score += 8; factors.push("Hemen başka videoya geçildi."); }
  if (!input.reopened && input.totalActiveWatchSeconds < 180) { score += 5; factors.push("Yayın yeniden açılmadı."); }
  if (CLICKBAIT_TERMS.some((term) => normalizeText(input.title).includes(term))) { score += 10; factors.push("Başlıkta yanıltıcı olabilecek ifade var."); }
  if (feedback?.clickbait === true || input.leaveReason === "misleading_title") { score += 42; factors.push("Yanıltıcı başlık kullanıcı tarafından doğrulandı."); }
  if (feedback?.clickbait === false) { score -= 28; factors.push("Kullanıcı başlığın yanıltıcı olmadığını belirtti."); }
  if (input.leaveReason === "watch_later") { score -= 30; factors.push("Daha sonra izlenecek olarak işaretlendi."); }
  if (input.reopened && input.totalActiveWatchSeconds >= 180) { score -= 16; factors.push("Canlı yayın yeniden açılıp anlamlı süre izlendi."); }
  if (input.totalActiveWatchSeconds >= 900) { score -= 20; factors.push("Canlı yayın en az 15 dakika izlendi."); }
  const confidence = feedback?.clickbait !== undefined || input.leaveReason === "misleading_title"
    ? "high"
    : input.totalActiveWatchSeconds >= 60 ? "medium" : "low";
  return result(round(clamp(score)), factors, confidence, factors.length >= 2);
}

function result(score: number, factors: string[], confidence: "low" | "medium" | "high", enoughData: boolean): RegretResult {
  const regretLabel = score < 30 ? "Normal" : score < 60 ? "Şüpheli" : score < 80 ? "Muhtemel pişmanlık" : "Güçlü pişmanlık";
  return { score, regretScore: score, label: regretLabel, regretLabel, contributingFactors: factors, confidence, enoughData };
}

/** Backwards-compatible numeric helper. */
export function calculateRegretScore(input: {
  title: string;
  watchSeconds: number;
  durationSeconds: number;
  completionRate: number;
  reopened: boolean;
  followedByAnotherVideo: boolean;
}) {
  return analyzeRegret({ ...input, totalActiveWatchSeconds: input.watchSeconds }).regretScore;
}
