import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import type { TranscriptMoment, VideoDecision, VideoMetadata } from "../shared/types";
import { BRAND_MARK_DATA_URI } from "../shared/brand-assets";

let overlayHost: HTMLElement | null = null;
let hudHost: HTMLElement | null = null;
let mouseHideTimer = 0;
let mouseMoveTarget: HTMLElement | null = null;
let mouseMoveHandler: (() => void) | null = null;
let hudExpanded = false;
let hudDetail: HTMLElement | null = null;
let hudMetadata: VideoMetadata | null = null;
let worthPromptHost: HTMLElement | null = null;
let worthPromptTimer = 0;
let worthPromptShownFor = "";
let endedTarget: HTMLVideoElement | null = null;
let endedHandler: (() => void) | null = null;
let skipTarget: HTMLVideoElement | null = null;
let skipTimeHandler: (() => void) | null = null;

export type SkippableMomentWindow = {
  moment: TranscriptMoment;
  endSeconds: number;
};

/**
 * Altyazı analizi yalnızca bölüm başlangıçlarını saklar. Atlama düğmesini bir
 * sonraki bölüm başlangıcına kadar, en fazla 30 saniye gösterecek güvenli bir
 * aralığa dönüştürürüz; aksi halde tek bir "Giriş" etiketi tüm videoyu kaplar.
 */
export function skippableMomentWindow(
  moments: TranscriptMoment[],
  durationSeconds: number
): SkippableMomentWindow | undefined {
  const ordered = moments.toSorted((a, b) => a.startSeconds - b.startSeconds);
  const index = ordered.findIndex((moment) => {
    const label = moment.label.toLocaleLowerCase("tr-TR");
    return label.includes("sponsor") || label.includes("giriş") || label.includes("intro");
  });
  if (index < 0) return undefined;

  const moment = ordered[index];
  const maximumEnd = moment.startSeconds + 30;
  const nextStart = ordered.slice(index + 1)
    .find((candidate) => candidate.startSeconds > moment.startSeconds + 1)?.startSeconds;
  const videoEnd = durationSeconds > moment.startSeconds ? durationSeconds : maximumEnd;
  const endSeconds = Math.max(
    moment.startSeconds + 1,
    Math.min(maximumEnd, nextStart ?? maximumEnd, videoEnd)
  );
  return { moment, endSeconds };
}

export function isSkippableMomentActive(window: SkippableMomentWindow, currentTime: number) {
  return currentTime >= Math.max(0, window.moment.startSeconds - 1)
    && currentTime < window.endSeconds;
}

