import type { UserVideoFeedback, VideoRecord } from "../shared/types";

export type FeedbackQueueItem = {
  video: VideoRecord;
  reason: string;
  priority: number;
};

export function feedbackQueue(videos: VideoRecord[], feedback: UserVideoFeedback[]): FeedbackQueueItem[] {
  const feedbackMap = new Map(feedback.map((item) => [item.videoId, item]));
  return videos.filter((video) => !video.excludedFromAnalytics).flatMap((video) => {
    const manual = feedbackMap.get(video.videoId);
    const reasons: Array<[string, number]> = [];
    if (!manual?.manualTopics?.length && (video.topics.length === 0 || video.topics.includes("Diğer"))) reasons.push(["Konusu belirsiz", 35]);
    if (!manual?.manualContentType && video.contentType === "unknown") reasons.push(["İçerik türü belirsiz", 30]);
    if (manual?.liked === undefined && video.sessionCount > 0) reasons.push(["Beğeni geri bildirimi yok", 12]);
    if (manual?.clickbait === undefined && video.regretScore >= 50) reasons.push(["Clickbait yorumu skoru netleştirir", 24]);
    if (video.regretConfidence === "low" || video.engagementConfidence === "low") reasons.push(["Davranış tahmini düşük güvenli", 18]);
    if (!reasons.length) return [];
    const highest = reasons.toSorted((a, b) => b[1] - a[1])[0];
    return [{ video, reason: highest[0], priority: highest[1] + Math.min(20, video.sessionCount) }];
  }).toSorted((a, b) => b.priority - a.priority);
}
