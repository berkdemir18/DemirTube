import { chromium, expect, test } from "@playwright/test";
import { access, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("MV3 paketi açılır ve tüm YouTube rotasındaki içerik betiği watch sayfasına panel ekler", async () => {
  const profile = await mkdtemp(join(tmpdir(), "demirtube-playwright-"));
  const extensionPath = resolve("dist");
  const executablePath = await findChromiumExecutable();
  const context = await chromium.launchPersistentContext(profile, {
    // Chrome currently ignores --load-extension in standard headless mode.
    headless: false,
    executablePath,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  try {
    await context.addInitScript(() => {
      Object.defineProperties(HTMLMediaElement.prototype, {
        duration: { configurable: true, get: () => 600 },
        currentTime: { configurable: true, get: () => 15, set: () => undefined },
        paused: { configurable: true, get: () => false },
        readyState: { configurable: true, get: () => 4 }
      });
    });
    let worker = context.serviceWorkers().find((item) => item.url().startsWith("chrome-extension://"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
    const extensionId = new URL(worker.url()).host || await readExtensionId(profile, extensionPath);
    const dashboard = await context.newPage();
    const runtimeErrors: string[] = [];
    const captureErrors = (page: import("@playwright/test").Page) => {
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
    };
    captureErrors(dashboard);
    await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
    await expect(dashboard.getByRole("heading", { name: "Veri sende kalır" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Devam" }).click();
    await dashboard.getByRole("button", { name: "Devam" }).click();
    await dashboard.getByRole("button", { name: "DemirTube’u kullan" }).click();
    await expect(dashboard.getByRole("heading", { name: "İzleme ritmin burada oluşacak" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Akıllı Merkez" }).click();
    await expect(dashboard.getByRole("heading", { name: "Akıllı Merkez" })).toBeVisible();
    await dashboard.getByRole("button", { name: "İzleme Yolculuğu" }).click();
    await expect(dashboard.getByRole("heading", { name: "İzleme Yolculuğu" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Kişisel Hedefler" }).click();
    await expect(dashboard.getByRole("heading", { name: "Kişisel Hedefler" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Analizler", exact: true }).click();
    await dashboard.getByRole("button", { name: "Shorts Analizi" }).click();
    await expect(dashboard.getByRole("heading", { name: "Shorts Analizi" })).toBeVisible();
    await dashboard.getByRole("button", { name: "İzleme Zamanları" }).click();
    await expect(dashboard.getByRole("heading", { name: "İzleme Zamanları" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Geçmiş", exact: true }).click();
    await dashboard.getByRole("button", { name: "İzleme Takvimi" }).click();
    await expect(dashboard.getByRole("heading", { name: "İzleme Takvimi" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Geri Bildirim" }).click();
    await expect(dashboard.getByRole("heading", { name: "Geri Bildirim Merkezi" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Raporlar", exact: true }).click();
    await dashboard.getByRole("button", { name: "Karşılaştır" }).click();
    await expect(dashboard.getByRole("heading", { name: "Karşılaştır" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Ayarlar" }).click();
    await expect(dashboard.getByRole("heading", { name: "Ayarlar" })).toBeVisible();
    await expect(dashboard.getByRole("heading", { name: "Groq ücretsiz AI (Gemini değil)" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Analizler", exact: true }).click();
    await dashboard.getByRole("button", { name: "Kanallar" }).click();
    await expect(dashboard.getByRole("heading", { name: "Kanallar" })).toBeVisible();
    await dashboard.getByRole("button", { name: "İstatistikler" }).click();
    await expect(dashboard.getByRole("heading", { name: "İstatistikler" })).toBeVisible();
    await dashboard.locator(".compare-toggle").click();
    await expect(dashboard.getByLabel("Önceki dönem karşılaştırması")).toBeVisible();

    // Hash yönlendirmesi: gezinme adrese yazılır, yenilemede aynı ekran açılır,
    // geri tuşu önceki sayfaya döner.
    expect(new URL(dashboard.url()).hash).toMatch(/^#\/statistics\?period=/);
    await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/channels?period=month&at=2026-07-28`);
    await expect(dashboard.getByRole("heading", { name: "Kanallar" })).toBeVisible();
    await expect(dashboard.getByRole("button", { name: "Aylık" })).toHaveAttribute("aria-pressed", "true");
    await dashboard.reload();
    await expect(dashboard.getByRole("heading", { name: "Kanallar" })).toBeVisible();
    await dashboard.getByRole("button", { name: "Konular" }).click();
    await expect(dashboard.getByRole("heading", { name: "Konular" })).toBeVisible();
    await dashboard.goBack();
    await expect(dashboard.getByRole("heading", { name: "Kanallar" })).toBeVisible();
    await dashboard.setViewportSize({ width: 390, height: 844 });
    await expect(dashboard.getByRole("button", { name: "Menüyü aç" })).toBeVisible();

    const youtube = await context.newPage();
    captureErrors(youtube);
    await youtube.route("https://www.youtube.com/**", (route) => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><title>Test Video - YouTube</title><meta property="og:title" content="Test Video"><meta name="description" content="Programlamayı adım adım öğreten uygulamalı rehber #typescript"><style>body{margin:0;background:#0f0f0f;color:white}#secondary{width:400px;margin-left:auto;padding:16px}</style></head><body><ytd-search><div id="header"></div></ytd-search><ytd-rich-item-renderer><yt-lockup-view-model><div class="ytLockupViewModelMetadata"><div class="ytLockupMetadataViewModelTextContainer"><h3 style="overflow:hidden"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=feed-smart">TypeScript nasıl öğrenilir rehberi</a></h3><div class="ytLockupMetadataViewModelMetadata"><div class="ytContentMetadataViewModelMetadataRow">Test Kanalı</div></div></div><div class="ytBadgeShapeText">12:30</div></div></yt-lockup-view-model></ytd-rich-item-renderer><ytd-rich-item-renderer><yt-lockup-view-model><div class="ytLockupViewModelMetadata"><div class="ytLockupMetadataViewModelTextContainer"><h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=feed-second">Ücretsiz kod asistanı incelemesi</a></h3><div class="ytContentMetadataViewModelMetadataRow">Başka Kanal</div></div><div class="ytBadgeShapeText">08:40</div></div></yt-lockup-view-model></ytd-rich-item-renderer><div id="secondary"><div id="secondary-inner"></div></div><ytd-watch-metadata><h1><yt-formatted-string>Test Video</yt-formatted-string></h1><ytd-video-owner-renderer><ytd-channel-name><a href="/@test">Test Kanalı</a></ytd-channel-name></ytd-video-owner-renderer></ytd-watch-metadata><ytd-transcript-segment-renderer><span class="segment-timestamp">0:00</span><span class="segment-text">TypeScript ile güvenli programlama ve uygulama mimarisini anlatıyoruz.</span></ytd-transcript-segment-renderer><ytd-transcript-segment-renderer><span class="segment-timestamp">0:45</span><span class="segment-text">Bu rehberde TypeScript tipleri ve programlama örnekleri yapıyoruz.</span></ytd-transcript-segment-renderer><video class="html5-main-video"></video></body></html>`
    }));
    await youtube.goto("https://www.youtube.com/");
    await expect(youtube.locator(".demirtube-feed-badge").first()).toBeVisible({ timeout: 15_000 });
    await expect(youtube.locator(".demirtube-feed-analysis")).toHaveCount(2);
    await expect(youtube.locator(".demirtube-feed-ring").first()).toBeVisible();
    const firstFeedCard = youtube.locator("ytd-rich-item-renderer").first();
    await firstFeedCard.locator(".demirtube-feed-badge").evaluate((badge) => badge.remove());
    await expect(firstFeedCard.locator(".demirtube-feed-badge")).toBeVisible({ timeout: 10_000 });
    await firstFeedCard.locator(".demirtube-feed-analysis").evaluate((wrapper) => wrapper.remove());
    await expect(firstFeedCard.locator(".demirtube-feed-badge")).toBeVisible({ timeout: 10_000 });
    await youtube.locator(".demirtube-feed-badge").first().hover();
    const visibleFeedSummary = youtube.locator(".dt-feed-mini-summary.mini-open");
    await expect(visibleFeedSummary).toBeVisible();
    await expect(visibleFeedSummary).toContainText("Tahmini aktif süre");
    expect(await youtube.locator(".demirtube-feed-ring").first().evaluate((element) => element.getBoundingClientRect().width)).toBe(34);
    await youtube.locator(".demirtube-feed-badge").first().click();
    await expect(youtube.locator(".demirtube-feed-detail").first()).toBeVisible();
    await expect(youtube.getByText("Veri yetersiz · puan yok").first()).toBeVisible();
    await youtube.locator(".demirtube-feed-badge").nth(1).click();
    await expect(youtube.locator(".demirtube-feed-detail:visible")).toHaveCount(1);
    expect(await youtube.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await youtube.evaluate(() => {
      const compact = document.createElement("ytd-compact-video-renderer");
      compact.innerHTML = `<div id="details"><a id="video-title" href="/watch?v=feed-rail">Sağ sütun teknoloji önerisi</a><div id="channel-name">Test Kanalı</div><span class="ytBadgeShapeText">11:20</span></div>`;
      document.querySelector("#secondary-inner")?.append(compact);
    });
    const railBadge = youtube.locator("ytd-compact-video-renderer .demirtube-feed-badge");
    await expect(railBadge).toBeVisible({ timeout: 10_000 });
    await railBadge.hover();
    const railSummary = youtube.locator(".dt-feed-mini-summary[data-placement='left']");
    await expect(railSummary).toBeVisible();
    const railPositions = await Promise.all([
      railBadge.boundingBox(),
      railSummary.boundingBox()
    ]);
    expect(railPositions[1]!.x + railPositions[1]!.width).toBeLessThanOrEqual(railPositions[0]!.x);
    await youtube.evaluate(() => {
      history.pushState({}, "", "/watch?v=demirtube-a");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await expect(youtube.locator("#demirtube-panel-host")).toBeAttached({ timeout: 15_000 });
    const panel = youtube.locator("#demirtube-panel-host");
    const initialPanelHost = await panel.elementHandle();
    await youtube.waitForTimeout(2_500);
    expect(await panel.evaluate((element, initial) => element === initial, initialPanelHost)).toBe(true);
    await expect(panel.locator(".dt-score-label > small")).toHaveText("Sana uygunluk");
    await expect(panel.locator(".dt-live-status")).toBeVisible();
    await expect(panel.locator(".dt-live-status")).toContainText(/Sayılıyor|Duraklatıldı|Video yükleniyor|Konum değiştiriliyor/);
    await panel.getByLabel("Sana uygunluk hakkında bilgi").evaluate((element) => (element as HTMLElement).click());
    await expect(panel.locator(".dt-score-label .dt-info")).toHaveAttribute("open", "");
    await expect(panel.getByText("Kanal, konu, süre, başlık ve doğrulanmış video formatı sinyalleri")).toBeVisible();
    await panel.getByLabel("Sana uygunluk hakkında bilgi").evaluate((element) => (element as HTMLElement).click());
    await panel.getByRole("button", { name: /Bir şey öğren/ }).click();
    await expect(panel.getByRole("button", { name: /Bir şey öğren/ })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("button", { name: "Ayrıntıları gör" })).toBeVisible();
    await panel.getByRole("button", { name: "Ayrıntıları gör" }).click();
    const contentTab = panel.getByRole("tab", { name: "İçerik" });
    await contentTab.evaluate((element) => (element as HTMLElement).click());
    await expect(contentTab).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByText("Bu videodan ne beklemelisin?")).toBeVisible();
    await expect(panel.getByLabel("Video formatını doğrula")).toBeVisible();
    await panel.getByRole("button", { name: "Paneli daralt" }).evaluate((element) => (element as HTMLElement).click());
    await expect(panel.getByRole("button", { name: "Paneli genişlet" })).toBeVisible();
    await panel.getByRole("button", { name: "Paneli genişlet" }).evaluate((element) => (element as HTMLElement).click());
    await panel.getByRole("button", { name: "Paneli daralt" }).evaluate((element) => (element as HTMLElement).click());
    await expect(panel.getByRole("button", { name: "Paneli genişlet" })).toBeVisible();
    await panel.getByRole("button", { name: "Paneli genişlet" }).evaluate((element) => (element as HTMLElement).click());
    await panel.getByRole("button", { name: /Odaklan/ }).click();
    await expect(panel.getByRole("button", { name: /Odaklan/ })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("button", { name: "Paneli daralt" })).toBeVisible();
    await panel.getByLabel("İzleme niyeti hakkında bilgi").click();
    await expect(panel.getByText("Bu seçim videonun kalitesini değiştirmez")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Paneli daralt" })).toBeVisible();
    await panel.getByRole("button", { name: "Faydalı" }).evaluate((element) => (element as HTMLElement).click());

    await youtube.evaluate(() => {
      history.pushState({}, "", "/results?search_query=test");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await expect(youtube.locator("#demirtube-panel-host")).toHaveCount(0);
    await expect(youtube.locator("#demirtube-filter-bar")).toBeVisible();
    await expect(youtube.locator("#demirtube-filter-bar")).toContainText("Arama pusulası");
    await expect(youtube.locator("#demirtube-filter-bar")).toContainText("Kişisel puan");
    await expect(youtube.locator("#demirtube-filter-bar")).toContainText("Şu an görünen");
    await expect(youtube.locator("#demirtube-filter-bar")).toContainText("yeterli geçmiş yok");
    await youtube.evaluate(() => {
      history.pushState({}, "", "/watch?v=demirtube-b");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await expect(youtube.locator("#demirtube-panel-host")).toBeAttached({ timeout: 15_000 });
    await youtube.evaluate(() => window.dispatchEvent(new Event("yt-navigate-finish")));
    await youtube.waitForTimeout(200);
    await youtube.evaluate(() => {
      (window as typeof window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = { videoDetails: { lengthSeconds: "600" } };
      const duration = document.createElement("meta"); duration.setAttribute("itemprop", "duration"); duration.content = "PT10M"; document.head.append(duration);
      const reel = document.createElement("ytd-reel-video-renderer"); reel.setAttribute("is-active", "");
      reel.innerHTML = `<ytd-reel-player-header-renderer><div id="channel-name"><a href="/@shortkanal">Short Kanal</a></div><h2>Uzayda Mars görevi</h2></ytd-reel-player-header-renderer><img src="https://yt3.ggpht.com/channel-photo"><video class="html5-main-video"></video>`;
      document.body.append(reel);
    });
    await youtube.evaluate(() => {
      history.pushState({}, "", "/shorts/demirtube-short");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await expect(youtube.locator("#demirtube-panel-host")).toBeAttached({ timeout: 15_000 });
    await expect.poll(async () => dashboard.evaluate(async () => {
      const state = await chrome.storage.local.get("contentScriptState");
      return state.contentScriptState;
    })).toBe("İzleniyor: demirtube-short");
    await youtube.evaluate(() => {
      history.pushState({}, "", "/");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await expect(youtube.locator("#demirtube-panel-host")).toHaveCount(0);

    type StoredData = {
      sessions: Array<{ videoId: string }>;
      feedback: Array<{ videoId: string; liked?: boolean }>;
      videos: Array<{ videoId: string; contentType: string; description?: string; topics: string[]; channelName: string; durationSeconds: number }>;
    };
    await expect.poll(async () => {
      const stored = await dashboard.evaluate(async () => chrome.runtime.sendMessage({ type: "GET_DATA" })) as StoredData;
      return stored.sessions.filter((session) => session.videoId === "demirtube-short").length;
    }).toBe(1);
    const data = await dashboard.evaluate(async () => chrome.runtime.sendMessage({ type: "GET_DATA" })) as StoredData;
    expect(data.sessions.filter((session) => session.videoId === "demirtube-a")).toHaveLength(1);
    expect(data.feedback).toContainEqual(expect.objectContaining({ videoId: "demirtube-a", liked: true }));
    expect(data.sessions.filter((session) => session.videoId === "demirtube-short")).toHaveLength(1);
    expect(data.videos).toContainEqual(expect.objectContaining({ videoId: "demirtube-short", contentType: "short", channelName: "Short Kanal", durationSeconds: 600 }));
    expect(data.videos).toContainEqual(expect.objectContaining({ videoId: "demirtube-a", topics: expect.arrayContaining(["Programlama"]) }));

    await dashboard.setViewportSize({ width: 1600, height: 900 });
    await dashboard.reload();
    await dashboard.getByRole("button", { name: "Bugün", exact: true }).click();
    await dashboard.getByLabel("İzleme süresi hakkında bilgi").click();
    const tooltipHeading = dashboard.locator(".overview-primary-metrics .info-tip-popover strong").first();
    await expect(tooltipHeading).toBeVisible();
    expect(await tooltipHeading.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(14);
    await dashboard.getByLabel("Ortalama tamamlama hakkında bilgi").click();
    await expect(dashboard.locator(".overview-primary-metrics .info-tip[open]")).toHaveCount(1);
    await dashboard.getByRole("button", { name: "Raporlar", exact: true }).click();
    await dashboard.getByRole("button", { name: "Haftalık Rapor" }).click();
    await expect(dashboard.getByRole("heading", { name: "Bu hafta sende ne değişti?" })).toBeVisible();
    await expect(dashboard.locator(".weekly-insight-list article")).toHaveCount(4);

    await youtube.evaluate(() => {
      const header = document.createElement("yt-page-header-renderer");
      header.style.paddingTop = "100px";
      header.innerHTML = "<h1>Test Kanalı</h1>";
      document.body.prepend(header);
      const channelVideos = document.createElement("main");
      channelVideos.style.height = "1800px";
      channelVideos.setAttribute("aria-label", "Kanal videoları");
      document.body.append(channelVideos);
      history.pushState({}, "", "/@test");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await expect(youtube.locator("#demirtube-channel-badge")).toBeVisible({ timeout: 10_000 });
    await expect(youtube.locator("#demirtube-channel-badge")).toContainText("Bu kanalla hafızan");
    await expect(youtube.locator("#demirtube-channel-badge")).toContainText("Kanal kalite puanı değildir");
    await expect(youtube.locator("#demirtube-channel-badge")).toContainText("Düşük örneklem");
    await expect(youtube.locator("#demirtube-channel-badge")).toContainText("Video başına");
    await expect(youtube.locator("#demirtube-channel-badge")).toContainText("tekrar sinyali");
    await youtube.evaluate(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("#demirtube-channel-badge button")]
        .find((item) => item.textContent?.trim() === "30 gün");
      if (!button) throw new Error("30 gün kanal aralığı düğmesi bulunamadı.");
      button.click();
    });
    await expect.poll(() => youtube.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>("#demirtube-channel-badge button")]
        .find((item) => item.textContent?.trim() === "30 gün")?.getAttribute("aria-pressed")
    )).toBe("true");
    await youtube.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(youtube.locator("#demirtube-channel-badge")).toHaveClass(/dt-channel-hidden/);
    await expect(youtube.locator("#demirtube-channel-badge")).toHaveAttribute("aria-hidden", "true");
    await youtube.evaluate(() => window.scrollTo(0, 0));
    await expect(youtube.locator("#demirtube-channel-badge")).not.toHaveClass(/dt-channel-hidden/);

    const popup = await context.newPage();
    captureErrors(popup);
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByText("DemirTube", { exact: true })).toBeVisible();
    // YouTube aynı oturumda kartları yeniden kullanabildiği için etkin rozet sayısı
    // rota geçişleri sonunda sabit bir sayıya bağlı değildir; durumun aktif kalması önemlidir.
    await expect(popup.getByText(/\d+ kart analiz edildi\./)).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

async function findChromiumExecutable() {
  const preferred = chromium.executablePath();
  try { await access(preferred); return preferred; } catch { /* başka yerel Playwright sürümüne bak */ }
  const cache = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const directories = (await readdir(cache, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => entry.name)
    .toSorted()
    .reverse();
  for (const directory of directories) {
    const candidate = join(cache, directory, "chrome-win64", "chrome.exe");
    try { await access(candidate); return candidate; } catch { /* sıradaki sürüm */ }
  }
  throw new Error("Playwright Chromium yürütücüsü bulunamadı.");
}

async function readExtensionId(profile: string, extensionPath: string) {
  const preferencesPaths = [
    join(profile, "Default", "Secure Preferences"),
    join(profile, "Default", "Preferences")
  ];
  const expected = resolve(extensionPath);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      for (const preferencesPath of preferencesPaths) {
        const preferences = JSON.parse(await readFile(preferencesPath, "utf8")) as {
          extensions?: { settings?: Record<string, { path?: string }> }
        };
        const match = Object.entries(preferences.extensions?.settings ?? {})
          .find(([, value]) => value.path && resolve(value.path) === expected);
        if (match) return match[0];
      }
    } catch {
      // Chrome ilk açılışta Preferences dosyasını oluştururken kısa süre beklenebilir.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Chrome profilinde yüklenen DemirTube uzantısı bulunamadı.");
}
