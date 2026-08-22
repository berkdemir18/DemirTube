// DemirTube Aurora UI v2 · unified dashboard visual system
import { calculateChannelAffinity } from "../analytics/channel-score";
import { durationBucket } from "../analytics/duration";
import { isEarlyAbandonment } from "../analytics/completion";
import type { ChannelPreference, TopicPreference, VideoRecord } from "../shared/types";
import { round } from "../shared/utils";

const averageOf = (videos: VideoRecord[], read: (video: VideoRecord) => number) =>
  videos.length ? videos.reduce((sum, video) => sum + read(video), 0) / videos.length : 0;

export function topicStats(videos: VideoRecord[]): TopicPreference[] {
  const map = new Map<string, VideoRecord[]>();
  videos.forEach((video) => video.topics.forEach((topic) => map.set(topic, [...(map.get(topic) ?? []), video])));
  return [...map.entries()].map(([topic, items]) => {
    const averageCompletion = averageOf(items, (video) => video.completionRate);
    const finishedItems = items.filter((video) => !video.isCurrentlyWatching);
    const earlyExitRate = finishedItems.length
      ? finishedItems.filter((v) => isEarlyAbandonment(v.totalWatchSeconds, v.completionRate)).length / finishedItems.length
      : 0;
    return { topic: topic as TopicPreference["topic"], videoCount: items.length, watchSeconds: items.reduce((s, v) => s + v.totalWatchSeconds, 0), averageCompletion: round(averageCompletion * 100), earlyExitRate: round(earlyExitRate * 100), preferenceScore: round((averageCompletion * .7 + (1 - earlyExitRate) * .3) * 100) };
  }).sort((a, b) => b.preferenceScore - a.preferenceScore);
}
export function channelStats(videos: VideoRecord[]): ChannelPreference[] {
  const map = new Map<string, VideoRecord[]>();
  videos.forEach((video) => map.set(video.channelName, [...(map.get(video.channelName) ?? []), video]));
  return [...map.entries()].map(([channelName, items]) => ({
    channelName, videoCount: items.length, watchSeconds: items.reduce((s, v) => s + v.totalWatchSeconds, 0),
    averageCompletion: round(averageOf(items, (video) => video.completionRate) * 100),
    earlyExitRate: round((items.filter((video) => !video.isCurrentlyWatching && isEarlyAbandonment(video.totalWatchSeconds, video.completionRate)).length / Math.max(items.filter((video) => !video.isCurrentlyWatching).length, 1)) * 100),
    affinityScore: calculateChannelAffinity(items)
  })).sort((a, b) => (b.affinityScore ?? -1) - (a.affinityScore ?? -1));
}
export function durationStats(videos: VideoRecord[]) {
  const order = ["0–5 dakika", "5–10 dakika", "10–20 dakika", "20–40 dakika", "40+ dakika"];
  return order.map((bucket) => {
    const items = videos.filter((video) => durationBucket(video.durationSeconds) === bucket);
    const finishedItems = items.filter((video) => !video.isCurrentlyWatching);
    return { bucket, count: items.length, completion: items.length ? round(averageOf(items, (video) => video.completionRate) * 100) : 0, watch: items.length ? round(items.reduce((s, v) => s + v.totalWatchSeconds, 0) / items.length / 60) : 0, early: finishedItems.length ? round(finishedItems.filter((v) => isEarlyAbandonment(v.totalWatchSeconds, v.completionRate)).length / finishedItems.length * 100) : 0 };
  });
}
