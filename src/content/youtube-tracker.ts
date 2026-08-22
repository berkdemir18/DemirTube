import { mergeSegments } from "../analytics/completion";
import { PERSIST_INTERVAL_MS } from "../shared/constants";
import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import type { PlaybackSegment, Settings, TrackingRuntimeStatus, VideoMetadata, WatchSession } from "../shared/types";
import { isoNow, uid } from "../shared/utils";

type TrackerCallbacks = {
  onUpdate?: (session: WatchSession) => void;
  onStatus?: (status: TrackingRuntimeStatus) => void;
};

export class YouTubeTracker {
  private session: WatchSession;
  private lastTick = performance.now();
  private lastPosition = 0;
  private unaccountedMediaSeconds = 0;
  private lastAccountedElapsed = 0;
  private segmentStart?: number;
  private pictureInPictureActive = false;
  // Son örnekten bu yana videonun gerçekten aktif olup olmadığını saklarız.
  // Olay geldiğinde video.paused/readyState çoktan değişmiş olabileceği için
  // sadece o anki DOM durumuna bakmak önceki aktif kesri kaybettirirdi.
  private activeAtLastSample = false;
  private timer?: number;
  private lastPersistedAt = Date.now();
  private stopped = false;
  private lastStatus?: TrackingRuntimeStatus["state"];
  private listeners: Array<() => void> = [];
  private mediaListeners: Array<() => void> = [];

  constructor(private video: HTMLVideoElement, private metadata: VideoMetadata, private callbacks: TrackerCallbacks = {}) {
    this.session = {
      id: uid(), videoId: metadata.videoId, startedAt: isoNow(), updatedAt: isoNow(), watchSeconds: 0,
      maximumPosition: video.currentTime, pauseCount: 0, forwardSeekCount: 0, backwardSeekCount: 0,
      tabHiddenCount: 0, playbackSegments: [], endedNaturally: false, active: true
    };
    this.lastPosition = video.currentTime;
  }

