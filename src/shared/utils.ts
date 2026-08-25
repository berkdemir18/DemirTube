export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
export const round = (value: number, precision = 1) => Number(value.toFixed(precision));
export const uid = () => crypto.randomUUID();
export const isoNow = () => new Date().toISOString();
export const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} sn`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} sa ${minutes} dk` : `${minutes} dk`;
};
export const getVideoId = (url = location.href) => {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/").filter(Boolean)[1] ?? "";
  return parsed.searchParams.get("v") ?? "";
};
export const normalizeText = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFKC");

/**
 * Türkçeye özgü harfleri ASCII karşılıklarına indirger.
 *
 * İki ayrı sorunu birden çözer: (1) YouTube başlıkları sık sık aksansız
 * yazılıyor ("besiktas", "guvenlik", "yapay zeka") ve bunlar sözlükteki
 * "beşiktaş", "güvenlik", "yapay zekâ" ile eşleşmiyordu; (2) düzeltme işaretli
 * "zekâ" ile "zeka" farklı iki kelime sayılıyordu. Katlama iki tarafa da
 * uygulanınca her üç yazım da aynı anahtara düşer.
 *
 * `normalizeText` bilerek değiştirilmedi: arama ve başlık karşılaştırması gibi
 * yerlerde görünen metnin korunması gerekiyor.
 */
const FOLDED_LETTERS: Record<string, string> = {
  "â": "a", "ä": "a", "à": "a", "î": "i", "ï": "i", "û": "u", "ü": "u",
  "ö": "o", "ô": "o", "ç": "c", "ğ": "g", "ı": "i", "ş": "s", "é": "e", "è": "e",
};

export const foldText = (value = "") =>
  normalizeText(value).replace(/[âäàîïûüöôçğışéè]/g, (letter) => FOLDED_LETTERS[letter] ?? letter);

export const UNKNOWN_CHANNEL = "Bilinmeyen kanal";

/**
 * Kanal adı iki ayrı yerden okunuyor: izleme sayfasında video sahibi bloğundan,
 * keşfet kartında ise metadata satırından. Satır sonu, çift boşluk veya satırın
 * "Kanal • 12 B görüntüleme" biçimi yüzünden aynı kanal iki farklı metin olarak
 * geliyor ve geçmiş eşleşmesi düşüyordu. Görünen adı buradan tek biçime indiriyoruz.
 */
export const normalizeChannelName = (value = "") =>
  value.replace(/\s+/g, " ").trim().split(/\s*[•·|]\s*/)[0]?.trim() ?? "";

/** Kanal eşleşmesi için büyük/küçük harf ve "@" ön ekinden bağımsız anahtar. */
export const channelKey = (value = "") =>
  normalizeChannelName(value).replace(/^@/, "").toLocaleLowerCase("tr-TR");

/**
 * Shorts sayfasında başlık düğümü geç geldiği için başlık okuması sayfa
 * iskeletinden alakasız metinler döndürebiliyor: yorum butonunun etiketi
 * ("Yorumlar" + sayı) ve sekme başlığı ("YouTube"). Bunlar başlık sayılmaz.
 *
 * Eşleşme tüm metni kapsar; yalnızca ön ek aransaydı "YouTube algoritması nasıl
 * çalışıyor?" gibi geçerli başlıklar da elenirdi.
 */
const JUNK_TITLE = /^(youtube|shorts|başlıksız video|(yorumlar|comments)( [\d.,]+ ?[bkm]?)?)$/i;

export const isJunkVideoTitle = (value = "") =>
  JUNK_TITLE.test(value.replace(/\s+/g, " ").trim());

/** Başlık olarak kullanılabilir metni döndürür; kullanılamazsa boş metin. */
export function usableTitle(value = "") {
  const trimmed = value.trim();
  if (trimmed.length < 2 || isJunkVideoTitle(trimmed)) return "";
  return trimmed;
}