export function mountPlayerOverlay(metadata: VideoMetadata) {
  unmountPlayerOverlay();

  const video = document.querySelector<HTMLVideoElement>("video.html5-main-video");
  const playerContainer = document.querySelector<HTMLElement>("#movie_player, .html5-video-player");
  if (!video || !playerContainer) return;

  // 1. Sponsor / Intro Atlama Butonu Overlay
  const skipWindow = skippableMomentWindow(
    metadata.transcriptAnalysis?.keyMoments ?? [],
    metadata.durationSeconds
  );

  if (skipWindow) {
    overlayHost = document.createElement("div");
    overlayHost.id = "demirtube-player-overlay";
    overlayHost.className = "dt-player-skip";
    overlayHost.style.position = "absolute";
    overlayHost.style.bottom = "80px";
    overlayHost.style.right = "24px";
    overlayHost.style.zIndex = "999";

    const btn = document.createElement("button");
    btn.className = "dt-skip-btn";
    const btnLabel = document.createElement("strong");
    btnLabel.textContent = skipWindow.moment.label;
    btn.append("⏩ ", btnLabel, " kısmını atla");
    btn.addEventListener("click", () => {
      video.currentTime = skipWindow.endSeconds;
      if (overlayHost) overlayHost.hidden = true;
    });

    overlayHost.append(btn);
    playerContainer.append(overlayHost);
    const syncSkipVisibility = () => {
      if (overlayHost) overlayHost.hidden = !isSkippableMomentActive(skipWindow, video.currentTime);
    };
    skipTarget = video;
    skipTimeHandler = syncSkipVisibility;
    video.addEventListener("timeupdate", syncSkipVisibility);
    video.addEventListener("seeking", syncSkipVisibility);
    video.addEventListener("loadedmetadata", syncSkipVisibility);
    syncSkipVisibility();
  }

  // 2. Tam Ekran / Tiyatro Modu Mini HUD — tıklanınca detay kartı açılır
  hudMetadata = metadata;
  hudExpanded = false;
  hudDetail = null;
  hudHost = document.createElement("div");
  hudHost.id = "demirtube-player-hud";
  hudHost.className = "dt-player-hud dt-hud-hidden";
  const pill = document.createElement("div");
  pill.className = "dt-hud-pill";
  const pillTitle = document.createElement("span");
  pillTitle.textContent = "DemirTube AI";
  pillTitle.className = "dt-hud-brand";
  const pillInfo = document.createElement("small");
  pillInfo.textContent = `${metadata.contentType.toUpperCase()} • ${Math.round(metadata.durationSeconds / 60)} dk`;
  pill.append(pillTitle, pillInfo);
  pill.title = "Detay için tıkla";
  pill.setAttribute("role", "button");
  pill.tabIndex = 0;
  pill.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleHudDetail();
  });
  hudHost.append(pill);

  playerContainer.append(hudHost);

  const handleMouseMove = () => {
    if (!hudHost) return;
    const isFullscreenOrTheater = Boolean(
      document.fullscreenElement ||
      document.querySelector("ytd-watch-flexy[theater]")
    );
    if (!isFullscreenOrTheater) {
      if (!hudExpanded) hudHost.classList.add("dt-hud-hidden");
      return;
    }

    hudHost.classList.remove("dt-hud-hidden");
    clearTimeout(mouseHideTimer);
    if (!hudExpanded) {
      mouseHideTimer = window.setTimeout(() => {
        if (!hudExpanded) hudHost?.classList.add("dt-hud-hidden");
      }, 3_000);
    }
  };

  mouseMoveTarget = playerContainer;
  mouseMoveHandler = handleMouseMove;
  playerContainer.addEventListener("mousemove", handleMouseMove);

  // 3. Video bitince "Değdi mi?" tek dokunuş geri bildirimi
  const onEnded = () => showWorthPrompt(playerContainer, metadata);
  video.addEventListener("ended", onEnded);
  endedTarget = video;
  endedHandler = onEnded;

  injectOverlayStyles();
}

export function unmountPlayerOverlay() {
  if (skipTarget && skipTimeHandler) {
    skipTarget.removeEventListener("timeupdate", skipTimeHandler);
    skipTarget.removeEventListener("seeking", skipTimeHandler);
    skipTarget.removeEventListener("loadedmetadata", skipTimeHandler);
  }
  skipTarget = null;
  skipTimeHandler = null;
  if (mouseMoveTarget && mouseMoveHandler) {
    mouseMoveTarget.removeEventListener("mousemove", mouseMoveHandler);
  }
  mouseMoveTarget = null;
  mouseMoveHandler = null;
  if (endedTarget && endedHandler) {
    endedTarget.removeEventListener("ended", endedHandler);
  }
  endedTarget = null;
  endedHandler = null;
  worthPromptHost?.remove();
  worthPromptHost = null;
  clearTimeout(worthPromptTimer);
  overlayHost?.remove();
  hudHost?.remove();
  overlayHost = null;
  hudHost = null;
  hudExpanded = false;
  hudDetail = null;
  hudMetadata = null;
  clearTimeout(mouseHideTimer);
}

/** Video bitiminde tek dokunuşla 👍/👎 geri bildirimi toplayan küçük kart. */
function showWorthPrompt(playerContainer: HTMLElement, metadata: VideoMetadata) {
  if (worthPromptShownFor === metadata.videoId) return;
  worthPromptShownFor = metadata.videoId;
  worthPromptHost?.remove();
  clearTimeout(worthPromptTimer);

  const host = document.createElement("div");
  host.className = "dt-worth-prompt";
  const question = document.createElement("strong");
  question.textContent = "Bu video değdi mi?";
  const actions = document.createElement("div");
  const like = document.createElement("button");
  like.type = "button";
  like.textContent = "👍 Değdi";
  const dislike = document.createElement("button");
  dislike.type = "button";
  dislike.textContent = "👎 Değmedi";
  actions.append(like, dislike);
  host.append(question, actions);

  const answer = (liked: boolean) => {
    void sendMessage({
      type: "SAVE_FEEDBACK",
      feedback: { videoId: metadata.videoId, liked, updatedAt: new Date().toISOString() }
    }).catch(() => undefined);
    host.classList.add("answered");
    question.textContent = liked ? "Öğrendim, benzerlerini öne çıkaracağım ✓" : "Anlaşıldı, böylelerini azaltacağım ✓";
    actions.remove();
    worthPromptTimer = window.setTimeout(() => { host.remove(); if (worthPromptHost === host) worthPromptHost = null; }, 2_200);
  };
  like.addEventListener("click", () => answer(true));
  dislike.addEventListener("click", () => answer(false));

  worthPromptHost = host;
  playerContainer.append(host);
  worthPromptTimer = window.setTimeout(() => { host.remove(); if (worthPromptHost === host) worthPromptHost = null; }, 12_000);
}

