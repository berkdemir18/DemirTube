import type { Topic, VideoRecord, WatchSession } from "../shared/types";
import { durationBucket } from "./duration";
import { round } from "../shared/utils";

export type TimeBucket = {
  key: string;
  label: string;
  totalWatchSeconds: number;
  videoCount: number;
  averageCompletion: number;
  regretRate: number;
  preferredTopics: Topic[];
  preferredDuration?: string;
};

const partOfDay = (hour: number) => hour < 6 ? "Gece" : hour < 12 ? "Sabah" : hour < 18 ? "Öğleden sonra" : "Akşam";

export function timeOfDayAnalytics(videos: VideoRecord[], sessions: WatchSession[]) {
  return buildBuckets(videos, sessions, (date) => partOfDay(date.getHours()), ["Gece", "Sabah", "Öğleden sonra", "Akşam"]);
}

export function dayOfWeekAnalytics(videos: VideoRecord[], sessions: WatchSession[]) {
  const labels = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  return buildBuckets(videos, sessions, (date) => labels[date.getDay()], labels);
}

export function weekdayWeekendAnalytics(videos: VideoRecord[], sessions: WatchSession[]) {
  return buildBuckets(videos, sessions, (date) => [0, 6].includes(date.getDay()) ? "Hafta sonu" : "Hafta içi", ["Hafta içi", "Hafta sonu"]);
}

export function hourlyAnalytics(videos: VideoRecord[], sessions: WatchSession[]) {
  return buildBuckets(videos, sessions, (date) => String(date.getHours()).padStart(2, "0"), Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")));
}

function buildBuckets(videos: VideoRecord[], sessions: WatchSession[], keyFor: (date: Date) => string, order: string[]): TimeBucket[] {
  const videosById = new Map(videos.filter((video) => !video.excludedFromAnalytics).map((video) => [video.videoId, video]));
  const grouped = new Map<string, WatchSession[]>();
  for (const session of sessions) {
    if (!videosById.has(session.videoId)) continue;
    const key = keyFor(new Date(session.startedAt));
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }
  return order.map((key) => {
    const bucketSessions = grouped.get(key) ?? [];
    const bucketVideos = [...new Set(bucketSessions.map((session) => session.videoId))].map((id) => videosById.get(id)).filter(Boolean) as VideoRecord[];
    const topics = new Map<string, number>();
    const durations = new Map<string, number>();
    bucketVideos.forEach((video) => {
      video.topics.forEach((topic) => topics.set(topic, (topics.get(topic) ?? 0) + video.totalActiveWatchSeconds));
      const duration = durationBucket(video.durationSeconds);
      durations.set(duration, (durations.get(duration) ?? 0) + video.totalActiveWatchSeconds);
    });
    return {
      key,
      label: key,
      totalWatchSeconds: bucketSessions.reduce((sum, session) => sum + session.watchSeconds, 0),
      videoCount: bucketVideos.length,
      averageCompletion: bucketVideos.length ? round(bucketVideos.reduce((sum, video) => sum + video.completionRate, 0) / bucketVideos.length * 100) : 0,
      regretRate: bucketVideos.length ? round(bucketVideos.filter((video) => video.regretScore >= 60).length / bucketVideos.length * 100) : 0,
      preferredTopics: [...topics.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 2).map(([topic]) => topic),
      preferredDuration: [...durations.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0]
    };
  });
}

export function buildTimeInsights(buckets: TimeBucket[]) {
  const withData = buckets.filter((bucket) => bucket.videoCount);
  if (!withData.length) return ["İzleme zamanı içgörüleri için veri birikiyor."];
  const completion = withData.toSorted((a, b) => b.averageCompletion - a.averageCompletion)[0];
  const regret = withData.toSorted((a, b) => b.regretRate - a.regretRate)[0];
  return [
    `En yüksek tamamlama ${completion.label.toLocaleLowerCase("tr-TR")} döneminde: %${completion.averageCompletion}.`,
    `Pişmanlık oranının en yüksek olduğu dönem ${regret.label.toLocaleLowerCase("tr-TR")}: %${regret.regretRate}.`
  ];
}
