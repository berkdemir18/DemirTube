// DemirTube · konu sınıflandırma
//
// Sınıflandırma sabit bir anahtar kelime listesiyle çalışıyordu ve eşleşme tam
// kelime sınırı arıyordu. Türkçe eklemeli bir dil olduğu için bu, sözlükteki
// kelimelerin çoğunu metinde bulunamaz hâle getiriyordu:
//
//   "programlama"  ≠  "programlamayı"      (ek)
//   "güvenlik"     ≠  "güvenliği"          (ünsüz yumuşaması k → ğ)
//   "beşiktaş"     ≠  "besiktas"           (aksansız yazım)
//   "yapay zekâ"   ≠  "yapay zeka"         (düzeltme işareti)
//
// Sonuç: çok sayıda video "Diğer" kutusuna düşüyor, konu sinyali de o oranda
// boş kalıyordu. Artık üç katman var:
//
//   1. Katlanmış metin üzerinde ek ve yumuşama toleranslı kural eşleşmesi.
//   2. Kullanıcının kendi ELLE düzelttiği videolardan öğrenilen kelimeler.
//   3. Kanal hafızası: bir kanalın videoları hep aynı konuysa, o kanaldan gelen
//      anlaşılamamış başlık o konuyu devralır.
//
// İkinci ve üçüncü katman `topic-memory.ts`'ten gelir ve isteğe bağlıdır;
// verilmezse sınıflandırma eskisi gibi saf kurallarla çalışır.
import { TOPIC_RULES } from "../shared/constants";
import type { Topic } from "../shared/types";
import { channelKey, foldText } from "../shared/utils";
import type { TopicMemory } from "./topic-memory";

/**
 * Ek toleransı iki farklı sıkılıkta çalışır ve sınır, kelimenin uzunluğudur:
 *
 *   • Uzun kelimeler (≥5 harf) için ek serbest bırakılır; "programlama" gibi
 *     bir kökün yanlış bir kelimenin başına denk gelmesi pratikte imkânsız.
 *   • Kısa kökler (3–4 harf) için ek, GEÇERLİ ÇEKİM EKLERİ listesiyle sınırlanır.
 *     Serbest bırakılsaydı "maç" → "macera", "gol" → "golf", "dizi" → "dizin"
 *     olurdu; büsbütün kapatılsaydı "maçın", "golleri", "dizisi" gibi son derece
 *     yaygın biçimler kaçmaya devam ederdi.
 *   • 3 harften kısa anahtarlar ("ai", "f1") birebir aranır.
 */
const LOOSE_SUFFIX_LENGTH = 5;
const SHORT_ROOT_LENGTH = 3;

/** Serbest ek toleransında kabul edilen en fazla ek uzunluğu. */
const MAX_SUFFIX_LENGTH = 6;

/**
 * Kısa köklerde kabul edilen çekim ekleri. Metin katlandığı için hepsi ASCII
 * karşılığıyla yazılır (ı→i, ü→u, ö→o, ç→c, ğ→g).
 */
const SHORT_SUFFIXES = [
  "i", "u", "a", "e", "in", "un", "ni", "nu", "na", "ne", "nin", "nun",
  "yi", "yu", "ya", "ye", "si", "su", "ci", "cu",
  "da", "de", "ta", "te", "dan", "den", "tan", "ten",
  "nda", "nde", "ndan", "nden",
  "lar", "ler", "lari", "leri", "larin", "lerin",
  "larda", "lerde", "lardan", "lerden", "lik", "lig", "luk", "lug",
].toSorted((a, b) => b.length - a.length);

const SHORT_SUFFIX_PATTERN = `(?:${SHORT_SUFFIXES.join("|")})?`;

/**
 * Uzun oldukları hâlde serbest ek verilemeyen anahtarlar: "final" → "finalde"
 * bir maç finali olabilir ama Hazırlık konusuna yazılır, "motor" → "motorlu"
 * her bağlamda otomobil değildir.
 */
const EXACT_ONLY = new Set(["cover", "motor", "tepki", "vize", "final", "kod"]);

/**
 * Tek başına konu kanıtı sayılamayacak kadar genel anahtarlar. "FBI tarihinin
 * en büyük operasyonu" bir tarih videosu değildir, "yapay zekâya karşı savaş"
 * da. Başlıkta geçerlerse zayıf puan alırlar, açıklamada geçerlerse hiç almazlar;
 * böylece yalnızca başka kanıt yoksa veya kanıtı destekliyorsa konu olurlar.
 */
const WEAK_KEYWORDS = new Set(["tarih", "tarihi", "savaş", "sistem", "inceleme", "rehber", "anlatım", "sohbet"]);
const WEAK_TITLE_HIT = 2;

/**
 * Türkçe ünsüz yumuşaması: kelime sonundaki sert ünsüz ek aldığında yumuşar.
 * Katlanmış metinde ğ zaten g, ç zaten c olduğu için karşılıklar bunlar.
 */
const SOFTENING: Record<string, string> = { k: "[kg]", p: "[pb]", t: "[td]", c: "[c]" };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Bir anahtar kelimeyi, ek ve yumuşama toleranslı bir desene çevirir.
 * Çok kelimeli anahtarlarda tolerans yalnızca son kelimeye uygulanır:
 * "şampiyonlar ligi" → "sampiyonlar lig(i|inde|ine…)".
 */
