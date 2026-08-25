import type { FeedImpression } from "../shared/types";
import { getDatabase, withDatabase } from "./database";

/**
 * Keşfette gösterilen kartların kaydı. Amaç öneri geçmişi tutmak değil,
 * modelin göremediği yarıyı görünür kılmak: yüksek puan verilip AÇILMAYAN
 * videolar. Bu kayıt olmadan "model iyi öneri yapıyor mu" sorusu ölçülemez,
 * çünkü elde yalnızca kullanıcının zaten seçtiği videolar vardır.
 */

/** Kayıtların saklanma süresi. Eski impression'lar ne modele ne kullanıcıya yarar. */
export const IMPRESSION_RETENTION_DAYS = 120;

/** Tek seferde saklanan en fazla kayıt; depolama sınırsız büyümesin. */
export const MAX_IMPRESSIONS = 4_000;

export type ImpressionInput = {
  videoId: string;
  title: string;
  channelName: string;
  score?: number;
  estimatedCompletion?: number;
  modelVersion: string;
};

export const impressionRepository = {
  async all(): Promise<FeedImpression[]> {
    return withDatabase((database) => database.getAll("impressions"));
  },

  /**
   * Gösterilen kartları toplu yazar. Aynı kart tekrar tekrar görülür; ilk
   * görülme zamanı korunur, sayaç artar. Tek transaction kullanılıyor:
   * keşfet taraması 20 kartı birden getiriyor ve her biri için ayrı transaction
   * açmak service worker'ı gereksiz meşgul ediyordu.
   */
  async record(entries: ImpressionInput[], now = new Date()): Promise<void> {
    if (!entries.length) return;
    const timestamp = now.toISOString();
    await withDatabase(async (database) => {
      // Okuma ve yazma bilerek ayrı: aynı transaction içinde her kayıt için
      // await'li bir get yapmak, istekler arasında mikro görev kuyruğunu
      // boşaltıp transaction'ın kendiliğinden kapanmasına yol açıyor.
      const existing = await Promise.all(entries.map((entry) => database.get("impressions", entry.videoId)));
      const transaction = database.transaction("impressions", "readwrite");
      const store = transaction.objectStore("impressions");
      const writes = entries.map((entry, index) => store.put({
        ...entry,
        firstShownAt: existing[index]?.firstShownAt ?? timestamp,
        lastShownAt: timestamp,
        shownCount: (existing[index]?.shownCount ?? 0) + 1,
      }));
      await Promise.all([...writes, transaction.done]);
    });
  },

  /** Süresi dolmuş ve sınırı aşan kayıtları siler. */
  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - IMPRESSION_RETENTION_DAYS * 86_400_000).toISOString();
    const database = await getDatabase();
    const all = await database.getAll("impressions");
    const expired = all.filter((item) => item.lastShownAt < cutoff).map((item) => item.videoId);
    // Sınır aşıldıysa en eski kayıtlardan başlayarak buda.
    const survivors = all
      .filter((item) => item.lastShownAt >= cutoff)
      .toSorted((a, b) => b.lastShownAt.localeCompare(a.lastShownAt));
    const overflow = survivors.slice(MAX_IMPRESSIONS).map((item) => item.videoId);
    const removable = [...expired, ...overflow];
    if (!removable.length) return 0;

    const transaction = database.transaction("impressions", "readwrite");
    const store = transaction.objectStore("impressions");
    await Promise.all(removable.map((videoId) => store.delete(videoId)));
    await transaction.done;
    return removable.length;
  },
};
