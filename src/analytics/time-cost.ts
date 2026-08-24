// DemirTube · zaman maliyeti
//
// Pişmanlık skoru ve aktif süre ürünün içinde ayrı ayrı vardı ama hiç çarpılmıyordu:
// "şu videodan pişman oldun" bilgisi tek başına davranış değiştirmiyor, "bu ay 6 sa
// 20 dk pişman olduğun içeriğe gitti ve %70'i üç kanaldan" değiştiriyor.
//
// Tanım (açıklanabilir olsun diye eşik yerine ağırlık):
//   maliyet(video) = aktif izleme süresi × (pişmanlık puanı / 100)
// Eşik kullanılsaydı 59 puanlık video sıfır, 60 puanlık video tam sayılırdı; ağırlık
// hem uçları hem ortayı dürüst taşır. Ölçülemeyen kayıtlar (süresi okunamamış,
// analiz dışı bırakılmış, hâlâ izlenen) hesabın tamamen dışındadır.
import type { Confidence, UserVideoFeedback, VideoRecord } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { hasMeasurableDuration } from "./completion";

/** Bu puandan itibaren video "yüksek pişmanlık" sayılır; yalnızca sayım için. */
export const HIGH_REGRET_SCORE = 60;

export type CostBucket = {
  key: string;
  /** Bu kovanın pişmanlık ağırlıklı maliyeti (saniye). */
  costSeconds: number;
  /** Kovaya harcanan toplam aktif süre (saniye). */
  activeSeconds: number;
  videoCount: number;
  highRegretCount: number;
  /** Toplam maliyetin yüzde kaçı bu kovada. */
  sharePercent: number;
};

export type CostVideo = {
  videoId: string;
  title: string;
  channelName: string;
  url: string;
  costSeconds: number;
  regretScore: number;
  /** Puanın nereden geldiğini gösteren hazır açıklamalar. */
  factors: string[];
};

export type TimeCostReport = {
  /** Hesaba giren kayıt sayısı. */
  measuredVideoCount: number;
  activeSeconds: number;
  costSeconds: number;
  /** Aktif sürenin yüzde kaçı maliyet. */
  costPercent: number;
  highRegretCount: number;
  channels: CostBucket[];
  topics: CostBucket[];
  worstVideos: CostVideo[];
  /** En pahalı kanalların toplam maliyetteki payı (ilk 3). */
  topChannelSharePercent: number;
  verdict: string;
  confidence: Confidence;
};

const EMPTY: TimeCostReport = {
  measuredVideoCount: 0, activeSeconds: 0, costSeconds: 0, costPercent: 0, highRegretCount: 0,
  channels: [], topics: [], worstVideos: [], topChannelSharePercent: 0,
  verdict: "Bu dönemde ölçülebilir kayıt yok.", confidence: "low",
};

function bucketsFrom(
  entries: Array<{ key: string; costSeconds: number; activeSeconds: number; highRegret: boolean }>,
  totalCost: number,
  limit: number
): CostBucket[] {
  const map = new Map<string, CostBucket>();
  for (const entry of entries) {
    const current = map.get(entry.key) ?? {
      key: entry.key, costSeconds: 0, activeSeconds: 0, videoCount: 0, highRegretCount: 0, sharePercent: 0,
    };
    current.costSeconds += entry.costSeconds;
    current.activeSeconds += entry.activeSeconds;
    current.videoCount += 1;
    if (entry.highRegret) current.highRegretCount += 1;
    map.set(entry.key, current);
  }
  return [...map.values()]
    .map((bucket) => ({
      ...bucket,
      costSeconds: Math.round(bucket.costSeconds),
      activeSeconds: Math.round(bucket.activeSeconds),
      sharePercent: totalCost > 0 ? round(bucket.costSeconds / totalCost * 100, 0) : 0,
    }))
    .filter((bucket) => bucket.costSeconds > 0)
    .toSorted((a, b) => b.costSeconds - a.costSeconds)
    .slice(0, limit);
}

