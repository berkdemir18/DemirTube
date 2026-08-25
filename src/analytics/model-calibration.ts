// DemirTube · model kalibrasyonu
//
// Kişisel model tahmin üretir; bu modül tahminin tuttuğunu ölçüp geri besler.
// Dört şey tek yerde toplanır ve hepsi saf fonksiyondur:
//
//   1. Küçük örneklemi öncüle çekme (empirical Bayes shrinkage). Tek videodan
//      "%92 uyum" çıkarmak modelin en büyük tutarsızlık kaynağıydı.
//   2. Geçmiş tahmin hatalarından kalibrasyon: yalnızca sabit sapma değil,
//      tahmin seviyesine bağlı EĞİM de ölçülür. Tek sayılı düzeltme, "yüksek
//      tahminlerde iyimser / düşük tahminlerde kötümser" olan klasik regresyon
//      sapmasını göremiyordu.
//   3. Kanıtları hiyerarşik birleştirme: kanal, konu, format ve süre büyük
//      ölçüde AYNI videolardan gelir. Bunları bağımsız kanıt sayıp ortalamak
//      aynı bilgiyi dört kez saymaktı; artık her kanıt bir üsttekinin öncülü.
//   4. Geriye dönük sınama: geçmişi kronolojik yürütüp her videoyu yalnızca
//      kendisinden ÖNCEKİ kayıtlarla tahmin ederek gerçek hata ölçmek.
import type { VideoRecord } from "../shared/types";
import { clamp, round } from "../shared/utils";
import { hasMeasurableDuration } from "./completion";

/**
 * Öncüle çekme kuvveti: kaç örnek sonra gözlemin kendisine güvenilir?
 * 4, "üç video bir kanal hakkında fikir vermez ama sekiz video verir"
 * sezgisinin sayısal karşılığı — gözlem 4 örnekte öncülle yarı yarıya karışır.
 */
export const SHRINK_STRENGTH = 4;

/**
 * Yürürlükteki model sürümü. v5, hiyerarşik kanıt birleştirme + öğrenilmiş
 * ağırlık + iki parametreli kalibrasyonla geldi.
 *
 * Eski sürümle üretilmiş tahminler artık tamamen atılmıyor: sürüm değişince
 * aylarca birikmiş sonucun çöpe gitmesi düzeltmeyi her seferinde sıfırdan
 * başlatıyordu. Bunun yerine düşük ağırlıkla sayılıyorlar
 * (`LEGACY_VERSION_WEIGHT`); yeni sürümün kendi sonuçları biriktikçe eskinin
 * etkisi kendiliğinden erir.
 */
export const CURRENT_MODEL_VERSION = "adaptive-v5";

/** Başka sürümle üretilmiş tahminin kalibrasyondaki ağırlığı. */
export const LEGACY_VERSION_WEIGHT = 0.3;

/** Kalibrasyon kanıtının sönümlenme ölçeği (gün). İlgi kayarsa eski hatalar erir. */
export const CALIBRATION_DECAY_DAYS = 90;

export type PersonalSignal = "channel" | "topic" | "duration" | "title" | "format";

/** Öğrenme başlamadan önceki öncül ağırlıklar. */
export const DEFAULT_SIGNAL_WEIGHTS: Record<PersonalSignal, number> = {
  channel: 0.3,
  topic: 0.27,
  duration: 0.16,
  title: 0.12,
  format: 0.15,
};

/**
 * Kanıtın özgüllük katmanı. Büyük sayı daha spesifik kanıt demektir ve bir
 * alttaki katmanın tahminini öncül alarak onu günceller: taban → biçimsel
 * kanıt (süre/format) → konu → kanal.
 */
export const SIGNAL_TIERS: Record<PersonalSignal, number> = {
  duration: 1,
  format: 1,
  title: 2,
  topic: 2,
  channel: 3,
};

/**
 * Gözlemi örnek sayısına göre öncüle çeker. n=0 → tamamen öncül,
 * n→∞ → tamamen gözlem. Ağırlık her yerde aynı olsun diye tek fonksiyon.
 */
