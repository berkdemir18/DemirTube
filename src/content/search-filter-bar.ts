import { BRAND_MARK_DATA_URI } from "../shared/brand-assets";

type SearchFilter = "all" | "unwatched" | "no_clickbait" | "short";

let currentFilter: SearchFilter = "all";
let retryTimer = 0;
let applyTimer = 0;

const isSearchRoute = () => location.pathname === "/results" && Boolean(new URL(location.href).searchParams.get("search_query")?.trim());

function searchQuery() {
  return new URL(location.href).searchParams.get("search_query")?.trim() ?? "";
}

function suggestionFor(query: string) {
  const value = query.toLocaleLowerCase("tr-TR");
  if (/\bücretsiz\b|\bbedava\b|\bfree\b/.test(value)) return "Ücretsiz vaadini açıklama ve kaynak bağlantısıyla doğrula.";
  if (/\bnasıl\b|\brehber\b|\btutorial\b/.test(value)) return "Önce açıklama ve bölüm yapısını kontrol et.";
  return "Önce başlık vaadini kontrol et.";
}

function createButton(label: string, filter: SearchFilter) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `dt-fbtn${filter === currentFilter ? " active" : ""}`;
  button.dataset.filter = filter;
  button.textContent = label;
  button.setAttribute("aria-pressed", String(filter === currentFilter));
  return button;
}

function updateSummary(bar: HTMLElement) {
  const analyzed = document.querySelectorAll(".demirtube-feed-analysis").length;
  const scored = document.querySelectorAll(".demirtube-feed-badge[data-scored='true']").length;
  const warnings = document.querySelectorAll(".demirtube-feed-badge.warning").length;
  const cards = [...document.querySelectorAll<HTMLElement>("ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model")];
  const visible = cards.filter((card) => card.style.display !== "none").length;
  const summary = bar.querySelector<HTMLElement>(".dt-search-summary");
  if (!summary) return;
  summary.textContent = analyzed === 0
    ? "Sonuçlar hazırlanıyor; yeterli kişisel kanıt yoksa puan yerine veri durumu gösterilir."
    : scored === 0
      ? "Henüz kişisel puan üretmek için yeterli geçmiş yok; yapısal uyarılar yine gösterilir."
      : `${scored} sonuç, geçmiş izleme davranışınla karşılaştırılabildi.`;

  const values: Record<string, string> = {
    analyzed: String(analyzed),
    scored: String(scored),
    warnings: String(warnings),
    visible: String(visible)
  };
  Object.entries(values).forEach(([key, value]) => {
    const target = bar.querySelector<HTMLElement>(`[data-stat='${key}']`);
    if (target) target.textContent = value;
  });
}

function ensureApplyTimer() {
  if (applyTimer) return;
  applyTimer = window.setInterval(() => {
    const bar = document.querySelector<HTMLElement>("#demirtube-filter-bar");
    if (!isSearchRoute()) {
      window.clearInterval(applyTimer);
      applyTimer = 0;
      return;
    }
    if (!bar) {
      tryInit();
      return;
    }
    updateSummary(bar);
    if (currentFilter !== "all") applyFilterToPage(currentFilter);
  }, 1_200);
}

