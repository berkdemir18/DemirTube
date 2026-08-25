import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import { formatDuration } from "../shared/utils";
import { BRAND_MARK_DATA_URI } from "../shared/brand-assets";

type ChannelStats = {
  videoCount: number;
  averageCompletion: number | null;
  averageRegret: number | null;
  totalWatchSeconds: number;
  completedCount: number;
  repeatCount: number;
  longFormCompletion: number | null;
  longFormCount: number;
  shortEarlyExitCount: number;
  shortCount: number;
};

let timer = 0;
let lastKey = "";
let selectedDays: 30 | 90 | undefined = 90;
let headerVisibilityObserver: IntersectionObserver | undefined;
let headerVisibilityTarget: HTMLElement | undefined;
let headerScrollHandler: (() => void) | undefined;

function disconnectChannelVisibility() {
  headerVisibilityObserver?.disconnect();
  headerVisibilityObserver = undefined;
  if (headerScrollHandler) {
    window.removeEventListener("scroll", headerScrollHandler);
    window.removeEventListener("resize", headerScrollHandler);
  }
  headerScrollHandler = undefined;
  headerVisibilityTarget = undefined;
}

/** YouTube navigasyonundan çağrılır; kanal sayfasına kişisel ve kanıta dayalı bir geçmiş şeridi ekler. */
export function refreshChannelBadge() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void mountChannelBadge().catch(() => undefined), 700);
}

const CHANNEL_NAME_SELECTORS = [
  "yt-page-header-renderer h1",
  ".page-header-view-model-wiz__page-header-title",
  "ytd-channel-name #text",
  "#channel-header-container #text",
  "#inner-header-container #text"
];

const CHANNEL_ANCHOR_SELECTORS = [
  "yt-page-header-renderer",
  "#channel-header",
  "#channel-header-container",
  "ytd-browse[page-subtype='channels'] #header"
];

const CHANNEL_VISIBILITY_SELECTORS = [
  ".page-header-view-model-wiz__page-header-content",
  ".page-header-view-model-wiz__page-header-title",
  "#channel-header-container #avatar",
  "#inner-header-container #avatar",
  "h1"
];

function isChannelRoute() {
  return location.pathname.startsWith("/@")
    || location.pathname.startsWith("/channel/")
    || location.pathname.startsWith("/c/")
    || location.pathname.startsWith("/user/");
}

function metric(label: string, value: string, detail: string, progress?: number) {
  const item = document.createElement("div");
  item.className = "dt-channel-metric";
  const caption = document.createElement("span");
  caption.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const small = document.createElement("small");
  small.textContent = detail;
  item.append(caption, strong, small);
  if (typeof progress === "number") {
    const track = document.createElement("span");
    track.className = "dt-channel-progress";
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    track.append(fill);
    item.append(track);
  }
  return item;
}

function periodLabel() {
  return selectedDays ? `Son ${selectedDays} gün` : "Tüm zamanlar";
}

function channelInsight(stats: ChannelStats) {
  if (stats.videoCount < 3) return {
    title: "Kişisel örüntü oluşuyor",
    body: "En az 3 izleme sonrası bu kanalla ilişkin hakkında daha anlamlı bir yorum göstereceğim.",
    tone: "forming"
  };
  const completion = stats.averageCompletion ?? 0;
  const regret = stats.averageRegret ?? 0;
  if (completion >= 70 && regret <= 35) return {
    title: "Güçlü kişisel uyum sinyali",
    body: "Bu kanaldaki videoları çoğunlukla sürdürüyor ve sonradan pişmanlık sinyali vermiyorsun.",
    tone: "positive"
  };
  if (regret >= 60 || (completion > 0 && completion < 35)) return {
    title: "Daha seçici açmak faydalı olabilir",
    body: "Geçmiş davranışın, bu kanalda başlık ve süreyi açmadan önce kontrol etmenin yararlı olabileceğini gösteriyor.",
    tone: "caution"
  };
  return {
    title: "Dengeli ama seçici bir ilişki",
    body: "Bazı videolar iyi eşleşiyor; karar verirken konu ve süre sinyallerini birlikte değerlendir.",
    tone: "neutral"
  };
}

