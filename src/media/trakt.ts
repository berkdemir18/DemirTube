// DemirTube · Trakt istemcisi
//
// Cihaz kodu akışı: kullanıcı trakt.tv/activate'te kısa bir kod girer, şifresi
// eklentiye hiç girmez. 2025'ten beri erişim belirteci 24 saat geçerli ve
// yenileme belirteci tek kullanımlık; bu yüzden her yenilemede ikisi birlikte
// kalıcı olarak yazılır.

const API = "https://api.trakt.tv";
/** Cihaz akışında Trakt'ın beklediği sabit yönlendirme adresi. */
export const TRAKT_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export interface TraktAuth {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  /** ms cinsinden */
  expiresAt?: number;
  username?: string;
  lastSyncAt?: string;
}

export interface TraktIds { trakt?: number; slug?: string; imdb?: string; tmdb?: number | null; tvdb?: number | null }
export interface TraktMedia { title: string; year?: number | null; ids: TraktIds }
export interface TraktEpisode { season: number; number: number; title?: string | null; ids: TraktIds; runtime?: number | null }

export interface TraktHistoryItem {
  id: number;
  watched_at: string;
  action?: string;
  type: "movie" | "episode";
  movie?: TraktMedia & { runtime?: number | null };
  episode?: TraktEpisode;
  show?: TraktMedia;
}

export interface TraktRatingItem {
  rated_at: string;
  rating: number;
  type: "movie" | "show" | "season" | "episode";
  movie?: TraktMedia;
  show?: TraktMedia;
}

export interface TraktWatchlistItem {
  listed_at: string;
  type: "movie" | "show" | "season" | "episode";
  movie?: TraktMedia;
  show?: TraktMedia;
}

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export type PollResult =
  | { state: "authorized"; auth: TraktAuth }
  | { state: "pending" | "slow-down" | "denied" | "expired" | "invalid" };

type Fetcher = typeof fetch;

