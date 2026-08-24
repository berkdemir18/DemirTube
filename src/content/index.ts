// DemirTube · içerik betiği çekirdeği
//
// Bu paket her youtube.com sayfasında çalışır ve React içermez: navigasyon
// gözlemcisi, izleme takibi, akış rozetleri, arama filtresi, kanal rozeti ve
// oynatıcı katmanı. Panel/dock gibi React arayüzleri yalnızca izlenebilir bir
// watch/shorts rotasına girildiğinde video-ui paketi enjekte edilerek yüklenir.
import { currentTrackableVideoElement, isTrackableVideoRoute, observeYouTubeNavigation, waitForVideoElement } from "./navigation-observer";
import { currentPlaybackIsLive, readVideoMetadata } from "./video-metadata";
import { YouTubeTracker } from "./youtube-tracker";
import { getVideoId } from "../shared/utils";
import type { Settings, TrackingRuntimeStatus, UserVideoFeedback, VideoMetadata, VideoRecord, WatchSession } from "../shared/types";
import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import { clearFeedDecorations, startFeedDecorator } from "./feed-decorator";
import { refreshSearchFilterBar } from "./search-filter-bar";
import { mountPlayerOverlay, unmountPlayerOverlay } from "./player-overlay";
import { refreshChannelBadge } from "./channel-report-badge";
import { startBudgetGuard, stopBudgetGuard } from "./budget-guard";
import type { VideoUi } from "./video-ui";

let tracker: YouTubeTracker | undefined;
let activeVideo: HTMLVideoElement | undefined;
let activeVideoId = "";
let activeContentType: VideoMetadata["contentType"] | undefined;
let activeMetadata: VideoMetadata | undefined;
let trackingStatus: TrackingRuntimeStatus = { state: "waiting", label: "Video bekleniyor", detail: "Takip başlayınca durum burada görünecek." };
let runToken = 0;
let contextDisposed = false;

// ── React arayüzünün tembel yüklenmesi ───────────────────────────────────────
// video-ui paketi service worker tarafından aynı izole dünyaya enjekte edilir;
// çalıştığında kendini window.__demirtubeVideoUi üzerine kaydeder.
let videoUiLoad: Promise<VideoUi | undefined> | undefined;

function loadVideoUi(): Promise<VideoUi | undefined> {
  if (window.__demirtubeVideoUi) return Promise.resolve(window.__demirtubeVideoUi);
  videoUiLoad ??= sendMessage({ type: "INJECT_VIDEO_UI" })
    .then(() => {
      const ui = window.__demirtubeVideoUi;
      if (!ui) videoUiLoad = undefined; // enjeksiyon sessizce başarısız olduysa tekrar denenebilsin
      return ui;
    })
    .catch((error) => {
      videoUiLoad = undefined;
      if (!isExtensionContextInvalidated(error)) console.warn("DemirTube panel arayüzü yüklenemedi.", error);
      return undefined;
    });
  return videoUiLoad;
}

/** Yüklüyse hemen, değilse enjeksiyondan sonra React arayüzünü kullanır. */
function withVideoUi(use: (ui: VideoUi) => void) {
  const loaded = window.__demirtubeVideoUi;
  if (loaded) { use(loaded); return; }
  void loadVideoUi().then((ui) => { if (ui) use(ui); });
}

function unmountPanel() {
  window.__demirtubeVideoUi?.unmountPanel();
}

function unmountVideoUi() {
  unmountPanel();
  window.__demirtubeVideoUi?.unmountShortsDock();
  unmountPlayerOverlay();
}

function mountPanel(metadata: VideoMetadata, tokenAtStart = runToken) {
  activeMetadata = metadata;
  withVideoUi((ui) => ui.mountPanel(metadata, () => trackingStatus, () => tokenAtStart !== runToken));
}

async function maybePrompt(session?: WatchSession) {
  if (!session || session.endedNaturally || session.watchSeconds < 10 || session.watchSeconds > 120 || session.feedbackPromptShown) return;
  const [settings, context] = await Promise.all([
    sendMessage<Settings>({ type: "GET_SETTINGS" }),
    sendMessage<{ video?: VideoRecord; feedback?: UserVideoFeedback }>({ type: "GET_VIDEO_CONTEXT", videoId: session.videoId })
  ]);
  if (context.video?.contentType === "short") return;
  if (!settings.earlyExitPromptEnabled || !settings.trackingEnabled || context.feedback?.excludedFromAnalytics) return;
  withVideoUi((ui) => ui.showLeavePrompt(session.id));
}

