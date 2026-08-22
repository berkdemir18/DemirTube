import type { Confidence, VideoRecord } from "../shared/types";
import { durationBucket } from "./duration";
import { analyzeVideoIntelligence, recordVideoFormat } from "./video-intelligence";
import { hasMeasurableDuration } from "./completion";
import { clamp, round } from "../shared/utils";

export type PersonalSignal = "channel" | "topic" | "duration" | "title" | "format";
export type PersonalModel = {
  version: "adaptive-v3";
  sampleCount: number;
  confidence: Confidence;
  weights: Record<PersonalSignal, number>;
  reliability: Record<PersonalSignal, number>;
  /** Gerçek tahmin hatalarından türetilen doğruluk skoru (0–1). Tanımsız = henüz veri yok. */
  outcomeAccuracy?: number;
  /** Kaç tur öğrenmeden geçildi (her 10 yeni snapshot sonrası artar). */
  adaptationGeneration: number;
  /** Model en son ne zaman güncellendi. */
  calibratedAt: string;
};

const defaults: Record<PersonalSignal, number> = {
  channel: 0.3,
  topic: 0.27,
  duration: 0.16,
  title: 0.12,
  format: 0.15,
};

/** Grup içi tutarsızlık tabanlı güvenilirlik (fallback, gerçek tahmin verisi yoksa). */
function groupReliability(videos: VideoRecord[], keyOf: (video: VideoRecord) => string[]): number {
  if (videos.length < 4) return 0.5;
  let error = 0;
  let samples = 0;
  for (const video of videos) {
    const keys = new Set(keyOf(video));
    const peers = videos.filter((candidate) =>
      candidate.videoId !== video.videoId && keyOf(candidate).some((key) => keys.has(key))
    );
    if (!peers.length) continue;
    const predicted = peers.reduce((sum, item) => sum + item.completionRate * 100, 0) / peers.length;
    error += Math.abs(predicted - video.completionRate * 100);
    samples += 1;
  }
  if (samples < 2) return 0.5;
  return round(clamp(1 - error / samples / 100, 0.2, 0.95), 3);
}

/**
 * Gerçek tahmin snapshot'ları olan videolarda sinyal bazlı hata hesaplar.
 * Her sinyal için: bu sinyal grubundaki videolarda tahmin ne kadar yanılıyor?
 * Daha düşük hata → daha yüksek güvenilirlik.
 */
function outcomeReliability(
  videos: VideoRecord[],
  groupKeyOf: (video: VideoRecord) => string[]
): number {
  const withOutcome = videos.filter(
    (video) => !video.isCurrentlyWatching && video.predictionSnapshot?.estimatedCompletion !== undefined
  );
  if (withOutcome.length < 3) return groupReliability(videos, groupKeyOf);

  let totalError = 0;
  let count = 0;
  for (const video of withOutcome) {
    const predicted = video.predictionSnapshot!.estimatedCompletion!;
    const actual = video.completionRate * 100;
    // Ağırlık: bu videoya ait sinyal grubu kaç ortak peer barındırıyor?
    const peerCount = withOutcome.filter(
      (other) =>
        other.videoId !== video.videoId &&
        groupKeyOf(other).some((key) => groupKeyOf(video).includes(key))
    ).length;
    // Peer'lı örnekler daha güvenilir; ağırlıkla hata topla
    const weight = peerCount > 0 ? 1.5 : 0.7;
    totalError += Math.abs(predicted - actual) * weight;
    count += weight;
  }
  if (count === 0) return groupReliability(videos, groupKeyOf);

  const meanError = totalError / count;
  // meanError 0 → güvenilirlik 0.95; meanError 50 → 0.2
  const outcomeBased = clamp(1 - meanError / 50, 0.2, 0.95);
  const groupBased = groupReliability(videos, groupKeyOf);

  // Gerçek veri az olduğunda grup güvenilirliğine daha çok ağırlık ver (smooth blend)
  const outcomeWeight = Math.min(0.9, withOutcome.length / 20);
  return round(outcomeWeight * outcomeBased + (1 - outcomeWeight) * groupBased, 3);
}

