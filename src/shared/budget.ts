// DemirTube · günlük bütçe durumu
//
// Bütçe uyarısının ve Shorts duraklatmasının kuralları tek yerde ve saf tutulur:
// service worker depolamadan okur, içerik betiği yalnızca sonucu uygular, test
// doğrudan bu fonksiyonu çağırır.
import type { BudgetState } from "./types";

export type BudgetInput = {
  /** Bugün kaydedilen aktif izleme süresi (saniye). */
  seconds: number;
  /** Ayarlardaki günlük bütçe; 0 veya altı = bütçe kapalı. */
  budgetMinutes: number;
  /** Shorts duraklatmasının bitiş anı (ISO); geçmişse duraklatma yok. */
  shortsPauseUntil?: string;
  /** Uyarının kapatıldığı gün anahtarı. */
  noticeDismissedFor?: string;
};

/** Yerel gün anahtarı; gece yarısı hem uyarıyı hem duraklatmayı sıfırlar. */
export function dayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Duraklatma her zaman yerel günün sonunda biter; "bugünlük" sözü birebir bu. */
export function endOfDayIso(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}

export function deriveBudgetState(input: BudgetInput, now = new Date()): BudgetState {
  const budgetMinutes = Math.max(0, input.budgetMinutes ?? 0);
  const budgetSeconds = budgetMinutes * 60;
  const shortsPaused = Boolean(input.shortsPauseUntil && new Date(input.shortsPauseUntil).getTime() > now.getTime());

  return {
    seconds: Math.max(0, Math.round(input.seconds)),
    budgetMinutes,
    // Bütçe kapalıyken aşım kavramı yoktur; uyarı da çıkmaz.
    exceeded: budgetSeconds > 0 && input.seconds > budgetSeconds,
    percent: budgetSeconds > 0 ? Math.round(input.seconds / budgetSeconds * 100) : 0,
    shortsPaused,
    shortsPausedUntil: shortsPaused ? input.shortsPauseUntil : undefined,
    noticeDismissed: input.noticeDismissedFor === dayKey(now),
  };
}
