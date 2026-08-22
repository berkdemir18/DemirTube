import type { Confidence, EvidenceLevel } from "../shared/types";

export function evidenceLevel(sampleCount: number, mediumAt = 5, highAt = 12): EvidenceLevel {
  const confidence: Confidence = sampleCount >= highAt ? "high" : sampleCount >= mediumAt ? "medium" : "low";
  const nextThreshold = sampleCount < mediumAt ? mediumAt : sampleCount < highAt ? highAt : undefined;
  return {
    sampleCount,
    confidence,
    label: confidence === "high" ? "Yüksek güven" : confidence === "medium" ? "Orta güven" : "Düşük güven",
    enoughData: sampleCount >= mediumAt,
    nextThreshold
  };
}
