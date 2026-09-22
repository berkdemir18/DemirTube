// DemirTube · konu hafızası
//
// Konu sınıflandırması bugüne kadar tamamen sabit bir sözlüktü: kullanıcının
// kendi geçmişi hiç okunmuyordu. Oysa elde iki güçlü kanıt var ve ikisi de
// kullanılmıyordu:
//
//   1. Kullanıcının ELLE düzelttiği konular. Bir videonun konusunu düzeltmek
//      tek seferlik bir işti; aynı kelimeyi taşıyan bir sonraki video yine
//      yanlış sınıflanıyordu.
//   2. Kanalın tutarlılığı. Bir kanalın videolarının %80'i "Formula 1" ise, o
//      kanaldan gelen anlaşılmayan bir başlık büyük olasılıkla yine Formula 1'dir.
//
// Bu modül ikisini de saf fonksiyonlarla çıkarır. Öğrenme yalnızca geçmişten
// okunur; hiçbir şey yazılmaz, model gibi ayrı bir durum tutulmaz.
import type { Topic, VideoRecord } from "../shared/types";
import { channelKey } from "../shared/utils";
import { classifyTopics, foldedWords } from "./topic-classifier";

export type TopicMemory = {
  /** Kanal anahtarı → o kanalı tanımlayan konular. */
  channelTopics: Map<string, Topic[]>;
  /** Katlanmış kelime → elle etiketlerden öğrenilen konu. */
  wordTopics: Map<string, Topic>;
};

export const EMPTY_TOPIC_MEMORY: TopicMemory = {
  channelTopics: new Map(),
  wordTopics: new Map(),
};

/** Kanal hafızasının açılması için gereken en az video. */
const MIN_CHANNEL_VIDEOS = 3;
/** Bir konunun kanalı temsil ettiğini söylemek için gereken pay. */
const CHANNEL_TOPIC_SHARE = 0.6;
/** Bir kelimenin öğrenilmesi için gereken en az elle etiketli video. */
const MIN_WORD_EVIDENCE = 2;
/** Kelimenin tek bir konuya ait sayılması için gereken tutarlılık. */
const WORD_PURITY = 0.7;

/**
 * "Diğer" bir konu değil, konusuzluğun adıdır; hafızaya girerse kanal
 * tutarlılığı yanlışlıkla "bu kanal hep Diğer" diye öğrenilir.
 */
const isRealTopic = (topic: Topic) => topic !== "Diğer";

/**
 * Kayıt elle etiketlenmiş mi? `inferredTopics` sınıflandırıcının ürettiği
 * konuları taşır; `topics` ondan farklıysa araya kullanıcı girmiştir.
 */
export function isManuallyLabeled(video: VideoRecord): boolean {
  if (!video.inferredTopics?.length) return false;
  if (video.inferredTopics.length !== video.topics.length) return true;
  const inferred = new Set(video.inferredTopics);
  return video.topics.some((topic) => !inferred.has(topic));
}

export function buildTopicMemory(history: VideoRecord[]): TopicMemory {
  const usable = history.filter((video) => !video.excludedFromAnalytics && video.topics?.length);
  if (!usable.length) return EMPTY_TOPIC_MEMORY;

  // ── Kanal hafızası ────────────────────────────────────────────────────────
  const perChannel = new Map<string, { total: number; topics: Map<Topic, number> }>();
  for (const video of usable) {
    const key = channelKey(video.channelName);
    if (!key) continue;
    const entry = perChannel.get(key) ?? { total: 0, topics: new Map() };
    // Elle etiketlenmiş kayıt iki kat sayılır: kullanıcının cevabı, kuralın
    // tahmininden daha ağır basmalı.
    const weight = isManuallyLabeled(video) ? 2 : 1;
    entry.total += weight;
    for (const topic of video.topics) {
      if (!isRealTopic(topic)) continue;
      // Eski YouTube açıklaması pek çok ilgisiz videoyu "Müzik" yapmıştı.
      // Bu otomatik etiket, başlıkta doğrulanmadıkça kanal hafızasına geçmesin.
      if (topic === "Müzik" && !isManuallyLabeled(video)
        && !classifyTopics(video.title).includes("Müzik")) continue;
      entry.topics.set(topic, (entry.topics.get(topic) ?? 0) + weight);
    }
    perChannel.set(key, entry);
  }

  const channelTopics = new Map<Topic, Topic[]>();
  for (const [key, entry] of perChannel) {
    if (entry.total < MIN_CHANNEL_VIDEOS) continue;
    const dominant = [...entry.topics.entries()]
      .filter(([, count]) => count / entry.total >= CHANNEL_TOPIC_SHARE)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([topic]) => topic);
    if (dominant.length) channelTopics.set(key, dominant);
  }

  // ── Elle etiketlerden kelime öğrenme ──────────────────────────────────────
  const labeled = usable.filter(isManuallyLabeled);
  const wordCounts = new Map<string, Map<Topic, number>>();
  for (const video of labeled) {
    const words = new Set(foldedWords(video.title));
    for (const word of words) {
      const byTopic = wordCounts.get(word) ?? new Map<Topic, number>();
      for (const topic of video.topics) {
        if (!isRealTopic(topic)) continue;
        byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
      }
      wordCounts.set(word, byTopic);
    }
  }

  const wordTopics = new Map<string, Topic>();
  for (const [word, byTopic] of wordCounts) {
    const total = [...byTopic.values()].reduce((sum, count) => sum + count, 0);
    if (total < MIN_WORD_EVIDENCE) continue;
    const [best] = [...byTopic.entries()].toSorted((a, b) => b[1] - a[1]);
    // Kelime birden çok konuya dağılmışsa öğrenilmez: "video", "yeni" gibi
    // taşıyıcı kelimeler her konuda geçer ve öğrenilirse gürültü üretir.
    if (best && best[1] / total >= WORD_PURITY) wordTopics.set(word, best[0]);
  }

  return { channelTopics, wordTopics };
}

/** Geçmişte kaç video hâlâ konusuz; sınıflandırmanın gerçek karnesi budur. */
export function unclassifiedShare(history: VideoRecord[]): { count: number; share: number } {
  const usable = history.filter((video) => !video.excludedFromAnalytics);
  if (!usable.length) return { count: 0, share: 0 };
  const count = usable.filter((video) => !video.topics?.some(isRealTopic)).length;
  return { count, share: count / usable.length };
}
