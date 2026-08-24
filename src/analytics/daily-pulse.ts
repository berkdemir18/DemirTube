// DemirTube · günlük nabız
//
// Popup, dashboard açmadan "bugün ne oldu" sorusunu cevaplamalı. Bu modül
// yalnızca saf hesaplama yapar: bugünkü aktif süre, video sayısı, Shorts payı,
// günlük bütçe durumu, son yedi günün çubukları ve kesintisiz izleme serisi.
//
// Aynı hesabı service worker (popup için) ve dashboard (Genel Bakış şeridi için)
// kullanabilsin diye depolamadan bağımsız tutuldu.
import type { Settings, VideoRecord, WatchSession } from "../shared/types";
import { round } from "../shared/utils";
import { videosInPeriod } from "./period";

export type PulseBar = {
  /** "Pzt" gibi kısa gün etiketi. */
  label: string;
  /** Yerel gün anahtarı (YYYY-M-D); test ve karşılaştırma için. */
  dayKey: string;
  seconds: number;
  isToday: boolean;
};

export type BudgetState = "off" | "safe" | "near" | "over";

export type DailyPulse = {
  activeSeconds: number;
  videoCount: number;
  completedCount: number;
  shortsCount: number;
  shortsSeconds: number;
  /** Bugünkü aktif sürenin yüzde kaçı Shorts. Süre yoksa 0. */
  shortsPercent: number;
  budgetMinutes: number;
  /** Bütçenin yüzde kaçı kullanıldı; bütçe kapalıysa 0. */
  budgetPercent: number;
  budgetState: BudgetState;
  topTopic?: { topic: string; seconds: number };
  /** Bugün dahil, arka arkaya izleme yapılan gün sayısı. */
  streakDays: number;
  /** Bugün dahil son yedi gün, eskiden yeniye. */
  weekBars: PulseBar[];
  /** Bugün hariç önceki altı günün ortalaması. */
  recentAverageSeconds: number;
  /** Bugünün o ortalamaya göre yüzde farkı; ortalama 0 ise undefined. */
  deltaPercent?: number;
  lastVideo?: {
    videoId: string;
    title: string;
    channelName: string;
    url: string;
    completionPercent: number;
    watchedAt: string;
  };
};

const WEEKDAY = new Intl.DateTimeFormat("tr-TR", { weekday: "short" });

function dayKeyOf(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Gün anahtarı → o gün başlayan oturumların toplam aktif süresi. */
function secondsByDay(sessions: WatchSession[]) {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const key = dayKeyOf(new Date(session.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + Math.max(0, session.watchSeconds));
  }
  return totals;
}

function budgetStateOf(percent: number, budgetMinutes: number): BudgetState {
  if (budgetMinutes <= 0) return "off";
  if (percent >= 100) return "over";
  if (percent >= 80) return "near";
  return "safe";
}

/**
 * Seri, bugün henüz hiç izlenmediyse kırılmış sayılmaz: sabah eklentiyi açan
 * kullanıcı dünkü serisini sıfırlanmış görmemeli. Bugün boşsa sayım dünden
 * başlar, doluysa bugünden.
 */
function streakFrom(totals: Map<string, number>, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let cursor = totals.get(dayKeyOf(today)) ? today : shiftDays(today, -1);
  let streak = 0;
  // 365 gün üst sınırı: bozuk tarihli kayıtlarda döngü kilitlenmesin.
  while (streak < 365 && (totals.get(dayKeyOf(cursor)) ?? 0) > 0) {
    streak += 1;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

export function calculateDailyPulse(
  videos: VideoRecord[],
  sessions: WatchSession[],
  settings: Pick<Settings, "dailyWatchBudgetMinutes">,
  now = new Date()
): DailyPulse {
  const totals = secondsByDay(sessions);
  const todayKey = dayKeyOf(now);
  const activeSeconds = Math.round(totals.get(todayKey) ?? 0);

  const todayVideos = videosInPeriod(videos, sessions, "day", now);
  const shorts = todayVideos.filter((video) => video.contentType === "short");
  const shortsSeconds = Math.round(shorts.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0));

  const topicSeconds = new Map<string, number>();
  for (const video of todayVideos) {
    for (const topic of video.topics.length ? video.topics : ["Diğer"]) {
      topicSeconds.set(topic, (topicSeconds.get(topic) ?? 0) + video.totalActiveWatchSeconds);
    }
  }
  const [topTopic] = [...topicSeconds.entries()]
    .filter(([, seconds]) => seconds > 0)
    .toSorted((a, b) => b[1] - a[1]);

  const weekBars: PulseBar[] = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDays(now, index - 6);
    const key = dayKeyOf(date);
    return {
      label: WEEKDAY.format(date),
      dayKey: key,
      seconds: Math.round(totals.get(key) ?? 0),
      isToday: key === todayKey
    };
  });

  const previousDays = weekBars.slice(0, 6);
  const recentAverageSeconds = Math.round(
    previousDays.reduce((sum, bar) => sum + bar.seconds, 0) / previousDays.length
  );

  const budgetMinutes = Math.max(0, settings.dailyWatchBudgetMinutes ?? 0);
  const budgetPercent = budgetMinutes > 0 ? round(activeSeconds / (budgetMinutes * 60) * 100) : 0;

  const latest = todayVideos.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];

  return {
    activeSeconds,
    videoCount: todayVideos.length,
    completedCount: todayVideos.filter((video) => video.completed).length,
    shortsCount: shorts.length,
    shortsSeconds,
    shortsPercent: activeSeconds > 0 ? round(shortsSeconds / activeSeconds * 100) : 0,
    budgetMinutes,
    budgetPercent,
    budgetState: budgetStateOf(budgetPercent, budgetMinutes),
    topTopic: topTopic ? { topic: topTopic[0], seconds: Math.round(topTopic[1]) } : undefined,
    streakDays: streakFrom(totals, now),
    weekBars,
    recentAverageSeconds,
    deltaPercent: recentAverageSeconds > 0
      ? round((activeSeconds - recentAverageSeconds) / recentAverageSeconds * 100, 0)
      : undefined,
    lastVideo: latest ? {
      videoId: latest.videoId,
      title: latest.title,
      channelName: latest.channelName,
      url: latest.url,
      completionPercent: round(latest.completionRate * 100, 0),
      watchedAt: latest.lastSeenAt
    } : undefined
  };
}
