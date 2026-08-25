// Depodaki README görselini üretir: dashboard'ın Genel Bakış ekranı.
// Geliştirme sunucusu örnek veriyle çalışır; gerçek izleme geçmişi kullanılmaz.
import { chromium } from "playwright";

const url = process.env.DASHBOARD_URL ?? "http://localhost:5174/dashboard.html#/overview";
const out = process.env.OUT ?? "docs/dashboard.png";

// Playwright'ın kendi indirdiği tarayıcı yoksa `PW_CHROME` ile bir Chromium
// yürütülebiliri verilebilir; görsel üretimi tarayıcı sürümüne duyarlı değil.
const executablePath = process.env.PW_CHROME || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle" });

// İlk açılış tanıtımı ekranı kaplıyor; görsel için kapatılır.
const close = page.locator('button.onboarding-close');
if (await close.count()) {
  await close.first().click();
  await page.waitForSelector(".onboarding-backdrop", { state: "detached", timeout: 5_000 });
}

// Grafiklerin animasyonu bitsin.
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`yazıldı: ${out}`);
