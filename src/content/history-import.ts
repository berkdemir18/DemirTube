// DemirTube · geçmiş içe aktarma akışı
//
// Kullanıcı Ayarlar'dan "YouTube geçmişimi oku" dediğinde bir istek bayrağı
// bırakılır ve geçmiş sayfası açılır. Bu modül yalnızca o bayrak varken
// çalışır: sayfayı kendi kendine gezmez, arka planda tarama yapmaz.
//
// Sınırlar bilinçli: en fazla MAX_SCROLLS kaydırma, istenen gün aralığına
// ulaşınca dur. YouTube'un sonsuz kaydırmasında saatlerce dolaşmak ne
// kullanıcıya ne tarayıcıya yapılacak bir şey.
import { isExtensionContextInvalidated, sendMessage } from "../shared/messages";
import type { ImportedHistoryEntry } from "../shared/types";
import { collectHistoryEntries, reachedCutoff, withinDays } from "./history-parser";

export const HISTORY_REQUEST_KEY = "historyImportRequest";

/** Kaç kez "daha fazla yükle" denenecek. Her tur ~20 kart getirir. */
const MAX_SCROLLS = 25;
/** Yeni kart gelmesi için beklenen süre. */
const SCROLL_SETTLE_MS = 900;
/** Üst üste kaç turda yeni kart gelmezse tarama biter. */
const IDLE_ROUNDS = 3;

export type HistoryImportRequest = { days: number; requestedAt: string };

export type HistoryScanResult = {
  entries: ImportedHistoryEntry[];
  scrolls: number;
  reachedEnd: boolean;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Geçmiş sayfasını istenen gün aralığına ulaşana kadar kaydırarak okur.
 * DOM okuması dışında hiçbir şey yapmaz.
 */
export async function scanWatchHistory(days: number, now = new Date()): Promise<HistoryScanResult> {
  let previousCount = 0;
  let idle = 0;
  let scrolls = 0;

  for (; scrolls < MAX_SCROLLS; scrolls += 1) {
    const entries = collectHistoryEntries(document, now);
    if (reachedCutoff(entries, days, now)) {
      return { entries: withinDays(entries, days, now), scrolls, reachedEnd: true };
    }
    if (entries.length === previousCount) {
      idle += 1;
      if (idle >= IDLE_ROUNDS) break;
    } else {
      idle = 0;
      previousCount = entries.length;
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    await wait(SCROLL_SETTLE_MS);
  }

  const entries = collectHistoryEntries(document, now);
  return { entries: withinDays(entries, days, now), scrolls, reachedEnd: false };
}

function showReport(message: string, tone: "ok" | "warn" = "ok") {
  document.querySelector("#demirtube-history-report")?.remove();
  const host = document.createElement("div");
  host.id = "demirtube-history-report";
  host.style.cssText = "position:fixed;top:70px;right:18px;z-index:2147483000;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .card { width:300px; padding:14px 15px; border:1px solid rgba(231,230,227,.16);
      border-left:3px solid ${tone === "ok" ? "#5FD35A" : "#FFB02E"}; border-radius:6px;
      background:rgba(11,12,13,.96); color:#E7E6E3; font:500 13px/1.5 Inter,system-ui,sans-serif; }
    strong { display:block; margin-bottom:5px; font-size:13px; }
    p { margin:0; color:rgba(231,230,227,.62); font-size:12px; }
    button { margin-top:11px; padding:6px 10px; border:1px solid rgba(231,230,227,.18); border-radius:4px;
      background:none; color:#E7E6E3; font:600 12px Inter,sans-serif; cursor:pointer; }
  `;
  const card = document.createElement("div");
  card.className = "card";
  const title = document.createElement("strong");
  title.textContent = "DemirTube · geçmiş okuma";
  const copy = document.createElement("p");
  copy.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Kapat";
  close.addEventListener("click", () => host.remove());
  card.append(title, copy, close);
  shadow.append(style, card);
  document.body.append(host);
}

/**
 * Geçmiş sayfasına girildiğinde bekleyen bir istek varsa taramayı yürütür.
 * İstek bayrağı ilk denemede silinir: kullanıcı sayfayı tekrar açtığında
 * tarama kendiliğinden başlamaz.
 */
export async function runPendingHistoryImport(now = new Date()): Promise<void> {
  if (!location.pathname.startsWith("/feed/history")) return;
  try {
    const request = await sendMessage<HistoryImportRequest | undefined>({ type: "GET_HISTORY_IMPORT_REQUEST" });
    if (!request) return;

    showReport(`Son ${request.days} günün geçmişi okunuyor…`);
    // Sayfanın ilk kartları yerleşsin.
    await wait(1_500);
    const result = await scanWatchHistory(request.days, now);
    if (!result.entries.length) {
      showReport("Geçmiş sayfasında okunabilir kayıt bulunamadı. Geçmiş kapalı olabilir veya sayfa henüz yüklenmemiş olabilir.", "warn");
      return;
    }

    const saved = await sendMessage<{ added: number; skipped: number }>({
      type: "IMPORT_WATCH_HISTORY",
      entries: result.entries,
    });
    showReport(
      `${result.entries.length} kayıt okundu · ${saved?.added ?? 0} video modele eklendi.`
      + (saved?.skipped ? ` ${saved.skipped} kayıt atlandı (zaten kayıtlı veya ilerleme bilgisi okunamadı).` : "")
      + (result.reachedEnd ? "" : " Sayfa sonuna ulaşılamadı; daha eskisi için tekrar çalıştırabilirsin.")
    );
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return;
    showReport("Geçmiş okunamadı. Sayfayı yenileyip tekrar dene.", "warn");
  }
}
