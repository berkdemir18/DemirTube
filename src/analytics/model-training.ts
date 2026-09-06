// DemirTube · model eğitimi ve dürüst sınama
//
// Buraya kadar "kişisel model" adı verilen şey aslında öğrenmiyordu: ağırlıklar
// sabit varsayılanların güvenilirlikle hafifçe ölçeklenmiş hâliydi, sıralama
// hiç değişmiyordu. Bu modül iki eksiği kapatır:
//
//   1. Ağırlıklar gerçekten aranır. Geçmiş kronolojik yürütülür, her video
//      yalnızca kendisinden öncekilerle tahmin edilir ve ortalama mutlak hatayı
//      en aza indiren ağırlık vektörü koordinat inişiyle bulunur.
//   2. Sonuç dürüst ölçülür. Ağırlıklar geçmişin ilk %70'inde öğrenilir, hata
//      dokunulmamış son %30'da raporlanır; ayrıca "hep kişisel ortalamayı söyle"
//      diyen taban modelle kıyaslanır. Model tabanı yenmiyorsa bunu saklamak
//      yerine söylemek gerekir.
//
// Kanıtlar kronolojik öneklerden bir kez hazırlanır; ağırlık araması bunları tekrar kullanır.
import type { VideoRecord } from "../shared/types";
import { clamp, round } from "../shared/utils";
import { createCompletionFeatureBuilder, completionEligible, completionEvidence, type CompletionFeatures } from "./completion-features";
import {
  DEFAULT_SIGNAL_WEIGHTS, EMPTY_BACKTEST, calibrationFromHistory, errorRadius80,
  predictCompletionDetailed, shrinkToPrior, summarizeBacktest,
  type BacktestResult, type OutcomeCalibration, type PersonalSignal,
} from "./model-calibration";

export type SignalWeights = Record<PersonalSignal, number>;
export type SignalReliability = Record<PersonalSignal, number>;

const SIGNAL_KEYS = Object.keys(DEFAULT_SIGNAL_WEIGHTS) as PersonalSignal[];

/** Ağırlık aramasının açılması için gereken en az kayıt; altında öncül kullanılır. */
export const MIN_TRAINING_SAMPLES = 25;
/** Öğrenilen ağırlığın varsayılana çekilme kuvveti: 25 örnekte yarı yarıya. */
const WEIGHT_PRIOR_STRENGTH = 25;
/** Tahminin açılması için gereken en az geçmiş; `calculatePreference` ile aynı eşik. */
const MIN_PRIOR_HISTORY = 5;
/** Eğitim/sınama ayrımı: geçmişin ilk bu kadarı öğrenmeye ayrılır. */
const TRAIN_SHARE = 0.7;

export const trainable = completionEligible;
export function trainingOrder(history: VideoRecord[]): VideoRecord[] {
  return history.filter(trainable).toSorted((a, b) =>
    a.firstSeenAt.localeCompare(b.firstSeenAt) || a.videoId.localeCompare(b.videoId));
}

type PreparedExample = {
  features: CompletionFeatures; reliability: SignalReliability;
  calibration: OutcomeCalibration; actual: number; index: number;
};
const preparedCache = new WeakMap<VideoRecord[], { examples: PreparedExample[]; reliability: SignalReliability }>();

/** Prepare features once, outside coordinate search. All losses use available prefix outcomes. */
function prepare(ordered: VideoRecord[]) {
  const cached = preparedCache.get(ordered);
  if (cached) return cached;
  const examples: PreparedExample[] = [];
  const buildCompletionFeatures = createCompletionFeatureBuilder();
  const reliabilityOf = (before?: string): SignalReliability =>
    Object.fromEntries(SIGNAL_KEYS.map((key) => {
      let error = 0;
      let baselineError = 0;
      let count = 0;
      for (const example of examples) {
        if (before && ordered[example.index].lastSeenAt > before) continue;
        const part = example.features.observations[key];
        if (part.observed === undefined || part.sampleCount < 1) continue;
        error += Math.abs(example.actual - part.observed);
        baselineError += Math.abs(example.actual - example.features.baseline);
        count += 1;
      }
      // 0.5 now has a measurable meaning: no improvement over the personal baseline.
      const skill = baselineError > 0 ? clamp(1 - error / baselineError, -1, 1) : 0;
      return [key, clamp((0.75 * 4 + (0.5 + 0.45 * skill) * count) / (4 + count), 0.2, 0.95)];
    })) as SignalReliability;
  for (let index = 0; index < ordered.length; index += 1) {
    const video = ordered[index];
    const prior = ordered.slice(0, index).filter((item) => item.lastSeenAt <= video.firstSeenAt);
    if (prior.length < MIN_PRIOR_HISTORY) continue;
    examples.push({ features: buildCompletionFeatures(video, prior), reliability: reliabilityOf(video.firstSeenAt),
      calibration: calibrationFromHistory(prior), actual: clamp(video.completionRate * 100, 0, 100), index });
  }
  const result = { examples, reliability: reliabilityOf() };
  preparedCache.set(ordered, result);
  return result;
}
export const chronologicalReliability = (ordered: VideoRecord[]) => prepare(ordered).reliability;