function tryInit() {
  if (!isSearchRoute()) {
    if (currentFilter !== "all") {
      applyFilterToPage("all");
      currentFilter = "all";
    }
    document.querySelector("#demirtube-filter-bar")?.remove();
    return false;
  }
  const existing = document.querySelector<HTMLElement>("#demirtube-filter-bar");
  if (existing) {
    injectStyles();
    const query = searchQuery();
    existing.querySelector<HTMLElement>(".dt-search-query")!.textContent = query;
    existing.querySelector<HTMLElement>(".dt-search-advice strong")!.textContent = suggestionFor(query);
    updateSummary(existing);
    return true;
  }

  const container = findFilterContainer();
  if (!container) return false;
  injectStyles();

  const bar = document.createElement("section");
  bar.id = "demirtube-filter-bar";
  bar.className = "dt-filter-bar";
  bar.setAttribute("aria-label", "DemirTube arama özeti");

  const overview = document.createElement("div");
  overview.className = "dt-search-overview";
  const brand = document.createElement("span");
  brand.className = "dt-search-brand";
  brand.textContent = "";
  brand.setAttribute("aria-hidden", "true");
  const copy = document.createElement("div");
  copy.className = "dt-search-copy";
  const titleLine = document.createElement("div");
  titleLine.className = "dt-search-title";
  const title = document.createElement("strong");
  title.textContent = "Arama pusulası";
  const query = document.createElement("span");
  query.className = "dt-search-query";
  query.textContent = searchQuery();
  titleLine.append(title, query);
  const summary = document.createElement("small");
  summary.className = "dt-search-summary";
  copy.append(titleLine, summary);
  overview.append(brand, copy);

  const metrics = document.createElement("div");
  metrics.className = "dt-search-metrics";
  const metricData = [
    ["analyzed", "Analiz edilen", "Kart yapısı okundu"],
    ["scored", "Kişisel puan", "Geçmişinle eşleşti"],
    ["warnings", "Başlık riski", "Dikkat isteyen sonuç"],
    ["visible", "Şu an görünen", "Aktif filtre sonrası"]
  ];
  metricData.forEach(([key, label, detail]) => {
    const item = document.createElement("div");
    item.className = `dt-search-metric dt-search-metric-${key}`;
    const value = document.createElement("strong");
    value.dataset.stat = key;
    value.textContent = "0";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const detailNode = document.createElement("small");
    detailNode.textContent = detail;
    item.append(value, labelNode, detailNode);
    metrics.append(item);
  });

  const advice = document.createElement("div");
  advice.className = "dt-search-advice";
  const adviceIcon = document.createElement("span");
  adviceIcon.className = "dt-search-advice-icon";
  adviceIcon.textContent = "✦";
  adviceIcon.setAttribute("aria-hidden", "true");
  const adviceCopy = document.createElement("div");
  const adviceLabel = document.createElement("span");
  adviceLabel.textContent = "ARAMA İPUCU";
  const adviceText = document.createElement("strong");
  adviceText.textContent = suggestionFor(searchQuery());
  adviceCopy.append(adviceLabel, adviceText);
  advice.append(adviceIcon, adviceCopy);

  const chips = document.createElement("div");
  chips.className = "dt-filter-chips";
  const chipsLabel = document.createElement("span");
  chipsLabel.className = "dt-filter-label";
  chipsLabel.textContent = "Hızlı filtreler";
  chips.append(
    chipsLabel,
    createButton("Tümü", "all"),
    createButton("Daha önce izlenmeyen", "unwatched"),
    createButton("Clickbait uyarısı olmayan", "no_clickbait"),
    createButton("10 dk altı", "short")
  );

  bar.append(overview, advice, metrics, chips);
  if (container.parentElement) container.parentElement.insertBefore(bar, container);
  else container.prepend(bar);

  bar.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".dt-fbtn");
    const filter = button?.dataset.filter as SearchFilter | undefined;
    if (!button || !filter) return;
    currentFilter = filter;
    bar.querySelectorAll<HTMLButtonElement>(".dt-fbtn").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    button.classList.add("active");
    applyFilterToPage(filter);
    updateSummary(bar);
  });
  updateSummary(bar);
  return true;
}

export function refreshSearchFilterBar() {
  window.clearInterval(retryTimer);
  retryTimer = 0;
  if (tryInit()) {
    ensureApplyTimer();
    return;
  }
  if (!isSearchRoute()) return;
  let attempts = 0;
  retryTimer = window.setInterval(() => {
    attempts += 1;
    if (tryInit() || attempts >= 12) {
      window.clearInterval(retryTimer);
      retryTimer = 0;
      if (document.querySelector("#demirtube-filter-bar")) ensureApplyTimer();
    }
  }, 700);
}

/** Eski çağrı adı, içerik-script sürümleri arasında uyum için korunur. */
export const initSearchFilterBar = refreshSearchFilterBar;

function findFilterContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("ytd-search #header")
    || document.querySelector<HTMLElement>("#filter-menu")
    || document.querySelector<HTMLElement>("ytd-feed-filter-chip-bar-renderer")
    || document.querySelector<HTMLElement>("#primary #header-container");
}

function applyFilterToPage(filter: SearchFilter) {
  const cards = document.querySelectorAll<HTMLElement>("ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model");
  cards.forEach((card) => {
    if (filter === "all") {
      card.style.display = "";
      return;
    }
    const badge = card.querySelector<HTMLElement>(".demirtube-feed-badge");
    const isWarning = badge?.classList.contains("warning");
    const watched = Boolean(card.querySelector(".dt-watched-badge"));
    const timeText = card.querySelector<HTMLElement>("ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text, .ytBadgeShapeText")?.textContent?.trim() || "";
    const parts = timeText.split(":").map(Number);
    const durationSec = parts.length === 2 ? parts[0] * 60 + parts[1] : parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : 0;
    const show = filter === "unwatched" ? !watched
      : filter === "no_clickbait" ? !isWarning
        : durationSec > 0 && durationSec <= 600;
    card.style.display = show ? "" : "none";
  });
}

