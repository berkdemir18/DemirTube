import type { VideoRecord, WatchSession } from "../shared/types";

export type NostalgiaFlash = {
  dateLabel: string;
  watchSeconds: number;
  videoCount: number;
  topTopic?: string;
};

/** "Geçen ay bugün ne izliyordun?" — aynı günün bir ay önceki özetini döndürür. */
export function lastMonthSameDay(videos: VideoRecord[], sessions: WatchSession[], now = new Date()): NostalgiaFlash | undefined {
  const target = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  const daySessions = sessions.filter((session) => session.startedAt.slice(0, 10) === key);
  if (!daySessions.length) return undefined;
  const ids = new Set(daySessions.map((session) => session.videoId));
  const dayVideos = videos.filter((video) => ids.has(video.videoId) && !video.excludedFromAnalytics);
  const topicSeconds = new Map<string, number>();
  for (const video of dayVideos) {
    const seconds = daySessions.filter((session) => session.videoId === video.videoId).reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0);
    for (const topic of video.topics) topicSeconds.set(topic, (topicSeconds.get(topic) ?? 0) + seconds);
  }
  const topTopic = [...topicSeconds.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0];
  return {
    dateLabel: target.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }),
    watchSeconds: daySessions.reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0),
    videoCount: ids.size,
    topTopic
  };
}