/**
 * Güvenilirlik hesabı her video için tüm listeyi tarıyor (O(n²)). Ağırlıklar
 * global bir profil olduğu için tüm geçmişi taramak gerekmiyor; en yeni
 * kayıtlardan alınan örneklem hem yeterli hem de süreyi sabitliyor. Geçmişi
 * büyüyen kullanıcılarda panel bu yüzden zaman aşımına uğruyordu.
 */
const MODEL_SAMPLE_LIMIT = 400;

export function derivePersonalModel(history: VideoRecord[]): PersonalModel {
  // Süresi okunamamış kayıtlarda tamamlanma zorunlu olarak 0'dır; ağırlık
  // öğrenimine girerlerse model gerçekte olmayan bir başarısızlık öğrenir.
  const eligible = history.filter((video) =>
    !video.excludedFromAnalytics && !video.isCurrentlyWatching && hasMeasurableDuration(video));
  const videos = eligible.length > MODEL_SAMPLE_LIMIT
    ? eligible.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, MODEL_SAMPLE_LIMIT)
    : eligible;

  // Başlık profili her video için yalnızca bir kez hesaplanır; aksi halde
  // güvenilirlik döngüleri O(n²) pahalı intelligence analizi çalıştırır.
  const intelligenceCache = new Map<string, ReturnType<typeof analyzeVideoIntelligence>>();
  const intelligenceOf = (video: VideoRecord) => {
    let cached = intelligenceCache.get(video.videoId);
    if (!cached) {
      // Geçmiş listesi bilerek geçilmiyor: burada yalnızca amaç ve başlık
      // örüntüleri okunuyor, bunlar videonun kendi metninden çıkıyor. Listeyi
      // geçirmek her kayıt için tüm geçmişi tarayıp analizi O(n²)'ye çıkarıyordu.
      cached = analyzeVideoIntelligence(video);
      intelligenceCache.set(video.videoId, cached);
    }
    return cached;
  };

  const reliability: Record<PersonalSignal, number> = {
    channel: outcomeReliability(videos, (video) => [video.channelName]),
    topic: outcomeReliability(videos, (video) => video.topics),
    duration: outcomeReliability(videos, (video) => [durationBucket(video.durationSeconds)]),
    title: outcomeReliability(videos, (video) => {
      // history argümanını geçirerek title pattern analizini daha güvenilir yap
      const profile = intelligenceOf(video);
      return [profile.intent, ...profile.titlePatterns];
    }),
    format: outcomeReliability(videos, (video) => [recordVideoFormat(video)]),
  };

  const learned = (Object.keys(defaults) as PersonalSignal[]).map((key) => ({
    key,
    raw: defaults[key] * (0.5 + reliability[key]),
  }));
  const total = learned.reduce((sum, item) => sum + item.raw, 0);
  const weights = Object.fromEntries(
    learned.map((item) => [item.key, round(item.raw / total, 3)])
  ) as Record<PersonalSignal, number>;

  // Gerçek tahmin doğruluğunu hesapla
  const snapshotVideos = videos.filter(
    (video) => video.predictionSnapshot?.estimatedCompletion !== undefined
  );
  let outcomeAccuracy: number | undefined;
  if (snapshotVideos.length >= 3) {
    const accurate = snapshotVideos.filter(
      (video) => Math.abs((video.predictionSnapshot!.estimatedCompletion ?? 0) - video.completionRate * 100) <= 20
    ).length;
    outcomeAccuracy = round(accurate / snapshotVideos.length, 2);
  }

  // Adaptasyon nesli: her 10 snapshot'ta bir artar
  const adaptationGeneration = Math.floor(snapshotVideos.length / 10);

  return {
    version: "adaptive-v3",
    // Kullanıcıya gösterilen sayı gerçek geçmiş büyüklüğüdür; yukarıdaki sınır
    // yalnızca güvenilirlik hesabının örneklemini bağlar.
    sampleCount: eligible.length,
    confidence: eligible.length >= 20 ? "high" : eligible.length >= 8 ? "medium" : "low",
    weights,
    reliability,
    outcomeAccuracy,
    adaptationGeneration,
    calibratedAt: new Date().toISOString(),
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
