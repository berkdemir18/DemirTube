import { isExtensionContextInvalidated, onStorageChanged, sendMessage } from "../shared/messages";
import type { FeedRuntimeStatus, Settings, VideoDecision, VideoMetadata } from "../shared/types";
import { classifyTopics } from "../analytics/topic-classifier";
import { classifyContentType } from "../analytics/content-type";
import { normalizeChannelName, UNKNOWN_CHANNEL } from "../shared/utils";

interface Candidate {
  card: HTMLElement;
  mount: HTMLElement;
  metadata: VideoMetadata;
}

let openDetail: HTMLElement | undefined;
let feedInstanceSequence = 0;
/** Normal yeniden tarama gecikmesi ve hata sonrası geri çekilmenin tabanı. */
const RETRY_BASE_MS = 250;
/** Geri çekilmenin üst sınırı; arka uç kalıcı arızalıyken boşa tarama yapmayalım. */
const MAX_RETRY_MS = 30_000;
/** Bu kadar art arda hatadan sonra iskelet basmayı bırakırız (kart zıplamasın). */
const FAILURES_BEFORE_QUIET = 3;

const CARD_SELECTOR = "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer";

function closeOpenDetail() {
  if (!openDetail) return;
  openDetail.hidden = true;
  openDetail.parentElement?.classList.remove("detail-open");
  openDetail.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model")?.classList.remove("demirtube-card-elevated");
  openDetail = undefined;
}

// ── DOM Arama ve Filtreleme ──────────────────────────────────────────────────

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findCardAnchor(card: HTMLElement): HTMLElement | null {
  return (
    card.querySelector<HTMLElement>(".ytLockupMetadataViewModelTextContainer") ||
    card.querySelector<HTMLElement>(".yt-lockup-metadata-view-model__metadata") ||
    card.querySelector<HTMLElement>(".ytContentMetadataViewModelMetadata") ||
    card.querySelector<HTMLElement>("#meta") ||
    card.querySelector<HTMLElement>("#details") ||
    card.querySelector<HTMLElement>(".details") ||
    card.querySelector<HTMLElement>("#metadata-line")
  );
}

/**
 * Kanal adı önce kanal bağlantısından okunur. Metadata satırına düşülürse satır
 * "Kanal Adı • 12 B görüntüleme • 3 gün önce" biçiminde gelebildiği için yalnızca
 * ilk parça alınır: izleme sayfasındaki adla birebir aynı metin üretilmezse
 * kanal geçmişi eşleşmiyor ve puan iki tarafta ayrışıyordu.
 */
function readCardChannelName(card: HTMLElement): string {
  const links = card.querySelectorAll<HTMLAnchorElement>(
    '#channel-name a, .ytd-channel-name a, a[href*="/@"], a[href*="/channel/"]'
  );
  for (const link of links) {
    const name = normalizeChannelName(link.textContent ?? "");
    if (name) return name;
  }
  const row = card.querySelector<HTMLElement>(
    ".ytContentMetadataViewModelMetadataRow, .yt-content-metadata-view-model__metadata-row, #channel-name, #byline, .ytd-channel-name"
  );
  return normalizeChannelName(row?.textContent ?? "") || UNKNOWN_CHANNEL;
}

function extractMetadataFromCard(card: HTMLElement): VideoMetadata | null {
  const link = card.querySelector<HTMLAnchorElement>(
    'a#video-title-link, a#video-title, a.ytLockupMetadataViewModelTitle, a.yt-lockup-metadata-view-model__title, a.yt-simple-endpoint[href*="/watch?v="], a[href*="/watch?v="], a[href^="/shorts/"]'
  );
  if (!link) return null;

  const url = new URL(link.href, location.origin);
  const videoId = url.searchParams.get("v") ?? (url.pathname.startsWith("/shorts/") ? url.pathname.split("/").filter(Boolean)[1] : "");
  if (!videoId) return null;

  const title = (
    link.textContent ||
    link.getAttribute("title") ||
    card.querySelector("#video-title")?.textContent ||
    ""
  ).trim();

  const channelName = readCardChannelName(card);

  const statusBadges = [...card.querySelectorAll<HTMLElement>(
    "ytd-thumbnail-overlay-time-status-renderer, ytd-badge-supported-renderer, .badge-shape-wiz__text, .ytBadgeShapeText"
  )];
  const timeText = statusBadges[0]?.textContent?.trim() || "";
  const isLive = statusBadges.some((badge) => {
    const label = (badge.getAttribute("aria-label") || badge.textContent || "").trim();
    return /^(canlı|canlı yayın|live|live now)$/i.test(label);
  });
  const parts = timeText.split(":").map(Number);
  const durationSeconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : 0;

  const thumbImg = card.querySelector<HTMLImageElement>("ytd-thumbnail img, img");
  const thumbnailUrl = thumbImg?.src || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title,
    channelName,
    durationSeconds,
    url: url.pathname.startsWith("/shorts/") ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl,
    contentType: classifyContentType({ path: url.pathname, durationSeconds, title, channelName, isLive }),
    // Boş bırakılırsa konu sinyali feed skorlarında tamamen devre dışı kalıyor.
    topics: classifyTopics(title, channelName),
  };
}