async function begin() {
  if (contextDisposed || !globalThis.chrome?.runtime?.id) return;
  const nextId = isTrackableVideoRoute() ? getVideoId() : "";
  const currentElement = currentTrackableVideoElement();
  if (nextId && nextId === activeVideoId && tracker) {
    if (currentElement && currentElement !== activeVideo) {
      tracker.reconnect(currentElement);
      activeVideo = currentElement;
    }
    return;
  }

  const token = ++runToken;
  const previousTracker = tracker;
  const previousId = activeVideoId;
  tracker = undefined;
  activeVideo = undefined;
  activeVideoId = "";
  activeContentType = undefined;
  activeMetadata = undefined;
  unmountVideoUi();
  // Önceki oturumun kaydı (SAVE_SESSION → uyuyan servis worker'ın uyanması,
  // özetin yeniden kurulması, bulut senkron planı) saniyeler sürebiliyor.
  // Bunu beklersek yeni videonun paneli ve takibi o kadar geç başlıyordu —
  // izlemenin ilk saniyeleri hiç sayılmıyordu. Oturum durumu stop() içinde
  // zaten eşzamanlı olarak dondurulduğu için kaydı arka plana bırakmak
  // güvenli: beklemeden devam ediyoruz.
  void previousTracker?.stop(Boolean(nextId && nextId !== previousId))
    .then((ended) => (ended ? maybePrompt(ended) : undefined))
    .catch(() => undefined);
  if (!nextId) {
    void sendMessage({ type: "CONTENT_STATE", state: "YouTube sayfasında bekliyor" }).catch(() => undefined);
    return;
  }

  // İzlenebilir rotaya girildi: React arayüzünü şimdiden getirt ki panel
  // metadata hazır olduğunda beklemeden bağlansın.
  void loadVideoUi();

  const video = await waitForVideoElement();
  if (!video || token !== runToken || getVideoId() !== nextId) return;
  const settings = await sendMessage<Settings>({ type: "GET_SETTINGS" });
  const metadata = await readVideoMetadata(video, false);
  if (token !== runToken || metadata.videoId !== getVideoId()) return;
  mountPanel(metadata);
  const nextTracker = new YouTubeTracker(video, metadata, {
    onStatus: (status) => {
      trackingStatus = status;
      if (activeMetadata && tracker === nextTracker) mountPanel(activeMetadata, token);
    }
  });
  tracker = nextTracker;
  activeVideo = video;
  activeVideoId = metadata.videoId;
  activeContentType = metadata.contentType;
  const started = await nextTracker.start();
  if (!started || token !== runToken) {
    nextTracker.abort();
    if (tracker === nextTracker) {
      tracker = undefined;
      activeVideo = undefined;
      activeVideoId = "";
      activeContentType = undefined;
      activeMetadata = undefined;
    }
    return;
  }
  if (location.pathname.startsWith("/shorts/")) withVideoUi((ui) => ui.mountShortsDock(metadata));
  mountPlayerOverlay(metadata);
  refreshSearchFilterBar();
  void sendMessage({ type: "CONTENT_STATE", state: `İzleniyor: ${metadata.videoId}` }).catch(() => undefined);
  void (async () => {
    const delays = settings.transcriptAnalysisEnabled ? [2_000, 6_000, 12_000] : [2_000];
    for (const delay of delays) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      if (token !== runToken || video !== activeVideo || tracker !== nextTracker) return;
      const refinedMetadata = await readVideoMetadata(video, settings.transcriptAnalysisEnabled);
      if (token !== runToken || refinedMetadata.videoId !== getVideoId()) return;
      await nextTracker.refreshMetadata(refinedMetadata);
      activeContentType = refinedMetadata.contentType;
      mountPanel(refinedMetadata);
      mountPlayerOverlay(refinedMetadata);
      if (!settings.transcriptAnalysisEnabled || refinedMetadata.transcriptAnalysis?.available) return;
    }
  })().catch((error) => {
    if (!isExtensionContextInvalidated(error)) console.warn("DemirTube altyazı/metadata yenilemesi tamamlanamadı.", error);
  });
  // Shorts oynatıcı bazen gerçek süreyi ilk metadata olayından sonra doldurur.
  // İkinci hafif okuma, 0 sn süreli hatalı Shorts özetlerini düzeltir.
  if (location.pathname.startsWith("/shorts/")) window.setTimeout(async () => {
    if (token !== runToken || video !== activeVideo || tracker !== nextTracker) return;
    const refreshedShort = await readVideoMetadata(video, false);
    if (token === runToken && refreshedShort.videoId === getVideoId()) {
      await nextTracker.refreshMetadata(refreshedShort);
      activeContentType = refreshedShort.contentType;
      mountPanel(refreshedShort);
    }
  }, 6_000);
}

