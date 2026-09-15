// DemirTube · sayfa başlığından film/dizi adı, sezon ve bölüm çıkarma
//
// Korsan sitelerin başlıkları dağınıktır: "Loki 2. Sezon 4. Bölüm Türkçe
// Altyazılı İzle - DiziBox", "The Bear S03E02 izle | HD", "Dune: Part Two
// (2024) Full HD Tek Parça İzle". Ortak nokta, adın her zaman sezon/bölüm
// işaretinden ÖNCE gelmesi. Ayrıştırıcı önce işareti bulur, sonra solunda
// kalanı site gürültüsünden temizler.
import type { MediaKind, ParsedMediaTitle } from "./types";

type EpisodeMatch = { index: number; length: number; season: number; episode: number };

const EPISODE_PATTERNS: { re: RegExp; season: number | null; episode: number }[] = [
  // S02E04 · s2e4 · S2 E4 · S2:E4
  { re: /\bs(\d{1,2})\s*[:.]?\s*e(\d{1,4})\b/i, season: 1, episode: 2 },
  // 2x04
  { re: /\b(\d{1,2})x(\d{1,3})\b/i, season: 1, episode: 2 },
  // 2. Sezon 4. Bölüm · 2.Sezon 4.Bölüm
  { re: /(\d{1,2})\s*\.?\s*sezon[\s,.-]*(\d{1,4})\s*\.?\s*b[öo]l[üu]m/i, season: 1, episode: 2 },
  // Sezon 2 Bölüm 4
  { re: /sezon\s*(\d{1,2})[\s,.-]*b[öo]l[üu]m\s*(\d{1,4})/i, season: 1, episode: 2 },
  // Season 2 Episode 4 · Season 2, Ep. 4
  { re: /season\s*(\d{1,2})[\s,.:-]*(?:episode|ep\.?)\s*(\d{1,4})/i, season: 1, episode: 2 },
  // 4. Bölüm (sezon yazmayan Türk dizileri)
  { re: /(\d{1,4})\s*\.?\s*b[öo]l[üu]m/i, season: null, episode: 1 },
  // Episode 4 · Ep. 4
  { re: /\b(?:episode|ep\.)\s*(\d{1,4})\b/i, season: null, episode: 1 },
];

