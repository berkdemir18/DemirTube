import { durationBucket } from "./duration";
import { hasMeasurableDuration } from "./completion";
import { calculateChannelAffinity, rawChannelAffinity } from "./channel-score";
import { calculateKeywordStatistics, titleWords } from "./keyword-statistics";
import type { VideoMetadata, VideoRecord } from "../shared/types";
import { channelKey, clamp, round } from "../shared/utils";
import { analyzeVideoIntelligence, evaluateWatchOutcome, recordVideoFormat, type VideoIntelligence, type WatchOutcome } from "./video-intelligence";
import { derivePersonalModel, type PersonalModel } from "./personal-model";
import { hasWatchPageDetail, toScoringMetadata } from "./scoring-metadata";

export type PreferenceResult = {
  enoughData: boolean;
  score?: number;
  estimatedCompletion?: number;
  explanation: string[];
  /** Puanı üreten analiz; keşfet kartı ile panelde aynı tabandan hesaplanır. */
  intelligence: VideoIntelligence;
  /**
   * Açıklama, hashtag ve altyazı da okunduğunda oluşan zengin analiz. Yalnızca
   * gösterim içindir; puanı değiştirmez. İzleme sayfası dışında `intelligence`
   * ile aynıdır.
   */
  contentIntelligence: VideoIntelligence;
  outcome?: WatchOutcome;
  model: PersonalModel;
  signals?: {
    channel: number | undefined;
    topic: number | undefined;
    duration: number | undefined;
    keyword: number | undefined;
    format: number | undefined;
  };
  signalEvidence?: {
    channel: string;
    topic: string;
    duration: string;
    keyword: string;
    format: string;
  };
};

/**
 * Geçmişteki her başlığın n-gram'ı, puanlanan her aday için yeniden
 * çıkarılıyordu (keşfette 40 kart × tüm geçmiş). Başlık metni değişmediği için
 * sonuç saklanabilir.
 */
const ngramCache = new Map<string, string[]>();

function cachedNgrams(title: string): string[] {
  let cached = ngramCache.get(title);
  if (!cached) {
    cached = extractNgrams(title);
    if (ngramCache.size > 4_000) ngramCache.clear();
    ngramCache.set(title, cached);
  }
  return cached;
}

/** 2-gram ve 3-gram n-gram ifade çıkarımı. */
function extractNgrams(title: string): string[] {
  const words = titleWords(title);
  const ngrams: string[] = [...words];

  for (let i = 0; i < words.length - 1; i++) {
    ngrams.push(`${words[i]}_${words[i + 1]}`);
  }
  for (let i = 0; i < words.length - 2; i++) {
    ngrams.push(`${words[i]}_${words[i + 1]}_${words[i + 2]}`);
  }
  return ngrams;
}

/** Kosinüs benzerliği & TF-IDF kelime skoru (Advanced Semantic N-gram Scoring). */
function calculateNgramSimilarity(targetTitle: string, history: VideoRecord[], personalBaseline = 50): number {
  const targetNgrams = new Set(extractNgrams(targetTitle));
  if (!targetNgrams.size || !history.length) return 50;

  let weightedSim = 0;
  let totalWeight = 0;

  for (const item of history) {
    const itemNgrams = cachedNgrams(item.title);
    const intersection = itemNgrams.filter((ng) => targetNgrams.has(ng)).length;
    if (intersection === 0) continue;

    // Jaccard / Cosine benzerlik oranı
    const sim = intersection / Math.sqrt(targetNgrams.size * itemNgrams.length);
    // Yüksek tamamlama & yüksek etkileşimli videoların başlık benzerliğine daha çok puan
    const completionSignal = item.contentType === "livestream"
      ? Math.min(1, item.totalActiveWatchSeconds / 1_800)
      : item.completionRate;
    // Tatmin de kişisel tabana göre ölçülür: mutlak tamamlanma kullanılırsa
    // uzun video izleyen kullanıcıda her başlık "kötü" görünür.
    const relativeCompletion = clamp(0.5 + (completionSignal - personalBaseline / 100) * 1.2, 0, 1);
    const satisfactionWeight = (relativeCompletion * 0.7 + (item.engagementScore / 100) * 0.3) - (item.regretScore / 100) * 0.5;
    const lastSeenTime = item.lastSeenAt ? new Date(item.lastSeenAt).getTime() : Date.now();
    const recencyDays = Math.max(0, (Date.now() - (isNaN(lastSeenTime) ? Date.now() : lastSeenTime)) / (1000 * 60 * 60 * 24));
    const recencyWeight = Math.exp(-recencyDays / 25);

    weightedSim += sim * satisfactionWeight * recencyWeight * 100;
    totalWeight += recencyWeight;
  }

  if (totalWeight === 0) return 50;
  const rawScore = 50 + (weightedSim / totalWeight) * 45;
  return clamp(rawScore, 10, 98);
}

