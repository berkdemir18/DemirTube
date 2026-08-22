import type { VideoRecord } from "../shared/types";

export type ChannelDiversity = {
  channelCount: number;
  /** Sürenin yüzde kaçı en çok izlenen kanaldan (0-100). */
  topShare: number;
  topChannel?: string;
  label: string;
};

/** Kanal çeşitliliği: tek kanala gömülme mi, dengeli keşif mi? */
export function channelDiversity(videos: VideoRecord[]): ChannelDiversity {
  const totals = new Map<string, number>();
  let total = 0;
  for (const video of videos) {
    if (video.excludedFromAnalytics) continue;
    totals.set(video.channelName, (totals.get(video.channelName) ?? 0) + video.totalActiveWatchSeconds);
    total += video.totalActiveWatchSeconds;
  }
  const sorted = [...totals.entries()].toSorted((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const topShare = total > 0 && top ? Math.round((top[1] / total) * 100) : 0;
  const label = !sorted.length
    ? "Henüz kanal verisi yok"
    : topShare >= 60
      ? "Tek kanala gömülmüş durumdasın"
      : topShare >= 40
        ? "Birkaç kanal arasında dengeli"
        : "Geniş bir keşif yelpazen var";
  return { channelCount: sorted.length, topShare, topChannel: top?.[0], label };
}