/** HUD pill'ine tıklayınca açılan detay kartı: karar, skor, bütçe ve listeye ekleme. */
async function toggleHudDetail() {
  if (!hudHost || !hudMetadata) return;
  hudExpanded = !hudExpanded;
  if (!hudExpanded) {
    hudDetail?.remove();
    hudDetail = null;
    return;
  }
  clearTimeout(mouseHideTimer);
  hudDetail = document.createElement("div");
  hudDetail.className = "dt-hud-detail";
  hudDetail.textContent = "Analiz yükleniyor…";
  hudHost.append(hudDetail);
  try {
    const [decision, today] = await Promise.all([
      sendMessage<VideoDecision | null>({ type: "GET_VIDEO_DECISION", metadata: hudMetadata }),
      sendMessage<{ seconds: number; budgetMinutes: number } | null>({ type: "GET_TODAY_WATCH" })
    ]);
    if (!hudDetail || !hudExpanded) return;
    renderHudDetail(hudDetail, hudMetadata, decision, today);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) { unmountPlayerOverlay(); return; }
    if (hudDetail) hudDetail.textContent = "Analiz şu an alınamadı.";
  }
}

function renderHudDetail(
  container: HTMLElement,
  metadata: VideoMetadata,
  decision: VideoDecision | null,
  today: { seconds: number; budgetMinutes: number } | null
) {
  container.textContent = "";
  const recommendationLabel = decision?.decisionLabel ?? "Analiz yok";
  const rows: Array<[string, string]> = decision
    ? [
      ["Karar", recommendationLabel],
      ["Uyum skoru", decision.score === undefined ? "Yeterli veri yok" : `${decision.score}/100`],
      ["Tahmini tamamlama", decision.preference.estimatedCompletion !== undefined ? `%${decision.preference.estimatedCompletion}` : "Veri birikiyor"],
      ["Kanal geçmişi", decision.channelTrust.score === undefined
        ? `${decision.channelTrust.sampleCount} örnek · ölçülmedi`
        : `${decision.channelTrust.label} (%${decision.channelTrust.score})`]
    ]
    : [];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "dt-hud-row";
    const rowLabel = document.createElement("span");
    rowLabel.textContent = label;
    const rowValue = document.createElement("strong");
    rowValue.textContent = value;
    row.append(rowLabel, rowValue);
    container.append(row);
  }

  if (today && today.budgetMinutes > 0) {
    const usedMinutes = Math.floor(today.seconds / 60);
    const percent = Math.min(100, Math.round((usedMinutes / today.budgetMinutes) * 100));
    const budgetWrap = document.createElement("div");
    budgetWrap.className = "dt-hud-budget";
    const budgetText = document.createElement("small");
    budgetText.textContent = `Bugün ${usedMinutes}/${today.budgetMinutes} dk`;
    const bar = document.createElement("div");
    bar.className = "dt-hud-budget-bar";
    const fill = document.createElement("i");
    fill.style.width = `${percent}%`;
    if (percent >= 100) fill.classList.add("over");
    bar.append(fill);
    budgetWrap.append(budgetText, bar);
    container.append(budgetWrap);
  }

  const actions = document.createElement("div");
  actions.className = "dt-hud-actions";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Listeme ekle";
  saveButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void sendMessage({
      type: "WATCHLIST_TOGGLE",
      item: {
        videoId: metadata.videoId,
        title: metadata.title,
        channelName: metadata.channelName,
        durationSeconds: metadata.durationSeconds,
        url: metadata.url,
        topics: metadata.topics ?? [],
        addedAt: new Date().toISOString()
      }
    }).then(() => { saveButton.textContent = "✓ Listede"; }).catch(() => undefined);
  });
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ghost";
  closeButton.textContent = "Kapat";
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleHudDetail();
  });
  actions.append(saveButton, closeButton);
  container.append(actions);
}