/**
 * YouTube kartları aynı DOM elemanını farklı bir video için geri dönüştürebilir
 * veya yalnızca DemirTube rozetinin iç düğümlerini silebilir. DOM işareti ile
 * gerçekten bağlı rozet uyuşmuyorsa kartı yeniden analize hazırlar.
 */
export function repairFeedCardState(card: HTMLElement, currentVideoId: string) {
  const wrappers = [...card.querySelectorAll<HTMLElement>(".demirtube-feed-analysis")];
  const validWrapper = wrappers.find((wrapper) =>
    wrapper.querySelector<HTMLElement>(".demirtube-feed-badge[data-video-id]")?.dataset.videoId === currentVideoId
  );

  if (validWrapper) {
    wrappers.forEach((wrapper) => {
      if (wrapper === validWrapper) return;
      const instanceId = wrapper.dataset.instanceId;
      wrapper.remove();
      if (instanceId) document.querySelectorAll<HTMLElement>(".dt-feed-mini-summary[data-owner]").forEach((summary) => {
        if (summary.dataset.owner === instanceId) summary.remove();
      });
    });
    card.dataset.demirtubeAnalyzed = "true";
    delete card.dataset.demirtubePending;
    return false;
  }

  const validPending = card.dataset.demirtubePending
    && wrappers.some((wrapper) =>
      wrapper.dataset.videoId === currentVideoId
      && Boolean(wrapper.querySelector(".demirtube-feed-skeleton"))
    );
  if (validPending) return false;

  wrappers.forEach((wrapper) => {
    const instanceId = wrapper.dataset.instanceId;
    wrapper.remove();
    if (instanceId) document.querySelectorAll<HTMLElement>(".dt-feed-mini-summary[data-owner]").forEach((summary) => {
      if (summary.dataset.owner === instanceId) summary.remove();
    });
  });
  delete card.dataset.demirtubeAnalyzed;
  delete card.dataset.demirtubePending;
  return true;
}

export function feedResultTargetIsCurrent(card: HTMLElement, wrapper: HTMLElement, expectedVideoId: string) {
  if (!card.isConnected || !wrapper.isConnected) return false;
  return extractMetadataFromCard(card)?.videoId === expectedVideoId;
}

function candidates(): Candidate[] {
  const cards = [...document.querySelectorAll<HTMLElement>(CARD_SELECTOR)].filter((card) => !card.parentElement?.closest(CARD_SELECTOR));
  const list: Candidate[] = [];

  cards.forEach((card) => {
    if (!isVisible(card)) return;
    const mount = findCardAnchor(card);
    if (!mount) return;
    const metadata = extractMetadataFromCard(card);
    if (!metadata || !metadata.title) return;
    if (!repairFeedCardState(card, metadata.videoId)) return;
    card.dataset.demirtubePending = "true";
    list.push({ card, mount, metadata });
  });

  return list;
}

function sortByVisibility(items: Candidate[]): Candidate[] {
  const vh = window.innerHeight;
  return items.toSorted((a, b) => {
    const ra = a.card.getBoundingClientRect();
    const rb = b.card.getBoundingClientRect();
    const visA = ra.top >= 0 && ra.bottom <= vh ? 2 : ra.bottom > 0 && ra.top < vh ? 1 : 0;
    const visB = rb.top >= 0 && rb.bottom <= vh ? 2 : rb.bottom > 0 && rb.top < vh ? 1 : 0;
    if (visA !== visB) return visB - visA;
    return Math.abs(ra.top) - Math.abs(rb.top);
  });
}

// ── Stil Enjeksiyonu ─────────────────────────────────────────────────────────

