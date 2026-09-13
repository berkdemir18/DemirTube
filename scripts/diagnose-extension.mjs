import { chromium } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const extensionPath = resolve("dist");
const profile = await mkdtemp(join(tmpdir(), "demirtube-diagnose-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: "C:/Users/Berk/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe",
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const errors = [];
try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;
  worker.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(`worker ${message.type()}: ${message.text()}`); });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`page error: ${error.stack || error.message}`));
  page.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(`page ${message.type()}: ${message.text()}`); });
  await page.route("https://www.youtube.com/**", route => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><title>DemirTube Tanı - YouTube</title><meta property="og:title" content="DemirTube Tanı"><meta name="description" content="Programlama eğitimi"><style>body{background:#0f0f0f;color:white}#secondary{width:400px;margin-left:auto}</style></head><body><div id="secondary"><div id="secondary-inner"></div></div><ytd-watch-metadata><h1><yt-formatted-string>DemirTube Tanı</yt-formatted-string></h1><ytd-video-owner-renderer><ytd-channel-name><a href="/@test">Test Kanalı</a></ytd-channel-name></ytd-video-owner-renderer></ytd-watch-metadata><video class="html5-main-video"></video></body></html>`,
  }));
  await page.addInitScript(() => Object.defineProperties(HTMLMediaElement.prototype, {
    duration: { configurable: true, get: () => 600 }, currentTime: { configurable: true, get: () => 15, set: () => undefined }, paused: { configurable: true, get: () => false }, readyState: { configurable: true, get: () => 4 },
  }));
  await page.goto("https://www.youtube.com/watch?v=diagnose1");
  await page.waitForTimeout(12_000);
  const state = await page.evaluate(() => ({ panel: Boolean(document.querySelector("#demirtube-panel-host")) }));
  console.log(JSON.stringify({ extensionId, state, errors }, null, 2));
  if (!state.panel || errors.length) process.exitCode = 1;
} finally {
  await context.close();
}
