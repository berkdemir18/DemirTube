// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { waitForUsableDuration } from "../src/content/video-metadata";

/**
 * Gerçek bir <video> yerine olay yayan sahte öge: jsdom'da duration/readyState
 * salt-okunur olduğu için testin süreyi kontrol edebilmesi gerekiyor.
 */
function fakeVideo(initial: { duration: number; readyState: number }) {
  const listeners = new Map<string, Set<() => void>>();
  const video = {
    duration: initial.duration,
    readyState: initial.readyState,
    addEventListener(type: string, handler: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.get(type)?.delete(handler);
    },
    emit(type: string) {
      [...(listeners.get(type) ?? [])].forEach((handler) => handler());
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, set) => total + set.size, 0);
    }
  };
  return video as typeof video & HTMLVideoElement;
}

describe("süre beklemesi", () => {
  it("süre geldiği anda bekleme biter, zaman aşımını doldurmaz", async () => {
    vi.useFakeTimers();
    try {
      const video = fakeVideo({ duration: NaN, readyState: 0 });
      let settled = false;
      const pending = waitForUsableDuration(video).then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toBe(false);

      video.duration = 212;
      video.emit("durationchange");
      await pending;
      expect(settled).toBe(true);
      // Dinleyiciler bırakılmalı; aksi halde her gezinmede sızıntı olur.
      expect(video.listenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("metadata zaten yüklüyken 3 saniye değil kısa pencere bekler", async () => {
    vi.useFakeTimers();
    try {
      // SPA gezinmesinde yeniden kullanılan öge: loadedmetadata bir daha gelmez.
      const video = fakeVideo({ duration: NaN, readyState: 1 });
      let settled = false;
      const pending = waitForUsableDuration(video).then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(399);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("metadata hiç yüklenmediyse üst sınır 3 saniyede kalır", async () => {
    vi.useFakeTimers();
    try {
      const video = fakeVideo({ duration: NaN, readyState: 0 });
      let settled = false;
      const pending = waitForUsableDuration(video).then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(2_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("süre hâlâ gelmemişken loadedmetadata tek başına beklemeyi bitirmez", async () => {
    vi.useFakeTimers();
    try {
      const video = fakeVideo({ duration: NaN, readyState: 0 });
      let settled = false;
      const pending = waitForUsableDuration(video).then(() => { settled = true; });

      video.emit("loadedmetadata");
      await vi.advanceTimersByTimeAsync(50);
      // Eski kod burada 0 sn süreli kayıt üretiyordu; artık süreyi bekliyoruz.
      expect(settled).toBe(false);

      video.duration = 58;
      video.emit("loadedmetadata");
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