/** Caller-supplied full-history reliability must never leak into historical predictions. */
export function incrementalBacktest(
  ordered: VideoRecord[], weights: SignalWeights, _reliability: SignalReliability,
  range: { from?: number; to?: number; outcomeBefore?: string; diagnostics?: boolean } = {}
): BacktestResult {
  const errors: number[] = [];
  const signed: number[] = [];
  const baselineErrors: number[] = [];
  const priorErrors: number[] = [];
  const errorIndices: number[] = [];
  const bins = Array.from({ length: 10 }, () => ({ signed: 0, count: 0 }));
  let covered = 0;
  let intervalCount = 0;
  for (const example of prepare(ordered).examples) {
    if (example.index >= (range.to ?? ordered.length)) continue;
    if (range.outcomeBefore && ordered[example.index].lastSeenAt > range.outcomeBefore) continue;
    const predicted = predictCompletionDetailed(completionEvidence(example.features, weights, example.reliability),
      example.features.baseline, example.calibration).value;
    const error = Math.abs(example.actual - predicted);
    // Only finalized earlier errors can set an interval at this origin.
    const availableErrors = range.diagnostics === false ? [] : priorErrors.filter((_, index) =>
      ordered[errorIndices[index]].lastSeenAt <= ordered[example.index].firstSeenAt);
    const radius = errorRadius80(availableErrors);
    priorErrors.push(error);
    errorIndices.push(example.index);
    if (example.index < (range.from ?? 0)) continue;
    if (radius !== undefined) { intervalCount += 1; covered += Number(error <= radius); }
    const bin = bins[Math.min(9, Math.floor(predicted / 10))];
    bin.signed += example.actual - predicted;
    bin.count += 1;
    errors.push(error);
    signed.push(example.actual - predicted);
    baselineErrors.push(Math.abs(example.actual - example.features.baseline));
  }
  return { ...summarizeBacktest(errors, signed, baselineErrors),
    hitRate10: errors.length ? round(errors.filter((error) => error <= 10).length / errors.length, 3) : undefined,
    calibrationError: errors.length ? round(bins.reduce((sum, bin) => sum + Math.abs(bin.signed), 0) / errors.length, 2) : undefined,
    interval80Radius: errorRadius80(errors),
    interval80Coverage: intervalCount ? round(covered / intervalCount, 3) : undefined,
    intervalSampleCount: intervalCount,
  };
}

const normalizeWeights = (weights: SignalWeights): SignalWeights => {
  const total = SIGNAL_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (total <= 0) return { ...DEFAULT_SIGNAL_WEIGHTS };
  return Object.fromEntries(SIGNAL_KEYS.map((key) => [key, weights[key] / total])) as SignalWeights;
};

/** Koordinat inişinin denediği çarpanlar; 1 zaten mevcut değerdir. */
const MULTIPLIERS = [0.55, 0.75, 0.9, 1.15, 1.4, 1.8];
const MAX_PASSES = 3;

export type WeightTraining = {
  weights: SignalWeights;
  /** Ağırlıklar gerçekten arandı mı, yoksa öncül mü kullanıldı? */
  learned: boolean;
  /** Öğrenmede puanlanan kayıt sayısı. */
  trainedOn: number;
  /** Eğitim aralığının bittiği indeks; dürüst sınama buradan sonra başlar. */
  trainEnd: number;
};

/**
 * Ağırlıkları geçmişin ilk diliminde arar. Beş parametre ve birkaç yüz kayıt
 * için koordinat inişi fazlasıyla yeter; gradyan gerektirmez ve her adımda
 * ölçtüğü şey doğrudan modelin gerçek hatasıdır.
 *
 * Bulunan ağırlıklar varsayılana çekilir: 30 videoluk bir geçmiş, "başlık
 * biçimi kanaldan önemli" gibi büyük bir iddiayı taşıyamaz.
 */
export function learnSignalWeights(ordered: VideoRecord[], reliability: SignalReliability, end?: number): WeightTraining {
  const trainEnd = end ?? Math.floor(ordered.length * TRAIN_SHARE);
  const fallback: WeightTraining = {
    weights: { ...DEFAULT_SIGNAL_WEIGHTS }, learned: false, trainedOn: 0, trainEnd,
  };
  if (ordered.length < MIN_TRAINING_SAMPLES) return fallback;

  const objective = (candidate: SignalWeights) =>
    incrementalBacktest(ordered, candidate, reliability, { to: trainEnd, outcomeBefore: ordered[trainEnd]?.firstSeenAt, diagnostics: false });

  let best = { ...DEFAULT_SIGNAL_WEIGHTS };
  let bestResult = objective(best);
  if (bestResult.sampleCount < MIN_PRIOR_HISTORY) return fallback;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let improved = false;
    for (const key of SIGNAL_KEYS) {
      for (const multiplier of MULTIPLIERS) {
        const candidate = normalizeWeights({ ...best, [key]: Math.max(0.01, best[key] * multiplier) });
        const result = objective(candidate);
        if (result.meanAbsoluteError < bestResult.meanAbsoluteError - 0.01) {
          best = candidate;
          bestResult = result;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const shrunk = Object.fromEntries(SIGNAL_KEYS.map((key) => [
    key,
    shrinkToPrior(best[key], bestResult.sampleCount, DEFAULT_SIGNAL_WEIGHTS[key], WEIGHT_PRIOR_STRENGTH),
  ])) as SignalWeights;

  return {
    weights: normalizeWeights(shrunk),
    learned: true,
    trainedOn: bestResult.sampleCount,
    trainEnd,
  };
}

/** Öğrenilmiş ağırlıklar yalnızca ayrılmış son dilimde ölçülür; az örnekte eğitim verisine dönülmez. */
export function evaluateModel(
  ordered: VideoRecord[],
  weights: SignalWeights,
  reliability: SignalReliability,
  training: WeightTraining
): BacktestResult {
  if (!ordered.length) return EMPTY_BACKTEST;
  if (!training.learned) return incrementalBacktest(ordered, weights, reliability);
  const holdout = incrementalBacktest(ordered, weights, reliability, { from: training.trainEnd });
  return holdout;
}

/** Beceriyi kullanıcıya gösterilecek yüzdeye çevirir. */
export const skillPercent = (result: BacktestResult) => round(clamp(result.skill, -1, 1) * 100, 0);