export function shrinkToPrior(observed: number, sampleCount: number, prior: number, strength = SHRINK_STRENGTH): number {
  if (sampleCount <= 0) return prior;
  return (observed * sampleCount + prior * strength) / (sampleCount + strength);
}

/** Gözlemin ne kadarına güvenildiği (0–1); ağırlıklandırmada kullanılır. */
export function evidenceWeight(sampleCount: number, strength = SHRINK_STRENGTH): number {
  return sampleCount <= 0 ? 0 : sampleCount / (sampleCount + strength);
}

/** Uç değerlerden etkilenmeyen orta nokta. */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Ağırlıklı ortanca; zaman sönümlü kalibrasyonda taze kayıtlar daha çok sayar. */
export function weightedMedian(values: number[], weights: number[]): number {
  if (!values.length) return 0;
  const pairs = values
    .map((value, index) => ({ value, weight: Math.max(0, weights[index] ?? 1) }))
    .toSorted((a, b) => a.value - b.value);
  const total = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  if (total <= 0) return median(values);
  let accumulated = 0;
  for (const pair of pairs) {
    accumulated += pair.weight;
    if (accumulated >= total / 2) return pair.value;
  }
  return pairs.at(-1)!.value;
}

export type OutcomeCalibration = {
  /** Kaç videoda gerçek tahmin–sonuç çifti var (ham sayı). */
  sampleCount: number;
  /** Zaman sönümü ve sürüm ağırlığından sonra kalan etkin kanıt miktarı. */
  effectiveSampleCount: number;
  /** Ortanca işaretli hata (gerçek − tahmin). Pozitif = model olduğundan düşük tahmin ediyor. */
  medianSignedError: number;
  /** Ortalama mutlak hata (puan). */
  meanAbsoluteError: number;
  /** ±20 puan içinde kalan tahminlerin oranı (0–1). */
  hitRate: number;
  /**
   * Tahmine pivot noktasında eklenecek sabit düzeltme. Ham sapmanın tamamı
   * uygulanmaz: az örnekte sapma gürültüdür, aşırı düzeltme salınım yaratır.
   */
  correction: number;
  /**
   * Tahmin seviyesine bağlı düzeltme eğimi. Pozitifse model yüksek tahminlerde
   * fazla kötümser, düşüklerde fazla iyimser demektir; tek sayılı düzeltme bu
   * sapmayı hiç göremiyordu.
   */
  slopeCorrection: number;
  /** Eğimin döndüğü nokta: ölçülen tahminlerin ağırlıklı ortalaması. */
  pivot: number;
};

export const NEUTRAL_CALIBRATION: OutcomeCalibration = {
  sampleCount: 0, effectiveSampleCount: 0, medianSignedError: 0, meanAbsoluteError: 0,
  hitRate: 0, correction: 0, slopeCorrection: 0, pivot: 50,
};

/** Düzeltmenin en fazla kaç puan olabileceği; model kendini kovalamasın. */
const MAX_CORRECTION = 12;
/** Düzeltmenin tam güce ulaşması için gereken etkin örnek ölçeği. */
const CORRECTION_STRENGTH = 8;
/** Eğim düzeltmesinin sınırı; kalibrasyon tahmini tersine çeviremez. */
const MAX_SLOPE = 0.6;

type CalibrationPair = { predicted: number; actual: number; weight: number };

