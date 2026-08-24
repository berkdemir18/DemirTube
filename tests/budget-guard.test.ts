import { describe, expect, it } from "vitest";
import { dayKey, deriveBudgetState, endOfDayIso } from "../src/shared/budget";

const NOW = new Date(2026, 6, 15, 21, 30, 0);

describe("günlük bütçe durumu", () => {
  it("bütçe aşıldığında aşımı ve yüzdeyi bildirir", () => {
    const state = deriveBudgetState({ seconds: 7_200, budgetMinutes: 90 }, NOW);

    expect(state.exceeded).toBe(true);
    expect(state.percent).toBe(133);
    expect(state.budgetMinutes).toBe(90);
  });

  it("bütçe içindeyken ve tam sınırdayken aşım saymaz", () => {
    expect(deriveBudgetState({ seconds: 3_000, budgetMinutes: 90 }, NOW).exceeded).toBe(false);
    expect(deriveBudgetState({ seconds: 5_400, budgetMinutes: 90 }, NOW).exceeded).toBe(false);
    expect(deriveBudgetState({ seconds: 5_401, budgetMinutes: 90 }, NOW).exceeded).toBe(true);
  });

  it("bütçe kapalıyken aşım ve yüzde üretmez", () => {
    const state = deriveBudgetState({ seconds: 20_000, budgetMinutes: 0 }, NOW);

    expect(state.exceeded).toBe(false);
    expect(state.percent).toBe(0);
  });

  it("Shorts duraklatmasını yalnızca bitiş anı gelecekteyse aktif sayar", () => {
    const future = new Date(NOW.getTime() + 3_600_000).toISOString();
    const past = new Date(NOW.getTime() - 1_000).toISOString();

    expect(deriveBudgetState({ seconds: 0, budgetMinutes: 90, shortsPauseUntil: future }, NOW))
      .toMatchObject({ shortsPaused: true, shortsPausedUntil: future });
    expect(deriveBudgetState({ seconds: 0, budgetMinutes: 90, shortsPauseUntil: past }, NOW))
      .toMatchObject({ shortsPaused: false, shortsPausedUntil: undefined });
    expect(deriveBudgetState({ seconds: 0, budgetMinutes: 90 }, NOW).shortsPaused).toBe(false);
  });

  it("uyarıyı yalnızca bugün kapatıldıysa kapalı sayar", () => {
    expect(deriveBudgetState({ seconds: 0, budgetMinutes: 90, noticeDismissedFor: dayKey(NOW) }, NOW).noticeDismissed).toBe(true);
    expect(deriveBudgetState({ seconds: 0, budgetMinutes: 90, noticeDismissedFor: "2026-7-14" }, NOW).noticeDismissed).toBe(false);
  });

  it("duraklatma yerel günün sonunda biter", () => {
    const until = new Date(endOfDayIso(NOW));

    expect(until.getDate()).toBe(16);
    expect(until.getHours()).toBe(0);
    expect(until.getTime()).toBeGreaterThan(NOW.getTime());
    // Gece yarısından hemen sonra duraklatma kendiliğinden düşer.
    expect(deriveBudgetState(
      { seconds: 0, budgetMinutes: 90, shortsPauseUntil: endOfDayIso(NOW) },
      new Date(2026, 6, 16, 0, 0, 1)
    ).shortsPaused).toBe(false);
  });
});
