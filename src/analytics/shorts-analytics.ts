import type { VideoRecord, WatchSession } from "../shared/types";
import { round } from "../shared/utils";

export function shortsAnalytics(videos: VideoRecord[], sessions: WatchSession[]) {
  const shorts = videos.filter((video) => video.contentType === "short" && !video.excludedFromAnalytics);
  const ids = new Set(shorts.map((video) => video.videoId));
  const shortSessions = sessions.filter((session) => ids.has(session.videoId));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    watchSeconds: shortSessions.filter((session) => new Date(session.startedAt).getHours() === hour).reduce((sum, session) => sum + session.watchSeconds, 0)
  }));
  return {
    count: shorts.length,
    totalWatchSeconds: shortSessions.reduce((sum, session) => sum + session.watchSeconds, 0),
    averageWatchSeconds: shorts.length ? round(shorts.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0) / shorts.length) : 0,
    averageCompletion: shorts.length ? round(shorts.reduce((sum, video) => sum + video.completionRate, 0) / shorts.length * 100) : 0,
    averageEngagement: shorts.length ? round(shorts.reduce((sum, video) => sum + video.engagementScore, 0) / shorts.length) : 0,
    regretRate: shorts.length ? round(shorts.filter((video) => video.regretScore >= 60).length / shorts.length * 100) : 0,
    likedCount: shorts.filter((video) => video.engagementScore >= 60).length,
    peakHour: hourly.toSorted((a, b) => b.watchSeconds - a.watchSeconds)[0],
    hourly
  };
}