/** Tahmin–sonuç çifti taşıyan, ölçülebilir ve tamamlanmış kayıtlar. */
function comparablePairs(videos: VideoRecord[]): CalibrationPair[] {
  const usable = videos.filter((video) =>
    !video.isCurrentlyWatching
    && !video.excludedFromAnalytics
    && hasMeasurableDuration(video)
    && video.contentType !== "livestream"
    && video.predictionSnapshot?.estimatedCompletion !== undefined);

  // Tazelik ölçüsü duvar saatine değil geçmişin kendi son kaydına bağlanır;
  // aynı geçmiş bir hafta sonra farklı kalibrasyon üretmesin.
  let anchor = 0;
  for (const video of usable) {
    const seen = new Date(video.lastSeenAt).getTime();
    if (Number.isFinite(seen) && seen > anchor) anchor = seen;
  }

  return usable.map((video) => {
    const snapshot = video.predictionSnapshot!;
    const seen = new Date(video.lastSeenAt).getTime();
    const ageDays = Number.isFinite(seen) ? Math.max(0, (anchor - seen) / 86_400_000) : 0;
    const versionWeight = snapshot.modelVersion === CURRENT_MODEL_VERSION ? 1 : LEGACY_VERSION_WEIGHT;
    return {
      predicted: clamp(snapshot.estimatedCompletion!, 0, 100),
      actual: clamp(video.completionRate * 100, 0, 100),
      weight: versionWeight * Math.exp(-ageDays / CALIBRATION_DECAY_DAYS),
    };
  });
}

export function calibrationFromHistory(videos: VideoRecord[]): OutcomeCalibration {
  const pairs = comparablePairs(videos);
  if (pairs.length < 3) return { ...NEUTRAL_CALIBRATION, sampleCount: pairs.length };

  const totalWeight = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  if (totalWeight <= 0) return { ...NEUTRAL_CALIBRATION, sampleCount: pairs.length };

  const pivot = round(pairs.reduce((sum, pair) => sum + pair.predicted * pair.weight, 0) / totalWeight, 1);
  const residual = pairs.map((pair) => pair.actual - pair.predicted);
  const centered = pairs.map((pair) => pair.predicted - pivot);
  const weights = pairs.map((pair) => pair.weight);

  // Eğim: hata tahmin seviyesiyle birlikte nasıl değişiyor? (ağırlıklı EKK)
  const variance = pairs.reduce((sum, pair, index) => sum + pair.weight * centered[index] ** 2, 0);
  const covariance = pairs.reduce((sum, pair, index) => sum + pair.weight * centered[index] * residual[index], 0);
  const rawSlope = variance > 1 ? clamp(covariance / variance, -MAX_SLOPE, MAX_SLOPE) : 0;
  // Sabit sapma, eğimden arındırılmış artıkların ortancasıdır: tek bir uç
  // değer düzeltmeyi kaçırmasın diye ortalama değil ortanca kullanılıyor.
  const rawIntercept = weightedMedian(residual.map((value, index) => value - rawSlope * centered[index]), weights);

  const meanAbsoluteError = round(
    pairs.reduce((sum, pair) => sum + Math.abs(pair.actual - pair.predicted) * pair.weight, 0) / totalWeight, 1
  );
  const hitRate = round(
    pairs.reduce((sum, pair) => sum + (Math.abs(pair.actual - pair.predicted) <= 20 ? pair.weight : 0), 0) / totalWeight, 2
  );

  // Etkin örnek arttıkça düzeltme güçlenir; üç kayıtla model kendini yeniden yazmaz.
  const damping = totalWeight / (totalWeight + CORRECTION_STRENGTH);

  return {
    sampleCount: pairs.length,
    effectiveSampleCount: round(totalWeight, 1),
    medianSignedError: round(rawIntercept, 1),
    meanAbsoluteError,
    hitRate,
    correction: round(clamp(rawIntercept * damping, -MAX_CORRECTION, MAX_CORRECTION), 1),
    slopeCorrection: round(rawSlope * damping, 3),
    pivot,
  };
}

/** Ölçülen sapmayı ve eğimi ham tahmine uygular. */
export function applyCalibration(prediction: number, calibration: OutcomeCalibration): number {
  const shift = calibration.correction + calibration.slopeCorrection * (prediction - calibration.pivot);
  return clamp(prediction + clamp(shift, -MAX_CORRECTION, MAX_CORRECTION), 0, 100);
}

/** Tamamlanma tahmininin tek bir kanıt bileşeni. */
export type CompletionEvidence = {
  observed: number | undefined;
  sampleCount: number;
  weight: number;
  /**
   * Bu sinyalin geçmişte varyansı ne kadar açıkladığı (0.2–0.95).
   * personal-model bunu grup içi tutarlılıktan ve gerçek tahmin hatalarından
   * çıkarır.
   */
  reliability: number;
  /**
   * Özgüllük katmanı (bkz. `SIGNAL_TIERS`). Verilmezse 0 kabul edilir ve tüm
   * kanıtlar aynı katmanda ağırlıklı ortalamaya girer.
   */
  tier?: number;
};

