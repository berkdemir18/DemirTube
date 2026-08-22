import type { SelectionReason, VideoRecord } from "../shared/types";
import { durationBucket } from "./duration";
import { titleWords } from "./keyword-statistics";
import { evidenceLevel } from "./evidence";
import { round } from "../shared/utils";

export function selectionReasons(video: VideoRecord, history: VideoRecord[]): SelectionReason[] {
  const eligible = history.filter((item) => item.videoId !== video.videoId && !item.excludedFromAnalytics);
  const candidates: Array<{ key: SelectionReason["key"]; label: string; items: VideoRecord[]; explanation: string }> = [
    { key: "channel", label: "Kanal alışkanlığı", items: eligible.filter((item) => item.channelName === video.channelName), explanation: `${video.channelName} kanalındaki geçmiş davranışın` },
    { key: "topic", label: "Konu ilgisi", items: eligible.filter((item) => item.topics.some((topic) => video.topics.includes(topic))), explanation: `${video.topics.slice(0, 2).join(", ")} konularındaki geçmişin` },
    { key: "duration", label: "Süre uyumu", items: eligible.filter((item) => durationBucket(item.durationSeconds) === durationBucket(video.durationSeconds)), explanation: `${durationBucket(video.durationSeconds)} aralığındaki seçimlerin` },
    { key: "title", label: "Başlık etkisi", items: eligible.filter((item) => titleWords(item.title).some((word) => titleWords(video.title).includes(word))), explanation: "Benzer başlık kelimelerine verdiğin tepkiler" },
    { key: "content_type", label: "İçerik türü", items: eligible.filter((item) => item.contentType === video.contentType), explanation: `${video.contentType} içerik geçmişin` }
  ];
  return candidates.map((candidate) => {
    const averageEngagement = candidate.items.length ? candidate.items.reduce((sum, item) => sum + item.engagementScore, 0) / candidate.items.length : 0;
    const averageCompletion = candidate.items.length ? candidate.items.reduce((sum, item) => sum + item.completionRate, 0) / candidate.items.length * 100 : 0;
    const evidence = evidenceLevel(candidate.items.length, 3, 8);
    const score = round(averageEngagement * .55 + averageCompletion * .45);
    return {
      key: candidate.key,
      label: candidate.label,
      score,
      explanation: candidate.items.length ? `${candidate.explanation}: ${candidate.items.length} video, %${round(averageCompletion)} tamamlama.` : `${candidate.explanation} için henüz örnek yok.`,
      confidence: evidence.confidence
    };
  }).toSorted((a, b) => b.score - a.score);
}
