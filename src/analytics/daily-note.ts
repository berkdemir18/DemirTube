import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Obsidian günlük notuna yapıştırılacak tek satırlık Markdown özeti üretir. */
export function dailyNoteLine(videos: VideoRecord[], sessions: WatchSession[], date = new Date()): string {
  const key = dayKey(date);
  const daySessions = sessions.filter((session) => session.startedAt.slice(0, 10) === key);
  const ids = new Set(daySessions.map((session) => session.videoId));
  const dayVideos = videos.filter((video) => ids.has(video.videoId) && !video.excludedFromAnalytics);
  const totalSeconds = daySessions.reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0);
  const topicSeconds = new Map<string, number>();
  for (const video of dayVideos) {
    const seconds = daySessions.filter((session) => session.videoId === video.videoId).reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0);
    for (const topic of video.topics) topicSeconds.set(topic, (topicSeconds.get(topic) ?? 0) + seconds);
  }
  const topTopics = [...topicSeconds.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 2).map(([topic]) => topic);
  const averageCompletion = dayVideos.length
    ? round(dayVideos.reduce((sum, video) => sum + video.completionRate, 0) / dayVideos.length * 100, 0)
    : 0;
  const parts = [
    `**DemirTube** — ${formatDuration(totalSeconds)}`,
    `${dayVideos.length} video`,
    `%${averageCompletion} tamamlama`
  ];
  if (topTopics.length) parts.push(`Top: ${topTopics.join(", ")}`);
  return `- ${parts.join(" · ")}`;
}

/** Günlük notun tam .md çıktısı (başlıklı). */
export function dailyNoteMarkdown(videos: VideoRecord[], sessions: WatchSession[], date = new Date()): string {
  return `## ${dayKey(date)} DemirTube Özeti\n\n${dailyNoteLine(videos, sessions, date)}\n`;
}