function injectOverlayStyles() {
  if (document.querySelector("#demirtube-overlay-styles")) return;
  const style = document.createElement("style");
  style.id = "demirtube-overlay-styles";
  style.textContent = `
    .dt-player-skip[hidden] { display: none !important; }
    .dt-skip-btn {
      padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(139,92,246,.5);
      background: rgba(13, 23, 33, 0.9); backdrop-filter: blur(12px);
      color: #ffffff; font: 600 12px Inter, sans-serif; cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); transition: all 0.2s;
    }
    .dt-skip-btn:hover { background: linear-gradient(120deg,#8b5cf6,#00c9d4); color:#090d16; transform: translateY(-2px); }

    .dt-player-hud {
      position: absolute; top: 20px; right: 20px; z-index: 9999;
      transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s;
    }
    .dt-player-hud.dt-hud-hidden { opacity: 0; pointer-events: none; transform: translateY(-8px); }

    .dt-player-hud { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .dt-hud-pill {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; border-radius: 99px; cursor: pointer;
      background: rgba(13, 23, 33, 0.82); backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1); color: #f8fafc; font: 600 11px Inter, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      transition: border-color 0.2s ease, transform 0.2s ease;
    }
    .dt-hud-pill:hover { border-color: rgba(56, 189, 248, 0.5); transform: translateY(-1px); }
    .dt-hud-pill small { color: #aebbd0; font-size: 10px; }
    .dt-hud-brand { display:flex; align-items:center; gap:6px; }
    .dt-hud-brand::before { content:""; width:18px; height:18px; border-radius:5px; background:url("${BRAND_MARK_DATA_URI}") center/contain no-repeat; }

    .dt-hud-detail {
      width: 240px; padding: 12px 14px; border-radius: 14px;
      background: rgba(11, 19, 27, 0.96); backdrop-filter: blur(18px);
      border: 1px solid rgba(255, 255, 255, 0.14); color: #e2e8f0;
      font: 500 12px/1.5 Inter, sans-serif;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
      animation: dt-fadein 0.2s ease;
    }
    @keyframes dt-fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .dt-hud-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
    .dt-hud-row span { color: #aebbd0; font-size: 11.5px; }
    .dt-hud-row strong { color: #f8fafc; font-size: 12.5px; font-weight: 700; text-align: right; }
    .dt-hud-budget { margin-top: 8px; }
    .dt-hud-budget small { color: #aebbd0; font-size: 11px; display: block; margin-bottom: 4px; }
    .dt-hud-budget-bar { height: 6px; border-radius: 99px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
    .dt-hud-budget-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #38bdf8, #34d399); }
    .dt-hud-budget-bar i.over { background: linear-gradient(90deg, #fb923c, #ef4444); }
    .dt-hud-actions { display: flex; gap: 6px; margin-top: 10px; }
    .dt-hud-actions button {
      flex: 1; padding: 7px 8px; border: 1px solid rgba(255, 81, 72, 0.45); border-radius: 9px;
      background: rgba(255, 81, 72, 0.14); color: #ffd7d4; font: 700 11.5px Inter, sans-serif; cursor: pointer;
    }
    .dt-hud-actions button:hover { background: rgba(255, 81, 72, 0.28); }
    .dt-hud-actions button.ghost { border-color: rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.05); color: #cbd5e1; }

    .dt-worth-prompt {
      position: absolute; bottom: 76px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 14px; z-index: 9999;
      padding: 10px 16px; border-radius: 14px;
      background: rgba(11, 19, 27, 0.95); backdrop-filter: blur(18px);
      border: 1px solid rgba(255, 255, 255, 0.16); color: #f8fafc;
      font: 600 13px Inter, sans-serif; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
      animation: dt-fadein 0.25s ease;
    }
    .dt-worth-prompt div { display: flex; gap: 8px; }
    .dt-worth-prompt button {
      padding: 7px 13px; border-radius: 10px; cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0; font: 700 12.5px Inter, sans-serif; transition: all 0.15s ease;
    }
    .dt-worth-prompt button:hover { border-color: rgba(52, 211, 153, 0.5); background: rgba(52, 211, 153, 0.14); transform: translateY(-1px); }
    .dt-worth-prompt.answered { border-color: rgba(52, 211, 153, 0.45); }
  `;
  document.documentElement.append(style);
}
