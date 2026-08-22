import { classifyContentType } from "./content-type";
import { classifyTopics } from "./topic-classifier";
import type { VideoMetadata } from "../shared/types";
import { normalizeChannelName } from "../shared/utils";

/**
 * Keşfet kartı bir video hakkında yalnızca başlığı, kanalı ve süre rozetini
 * görebiliyor. İzleme sayfası ise ayrıca açıklamayı, hashtag'leri, bölüm
 * işaretlerini ve (açıksa) altyazı analizini okuyor. Aynı video için iki taraf
 * farklı konu ve format üretince aynı formül farklı puan veriyordu: kartta 78
 * yazan video panelde 41 olabiliyordu.
 *
 * Bu yüzden puanlama her iki tarafta da bulunan ortak tabana indirgenir.
 * Açıklama/altyazı gibi yalnızca izleme sayfasında olan alanlar puanı değil,
 * panelin içerik analizini besler (bkz. PreferenceResult.contentIntelligence).
 */
export function toScoringMetadata(metadata: VideoMetadata): VideoMetadata {
  const title = metadata.title.trim();
  const channelName = normalizeChannelName(metadata.channelName) || metadata.channelName;
  const durationSeconds = Math.round(metadata.durationSeconds || 0);
  const isShortsUrl = metadata.url?.includes("/shorts/") ?? false;

  // Canlı yayın / Shorts / prömiyer sayfanın yapısal gerçeğidir, metinden
  // türetilmez; bunlar korunur. Kalan türler ortak metinden yeniden hesaplanır.
  const structural = metadata.contentType === "livestream"
    || metadata.contentType === "short"
    || metadata.contentType === "premiere"
    ? metadata.contentType
    : undefined;

  return {
    ...metadata,
    title,
    channelName,
    durationSeconds,
    topics: classifyTopics(title, channelName),
    contentType: structural ?? classifyContentType({
      path: isShortsUrl ? "/shorts/" : "/watch",
      durationSeconds,
      title,
      channelName,
    }),
    description: undefined,
    hashtags: undefined,
    chapterCount: undefined,
    transcriptAnalysis: undefined,
  };
}

/** Yalnızca izleme sayfasında oluşan alanlardan biri var mı? */
export function hasWatchPageDetail(metadata: VideoMetadata): boolean {
  return Boolean(metadata.description || metadata.hashtags?.length || metadata.chapterCount || metadata.transcriptAnalysis);
}
