import type { PlaybackSegment, UserGoals, VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { calculatePlaybackMetrics } from "./completion";
import { analyzeVideoIntelligence } from "./video-intelligence";
import { sessionsInPeriod, videosInPeriod, type AnalyticsPeriod } from "./period";

export type PeriodSummary = {
  watchSeconds: number;
  videoCount: number;
  sessionCount: number;
  averageCompletion: number;
  shortsShare: number;
};

export type MetricDelta = { current: number; previous: number; percent?: number };

export function previousPeriodAnchor(period: AnalyticsPeriod, anchor: Date) {
  const previous = new Date(anchor);
  if (period === "day") previous.setDate(previous.getDate() - 1);
  else if (period === "week") previous.setDate(previous.getDate() - 7);
  else if (period === "month") previous.setMonth(previous.getMonth() - 1);
  return previous;
}

export function summarizePeriod(videos: VideoRecord[], sessions: WatchSession[]): PeriodSummary {
  const watchSeconds = sessions.reduce((sum, session) => sum + session.watchSeconds, 0);
  const shorts = new Set(videos.filter((video) => video.contentType === "short").map((video) => video.videoId));
  const shortsSeconds = sessions.filter((session) => shorts.has(session.videoId)).reduce((sum, session) => sum + session.watchSeconds, 0);
  return {
    watchSeconds,
    videoCount: videos.length,
    sessionCount: sessions.length,
    averageCompletion: videos.length ? round(videos.reduce((sum, video) => sum + video.completionRate, 0) / videos.length * 100) : 0,
    shortsShare: watchSeconds ? round(shortsSeconds / watchSeconds * 100) : 0
  };
}

function delta(current: number, previous: number): MetricDelta {
  return { current, previous, percent: previous > 0 ? round((current - previous) / previous * 100) : undefined };
}

export function comparePeriodSummaries(current: PeriodSummary, previous: PeriodSummary) {
  return {
    watchSeconds: delta(current.watchSeconds, previous.watchSeconds),
    videoCount: delta(current.videoCount, previous.videoCount),
    averageCompletion: delta(current.averageCompletion, previous.averageCompletion),
    shortsShare: delta(current.shortsShare, previous.shortsShare)
  };
}

export type JourneyItem = {
  session: WatchSession;
  video?: VideoRecord;
  transition?: string;
};

export type JourneyGroup = {
  id: string;
  startedAt: string;
  endedAt: string;
  watchSeconds: number;
  mode: "odak" | "araştırma" | "eğlence" | "shorts" | "gezinme" | "karma";
  label: string;
  items: JourneyItem[];
};

export function buildWatchJourney(videos: VideoRecord[], sessions: WatchSession[], gapMinutes = 30): JourneyGroup[] {
  const videoMap = new Map(videos.map((video) => [video.videoId, video]));
  const sorted = sessions.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt));
  const groups: WatchSession[][] = [];
  for (const session of sorted) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const previousEnd = previous ? new Date(previous.endedAt ?? previous.updatedAt ?? previous.startedAt).getTime() : 0;
    if (!group || new Date(session.startedAt).getTime() - previousEnd > gapMinutes * 60_000) groups.push([session]);
    else group.push(session);
  }
  return groups.toReversed().map((group) => {
    const items = group.map((session, index): JourneyItem => {
      const video = videoMap.get(session.videoId);
      const before = index ? videoMap.get(group[index - 1].videoId) : undefined;
      const from = before?.topics[0] ?? before?.channelName;
      const to = video?.topics[0] ?? video?.channelName;
      return { session, video, transition: index && from && to && from !== to ? `${from} → ${to}` : undefined };
    });
    const groupVideos = items.flatMap((item) => item.video ? [item.video] : []);
    const shorts = groupVideos.filter((video) => video.contentType === "short").length;
    const learning = groupVideos.filter((video) => analyzeVideoIntelligence(video, videos).valueType === "learning").length;
    const entertainment = groupVideos.filter((video) => analyzeVideoIntelligence(video, videos).valueType === "entertainment").length;
    const topicCounts = new Map<string, number>();
    for (const video of groupVideos) for (const topic of video.topics) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    const dominant = [...topicCounts.entries()].toSorted((a, b) => b[1] - a[1])[0];
    const total = Math.max(1, groupVideos.length);
    let mode: JourneyGroup["mode"] = "karma";
    let label = "Karma izleme";
    if (shorts >= 4 && shorts / total >= .6) { mode = "shorts"; label = "Shorts döngüsü"; }
    else if (group.length >= 5 && group.reduce((sum, session) => sum + session.watchSeconds, 0) / group.length < 45) { mode = "gezinme"; label = "Kararsız gezinme"; }
    else if (dominant && dominant[1] / total >= .65 && group.length >= 3) { mode = "araştırma"; label = `${dominant[0]} araştırması`; }
    else if (learning / total >= .65) { mode = "odak"; label = "Odaklı öğrenme"; }
    else if (entertainment / total >= .65) { mode = "eğlence"; label = "Eğlence oturumu"; }
    const ended = group.at(-1)?.endedAt ?? group.at(-1)?.updatedAt ?? group.at(-1)?.startedAt ?? group[0].startedAt;
    return {
      id: group[0].id,
      startedAt: group[0].startedAt,
      endedAt: ended,
      watchSeconds: group.reduce((sum, session) => sum + session.watchSeconds, 0),
      mode,
      label,
      items
    };
  });
}