function injectStyles() {
  if (document.querySelector("#demirtube-feed-styles")) return;
  const style = document.createElement("style");
  style.id = "demirtube-feed-styles";
  style.textContent = `
    .demirtube-feed-analysis {
      margin-top: 2px;
      margin-bottom: 2px;
      display: flex !important;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      position: relative;
      z-index: 10;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .demirtube-feed-analysis.detail-open { z-index: 99990; }
    .demirtube-card-elevated { position: relative !important; z-index: 99980 !important; }
    .demirtube-feed-analysis * { box-sizing: border-box; }
    .demirtube-feed-skeleton {
      display: inline-block;
      width: 120px;
      height: 24px;
      border-radius: 99px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 25%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.05) 75%);
      background-size: 200% 100%;
      animation: dt-skeleton-anim 1.5s infinite;
    }
    @keyframes dt-skeleton-anim {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Keşfet rozeti: YouTube kartının altında duran bir ölçüm etiketi.
       Yuvarlak hap, parıltı ve gradyan yerine düz, köşeli, okunur bir şerit;
       durum rengi noktada değil sol kenar çubuğunda taşınır. */
    .demirtube-feed-badge {
      display: inline-flex !important;
      align-items: center;
      gap: 8px;
      padding: 4px 10px 4px 8px;
      border-radius: 4px;
      background: rgba(12,12,12, .92) !important;
      border: 1px solid rgba(231, 230, 227, .16);
      border-left: 3px solid #FFB02E;
      color: #E7E6E3 !important;
      font: 600 13px/1.25 Inter, Roboto, sans-serif !important;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: none;
      transition: border-color .16s ease, background .16s ease;
      flex-shrink: 0;
    }
    .demirtube-feed-badge:hover {
      background: rgba(22,22,21, .96) !important;
      border-color: rgba(217, 84, 43, .55);
    }
    .demirtube-feed-badge.strong  { border-left-color: #5FD35A; color: #E7E6E3 !important; }
    .demirtube-feed-badge.warning { border-left-color: #FF5233; color: #E7E6E3 !important; }

    /* Nokta yerine ince bir işaret: kenar çubuğu zaten durumu söylüyor. */
    .demirtube-feed-dot {
      width: 4px; height: 14px; border-radius: 1px; background: #FFB02E;
      flex: 0 0 auto; box-shadow: none;
    }
    .demirtube-feed-badge.strong  .demirtube-feed-dot { background: #5FD35A; }
    .demirtube-feed-badge.warning .demirtube-feed-dot { background: #FF5233; }

    .demirtube-feed-score {
      padding: 2px 8px;
      border-radius: 8px;
      background: rgba(231, 230, 227, .08);
      font: 900 13px/1 'Outfit', Inter, monospace !important;
      font-size:13px !important;
      color: #ffffff !important;
      letter-spacing: -0.02em;
    }
    .demirtube-feed-badge.strong  .demirtube-feed-score {
      background: linear-gradient(135deg, rgba(95,211,90,0.35), rgba(16, 185, 129, 0.25));
      color: #5FD35A !important;
      border: 1px solid rgba(95,211,90,0.4);
    }
    .demirtube-feed-badge.warning .demirtube-feed-score {
      background: linear-gradient(135deg, rgba(255,82,51,0.35), rgba(220, 38, 38, 0.25));
      color: #f87171 !important;
      border: 1px solid rgba(255,82,51,0.4);
    }

    /* Segmentli puan halkası + karar etiketi */
    .demirtube-feed-badge {
      appearance: none;
      min-height: 40px;
      gap: 7px;
      padding: 3px 9px 3px 4px;
      border-radius: 11px;
      text-align: left;
      box-shadow: none;
    }
    /* Puan halkası değil, ölçüm bloğu: konik gradyanlı donut her yapay zekâ
       ürününde var. Puan kendi karesinde durur, altındaki ince çizgi puanın
       0–100 ölçeğindeki yerini gösterir. */
    .demirtube-feed-ring {
      --dt-feed-score: 0;
      width: 34px; height: 34px; flex: 0 0 auto; position: relative;
      display: grid; place-items: center;
      border: 1px solid rgba(255,176,46,.45); border-radius: 4px;
      background: rgba(255,176,46,.07);
    }
    .demirtube-feed-ring::after {
      content: ""; position: absolute; left: 3px; right: 3px; bottom: 3px; height: 2px;
      border-radius: 1px; background: rgba(231,230,227,.14);
    }
    .demirtube-feed-ring::before {
      content: ""; position: absolute; left: 3px; bottom: 3px; height: 2px; z-index: 1;
      width: calc((100% - 6px) * var(--dt-feed-score) / 100);
      border-radius: 1px; background: #FFB02E;
    }
    .demirtube-feed-ring strong {
      position: relative; z-index: 1; margin-bottom: 3px;
      color: #E7E6E3 !important;
      font: 600 14px/1 Inter, Roboto, sans-serif !important;
      font-variant-numeric: tabular-nums;
    }
    .demirtube-feed-badge.strong .demirtube-feed-ring { border-color: rgba(95,211,90,.5); }
    .demirtube-feed-badge.strong .demirtube-feed-ring::before { background: #5FD35A; }
    .demirtube-feed-badge.warning .demirtube-feed-ring { border-color: rgba(255,82,51,.5); }
    .demirtube-feed-badge.warning .demirtube-feed-ring::before { background: #FF5233; }
    .demirtube-feed-badge:not([data-scored="true"]) .demirtube-feed-ring::before { width: 0; }
    .demirtube-feed-badge-copy { display:grid; gap:2px; min-width:0; }
    .demirtube-feed-badge-copy>strong { color:#FFB02E !important; font-size:12px !important; line-height:1.1 !important; }
    .demirtube-feed-badge.strong .demirtube-feed-badge-copy>strong { color:#8FE08A !important; }
    .demirtube-feed-badge.warning .demirtube-feed-badge-copy>strong { color:#FF8566 !important; }
    .demirtube-feed-badge-copy>small { color:rgba(231,230,227,.55) !important; font:500 11px/1.2 "IBM Plex Mono",ui-monospace,monospace !important; letter-spacing:.04em; }
    .demirtube-feed-badge:focus-visible { outline:2px solid #D9963C; outline-offset:2px; }
    .dt-feed-mini-summary {
      position:fixed; top:0; left:0; z-index:2147483646;
      width:min(286px,calc(100vw - 24px)); display:grid; gap:0;
      box-sizing:border-box;
      padding:13px; border:1px solid rgba(150,145,140,.38); border-radius:13px;
      background:#141413 !important; color:#f5f5f4 !important; box-shadow:0 18px 38px rgba(0,0,0,.58);
      opacity:0; visibility:hidden; transform:translateY(-4px); pointer-events:none;
      transition:opacity .14s ease,transform .14s ease,visibility .14s;
      font:13px/1.35 Inter,Roboto,sans-serif !important;
    }
    .dt-feed-mini-summary.mini-open {
      opacity:1 !important; visibility:visible !important; transform:translateY(0) !important;
    }
    .dt-feed-mini-summary>strong { margin-bottom:7px; color:#f5b84c !important; font-size:14px; }
    .dt-feed-mini-summary>span { display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-top:1px solid rgba(169,166,163,.12); }
    .dt-feed-mini-summary small { color:#a6a3a0 !important; font-size:11px !important; }
    .dt-feed-mini-summary b { color:#fff !important; font-size:11px !important; text-align:right; }

    /* Feature #7: True Title Clickbait Badge */
    .dt-true-title-badge {
      display: inline-flex; align-items: center; margin-top: 4px;
      font: 700 13px Inter, sans-serif !important; font-size:13px !important;
      color: #ff8c84; background: rgba(255, 81, 72, 0.16);
      border: 1px solid rgba(255, 81, 72, 0.4);
      padding: 4px 10px; border-radius: 8px; width: fit-content;
      animation: dt-glow-warning 3s infinite alternate;
    }
    @keyframes dt-glow-warning {
      0% { box-shadow: 0 0 4px rgba(255, 81, 72, 0.2); }
      100% { box-shadow: 0 0 14px rgba(255, 81, 72, 0.45); }
    }

    .dt-watched-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 8px;
      font-size:12px !important; font-weight: 700 !important;
      background: rgba(217,84,43,0.14); border: 1px solid rgba(217,84,43,0.4);
      color: #FFB02E !important;
    }

    .dt-channel-trust-badge {
      display: inline-flex; align-items: center; gap: 4px; margin-left: 4px;
      padding: 3px 7px; border-radius: 8px;
      font-size:12px !important; font-weight: 800 !important;
      background: #1e1d1c; border: 1px solid rgba(169,166,163,.22);
      color: #bfbdbb !important; box-shadow: none;
    }
    .dt-channel-trust-badge:hover {
      border-color: rgba(217,150,60,.32);
    }

    /* Glassmorphic Popover */
    .demirtube-feed-detail {
      position: absolute; right: 0; left: auto; top: calc(100% + 8px);
      width: min(320px, calc(100vw - 24px)); max-width: calc(100vw - 24px);
      min-width: 0; padding: 16px; border-radius: 16px; overflow-wrap: anywhere;
      background: #141413 !important;
      border: 1px solid rgba(150,145,140,.38); color: #f5f5f4 !important;
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.56); font:14px/1.5 Inter, Roboto, sans-serif !important;
      z-index: 99999;
    }
    .demirtube-feed-detail[hidden] { display: none !important; }
    .demirtube-feed-detail-heading { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; color: #fff; font-size:15px; font-weight: 850; }
    .demirtube-feed-detail-title { display: -webkit-box; overflow: hidden; margin-bottom: 12px; color: #a9a6a3; font-size:12px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .demirtube-feed-detail-method { margin: 0 0 12px; padding: 9px 10px; border: 1px solid rgba(217,84,43,.2); border-radius: 9px; background: rgba(217,84,43,.055); color: #e7e6e5; font-size:12px; line-height: 1.5; }
    .demirtube-feed-detail-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(169,166,163,.12); color: #d8d6d4; font-size:13px; }
    .demirtube-feed-detail-row span { display:grid; gap:2px; min-width:0; }
    .demirtube-feed-detail-row small { overflow:hidden; color:#989592; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .demirtube-feed-detail-row b { color: #fff; font-size:13px; }
    .demirtube-feed-detail-reason { display: block; margin-top: 10px; color: #a9a6a3; font-size:12px; line-height: 1.5; }
    .demirtube-feed-detail button {
      margin-top: 12px; padding: 10px 14px; border: 0; border-radius: 10px;
      background: #C0522F; color: #0c0c0c;
      font: 800 13px Inter, sans-serif; cursor: pointer; width: 100%;
      box-shadow: 0 6px 18px rgba(192,82,47,.22);
    }
    .demirtube-feed-detail button:hover { filter:brightness(1.08); }

    /* Feature #11: Thumbnail Chapter Overlay */
    .dt-thumb-chapter-overlay {
      position: absolute; bottom: 8px; left: 8px; right: 8px;
      padding: 6px 12px; border-radius: 8px; background: rgba(20,19,18, 0.94);
      backdrop-filter: blur(14px); border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f5f5f4; font-size:12px; font-weight: 700; z-index: 100;
      opacity: 0; pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }
    ytd-thumbnail:hover .dt-thumb-chapter-overlay { opacity: 1; pointer-events: auto; transform: translateY(-2px); }
  `;
  document.documentElement.append(style);
}