function safeBegin() {
  void begin().catch((error) => {
    if (isExtensionContextInvalidated(error)) {
      contextDisposed = true;
      tracker?.abort();
      unmountVideoUi();
      return;
    }
    console.warn("DemirTube video takibini başlatamadı.", error);
  });
}

const stopNavigationObserver = observeYouTubeNavigation(() => {
  safeBegin();
  refreshChannelBadge();
  refreshSearchFilterBar();
});
let stopFeedDecorator: () => void = () => undefined;
void startFeedDecorator().then((stop) => { stopFeedDecorator = stop; }).catch(() => undefined);
startBudgetGuard();
safeBegin();
const replacementTimer = window.setInterval(() => {
  if (!globalThis.chrome?.runtime?.id) {
    contextDisposed = true;
    clearInterval(replacementTimer);
    stopNavigationObserver();
    stopFeedDecorator();
    stopBudgetGuard();
    tracker?.abort();
    tracker = undefined;
    activeVideo = undefined;
    activeVideoId = "";
    activeContentType = undefined;
    activeMetadata = undefined;
    unmountVideoUi();
    return;
  }
  const current = currentTrackableVideoElement();
  if (document.visibilityState !== "hidden") {
    refreshChannelBadge();
    refreshSearchFilterBar();
  }
  if (activeMetadata && tracker) {
    if (!document.querySelector("#demirtube-panel-host")) mountPanel(activeMetadata);
    if (document.querySelector("#movie_player, .html5-video-player") && !document.querySelector("#demirtube-player-hud")) {
      mountPlayerOverlay(activeMetadata);
    }
    if (location.pathname.startsWith("/shorts/") && !document.querySelector("#demirtube-shorts-dock")) {
      const metadata = activeMetadata;
      withVideoUi((ui) => ui.mountShortsDock(metadata));
    }
  }
  if (activeVideoId && current && activeVideo && current !== activeVideo) {
    tracker?.reconnect(current);
    activeVideo = current;
  }
  if (activeVideoId && activeVideo && tracker && activeContentType !== "livestream" && currentPlaybackIsLive(activeVideo)) {
    activeContentType = "livestream";
    const token = runToken;
    void readVideoMetadata(activeVideo, false).then(async (metadata) => {
      if (token !== runToken || metadata.videoId !== activeVideoId || metadata.contentType !== "livestream") return;
      await tracker?.refreshMetadata(metadata);
      mountPanel(metadata, token);
      mountPlayerOverlay(metadata);
    }).catch(() => undefined);
  }
}, 5_000);

chrome.storage.onChanged.addListener((changes) => {
  const nextSettings = changes.settings?.newValue as Partial<Settings> | undefined;
  const enabled = nextSettings?.trackingEnabled;
  if (nextSettings?.feedBadgesEnabled === false) {
    clearFeedDecorations();
  }
  if (nextSettings?.feedBadgesEnabled === true) {
    stopFeedDecorator();
    void startFeedDecorator().then((stop) => { stopFeedDecorator = stop; }).catch(() => undefined);
  }
  if (enabled === false) void (async () => {
    const currentTracker = tracker;
    tracker = undefined;
    activeVideo = undefined;
    activeVideoId = "";
      activeContentType = undefined;
      activeMetadata = undefined;
    try { await currentTracker?.stop(false); }
    catch (error) { if (!isExtensionContextInvalidated(error)) console.warn("DemirTube takibi durdurulamadı.", error); }
  })();
  if (enabled === true && !tracker) safeBegin();
});

window.addEventListener("pagehide", () => {
  void tracker?.stop(false).catch((error) => {
    if (!isExtensionContextInvalidated(error)) console.warn("DemirTube oturumu kapatılamadı.", error);
  });
});

// Alt+D kısayolu (service worker iletir) → paneli aç/kapat; panel storage.onChanged ile anında tepki verir.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "TOGGLE_PANEL") return;
  void (async () => {
    try {
      const settings = await sendMessage<Settings>({ type: "GET_SETTINGS" });
      if (settings) {
        await sendMessage({ type: "SET_SETTINGS", settings: { ...settings, panelCollapsed: !settings.panelCollapsed } });
      }
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) console.warn("DemirTube panel kısayolu çalışamadı.", error);
    }
  })();
});

refreshChannelBadge();
refreshSearchFilterBar();
