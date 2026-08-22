// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  isSkippableMomentActive,
  mountPlayerOverlay,
  skippableMomentWindow,
  unmountPlayerOverlay,
} from "../src/content/player-overlay";
import type { VideoMetadata } from "../src/shared/types";

describe("oynatıcı içi atlama katmanı", () => {
  it("tek giriş etiketini en fazla 30 saniyelik pencereye sınırlar", () => {
    const window = skippableMomentWindow([{ startSeconds: 0, label: "Giriş ve konu tanıtımı" }], 600);

    expect(window).toMatchObject({ endSeconds: 30 });
    expect(isSkippableMomentActive(window!, 15)).toBe(true);
    expect(isSkippableMomentActive(window!, 30)).toBe(false);
    expect(isSkippableMomentActive(window!, 240)).toBe(false);
  });

  it("sonraki bölüm daha erken başlıyorsa düğmeyi o noktada gizler", () => {
    const window = skippableMomentWindow([
      { startSeconds: 0, label: "Giriş" },
      { startSeconds: 18, label: "Test ve uygulama" },
    ], 600);

    expect(window?.endSeconds).toBe(18);
    expect(isSkippableMomentActive(window!, 17.9)).toBe(true);
    expect(isSkippableMomentActive(window!, 18)).toBe(false);
  });

  it("giriş veya sponsor bölümü yoksa katman üretmez", () => {
    expect(skippableMomentWindow([{ startSeconds: 10, label: "Ürün incelemesi" }], 600)).toBeUndefined();
  });

  it("oynatma aralığın dışına çıktığında gerçek katmanı gizler", () => {
    document.body.innerHTML = '<div id="movie_player"><video class="html5-main-video"></video></div>';
    const video = document.querySelector<HTMLVideoElement>("video")!;
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 15 });
    const metadata: VideoMetadata = {
      videoId: "overlay-test",
      title: "Test video",
      channelName: "Test kanal",
      url: "https://youtube.com/watch?v=overlay-test",
      durationSeconds: 600,
      topics: ["Programlama"],
      contentType: "standard",
      transcriptAnalysis: {
        available: true,
        wordCount: 20,
        keywords: [],
        summary: "",
        informationDensity: 50,
        repetitionRate: 0,
        titlePromiseCoverage: 50,
        promiseVerdict: "partial",
        keyMoments: [{ startSeconds: 0, label: "Giriş ve konu tanıtımı" }],
        analyzedAt: "2026-08-02T00:00:00Z",
      },
    };

    mountPlayerOverlay(metadata);
    const overlay = document.querySelector<HTMLElement>("#demirtube-player-overlay")!;
    expect(overlay.hidden).toBe(false);

    video.currentTime = 31;
    video.dispatchEvent(new Event("timeupdate"));
    expect(overlay.hidden).toBe(true);

    unmountPlayerOverlay();
  });
});
