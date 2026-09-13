import { describe, expect, it } from "vitest";
import { buildWatchPlan, usefulnessSummary } from "../src/analytics/watch-plan";
import { analyzeRegret } from "../src/analytics/regret-score";
import type { WatchlistItem } from "../src/shared/types";

const item = (videoId: string, durationSeconds: number, extra: Partial<WatchlistItem> = {}): WatchlistItem => ({ videoId, durationSeconds, title: videoId, channelName: "Kanal", topics: [], url: "https://www.youtube.com/watch?v=" + videoId, addedAt: "2026-09-01", ...extra });
describe("purpose-aware watch plans", () => {
  it("never exceeds time and excludes unknown durations and mastered videos", () => {
    const plan = buildWatchPlan([item("a", 600), item("b", 1000), item("c", 300), item("d", 0), item("e", 10, { learningStage: "mastered" })], 15, "open");
    expect(plan.map(v => v.videoId)).toEqual(["a", "c"]);
    expect(buildWatchPlan([item("a", 1)], NaN, "open")).toEqual([]);
  });
  it("isolates purposes and limits plans to three", () => {
    expect(buildWatchPlan([item("a", 60, { intent: "relax" }), item("b", 60, { intent: "learn" })], 10, "learn").map(v => v.videoId)).toEqual(["b"]);
    expect(buildWatchPlan([1, 2, 3, 4].map(n => item(String(n), 60)), 10, "open")).toHaveLength(3);
  });
  it("does not treat missing feedback as negative", () => {
    expect(usefulnessSummary([item("a", 60), item("b", 60, { useful: true, intent: "learn" }), item("c", 60, { useful: false, intent: "relax" })], "learn")).toEqual({ count: 1, percent: 100 });
  });
});
describe("early exit meaning", () => {
  const input = { title: "Ders", totalActiveWatchSeconds: 60, durationSeconds: 1200, completionRate: .05, reopened: false, followedByAnotherVideo: true };
  it("recognizes success without completion", () => {
    expect(analyzeRegret({ ...input, leaveReason: "answer_found" })).toMatchObject({ score: 0, confidence: "high", enoughData: true });
  });
  it("does not infer dissatisfaction from lack of time or prior knowledge", () => {
    for (const leaveReason of ["no_time", "already_knew"] as const) expect(analyzeRegret({ ...input, leaveReason })).toMatchObject({ enoughData: false, confidence: "low" });
    expect(analyzeRegret({ ...input, leaveReason: "other" }).confidence).toBe("medium");
  });
  it("keeps explicit misleading-title evidence", () => {
    expect(analyzeRegret({ ...input, leaveReason: "answer_found", feedback: { videoId: "a", clickbait: true, updatedAt: "2026-09-08" } }).score).toBeGreaterThan(0);
  });
});