/**
 * Güven, ürünün geri kalanıyla aynı ilkeye uyar: az örnekte kesin konuşma.
 * Kullanıcı geri bildirimi (clickbait/kazara/beğeni) pişmanlığı doğrudan
 * beslediği için, geri bildirim oranı güveni yükseltir.
 */
function confidenceOf(measured: number, feedbackCount: number): Confidence {
  if (measured < 10) return "low";
  if (measured >= 30 && feedbackCount >= 3) return "high";
  return "medium";
}

function verdictOf(report: Omit<TimeCostReport, "verdict" | "confidence">): string {
  if (!report.measuredVideoCount) return EMPTY.verdict;
  if (report.costSeconds < 60) return "Bu dönemde ölçülebilir bir zaman kaybı görünmüyor.";

  const cost = formatDuration(report.costSeconds);
  const top = report.channels[0];
  if (top && report.topChannelSharePercent >= 50) {
    return `Bu dönemde ${cost} pişman olduğun içeriğe gitti; ${report.topChannelSharePercent >= 50 ? "yarısından fazlası" : "önemli bölümü"} en pahalı üç kanaldan ve en başta ${top.key} var.`;
  }
  return `Bu dönemde ${cost} pişman olduğun içeriğe gitti; maliyet tek bir kanalda toplanmıyor, geneline yayılmış.`;
}

export function calculateTimeCost(
  videos: VideoRecord[],
  feedback: UserVideoFeedback[] = []
): TimeCostReport {
  const feedbackIds = new Set(feedback.map((item) => item.videoId));

  const measured = videos.filter((video) =>
    !video.excludedFromAnalytics
    && !video.isCurrentlyWatching
    && hasMeasurableDuration(video)
    && video.totalActiveWatchSeconds > 0
  );
  if (!measured.length) return EMPTY;

  const entries = measured.map((video) => {
    const weight = Math.min(100, Math.max(0, video.regretScore)) / 100;
    return {
      video,
      costSeconds: video.totalActiveWatchSeconds * weight,
      highRegret: video.regretScore >= HIGH_REGRET_SCORE,
    };
  });

  const activeSeconds = Math.round(measured.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0));
  const costSeconds = Math.round(entries.reduce((sum, entry) => sum + entry.costSeconds, 0));

  const channels = bucketsFrom(
    entries.map((entry) => ({
      key: entry.video.channelName,
      costSeconds: entry.costSeconds,
      activeSeconds: entry.video.totalActiveWatchSeconds,
      highRegret: entry.highRegret,
    })),
    costSeconds,
    6
  );

  const topics = bucketsFrom(
    entries.flatMap((entry) => (entry.video.topics.length ? entry.video.topics : ["Diğer"]).map((topic) => ({
      key: topic,
      costSeconds: entry.costSeconds,
      activeSeconds: entry.video.totalActiveWatchSeconds,
      highRegret: entry.highRegret,
    }))),
    costSeconds,
    6
  );

  const worstVideos: CostVideo[] = entries
    .filter((entry) => entry.costSeconds >= 30)
    .toSorted((a, b) => b.costSeconds - a.costSeconds)
    .slice(0, 8)
    .map((entry) => ({
      videoId: entry.video.videoId,
      title: entry.video.title,
      channelName: entry.video.channelName,
      url: entry.video.url,
      costSeconds: Math.round(entry.costSeconds),
      regretScore: Math.round(entry.video.regretScore),
      factors: entry.video.regretFactors ?? [],
    }));

  const base = {
    measuredVideoCount: measured.length,
    activeSeconds,
    costSeconds,
    costPercent: activeSeconds > 0 ? round(costSeconds / activeSeconds * 100, 0) : 0,
    highRegretCount: entries.filter((entry) => entry.highRegret).length,
    channels,
    topics,
    worstVideos,
    topChannelSharePercent: channels.slice(0, 3).reduce((sum, bucket) => sum + bucket.sharePercent, 0),
  };

  return {
    ...base,
    verdict: verdictOf(base),
    confidence: confidenceOf(measured.length, measured.filter((video) => feedbackIds.has(video.videoId)).length),
  };
}