function keywordPattern(folded: string): string {
  const words = folded.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const last = words.at(-1)!;
  const head = words.slice(0, -1).map(escapeRegex);

  const join = (tail: string) => [...head, tail].join("\\s+");
  if (last.length < SHORT_ROOT_LENGTH || EXACT_ONLY.has(last)) return join(escapeRegex(last));

  const final = last.at(-1)!;
  const stem = SOFTENING[final]
    ? escapeRegex(last.slice(0, -1)) + SOFTENING[final]
    : escapeRegex(last);

  return join(last.length >= LOOSE_SUFFIX_LENGTH
    ? `${stem}\\p{L}{0,${MAX_SUFFIX_LENGTH}}`
    : `${stem}${SHORT_SUFFIX_PATTERN}`);
}

/**
 * Desenler kelime başına sabitlenir: ek yalnızca SONA gelebilir, öne değil.
 * Aksi hâlde "aile" içinde "ai", "kargo" içinde "car" bulunurdu.
 */
const patternCache = new Map<string, RegExp>();

function keywordRegex(keyword: string): RegExp {
  let cached = patternCache.get(keyword);
  if (!cached) {
    cached = new RegExp(`(^|[^\\p{L}\\p{N}])${keywordPattern(foldText(keyword))}(?=$|[^\\p{L}\\p{N}])`, "u");
    if (patternCache.size > 2_000) patternCache.clear();
    patternCache.set(keyword, cached);
  }
  return cached;
}

const matches = (text: string, keyword: string) => keywordRegex(keyword).test(text);

/**
 * Ham metinde, sınıflandırıcıyla aynı ek toleransıyla kelime arar. Kullanıcının
 * kendi konu kuralları da bunu kullanır: düz `includes` "sistem"i
 * "Sistemleri"nde bulduğu kadar "ybs"yi rastgele bir kelimenin içinde de buluyordu.
 */
export const keywordMatches = (text: string, keyword: string) =>
  Boolean(keyword.trim()) && matches(foldText(text), keyword);

/** Öğrenilen kelime eşleşmesinde kullanılan basit kelime ayrıştırma. */
export const foldedWords = (text: string) =>
  foldText(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);

/** Puanlar: başlıkta geçmek kanalda geçmekten, o da açıklamada geçmekten güçlü. */
const TITLE_HIT = 4;
const CHANNEL_HIT = 2;
const CONTEXT_HIT = 1;
/**
 * Kullanıcının elle düzelttiği videolardan öğrenilen kelime, kuraldan güçlüdür:
 * kural bir tahmindir, elle etiket ise doğrudan cevaptır.
 */
const LEARNED_WORD_HIT = 5;
/** Kanal hafızası kuralları ezmez, yalnızca kendi konusunu öne iter. */
const CHANNEL_MEMORY_BOOST = 2;

export function classifyTopics(
  title: string,
  channelName = "",
  context = "",
  memory?: TopicMemory
): Topic[] {
  const titleText = foldText(title);
  const channelText = foldText(channelName);
  const contextText = foldText(context);

  const scores = new Map<Topic, number>();
  const add = (topic: Topic, amount: number) => scores.set(topic, (scores.get(topic) ?? 0) + amount);

  for (const [topic, keywords] of Object.entries(TOPIC_RULES) as [Exclude<Topic, "Diğer">, string[]][]) {
    for (const keyword of keywords) {
      if (WEAK_KEYWORDS.has(keyword)) {
        if (matches(titleText, keyword)) add(topic, WEAK_TITLE_HIT);
        continue;
      }
      if (matches(titleText, keyword)) add(topic, TITLE_HIT);
      if (matches(channelText, keyword)) add(topic, CHANNEL_HIT);
      if (matches(contextText, keyword)) add(topic, CONTEXT_HIT);
    }
  }

  // Elle etiketlenmiş videolardan öğrenilen kelimeler.
  if (memory?.wordTopics.size) {
    for (const word of foldedWords(`${title} ${context}`)) {
      const learned = memory.wordTopics.get(word);
      if (learned) add(learned, LEARNED_WORD_HIT);
    }
  }

  const channelTopics = memory?.channelTopics.get(channelKey(channelName)) ?? [];
  // Kanal hafızası yalnızca videoda zaten kanıtı olan konuyu güçlendirir.
  // Önceden her konuya puan ekliyordu: bir kanal bir kez tarih videosu attıysa
  // o kanalın GTA ya da dram videosu da "Tarih" etiketi alıyordu.
  for (const topic of channelTopics) if (scores.has(topic)) add(topic, CHANNEL_MEMORY_BOOST);

  const scored = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .map(([topic, score]) => ({ topic, score }))
    .toSorted((a, b) => b.score - a.score);

  // Eğlence, başlıkta doğrudan geçtiğinde diğer konuların önüne geçer: "komik
  // futbol anları" bir futbol analizi değildir.
  const entertainment = scored.find((item) => item.topic === "Eğlence");
  if (entertainment && entertainment.score >= TITLE_HIT && entertainment.score >= (scored[0]?.score ?? 0)) {
    return ["Eğlence"];
  }

  // İkincil konular ana konunun en az yarısı kadar kanıt ister. Aksi hâlde
  // açıklamadaki tek bir "kod" (indirim kodu) veya etiket, eğlence videosunu
  // Programlama'ya da yazıyordu.
  const top = scored[0]?.score ?? 0;
  const topics = scored
    .filter((item, index) => index === 0 || item.score >= Math.max(TITLE_HIT - 1, top / 2))
    .slice(0, 3)
    .map((item) => item.topic);
  if (topics.length) return topics;

  // Hiçbir kural tutmadı: kanal geçmişi biliniyorsa videoyu ona devret.
  // "Diğer" bir cevap değil, cevapsızlığın adıdır; kanal tutarlıysa elde
  // gerçek bir kanıt var demektir.
  return channelTopics.length ? channelTopics.slice(0, 2) : ["Diğer"];
}