/**
 * Güvenilirliği kanıt gücüne çevirir. 0.5 "peer'lar birbirini hiç tutmuyor"
 * demektir ve o sinyal tahmine hiç girmemelidir; bilgi taşımayan sinyalleri
 * eşit ağırlıkla saymak tahmini kişisel ortalamaya sürüklüyordu.
 */
export function informativeness(reliability: number): number {
  return clamp((reliability - 0.5) * 2, 0, 1);
}

/**
 * Aynı katmandaki ikinci ve sonraki kanıtların örnek sayısına verilen pay.
 * "Bu kanalda 20 video izledim" ile "bu formatta 20 video izledim" çoğu zaman
 * AYNI 20 videodur; ikisini toplamak kanıtı iki katına çıkarmak olurdu.
 */
const REDUNDANT_EVIDENCE_SHARE = 0.25;

export type CompletionPrediction = {
  value: number;
  /** Tahminin arkasındaki en güçlü kanıtın doygunluğu (0–1). Belirsizlik payı buradan çıkar. */
  evidenceStrength: number;
};

/**
 * Tamamlanma tahmini: kanıtlar özgüllük sırasına konur ve her katman bir
 * öncekinin tahminini ÖNCÜL alarak onu günceller. Kanıtı olmayan katman
 * atlanır; tahmin kişisel tabandan başlar.
 *
 * Eskiden tüm sinyaller tek bir ağırlıklı ortalamaya giriyordu; kanal, konu,
 * format ve süre neredeyse aynı videolardan geldiği için aynı bilgi dört kez
 * sayılıyor, spesifik kanal kanıtı genel sinyallerce sulandırılıyordu.
 */
export function predictCompletionDetailed(
  evidence: CompletionEvidence[],
  personalBaseline: number,
  calibration: OutcomeCalibration
): CompletionPrediction {
  const usable = evidence.filter((part) =>
    part.observed !== undefined && part.sampleCount > 0 && part.weight > 0 && informativeness(part.reliability) > 0);
  const tiers = [...new Set(usable.map((part) => part.tier ?? 0))].toSorted((a, b) => a - b);
  // Ağırlıklar yalnızca oran olarak anlamlıdır; en güçlü sinyale göre
  // ölçeklenince tahmin, ağırlık vektörünün mutlak büyüklüğünden bağımsız olur.
  const maxWeight = usable.reduce((top, part) => Math.max(top, part.weight), 0);

  let estimate = personalBaseline;
  let evidenceStrength = 0;
  for (const tier of tiers) {
    const parts = usable.filter((part) => (part.tier ?? 0) === tier);
    let observedSum = 0;
    let countSum = 0;
    const counts: number[] = [];
    for (const part of parts) {
      // Kanıtın gücü üç şeyin çarpımı: kaç örnek, sinyal ne kadar bilgi
      // taşıyor, modelin bu sinyale verdiği ağırlık. Ağırlığı yalnızca ortalama
      // alırken kullanmak yetmiyordu — katman içi normalizasyon onu siliyor,
      // düşük ağırlıklı bir sinyal yüksek ağırlıklı kadar çekim yapıyordu.
      const strength = part.sampleCount * informativeness(part.reliability) * (part.weight / maxWeight);
      if (strength <= 0) continue;
      observedSum += part.observed! * strength;
      countSum += strength;
      counts.push(strength);
    }
    if (countSum <= 0) continue;
    counts.sort((a, b) => b - a);
    const effectiveCount = counts[0] + counts.slice(1).reduce((sum, value) => sum + value, 0) * REDUNDANT_EVIDENCE_SHARE;
    estimate = shrinkToPrior(observedSum / countSum, effectiveCount, estimate);
    evidenceStrength = Math.max(evidenceStrength, evidenceWeight(effectiveCount));
  }

  return { value: round(applyCalibration(estimate, calibration)), evidenceStrength: round(evidenceStrength, 3) };
}

