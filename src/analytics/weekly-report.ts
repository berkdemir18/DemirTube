import type { UserVideoFeedback, VideoRecord, WatchSession, WeeklyReport } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { durationStats, topicStats, channelStats } from "../dashboard/analytics";
import { buildTimeInsights, timeOfDayAnalytics } from "./time-analytics";

export function generateWeeklyReport(videos: VideoRecord[], sessions: WatchSession[], now = new Date(), feedback: UserVideoFeedback[] = []): WeeklyReport {
  const end = new Date(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getFullYear(), previousEnd.getMonth(), previousEnd.getDate() - 6);
  const inRange = (date: string, from: Date, to: Date) => {
    const time = new Date(date).getTime();
    return time >= from.getTime() && time <= to.getTime();
  };
  const currentSessions = sessions.filter((session) => inRange(session.startedAt, start, end));
  const ids = new Set(currentSessions.map((session) => session.videoId));
  const currentVideos = videos.filter((video) => ids.has(video.videoId) && !video.excludedFromAnalytics);
  const previousSessions = sessions.filter((session) => inRange(session.startedAt, previousStart, previousEnd));
  const previousIds = new Set(previousSessions.map((session) => session.videoId));
  const previousVideos = videos.filter((video) => previousIds.has(video.videoId) && !video.excludedFromAnalytics);
  const previousSeconds = previousSessions.reduce((sum, session) => sum + session.watchSeconds, 0);
  const totalWatchSeconds = currentSessions.reduce((sum, session) => sum + session.watchSeconds, 0);
  const topics = topicStats(currentVideos).slice(0, 3).map((item) => item.topic);
  const channels = channelStats(currentVideos).slice(0, 3).map((item) => item.channelName);
  const preferredDuration = durationStats(currentVideos).filter((item) => item.count).toSorted((a, b) => b.completion - a.completion)[0]?.bucket;
  const timeBuckets = timeOfDayAnalytics(currentVideos, currentSessions);
  const timeInsights = buildTimeInsights(timeBuckets);
  const recommendations = [
    preferredDuration ? `${preferredDuration} aralığında daha çok video seçmeyi dene.` : "Süre tercihi için biraz daha veri biriktir.",
    currentVideos.some((video) => video.regretScore >= 60) ? "Yüksek pişmanlık puanlı başlıklarda ayrıntıları açıp nedenleri kontrol et." : "Bu hafta belirgin pişmanlık örüntüsü oluşmadı."
  ];
  const averageCompletion = currentVideos.length ? round(currentVideos.reduce((sum, video) => sum + video.completionRate, 0) / currentVideos.length * 100) : 0;
  const weekOverWeekPercent = previousSeconds ? round((totalWatchSeconds - previousSeconds) / previousSeconds * 100) : undefined;
  const shortsWatchSeconds = currentSessions.filter((session) => currentVideos.find((video) => video.videoId === session.videoId)?.contentType === "short").reduce((sum, session) => sum + session.watchSeconds, 0);
  const previousShortsSeconds = previousSessions.filter((session) => previousVideos.find((video) => video.videoId === session.videoId)?.contentType === "short").reduce((sum, session) => sum + session.watchSeconds, 0);
  const regretRate = currentVideos.length ? round(currentVideos.filter((video) => video.regretScore >= 60).length / currentVideos.length * 100) : 0;
  const previousRegretRate = previousVideos.length ? round(previousVideos.filter((video) => video.regretScore >= 60).length / previousVideos.length * 100) : 0;
  const feedbackIds = new Set(feedback.filter((item) => item.liked !== undefined || item.clickbait !== undefined || item.manualTopics?.length || item.manualContentType).map((item) => item.videoId));
  const consciousSelectionRate = currentVideos.length ? round(currentVideos.filter((video) => feedbackIds.has(video.videoId)).length / currentVideos.length * 100) : 0;
  const previousConscious = previousVideos.length ? round(previousVideos.filter((video) => feedbackIds.has(video.videoId)).length / previousVideos.length * 100) : 0;
  const topicSeconds = (items: VideoRecord[], periodSessions: WatchSession[]) => {
    const map = new Map<string, number>();
    const secondsByVideo = new Map<string, number>();
    periodSessions.forEach((session) => secondsByVideo.set(session.videoId, (secondsByVideo.get(session.videoId) ?? 0) + session.watchSeconds));
    items.forEach((video) => video.topics.forEach((topic) => map.set(topic, (map.get(topic) ?? 0) + (secondsByVideo.get(video.videoId) ?? 0))));
    return map;
  };
  const currentTopicSeconds = topicSeconds(currentVideos, currentSessions);
  const previousTopicSeconds = topicSeconds(previousVideos, previousSessions);
  const learningTopics = new Set(["Eğitim", "Yapay zekâ", "Programlama", "Siber güvenlik", "Hazırlık"]);
  const secondsFor = (items: VideoRecord[], periodSessions: WatchSession[], learning: boolean) => {
    const ids = new Set(items.filter((video) => video.topics.some((topic) => learningTopics.has(topic)) === learning).map((video) => video.videoId));
    return periodSessions.filter((session) => ids.has(session.videoId)).reduce((sum, session) => sum + session.watchSeconds, 0);
  };
  const learningWatchSeconds = secondsFor(currentVideos, currentSessions, true);
  const entertainmentWatchSeconds = secondsFor(currentVideos, currentSessions, false);
  const previousLearning = secondsFor(previousVideos, previousSessions, true);
  const currentLearningShare = learningWatchSeconds + entertainmentWatchSeconds ? round(learningWatchSeconds / (learningWatchSeconds + entertainmentWatchSeconds) * 100) : 0;
  const previousEntertainment = secondsFor(previousVideos, previousSessions, false);
  const previousLearningShare = previousLearning + previousEntertainment ? round(previousLearning / (previousLearning + previousEntertainment) * 100) : 0;
  const topicChanges = [...new Set([...currentTopicSeconds.keys(), ...previousTopicSeconds.keys()])].map((topic) => {
    const currentSeconds = currentTopicSeconds.get(topic) ?? 0;
    const previousTopicValue = previousTopicSeconds.get(topic) ?? 0;
    return { topic, currentSeconds, previousSeconds: previousTopicValue, changePercent: previousTopicValue ? round((currentSeconds - previousTopicValue) / previousTopicValue * 100) : undefined };
  }).toSorted((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)).slice(0, 5);
  const predictionVideos = currentVideos.filter((video) =>
    video.predictionSnapshot?.estimatedCompletion !== undefined && !video.isCurrentlyWatching
  );
  const predictionErrors = predictionVideos.map((video) =>
    Math.abs((video.predictionSnapshot?.estimatedCompletion ?? 0) - video.completionRate * 100)
  );
  const predictionAccuracy = predictionErrors.length
    ? {
        sampleCount: predictionErrors.length,
        nearCount: predictionErrors.filter((error) => error <= 15).length,
        meanError: round(predictionErrors.reduce((sum, error) => sum + error, 0) / predictionErrors.length)
      }
    : undefined;
  const newInterest = topicChanges
    .filter((item) => item.currentSeconds > 0 && (item.previousSeconds === 0 || (item.changePercent ?? 0) > 0))
    .toSorted((a, b) => b.currentSeconds - a.currentSeconds)[0]?.topic ?? topics[0] ?? "Veri birikiyor";
  const bestTime = timeBuckets
    .filter((bucket) => bucket.videoCount)
    .toSorted((a, b) => b.averageCompletion - a.averageCompletion)[0];
  const timeRanges: Record<string, string> = {
    Gece: "00.00–06.00",
    Sabah: "06.00–12.00",
    "Öğleden sonra": "12.00–18.00",
    Akşam: "18.00–24.00"
  };
  const risky = currentVideos.toSorted((a, b) => b.regretScore - a.regretScore)[0];
  const returnCandidate = currentVideos
    .filter((video) => !video.completed && video.completionRate >= 0.15 && video.completionRate < 0.9)
    .toSorted((a, b) => b.engagementScore - a.engagementScore)[0];
  const discoveryInsights: NonNullable<WeeklyReport["discoveryInsights"]> = [
    { kind: "interest", label: "Yeni ilgi", value: newInterest },
    { kind: "time", label: "En verimli zaman", value: bestTime ? `${timeRanges[bestTime.label] ?? bestTime.label} · %${bestTime.averageCompletion} tamamlama` : "Veri birikiyor" },
    { kind: "risk", label: "Pişmanlık riski", value: risky && risky.regretScore >= 45 ? `${risky.topics[0] ?? "Diğer"} · ${risky.regretScore}/100` : "Belirgin risk oluşmadı" },
    { kind: "return", label: "Dönmeye değer", value: returnCandidate?.title ?? "Yarım kalan uygun video yok" }
  ];
  const text = [
    `Bu hafta YouTube'da ${formatDuration(totalWatchSeconds)} geçirdin ve ${currentVideos.length} video izledin.`,
    topics.length ? `En çok zaman ayırdığın konular: ${topics.join(", ")}.` : "",
    preferredDuration ? `En iyi tamamladığın süre aralığı ${preferredDuration}.` : "",
    `${currentVideos.filter((video) => video.regretScore >= 60).length} videoda belirgin pişmanlık sinyali oluştu.`,
    ...timeInsights,
    ...recommendations
  ].filter(Boolean).join(" ");
  return {
    id: start.toISOString().slice(0, 10),
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    totalWatchSeconds,
    videoCount: currentVideos.length,
    completedVideos: currentVideos.filter((video) => video.completed).length,
    averageCompletion,
    regretCount: currentVideos.filter((video) => video.regretScore >= 60).length,
    topTopics: topics,
    topChannels: channels,
    preferredDuration,
    strongestEngagement: currentVideos.toSorted((a, b) => b.engagementScore - a.engagementScore).slice(0, 3).map((video) => video.title),
    mostRegretted: currentVideos.toSorted((a, b) => b.regretScore - a.regretScore).slice(0, 3).map((video) => video.title),
    timeInsights,
    weekOverWeekPercent,
    recommendations,
    shortsWatchSeconds,
    shortsCount: currentVideos.filter((video) => video.contentType === "short").length,
    shortsChangePercent: previousShortsSeconds ? round((shortsWatchSeconds - previousShortsSeconds) / previousShortsSeconds * 100) : undefined,
    regretRate,
    regretRateChange: previousVideos.length ? regretRate - previousRegretRate : undefined,
    consciousSelectionRate,
    consciousSelectionChange: previousVideos.length ? consciousSelectionRate - previousConscious : undefined,
    learningWatchSeconds,
    entertainmentWatchSeconds,
    learningShareChange: previousVideos.length ? currentLearningShare - previousLearningShare : undefined,
    topicChanges,
    discoveryInsights,
    predictionAccuracy,
    text,
    generatedAt: new Date().toISOString()
  };
}