// JS'de \b yalnız ASCII harfleri tanır ("İzle"deki İ'yi kelime saymaz),
// o yüzden Türkçe kelime sınırları Unicode harf sınıfıyla elle kurulur.
const word = (source: string) => new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${source})(?![\p{L}\p{N}])`, "giu");

// Başlığa site tarafından eklenen "izle" kalıpları ve kalite etiketleri.
const NOISE = [
  word(String.raw`t[üuÜU]rk[çcÇC]e\s*(?:dublaj|altyaz[ıiIİ]l[ıiIİ]|altyaz[ıiIİ])`),
  word(String.raw`(?:full\s*)?hd`),
  word(String.raw`1080p|720p|480p|2160p|4k|web-?dl|bluray|x26[45]`),
  word(String.raw`tek\s*par[çcÇC]a`),
  word(String.raw`online|[üuÜU]cretsiz|bedava|yerli|yabanc[ıiIİ]`),
  word(String.raw`(?:dizi|film|filmi|dizisi)\s*[iİı]zle`),
  word(String.raw`[iİı]zle`),
  word(String.raw`watch(?:\s+online)?`),
];

const MOVIE_HINT = String.raw`film|filmi|tek\s*par[çcÇC]a|movie`;

const PLATFORM_SUFFIX = /\s*[|•·–—-]\s*(?:netflix|prime video|amazon|max|hbo max|disney\+?|apple tv\+?|mubi|tabii|exxen|gain|tod|blutv|puhu ?tv)\s*$/i;

function findEpisode(text: string): EpisodeMatch | undefined {
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    const season = pattern.season === null ? 1 : Number(match[pattern.season]);
    const episode = Number(match[pattern.episode]);
    if (!Number.isFinite(season) || !Number.isFinite(episode) || episode === 0) continue;
    return { index: match.index, length: match[0].length, season, episode };
  }
  return undefined;
}

export function cleanTitle(raw: string) {
  let text = raw.replace(PLATFORM_SUFFIX, "");
  // "Ad - SiteAdı" biçiminde en sağdaki ayraçtan sonrasını at; ama sağ parça
  // kısa değilse ya da alan adına benzemiyorsa dokunma (adın kendisinde tire olabilir).
  const separator = /\s+[|–—-]\s+(?!.*\s+[|–—-]\s+)/.exec(text);
  if (separator && separator.index >= 3) {
    const right = text.slice(separator.index).replace(/^\s*[|–—-]\s*/, "");
    if (right.split(/\s+/).length <= 3 || /\.(?:com|net|org|tv|io|co|xyz|site|live|cc|me)\b/i.test(right)) {
      text = text.slice(0, separator.index);
    }
  }
  for (const pattern of NOISE) text = text.replace(pattern, " ");
  return text
    .replace(/\(\s*\)/g, " ")
    .replace(/[|•·–—_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:,.-]+|[\s:,.-]+$/g, "")
    .trim();
}

/**
 * Oynatıcı başlığı (varsa) + sayfa başlığından tahmin üretir.
 * `platformTitle` Netflix/Prime gibi sitelerin oynatıcısında yazan dizi adıdır,
 * `platformSubtitle` ise "S2:E4 Bölüm adı" gibi alt satırdır.
 */
export function parseMediaTitle(input: { documentTitle: string; platformTitle?: string; platformSubtitle?: string }): ParsedMediaTitle | undefined {
  const platformTitle = input.platformTitle?.trim();
  if (platformTitle) {
    const fromSubtitle = findEpisode(input.platformSubtitle ?? "");
    const fromTitle = fromSubtitle ? undefined : findEpisode(platformTitle);
    const episode = fromSubtitle ?? fromTitle;
    const name = cleanTitle(fromTitle ? platformTitle.slice(0, fromTitle.index) : platformTitle);
    if (name.length >= 2) {
      return withYear(name, episode ? { season: episode.season, episode: episode.episode, kind: "tv" } : { kind: "unknown" });
    }
  }

  const title = input.documentTitle.replace(/\s+/g, " ").trim();
  if (!title) return undefined;
  const episode = findEpisode(title);
  if (episode) {
    const name = cleanTitle(title.slice(0, episode.index));
    if (name.length < 2) return undefined;
    return withYear(name, { season: episode.season, episode: episode.episode, kind: "tv" });
  }
  const kind: MediaKind = word(MOVIE_HINT).test(title) ? "movie" : "unknown";
  const name = cleanTitle(title);
  if (name.length < 2) return undefined;
  return withYear(name, { kind });
}

function withYear(name: string, rest: Omit<ParsedMediaTitle, "query" | "year">): ParsedMediaTitle {
  const year = /\((19\d{2}|20\d{2})\)|\b(19\d{2}|20\d{2})$/.exec(name);
  const query = year ? cleanTitle(name.replace(year[0], " ")) : name;
  return { query, ...(year ? { year: Number(year[1] ?? year[2]) } : {}), ...rest };
}

// Oynatıcı başlığı okunamadığında sayfa başlığı çoğu zaman sadece platform adıdır.
// Bunu "Netflix" adında bir diziye çevirmektense hiç kaydetmemek doğru.
const GENERIC_TITLES = new Set([
  "netflix", "prime video", "amazon prime video", "amazon", "max", "hbo max", "disney", "disney plus", "apple tv", "apple tv plus",
  "mubi", "tabii", "exxen", "gain", "tod", "puhutv", "puhu tv", "blutv", "youtube", "video", "player", "oynatici", "ana sayfa", "home",
]);

/** Başlık yalnızca platformun ya da sitenin kendi adıysa true. */
export function isGenericTitle(query: string, host = "") {
  const normalized = normalizeTitle(query.replace(/\+/g, " plus"));
  if (!normalized || GENERIC_TITLES.has(normalized)) return true;
  const label = host.replace(/^www\./, "").split(".").slice(-2, -1)[0] ?? "";
  return Boolean(label) && normalized.replace(/\s+/g, "") === normalizeTitle(label).replace(/\s+/g, "");
}

/** Eşleştirme ve önbellek anahtarı için: küçük harf, aksansız, noktalamasız. */
export function normalizeTitle(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
