import type { VideoRecord } from "../shared/types";
import { clamp, round } from "../shared/utils";
import { isEarlyAbandonment } from "./completion";

/**
 * Bayesyen Yumuşatılmış Kanal Bağlılık Skoru (Bayesian Smoothed Channel Affinity v3.0)
 * Küçük örneklem sapmasını önlemek için Bayesyen Prior (C=2, Prior=0.62) kullanır.
 */
/**
 * Bağlılığın ham bileşeni. Tek bir kanal için de tüm geçmiş için de aynı formül
 * çalışır; ikincisi Bayesyen yumuşatmanın öncülü olarak kullanılır.
 */
export function rawChannelAffinity(videos: VideoRecord[]): number | undefined {
  const finishedVideos = videos.filter((video) => !video.isCurrentlyWatching);
  if (!finishedVideos.length) return undefined;
  return affinityOf(finishedVideos);
}

export function calculateChannelAffinity(videos: VideoRecord[], priorAffinity = 0.62): number | undefined {
  const finishedVideos = videos.filter((video) => !video.isCurrentlyWatching);
  if (finishedVideos.length < 3) return undefined;

  const sampleCount = finishedVideos.length;
  const rawAffinity = affinityOf(finishedVideos);

  // Bayesyen Yumuşatma: Küçük örneklerde öncüle çek, örnek arttıkça gerçek veriye yaklaş.
  // Öncül, çağıran taraf verirse kullanıcının kendi geçmişinin ortalamasıdır;
  // sabit 0.62 "izlediğinin çoğunu bitiren kullanıcı" varsayıyordu ve uzun video
  // izleyen birinde az örnekli her kanalı olduğundan iyi gösteriyordu.
  const priorWeight = 2;
  const smoothedAffinity = (rawAffinity * sampleCount + priorAffinity * priorWeight) / (sampleCount + priorWeight);

  return round(clamp(smoothedAffinity * 100, 5, 98));
}

function affinityOf(finishedVideos: VideoRecord[]): number {
  const sampleCount = finishedVideos.length;
  const rawCompletion = finishedVideos.reduce((sum, item) => sum + item.completionRate, 0) / sampleCount;

  // Tekrar izlenme oranı & ortalama aktif izleme
  const repeatRate = finishedVideos.filter((item) => item.sessionCount > 1 || item.rewatchSeconds > 15).length / sampleCount;
  const watchPerVideo = finishedVideos.reduce((sum, item) => sum + item.uniqueWatchedSeconds, 0) / sampleCount;
  const normalizedWatch = Math.min(watchPerVideo / 1200, 1);

  // Erken terk etmeme oranı
  const nonEarlyRate = 1 - finishedVideos.filter((item) => isEarlyAbandonment(item.totalActiveWatchSeconds, item.completionRate)).length / sampleCount;

  // Etkileşim derinliği (engagement & regret dengesi)
  const avgEngagement = finishedVideos.reduce((sum, item) => sum + item.engagementScore, 0) / sampleCount / 100;
  const avgRegret = finishedVideos.reduce((sum, item) => sum + item.regretScore, 0) / sampleCount / 100;

  return rawCompletion * 0.35 + repeatRate * 0.2 + normalizedWatch * 0.15 + nonEarlyRate * 0.15 + avgEngagement * 0.15 - avgRegret * 0.2;
}
