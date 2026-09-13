import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", error => console.log("PAGE ERROR", error.message));
  await page.goto("http://127.0.0.1:5174/dashboard.html");
  const data = await page.evaluate(async () => (await import("/src/dashboard/seed-data.ts")).seedData);
  await page.addInitScript(data => {
    let items = data.videos.slice(0, 6).map(video => ({ ...video, addedAt: video.firstSeenAt }));
    window.chrome = { runtime: { id: "ui-fixture", getManifest: () => ({ version: "test" }), sendMessage: (message, callback) => {
      let result;
      if (message.type === "GET_DATA") result = data;
      else if (message.type === "GET_DATA_HEALTH") result = { lost: false };
      else if (message.type === "WATCHLIST_GET") result = items;
      else if (message.type === "WATCHLIST_ARCHIVE_GET") result = [];
      else if (message.type === "WATCHLIST_PRESENTATION") result = items.map((item, index) => ({ videoId: item.videoId, score: index ? 80 - index * 8 : undefined, label: "Uyumlu seçim" }));
      else if (message.type === "SET_SETTINGS") { data.settings = message.settings; result = message.settings; }
      else if (message.type === "WATCHLIST_UPDATE") { items = items.map(item => item.videoId === message.videoId ? { ...item, ...message.patch } : item); result = items; }
      else if (message.type === "WATCHLIST_REMOVE") { items = items.filter(item => item.videoId !== message.videoId); result = items; }
      callback?.(result);
    } }, storage: { onChanged: { addListener() {}, removeListener() {} } } };
  }, data);
  await page.goto("http://127.0.0.1:5174/dashboard.html#/watchlist");
  await page.reload();
  const close = page.getByRole("button", { name: "Tanıtımı kapat" });
  if (await close.count()) await close.click();
  await page.locator(".saved-video").first().waitFor({ timeout: 10000 }).catch(async error => { console.log((await page.locator("body").innerText()).slice(0,2500)); throw error; });
  if (await page.locator(".saved-video").count() !== 6) throw Error("Missing cards");
  await page.getByLabel("Listemde ara").fill("no-result-xyz");
  if (await page.locator(".saved-video").count()) throw Error("Search failed");
  await page.getByLabel("Listemde ara").fill("");
  await mkdir("work", { recursive: true });
  await page.screenshot({ path: "work/library-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error("Mobile overflow");
  await page.screenshot({ path: "work/library-mobile.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5174/dashboard.html#/analysis");
  await page.locator(".analysis-tile").first().waitFor();
  if (await page.locator(".analysis-tile").count() !== 8) throw Error("Missing analysis links");
  await page.screenshot({ path: "work/analysis-desktop.png", fullPage: true, animations: "disabled" });
  await page.locator('.analysis-tile[href^="#/topics"]').click();
  await page.getByRole("heading", { name: "Konular", exact: true }).waitFor();
  for (const route of ["analysis", "topics", "statistics", "cost", "durations", "time", "titles", "shorts"]) {
    await page.goto("http://127.0.0.1:5174/dashboard.html#/" + route);
    await page.locator(route === "analysis" ? ".analysis-category" : ".analysis-guide").first().waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(250);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) { console.log(await page.evaluate(() => [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({ cls:e.className, tag:e.tagName, w:e.getBoundingClientRect().width })).slice(0,15))); console.log(await page.evaluate(() => [...document.querySelectorAll(".analysis-readable,.table-wrap,.page,.app-main")].map(e=>({c:e.className,w:e.getBoundingClientRect().width,sw:e.scrollWidth,overflow:getComputedStyle(e).overflowX,display:getComputedStyle(e).display})))); throw Error(route + " overflow at " + width); }
      await page.screenshot({ path: "work/" + route + "-" + width + ".png", fullPage: true, animations: "disabled" });
    }
  }
  console.log("PASS: cards, search, 390px overflow, analysis links (fixture data; no live extension scoring).");
} finally { await browser.close(); }