// ── Skeleton (yükleniyor) ───────────────────────────────────────────────────

function renderSkeleton(candidate: Candidate) {
  const wrapper = document.createElement("div");
  wrapper.className = "demirtube-feed-analysis";
  wrapper.dataset.videoId = candidate.metadata.videoId;
  wrapper.dataset.instanceId = `${candidate.metadata.videoId}-${++feedInstanceSequence}`;
  const skeleton = document.createElement("span");
  skeleton.className = "demirtube-feed-skeleton";
  wrapper.append(skeleton);
  candidate.mount.append(wrapper);
  return wrapper;
}

function withFeedTimeout<T>(request: Promise<T>, timeoutMs = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Keşfet analizi zaman aşımına uğradı.")), timeoutMs);
    request.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function clearPendingFeedDecorations() {
  document.querySelectorAll<HTMLElement>(".demirtube-feed-analysis").forEach((wrapper) => {
    if (wrapper.querySelector(".demirtube-feed-skeleton")) wrapper.remove();
  });
  document.querySelectorAll<HTMLElement>("[data-demirtube-pending]").forEach((card) => {
    delete card.dataset.demirtubePending;
  });
}

export function clearFeedDecorations() {
  closeOpenDetail();
  document.querySelectorAll(".demirtube-feed-analysis, .dt-feed-mini-summary").forEach((item) => item.remove());
  document.querySelectorAll<HTMLElement>("[data-demirtube-analyzed], [data-demirtube-pending]").forEach((card) => {
    delete card.dataset.demirtubeAnalyzed;
    delete card.dataset.demirtubePending;
    card.classList.remove("demirtube-card-elevated");
  });
}

// ── Rozet Render Etme ───────────────────────────────────────────────────────

function renderBadge(
  wrapper: HTMLElement,
  candidate: Candidate,
  decision: VideoDecision
) {
  wrapper.innerHTML = "";
  const result = decision.preference;
  const finalScore = decision.score;
  const warning = result.intelligence.signals.some((signal) => signal.tone === "warning");

  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = `demirtube-feed-badge ${finalScore !== undefined && finalScore >= 70 ? "strong" : warning || (finalScore !== undefined && finalScore < 45) ? "warning" : ""}`;
  badge.dataset.scored = String(finalScore !== undefined);
  badge.dataset.videoId = candidate.metadata.videoId;
  badge.setAttribute("aria-label", finalScore === undefined ? "DemirTube: kişisel puan için veri yetersiz" : `DemirTube: ${decision.decisionLabel}, 100 üzerinden ${finalScore}`);

  const scoreRing = document.createElement("span");
  scoreRing.className = "demirtube-feed-ring";
  if (finalScore !== undefined) {
    scoreRing.style.setProperty("--dt-feed-angle", `${finalScore * 3.6}deg`);
    scoreRing.style.setProperty("--dt-feed-score", String(Math.round(finalScore)));
  }
  const scoreValue = document.createElement("strong");
  scoreValue.textContent = finalScore === undefined ? "—" : String(finalScore);
  scoreRing.append(scoreValue);

  const badgeCopy = document.createElement("span");
  badgeCopy.className = "demirtube-feed-badge-copy";
  const label = document.createElement("strong");
  label.textContent = decision.decisionLabel;
  const confidence = document.createElement("small");
  const confidenceCount = result.model.confidence === "high" ? 3 : result.model.confidence === "medium" ? 2 : 1;
  confidence.textContent = `${"●".repeat(confidenceCount)}${"○".repeat(3 - confidenceCount)} · ${result.model.sampleCount} video`;
  badgeCopy.append(label, confidence);

  badge.append(scoreRing, badgeCopy);

  const miniSummary = document.createElement("div");
  miniSummary.className = "dt-feed-mini-summary";
  miniSummary.dataset.owner = wrapper.dataset.instanceId;
  const miniTitle = document.createElement("strong");
  miniTitle.textContent = "Neden öneriliyor?";
  const topContribution = decision.scoreContributions.toSorted((a, b) => b.points - a.points)[0];
  const miniRows = [
    ["Tahmini aktif süre", decision.estimatedActiveMinutes ? `${decision.estimatedActiveMinutes} dk` : "Ölçülmedi"],
    [topContribution?.label ?? "Kişisel kanıt", topContribution ? `${topContribution.points > 0 ? "+" : ""}${topContribution.points} puan` : "Biriktiriliyor"],
    ["Veri güveni", result.model.confidence === "high" ? "Yüksek" : result.model.confidence === "medium" ? "Orta" : "Düşük"],
  ];
  miniSummary.append(miniTitle);
  miniRows.forEach(([key, value]) => {
    const row = document.createElement("span");
    const caption = document.createElement("small");
    caption.textContent = key;
    const strong = document.createElement("b");
    strong.textContent = value;
    row.append(caption, strong);
    miniSummary.append(row);
  });

  // "✓ İzledin" rozeti — YouTube izlenen videoyu tekrar önerdiğinde tuzağa düşmeyi önler.
  if (decision.existingWatch) {
    const watched = document.createElement("span");
    watched.className = "dt-watched-badge";
    const days = Math.floor((Date.now() - new Date(decision.existingWatch.lastSeenAt).getTime()) / 86_400_000);
    const when = !Number.isFinite(days) || days < 0 ? "daha önce" : days === 0 ? "bugün" : days === 1 ? "dün" : `${days} gün önce`;
    watched.textContent = `✓ ${when} izledin · %${Math.round(decision.existingWatch.completionRate * 100)}`;
    wrapper.append(watched);
  }

  // Kanal yüzdesi yalnızca en az üç kişisel örnek varsa gösterilir.
  const channelTrustBadge = document.createElement("span");
  channelTrustBadge.className = "dt-channel-trust-badge";
  channelTrustBadge.textContent = decision.channelTrust.score === undefined
    ? `Kanal: ${decision.channelTrust.sampleCount} geçmiş video`
    : `Kanal geçmişi %${decision.channelTrust.score}`;

  // Feature #7: Yanıltıcı Başlık (Clickbait Shield) Rozeti
  const isClickbait = result.intelligence.signals.some((s) => s.label.toLowerCase().includes("clickbait") || s.tone === "warning");
  if (isClickbait) {
    const trueTitle = document.createElement("span");
    trueTitle.className = "dt-true-title-badge";
    trueTitle.textContent = `Başlık riski · ${candidate.metadata.title.slice(0, 32)}…`;
    wrapper.append(trueTitle);
  }

  const highlights = candidate.metadata.transcriptAnalysis?.keyMoments.map(m => m.label).slice(0, 3) 
    || candidate.metadata.topics.slice(0, 3);
    
  const thumbContainer = candidate.card.querySelector<HTMLElement>("ytd-thumbnail, .yt-lockup-metadata-view-model-wiz");
  if (highlights.length > 0 && thumbContainer && !thumbContainer.querySelector(".dt-thumb-chapter-overlay")) {
    const thumbOverlay = document.createElement("div");
    thumbOverlay.className = "dt-thumb-chapter-overlay";
    const thumbLabel = document.createElement("strong");
    thumbLabel.textContent = "Öne Çıkanlar:";
    thumbOverlay.append(thumbLabel, ` ${highlights.join(" • ")}`);
    thumbContainer.style.position = "relative";
    thumbContainer.append(thumbOverlay);
  }

  // Popover — başlık ve açıklamalar dış kaynaklı metin içerdiği için
  // innerHTML yerine güvenli DOM düğümleriyle kurulur (XSS koruması).
  const detail = document.createElement("div");
  detail.className = "demirtube-feed-detail";
  detail.hidden = true;

  const text = result.explanation[0] || decision.reasons.join(" • ");
  const detailHeading = document.createElement("div");
  detailHeading.className = "demirtube-feed-detail-heading";
  detailHeading.textContent = finalScore === undefined ? "Veri yetersiz · puan yok" : `${decision.decisionLabel} · ${finalScore}/100`;
  const detailTitle = document.createElement("span");
  detailTitle.className = "demirtube-feed-detail-title";
  detailTitle.textContent = candidate.metadata.title;
  const detailMethod = document.createElement("p");
  detailMethod.className = "demirtube-feed-detail-method";
  detailMethod.textContent = finalScore === undefined
    ? "Yeterli geçmiş olmadığı için kişisel puan üretilmedi. Aşağıda yalnızca ölçülebilen kanıtlar gösteriliyor."
    : `Bu puan ${result.model.sampleCount} geçmiş videodaki kanal, konu, süre ve başlık davranışına dayanıyor.`;
  const detailText = document.createElement("small");
  detailText.className = "demirtube-feed-detail-reason";
  detailText.textContent = text;
  const evidenceRow = (labelText: string, valueText: string, evidenceText: string) => {
    const row = document.createElement("div");
    row.className = "demirtube-feed-detail-row";
    const copy = document.createElement("span");
    const label = document.createElement("span");
    label.textContent = labelText;
    const evidence = document.createElement("small");
    evidence.textContent = evidenceText;
    copy.append(label, evidence);
    const value = document.createElement("b");
    value.textContent = valueText;
    row.append(copy, value);
    return row;
  };
  const detailTrust = evidenceRow(
    "Kanal geçmişi",
    decision.channelTrust.score === undefined ? "Ölçülmedi" : `%${decision.channelTrust.score}`,
    decision.channelTrust.evidence
  );
  const detailNovelty = evidenceRow(
    "Başlık benzerliği",
    decision.novelty.label,
    decision.novelty.evidence
  );
  const contributionRows = decision.scoreContributions
    .toSorted((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((item) => evidenceRow(item.label, `${item.points > 0 ? "+" : ""}${item.points}`, item.evidence));
  const detailButton = document.createElement("button");
  detailButton.type = "button";
  detailButton.textContent = "Kişisel listeme ekle";
  detail.append(detailHeading, detailTitle, detailMethod, ...contributionRows, detailTrust, detailNovelty, detailText, detailButton);

  detailButton.addEventListener("click", (e) => {
    e.stopPropagation();
    void sendMessage({
      type: "WATCHLIST_TOGGLE",
      item: {
        videoId: candidate.metadata.videoId,
        title: candidate.metadata.title,
        channelName: candidate.metadata.channelName,
        durationSeconds: candidate.metadata.durationSeconds,
        url: `https://www.youtube.com/watch?v=${candidate.metadata.videoId}`,
        topics: candidate.metadata.topics || [],
        addedAt: new Date().toISOString(),
      },
    });
    detail.hidden = true;
  });

  badge.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = detail.hidden === true;
    if (openDetail && openDetail !== detail) closeOpenDetail();
    detail.hidden = !willOpen;
    wrapper.classList.toggle("detail-open", willOpen);
    candidate.card.classList.toggle("demirtube-card-elevated", willOpen);
    openDetail = willOpen ? detail : undefined;
  });
  const showMiniSummary = () => {
    const rect = badge.getBoundingClientRect();
    const summaryWidth = Math.min(286, window.innerWidth - 24);
    const estimatedHeight = 150;
    const isRightRail = candidate.card.matches("ytd-compact-video-renderer")
      || rect.left > window.innerWidth * 0.65;
    const left = isRightRail
      ? Math.max(12, rect.left - summaryWidth - 10)
      : Math.max(12, Math.min(rect.left, window.innerWidth - summaryWidth - 12));
    const top = isRightRail
      ? Math.max(12, Math.min(rect.top, window.innerHeight - estimatedHeight - 12))
      : rect.bottom + 8 + estimatedHeight > window.innerHeight
        ? Math.max(12, rect.top - estimatedHeight - 8)
        : rect.bottom + 8;
    miniSummary.dataset.placement = isRightRail ? "left" : "vertical";
    miniSummary.style.left = `${left}px`;
    miniSummary.style.top = `${top}px`;
    miniSummary.classList.add("mini-open");
  };
  const hideMiniSummary = () => miniSummary.classList.remove("mini-open");
  badge.addEventListener("mouseenter", showMiniSummary);
  badge.addEventListener("mouseleave", hideMiniSummary);
  badge.addEventListener("focus", showMiniSummary);
  badge.addEventListener("blur", hideMiniSummary);
  if (!document.documentElement.dataset.demirtubeDetailDismiss) {
    document.documentElement.dataset.demirtubeDetailDismiss = "true";
    document.addEventListener("click", (event) => {
      if (!openDetail) return;
      const target = event.target;
      if (target instanceof Node && openDetail.parentElement?.contains(target)) return;
      closeOpenDetail();
    }, true);
  }

  wrapper.append(badge);
  document.body.append(miniSummary);
  if (decision.channelTrust.sampleCount > 0) wrapper.append(channelTrustBadge);
  wrapper.append(detail);
  candidate.card.dataset.demirtubeAnalyzed = "true";
  delete candidate.card.dataset.demirtubePending;
}

// ── Ana Dekorasyon Döngüsü ───────────────────────────────────────────────────

export async function startFeedDecorator() {
  let disposed = false;
  let timer = 0;
  let scanning = false;
  /** Üst üste kaç taramanın hata verdiği; geri çekilme ve sessiz mod bundan türer. */
  let consecutiveFailures = 0;
  let lastStatus = "";
  let feedBadgesEnabled = (await sendMessage<Settings>({ type: "GET_SETTINGS" }).catch(() => undefined))?.feedBadgesEnabled !== false;

  const report = (state: FeedRuntimeStatus["state"], count: number, message: string) => {
    const key = `${state}:${count}:${message}`;
    if (key === lastStatus) return;
    lastStatus = key;
    void sendMessage({
      type: "FEED_STATE",
      status: { state, count, message, updatedAt: new Date().toISOString() }
    }).catch(() => undefined);
  };

  const scan = async () => {
    if (disposed || scanning || !globalThis.chrome?.runtime?.id) return;
    scanning = true;
    let items: Candidate[] = [];
    let wrappers: HTMLElement[] = [];

    try {
      const activeInstances = new Set([...document.querySelectorAll<HTMLElement>(".demirtube-feed-analysis[data-instance-id] .demirtube-feed-badge")]
        .map((item) => item.closest<HTMLElement>(".demirtube-feed-analysis")?.dataset.instanceId));
      document.querySelectorAll<HTMLElement>(".dt-feed-mini-summary[data-owner]").forEach((item) => {
        if (!activeInstances.has(item.dataset.owner)) item.remove();
      });
      if (!feedBadgesEnabled) {
        report("disabled", 0, "Akıllı rozetler ayarlardan kapalı.");
        return;
      }
      injectStyles();

      items = sortByVisibility(candidates()).slice(0, 20);
      if (!items.length) {
        const existing = document.querySelectorAll(".demirtube-feed-analysis").length;
        report(
          existing ? "active" : "waiting",
          existing,
          existing ? `${existing} kart analiz edildi.` : "YouTube kartları bekleniyor."
        );
        return;
      }

      // Arka uç üst üste hata verdiğinde iskeleti hiç basmayız: iskelet karta
      // yükseklik ekler, hata onu geri kaldırır ve kartlar 250 ms'de bir aşağı
      // yukarı zıplar. Analiz tekrar çalışana kadar sayfa sabit kalsın.
      wrappers = consecutiveFailures >= FAILURES_BEFORE_QUIET ? [] : items.map((item) => renderSkeleton(item));

      const fullResults = await withFeedTimeout(sendMessage<VideoDecision[]>({
        type: "GET_FEED_DECISIONS",
        items: items.map((item) => item.metadata)
      }));

      if (!disposed && Array.isArray(fullResults)) {
        let needsRescan = false;
        items.forEach((item, i) => {
          const decision = fullResults[i];
          const wrapper = wrappers[i];
          const stillCurrent = Boolean(wrapper && feedResultTargetIsCurrent(item.card, wrapper, item.metadata.videoId));
          if (decision && wrapper && stillCurrent) {
            renderBadge(wrappers[i], item, decision);
          } else if (wrapper) {
            wrapper.remove();
            delete item.card.dataset.demirtubePending;
            needsRescan = needsRescan || item.card.isConnected;
          }
        });
        consecutiveFailures = 0;
        if (needsRescan) schedule();
        const count = document.querySelectorAll(".demirtube-feed-analysis").length;
        report("active", count, `${count} kart analiz edildi.`);
      } else if (!disposed) {
        throw new Error("Keşfet analizi geçerli sonuç döndürmedi.");
      }
    } catch (error) {
      wrappers.forEach((w) => w.remove());
      items.forEach((item) => { delete item.card.dataset.demirtubePending; });
      
      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      // Yalnızca kalıcı 'context invalidated' hatasında durdur. 'receiving end does not exist' geçici SW uyanma hatası olabilir.
      if (message.includes("extension context invalidated")) {
        disposed = true;
      } else {
        consecutiveFailures += 1;
        // Sabit 250 ms ile yeniden denemek, arka uç kalıcı olarak arızalıyken
        // (ör. disk dolu, IndexedDB yazamıyor) saniyede dört kez boşa tarama
        // yapıyordu. Üst sınırı 30 sn olan üstel geri çekilme uygularız.
        const backoff = Math.min(RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), MAX_RETRY_MS);
        report(
          "error",
          0,
          consecutiveFailures >= FAILURES_BEFORE_QUIET
            ? "Keşfet analizi çalışamıyor; yerel veritabanına yazılamıyor olabilir."
            : "Keşfet analizi geçici olarak çalışamadı."
        );
        schedule(backoff);
      }
    } finally {
      scanning = false;
    }
  };

  const schedule = (delayMs = RETRY_BASE_MS) => {
    if (timer || disposed) return;
    timer = window.setTimeout(() => {
      timer = 0;
      void scan();
    }, delayMs);
  };

  const mutationHasVideoCard = (records: MutationRecord[]) => records.some((record) =>
    [...record.addedNodes, ...record.removedNodes].some((node) => {
      if (!(node instanceof Element)) return false;
      if (node.matches(".demirtube-feed-analysis, .demirtube-feed-badge")) return true;
      if (node.closest(".demirtube-feed-analysis, .dt-feed-mini-summary, #demirtube-panel-host")) return false;
      return node.matches(CARD_SELECTOR)
        || Boolean(node.querySelector(CARD_SELECTOR))
        || Boolean(node.closest(CARD_SELECTOR));
    })
  );
  const observer = new MutationObserver((records) => {
    if (mutationHasVideoCard(records)) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const periodic = window.setInterval(() => {
    if (document.visibilityState !== "hidden") schedule();
  }, 5_000);
  const visibilityListener = () => {
    if (document.visibilityState !== "hidden") schedule();
  };
  document.addEventListener("visibilitychange", visibilityListener);
  const settingsListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local") return;
    const next = changes.settings?.newValue as Settings | undefined;
    if (!next || typeof next.feedBadgesEnabled !== "boolean") return;
    feedBadgesEnabled = next.feedBadgesEnabled;
    if (feedBadgesEnabled) schedule();
    else clearFeedDecorations();
  };
  const unsubscribeSettings = onStorageChanged(settingsListener);
  void scan();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    clearInterval(periodic);
    document.removeEventListener("visibilitychange", visibilityListener);
    observer.disconnect();
    unsubscribeSettings();
    clearPendingFeedDecorations();
  };
}
