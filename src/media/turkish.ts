// DemirTube · sayılara Türkçe ek
//
// "%29'i" değil "%29'u": ek, sayının okunuşundaki son kelimeye uyar
// (yirmi doku-z → u, otuz sekiz → i, doksan → ı). Yüzdeler ve sayaçlar için
// 0–999 arası yeterli; daha büyük sayılar bin/milyon okunuşuyla çekilir.

const ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];

function spokenLastWord(value: number) {
  const n = Math.abs(Math.round(value));
  if (n === 0) return "sıfır";
  if (n % 1_000_000 === 0) return "milyon";
  if (n % 1000 === 0) return "bin";
  if (n % 100 === 0) return "yüz";
  if (n % 10 === 0) return TENS[(n % 100) / 10];
  return ONES[n % 10];
}

function harmony(word: string) {
  const vowel = [...word].reverse().find((char) => "aıoueiöü".includes(char)) ?? "e";
  const back = "aıou".includes(vowel);
  const round = "ouöü".includes(vowel);
  return {
    four: back ? (round ? "u" : "ı") : (round ? "ü" : "i"),
    two: back ? "a" : "e",
    endsWithVowel: "aıoueiöü".includes(word.at(-1) ?? ""),
    voiceless: /[fstkçşhp]$/.test(word),
  };
}

export type Suffix =
  /** iyelik: %29'u, %40'ı, %2'si */
  | "possessive"
  /** iyelik + bulunma: %45'inde, %90'ında, %2'sinde */
  | "possessive-locative"
  /** iyelik + belirtme: %67'sini, %50'sini, %30'unu */
  | "possessive-accusative"
  /** bulunma: %38'de, %40'ta, %3'te */
  | "locative"
  /** yönelme: 12 güne, 3'e */
  | "dative";

export function suffix(value: number, kind: Suffix) {
  const h = harmony(spokenLastWord(value));
  const possessive = (h.endsWithVowel ? "s" : "") + h.four;
  switch (kind) {
    case "possessive": return possessive;
    case "possessive-locative": return `${possessive}nd${h.two}`;
    case "possessive-accusative": return `${possessive}n${h.four}`;
    case "locative": return `${h.voiceless ? "t" : "d"}${h.two}`;
    case "dative": return `${h.endsWithVowel ? "y" : ""}${h.two}`;
  }
}

/** "%29'u" gibi, kesme işaretiyle. */
export function percentWith(value: number, kind: Suffix) {
  return `%${Math.round(value)}'${suffix(Math.round(value), kind)}`;
}
