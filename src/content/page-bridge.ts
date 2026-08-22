import {
  captionTracksFromPlayerResponse,
  sanitizeCaptionTracks,
  videoIdFromPlayerResponse,
  type CaptionTrack,
} from "./caption-tracks";

const BRIDGE_SOURCE = "demirtube-page-bridge";
const CONTENT_SOURCE = "demirtube-content";

type YouTubeWindow = Window & {
  ytInitialPlayerResponse?: unknown;
  ytplayer?: { config?: { args?: { player_response?: string | object } } };
};

function parsePlayerResponse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function playerResponses(): unknown[] {
  const youtubeWindow = window as YouTubeWindow;
  const moviePlayer = document.querySelector<HTMLElement>("#movie_player") as
    | (HTMLElement & { getPlayerResponse?: () => unknown })
    | null;
  const responses = [
    youtubeWindow.ytInitialPlayerResponse,
    parsePlayerResponse(youtubeWindow.ytplayer?.config?.args?.player_response),
  ];
  try {
    responses.push(moviePlayer?.getPlayerResponse?.());
  } catch {
    // Bazı oynatıcı sürümleri bu yöntemi dışarı açmıyor.
  }
  return responses.filter(Boolean);
}

function currentVideoId() {
  return new URL(location.href).searchParams.get("v") ?? location.pathname.match(/^\/shorts\/([\w-]+)/)?.[1] ?? "";
}

type VideoDetails = { videoId: string; title: string; lengthSeconds: number; author: string };

/**
 * Shorts sayfasında başlık ve süre DOM'dan güvenilir okunamıyor: başlık düğümü
 * geç geliyor, reel içinde başka h2'ler var ve <video> öğesi metadata'dan önce
 * sorulduğunda süre 0 dönüyor. Oynatıcı yanıtı bu ikisini kesin verir; ancak
 * yalnızca MAIN dünyada görünür olduğu için köprü üzerinden yayınlanır.
 */
function videoDetailsFrom(response: unknown): VideoDetails | undefined {
  const details = (response as { videoDetails?: Record<string, unknown> } | undefined)?.videoDetails;
  if (!details) return undefined;
  const videoId = typeof details.videoId === "string" ? details.videoId : "";
  const title = typeof details.title === "string" ? details.title : "";
  const author = typeof details.author === "string" ? details.author : "";
  const lengthSeconds = Number(details.lengthSeconds);
  if (!videoId) return undefined;
  return { videoId, title, author, lengthSeconds: Number.isFinite(lengthSeconds) && lengthSeconds > 0 ? lengthSeconds : 0 };
}

function publishVideoDetails(requestedVideoId = currentVideoId()) {
  for (const response of playerResponses()) {
    const details = videoDetailsFrom(response);
    if (!details) continue;
    // Shorts'ta bir önceki videonun yanıtı hâlâ bellekte olabilir; kimlik tutmuyorsa yayınlama.
    if (requestedVideoId && details.videoId !== requestedVideoId) continue;
    window.postMessage({ source: BRIDGE_SOURCE, type: "VIDEO_DETAILS", details }, location.origin);
    return;
  }
}

function publishCaptionTracks(requestedVideoId = currentVideoId()) {
  let tracks: CaptionTrack[] = [];
  let responseVideoId = "";
  for (const response of playerResponses()) {
    const candidate = captionTracksFromPlayerResponse(response);
    if (!candidate.length) continue;
    tracks = candidate;
    responseVideoId = videoIdFromPlayerResponse(response) ?? requestedVideoId;
    if (!requestedVideoId || responseVideoId === requestedVideoId) break;
  }
  const safeTracks = sanitizeCaptionTracks(tracks);
  if (!safeTracks.length || (requestedVideoId && responseVideoId && responseVideoId !== requestedVideoId)) return;
  window.postMessage({
    source: BRIDGE_SOURCE,
    type: "CAPTION_TRACKS",
    videoId: responseVideoId || requestedVideoId,
    tracks: safeTracks,
  }, location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: string; type?: string; videoId?: string } | null;
  if (data?.source !== CONTENT_SOURCE) return;
  const requested = typeof data.videoId === "string" ? data.videoId : undefined;
  if (data.type === "REQUEST_CAPTION_TRACKS") publishCaptionTracks(requested);
  if (data.type === "REQUEST_VIDEO_DETAILS") publishVideoDetails(requested);
});

document.addEventListener("yt-navigate-finish", () => {
  setTimeout(() => { publishCaptionTracks(); publishVideoDetails(); }, 0);
  setTimeout(() => { publishCaptionTracks(); publishVideoDetails(); }, 1_000);
});

publishCaptionTracks();
publishVideoDetails();
