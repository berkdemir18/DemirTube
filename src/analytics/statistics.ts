import type { VideoRecord, WatchSession } from "../shared/types";
import { round } from "../shared/utils";

export type AdvancedStatistics = {
  videoCount: number;
  sessionCount: number;
  activeWatchSeconds: number;
  uniqueWatchSeconds: number;
  rewatchSeconds: number;
  averageSessionSeconds: number;
  averageCompletion: number;
  completedRate: number;
  revisitRate: number;
  activeDayCount: number;
  longestSessionSeconds: number;
  peakHourLabel: string;
  hourly: Array<{ label: string; seconds: number }>;
  formats: Array<{ label: string; count: number; seconds: number }>;
};

const formatLabels: Record<string, string> = {
  unboxing: "Kutu açılışı",
  hands_on_review: "Ürün incelemesi",
  explainer: "Açıklayıcı",
  deep_dive: "Derin analiz",
  screen_demo: "Ekran demosu",
  step_by_step: "Adım adım",
  conversation: "Sohbet",
  interview: "Röportaj",
  gameplay_series: "Oynanış",
  video_essay: "Video deneme",
  general: "Genel"
};

export function advancedStatistics(videos: VideoRecord[], sessions: WatchSession[]): AdvancedStatistics {
  const activeWatchSeconds = sessions.reduce((sum, session) => sum + session.watchSeconds, 0);
  const uniqueWatchSeconds = videos.reduce((sum, video) => sum + video.uniqueWatchedSeconds, 0);
  const rewatchSeconds = videos.reduce((sum, video) => sum + video.rewatchSeconds, 0);
  const averageCompletion = videos.length
    ? round(videos.reduce((sum, video) => sum + video.completionRate, 0) / videos.length * 100)
    : 0;
  const hourly = Array.from({ length: 6 }, (_, index) => {
    const from = index * 4;
    const seconds = sessions
      .filter((session) => Math.floor(new Date(session.startedAt).getHours() / 4) === index)
      .reduce((sum, session) => sum + session.watchSeconds, 0);
    return { label: `${String(from).padStart(2, "0")}–${String(from + 4).padStart(2, "0")}`, seconds };
  });
  const peak = hourly.toSorted((a, b) => b.seconds - a.seconds)[0];
  const formats = new Map<string, { count: number; seconds: number }>();
  for (const video of videos) {
    const key = video.videoFormat ?? video.inferredVideoFormat ?? video.contentType;
    const current = formats.get(key) ?? { count: 0, seconds: 0 };
    formats.set(key, { count: current.count + 1, seconds: current.seconds + video.totalActiveWatchSeconds });
  }

  return {
    videoCount: videos.length,
    sessionCount: sessions.length,
    activeWatchSeconds,
    uniqueWatchSeconds,
    rewatchSeconds,
    averageSessionSeconds: sessions.length ? round(activeWatchSeconds / sessions.length) : 0,
    averageCompletion,
    completedRate: videos.length ? round(videos.filter((video) => video.completed).length / videos.length * 100) : 0,
    revisitRate: videos.length ? round(videos.filter((video) => video.sessionCount > 1).length / videos.length * 100) : 0,
    activeDayCount: new Set(sessions.map((session) => new Date(session.startedAt).toLocaleDateString("en-CA"))).size,
    longestSessionSeconds: sessions.reduce((longest, session) => Math.max(longest, session.watchSeconds), 0),
    peakHourLabel: peak?.seconds ? peak.label : "—",
    hourly,
    formats: [...formats.entries()]
      .map(([key, value]) => ({ label: formatLabels[key] ?? key.replaceAll("_", " "), ...value }))
      .toSorted((a, b) => b.seconds - a.seconds)
  };
}