/** Zamana ve Etkileşim Derinliğine göre ağırlıklı tamamlama. */
function weightedCompletion(videos: VideoRecord[]): number {
  if (!videos.length) return 50;
  const now = Date.now();
  let totalWeight = 0;
  let weightedSum = 0;

  for (const v of videos) {
    const ageDays = (now - new Date(v.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.exp(-ageDays / 30);
    // Rewatch (tekrar izleme) ve etkileşim bonusu
    const engagementBoost = 1 + (v.rewatchSeconds > 10 ? 0.15 : 0) + (v.engagementScore / 200);
    const weight = timeDecay * engagementBoost;

    const completionSignal = v.contentType === "livestream"
      ? Math.min(100, v.totalActiveWatchSeconds / 18)
      : v.completionRate * 100;
    const netCompletion = completionSignal - (v.regretScore * 0.3);
    weightedSum += netCompletion * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? clamp(weightedSum / totalWeight) : 50;
}

/**
 * Mutlak tamamlanma yüzdesini kullanıcının kendi genel izleme tabanına göre
 * ayırır. Az örnekli gruplar nötre yakın kalır; tekrarlanan güçlü/zayıf
 * davranışlar ise 50 çevresindeki sıkışmadan çıkar.
 *
 * Ölçüt yalnızca kişisel tabandır. Önceki sürümde ayrıca sabit %50 tamamlanmaya
 * çapalı bir terim vardı; bu, "izlediğinin yarısını bitiren kullanıcı"yı normal
 * kabul ediyordu. Uzun video izleyen biri için gerçek taban %25 civarında olduğu
 * için en sevdiği konu bile tabanının belirgin üstündeyken 50'nin altına
 * düşüyor, tüm puanlar 10–30 bandına sıkışıyordu.
 */
export function calibratePreferenceSignal(observed: number, personalBaseline: number, sampleCount: number): number {
  const sampleStrength = sampleCount / (sampleCount + 2);
  const relativeLift = (observed - personalBaseline) * 1.6 * sampleStrength;
  // Mutlak bileşen tamamen atılmaz: gerçekten bitirilen içerik, kullanıcının
  // tabanı ne olursa olsun daha iyi bir eşleşmedir. Ancak ağırlığı küçüktür ve
  // çapa 55'tir; eski 0.7 ağırlıklı 50 çapası, tabanı %25 olan kullanıcıda her
  // sinyali 17 puan aşağı çekip tüm puanları 10–30 bandına sıkıştırıyordu.
  const absoluteLift = (observed - 55) * 0.25;
  return round(clamp(50 + relativeLift + absoluteLift, 5, 98));
}

/** Günün saat dilimi biyolojik odak bonusu. */
function timeOfDayBonus(metadata: VideoMetadata): number {
  const hour = new Date().getHours();
  const isLateNight = hour >= 23 || hour < 6;
  const isShortDuration = metadata.durationSeconds < 600;

  if (isLateNight && isShortDuration) return 4;
  if (!isLateNight && !isShortDuration) return 3;
  return 0;
}

export function calculatePreference(
  fullMetadata: VideoMetadata,
  history: VideoRecord[],
  precomputedModel?: PersonalModel
): PreferenceResult {
  // Puan yalnızca keşfet kartında da okunabilen alanlardan hesaplanır; aksi
  // halde aynı video kartta ve panelde farklı puan alıyordu.
  const metadata = toScoringMetadata(fullMetadata);
  const current = history.find((video) => video.videoId === metadata.videoId);
  // Süresi okunamamış kayıtların tamamlanma oranı zorunlu olarak 0'dır; tercih
  // istatistiklerine girerlerse tüm sinyalleri aşağı çekerler.
  const eligible = history.filter((video) => video.videoId !== metadata.videoId && hasMeasurableDuration(video));
  const intelligence = analyzeVideoIntelligence(metadata, eligible);
  const contentIntelligence = hasWatchPageDetail(fullMetadata)
    ? analyzeVideoIntelligence(fullMetadata, eligible)
    : intelligence;
  const outcome = evaluateWatchOutcome(current, contentIntelligence);
  const model = precomputedModel ?? derivePersonalModel(eligible);
  const metadataChannel = channelKey(metadata.channelName);

  if (eligible.length < 5) {
    return {
      enoughData: false,
      explanation: ["Kişisel uygunluk tahmini için en az 5 önceki video gerekiyor; içerik analizi yine de hazır."],
      intelligence,
      contentIntelligence,
      outcome,
      model,
    };
  }

  const channelVideos = eligible.filter((video) => channelKey(video.channelName) === metadataChannel);
  const topicVideos = eligible.filter((video) => video.topics.some((topic) => metadata.topics.includes(topic)));
  const isLivestream = metadata.contentType === "livestream";
  const durationVideos = eligible.filter((video) => isLivestream
    ? video.contentType === "livestream"
    : durationBucket(video.durationSeconds) === durationBucket(metadata.durationSeconds));
  const formatVideos = eligible.filter((video) => recordVideoFormat(video) === intelligence.format);

  // Az örnekli kanallar kullanıcının kendi ortalamasına çekilir, evrensel bir öncüle değil.
  const channel = calculateChannelAffinity(channelVideos, rawChannelAffinity(eligible));
  const personalBaseline = weightedCompletion(eligible);
  const observedTopic = topicVideos.length ? weightedCompletion(topicVideos) : undefined;
  const observedDuration = durationVideos.length ? weightedCompletion(durationVideos) : undefined;
  const observedFormat = formatVideos.length ? weightedCompletion(formatVideos) : undefined;
  const topic = observedTopic === undefined ? 50 : calibratePreferenceSignal(observedTopic, personalBaseline, topicVideos.length);
  const duration = observedDuration === undefined ? 50 : calibratePreferenceSignal(observedDuration, personalBaseline, durationVideos.length);
  const format = observedFormat === undefined ? 50 : calibratePreferenceSignal(observedFormat, personalBaseline, formatVideos.length);

  // Gelişmiş Semantik N-Gram Kosinüs Benzerliği
  const ngramScore = calculateNgramSimilarity(metadata.title, eligible, personalBaseline);

  // Eski kelime analizi ile N-Gram skoru harmanlama
  const keywordStats = calculateKeywordStatistics(eligible, 2);
  const matched = keywordStats.filter((stat) => titleWords(metadata.title).includes(stat.keyword));
  const legacyKeyword = matched.length
    ? clamp(50 + (matched.reduce((sum, stat) => sum + stat.averageCompletion - stat.averageRegretScore * 0.4, 0) / matched.length
      - personalBaseline) * 1.4, 5, 98)
    : 50;

  const hasTitleEvidence = matched.length > 0 || eligible.some((item) =>
    titleWords(item.title).some((word) => titleWords(metadata.title).includes(word))
  );
  const keyword = round(ngramScore * 0.65 + legacyKeyword * 0.35);
  const observedKeyword = hasTitleEvidence ? keyword : undefined;

  // Pişmanlık cezası (Regret penalty)
  const isRegretChannel = channelVideos.some((v) => v.regretScore >= 60);
  const regretPenalty = isRegretChannel ? 14 : 0;

  const effectiveChannelWeight = channel !== undefined ? model.weights.channel : 0;
  const extraTopicWeight = channel !== undefined ? 0 : model.weights.channel;

  const rawScore =
    (channel ?? topic) * (effectiveChannelWeight + (channel !== undefined ? 0 : model.weights.channel * 0.5)) +
    topic * (model.weights.topic + extraTopicWeight * 0.5) +
    duration * model.weights.duration +
    keyword * model.weights.title +
    format * model.weights.format +
    timeOfDayBonus(metadata) -
    regretPenalty;

  const spread = model.confidence === "high" ? 1.55 : model.confidence === "medium" ? 1.4 : 1.2;
  const score = round(clamp(50 + (rawScore - 50) * spread, 5, 99));

  const channelW = channel !== undefined ? model.weights.channel : 0;
  const topicW = model.weights.topic + (channel !== undefined ? 0 : model.weights.channel);
  const estimatedCompletion = isLivestream ? undefined : round(clamp(
    (channel ?? observedTopic ?? personalBaseline) * channelW
      + (observedTopic ?? personalBaseline) * topicW
      + (observedDuration ?? personalBaseline) * model.weights.duration
      + keyword * model.weights.title
      + (observedFormat ?? personalBaseline) * model.weights.format
  ));

  const explanations: string[] = [];
  if (channel !== undefined) {
    explanations.push(`${metadata.channelName} kanalından önceki izlemelerinize göre uyum %${round(channel)}.`);
  }
  if (topicVideos.length) {
    explanations.push(isLivestream
      ? `${metadata.topics.slice(0, 2).join(", ")} konularındaki geçmiş canlı yayın ilgin %${round(topic)} düzeyinde.`
      : `${metadata.topics.slice(0, 2).join(", ")} konularındaki ortalama tamamlama %${round(topic)}.`);
  }
  if (formatVideos.length) {
    explanations.push(`${intelligence.formatLabel} formatındaki ${formatVideos.length} geçmiş videoya göre uyum %${round(format)}.`);
  }
  if (regretPenalty > 0) {
    explanations.push("⚠️ Bu kanaldaki geçmiş videolarınızda yüksek pişmanlık oranı tespit edildi.");
  }
  if (!explanations.length) {
    explanations.push(isLivestream
      ? "Canlı yayın uyumu; kanal, konu, başlık ve geçmiş canlı yayın izleme süresiyle hesaplandı."
      : "Geçmiş izleme süreleriniz, semantik başlık benzerliği ve içerik yapısı karşılaştırılarak hesaplandı.");
  }

  return {
    enoughData: true,
    score,
    estimatedCompletion,
    explanation: explanations,
    intelligence,
    contentIntelligence,
    outcome,
    model,
    signals: {
      channel,
      topic: observedTopic === undefined ? undefined : topic,
      duration: observedDuration === undefined ? undefined : duration,
      keyword: observedKeyword === undefined ? undefined : round(observedKeyword),
      format: observedFormat === undefined ? undefined : format,
    },
    signalEvidence: {
      channel: channelVideos.length >= 3
        ? `${channelVideos.length} önceki video üzerinden ölçüldü`
        : channelVideos.length
          ? `${channelVideos.length} video var · ölçüm için en az 3 gerekli`
          : "Bu kanalda önceki izleme yok",
      topic: topicVideos.length
        ? `${topicVideos.length} benzer konulu video · kişisel taban %${round(personalBaseline)} üzerinden kalibre edildi`
        : "Benzer konuda geçmiş yok · nötr öncül kullanıldı",
      duration: durationVideos.length
        ? `${durationVideos.length} benzer süreli video · kişisel taban %${round(personalBaseline)} üzerinden kalibre edildi`
        : "Bu süre aralığında geçmiş yok · nötr öncül kullanıldı",
      keyword: hasTitleEvidence
        ? `${matched.length || 1} başlık örüntüsüyle karşılaştırıldı`
        : "Benzer başlık örüntüsü yok · nötr öncül kullanıldı",
      format: formatVideos.length
        ? `${formatVideos.length} aynı formattaki video · kişisel taban %${round(personalBaseline)} üzerinden kalibre edildi`
        : "Bu formatta geçmiş yok · nötr öncül kullanıldı",
    },
  };
}
