import { COMPLETED_THRESHOLD, EARLY_EXIT_SECONDS, SEGMENT_GAP_SECONDS } from "../shared/constants";
import type { PlaybackSegment, WatchSession } from "../shared/types";
import { clamp } from "../shared/utils";

export function mergeSegments(segments: PlaybackSegment[], gap = SEGMENT_GAP_SECONDS): PlaybackSegment[] {
  const sorted = segments
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .map((segment) => ({ start: Math.max(0, segment.start), end: Math.max(0, segment.end) }))
    .sort((a, b) => a.start - b.start);
  const merged: PlaybackSegment[] = [];
  for (const segment of sorted) {
    const last = merged.at(-1);
    if (last && segment.start <= last.end + gap) last.end = Math.max(last.end, segment.end);
    else merged.push({ ...segment });
  }
  return merged;
}

export const watchedSecondsFromSegments = (segments: PlaybackSegment[]) =>
  mergeSegments(segments).reduce((sum, segment) => sum + segment.end - segment.start, 0);

export const calculateCompletion = (uniqueWatchedSeconds: number, durationSeconds: number) =>
  durationSeconds > 0 ? clamp(uniqueWatchedSeconds / durationSeconds, 0, 1) : 0;

/**
 * Süresi okunamamış kayıtta tamamlanma hesaplanamaz ve yukarıdaki formül 0 döner.
 * Bu 0'lar istatistiklere girerse "hiçbir şeyi bitirmiyor" gibi görünür ve kişisel
 * tabanı aşağı çeker; tercih istatistikleri bu kayıtları dışarıda bırakmalıdır.
 */
export const hasMeasurableDuration = (video: { durationSeconds: number }) =>
  Number.isFinite(video.durationSeconds) && video.durationSeconds > 0;

export function calculatePlaybackMetrics(sessions: WatchSession[], durationSeconds: number) {
  const totalActiveWatchSeconds = sessions.reduce((sum, session) => sum + Math.max(0, session.watchSeconds), 0);
  // Aktif süre gerçek duvar saatidir; 0.5x/1.5x hızlarında bunu benzersiz
  // video konumuyla karşılaştırmak yanlışlıkla "tekrar izleme" üretiyordu.
  // Tekrarı, izlenen medya aralıklarının örtüşmesinden türetiyoruz.
  const totalViewedMediaSeconds = sessions.reduce(
    (sum, session) => sum + watchedSecondsFromSegments(session.playbackSegments),
    0
  );
  const maxDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : Infinity;
  const uniquePlaybackSegments = mergeSegments(sessions.flatMap((session) => session.playbackSegments))
    .map((segment) => ({ start: Math.min(segment.start, maxDuration), end: Math.min(segment.end, maxDuration) }))
    .filter((segment) => segment.end > segment.start);
  const uniqueWatchedSeconds = watchedSecondsFromSegments(uniquePlaybackSegments);
  return {
    totalActiveWatchSeconds,
    uniqueWatchedSeconds,
    completionRate: calculateCompletion(uniqueWatchedSeconds, durationSeconds),
    rewatchSeconds: Math.max(0, totalViewedMediaSeconds - uniqueWatchedSeconds),
    uniquePlaybackSegments
  };
}

export const isCompleted = (completionRate: number, endedNaturally = false) =>
  endedNaturally || completionRate >= COMPLETED_THRESHOLD;

export const isEarlyAbandonment = (watchSeconds: number, completionRate: number) =>
  watchSeconds >= 10 && watchSeconds <= EARLY_EXIT_SECONDS && completionRate < 0.15;

export const activeWatchSeconds = (samples: Array<{ elapsed: number; playing: boolean; visible: boolean; ready: boolean }>) =>
  samples.reduce((sum, sample) => sum + (sample.playing && sample.visible && sample.ready ? Math.max(0, sample.elapsed) : 0), 0);