async function mountChannelBadge() {
  const existing = document.querySelector("#demirtube-channel-badge");
  if (!isChannelRoute()) {
    disconnectChannelVisibility();
    existing?.remove();
    lastKey = "";
    return;
  }

  let channelName = "";
  for (const selector of CHANNEL_NAME_SELECTORS) {
    const value = document.querySelector<HTMLElement>(selector)?.textContent?.trim();
    if (value) { channelName = value; break; }
  }
  if (!channelName) return;

  const key = `${location.pathname}:${channelName}:${selectedDays ?? "all"}`;
  if (existing && key === lastKey) {
    injectChannelBadgeStyles();
    headerScrollHandler?.();
    return;
  }

  const stats = await sendMessage<ChannelStats | null>({ type: "GET_CHANNEL_STATS", channelName, days: selectedDays }).catch((error) => {
    if (!isExtensionContextInvalidated(error)) console.warn("DemirTube kanal geçmişi alınamadı.", error);
    return null;
  });
  if (!stats) return;
  if (key === lastKey && existing) return;
  lastKey = key;
  disconnectChannelVisibility();
  existing?.remove();
  injectChannelBadgeStyles();

  const strip = document.createElement("section");
  strip.id = "demirtube-channel-badge";
  strip.setAttribute("aria-label", "DemirTube kanal geçmişi");

  const head = document.createElement("header");
  const identity = document.createElement("div");
  identity.className = "dt-channel-identity";
  const brand = document.createElement("span");
  brand.className = "dt-channel-brand";
  brand.textContent = "";
  brand.setAttribute("aria-hidden", "true");
  const headCopy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Bu kanalla hafızan";
  const subtitle = document.createElement("small");
  subtitle.textContent = stats.videoCount
    ? `${channelName} · ${periodLabel()} · yalnızca kendi izleme davranışın`
    : "Bu kanalda henüz ölçülebilir izleme geçmişin yok";
  headCopy.append(title, subtitle);
  identity.append(brand, headCopy);
  const range = document.createElement("div");
  range.className = "dt-channel-range";
  const rangeValues: Array<[30 | 90 | undefined, string]> = [[30, "30 gün"], [90, "90 gün"], [undefined, "Tümü"]];
  rangeValues.forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(value === selectedDays));
    button.addEventListener("click", () => {
      selectedDays = value;
      lastKey = "";
      void mountChannelBadge();
    });
    range.append(button);
  });
  head.append(identity, range);

  const memory = document.createElement("div");
  memory.className = "dt-channel-memory";
  const insight = channelInsight(stats);
  memory.classList.add(`dt-channel-memory-${insight.tone}`);
  const memoryIcon = document.createElement("span");
  memoryIcon.className = "dt-channel-memory-icon";
  memoryIcon.textContent = insight.tone === "positive" ? "✓" : insight.tone === "caution" ? "!" : "✦";
  memoryIcon.setAttribute("aria-hidden", "true");
  const memoryCopy = document.createElement("div");
  const memoryLabel = document.createElement("span");
  memoryLabel.textContent = "KİŞİSEL OKUMA";
  const memoryTitle = document.createElement("strong");
  memoryTitle.textContent = insight.title;
  const narrative = stats.videoCount < 3
    ? insight.body
    : stats.longFormCount && stats.shortCount
      ? `${insight.body} Uzun videolarda ortalama %${stats.longFormCompletion} tamamlama var; ${stats.shortEarlyExitCount ? `${stats.shortEarlyExitCount} kısa videodan erken çıktın.` : "kısa videolarda belirgin erken çıkış yok."}`
      : stats.longFormCount
        ? `${insight.body} Uzun videolarda ortalama tamamlaman %${stats.longFormCompletion}.`
        : stats.shortCount
          ? `${insight.body} ${stats.shortCount} kısa videonun ${stats.shortEarlyExitCount} tanesinden erken çıktın.`
          : insight.body;
  const memoryBody = document.createElement("p");
  memoryBody.textContent = narrative;
  const sampleState = stats.videoCount >= 8 ? "Sağlıklı örneklem" : stats.videoCount >= 3 ? "Gelişen örneklem" : "Düşük örneklem";
  const sample = document.createElement("span");
  sample.className = "dt-channel-sample";
  sample.textContent = sampleState;
  memoryCopy.append(memoryLabel, memoryTitle, memoryBody);
  memory.append(memoryIcon, memoryCopy, sample);

  const grid = document.createElement("div");
  grid.className = "dt-channel-grid";
  const completion = stats.averageCompletion ?? 0;
  const completedRatio = stats.videoCount ? Math.round((stats.completedCount / stats.videoCount) * 100) : 0;
  const averageWatch = stats.videoCount ? Math.round(stats.totalWatchSeconds / stats.videoCount) : 0;
  grid.append(
    metric("İzlediğin video", String(stats.videoCount), stats.completedCount ? `${stats.completedCount} tanesi tamamlandı` : "Tamamlanan video yok", completedRatio),
    metric("Aktif izleme", formatDuration(stats.totalWatchSeconds), "Duraklama ve gizli sekme hariç"),
    metric("Ortalama tamamlama", stats.averageCompletion === null ? "—" : `%${stats.averageCompletion}`, stats.videoCount ? `${stats.videoCount} video üzerinden` : "Henüz ölçülmedi", completion),
    metric("Video başına", averageWatch ? formatDuration(averageWatch) : "—", "Ortalama aktif izleme")
  );

  const evidence = document.createElement("div");
  evidence.className = "dt-channel-evidence";
  const evidenceItems = [
    ["↻", `${stats.repeatCount} tekrar sinyali`],
    ["◇", `Pişmanlık ${stats.averageRegret === null ? "ölçülmedi" : `%${stats.averageRegret}`}`],
    ["▰", `${stats.longFormCount} uzun video`],
    ["▯", `${stats.shortCount} kısa video`]
  ];
  evidenceItems.forEach(([icon, text]) => {
    const chip = document.createElement("span");
    chip.innerHTML = `<i aria-hidden="true">${icon}</i>${text}`;
    evidence.append(chip);
  });

  const footer = document.createElement("footer");
  const disclaimer = document.createElement("span");
  disclaimer.textContent = "Kanal kalite puanı değildir; kişisel davranış özetidir.";
  const footEvidence = document.createElement("span");
  footEvidence.textContent = stats.videoCount
    ? `${periodLabel()} · ${stats.videoCount >= 8 ? "yorum daha kararlı" : "daha çok izlemeyle güven artar"}`
    : "Yeni izlemelerle otomatik güncellenir.";
  footer.append(disclaimer, footEvidence);

  strip.append(head, memory, grid, evidence, footer);
  for (const selector of CHANNEL_ANCHOR_SELECTORS) {
    const anchor = document.querySelector<HTMLElement>(selector);
    if (anchor) {
      const visibilityTarget = CHANNEL_VISIBILITY_SELECTORS
        .map((visibilitySelector) => anchor.querySelector<HTMLElement>(visibilitySelector))
        .find((target): target is HTMLElement => Boolean(target));
      anchor.append(strip);
      observeChannelHeader(strip, visibilityTarget);
      return;
    }
  }
}