  async start() {
    let settings: Settings;
    try {
      settings = await sendMessage<Settings>({ type: "GET_SETTINGS" });
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        this.abort();
        return false;
      }
      throw error;
    }
    if (!settings.trackingEnabled) return false;
    // Ayar yanıtı beklenirken geçen zaman henüz takip oturumuna ait değildir.
    this.lastTick = performance.now();
    this.pictureInPictureActive = document.pictureInPictureElement === this.video;
    this.bindMediaListeners();
    const visibility = () => {
      this.accountElapsed();
      const hiddenWithoutPictureInPicture = document.hidden && !this.isPictureInPicture();
      if (document.hidden) {
        this.session.tabHiddenCount += 1;
        if (hiddenWithoutPictureInPicture) {
          this.closeSegment();
          this.activeAtLastSample = false;
        } else {
          this.refreshActivity();
        }
        void this.persistSafely();
      } else this.refreshActivity();
    };
    document.addEventListener("visibilitychange", visibility);
    this.listeners.push(() => document.removeEventListener("visibilitychange", visibility));
    this.timer = window.setInterval(() => this.tick(), 1000);
    this.tick();
    return true;
  }

  private bindMediaListeners() {
    this.listenMedia(this.video, "pause", () => {
      this.accountElapsed();
      if (!this.video.ended) this.session.pauseCount += 1;
      this.closeSegment();
      this.activeAtLastSample = false;
      this.emitStatus();
    });
    this.listenMedia(this.video, "play", () => { this.accountElapsed(); this.refreshActivity(); });
    this.listenMedia(this.video, "playing", () => { this.accountElapsed(); this.refreshActivity(); });
    this.listenMedia(this.video, "waiting", () => {
      this.accountElapsed();
      this.closeSegment();
      this.activeAtLastSample = false;
      this.emitStatus("buffering");
    });
    this.listenMedia(this.video, "seeking", () => { this.handleSeek(); this.emitStatus("seeking"); });
    this.listenMedia(this.video, "seeked", () => { this.accountElapsed(false); this.refreshActivity(); });
    this.listenMedia(this.video, "enterpictureinpicture", () => {
      this.accountElapsed();
      this.pictureInPictureActive = true;
      this.refreshActivity();
    });
    this.listenMedia(this.video, "leavepictureinpicture", () => {
      this.accountElapsed();
      this.pictureInPictureActive = false;
      this.closeSegment();
      this.activeAtLastSample = false;
      this.refreshActivity();
      void this.persistSafely();
    });
    this.listenMedia(this.video, "ended", () => {
      this.session.endedNaturally = true;
      void this.stop(false).catch((error) => {
        if (!isExtensionContextInvalidated(error)) console.warn("DemirTube biten oturumu kaydedemedi.", error);
      });
    });
  }

  async refreshMetadata(metadata: VideoMetadata) {
    if (this.stopped || metadata.videoId !== this.session.videoId) return;
    this.metadata = metadata;
    await this.persistSafely();
  }

  private listenMedia<K extends keyof HTMLVideoElementEventMap>(target: HTMLVideoElement, event: K, callback: () => void) {
    target.addEventListener(event, callback);
    this.mediaListeners.push(() => target.removeEventListener(event, callback));
  }

  reconnect(video: HTMLVideoElement) {
    if (this.stopped || video === this.video) return;
    this.accountElapsed();
    this.closeSegment();
    this.mediaListeners.forEach((dispose) => dispose());
    this.mediaListeners = [];
    this.video = video;
    this.lastPosition = video.currentTime;
    this.lastTick = performance.now();
    this.segmentStart = undefined;
    this.activeAtLastSample = false;
    this.unaccountedMediaSeconds = 0;
    this.pictureInPictureActive = document.pictureInPictureElement === video;
    this.bindMediaListeners();
    this.refreshActivity();
  }

  snapshot() {
    return structuredClone(this.session);
  }

  private isActive() {
    const visibleToUser = !document.hidden || this.isPictureInPicture();
    return !this.video.paused && !this.video.ended && visibleToUser && this.video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  private isPictureInPicture() {
    return this.pictureInPictureActive || document.pictureInPictureElement === this.video;
  }

  private accountElapsed(updateMaximumPosition = true) {
    const now = performance.now();
    const elapsedSinceLastSample = Math.max(0, (now - this.lastTick) / 1000);
    // Gizli sekmelerde zamanlayıcılar seyrekleşebilir. Video gerçekten PiP/Opera
    // Video Popout içindeyse medya konumundaki ilerlemeye göre güvenli bir üst
    // sınır tanıyarak bu gerçek izleme süresini iki saniyeye kırpmayız.
    const playbackRate = Math.max(0.1, Math.abs(this.video.playbackRate || 1));
    const mediaProgressSeconds = Math.abs(this.video.currentTime - this.lastPosition) / playbackRate;
    const elapsedCap = this.isPictureInPicture() ? Math.max(2, mediaProgressSeconds + 0.5) : 2;
    // readyState tek başına yeterli değil: YouTube bazen "waiting" olayı
    // göndermeden kareyi dondurabiliyor. Sayaç yalnızca medya konumu gerçekten
    // ilerlediyse yürüsün. Örnekler arasındaki medya ilerleme kredisi korunur;
    // 2x hızda da playbackRate'e bölünerek gerçek (duvar saati) süre sayılır.
    if (this.activeAtLastSample && updateMaximumPosition) {
      this.unaccountedMediaSeconds += mediaProgressSeconds;
    }
    const progressCap = this.unaccountedMediaSeconds;
    const elapsed = Math.min(elapsedSinceLastSample, elapsedCap, progressCap);
    this.lastTick = now;
    this.lastAccountedElapsed = 0;
    if (!this.activeAtLastSample) return;
    this.session.watchSeconds += elapsed;
    this.lastAccountedElapsed = elapsed;
    this.unaccountedMediaSeconds = Math.max(0, this.unaccountedMediaSeconds - elapsed);
    if (updateMaximumPosition) this.session.maximumPosition = Math.max(this.session.maximumPosition, this.video.currentTime);
  }

  private refreshActivity() {
    const active = this.isActive();
    if (active) this.segmentStart ??= this.video.currentTime;
    else this.closeSegment();
    this.activeAtLastSample = active;
    this.emitStatus();
  }

  private emitStatus(override?: TrackingRuntimeStatus["state"]) {
    let state = override;
    if (!state) {
      if (this.stopped || this.video.ended) state = "ended";
      else if (document.hidden && !this.isPictureInPicture()) state = "hidden";
      else if (this.video.seeking) state = "seeking";
      else if (this.video.paused) state = "paused";
      else if (this.video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || (this.activeAtLastSample && this.lastAccountedElapsed === 0)) state = "buffering";
      else state = "counting";
    }
    if (state === this.lastStatus) return;
    this.lastStatus = state;
    const copy: Record<TrackingRuntimeStatus["state"], Omit<TrackingRuntimeStatus, "state">> = {
      counting: { label: "Sayılıyor", detail: this.isPictureInPicture() ? "Picture-in-Picture aktif süresi sayılıyor." : "Video ilerliyor ve aktif süre sayılıyor." },
      paused: { label: "Duraklatıldı", detail: "Video duraklatıldığı için sayaç bekliyor." },
      hidden: { label: "Sekme görünmüyor", detail: "Picture-in-Picture dışında gizli sekme süresi sayılmaz." },
      buffering: { label: "Video yükleniyor", detail: "Medya ilerleyene kadar sayaç bekliyor." },
      seeking: { label: "Konum değiştiriliyor", detail: "Atlanan aralık izlenmiş sayılmıyor." },
      ended: { label: "Oturum tamamlandı", detail: "Aktif izleme kaydı güvenle kapatıldı." },
      waiting: { label: "Video bekleniyor", detail: "Takip başlayınca durum burada görünecek." }
    };
    this.callbacks.onStatus?.({ state, ...copy[state] });
  }

  private tick() {
    if (this.stopped) return;
    this.accountElapsed();
    this.refreshActivity();
    this.lastPosition = this.video.currentTime;
    this.callbacks.onUpdate?.(structuredClone(this.session));
    if (Date.now() - this.lastPersistedAt >= PERSIST_INTERVAL_MS) {
      this.lastPersistedAt = Date.now();
      void this.persistSafely();
    }
  }

  private handleSeek() {
    // seeking olayı geldiğinde currentTime hedef konuma geçmiş olabilir.
    // Bu yüzden önceki aktif kesri sayarken maksimum konumu güncellemeyiz.
    this.accountElapsed(false);
    this.closeSegment(this.lastPosition);
    const delta = this.video.currentTime - this.lastPosition;
    if (delta > 2) this.session.forwardSeekCount += 1;
    if (delta < -2) this.session.backwardSeekCount += 1;
    this.lastPosition = this.video.currentTime;
    this.segmentStart = undefined;
    this.activeAtLastSample = false;
  }

  private closeSegment(position = this.video.currentTime) {
    if (this.segmentStart !== undefined && position > this.segmentStart) {
      const segment: PlaybackSegment = { start: this.segmentStart, end: position };
      this.session.playbackSegments = mergeSegments([...this.session.playbackSegments, segment]);
    }
    this.segmentStart = undefined;
  }

  private async persist() {
    this.accountElapsed();
    this.closeSegment();
    this.session.exitPosition = this.video.currentTime;
    this.session.updatedAt = isoNow();
    this.session.active = true;
    this.session.endedAt = undefined;
    await sendMessage({ type: "SAVE_SESSION", metadata: this.metadata, session: this.session });
    this.refreshActivity();
  }

  private async persistSafely(retries = 1) {
    try {
      await this.persist();
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        this.abort();
        return;
      }
      // "Message channel closed" = service worker uyudu; kısa bekle, tekrar dene.
      if (
        retries > 0 &&
        error instanceof Error &&
        /message channel closed|channel closed before/i.test(error.message)
      ) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
        await this.persistSafely(retries - 1);
        return;
      }
      console.warn("DemirTube oturum kontrol noktası kaydedilemedi.", error);
    }
  }

  abort() {
    if (this.stopped) return;
    this.stopped = true;
    this.emitStatus("ended");
    if (this.timer) clearInterval(this.timer);
    this.closeSegment();
    this.mediaListeners.forEach((dispose) => dispose());
    this.mediaListeners = [];
    this.listeners.forEach((dispose) => dispose());
    this.listeners = [];
  }

  async stop(followedByAnotherVideo: boolean) {
    if (this.stopped) return structuredClone(this.session);
    this.accountElapsed();
    this.stopped = true;
    this.emitStatus("ended");
    if (this.timer) clearInterval(this.timer);
    this.closeSegment();
    this.session.exitPosition = this.video.currentTime;
    this.session.updatedAt = isoNow();
    this.session.endedAt = this.session.updatedAt;
    this.session.followedByAnotherVideo = followedByAnotherVideo;
    this.session.active = false;
    this.mediaListeners.forEach((dispose) => dispose());
    this.mediaListeners = [];
    this.listeners.forEach((dispose) => dispose());
    this.listeners = [];
    try {
      await sendMessage({ type: "SAVE_SESSION", metadata: this.metadata, session: this.session });
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) throw error;
    }
    return structuredClone(this.session);
  }
}