export function predictCompletion(
  evidence: CompletionEvidence[],
  personalBaseline: number,
  calibration: OutcomeCalibration
): number {
  return predictCompletionDetailed(evidence, personalBaseline, calibration).value;
}

export type BacktestResult = {
  /** Tahmin üretilebilen kayıt sayısı. */
  sampleCount: number;
  meanAbsoluteError: number;
  medianAbsoluteError: number;
  /** ±20 puan içinde kalan tahminlerin oranı. */
  hitRate: number;
  /** İşaretli ortalama hata; sıfıra yakın olması sistematik sapma olmadığını gösterir. */
  meanSignedError: number;
  /** Her zaman kişisel ortalamayı söyleyen aptal modelin hatası; kıyas tabanı. */
  baselineMeanAbsoluteError: number;
  /**
   * Beceri skoru: tabana göre hatanın ne kadarını sildik (0 = taban kadar,
   * 1 = kusursuz, negatif = tabandan kötü). Modelin varlık sebebi bu sayıdır.
   */
  skill: number;
};

export const EMPTY_BACKTEST: BacktestResult = {
  sampleCount: 0, meanAbsoluteError: 0, medianAbsoluteError: 0,
  hitRate: 0, meanSignedError: 0, baselineMeanAbsoluteError: 0, skill: 0,
};

/** Toplanmış hata dizilerini tek rapora çevirir; iki sınama yolu da bunu kullanır. */
export function summarizeBacktest(errors: number[], signed: number[], baselineErrors: number[]): BacktestResult {
  if (!errors.length) return EMPTY_BACKTEST;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanAbsoluteError = mean(errors);
  const baselineMeanAbsoluteError = mean(baselineErrors);
  return {
    sampleCount: errors.length,
    meanAbsoluteError: round(meanAbsoluteError, 1),
    medianAbsoluteError: round(median(errors), 1),
    hitRate: round(errors.filter((value) => value <= 20).length / errors.length, 2),
    meanSignedError: round(mean(signed), 1),
    baselineMeanAbsoluteError: round(baselineMeanAbsoluteError, 1),
    skill: baselineMeanAbsoluteError > 0 ? round(1 - meanAbsoluteError / baselineMeanAbsoluteError, 3) : 0,
  };
}

/**
 * Geriye dönük sınama: kayıtlar kronolojik sıraya konur ve her video yalnızca
 * kendisinden önce izlenmiş videolarla tahmin edilir. Bu, modelin gerçek
 * kullanımdaki hatasını ölçmenin tek dürüst yoludur; aynı listeyle hem eğitip
 * hem sınamak hatayı olduğundan iyi gösterir.
 *
 * `predict` tahmini üretemezse (yeterli geçmiş yok) o kayıt atlanır.
 */
export function backtestCompletion(
  history: VideoRecord[],
  predict: (video: VideoRecord, priorHistory: VideoRecord[]) => number | undefined
): BacktestResult {
  const ordered = history
    .filter((video) =>
      !video.excludedFromAnalytics
      && !video.isCurrentlyWatching
      && hasMeasurableDuration(video)
      && video.contentType !== "livestream")
    .toSorted((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));

  const errors: number[] = [];
  const signed: number[] = [];
  const baselineErrors: number[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const video = ordered[index];
    const prior = ordered.slice(0, index);
    const predicted = predict(video, prior);
    if (predicted === undefined) continue;

    const actual = clamp(video.completionRate * 100, 0, 100);
    errors.push(Math.abs(actual - predicted));
    signed.push(actual - predicted);

    // Kıyas: "herkes ortalamada davranır" diyen model.
    const baseline = prior.length
      ? prior.reduce((sum, item) => sum + item.completionRate * 100, 0) / prior.length
      : 50;
    baselineErrors.push(Math.abs(actual - baseline));
  }

  return summarizeBacktest(errors, signed, baselineErrors);
}
