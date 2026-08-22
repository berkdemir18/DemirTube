import type { VideoRecord, WatchSession } from "../shared/types";
import { round } from "../shared/utils";
import { channelStats, topicStats } from "../dashboard/analytics";

export type MonthlyCapsule = {
  monthLabel: string;
  totalWatchSeconds: number;
  videoCount: number;
  completedCount: number;
  averageCompletion: number;
  topTopics: string[];
  topChannels: string[];
  /** "Hazırlık" kategorisinde geçen süre (üniversite hazırlığı takibi). */
  preparationSeconds: number;
  longestDaySeconds: number;
  longestDayLabel?: string;
  previousWatchSeconds: number;
  monthOverMonthPercent?: number;
};

export type YearlyWrapped = {
  year: number;
  totalWatchSeconds: number;
  videoCount: number;
  averageCompletion: number;
  topTopics: string[];
  topChannels: string[];
  longestDaySeconds: number;
  longestDayLabel?: string;
  mostRewatchedTitle?: string;
  strongestEngagementTitle?: string;
  preparationSeconds: number;
};

const inRange = (date: string, from: Date, to: Date) => {
  const time = new Date(date).getTime();
  return time >= from.getTime() && time <= to.getTime();
};

function videosOf(videos: VideoRecord[], sessions: WatchSession[]) {
  const ids = new Set(sessions.map((session) => session.videoId));
  return videos.filter((video) => ids.has(video.videoId) && !video.excludedFromAnalytics);
}

function secondsOf(sessions: WatchSession[]) {
  return sessions.reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0);
}

function averageCompletionOf(videos: VideoRecord[]) {
  return videos.length ? round(videos.reduce((sum, video) => sum + video.completionRate, 0) / videos.length * 100) : 0;
}

function preparationSecondsOf(videos: VideoRecord[], sessions: WatchSession[]) {
  const preparationIds = new Set(videos.filter((video) => video.topics.includes("Hazırlık")).map((video) => video.videoId));
  return secondsOf(sessions.filter((session) => preparationIds.has(session.videoId)));
}

function longestDay(sessions: WatchSession[]): { seconds: number; label?: string } {
  const byDay = new Map<string, number>();
  for (const session of sessions) {
    const key = session.startedAt.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + Math.max(0, session.watchSeconds));
  }
  const top = [...byDay.entries()].toSorted((a, b) => b[1] - a[1])[0];
  if (!top) return { seconds: 0 };
  return { seconds: top[1], label: new Date(`${top[0]}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }) };
}

export function monthlyCapsule(videos: VideoRecord[], sessions: WatchSession[], now = new Date()): MonthlyCapsule {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousEnd = new Date(monthStart.getTime() - 1);
  const currentSessions = sessions.filter((session) => inRange(session.startedAt, monthStart, now));
  const previousSessions = sessions.filter((session) => inRange(session.startedAt, previousStart, previousEnd));
  const currentVideos = videosOf(videos, currentSessions);
  const totalWatchSeconds = secondsOf(currentSessions);
  const previousWatchSeconds = secondsOf(previousSessions);
  const longest = longestDay(currentSessions);
  return {
    monthLabel: now.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
    totalWatchSeconds,
    videoCount: currentVideos.length,
    completedCount: currentVideos.filter((video) => video.completed).length,
    averageCompletion: averageCompletionOf(currentVideos),
    topTopics: topicStats(currentVideos).slice(0, 3).map((item) => item.topic),
    topChannels: channelStats(currentVideos).slice(0, 3).map((item) => item.channelName),
    preparationSeconds: preparationSecondsOf(currentVideos, currentSessions),
    longestDaySeconds: longest.seconds,
    longestDayLabel: longest.label,
    previousWatchSeconds,
    monthOverMonthPercent: previousWatchSeconds ? round((totalWatchSeconds - previousWatchSeconds) / previousWatchSeconds * 100) : undefined
  };
}

export function yearlyWrapped(videos: VideoRecord[], sessions: WatchSession[], now = new Date()): YearlyWrapped {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearSessions = sessions.filter((session) => inRange(session.startedAt, yearStart, now));
  const yearVideos = videosOf(videos, yearSessions);
  const longest = longestDay(yearSessions);
  const mostRewatched = yearVideos.filter((video) => video.rewatchSeconds > 30).toSorted((a, b) => b.rewatchSeconds - a.rewatchSeconds)[0];
  const strongest = yearVideos.toSorted((a, b) => b.engagementScore - a.engagementScore)[0];
  return {
    year: now.getFullYear(),
    totalWatchSeconds: secondsOf(yearSessions),
    videoCount: yearVideos.length,
    averageCompletion: averageCompletionOf(yearVideos),
    topTopics: topicStats(yearVideos).slice(0, 5).map((item) => item.topic),
    topChannels: channelStats(yearVideos).slice(0, 5).map((item) => item.channelName),
    longestDaySeconds: longest.seconds,
    longestDayLabel: longest.label,
    mostRewatchedTitle: mostRewatched?.title,
    strongestEngagementTitle: strongest?.engagementScore ? strongest.title : undefined,
    preparationSeconds: preparationSecondsOf(yearVideos, yearSessions)
  };
}
