// DemirTube · Trakt veri dışa aktarımını okuma
//
// Trakt, API uygulaması açmayı VIP'e bağladı (Ağustos 2026) ama her hesaba
// ücretsiz dışa aktarım veriyor: trakt.tv/settings/data → ZIP içinde JSON
// dosyaları. Dosya adları belgelenmemiş ve sayfalı ("…-1.json", "…-2.json"),
// bu yüzden dosyalar adına değil içeriğine bakılarak sınıflandırılır; ad
// yalnızca aynı biçimdeki izleme listesi ile kişisel listeleri ayırmak için
// kullanılır.
import type { TraktHistoryItem, TraktRatingItem, TraktWatchlistItem } from "./trakt";
import type { TraktImportInput } from "./trakt-import";
import { readZip } from "./zip";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** Kimliği olmayan geçmiş kaydına kararlı sayısal kimlik (tekrar yüklemede aynı kalsın). */
function stableId(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // Trakt kimlikleriyle çakışmasın: negatif aralık.
  return -((hash >>> 0) + 1);
}

function asHistory(entry: Json): TraktHistoryItem | undefined {
  const type = entry.type;
  if (typeof entry.watched_at !== "string" || (type !== "movie" && type !== "episode")) return undefined;
  if (type === "movie" && !isObject(entry.movie)) return undefined;
  if (type === "episode" && (!isObject(entry.show) || !isObject(entry.episode))) return undefined;
  const item = entry as unknown as TraktHistoryItem;
  if (typeof item.id === "number") return item;
  const media = type === "movie" ? item.movie : item.show;
  const suffix = type === "episode" ? `|${item.episode?.season}|${item.episode?.number}` : "";
  return { ...item, id: stableId(`${item.watched_at}|${type}|${media?.ids?.trakt ?? media?.ids?.tmdb ?? media?.title}${suffix}`) };
}

export interface ExportReadResult {
  input: TraktImportInput;
  files: number;
  skippedFiles: string[];
}

/** JSON dosyalarını (ad + içerik) içe aktarma girdisine çevirir. */
export function classifyExportFiles(files: { name: string; data: unknown }[]): ExportReadResult {
  const history: TraktHistoryItem[] = [];
  const ratings: TraktRatingItem[] = [];
  const watchlist: TraktWatchlistItem[] = [];
  const skippedFiles: string[] = [];
  let used = 0;

  for (const file of files) {
    const base = file.name.split("/").pop()!.toLowerCase();
    if (!Array.isArray(file.data) || !file.data.length || !isObject(file.data[0])) { skippedFiles.push(file.name); continue; }
    const sample = file.data[0];
    if ("watched_at" in sample && "type" in sample && !("seasons" in sample)) {
      for (const entry of file.data) { const item = isObject(entry) ? asHistory(entry) : undefined; if (item) history.push(item); }
      used += 1;
    } else if ("rated_at" in sample && "rating" in sample) {
      for (const entry of file.data) if (isObject(entry) && typeof entry.rating === "number" && typeof entry.rated_at === "string") ratings.push(entry as unknown as TraktRatingItem);
      used += 1;
    } else if ("listed_at" in sample && base.includes("watchlist")) {
      for (const entry of file.data) if (isObject(entry) && typeof entry.listed_at === "string") watchlist.push(entry as unknown as TraktWatchlistItem);
      used += 1;
    } else {
      // "watched-shows" özetleri, koleksiyon, kişisel listeler, yorumlar: geçmiş zaten tek tek izlemeleri taşıyor.
      skippedFiles.push(file.name);
    }
  }
  // Sayfalı dosyalar üst üste binerse aynı izleme iki kez gelmesin.
  const unique = [...new Map(history.map((item) => [item.id, item])).values()];
  return { input: { history: unique, ratings, watchlist }, files: used, skippedFiles };
}

/** Kullanıcının seçtiği ZIP ya da tek tek JSON dosyalarını okur. */
export async function readTraktExport(files: File[]): Promise<ExportReadResult> {
  const parsed: { name: string; data: unknown }[] = [];
  const decoder = new TextDecoder();
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
      const entries = await readZip(await file.arrayBuffer(), (name) => /\.json$/i.test(name));
      for (const entry of entries) {
        try { parsed.push({ name: entry.name, data: JSON.parse(decoder.decode(entry.bytes)) }); }
        catch { parsed.push({ name: entry.name, data: null }); }
      }
    } else if (/\.json$/i.test(file.name)) {
      try { parsed.push({ name: file.name, data: JSON.parse(await file.text()) }); }
      catch { parsed.push({ name: file.name, data: null }); }
    }
  }
  const result = classifyExportFiles(parsed);
  if (!result.input.history.length && !result.input.ratings.length && !result.input.watchlist.length) {
    throw new Error("Dosyada Trakt izleme geçmişi, puan ya da izleme listesi bulunamadı. trakt.tv/settings/data sayfasından indirilen ZIP'i seçtiğinden emin ol.");
  }
  return result;
}
