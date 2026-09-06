import type { Confidence, VideoRecord } from "../shared/types";
import { MODEL_SAMPLE_LIMIT } from "./completion-features";
import { round } from "../shared/utils";
import {
  CURRENT_MODEL_VERSION, NEUTRAL_CALIBRATION, calibrationFromHistory,
  type BacktestResult, type OutcomeCalibration, type PersonalSignal,
} from "./model-calibration";
import { chronologicalReliability, evaluateModel, learnSignalWeights, trainingOrder, type SignalReliability, type SignalWeights } from "./model-training";

export type { PersonalSignal } from "./model-calibration";

export type PersonalModel = {
  version: typeof CURRENT_MODEL_VERSION;
  sampleCount: number;
  confidence: Confidence;
  weights: SignalWeights;
  reliability: SignalReliability;
  /** Ağırlıklar geçmişten aranarak mı bulundu, yoksa öncül mü kullanılıyor? */
  weightsLearned: boolean;
  /** Gerçek tahmin hatalarından türetilen doğruluk skoru (0–1). Tanımsız = henüz veri yok. */
  outcomeAccuracy?: number;
  /** Kaç tur öğrenmeden geçildi (her 10 yeni snapshot sonrası artar). */
  adaptationGeneration: number;
  /** Model en son ne zaman güncellendi. */
  calibratedAt: string;
  /**
   * Geçmiş tahminlerin gerçekle karşılaştırılmasından çıkan kalibrasyon:
   * sistematik sapma, eğim ve isabet oranı. Tahmin bununla düzeltilir; eskiden
   * doğruluk yalnızca ekranda gösterilen bir sayıydı.
   */
  calibration: OutcomeCalibration;
  /**
   * Modelin dürüst karnesi: ağırlıkların görmediği dilimde ölçülen hata ve
   * "hep kişisel ortalamayı söyle" diyen taban modelle kıyas. Model tabanı
   * yenmiyorsa bu durum açıklamada belirtilir; ölçülmeyen ek harmanlama yapılmaz.
   */
  benchmark: BacktestResult;
};

export function derivePersonalModel(history: VideoRecord[]): PersonalModel {
  const eligible = trainingOrder(history);
  const ordered = eligible.slice(-MODEL_SAMPLE_LIMIT);
  const reliability = chronologicalReliability(ordered);
  const training = learnSignalWeights(ordered, reliability);
  const weights = Object.fromEntries(
    (Object.keys(training.weights) as PersonalSignal[]).map((key) => [key, round(training.weights[key], 3)])
  ) as SignalWeights;
  const benchmark = evaluateModel(ordered, weights, reliability, training);

  // Doğruluk ve sapma tek kaynaktan: kalibrasyon modülü.
  const calibration = ordered.length ? calibrationFromHistory(ordered) : NEUTRAL_CALIBRATION;
  const outcomeAccuracy = calibration.sampleCount >= 3 ? calibration.hitRate : undefined;
  const adaptationGeneration = Math.floor(calibration.sampleCount / 10);

  return {
    version: CURRENT_MODEL_VERSION,
    // Kullanıcıya gösterilen sayı gerçek geçmiş büyüklüğüdür; yukarıdaki sınır
    // tahmin, eğitim ve kalibrasyon örneklemini bağlar.
    sampleCount: eligible.length,
    confidence: eligible.length >= 20 ? "high" : eligible.length >= 8 ? "medium" : "low",
    weights,
    reliability,
    weightsLearned: training.learned,
    outcomeAccuracy,
    adaptationGeneration,
    calibratedAt: new Date().toISOString(),
    calibration,
    benchmark,
  };
}

export function strongestModelSignal(model: PersonalModel): { key: PersonalSignal; label: string; weight: number } {
  const labels: Record<PersonalSignal, string> = {
    channel: "kanal geçmişi",
    topic: "konu ilgisi",
    duration: "süre uyumu",
    title: "başlık biçimi",
    format: "video formatı",
  };
  const key = (Object.entries(model.weights) as [PersonalSignal, number][]).toSorted((a, b) => b[1] - a[1])[0][0];
  return { key, label: labels[key], weight: model.weights[key] };
}
