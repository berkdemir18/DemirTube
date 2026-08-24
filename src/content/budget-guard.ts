// DemirTube · günlük bütçe muhafızı
//
// Günlük izleme bütçesi şimdiye kadar yalnızca panelin detay kartında bir satırdı:
// aşıldığını görmek için kullanıcının paneli açması gerekiyordu. Muhafız, bütçe
// aşıldığında YouTube sayfasında bir kez görünen sakin bir şerit gösterir ve tek
// tıklık bir karşılık sunar: Shorts'u günün sonuna kadar gizlemek.
//
// İlkeler: engellemez, videoyu durdurmaz, sayfayı kilitlemez. Şerit Shadow DOM
// içindedir, kullanıcı kapatınca o gün bir daha çıkmaz.
import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import type { BudgetState } from "../shared/types";
import { BRAND_MARK_DATA_URI } from "../shared/brand-assets";

const CHECK_INTERVAL_MS = 60_000;

let host: HTMLElement | null = null;
let timer = 0;
let shortsStyle: HTMLStyleElement | null = null;

/**
 * Shorts'u gizlemek DOM'a dokunmadan, yalnızca CSS ile yapılır: YouTube kartları
 * sürekli yeniden oluşturur, düğüm silmek hem kırılgan hem de sayfayı bozar.
 * Kural kaldırıldığı anda her şey geri gelir.
 */
const SHORTS_HIDE_CSS = `
  ytd-rich-shelf-renderer[is-shorts],
  ytd-reel-shelf-renderer,
  ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
  ytd-rich-item-renderer:has(a[href^="/shorts/"]),
  ytd-video-renderer:has(a[href^="/shorts/"]),
  ytd-compact-video-renderer:has(a[href^="/shorts/"]),
  ytd-guide-entry-renderer:has(a[title="Shorts"]),
  ytd-mini-guide-entry-renderer:has(a[title="Shorts"]) { display: none !important; }
`;

function applyShortsHiding(active: boolean) {
  if (active && !shortsStyle) {
    shortsStyle = document.createElement("style");
    shortsStyle.id = "demirtube-shorts-pause";
    shortsStyle.textContent = SHORTS_HIDE_CSS;
    document.documentElement.append(shortsStyle);
    return;
  }
  if (!active && shortsStyle) {
    shortsStyle.remove();
    shortsStyle = null;
  }
}

function removeNotice() {
  host?.remove();
  host = null;
}

function renderNotice(state: BudgetState) {
  if (host) return;
  const overMinutes = Math.max(0, Math.round(state.seconds / 60) - state.budgetMinutes);

  host = document.createElement("div");
  host.id = "demirtube-budget-guard";
  host.style.cssText = "position:fixed;top:70px;right:18px;z-index:2147483000;";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .card { width:288px; padding:14px 15px; border:1px solid rgba(255,81,72,.35); border-radius:14px;
      background:rgba(12,18,32,.96); color:#f2f4fa; font:500 12px/1.45 Inter,system-ui,sans-serif;
      box-shadow:0 22px 48px rgba(4,7,14,.5); backdrop-filter:blur(8px); }
    .head { display:flex; align-items:center; gap:8px; }
    .head img { width:20px; height:20px; border-radius:6px; }
    .head strong { flex:1; font-size:12.5px; }
    .head button { border:0; background:none; color:rgba(242,244,250,.5); font-size:15px; line-height:1; cursor:pointer; }
    p { margin:9px 0 0; color:rgba(242,244,250,.62); font-size:11.5px; }
    .actions { display:flex; gap:7px; margin-top:12px; }
    .actions button { flex:1; padding:7px 8px; border:1px solid rgba(148,163,184,.24); border-radius:9px;
      background:rgba(255,255,255,.04); color:#f2f4fa; font:600 11px/1.3 Inter,sans-serif; cursor:pointer; }
    .actions button.primary { border-color:transparent; background:linear-gradient(120deg,#8b5cf6,#00c9d4); color:#090d16; }
    .done { margin:12px 0 0; color:#10b981; font-size:11.5px; }
  `;

  const card = document.createElement("div");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "head";
  const mark = document.createElement("img");
  mark.src = BRAND_MARK_DATA_URI;
  mark.alt = "";
  const title = document.createElement("strong");
  title.textContent = "Günlük bütçeni aştın";
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Kapat");
  close.textContent = "×";
  close.addEventListener("click", () => { void dismissForToday(); });
  head.append(mark, title, close);

  const copy = document.createElement("p");
  copy.textContent = `Bugün ${Math.round(state.seconds / 60)} dakika aktif izleme oldu; bütçen ${state.budgetMinutes} dakika (${overMinutes} dk aşım). Karar senin — bu şerit yalnızca hatırlatır.`;

  const actions = document.createElement("div");
  actions.className = "actions";
  const hideShorts = document.createElement("button");
  hideShorts.type = "button";
  hideShorts.className = "primary";
  hideShorts.textContent = "Shorts'u bugünlük gizle";
  hideShorts.addEventListener("click", () => {
    void sendMessage<BudgetState>({ type: "SET_SHORTS_PAUSE", active: true })
      .then((next) => {
        applyShortsHiding(next?.shortsPaused ?? true);
        actions.remove();
        const done = document.createElement("p");
        done.className = "done";
        done.textContent = "Shorts gün sonuna kadar gizlendi. DemirTube popup'ından hemen geri açabilirsin.";
        card.append(done);
      })
      .catch(() => undefined);
  });
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Bugünlük sus";
  dismiss.addEventListener("click", () => { void dismissForToday(); });
  actions.append(hideShorts, dismiss);

  card.append(head, copy, actions);
  shadow.append(style, card);
  document.body.append(host);
}

async function dismissForToday() {
  removeNotice();
  await sendMessage({ type: "DISMISS_BUDGET_NOTICE" }).catch(() => undefined);
}

async function check() {
  try {
    const state = await sendMessage<BudgetState | undefined>({ type: "GET_BUDGET_STATE" });
    if (!state) return;
    applyShortsHiding(state.shortsPaused);
    if (state.exceeded && !state.noticeDismissed) renderNotice(state);
    else if (!state.exceeded) removeNotice();
  } catch (error) {
    if (isExtensionContextInvalidated(error)) stopBudgetGuard();
  }
}

export function startBudgetGuard() {
  void check();
  timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
  return stopBudgetGuard;
}

export function stopBudgetGuard() {
  clearInterval(timer);
  timer = 0;
  removeNotice();
  applyShortsHiding(false);
}