function injectStyles() {
  if (document.querySelector("#demirtube-filter-bar-styles")) return;
  const style = document.createElement("style");
  style.id = "demirtube-filter-bar-styles";
  style.textContent = `
    .dt-filter-bar {
      width: min(1040px,calc(100% - 16px)); display:grid; grid-template-columns:minmax(0,1fr) minmax(290px,.72fr);
      gap:14px 24px; margin:12px 0 20px; padding:18px; border:1px solid rgba(255,255,255,.08);
      border-radius:18px; background:#161615; color:#E7E6E3; box-shadow:0 16px 40px rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.025);
      font:500 13px/1.45 Inter,Roboto,Arial,sans-serif; box-sizing:border-box; position:relative; z-index:30;
    }
    .dt-filter-bar::before { content:""; position:absolute; inset:0 auto 0 0; width:3px; border-radius:18px 0 0 18px; background:#C0522F; }
    .dt-filter-bar * { box-sizing:border-box; }
    .dt-search-overview { display:flex; align-items:center; gap:12px; min-width:0; }
    .dt-search-brand { flex:0 0 38px; height:38px; border-radius:10px; background:url("${BRAND_MARK_DATA_URI}") center/contain no-repeat; box-shadow:0 9px 22px rgba(192,82,47,.22); }
    .dt-search-copy { min-width:0; }
    .dt-search-title { display:flex; align-items:baseline; gap:10px; min-width:0; }
    .dt-search-title strong { color:#fff; font-size:17px; font-weight:850; letter-spacing:-.02em; }
    .dt-search-query { max-width:380px; overflow:hidden; padding:2px 8px; border:1px solid rgba(169,166,163,.16); border-radius:999px; background:rgba(255,255,255,.035); color:#dad9d7; font-size:12px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
    .dt-search-summary { display:block; margin-top:4px; color:#a8a5a1; font-size:12px; }
    .dt-search-advice { display:flex; align-items:center; gap:10px; padding:11px 13px; border:1px solid rgba(188,185,181,.2); border-radius:12px; background:rgba(188,185,181,.065); }
    .dt-search-advice-icon { flex:0 0 28px; height:28px; display:grid; place-items:center; border-radius:9px; background:rgba(188,185,181,.13); color:#d7d5d2; font-size:14px; }
    .dt-search-advice div { display:grid; gap:2px; }
    .dt-search-advice div span { color:#cdcac7; font-size:10px; font-weight:850; letter-spacing:.12em; }
    .dt-search-advice strong { color:#f5f4f3; font-size:12px; font-weight:700; line-height:1.4; }
    .dt-search-metrics { grid-column:1/-1; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); overflow:hidden; border:1px solid rgba(169,166,163,.13); border-radius:13px; background:rgba(10,10,10,.2); }
    .dt-search-metric { min-width:0; padding:11px 14px; border-left:1px solid rgba(169,166,163,.12); }
    .dt-search-metric:first-child { border-left:0; }
    .dt-search-metric strong { display:inline-block; margin-right:7px; color:#fbfbfb; font-size:18px; font-weight:880; letter-spacing:-.04em; }
    .dt-search-metric span { color:#d0cecc; font-size:11px; font-weight:750; }
    .dt-search-metric small { display:block; margin-top:1px; color:#878480; font-size:10px; }
    .dt-search-metric-warnings strong { color:#f6bd68; }
    .dt-search-metric-scored strong { color:#FFB02E; }
    .dt-filter-chips { grid-column:1/-1; display:flex; align-items:center; gap:7px; flex-wrap:wrap; padding-top:1px; }
    .dt-filter-label { margin-right:3px; color:#898682; font-size:10px; font-weight:850; letter-spacing:.1em; text-transform:uppercase; }
    .dt-fbtn {
      min-height:32px; padding:0 12px; border-radius:999px; border:1px solid rgba(169,166,163,.16);
      background:#1e1d1c; color:#bfbdbb; font:700 12px Inter,Roboto,Arial,sans-serif; cursor:pointer;
      transition:border-color .15s ease,background .15s ease,color .15s ease,transform .15s ease;
    }
    .dt-fbtn:hover { border-color:rgba(192,82,47,.34); background:rgba(192,82,47,.07); color:#f6f6f6; transform:translateY(-1px); }
    .dt-fbtn.active { border-color:rgba(192,82,47,.52); background:linear-gradient(120deg,rgba(192,82,47,.15),rgba(217,150,60,.1)); color:#FFB02E; box-shadow:0 0 0 1px rgba(217,150,60,.06) inset; }
    .dt-fbtn:focus-visible { outline:2px solid #D9963C; outline-offset:2px; }
    @media(max-width:760px) {
      .dt-filter-bar { grid-template-columns:1fr; }
      .dt-search-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .dt-search-metric:nth-child(3) { border-left:0; border-top:1px solid rgba(169,166,163,.12); }
      .dt-search-metric:nth-child(4) { border-top:1px solid rgba(169,166,163,.12); }
      .dt-search-query { max-width:210px; }
    }
    @media(max-width:480px) {
      .dt-filter-bar { padding:14px; }
      .dt-search-title { align-items:flex-start; flex-direction:column; gap:3px; }
      .dt-filter-label { width:100%; }
    }
  `;
  document.documentElement.append(style);
}
