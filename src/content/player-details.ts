// DemirTube · oynatıcı künyesi köprüsü (izole dünya tarafı)
//
// Shorts sayfasında başlık ve süre DOM'dan güvenilir okunamaz: başlık düğümü
// geç gelir, reel içinde başka `h2` öğeleri vardır ve `<video>` öğesi metadata
// yüklenmeden sorulduğunda süre 0 döner. Oynatıcı yanıtındaki `videoDetails`
// ikisini de kesin verir; MAIN dünyada çalışan page-bridge bunu yayınlar.
const BRIDGE_SOURCE = "demirtube-page-bridge";
const CONTENT_SOURCE = "demirtube-content";

export type PlayerVideoDetails = { videoId: string; title: string; lengthSeconds: number; author: string };

const cache = new Map<string, PlayerVideoDetails>();
const waiting = new Map<string, Array<(details: PlayerVideoDetails) => void>>();

function isDetails(value: unknown): value is PlayerVideoDetails {
  const candidate = value as Partial<PlayerVideoDetails> | undefined;
  return Boolean(candidate && typeof candidate.videoId === "string" && candidate.videoId
    && typeof candidate.title === "string" && typeof candidate.lengthSeconds === "number");
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: string; type?: string; details?: unknown } | null;
    if (data?.source !== BRIDGE_SOURCE || data.type !== "VIDEO_DETAILS" || !isDetails(data.details)) return;
    const details = data.details;
    cache.set(details.videoId, details);
    for (const resolve of waiting.get(details.videoId) ?? []) resolve(details);
    waiting.delete(details.videoId);
  });
}

/** Köprüden künyeyi ister; gelmezse undefined döner ve çağıran DOM'a düşer. */
export function readPlayerVideoDetails(videoId: string, timeoutMs = 1_500): Promise<PlayerVideoDetails | undefined> {
  if (!videoId || typeof window === "undefined") return Promise.resolve(undefined);
  const cached = cache.get(videoId);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const listeners = waiting.get(videoId) ?? [];
    let settled = false;
    const finish = (details?: PlayerVideoDetails) => {
      if (settled) return;
      settled = true;
      resolve(details);
    };
    listeners.push(finish);
    waiting.set(videoId, listeners);
    window.postMessage({ source: CONTENT_SOURCE, type: "REQUEST_VIDEO_DETAILS", videoId }, location.origin);
    setTimeout(() => finish(cache.get(videoId)), timeoutMs);
  });
}

export function resetPlayerDetailsCacheForTests() {
  cache.clear();
  waiting.clear();
}
