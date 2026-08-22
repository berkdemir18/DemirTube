import type { VideoRecord, WatchSession } from "../shared/types";
import { calculatePlaybackMetrics } from "./completion";

export type AnalyticsPeriod = "day" | "week" | "month" | "all";

export const analyticsPeriodLabels: Record<AnalyticsPeriod, string> = {
  day: "Günlük",
  week: "Haftalık",
  month: "Aylık",
  all: "Tüm zamanlar"
};

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function periodStart(period: AnalyticsPeriod, now = new Date()) {
  if (period === "all") return new Date(0);
  const today = startOfDay(now);
  if (period === "day") return today;
  if (period === "week") return addDays(today, -6);
  // Aylık görünüm artık "son 30 gün" değil, anchor'ın takvim ayıdır.
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Dönem bitişi: anchor geçmişteyse dönemin sonu, bugündeyse şu an (gelecek sayılmaz). */
export function periodEnd(period: AnalyticsPeriod, now = new Date()) {
  if (period === "all") return new Date(Date.now());
  const realNow = Date.now();
  if (period === "month") {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
    return new Date(Math.min(monthEnd, realNow));
  }
  const dayEnd = addDays(startOfDay(now), 1).getTime() - 1;
  return new Date(Math.min(dayEnd, realNow));
}

export function sessionsInPeriod(sessions: WatchSession[], period: AnalyticsPeriod, now = new Date()) {
  if (period === "all") return sessions;
  const start = periodStart(period, now).getTime();
  const end = periodEnd(period, now).getTime();
  return sessions.filter((session) => {
    const startedAt = new Date(session.startedAt).getTime();
    return startedAt >= start && startedAt <= end;
  });
}

export function videosInPeriod(
  videos: VideoRecord[],
  sessions: WatchSession[],
  period: AnalyticsPeriod,
  now = new Date()
): VideoRecord[] {
  if (period === "all") return videos.filter((video) => !video.excludedFromAnalytics);
  const periodSessions = sessionsInPeriod(sessions, period, now);
  const grouped = new Map<string, WatchSession[]>();
  for (const session of periodSessions) {
    grouped.set(session.videoId, [...(grouped.get(session.videoId) ?? []), session]);
  }

  const allSessionVideoIds = new Set(sessions.map((session) => session.videoId));
  const start = periodStart(period, now).getTime();
  const end = periodEnd(period, now).getTime();

  return videos.filter((video) => !video.excludedFromAnalytics).flatMap((video) => {
    const matching = grouped.get(video.videoId);
    if (!matching?.length) {
      const lastSeen = new Date(video.lastSeenAt).getTime();
      // Eski içe aktarmalarda oturumlar bulunmayabilir; o kayıtlar tarihine göre korunur.
      return !allSessionVideoIds.has(video.videoId) && lastSeen >= start && lastSeen <= end ? [video] : [];
    }

    const playback = calculatePlaybackMetrics(matching, video.durationSeconds);
    const latest = matching.toSorted((a, b) =>
      (b.updatedAt ?? b.endedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.endedAt ?? a.startedAt)
    )[0];
    const first = matching.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
    const completionRate = video.contentType === "livestream" ? 0 : playback.completionRate;

    return [{
      ...video,
      firstSeenAt: first.startedAt,
      lastSeenAt: latest.updatedAt ?? latest.endedAt ?? latest.startedAt,
      totalWatchSeconds: playback.totalActiveWatchSeconds,
      ...playback,
      completionRate,
      sessionCount: matching.length,
      completed: matching.some((session) => session.endedNaturally) || completionRate >= .9,
      isCurrentlyWatching: matching.some((session) => session.active)
    }];
  });
}

export function periodDateLabel(period: AnalyticsPeriod, now = new Date()) {
  if (period === "all") return "İlk kayıttan bugüne";
  const start = periodStart(period, now);
  if (period === "day") {
    return now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }
  if (period === "month") {
    return now.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  }
  return `${start.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} – ${now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;
}

export function watchTrend(sessions: WatchSession[], period: AnalyticsPeriod, now = new Date()) {
  const filtered = sessionsInPeriod(sessions, period, now);
  const start = periodStart(period, now);

  if (period === "all") {
    if (!filtered.length) return [];
    const first = filtered.reduce((earliest, session) => {
      const date = new Date(session.startedAt);
      return date < earliest ? date : earliest;
    }, new Date(now));
    const monthCount = Math.max(1, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1);
    return Array.from({ length: monthCount }, (_, index) => {
      const date = new Date(first.getFullYear(), first.getMonth() + index, 1);
      const seconds = filtered
        .filter((session) => {
          const sessionDate = new Date(session.startedAt);
          return sessionDate.getFullYear() === date.getFullYear() && sessionDate.getMonth() === date.getMonth();
        })
        .reduce((sum, session) => sum + session.watchSeconds, 0);
      return { label: date.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" }), seconds };
    });
  }

  if (period === "day") {
    return Array.from({ length: 6 }, (_, index) => {
      const from = index * 4;
      const seconds = filtered
        .filter((session) => Math.floor(new Date(session.startedAt).getHours() / 4) === index)
        .reduce((sum, session) => sum + session.watchSeconds, 0);
      return { label: `${String(from).padStart(2, "0")}–${String(from + 4).padStart(2, "0")}`, seconds };
    });
  }

  if (period === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const seconds = filtered
        .filter((session) => localDateKey(new Date(session.startedAt)) === localDateKey(date))
        .reduce((sum, session) => sum + session.watchSeconds, 0);
      return { label: date.toLocaleDateString("tr-TR", { weekday: "short" }), seconds };
    });
  }

  // Takvim ayı: gün gün trend (28-31 kova).
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = addDays(start, index);
    const seconds = filtered
      .filter((session) => localDateKey(new Date(session.startedAt)) === localDateKey(date))
      .reduce((sum, session) => sum + session.watchSeconds, 0);
    return {
      label: date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
      seconds
    };
  });
}

export function periodDurationMs(period: AnalyticsPeriod) {
  return period === "all" ? Number.POSITIVE_INFINITY : (period === "day" ? 1 : period === "week" ? 7 : 30) * DAY_MS;
}