function observeChannelHeader(strip: HTMLElement, target?: HTMLElement) {
  if (!target) return;
  headerVisibilityTarget = target;
  const applyVisibility = (visible: boolean) => {
    strip.classList.toggle("dt-channel-hidden", !visible);
    if (visible) strip.removeAttribute("aria-hidden");
    else strip.setAttribute("aria-hidden", "true");
  };
  const syncFromPosition = () => {
    if (!strip.isConnected || !headerVisibilityTarget?.isConnected) return;
    const rect = headerVisibilityTarget.getBoundingClientRect();
    applyVisibility(window.scrollY <= 80 || (rect.bottom > 64 && rect.top < window.innerHeight));
  };
  const syncAfterLayout = () => {
    syncFromPosition();
    window.requestAnimationFrame(syncFromPosition);
    window.setTimeout(syncFromPosition, 120);
  };
  headerScrollHandler = syncAfterLayout;
  window.addEventListener("scroll", syncAfterLayout, { passive: true });
  window.addEventListener("resize", syncAfterLayout);
  if (typeof IntersectionObserver !== "undefined") {
    headerVisibilityObserver = new IntersectionObserver(([entry]) => {
      // A queued IntersectionObserver callback can arrive after a fast scroll-to-top
      // and otherwise re-hide the strip using stale intersection state.
      applyVisibility(window.scrollY <= 80 || Boolean(entry?.isIntersecting && entry.intersectionRatio > 0));
    }, {
      threshold: [0, 0.01],
      rootMargin: "-64px 0px 0px"
    });
    headerVisibilityObserver.observe(target);
  }
  syncAfterLayout();
}

