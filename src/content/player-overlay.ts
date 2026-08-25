import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import type { TranscriptMoment, VideoDecision, VideoMetadata } from "../shared/types";
import { BRAND_MARK_DATA_URI } from "../shared/brand-assets";

/** HUD'ın imleç durduktan sonra soluklaşma süresi. 3 sn, düğmeye uzanmaya yetmiyordu. */
const HUD_HIDE_DELAY_MS = 6_000;

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
  // Metadata aynı video için tazelendiğinde (oEmbed/JSON-LD onarımı, canlı yayın
  // geçişi) katman yeniden kurulursa kullanıcının o an açtığı analiz kartı
  // elinden alınıyordu. Aynı videoda katman sökülmez, yalnızca künye güncellenir.
  // Altyazı geç geldiğinde atlama düğmesi ilk kez gerekebilir; o durumda katman
  // yine de kurulur, aksi halde düğme hiç görünmezdi.
  const nextSkipWindow = skippableMomentWindow(
    metadata.transcriptAnalysis?.keyMoments ?? [],
    metadata.durationSeconds
  );
  const skipUnchanged = !nextSkipWindow || Boolean(overlayHost);

  if (skipUnchanged && hudHost && hudMetadata?.videoId === metadata.videoId && document.contains(hudHost)) {
    hudMetadata = metadata;
    const type = hudHost.querySelector<HTMLElement>(".dt-hud-type");
    const time = hudHost.querySelector<HTMLElement>(".dt-hud-time");
    if (type) type.textContent = metadata.contentType.toUpperCase();
    if (time) time.textContent = `${Math.round(metadata.durationSeconds / 60)} dk`;
    return;
  }

  unmountPlayerOverlay();

  const video = document.querySelector<HTMLVideoElement>("video.html5-main-video");
  const playerContainer = document.querySelector<HTMLElement>("#movie_player, .html5-video-player");
  if (!video || !playerContainer) return;

  // 1. Sponsor / Intro Atlama Butonu Overlay
  const skipWindow = nextSkipWindow;

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
  pillTitle.textContent = "DemirTube";
  pillTitle.className = "dt-hud-brand";
  // "STANDARD • 15 dk" iki farklı türde bilgiyi tek metne sıkıştırıyordu; süre
  // artık kendi hücresinde ve hizalı rakamlarla, tür ise küçük etiket olarak.
  const pillType = document.createElement("small");
  pillType.className = "dt-hud-type";
  pillType.textContent = metadata.contentType.toUpperCase();
  const pillTime = document.createElement("small");
  pillTime.className = "dt-hud-time";
  pillTime.textContent = `${Math.round(metadata.durationSeconds / 60)} dk`;
  pill.append(pillTitle, pillType, pillTime);
  pill.title = "Detay için tıkla";
  pill.setAttribute("role", "button");
  pill.tabIndex = 0;
  pill.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleHudDetail();
  });
  // role="button" + tabIndex vardı ama klavyeyle açılmıyordu.
  pill.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
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
      }, HUD_HIDE_DELAY_MS);
    }
  };

  // İmleç HUD'ın üstüne gelince gizleme sayacı durur; aksi halde kullanıcı
  // düğmeye uzanırken kart kaybolup tıklama videoya gidiyordu.
  hudHost.addEventListener("mouseenter", () => clearTimeout(mouseHideTimer));
  hudHost.addEventListener("mouseleave", () => {
    if (hudExpanded) return;
    clearTimeout(mouseHideTimer);
    mouseHideTimer = window.setTimeout(() => {
      if (!hudExpanded) hudHost?.classList.add("dt-hud-hidden");
    }, HUD_HIDE_DELAY_MS);
  });

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
    if (!hudDetail) return;
    // Ölü bir "alınamadı" metni yerine tekrar denenebilir bir durum.
    hudDetail.textContent = "";
    const message = document.createElement("p");
    message.className = "dt-hud-error";
    message.textContent = "Analiz şu an alınamadı.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Tekrar dene";
    retry.addEventListener("click", (event) => {
      event.stopPropagation();
      hudExpanded = false;
      hudDetail?.remove();
      hudDetail = null;
      void toggleHudDetail();
    });
    hudDetail.append(message, retry);
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
      padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(192,82,47,.5);
      background: rgba(24,23,22, 0.9); backdrop-filter: blur(12px);
      color: #ffffff; font: 600 13px Inter, sans-serif; cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); transition: all 0.2s;
    }
    .dt-skip-btn:hover { background: #C0522F; color:#0c0c0c; transform: translateY(-2px); }

    /* Oynatıcı HUD'ı: video büyütülünce sağ üstte duran ölçüm etiketi.
       Bulanık cam hap ve parıltı yerine düz, köşeli, dar bir şerit; oynatıcının
       kendi arayüzüyle yarışmaz, sol kenarındaki oksit çizgiyle kendini belli eder. */
    /* Konak kutusu tıklamayı yutmaz, çocukları yutar: aksi halde HUD'ın boş
       alanı videonun oynat/duraklat tıklamalarını çalıyordu. Gizliyken çocuklar
       da geçirgen olur ki tıklama videoya gitsin. */
    .dt-player-hud {
      position: absolute; top: 16px; right: 16px; z-index: 2147483000;
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      pointer-events: none;
      transition: opacity .3s cubic-bezier(.22,.61,.36,1), transform .3s cubic-bezier(.22,.61,.36,1);
    }
    .dt-player-hud > * { pointer-events: auto; }
    .dt-player-hud.dt-hud-hidden { opacity: 0; transform: translateY(-6px); }
    .dt-player-hud.dt-hud-hidden > * { pointer-events: none; }

    .dt-hud-pill {
      display: flex; align-items: center; gap: 9px;
      padding: 6px 12px 6px 9px; border-radius: 4px; cursor: pointer;
      background: rgba(12,12,12, .9); backdrop-filter: blur(6px);
      border: 1px solid rgba(231, 230, 227, .16);
      border-left: 3px solid #D9542B;
      color: #E7E6E3; font: 600 13px/1.3 Inter, sans-serif;
      box-shadow: none;
      transition: border-color .16s ease, background .16s ease;
    }
    .dt-hud-pill:hover { background: rgba(22,22,21, .95); border-color: rgba(217, 84, 43, .5); border-left-color: #D9542B; }
    .dt-hud-brand { display: flex; align-items: center; gap: 7px; letter-spacing: -.01em; }
    .dt-hud-brand::before { content:""; width:16px; height:16px; border-radius:4px; background:url("${BRAND_MARK_DATA_URI}") center/contain no-repeat; }
    .dt-hud-type {
      padding: 2px 6px; border-radius: 3px; background: rgba(231, 230, 227, .08);
      color: rgba(231, 230, 227, .62);
      font: 500 10px/1.4 "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .1em;
    }
    .dt-hud-time {
      color: rgba(231, 230, 227, .62);
      font: 500 12px/1.3 "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums;
    }

    .dt-hud-detail {
      width: 252px; padding: 13px 15px; border-radius: 6px;
      background: rgba(12,12,12, .96); backdrop-filter: blur(10px);
      border: 1px solid rgba(231, 230, 227, .16); color: #E7E6E3;
      font: 500 13px/1.5 Inter, sans-serif;
      box-shadow: none;
      animation: dt-fadein .2s cubic-bezier(.22,.61,.36,1);
    }
    @keyframes dt-fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .dt-hud-row { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid rgba(231, 230, 227, .08); }
    .dt-hud-row:last-of-type { border-bottom: 0; }
    .dt-hud-row span { color: rgba(231, 230, 227, .55); font: 500 11px/1.4 "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
    .dt-hud-row strong { color: #E7E6E3; font-size: 13px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
    .dt-hud-budget { margin-top: 10px; }
    .dt-hud-budget small { color: rgba(231, 230, 227, .55); font-size: 12px; display: block; margin-bottom: 5px; }
    .dt-hud-budget-bar { height: 3px; border-radius: 2px; background: rgba(231, 230, 227, .12); overflow: hidden; }
    .dt-hud-budget-bar i { display: block; height: 100%; border-radius: 2px; background: #D9542B; }
    .dt-hud-budget-bar i.over { background: #FF5233; }
    .dt-hud-actions { display: flex; gap: 6px; margin-top: 11px; }
    .dt-hud-actions button {
      flex: 1; padding: 7px 8px; border: 1px solid rgba(217, 84, 43, .45); border-radius: 4px;
      background: rgba(217, 84, 43, .14); color: #E7E6E3; font: 600 12px Inter, sans-serif; cursor: pointer;
      transition: background .16s ease;
    }
    .dt-hud-actions button:hover { background: rgba(217, 84, 43, .26); }
    .dt-hud-error { margin: 0 0 9px; color: rgba(231, 230, 227, .75); }
    .dt-hud-detail > button { width: 100%; padding: 7px 8px; border: 1px solid rgba(217, 84, 43, .45); border-radius: 4px;
      background: rgba(217, 84, 43, .14); color: #E7E6E3; font: 600 12px Inter, sans-serif; cursor: pointer; }
    .dt-hud-actions button.ghost { border-color: rgba(231, 230, 227, .16); background: rgba(231, 230, 227, .05); color: rgba(231, 230, 227, .75); }

    .dt-worth-prompt {
      position: absolute; bottom: 76px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 14px; z-index: 9999;
      padding: 10px 16px; border-radius: 14px;
      background: rgba(20,19,18, 0.95); backdrop-filter: blur(18px);
      border: 1px solid rgba(255, 255, 255, 0.16); color: #E7E6E3;
      font: 600 14px Inter, sans-serif; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
      animation: dt-fadein 0.25s ease;
    }
    .dt-worth-prompt div { display: flex; gap: 8px; }
    .dt-worth-prompt button {
      padding: 7px 13px; border-radius: 10px; cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.06);
      color: #E7E6E3; font: 700 12.5px Inter, sans-serif; transition: all 0.15s ease;
    }
    .dt-worth-prompt button:hover { border-color: rgba(52, 211, 153, 0.5); background: rgba(52, 211, 153, 0.14); transform: translateY(-1px); }
    .dt-worth-prompt.answered { border-color: rgba(52, 211, 153, 0.45); }
  `;
  document.documentElement.append(style);
}
