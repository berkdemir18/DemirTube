import type { CustomTopicRule, VideoRecord } from "../shared/types";
import { normalizeText } from "../shared/utils";

export function matchCustomTopics(title: string, channelName: string, rules: CustomTopicRule[], context = "") {
  const normalizedTitle = normalizeText(`${title} ${context}`);
  const normalizedChannel = normalizeText(channelName);
  return rules
    .filter((rule) => rule.enabled)
    .filter((rule) =>
      rule.keywords.some((keyword) => normalizedTitle.includes(normalizeText(keyword)))
      || rule.channels.some((channel) => normalizedChannel.includes(normalizeText(channel)))
    )
    .toSorted((a, b) => b.priority - a.priority)
    .map((rule) => rule.name);
}

export function previewCustomTopic(rule: CustomTopicRule, videos: VideoRecord[]) {
  return videos.filter((video) => matchCustomTopics(video.title, video.channelName, [rule], `${video.description ?? ""} ${(video.hashtags ?? []).join(" ")}`).length > 0);
}