function headers(clientId: string, accessToken?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function requestDeviceCode(clientId: string, fetcher: Fetcher = fetch): Promise<DeviceCode> {
  const response = await fetcher(`${API}/oauth/device/code`, { method: "POST", headers: headers(clientId), body: JSON.stringify({ client_id: clientId }) });
  if (response.status === 401 || response.status === 403) throw new Error("Trakt Client ID kabul edilmedi. trakt.tv/oauth/applications sayfasındaki değeri kontrol et.");
  if (!response.ok) throw new Error(`Trakt kod vermedi (${response.status}).`);
  return response.json() as Promise<DeviceCode>;
}

function withTokens(auth: TraktAuth, body: { access_token: string; refresh_token: string; expires_in: number; created_at?: number }): TraktAuth {
  const created = body.created_at ? body.created_at * 1000 : Date.now();
  return { ...auth, accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: created + body.expires_in * 1000 };
}

/** Kullanıcı kodu girene kadar `pending` döner. Aralığı Trakt'ın verdiği `interval` belirler. */
export async function pollDeviceToken(auth: TraktAuth, deviceCode: string, fetcher: Fetcher = fetch): Promise<PollResult> {
  const response = await fetcher(`${API}/oauth/device/token`, {
    method: "POST",
    headers: headers(auth.clientId),
    // Eski belgeler "code", yenileri "device_code" diyor; ikisi birden gönderilir.
    body: JSON.stringify({ code: deviceCode, device_code: deviceCode, client_id: auth.clientId, client_secret: auth.clientSecret }),
  });
  switch (response.status) {
    case 200: return { state: "authorized", auth: withTokens(auth, await response.json()) };
    case 400: return { state: "pending" };
    case 429: return { state: "slow-down" };
    case 418: return { state: "denied" };
    case 410: return { state: "expired" };
    case 401: case 403: throw new Error("Trakt Client Secret kabul edilmedi.");
    default: return { state: "invalid" };
  }
}

export async function refreshAccessToken(auth: TraktAuth, fetcher: Fetcher = fetch): Promise<TraktAuth> {
  if (!auth.refreshToken) throw new Error("Trakt bağlantısı yok.");
  const response = await fetcher(`${API}/oauth/token`, {
    method: "POST",
    headers: headers(auth.clientId),
    body: JSON.stringify({ refresh_token: auth.refreshToken, client_id: auth.clientId, client_secret: auth.clientSecret, redirect_uri: TRAKT_REDIRECT_URI, grant_type: "refresh_token" }),
  });
  if (response.status === 400 || response.status === 401) throw new Error("Trakt bağlantısının süresi dolmuş; yeniden bağlan.");
  if (!response.ok) throw new Error(`Trakt belirteci yenilenemedi (${response.status}).`);
  return withTokens(auth, await response.json());
}

/** Belirtecin son 10 dakikasındaysa yeniler; yenilenen belirteç çağırana döner ki kalıcı yazılsın. */
export async function ensureFreshAuth(auth: TraktAuth, fetcher: Fetcher = fetch, now = Date.now()): Promise<TraktAuth> {
  if (!auth.accessToken) throw new Error("Trakt bağlı değil.");
  if (auth.expiresAt && auth.expiresAt - now > 10 * 60 * 1000) return auth;
  return refreshAccessToken(auth, fetcher);
}

async function getJson<T>(auth: TraktAuth, path: string, fetcher: Fetcher): Promise<{ body: T; pageCount: number }> {
  const response = await fetcher(`${API}${path}`, { headers: headers(auth.clientId, auth.accessToken) });
  if (response.status === 401) throw new Error("Trakt bağlantısı reddedildi; yeniden bağlan.");
  if (response.status === 429) throw new Error("Trakt istek sınırına takıldı; birkaç dakika sonra tekrar dene.");
  if (!response.ok) throw new Error(`Trakt isteği başarısız (${response.status}).`);
  return { body: await response.json() as T, pageCount: Number(response.headers.get("X-Pagination-Page-Count") ?? 1) || 1 };
}

export async function fetchUsername(auth: TraktAuth, fetcher: Fetcher = fetch) {
  const { body } = await getJson<{ user?: { username?: string } }>(auth, "/users/settings", fetcher);
  return body.user?.username;
}

/** İzleme geçmişinin tamamı ya da `startAt`'ten sonrası. Güvenlik için en fazla 40 sayfa × 250. */
export async function fetchHistory(auth: TraktAuth, startAt?: string, fetcher: Fetcher = fetch, onPage?: (page: number, pages: number) => void) {
  const items: TraktHistoryItem[] = [];
  let pages = 1;
  for (let page = 1; page <= Math.min(pages, 40); page += 1) {
    const query = new URLSearchParams({ page: String(page), limit: "250", extended: "full" });
    if (startAt) query.set("start_at", startAt);
    const result = await getJson<TraktHistoryItem[]>(auth, `/sync/history?${query}`, fetcher);
    items.push(...result.body);
    pages = result.pageCount;
    onPage?.(page, pages);
  }
  return items;
}

export async function fetchRatings(auth: TraktAuth, fetcher: Fetcher = fetch) {
  const [movies, shows] = await Promise.all([
    getJson<TraktRatingItem[]>(auth, "/sync/ratings/movies", fetcher),
    getJson<TraktRatingItem[]>(auth, "/sync/ratings/shows", fetcher),
  ]);
  return [...movies.body, ...shows.body];
}

export async function fetchWatchlist(auth: TraktAuth, fetcher: Fetcher = fetch) {
  const [movies, shows] = await Promise.all([
    getJson<TraktWatchlistItem[]>(auth, "/sync/watchlist/movies", fetcher),
    getJson<TraktWatchlistItem[]>(auth, "/sync/watchlist/shows", fetcher),
  ]);
  return [...movies.body, ...shows.body];
}
