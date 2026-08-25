// DemirTube · YouTube izleme geçmişi ayrıştırıcısı
//
// Yeni kullanıcının ilk günleri boş: model en az beş video görene kadar tahmin
// üretemiyor. Oysa kullanıcının geçmişi YouTube'da zaten duruyor. Bu modül,
// kullanıcının kendi isteğiyle açtığı `youtube.com/feed/history` sayfasındaki
// kartları okur ve soğuk başlangıcı kapatacak kanıta çevirir.
//
// Neden API değil: YouTube Data API izleme geçmişini artık hiçbir uçtan
// vermiyor (watch-history playlist'i ve activities uç noktası kaldırıldı).
// Geriye kullanıcının kendi tarayıcısındaki kendi sayfası kalıyor.
//
// Buradaki her şey saf DOM okumasıdır: ağ isteği yok, sayfaya müdahale yok,
// hiçbir veri dışarı gitmez. Tarama yalnızca kullanıcı açıkça başlattığında
// çalışır (bkz. history-import.ts).
import { classifyContentType } from "../analytics/content-type";
import { classifyTopics } from "../analytics/topic-classifier";
import { normalizeChannelName, UNKNOWN_CHANNEL, usableTitle } from "../shared/utils";
import type { ImportedHistoryEntry } from "../shared/types";

const CARD_SELECTOR = "ytd-video-renderer, ytd-grid-video-renderer, ytm-video-with-context-renderer, yt-lockup-view-model";

const TITLE_SELECTOR =
  'a#video-title-link, a#video-title, a.ytLockupMetadataViewModelTitle, a.yt-lockup-metadata-view-model__title, a[href*="/watch?v="], a[href^="/shorts/"]';

const DURATION_SELECTOR =
  "ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text, .ytBadgeShapeText, #time-status";

/** "12:30" veya "1:02:30" → saniye. Okunamazsa 0. */
export function parseDurationLabel(label: string): number {
  const parts = label.trim().split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Geçmiş sayfası her kartın küçük resminde kaldığın yeri kırmızı bir çubukla
 * gösterir; genişliği yüzde olarak yazılıdır. Tamamlanma tahmini için elimizdeki
 * tek gerçek sinyal budur.
 */
export function parseProgressPercent(card: Element): number | undefined {
  const bar = card.querySelector<HTMLElement>(
    "#progress, .ytd-thumbnail-overlay-resume-playback-renderer, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment"
  );
  if (!bar) return undefined;
  // `style.width` doğrudan "45%" verir; `style` niteliği ise "width: 45%".
  const inline = bar.style?.width ?? "";
  const raw = /^\s*([\d.]+)%\s*$/.exec(inline)?.[1]
    ?? /width:\s*([\d.]+)%/.exec(bar.getAttribute("style") ?? "")?.[1];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

const RELATIVE_LABELS: Array<{ pattern: RegExp; daysAgo: number }> = [
  { pattern: /^(bugün|today)$/i, daysAgo: 0 },
  { pattern: /^(dün|yesterday)$/i, daysAgo: 1 },
];

const TURKISH_MONTHS = ["oca", "şub", "mar", "nis", "may", "haz", "tem", "ağu", "eyl", "eki", "kas", "ara"];
const ENGLISH_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Bölüm başlığını tarihe çevirir: "Bugün", "Dün", "22 Ağu 2026", "Aug 22, 2026".
 * Çözülemeyen başlık için undefined döner; o bölüm tarihsiz sayılır.
 */
export function parseHistoryDateLabel(label: string, now = new Date()): Date | undefined {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text) return undefined;

  for (const { pattern, daysAgo } of RELATIVE_LABELS) {
    if (pattern.test(text)) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12);
    }
  }

  const normalized = text.toLocaleLowerCase("tr-TR");
  // "22 Ağu 2026" / "22 Ağustos 2026"
  const turkish = /^(\d{1,2})\s+([a-zçğıöşü]+)\s*(\d{4})?$/.exec(normalized);
  if (turkish) {
    const month = TURKISH_MONTHS.findIndex((name) => turkish[2].startsWith(name));
    if (month >= 0) {
      return new Date(Number(turkish[3] ?? now.getFullYear()), month, Number(turkish[1]), 12);
    }
  }

  // "Aug 22, 2026"
  const english = /^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?$/.exec(text.toLowerCase());
  if (english) {
    const month = ENGLISH_MONTHS.findIndex((name) => english[1].startsWith(name));
    if (month >= 0) {
      return new Date(Number(english[3] ?? now.getFullYear()), month, Number(english[2]), 12);
    }
  }

  return undefined;
}

/** Bölümün tarih başlığını okur. */
function sectionLabel(section: Element): string {
  const header = section.querySelector<HTMLElement>('[id="title"], [id="header"] [id="title"], .macro-markers-header, h2, h3');
  return header?.textContent ?? "";
}