export type AnomalyInsight = { kind: "positive" | "warning" | "neutral"; title: string; detail: string };

export function detectWatchAnomalies(videos: VideoRecord[], sessions: WatchSession[], now = new Date()): AnomalyInsight[] {
  const currentSessions = sessionsInPeriod(sessions, "week", now);
  const previousAnchor = previousPeriodAnchor("week", now);
  const previousSessions = sessionsInPeriod(sessions, "week", previousAnchor);
  const currentVideos = videosInPeriod(videos, sessions, "week", now);
  const previousVideos = videosInPeriod(videos, sessions, "week", previousAnchor);
  if (currentSessions.length < 2 || previousSessions.length < 2) return [];
  const current = summarizePeriod(currentVideos, currentSessions);
  const previous = summarizePeriod(previousVideos, previousSessions);
  const insights: AnomalyInsight[] = [];
  const watchChange = previous.watchSeconds ? (current.watchSeconds - previous.watchSeconds) / previous.watchSeconds * 100 : 0;
  if (Math.abs(watchChange) >= 35) insights.push({
    kind: watchChange > 0 ? "warning" : "positive",
    title: watchChange > 0 ? "İzleme süresi belirgin arttı" : "İzleme süresi belirgin azaldı",
    detail: `Geçen haftaya göre %${Math.abs(round(watchChange))} ${watchChange > 0 ? "daha fazla" : "daha az"} aktif süre.`
  });
  const shortsChange = current.shortsShare - previous.shortsShare;
  if (Math.abs(shortsChange) >= 15) insights.push({
    kind: shortsChange > 0 ? "warning" : "positive",
    title: shortsChange > 0 ? "Shorts payı yükseldi" : "Shorts payı düştü",
    detail: `Aktif sürede Shorts payı ${Math.abs(shortsChange)} puan ${shortsChange > 0 ? "arttı" : "azaldı"}.`
  });
  const completionChange = current.averageCompletion - previous.averageCompletion;
  if (Math.abs(completionChange) >= 12) insights.push({
    kind: completionChange > 0 ? "positive" : "warning",
    title: completionChange > 0 ? "Tamamlama güçlendi" : "Tamamlama geriledi",
    detail: `Ortalama tamamlama ${Math.abs(completionChange)} puan ${completionChange > 0 ? "yükseldi" : "düştü"}.`
  });
  const late = currentSessions.filter((session) => {
    const hour = new Date(session.startedAt).getHours();
    return hour >= 1 && hour < 6;
  }).reduce((sum, session) => sum + session.watchSeconds, 0);
  if (current.watchSeconds && late / current.watchSeconds >= .25) insights.push({
    kind: "neutral", title: "Gece izleme yoğunluğu", detail: `Bu haftaki aktif sürenin %${round(late / current.watchSeconds * 100)} kadarı 01:00–06:00 arasında oluştu.`
  });
  return insights.slice(0, 4);
}

export type GoalProgress = { key: keyof UserGoals; label: string; value: number; target: number; progress: number; met: boolean; detail: string };

