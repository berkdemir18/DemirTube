import { readYouTubeOEmbed } from "../shared/youtube-oembed";
import { sessionRepository } from "../storage/session-repository";
import { videoRepository } from "../storage/video-repository";
import { isJunkVideoTitle, UNKNOWN_CHANNEL } from "../shared/utils";
import { classifyTopics } from "../analytics/topic-classifier";
import type { VideoRecord } from "../shared/types";

const REPAIR_KEY = "youtubeMetadataRepairAt";
const REPAIR_INTERVAL_MS = 15 * 60_000;
const REPAIR_BATCH = 8;

/**
 * Eski sürüm, Shorts'ta başlık yerine yorum butonunun etiketini veya sekme
 * başlığını saklıyordu. Bu kayıtlar konu sınıflandırmasını ve başlık
 * örüntülerini bozuyor; oEmbed'den gerçek başlıkla onarılabilirler.
 */
export function needsMetadataRepair(video: Pick<VideoRecord, "title" | "channelName">) {
  return video.channelName === UNKNOWN_CHANNEL || isJunkVideoTitle(video.title ?? "");
}

export async function repairUnknownChannels() {
  const stored = await chrome.storage.local.get(REPAIR_KEY);
  const lastAttempt = Number(stored[REPAIR_KEY] ?? 0);
  if (Date.now() - lastAttempt < REPAIR_INTERVAL_MS) return 0;
  await chrome.storage.local.set({ [REPAIR_KEY]: Date.now() });

  const broken = (await videoRepository.all()).filter(needsMetadataRepair).slice(0, REPAIR_BATCH);

  const results = await Promise.all(broken.map(async (video) => {
    const metadata = await readYouTubeOEmbed(video.videoId);
    const repairedTitle = metadata?.title && !isJunkVideoTitle(metadata.title) ? metadata.title : "";
    const repairedChannel = metadata?.author_name || "";
    if (!repairedTitle && !repairedChannel) return false;

    const title = repairedTitle || video.title;
    const channelName = repairedChannel || video.channelName;
    await videoRepository.rebuild({
      videoId: video.videoId,
      title,
      channelName,
      channelId: metadata?.author_url?.match(/\/channel\/([^/?]+)/)?.[1] ?? video.channelId,
      url: video.url,
      durationSeconds: video.durationSeconds,
      // Başlık düzeldiyse konular da yeniden çıkarılmalı: bozuk başlıkla
      // sınıflandırılan kayıtların neredeyse tamamı "Diğer" olarak kalmıştı.
      topics: repairedTitle ? classifyTopics(title, channelName, video.description ?? "") : video.topics,
      likeStatus: video.likeStatus,
      thumbnailUrl: video.thumbnailUrl,
      contentType: video.contentType
    }, await sessionRepository.byVideo(video.videoId));
    return true;
  }));
  return results.filter(Boolean).length;
}
