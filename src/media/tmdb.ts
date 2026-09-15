// DemirTube · TMDB istemcisi
//
// Anahtar kullanıcıya ait (TMDB'de ücretsiz alınıyor) ve yalnızca
// chrome.storage.local'da durur. Buradan dışarı çıkan tek şey film/dizi adı
// araması; izleme geçmişi TMDB'ye gönderilmez.
import { normalizeTitle } from "./title-parser";
import type { ParsedMediaTitle, TmdbSearchResult, WatchProvider, WatchProviders } from "./types";

const API = "https://api.themoviedb.org/3";
export const TMDB_IMAGE = "https://image.tmdb.org/t/p";

type RawResult = {
  id: number;
  media_type?: string;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  popularity?: number;
};

async function request<T>(apiKey: string, path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  // 32 karakterlik v3 anahtarı sorgu parametresiyle, uzun v4 okuma belirteci başlıkla gider.
  const bearer = apiKey.length > 40;
  if (!bearer) url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${apiKey}` } : undefined });
  if (response.status === 401) throw new Error("TMDB anahtarı geçersiz.");
  if (!response.ok) throw new Error(`TMDB isteği başarısız (${response.status}).`);
  return response.json() as Promise<T>;
}

function toResult(raw: RawResult, fallbackKind?: "tv" | "movie"): TmdbSearchResult | undefined {
  const kind = raw.media_type === "tv" || raw.media_type === "movie" ? raw.media_type : fallbackKind;
  if (!kind) return undefined;
  const date = kind === "tv" ? raw.first_air_date : raw.release_date;
  return {
    tmdbId: raw.id,
    kind,
    name: (kind === "tv" ? raw.name : raw.title) ?? raw.name ?? raw.title ?? "",
    originalName: kind === "tv" ? raw.original_name : raw.original_title,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    posterPath: raw.poster_path ?? undefined,
    backdropPath: raw.backdrop_path ?? undefined,
    overview: raw.overview || undefined,
    popularity: raw.popularity,
  };
}

export async function testApiKey(apiKey: string) {
  await request(apiKey, "/configuration");
}

export async function searchTitles(apiKey: string, query: string): Promise<TmdbSearchResult[]> {
  const body = await request<{ results: RawResult[] }>(apiKey, "/search/multi", { query, language: "tr-TR", include_adult: "false" });
  return body.results.map((raw) => toResult(raw)).filter((item): item is TmdbSearchResult => Boolean(item?.name));
}

/**
 * Arama sonuçlarından en olası eşleşmeyi seçer. Ad birebir tutmuyorsa hiç
 * eşleştirmemek, yanlış diziye bölüm yazmaktan iyidir — kullanıcı elle seçer.
 */
export function pickBestMatch(parsed: ParsedMediaTitle, results: TmdbSearchResult[]): TmdbSearchResult | undefined {
  const wanted = normalizeTitle(parsed.query);
  if (!wanted) return undefined;
  let best: { result: TmdbSearchResult; score: number } | undefined;
  for (const [rank, result] of results.slice(0, 10).entries()) {
    const names = [result.name, result.originalName].filter(Boolean).map((name) => normalizeTitle(name!));
    let score = 0;
    if (names.includes(wanted)) score += 100;
    else if (names.some((name) => name.startsWith(`${wanted} `) || wanted.startsWith(`${name} `))) score += 45;
    else continue;
    if (parsed.kind !== "unknown") score += parsed.kind === result.kind ? 40 : -60;
    if (parsed.year && result.year) score += parsed.year === result.year ? 30 : Math.abs(parsed.year - result.year) <= 1 ? 10 : -30;
    score += Math.max(0, 10 - rank * 2);
    score += Math.min(10, Math.log10((result.popularity ?? 0) + 1) * 4);
    if (!best || score > best.score) best = { result, score };
  }
  return best && best.score >= 80 ? best.result : undefined;
}

type RawDetails = {
  genres?: { id: number; name: string }[];
  vote_average?: number;
  runtime?: number;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number } | null;
  seasons?: { season_number: number; episode_count: number }[];
};

/** Tür, puan, süre ve (dizide) sezon başına bölüm sayısı. */
export async function titleDetails(apiKey: string, kind: "tv" | "movie", tmdbId: number) {
  const body = await request<RawDetails>(apiKey, `/${kind}/${tmdbId}`, { language: "tr-TR" });
  const runtime = kind === "movie" ? body.runtime : body.episode_run_time?.[0] ?? body.last_episode_to_air?.runtime;
  return {
    genres: (body.genres ?? []).map((genre) => genre.name).filter(Boolean),
    voteAverage: body.vote_average || undefined,
    runtimeMinutes: runtime || undefined,
    seasons: kind === "tv" ? (body.seasons ?? []).map((item) => ({ season: item.season_number, episodeCount: item.episode_count })) : undefined,
  };
}

type RawProviders = { results?: Record<string, { link?: string; flatrate?: RawProvider[]; rent?: RawProvider[]; buy?: RawProvider[]; ads?: RawProvider[]; free?: RawProvider[] }> };
type RawProvider = { provider_id: number; provider_name: string; logo_path?: string };

const toProvider = (raw: RawProvider): WatchProvider => ({ id: raw.provider_id, name: raw.provider_name, logoPath: raw.logo_path });

/** Türkiye'de nerede izlenebildiği. Veri TMDB üzerinden JustWatch'tan gelir. */
export async function watchProviders(apiKey: string, kind: "tv" | "movie", tmdbId: number, region = "TR"): Promise<WatchProviders> {
  const body = await request<RawProviders>(apiKey, `/${kind}/${tmdbId}/watch/providers`);
  const local = body.results?.[region];
  return {
    link: local?.link,
    flatrate: [...(local?.flatrate ?? []), ...(local?.free ?? []), ...(local?.ads ?? [])].map(toProvider).filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index),
    rent: (local?.rent ?? []).map(toProvider),
    buy: (local?.buy ?? []).map(toProvider),
    fetchedAt: new Date().toISOString(),
  };
}
