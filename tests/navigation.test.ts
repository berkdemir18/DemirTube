// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { isTrackableVideoRoute, isValidWatchRoute, observeYouTubeNavigation } from "../src/content/navigation-observer";
import { getVideoId } from "../src/shared/utils";

describe("YouTube SPA navigasyonu", () => {
  it("yalnızca tam /watch rotasını geçerli sayar", () => {
    expect(isValidWatchRoute(new URL("https://www.youtube.com/watch?v=abc"))).toBe(true);
    expect(isValidWatchRoute(new URL("https://www.youtube.com/"))).toBe(false);
    expect(isValidWatchRoute(new URL("https://www.youtube.com/watchlater?v=abc"))).toBe(false);
    expect(isTrackableVideoRoute(new URL("https://www.youtube.com/shorts/short-id"))).toBe(true);
    expect(getVideoId("https://www.youtube.com/shorts/short-id")).toBe("short-id");
  });
  it("pushState video değişimini bir kez bildirir ve cleanup sonrası susar", async () => {
    vi.useFakeTimers();
    history.replaceState({}, "", "/");
    const callback = vi.fn();
    const stop = observeYouTubeNavigation(callback);
    history.pushState({}, "", "/watch?v=first");
    await vi.advanceTimersByTimeAsync(60);
    expect(callback).toHaveBeenCalledTimes(1);
    history.replaceState({}, "", "/watch?v=first");
    await vi.advanceTimersByTimeAsync(60);
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
    history.pushState({}, "", "/watch?v=second");
    await vi.advanceTimersByTimeAsync(60);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
