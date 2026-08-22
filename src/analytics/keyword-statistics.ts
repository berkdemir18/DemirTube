import type { KeywordRules, KeywordStatistic, UserVideoFeedback, VideoRecord } from "../shared/types";
import { normalizeText, round } from "../shared/utils";

const STOP_WORDS = new Set([
  "ve", "ile", "bir", "bu", "için", "mi", "mı", "mu", "mü", "ama", "fakat", "çok", "daha",
  "her", "şey", "olan", "olarak", "the", "and", "of", "to", "a", "an", "in", "on", "for", "is", "are"
]);

export function titleWords(title: string, ignored: string[] = []) {
  const ignoredSet = new Set(ignored.map(normalizeText));
  return normalizeText(title)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !ignoredSet.has(word));
}

export function titleTokens(title: string, ignored: string[] = []) {
  const words = titleWords(title, ignored);
  const phrases = [2, 3].flatMap((size) =>
    words.slice(0, Math.max(0, words.length - size + 1)).map((_, index) => words.slice(index, index + size).join(" "))
  );
  return [...new Set([...words, ...phrases])];
}

export function calculateKeywordStatistics(
  videos: VideoRecord[],
  minimumSamples = 2,
  feedback: UserVideoFeedback[] = [],
  rules?: KeywordRules
): KeywordStatistic[] {
  const feedbackMap = new Map(feedback.map((item) => [item.videoId, item]));
  const map = new Map<string, { count: number; completion: number; regret: number; regretCount: number; engagement: number; clickbait: number }>();
  for (const video of videos) {
    const manual = feedbackMap.get(video.videoId);
    if (video.excludedFromAnalytics || manual?.excludedFromAnalytics) continue;
    for (const keyword of titleTokens(video.title, rules?.ignored)) {
      const item = map.get(keyword) ?? { count: 0, completion: 0, regret: 0, regretCount: 0, engagement: 0, clickbait: 0 };
      item.count += 1;
      item.completion += video.completionRate;
      item.regret += video.regretScore;
      item.regretCount += video.regretScore >= 60 ? 1 : 0;
      item.engagement += video.engagementScore ?? 0;
      item.clickbait += manual?.clickbait === true ? 1 : 0;
      map.set(keyword, item);
    }
  }
  return [...map.entries()]
    .filter(([, value]) => value.count >= minimumSamples)
    .map(([keyword, value]) => ({
      keyword,
      kind: keyword.includes(" ") ? "phrase" as const : "word" as const,
      count: value.count,
      averageCompletion: round(value.completion / value.count * 100),
      averageRegretScore: round(value.regret / value.count),
      regretRate: round(value.regretCount / value.count * 100),
      averageEngagementScore: round(value.engagement / value.count),
      confirmedClickbaitRate: round(value.clickbait / value.count * 100),
      confidence: value.count >= 5 ? "high" as const : value.count >= 3 ? "medium" as const : "low" as const
    }))
    .sort((a, b) => b.count - a.count);
}