function injectChannelBadgeStyles() {
  if (document.querySelector("#demirtube-channel-badge-styles")) return;
  const style = document.createElement("style");
  style.id = "demirtube-channel-badge-styles";
  style.textContent = `
    #demirtube-channel-badge {
      width:min(1040px,calc(100% - 24px)); margin-top:14px; overflow:hidden;
      border:1px solid rgba(174,170,166,.24); border-radius:18px;
      background:linear-gradient(135deg,#161514 0%,#1a1917 58%,#1e1d1c 100%); color:#f5f4f3;
      box-shadow:0 16px 40px rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.025);
      font:500 13px/1.45 Inter,Roboto,Arial,sans-serif; box-sizing:border-box; position:relative; z-index:10;
      max-height:440px; opacity:1; transform:translateY(0);
      transition:max-height .22s ease,margin-top .22s ease,opacity .16s ease,transform .22s ease,border-width .22s ease;
    }
    #demirtube-channel-badge::before { content:""; position:absolute; inset:0 auto 0 0; width:3px; background:#C0522F; z-index:2; }
    #demirtube-channel-badge.dt-channel-hidden { max-height:0; margin-top:0; border-width:0; opacity:0; transform:translateY(-8px); pointer-events:none; }
    #demirtube-channel-badge * { box-sizing:border-box; }
    #demirtube-channel-badge header { min-height:66px; display:flex; align-items:center; justify-content:space-between; gap:24px; padding:13px 18px; border-bottom:1px solid rgba(169,166,163,.13); }
    #demirtube-channel-badge .dt-channel-identity { display:flex; align-items:center; gap:11px; min-width:0; }
    #demirtube-channel-badge .dt-channel-brand { flex:0 0 38px; height:38px; border-radius:10px; background:url("${BRAND_MARK_DATA_URI}") center/contain no-repeat; box-shadow:0 9px 22px rgba(192,82,47,.22); }
    #demirtube-channel-badge header strong { display:block; color:#fff; font-size:17px; font-weight:850; letter-spacing:-.02em; }
    #demirtube-channel-badge header small { display:block; margin-top:2px; color:#a6a3a0; font-size:12px; }
    #demirtube-channel-badge .dt-channel-range { display:flex; align-items:center; gap:4px; padding:3px; border:1px solid rgba(169,166,163,.16); border-radius:999px; background:#171614; }
    #demirtube-channel-badge .dt-channel-range button { min-height:30px; padding:0 11px; border:0; border-radius:999px; background:transparent; color:#a6a3a0; cursor:pointer; font:750 12px Inter,Roboto,sans-serif; }
    #demirtube-channel-badge .dt-channel-range button:hover { color:#f5f5f4; }
    #demirtube-channel-badge .dt-channel-range button[aria-pressed="true"] { background:linear-gradient(120deg,rgba(192,82,47,.16),rgba(217,150,60,.12)); color:#FFB02E; box-shadow:inset 0 0 0 1px rgba(192,82,47,.18); }
    #demirtube-channel-badge .dt-channel-range button:focus-visible { outline:2px solid #D9963C; outline-offset:1px; }
    #demirtube-channel-badge .dt-channel-memory { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid rgba(169,166,163,.12); background:rgba(13,12,11,.22); }
    #demirtube-channel-badge .dt-channel-memory-icon { width:32px; height:32px; display:grid; place-items:center; border-radius:10px; background:rgba(188,185,181,.13); color:#d7d5d2; font-size:14px; font-weight:900; }
    #demirtube-channel-badge .dt-channel-memory-positive .dt-channel-memory-icon { background:rgba(52,211,153,.12); color:#7FE07A; }
    #demirtube-channel-badge .dt-channel-memory-caution .dt-channel-memory-icon { background:rgba(246,189,104,.12); color:#f6bd68; }
    #demirtube-channel-badge .dt-channel-memory > div > span { display:block; color:#bbb7b3; font-size:8px; font-weight:900; letter-spacing:.13em; }
    #demirtube-channel-badge .dt-channel-memory > div > strong { display:block; margin-top:2px; color:#f8f8f7; font-size:14px; font-weight:800; }
    #demirtube-channel-badge .dt-channel-memory p { margin:3px 0 0; color:#b2afac; font-size:11px; line-height:1.45; }
    #demirtube-channel-badge .dt-channel-sample { padding:5px 9px; border:1px solid rgba(169,166,163,.16); border-radius:999px; background:rgba(255,255,255,.03); color:#bbb9b6; font-size:10px; font-weight:800; white-space:nowrap; }
    #demirtube-channel-badge .dt-channel-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); }
    #demirtube-channel-badge .dt-channel-metric { min-width:0; padding:14px 18px 13px; border-left:1px solid rgba(169,166,163,.12); }
    #demirtube-channel-badge .dt-channel-metric:first-child { border-left:0; }
    #demirtube-channel-badge .dt-channel-metric > span:first-child { display:block; color:#a8a6a3; font-size:10px; font-weight:800; letter-spacing:.03em; text-transform:uppercase; }
    #demirtube-channel-badge .dt-channel-metric strong { display:block; margin:4px 0 2px; color:#fcfcfb; font-size:21px; font-weight:880; letter-spacing:-.04em; }
    #demirtube-channel-badge .dt-channel-metric small { display:block; overflow:hidden; color:#a6a3a0; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    #demirtube-channel-badge .dt-channel-progress { display:block; height:3px; margin-top:9px; overflow:hidden; border-radius:999px; background:rgba(169,166,163,.12); }
    #demirtube-channel-badge .dt-channel-progress i { display:block; height:100%; border-radius:inherit; background:#C0522F; }
    #demirtube-channel-badge .dt-channel-evidence { display:flex; align-items:center; gap:7px; flex-wrap:wrap; padding:0 18px 12px; }
    #demirtube-channel-badge .dt-channel-evidence > span { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border:1px solid rgba(169,166,163,.13); border-radius:999px; background:rgba(255,255,255,.025); color:#a8a5a1; font-size:10px; font-weight:700; }
    #demirtube-channel-badge .dt-channel-evidence i { color:#FFB02E; font-style:normal; }
    #demirtube-channel-badge footer { display:flex; justify-content:space-between; gap:16px; padding:9px 18px; border-top:1px solid rgba(169,166,163,.12); color:#96938f; font-size:11px; }
    #demirtube-channel-badge footer span:first-child { color:#c4c2bf; }
    @media(max-width:900px) {
      #demirtube-channel-badge .dt-channel-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      #demirtube-channel-badge .dt-channel-metric:nth-child(3) { border-left:0; border-top:1px solid rgba(169,166,163,.13); }
      #demirtube-channel-badge .dt-channel-metric:nth-child(4) { border-top:1px solid rgba(169,166,163,.13); }
    }
    @media(max-width:620px) {
      #demirtube-channel-badge header { align-items:flex-start; flex-direction:column; gap:8px; }
      #demirtube-channel-badge .dt-channel-memory { grid-template-columns:auto minmax(0,1fr); }
      #demirtube-channel-badge .dt-channel-sample { grid-column:2; justify-self:start; }
      #demirtube-channel-badge footer { flex-direction:column; gap:3px; }
    }
  `;
  document.documentElement.append(style);
}