export function evaluateGoals(videos: VideoRecord[], sessions: WatchSession[], goals: UserGoals): GoalProgress[] {
  const total = sessions.reduce((sum, session) => sum + session.watchSeconds, 0);
  const shortsIds = new Set(videos.filter((video) => video.contentType === "short").map((video) => video.videoId));
  const shorts = sessions.filter((session) => shortsIds.has(session.videoId)).reduce((sum, session) => sum + session.watchSeconds, 0);
  const learning = videos.filter((video) => analyzeVideoIntelligence(video, videos).valueType === "learning").length;
  const completed = videos.filter((video) => video.completed).length;
  const late = sessions.filter((session) => new Date(session.startedAt).getHours() >= goals.lateNightStartHour).reduce((sum, session) => sum + session.watchSeconds, 0);
  const values = {
    weeklyLearningVideos: learning,
    maxShortsPercent: total ? round(shorts / total * 100) : 0,
    weeklyCompletedVideos: completed,
    maxLateNightMinutes: round(late / 60)
  };
  return [
    { key: "weeklyLearningVideos", label: "Öğrenme videosu", value: values.weeklyLearningVideos, target: goals.weeklyLearningVideos, progress: Math.min(100, values.weeklyLearningVideos / Math.max(1, goals.weeklyLearningVideos) * 100), met: values.weeklyLearningVideos >= goals.weeklyLearningVideos, detail: `${values.weeklyLearningVideos}/${goals.weeklyLearningVideos} video` },
    { key: "maxShortsPercent", label: "Shorts sınırı", value: values.maxShortsPercent, target: goals.maxShortsPercent, progress: Math.min(100, goals.maxShortsPercent / Math.max(1, values.maxShortsPercent) * 100), met: values.maxShortsPercent <= goals.maxShortsPercent, detail: `%${values.maxShortsPercent} / en fazla %${goals.maxShortsPercent}` },
    { key: "weeklyCompletedVideos", label: "Tamamlanan video", value: values.weeklyCompletedVideos, target: goals.weeklyCompletedVideos, progress: Math.min(100, values.weeklyCompletedVideos / Math.max(1, goals.weeklyCompletedVideos) * 100), met: values.weeklyCompletedVideos >= goals.weeklyCompletedVideos, detail: `${values.weeklyCompletedVideos}/${goals.weeklyCompletedVideos} video` },
    { key: "maxLateNightMinutes", label: "Gece izleme sınırı", value: values.maxLateNightMinutes, target: goals.maxLateNightMinutes, progress: Math.min(100, goals.maxLateNightMinutes / Math.max(1, values.maxLateNightMinutes) * 100), met: values.maxLateNightMinutes <= goals.maxLateNightMinutes, detail: `${values.maxLateNightMinutes}/${goals.maxLateNightMinutes} dk · ${goals.lateNightStartHour}:00 sonrası` }
  ];
}

export function channelDecision(videos: VideoRecord[]) {
  if (videos.length < 3) return { tone: "neutral" as const, label: "Veri birikiyor", detail: `Karar için ${3 - videos.length} video daha gerekli.` };
  const completion = videos.reduce((sum, video) => sum + video.completionRate, 0) / videos.length * 100;
  const regret = videos.reduce((sum, video) => sum + video.regretScore, 0) / videos.length;
  const rewatch = videos.reduce((sum, video) => sum + video.rewatchSeconds, 0);
  if (completion >= 70 && regret < 35) return { tone: "positive" as const, label: "Daha sık izlenebilir", detail: `Tamamlama %${round(completion)}; kanal düzenli olarak karşılığını veriyor.` };
  if (completion < 35 || regret >= 60) return { tone: "warning" as const, label: "Dikkatli seç", detail: `Tamamlama %${round(completion)}, ortalama pişmanlık ${round(regret)}/100.` };
  if (rewatch >= 60) return { tone: "positive" as const, label: "Belirli bölümleri değerli", detail: `${formatDuration(rewatch)} tekrar izleme oluştu; konu bazında seçmek daha iyi olabilir.` };
  return { tone: "neutral" as const, label: "Seçici takip et", detail: `Tamamlama %${round(completion)}; kanal orta düzey uyum gösteriyor.` };
}

function overlapSeconds(segments: PlaybackSegment[], start: number, end: number) {
  return segments.reduce((sum, segment) => sum + Math.max(0, Math.min(end, segment.end) - Math.max(start, segment.start)), 0);
}

export type AttentionSection = { startSeconds: number; endSeconds: number; label: string; watchedPercent: number; status: "atlanmış" | "kısmen izlendi" | "izlendi" | "tekrar izlendi" };

export function buildAttentionSections(
  video: Pick<VideoRecord, "durationSeconds" | "uniquePlaybackSegments" | "transcriptAnalysis">,
  playbackSegments: PlaybackSegment[] = video.uniquePlaybackSegments
): AttentionSection[] {
  const moments = video.transcriptAnalysis?.keyMoments ?? [];
  if (!moments.length || video.durationSeconds <= 0) return [];
  return moments.map((moment, index) => {
    const start = Math.max(0, moment.startSeconds);
    const end = Math.max(start + 1, moments[index + 1]?.startSeconds ?? video.durationSeconds);
    const watched = overlapSeconds(video.uniquePlaybackSegments, start, end);
    const ratio = Math.min(1, watched / Math.max(1, end - start));
    const repeatOverlap = overlapSeconds(playbackSegments, start, end) > watched + Math.min(5, (end - start) * .1);
    return {
      startSeconds: start,
      endSeconds: end,
      label: moment.label,
      watchedPercent: round(ratio * 100),
      status: repeatOverlap ? "tekrar izlendi" : ratio >= .8 ? "izlendi" : ratio >= .15 ? "kısmen izlendi" : "atlanmış"
    };
  });
}
