import { TOPIC_RULES } from "../shared/constants";
import type { Topic } from "../shared/types";
import { normalizeText } from "../shared/utils";

export function classifyTopics(title: string, channelName = "", context = ""): Topic[] {
  const titleText = normalizeText(title);
  const channelText = normalizeText(channelName);
  const contextText = normalizeText(context);
  const contains = (text: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
  const scored = (Object.entries(TOPIC_RULES) as [Exclude<Topic, "Diğer">, string[]][])
    .map(([topic, keywords]) => ({ topic, score: keywords.reduce((score, keyword) => {
      const term = normalizeText(keyword);
      return score + (contains(titleText, term) ? 4 : 0) + (contains(channelText, term) ? 2 : 0) + (contains(contextText, term) ? 1 : 0);
    }, 0) }))
    .filter((item) => item.score > 0)
    .toSorted((a, b) => b.score - a.score);
  const entertainment = scored.find((item) => item.topic === "Eğlence");
  if (entertainment && entertainment.score >= 4 && entertainment.score >= (scored[0]?.score ?? 0)) return ["Eğlence"];
  const topics = scored
    .slice(0, 3)
    .map((item) => item.topic);
  return topics.length ? topics : ["Diğer"];
}
