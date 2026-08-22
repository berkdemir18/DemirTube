import type { TranscriptAnalysis, TranscriptMoment } from "../shared/types";
import { clamp, normalizeText, round } from "../shared/utils";

export type TranscriptSegment = { startSeconds: number; text: string };

const STOP_WORDS = new Set([
  "acaba", "ama", "ancak", "artık", "aslında", "bazı", "ben", "bence", "bile", "bir", "biz", "bu", "bunu",
  "çok", "daha", "da", "de", "diye", "en", "fakat", "gibi", "hem", "her", "için", "ile", "ise", "işte",
  "kadar", "ki", "mi", "mı", "mu", "mü", "nasıl", "ne", "neden", "o", "olan", "olarak", "oldu", "şey",
  "şimdi", "şu", "ve", "veya", "ya", "yani", "yok", "var", "the", "and", "for", "that", "this", "with",
  "you", "your", "from", "have", "are", "was", "will", "just", "but", "not", "can", "about"
]);

function words(value: string) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function topKeywords(tokens: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
    .slice(0, limit)
    .map(([word]) => word);
}

function repeatedWindowRate(tokens: string[]) {
  if (tokens.length < 20) return 0;
  const windows = new Map<string, number>();
  for (let index = 0; index <= tokens.length - 4; index += 1) {
    const key = tokens.slice(index, index + 4).join(" ");
    windows.set(key, (windows.get(key) ?? 0) + 1);
  }
  const repeats = [...windows.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return clamp(repeats / Math.max(1, windows.size) * 100);
}

type MomentCategory = { label: string; patterns: RegExp[] };

const MOMENT_CATEGORIES: MomentCategory[] = [
  { label: "Sponsor bölümü", patterns: [/sponsor|reklam|iş birliği|is birligi|ad break|sponsored/] },
  { label: "Kutu açılışı", patterns: [/kutu\w* aç|paket\w* aç|kutudan çıkar|unbox/] },
  { label: "Ürün incelemesi", patterns: [/ürün\w* incele|incelemeye|yakından bak|ilk izlenim|review/] },
  { label: "Kurulum ve hazırlık", patterns: [/kurulum|kurmaya|hazırla|bağlantı\w* yap|setup|installation/] },
  { label: "Özellikler ve teknik detaylar", patterns: [/özellik|teknik detay|donanım|tasarım|spec|feature/] },
  { label: "Test ve uygulama", patterns: [/test ed|deneyelim|uygulama|performans|benchmark|demo/] },
  { label: "Karşılaştırma", patterns: [/karşılaştır|farkı|kıyas|versus|\bvs\b|compare/] },
  { label: "Fiyat ve değer değerlendirmesi", patterns: [/fiyat|ücret|değer mi|satın al|price|worth/] },
  { label: "Soru ve cevap", patterns: [/soru.*cevap|sorular|cevaplay|q\s*&\s*a/] },
  { label: "Sonuç ve değerlendirme", patterns: [/sonuç|özetle|değerlendir|artı.*eksi|kapanış|conclusion|final verdict/] },
  { label: "Giriş ve konu tanıtımı", patterns: [/bugün.*bak|bu video|konumuz|başlamadan|giriş|intro/] }
];

function categoryForSegment(segment: TranscriptSegment, index: number, segments: TranscriptSegment[]) {
  const ownText = normalizeText(segment.text);
  const direct = MOMENT_CATEGORIES.find((category) => category.patterns.some((pattern) => pattern.test(ownText)))?.label;
  if (direct) return direct;
  const context = normalizeText([
    segments[index - 1]?.text,
    segment.text,
    segments[index + 1]?.text
  ].filter(Boolean).join(" "));
  return MOMENT_CATEGORIES.find((category) => category.patterns.some((pattern) => pattern.test(context)))?.label;
}

function semanticMomentLabel(segment: TranscriptSegment, index: number, segments: TranscriptSegment[], keywords: string[]) {
  const category = categoryForSegment(segment, index, segments);
  if (category) return category;
  const segmentTokens = words(segment.text);
  const topic = keywords.find((keyword) => segmentTokens.includes(keyword)) ?? segmentTokens[0];
  return topic ? `${topic.slice(0, 1).toLocaleUpperCase("tr-TR")}${topic.slice(1)} konusu` : "Ana konu anlatımı";
}

function importantMoments(segments: TranscriptSegment[], keywords: string[]): TranscriptMoment[] {
  return segments
    .map((segment, index) => {
      const normalized = normalizeText(segment.text);
      const category = categoryForSegment(segment, index, segments);
      const score = keywords.reduce((sum, keyword) => sum + (normalized.includes(keyword) ? 1 : 0), 0)
        + Math.min(segment.text.length / 120, 1)
        + (category ? 2 : 0);
      return { segment, index, score };
    })
    .filter((item) => item.score > 1)
    .toSorted((a, b) => b.score - a.score)
    .filter((item, index, all) => all.findIndex((candidate) => Math.abs(candidate.segment.startSeconds - item.segment.startSeconds) < 45) === index)
    .slice(0, 5)
    .toSorted((a, b) => a.segment.startSeconds - b.segment.startSeconds)
    .map(({ segment, index }) => ({
      startSeconds: round(segment.startSeconds, 0),
      label: semanticMomentLabel(segment, index, segments, keywords)
    }));
}

export function analyzeTranscript(
  segments: TranscriptSegment[],
  title: string,
  description = "",
  language?: string,
  now = new Date()
): TranscriptAnalysis {
  const clean = segments.filter((segment) => segment.text.trim()).slice(0, 10_000);
  const transcriptTokens = words(clean.map((segment) => segment.text).join(" "));
  if (!transcriptTokens.length) return {
    available: false,
    language,
    wordCount: 0,
    keywords: [],
    summary: "Bu video için erişilebilir altyazı bulunamadı.",
    informationDensity: 0,
    repetitionRate: 0,
    titlePromiseCoverage: 0,
    promiseVerdict: "unknown",
    keyMoments: [],
    analyzedAt: now.toISOString()
  };
  const keywords = topKeywords(transcriptTokens);
  const unique = new Set(transcriptTokens);
  const density = clamp(unique.size / transcriptTokens.length * 170);
  const repetitionRate = repeatedWindowRate(transcriptTokens);
  const promiseTokens = [...new Set(words(`${title} ${description}`).slice(0, 30))];
  const transcriptSet = new Set(transcriptTokens);
  const covered = promiseTokens.filter((token) => transcriptSet.has(token)).length;
  const coverage = promiseTokens.length ? clamp(covered / promiseTokens.length * 100) : 0;
  const promiseVerdict = promiseTokens.length < 2
    ? "unknown"
    : coverage >= 65 ? "fulfilled" : coverage >= 35 ? "partial" : "weak";
  const summary = keywords.length
    ? `Altyazıda en çok ${keywords.slice(0, 5).join(", ")} kavramları öne çıkıyor.`
    : "Altyazı bulundu ancak belirgin bir anahtar kavram çıkarılamadı.";
  return {
    available: true,
    status: "ready",
    language,
    wordCount: transcriptTokens.length,
    keywords,
    summary,
    informationDensity: round(density),
    repetitionRate: round(repetitionRate),
    titlePromiseCoverage: round(coverage),
    promiseVerdict,
    keyMoments: importantMoments(clean, keywords),
    analyzedAt: now.toISOString()
  };
}
