// DemirTube · uzantı ikonlarını favicon.svg'den üretir.
//
// Chrome araç çubuğu ve uzantı listesi PNG ister; marka işareti değişince bu
// dosyalar elle güncellenmediği için eski logo kalıyordu. Ek bir görüntü
// bağımlılığı yerine, projede zaten bulunan Playwright Chromium'u kullanıp
// SVG'yi her boyutta çizip kaydediyoruz.
//
//   node scripts/render-icons.mjs
import { chromium } from "@playwright/test";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SIZES = [16, 32, 48, 128];

async function findChromium() {
  const preferred = chromium.executablePath();
  try { await access(preferred); return preferred; } catch { /* başka sürüme bak */ }
  const cache = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const directories = (await readdir(cache, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => entry.name)
    .toSorted()
    .reverse();
  for (const directory of directories) {
    const candidate = join(cache, directory, "chrome-win64", "chrome.exe");
    try { await access(candidate); return candidate; } catch { /* sıradaki */ }
  }
  throw new Error("Playwright Chromium bulunamadı; `npx playwright install chromium` çalıştır.");
}

const svg = await readFile("public/favicon.svg", "utf8");
const browser = await chromium.launch({ headless: true, executablePath: await findChromium() });
const page = await browser.newPage();

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">
       <div style="width:${size}px;height:${size}px">${svg.replace("<svg", `<svg width="${size}" height="${size}"`)}</div>
     </body></html>`
  );
  const png = await page.screenshot({ omitBackground: true });
  await writeFile(`public/icon-${size}.png`, png);
  console.log(`public/icon-${size}.png yazıldı (${png.length} bayt)`);
}

await browser.close();