function readChannelName(card: Element): string {
  const links = card.querySelectorAll<HTMLAnchorElement>(
    '#channel-name a, .ytd-channel-name a, a[href*="/@"], a[href*="/channel/"]'
  );
  for (const link of links) {
    const name = normalizeChannelName(link.textContent ?? "");
    if (name) return name;
  }
  const row = card.querySelector<HTMLElement>(
    "#channel-name, .ytd-channel-name, .ytContentMetadataViewModelMetadataRow, .yt-content-metadata-view-model__metadata-row"
  );
  return normalizeChannelName(row?.textContent ?? "") || UNKNOWN_CHANNEL;
}

/** Tek bir geçmiş kartını okunabilir kayda çevirir; okunamazsa null. */
export function parseHistoryCard(card: Element, watchedAt?: Date): ImportedHistoryEntry | null {
  // Kartta videoya giden birden çok bağlantı var: küçük resim (metinsiz) ve
  // başlık. CSS seçici listesi belge sırasına göre eşleştiği için ilk bulunan
  // genellikle küçük resimdir; başlığı olan bağlantıyı ayrıca aramak gerekir.
  const links = [...card.querySelectorAll<HTMLAnchorElement>(TITLE_SELECTOR)];
  const titleLink = links.find((candidate) =>
    usableTitle(candidate.textContent ?? candidate.getAttribute("title") ?? ""));
  const href = (titleLink ?? links[0])?.getAttribute("href") ?? "";
  if (!href) return null;

  const url = new URL(href, "https://www.youtube.com");
  const isShort = url.pathname.startsWith("/shorts/");
  const videoId = url.searchParams.get("v") ?? (isShort ? url.pathname.split("/").filter(Boolean)[1] ?? "" : "");
  if (!videoId) return null;

  const title = usableTitle(titleLink?.textContent ?? titleLink?.getAttribute("title") ?? "");
  if (!title) return null;

  const channelName = readChannelName(card);
  const durationLabel = card.querySelector<HTMLElement>(DURATION_SELECTOR)?.textContent ?? "";
  const durationSeconds = parseDurationLabel(durationLabel);
  const progressPercent = parseProgressPercent(card);

  return {
    videoId,
    title,
    channelName,
    url: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
    durationSeconds,
    progressPercent,
    watchedAt: watchedAt?.toISOString(),
    contentType: classifyContentType({ path: url.pathname, durationSeconds, title, channelName, isLive: false }),
    topics: classifyTopics(title, channelName),
  };
}

/**
 * Geçmiş sayfasının tamamını okur. Sayfa tarih başlıklı bölümlere ayrılmıştır;
 * her bölümün başlığı o bölümdeki kartların tarihini verir.
 */
export function collectHistoryEntries(root: ParentNode, now = new Date()): ImportedHistoryEntry[] {
  const entries: ImportedHistoryEntry[] = [];
  const seen = new Set<string>();
  const sections = [...root.querySelectorAll("ytd-item-section-renderer")];
  const scopes: Array<{ scope: ParentNode; watchedAt?: Date }> = sections.length
    ? sections.map((section) => ({
      scope: section,
      // Kimlik seçicisi yerine nitelik seçicisi: geçmiş sayfasında her bölümün
      // kendi `id="title"` başlığı var, yani belgede aynı kimlik defalarca
      // geçiyor. `#title` bazı uygulamalarda belgedeki İLK eşleşmeyi bulup
      // kapsam kontrolünde eleniyor ve ikinci bölümden itibaren tarih kayboluyordu.
      watchedAt: parseHistoryDateLabel(sectionLabel(section), now),
    }))
    : [{ scope: root, watchedAt: undefined }];

  for (const { scope, watchedAt } of scopes) {
    for (const card of scope.querySelectorAll(CARD_SELECTOR)) {
      const entry = parseHistoryCard(card, watchedAt);
      // Aynı video geçmişte birden çok kez görünebilir; en yenisi (ilk görülen) kalır.
      if (!entry || seen.has(entry.videoId)) continue;
      seen.add(entry.videoId);
      entries.push(entry);
    }
  }
  return entries;
}

/** Belirtilen gün sayısından eski kayıtları eler. Tarihsiz kayıtlar korunur. */
export function withinDays(entries: ImportedHistoryEntry[], days: number, now = new Date()): ImportedHistoryEntry[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return entries.filter((entry) => !entry.watchedAt || new Date(entry.watchedAt).getTime() >= cutoff);
}

/** Tarama sırasında "artık yeterince geriye gittik" kararını verir. */
export function reachedCutoff(entries: ImportedHistoryEntry[], days: number, now = new Date()): boolean {
  const cutoff = now.getTime() - days * 86_400_000;
  return entries.some((entry) => entry.watchedAt && new Date(entry.watchedAt).getTime() < cutoff);
}
