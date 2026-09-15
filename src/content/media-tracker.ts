// DemirTube · YouTube dışı film/dizi izleyicisi
//
// YouTube hariç her sayfada ve her iframe'de çalışır. Korsan sitelerde oynatıcı
// genellikle başka alan adından gelen bir iframe'in içindedir: o iframe videoyu
// görür ama sayfa başlığını göremez. Bu yüzden betik yalnızca "ne kadar oynadı,
// nerede" bilgisini yollar; başlığı service worker sekmenin kendisinden okur.
//
// Kasıtlı sınırlar: 15 dakikadan kısa videolar (fragman, reklam, klip) sayılmaz,
// sessiz ve otomatik başlayan önizlemeler de oynatma sayılmaz.
import type { MediaProgressReport } from "../media/types";

const TICK_MS = 1_000;
const REPORT_EVERY_MS = 15_000;
const MIN_DURATION_SECONDS = 15 * 60;

type Tracked = { video: HTMLVideoElement; lastTime: number; lastTick: number; pending: number; lastSentAt: number };
let tracked: Tracked | undefined;
let stopped = false;

function isTop() {
  try { return window.top === window; } catch { return false; }
}

function text(selector: string) {
  const value = document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

/** Tanınan platformların oynatıcısında yazan başlık. Seçiciler tutmazsa sayfa başlığına düşülür. */
function platformHints(): Pick<MediaProgressReport, "platformTitle" | "platformSubtitle"> {
  const host = location.hostname;
  if (/netflix\./.test(host)) {
    const box = document.querySelector('[data-uia="video-title"]');
    if (!box) return {};
    const show = box.querySelector("h4")?.textContent?.trim();
    const spans = [...box.querySelectorAll("span")].map((span) => span.textContent?.trim()).filter(Boolean).join(" ");
    return show ? { platformTitle: show, platformSubtitle: spans || undefined } : { platformTitle: box.textContent?.trim() || undefined };
  }
  if (/primevideo\.|amazon\./.test(host)) return { platformTitle: text(".atvwebplayersdk-title-text"), platformSubtitle: text(".atvwebplayersdk-subtitle-text") };
  if (/(?:^|\.)max\.com$|hbomax\./.test(host)) return { platformTitle: text('[data-testid="player-ux-asset-title"]'), platformSubtitle: text('[data-testid="player-ux-season-episode"]') ?? text('[data-testid="player-ux-asset-subtitle"]') };
  if (/disneyplus\./.test(host)) return { platformTitle: text(".title-field"), platformSubtitle: text(".subtitle-field") };
  return {};
}

function candidate(): HTMLVideoElement | undefined {
  let best: HTMLVideoElement | undefined;
  for (const video of document.querySelectorAll("video")) {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < MIN_DURATION_SECONDS) continue;
    if (video.paused || video.readyState < 2) continue;
    if (video.muted && video.currentTime < 5) continue;
    if (!best || duration > best.duration) best = video;
  }
  return best;
}

function send(item: Tracked) {
  const { video } = item;
  const report: MediaProgressReport = {
    ...(isTop() ? platformHints() : {}),
    documentTitle: isTop() ? document.title : "",
    pageUrl: isTop() ? location.href : "",
    site: isTop() ? location.hostname : "",
    position: video.currentTime,
    duration: video.duration,
    watchedDelta: item.pending,
    reportedAt: new Date().toISOString(),
  };
  item.pending = 0;
  item.lastSentAt = Date.now();
  try {
    chrome.runtime.sendMessage({ type: "MEDIA_PROGRESS", report }, () => void chrome.runtime.lastError);
  } catch {
    // Uzantı yeniden yüklendiyse bu sekmedeki betik yetim kaldı; sessizce dur.
    stop();
  }
}

function tick() {
  if (stopped) return;
  if (!globalThis.chrome?.runtime?.id) { stop(); return; }
  const now = Date.now();
  const video = candidate();

  if (tracked && tracked.video !== video) {
    // Durdu, bitti ya da başka videoya geçildi: birikeni hemen yolla.
    if (tracked.pending > 0 || tracked.video.ended) send(tracked);
    tracked = undefined;
  }
  if (!video) return;
  if (!tracked) {
    tracked = { video, lastTime: video.currentTime, lastTick: now, pending: 0, lastSentAt: 0 };
    return;
  }

  const advanced = video.currentTime - tracked.lastTime;
  const elapsed = (now - tracked.lastTick) / 1000;
  // 2x hıza kadar gerçek oynatma; ileri sarma izlenmiş süre sayılmaz.
  if (advanced > 0 && advanced <= elapsed * 2.2 + 0.5) tracked.pending += Math.min(advanced, elapsed * 2.2);
  tracked.lastTime = video.currentTime;
  tracked.lastTick = now;

  if (now - tracked.lastSentAt >= REPORT_EVERY_MS && tracked.pending > 0) send(tracked);
}

let timer: number | undefined;

function stop() {
  stopped = true;
  if (timer !== undefined) clearInterval(timer);
}

function flush() {
  if (tracked && tracked.pending > 0) send(tracked);
}

if (!/(^|\.)youtube\.com$/.test(location.hostname)) {
  timer = window.setInterval(tick, TICK_MS);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  document.addEventListener("pause", (event) => { if (tracked && event.target === tracked.video) flush(); }, true);
}
