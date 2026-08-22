// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/constants";

vi.mock("../src/shared/messages", () => ({
  isExtensionContextInvalidated: () => false,
  sendMessage: vi.fn(async (message: { type: string }) => message.type === "GET_SETTINGS" ? DEFAULT_SETTINGS : undefined)
}));

import { YouTubeTracker } from "../src/content/youtube-tracker";

let position = 0;
let paused = false;
let ended = false;
let readyState: number = HTMLMediaElement.HAVE_FUTURE_DATA;
let hidden = false;
let pictureInPictureElement: Element | null = null;

function video() {
  const element = document.createElement("video");
  Object.defineProperties(element, {
    currentTime: { get: () => position, set: (value: number) => { position = value; }, configurable: true },
    paused: { get: () => paused, configurable: true },
    ended: { get: () => ended, configurable: true },
    readyState: { get: () => readyState, configurable: true }
  });
  return element;
}

function metadata() {
  return {
    videoId: "video", title: "Test", channelName: "Kanal", url: "https://youtube.com/watch?v=video",
    durationSeconds: 120, topics: [], contentType: "standard" as const
  };
}

async function advancePlaying(milliseconds: number) {
  position += milliseconds / 1000;
  await vi.advanceTimersByTimeAsync(milliseconds);
}

describe("YouTubeTracker aktif süre doğruluğu", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-07-28T12:00:00Z"));
    position = 0; paused = false; ended = false; readyState = HTMLMediaElement.HAVE_FUTURE_DATA; hidden = false;
    Object.defineProperty(document, "hidden", { get: () => hidden, configurable: true });
    pictureInPictureElement = null;
    Object.defineProperty(document, "pictureInPictureElement", { get: () => pictureInPictureElement, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("duraklatma anına kadar geçen aktif kesri sayar, duraklatılmış zamanı saymaz", async () => {
    const element = video();
    const tracker = new YouTubeTracker(element, metadata());
    await tracker.start();
    await advancePlaying(1_500);
    paused = true;
    position = 1.5;
    element.dispatchEvent(new Event("pause"));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(tracker.snapshot().watchSeconds).toBeCloseTo(1.5, 5);
    await tracker.stop(false);
  });

  it("buffering ve görünmez sekme süresini saymaz; devam edince yeni segment başlatır", async () => {
    const element = video();
    const tracker = new YouTubeTracker(element, metadata());
    await tracker.start();
    await advancePlaying(1_000);
    readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    element.dispatchEvent(new Event("waiting"));
    await vi.advanceTimersByTimeAsync(2_000);
    readyState = HTMLMediaElement.HAVE_FUTURE_DATA;
    element.dispatchEvent(new Event("playing"));
    await advancePlaying(1_000);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(tracker.snapshot().watchSeconds).toBeCloseTo(2, 5);
    await tracker.stop(false);
  });

  it("Opera Video Popout/Picture-in-Picture oynatmasını sekme gizliyken sayar", async () => {
    const element = video();
    const tracker = new YouTubeTracker(element, metadata());
    await tracker.start();
    await advancePlaying(1_000);

    pictureInPictureElement = element;
    element.dispatchEvent(new Event("enterpictureinpicture"));
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await advancePlaying(2_000);
    expect(tracker.snapshot().watchSeconds).toBeCloseTo(3, 5);

    pictureInPictureElement = null;
    element.dispatchEvent(new Event("leavepictureinpicture"));
    await advancePlaying(2_000);
    expect(tracker.snapshot().watchSeconds).toBeCloseTo(3, 5);
    await tracker.stop(false);
  });

  it("normal arka plan sekmesindeki oynatmayı Picture-in-Picture yoksa saymaz", async () => {
    const element = video();
    const tracker = new YouTubeTracker(element, metadata());
    await tracker.start();
    await advancePlaying(1_000);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await advancePlaying(3_000);
    expect(tracker.snapshot().watchSeconds).toBeCloseTo(1, 5);
    await tracker.stop(false);
  });

  it("oynatıcı ready görünse bile medya konumu donduğunda hayalet süre saymaz", async () => {
    const element = video();
    const tracker = new YouTubeTracker(element, metadata());
    await tracker.start();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(tracker.snapshot().watchSeconds).toBe(0);
    await tracker.stop(false);
  });

  it("canlı sayaç durumunu oynatma ve duraklatma geçişlerinde açıklar", async () => {
    const element = video();
    const states: string[] = [];
    const tracker = new YouTubeTracker(element, metadata(), { onStatus: (status) => states.push(status.state) });
    await tracker.start();
    await advancePlaying(1_000);
    paused = true;
    element.dispatchEvent(new Event("pause"));
    expect(states).toContain("counting");
    expect(states.at(-1)).toBe("paused");
    await tracker.stop(false);
  });

  it("ileri sarılan aralığı segmentlere eklemez", async () => {
    const element = video();
    const tracker = new YouTubeTracker(element, metadata());
    await tracker.start();
    await advancePlaying(2_000);
    position = 50;
    element.dispatchEvent(new Event("seeking"));
    element.dispatchEvent(new Event("seeked"));
    await advancePlaying(1_000);
    const snapshot = await tracker.stop(false);
    expect(snapshot.forwardSeekCount).toBe(1);
    expect(snapshot.playbackSegments).toEqual([{ start: 0, end: 2 }, { start: 50, end: 51 }]);
  });
});
