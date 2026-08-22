// DemirTube · video sayfası React arayüzü
//
// Bu dosya ayrı bir paket olarak derlenir (dist/assets/video-ui.js) ve YALNIZCA
// izlenebilir bir watch/shorts rotasına girildiğinde service worker tarafından
// chrome.scripting ile içerik betiğinin izole dünyasına enjekte edilir.
// Böylece React, ReactDOM ve panel arayüzü ana sayfa, arama ve kanal
// sayfalarında hiç yüklenmez.
//
// Çekirdek betik (index.ts) bu modüle window.__demirtubeVideoUi üzerinden erişir.
import { createRoot, type Root } from "react-dom/client";
import { RecommendationPanel } from "./recommendation-panel";
import { panelCss } from "./panel-css";
import { LeavePrompt, leavePromptCss } from "./leave-prompt";
import { mountShortsFeedbackDock, unmountShortsFeedbackDock } from "./shorts-feedback-dock";
import type { TrackingRuntimeStatus, VideoMetadata } from "../shared/types";

export type VideoUi = {
  mountPanel(metadata: VideoMetadata, readStatus: () => TrackingRuntimeStatus, isStale: () => boolean): void;
  unmountPanel(): void;
  showLeavePrompt(sessionId: string): void;
  mountShortsDock(metadata: VideoMetadata): void;
  unmountShortsDock(): void;
};

declare global {
  interface Window {
    __demirtubeVideoUi?: VideoUi;
  }
}

let panelRoot: Root | undefined;
let panelMountRequest = 0;

function unmountPanel() {
  panelMountRequest += 1;
  panelRoot?.unmount();
  panelRoot = undefined;
  document.querySelector("#demirtube-panel-host")?.remove();
}

async function findPanelAnchor(): Promise<HTMLElement | null> {
  const primarySelectors = [
    "#secondary-inner",
    "#secondary",
    "ytd-watch-flexy #secondary",
    "#related",
    "#items.ytd-watch-next-feed-renderer",
  ];
  const fallbackSelectors = [
    "#below",
    "#comments",
    "#primary-inner",
    "#above-the-fold",
  ];

  for (let attempt = 0; attempt < 25; attempt++) {
    for (const sel of primarySelectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && (el.offsetParent !== null || el.tagName.includes("-"))) return el;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Fallback if secondary column is hidden (e.g. theater mode or compact)
  for (const sel of fallbackSelectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return document.querySelector<HTMLElement>("#secondary-inner, #secondary, #below");
}

function mountPanel(metadata: VideoMetadata, readStatus: () => TrackingRuntimeStatus, isStale: () => boolean) {
  const existingHost = document.querySelector<HTMLElement>("#demirtube-panel-host");
  if (panelRoot && existingHost?.isConnected) {
    panelRoot.render(<RecommendationPanel metadata={metadata} trackingStatus={readStatus()} />);
    return;
  }
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = undefined;
  }
  existingHost?.remove();
  const request = ++panelMountRequest;
  void findPanelAnchor().then((anchor) => {
    if (!anchor || isStale() || request !== panelMountRequest) return;
    if (document.querySelector("#demirtube-panel-host")) return;

    const host = document.createElement("div");
    host.id = "demirtube-panel-host";
    host.style.marginBottom = "16px";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = panelCss;
    const container = document.createElement("div");
    shadow.append(style, container);

    if (anchor.id === "secondary-inner" || anchor.id === "secondary" || anchor.id === "related") {
      anchor.prepend(host);
    } else {
      anchor.before(host);
    }

    panelRoot = createRoot(container);
    panelRoot.render(<RecommendationPanel metadata={metadata} trackingStatus={readStatus()} />);
  });
}

function showLeavePrompt(sessionId: string) {
  document.querySelector("#demirtube-leave-host")?.remove();
  const host = document.createElement("div");
  host.id = "demirtube-leave-host";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = leavePromptCss;
  const container = document.createElement("div");
  shadow.append(style, container);
  document.documentElement.append(host);
  const root = createRoot(container);
  const close = () => { root.unmount(); host.remove(); };
  root.render(<LeavePrompt sessionId={sessionId} onClose={close} />);
}

// Aynı sekmeye ikinci kez enjekte edilirse mevcut React kökleri korunur.
window.__demirtubeVideoUi ??= {
  mountPanel,
  unmountPanel,
  showLeavePrompt,
  mountShortsDock: mountShortsFeedbackDock,
  unmountShortsDock: unmountShortsFeedbackDock,
};
