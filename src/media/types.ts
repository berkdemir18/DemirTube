// DemirTube · Perde veri modeli (film ve dizi)
//
// YouTube dışındaki sitelerde izlenen film ve diziler burada tutulur. Veri
// chrome.storage.local'da tek anahtar altında durur; video sayısı YouTube
// geçmişine göre çok küçük olduğu için IndexedDB göçüne gerek yok.

export type MediaKind = "tv" | "movie" | "unknown";

/** Sayfa başlığından çıkarılan ham tahmin. */
export interface ParsedMediaTitle {
  query: string;
  season?: number;
  episode?: number;
  year?: number;
  kind: MediaKind;
}

/** Oynatıcıdan gelen tek bir ilerleme bildirimi. */
export interface MediaProgressReport {
  /** Sitenin kendi oynatıcısından okunan başlık parçaları (varsa en güvenilir kaynak). */
  platformTitle?: string;
  platformSubtitle?: string;
  documentTitle: string;
  pageUrl: string;
  site: string;
  position: number;
  duration: number;
  /** Son bildirimden bu yana gerçekten oynayarak geçen süre. */
  watchedDelta: number;
  reportedAt: string;
}

export interface MediaTitle {
  /** "tmdb:tv:1399" · eşleşmediyse "raw:<normalize başlık>" */
  key: string;
  tmdbId?: number;
  kind: MediaKind;
  name: string;
  originalName?: string;
  year?: number;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  /** TMDB'den gelen sezon başına bölüm sayıları; sıradaki bölümü hesaplamak için. */
  seasons?: { season: number; episodeCount: number }[];
  /** TMDB ayrıntıları: Türkçe tür adları, 10 üzerinden puan, dakika cinsinden bölüm/film süresi. */
  genres?: string[];
  voteAverage?: number;
  runtimeMinutes?: number;
  detailsFetchedAt?: string;
  favorite: boolean;
  /** Kullanıcı eşleşmeyi elle seçtiyse otomatik eşleştirme bir daha dokunmaz. */
  manualMatch?: boolean;
  addedAt: string;
  updatedAt: string;
  lastWatchedAt?: string;
}

export interface MediaProgress {
  /** `${titleKey}|${season}|${episode}` — film için "|0|0" */
  id: string;
  titleKey: string;
  season: number;
  episode: number;
  position: number;
  duration: number;
  watchedSeconds: number;
  completed: boolean;
  site: string;
  lastUrl: string;
  rawTitle: string;
  firstWatchedAt: string;
  lastWatchedAt: string;
}

/** Kesintisiz bir izleme: aynı bölüme 5 dakikadan kısa aralıklarla gelen bildirimler birleşir. */
export interface MediaSession {
  id: string;
  titleKey: string;
  season: number;
  episode: number;
  site: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
}

export interface MediaLibrary {
  version: 1;
  titles: Record<string, MediaTitle>;
  progress: Record<string, MediaProgress>;
  /** Gün → site → saniye. İstatistik için; oturum kaydı tutmadan. */
  daily: Record<string, Record<string, number>>;
  /** Normalize sorgu → başlık anahtarı. Aynı başlık için TMDB'ye tekrar gidilmez. */
  resolved: Record<string, string>;
  /** Saat, gün ve maraton analizleri için. İlk sürüm kütüphanelerinde yoktur. */
  sessions?: MediaSession[];
}

export interface TmdbSearchResult {
  tmdbId: number;
  kind: "tv" | "movie";
  name: string;
  originalName?: string;
  year?: number;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  popularity?: number;
}

export interface WatchProvider {
  id: number;
  name: string;
  logoPath?: string;
}

export interface WatchProviders {
  link?: string;
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  fetchedAt: string;
}

export interface MediaStatus {
  hasApiKey: boolean;
  trackingEnabled: boolean;
}

export function emptyLibrary(): MediaLibrary {
  return { version: 1, titles: {}, progress: {}, daily: {}, resolved: {}, sessions: [] };
}
