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
// Tüm sayaçlar artımlıdır: geçmiş tek geçişte yürünür (O(n)), böylece ağırlık
// araması tarayıcıda yüzlerce kez çalıştırılabilir.
import type { VideoRecord } from "../shared/types";
import { channelKey, clamp, round } from "../shared/utils";
import { hasMeasurableDuration } from "./completion";
import { durationBucket } from "./duration";
import { recordVideoFormat } from "./video-intelligence";
import {
  DEFAULT_SIGNAL_WEIGHTS, EMPTY_BACKTEST, NEUTRAL_CALIBRATION, SIGNAL_TIERS,
  predictCompletionDetailed, shrinkToPrior, summarizeBacktest,
  type BacktestResult, type CompletionEvidence, type PersonalSignal,
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

type Aggregate = { sum: number; count: number };

type RunningGroups = {
  overall: Aggregate;
  channel: Map<string, Aggregate>;
  topic: Map<string, Aggregate>;
  duration: Map<string, Aggregate>;
  format: Map<string, Aggregate>;
};

const emptyGroups = (): RunningGroups => ({
  overall: { sum: 0, count: 0 },
  channel: new Map(),
  topic: new Map(),
  duration: new Map(),
  format: new Map(),
});

function accumulate(map: Map<string, Aggregate>, key: string, value: number) {
  const current = map.get(key) ?? { sum: 0, count: 0 };
  current.sum += value;
  current.count += 1;
  map.set(key, current);
}

const observationOf = (aggregate: Aggregate | undefined) =>
  aggregate && aggregate.count > 0 ? aggregate.sum / aggregate.count : undefined;

/**
 * Bir videonun ait olduğu grup anahtarları. Konu çok değerlidir; kanıt olarak
 * en çok geçmişi olan konu seçilir. Tüm eşleşen konuların toplamını almak,
 * iki konuyu paylaşan videoyu iki kez saymak olurdu.
 */
function topicKeyWithMostEvidence(video: VideoRecord, groups: RunningGroups): string | undefined {
  let best: { key: string; count: number } | undefined;
  for (const topic of video.topics) {
    const count = groups.topic.get(topic)?.count ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { key: topic, count };
  }
  return best?.key;
}

/** Kayıt tahmin edilebilir mi: ölçülebilir süre, canlı yayın değil, dışlanmamış. */
export const trainable = (video: VideoRecord) =>
  !video.excludedFromAnalytics
  && !video.isCurrentlyWatching
  && hasMeasurableDuration(video)
  && video.contentType !== "livestream";

/** Kronolojik sıraya konmuş, eğitilebilir geçmiş. */
export function trainingOrder(history: VideoRecord[]): VideoRecord[] {
  return history.filter(trainable).toSorted((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
}

function evidenceFor(
  video: VideoRecord,
  groups: RunningGroups,
  weights: SignalWeights,
  reliability: SignalReliability
): CompletionEvidence[] {
  const channel = groups.channel.get(channelKey(video.channelName));
  const topicKey = topicKeyWithMostEvidence(video, groups);
  const topic = topicKey ? groups.topic.get(topicKey) : undefined;
  const duration = groups.duration.get(durationBucket(video.durationSeconds));
  const format = groups.format.get(recordVideoFormat(video));
  return [
    {
      observed: observationOf(channel), sampleCount: channel?.count ?? 0,
      weight: weights.channel, reliability: reliability.channel, tier: SIGNAL_TIERS.channel,
    },
    {
      observed: observationOf(topic), sampleCount: topic?.count ?? 0,
      weight: weights.topic, reliability: reliability.topic, tier: SIGNAL_TIERS.topic,
    },
    {
      observed: observationOf(duration), sampleCount: duration?.count ?? 0,
      weight: weights.duration, reliability: reliability.duration, tier: SIGNAL_TIERS.duration,
    },
    {
      // Başlık sinyali tamamlanma ölçeğinde bir gözlem üretmez (benzerlik ayrı
      // bir eksendir); ağırlığı formatla birlikte biçimsel kanıta yazılır.
      observed: observationOf(format), sampleCount: format?.count ?? 0,
      weight: weights.format + weights.title, reliability: reliability.format, tier: SIGNAL_TIERS.format,
    },
  ];
}

function learn(groups: RunningGroups, video: VideoRecord) {
  const actual = clamp(video.completionRate * 100, 0, 100);
  groups.overall.sum += actual;
  groups.overall.count += 1;
  accumulate(groups.channel, channelKey(video.channelName), actual);
  for (const topic of video.topics) accumulate(groups.topic, topic, actual);
  accumulate(groups.duration, durationBucket(video.durationSeconds), actual);
  accumulate(groups.format, recordVideoFormat(video), actual);
}

/**
 * Artımlı geriye dönük sınama. Geçmiş tek geçişte yürünür; her video önce
 * tahmin edilir, sonra sayaçlara işlenir — yani hiçbir kayıt kendi tahminini
 * göremez. `from`/`to` yalnızca hangi kayıtların PUANLANACAĞINI belirler;
 * sayaçlar aralığın dışında da güncellenir ki geçmiş kesintiye uğramasın.
 *
 * Kalibrasyon bilerek uygulanmaz: burada ölçülen, düzeltme öncesi ham modeldir.
 */
export function incrementalBacktest(
  ordered: VideoRecord[],
  weights: SignalWeights,
  reliability: SignalReliability,
  range: { from?: number; to?: number } = {}
): BacktestResult {
  const from = range.from ?? 0;
  const to = range.to ?? ordered.length;
  const groups = emptyGroups();
  const errors: number[] = [];
  const signed: number[] = [];
  const baselineErrors: number[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const video = ordered[index];
    if (index >= from && index < to && groups.overall.count >= MIN_PRIOR_HISTORY) {
      const baseline = groups.overall.sum / groups.overall.count;
      const predicted = predictCompletionDetailed(
        evidenceFor(video, groups, weights, reliability), baseline, NEUTRAL_CALIBRATION
      ).value;
      const actual = clamp(video.completionRate * 100, 0, 100);
      errors.push(Math.abs(actual - predicted));
      signed.push(actual - predicted);
      baselineErrors.push(Math.abs(actual - baseline));
    }
    learn(groups, video);
  }

  return summarizeBacktest(errors, signed, baselineErrors);
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
export function learnSignalWeights(ordered: VideoRecord[], reliability: SignalReliability): WeightTraining {
  const trainEnd = Math.floor(ordered.length * TRAIN_SHARE);
  const fallback: WeightTraining = {
    weights: { ...DEFAULT_SIGNAL_WEIGHTS }, learned: false, trainedOn: 0, trainEnd,
  };
  if (ordered.length < MIN_TRAINING_SAMPLES) return fallback;

  const objective = (candidate: SignalWeights) =>
    incrementalBacktest(ordered, candidate, reliability, { to: trainEnd });

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

/**
 * Modelin dürüst karnesi: ağırlıkların görmediği son dilimde ölçülen hata ve
 * taban modelle kıyas. Sınama dilimi anlamlı bir örnek taşımıyorsa tüm geçmiş
 * kullanılır — bu durumda ağırlıklar zaten öğrenilmemiş, varsayılandadır.
 */
export function evaluateModel(
  ordered: VideoRecord[],
  weights: SignalWeights,
  reliability: SignalReliability,
  training: WeightTraining
): BacktestResult {
  if (!ordered.length) return EMPTY_BACKTEST;
  if (!training.learned) return incrementalBacktest(ordered, weights, reliability);
  const holdout = incrementalBacktest(ordered, weights, reliability, { from: training.trainEnd });
  return holdout.sampleCount >= MIN_PRIOR_HISTORY
    ? holdout
    : incrementalBacktest(ordered, weights, reliability);
}

/** Beceriyi kullanıcıya gösterilecek yüzdeye çevirir. */
export const skillPercent = (result: BacktestResult) => round(clamp(result.skill, -1, 1) * 100, 0);
