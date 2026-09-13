import type { WatchIntent, WatchlistItem } from "../shared/types";

/** A conservative plan: full durations, at most three videos, no unknown lengths. */
export function buildWatchPlan(items: WatchlistItem[], minutes: number, intent: WatchIntent) {
  if (!Number.isFinite(minutes) || minutes <= 0) return [];
  let remaining = minutes * 60;
  const candidates = items.filter(item => item.durationSeconds > 0 && Number.isFinite(item.durationSeconds)
    && item.learningStage !== "mastered" && item.learningStage !== "practiced"
    && (intent === "open" || item.intent === intent));
  const rated = items.filter(item => item.intent === intent && item.useful !== undefined);
  const selected: WatchlistItem[] = [];
  // Only explicit usefulness within the selected purpose affects preference.
  const affinity = (item: WatchlistItem) => {
    const evidence = rated.filter(other => other.channelName === item.channelName);
    return evidence.length >= 3 ? evidence.reduce((sum, other) => sum + (other.useful ? 1 : -1), 0) / evidence.length : 0;
  };
  for (const item of candidates.toSorted((a, b) => affinity(b) - affinity(a) || a.addedAt.localeCompare(b.addedAt))) {
    if (item.durationSeconds <= remaining) {
      selected.push(item);
      remaining -= item.durationSeconds;
    }
    if (selected.length === 3) break;
  }
  return selected;
}

export function usefulnessSummary(items: WatchlistItem[], intent: WatchIntent) {
  const rated = items.filter(item => item.useful !== undefined && (intent === "open" || item.intent === intent));
  return { count: rated.length, percent: rated.length ? Math.round(rated.filter(item => item.useful).length / rated.length * 100) : undefined };
}
