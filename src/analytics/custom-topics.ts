import type { CustomTopicRule, VideoRecord } from "../shared/types";
import { meaningfulDescription, normalizeText } from "../shared/utils";
import { keywordMatches } from "./topic-classifier";

export function matchCustomTopics(title: string, channelName: string, rules: CustomTopicRule[], context = "") {
  const normalizedChannel = normalizeText(channelName);
  // Kullanıcı kuralları da YouTube'un kalıp açıklamasını görmemeli; oradaki
  // kelimeler videoya ait değil.
  const usefulContext = meaningfulDescription(context);
  return rules
    .filter((rule) => rule.enabled)
    .filter((rule) =>
      // Kelime olarak geçmeli, başka kelimenin içinde değil. Açıklama/etiketler
      // gürültülü olduğu için orada "ybs" gibi kısa kısaltmalar sayılmaz.
      rule.keywords.some((keyword) => keywordMatches(title, keyword)
        || (keyword.trim().length >= 4 && keywordMatches(usefulContext, keyword)))
      || rule.channels.some((channel) => normalizedChannel.includes(normalizeText(channel)))
    )
    .toSorted((a, b) => b.priority - a.priority)
    .map((rule) => rule.name);
}

export function previewCustomTopic(rule: CustomTopicRule, videos: VideoRecord[]) {
  return videos.filter((video) => matchCustomTopics(video.title, video.channelName, [rule], `${video.description ?? ""} ${(video.hashtags ?? []).join(" ")}`).length > 0);
}
