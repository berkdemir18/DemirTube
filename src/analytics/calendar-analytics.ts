import type { VideoRecord, WatchSession } from "../shared/types";
import { round } from "../shared/utils";

export type CalendarDay = {
  date: string;
  watchSeconds: number;
  videoCount: number;
  averageCompletion: number;
  regretCount: number;
  topics: string[];
  videoIds: string[];
};

export function calendarAnalytics(videos: VideoRecord[], sessions: WatchSession[], days = 90, now = new Date()): CalendarDay[] {
  const videoMap = new Map(videos.map((video) => [video.videoId, video]));
  const grouped = new Map<string, WatchSession[]>();
  for (const session of sessions) {
    const date = localDateKey(new Date(session.startedAt));
    grouped.set(date, [...(grouped.get(date) ?? []), session]);
  }
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - offset));
    const key = localDateKey(date);
    const daySessions = grouped.get(key) ?? [];
    const dayVideos = [...new Set(daySessions.map((session) => session.videoId))].map((id) => videoMap.get(id)).filter(Boolean) as VideoRecord[];
    const topicCounts = new Map<string, number>();
    dayVideos.forEach((video) => video.topics.forEach((topic) => topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1)));
    return {
      date: key,
      watchSeconds: daySessions.reduce((sum, session) => sum + session.watchSeconds, 0),
      videoCount: dayVideos.length,
      averageCompletion: dayVideos.length ? round(dayVideos.reduce((sum, video) => sum + video.completionRate, 0) / dayVideos.length * 100) : 0,
      regretCount: dayVideos.filter((video) => video.regretScore >= 60).length,
      topics: [...topicCounts.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic),
      videoIds: dayVideos.map((video) => video.videoId)
    };
  });
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
