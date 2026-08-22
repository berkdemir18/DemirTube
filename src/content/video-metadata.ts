import { classifyTopics } from "../analytics/topic-classifier";
import type { VideoMetadata } from "../shared/types";
import { getVideoId, normalizeChannelName, UNKNOWN_CHANNEL, usableTitle } from "../shared/utils";
import { readYouTubeOEmbed } from "../shared/youtube-oembed";
import { classifyContentType } from "../analytics/content-type";
import { readTranscriptAnalysis } from "./transcript-reader";
import { readPlayerVideoDetails } from "./player-details";

type YouTubePlayerResponse = {
  videoDetails?: {
    videoId?: string;
    isLiveContent?: boolean;
  };
  microformat?: {
    playerMicroformatRenderer?: {
      liveBroadcastDetails?: {
        isLiveNow?: boolean;
        endTimestamp?: string;
      };
    };
  };
  playabilityStatus?: {
    liveStreamability?: unknown;
  };
};

export function playerResponseIsLive(response?: YouTubePlayerResponse, expectedVideoId?: string) {
  const responseVideoId = response?.videoDetails?.videoId;
  if (expectedVideoId && responseVideoId && responseVideoId !== expectedVideoId) return false;
  const broadcast = response?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  if (broadcast?.isLiveNow === true) return true;
  if (broadcast?.endTimestamp) return false;
  return response?.videoDetails?.isLiveContent === true
    && response.playabilityStatus?.liveStreamability !== undefined;
}

function isVisibleLiveBadge(element: Element) {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0;
}

export function currentPlaybackIsLive(video?: HTMLVideoElement) {
  const response = (window as typeof window & { ytInitialPlayerResponse?: YouTubePlayerResponse }).ytInitialPlayerResponse;
  const currentVideoId = getVideoId();
  const responseVideoId = response?.videoDetails?.videoId;
  if (responseVideoId && currentVideoId) {
    // YouTube SPA geçişinde ytInitialPlayerResponse kısa süre önceki videoya
    // ait kalabilir. Kimlik eşleşmiyorsa eski canlı durumunu kesinlikle taşıma.
    return responseVideoId === currentVideoId && playerResponseIsLive(response, currentVideoId);
  }
  if (response?.videoDetails?.isLiveContent === false) return false;
  if (playerResponseIsLive(response, currentVideoId)) return true;
  if (video && video.duration === Infinity) return true;
  return [...document.querySelectorAll(
    ".ytp-live-badge, ytd-badge-supported-renderer [aria-label*='canlı yayın' i], ytd-badge-supported-renderer [aria-label*='live' i]"
  )].some(isVisibleLiveBadge);
}

const text = (selectors: string[]) => {
  for (const selector of selectors) {
    const value = document.querySelector<HTMLElement>(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
};

const attribute = (selectors: string[], name: string) => {
  for (const selector of selectors) {
    const value = document.querySelector<HTMLElement>(selector)?.getAttribute(name)?.trim();
    if (value) return value;
  }
  return "";
};

function activeShortRoot() {
  if (!location.pathname.startsWith("/shorts/")) return undefined;
  return document.querySelector<HTMLElement>("ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[aria-hidden='false'], ytd-shorts") ?? undefined;
}

function scopedText(root: ParentNode | undefined, selectors: string[]) {
  if (!root) return "";
  for (const selector of selectors) {
    const value = root.querySelector<HTMLElement>(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

async function waitForWatchMetadata(timeoutMs = 3_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const title = text(["ytd-watch-metadata h1 yt-formatted-string", "h1.ytd-watch-metadata"]);
    const channel = findChannelElement();
    if (title && channelNameFromElement(channel)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function findChannelElement() {
  const shortRoot = activeShortRoot();
  if (shortRoot) {
    const shortSelectors = [
      "ytd-reel-player-header-renderer #channel-name a", "ytd-reel-player-overlay-renderer #channel-name a",
      "#channel-name a[href^='/@']", "a[href^='/@']", "a[href^='/channel/']"
    ];
    for (const selector of shortSelectors) {
      const element = shortRoot.querySelector<HTMLAnchorElement>(selector);
      if (element && channelNameFromElement(element)) return element;
    }
  }
  const scopedSelectors = [
    "ytd-watch-metadata ytd-video-owner-renderer ytd-channel-name a",
    "ytd-watch-metadata #owner #channel-name a",
    "ytd-watch-metadata #owner ytd-channel-name a",
    "ytd-watch-metadata #owner a.yt-simple-endpoint",
    "#upload-info #channel-name a",
    "ytd-video-owner-renderer a[href^='/@']",
    "ytd-video-owner-renderer a[href^='/channel/']",
    "yt-content-metadata-view-model a[href^='/@']",
    "yt-lockup-metadata-view-model a[href^='/@']"
  ];
  for (const selector of scopedSelectors) {
    const element = document.querySelector<HTMLAnchorElement>(selector);
    if (element && channelNameFromElement(element)) return element;
  }
  return undefined;
}

function channelNameFromElement(element?: HTMLAnchorElement) {
  return element?.textContent?.trim()
    || element?.getAttribute("aria-label")?.trim()
    || element?.getAttribute("title")?.trim()
    || "";
}

function readStructuredAuthor() {
  for (const script of document.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json']")) {
    try {
      const value = JSON.parse(script.textContent ?? "") as { author?: { name?: string; url?: string } };
      if (value.author?.name) return value.author;
    } catch {
      // YouTube sayfasındaki ilgisiz veya eksik JSON-LD bloklarını atla.
    }
  }
  return undefined;
}

function playerDuration(video: HTMLVideoElement, bridgeLengthSeconds = 0) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  if (bridgeLengthSeconds > 0) return bridgeLengthSeconds;
  const durationMeta = attribute(["meta[itemprop='duration']", "meta[property='video:duration']"], "content");
  const seconds = Number(durationMeta);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const iso = durationMeta.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (iso) {
    const parsed = Number(iso[1] ?? 0) * 3_600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
    if (parsed > 0) return parsed;
  }
  // Not: `window.ytInitialPlayerResponse` izole içerik dünyasından görünmez;
  // bu değer yalnızca MAIN dünyadaki page-bridge üzerinden gelebilir.
  return 0;
}

function channelAvatar(channel?: HTMLAnchorElement) {
  const root = channel?.closest("ytd-video-owner-renderer, ytd-reel-video-renderer, ytd-reel-player-header-renderer, ytd-reel-player-overlay-renderer") ?? activeShortRoot();
  const image = root?.querySelector<HTMLImageElement>("#avatar img, #channel-thumbnail img, ytd-channel-name img, yt-img-shadow img, img#img, img")
    ?? document.querySelector<HTMLImageElement>("ytd-video-owner-renderer #avatar img, ytd-reel-video-renderer #avatar img");
  const source = image?.currentSrc || image?.src || image?.getAttribute("srcset")?.split(/\s+/)[0] || "";
  return /^https?:/i.test(source) ? source : undefined;
}

/** Oynatıcı süreyi hiç bildirmezse beklemenin üst sınırı. */
const DURATION_WAIT_MS = 3_000;
/** Metadata zaten yüklüyse süre ya hemen gelir ya da hiç gelmez; kısa bekle. */
const DURATION_WAIT_AFTER_METADATA_MS = 400;
/** HTMLMediaElement.HAVE_METADATA; global sabit her ortamda tanımlı değil. */
const HAVE_METADATA = 1;

function hasUsableDuration(video: HTMLVideoElement) {
  return Number.isFinite(video.duration) && video.duration > 0;
}

/**
 * SPA gezinmesinde YouTube aynı <video> ögesini yeniden kullanıyor: biz
 * dinlemeye başladığımızda "loadedmetadata" çoktan tetiklenmiş oluyor ve bir
 * daha hiç gelmiyor. Eski kod bu yüzden her videoda 3 saniyelik zaman aşımını
 * sonuna kadar bekliyor, izlemenin ilk saniyeleri hiç sayılmıyordu. Artık
 * süre kullanılabilir olur olmaz devam ediyoruz; metadata zaten yüklüyse
 * yalnızca kısa bir "durationchange" penceresi bekliyoruz.
 */
export function waitForUsableDuration(video: HTMLVideoElement) {
  const timeoutMs = video.readyState >= HAVE_METADATA
    ? DURATION_WAIT_AFTER_METADATA_MS
    : DURATION_WAIT_MS;
  return new Promise<void>((resolve) => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onEvent);
      video.removeEventListener("durationchange", onEvent);
      resolve();
    };
    const onEvent = () => { if (hasUsableDuration(video)) finish(); };
    video.addEventListener("loadedmetadata", onEvent);
    video.addEventListener("durationchange", onEvent);
    timer = window.setTimeout(finish, timeoutMs);
  });
}

export async function readVideoMetadata(video: HTMLVideoElement, includeTranscript = false): Promise<VideoMetadata> {
  if (!hasUsableDuration(video)) await waitForUsableDuration(video);
  await waitForWatchMetadata();
  const shortRoot = activeShortRoot();
  const videoId = getVideoId();
  // Shorts'ta oynatıcı künyesi başlık ve süre için tek güvenilir kaynaktır.
  const playerDetails = shortRoot ? await readPlayerVideoDetails(videoId) : undefined;
  const domTitle = usableTitle(playerDetails?.title ?? "")
    || usableTitle(scopedText(shortRoot, [
      "yt-shorts-video-title-view-model h2",
      "h2.ytShortsVideoTitleViewModelShortsVideoTitle",
      "ytd-reel-player-header-renderer h2.title",
      "ytd-reel-player-header-renderer #video-title",
      "#shorts-title"
    ]))
    || usableTitle(text(["ytd-watch-metadata h1 yt-formatted-string", "h1.ytd-watch-metadata yt-formatted-string", "h1.title yt-formatted-string"]))
    || usableTitle(attribute(["meta[name='title']", "meta[property='og:title']"], "content"))
    || usableTitle(document.title.replace(/ - YouTube$/, ""));
  const channelElement = findChannelElement();
  const structuredAuthor = readStructuredAuthor();
  const domChannelName = channelNameFromElement(channelElement)
    || attribute(["span[itemprop='author'] link[itemprop='name']", "link[itemprop='name']"], "content")
    || (shortRoot ? scopedText(shortRoot, ["#channel-name", "ytd-channel-name #text"]) : "")
    || text(["#owner-name a", "ytd-channel-name #text"])
    || structuredAuthor?.name
    || "";
  // oEmbed yalnızca kanal eksikken değil, başlık da okunamadığında istenir:
  // Shorts kayıtlarının %91'i bu yüzden başlıksız saklanmıştı.
  const oEmbed = domChannelName && domTitle ? undefined : await readYouTubeOEmbed(videoId);
  const title = domTitle || usableTitle(oEmbed?.title ?? "") || "Başlıksız video";
  // Keşfet kartıyla birebir aynı biçimde normalize edilir; aksi halde aynı kanal
  // iki farklı metin olarak saklanıp geçmiş eşleşmesi düşüyordu.
  const channelName = normalizeChannelName(domChannelName || oEmbed?.author_name || "") || UNKNOWN_CHANNEL;
  const description = attribute(["meta[name='description']", "meta[property='og:description']"], "content")
    || text(["#description-inline-expander", "ytd-text-inline-expander #plain-snippet-text"])
    || "";
  const hashtags = [...new Set(`${title} ${description}`.match(/#[\p{L}\p{N}_]+/gu) ?? [])].slice(0, 12);
  const chapterCount = document.querySelectorAll("ytd-macro-markers-list-item-renderer, .ytp-chapter-title-content").length;
  const authorUrl = channelElement?.href || structuredAuthor?.url || oEmbed?.author_url || "";
  const channelId = channelElement?.href.match(/\/channel\/([^/?]+)/)?.[1]
    || authorUrl.match(/\/channel\/([^/?]+)/)?.[1]
    || attribute(["meta[itemprop='channelId']"], "content")
    || undefined;
  const likePressed = document.querySelector<HTMLButtonElement>("#segmented-like-button button")?.getAttribute("aria-pressed");
  const dislikePressed = document.querySelector<HTMLButtonElement>("#segmented-dislike-button button")?.getAttribute("aria-pressed");
  const isLive = currentPlaybackIsLive(video);
  const isPremiere = Boolean(document.querySelector("[aria-label*='prömiyer' i], [aria-label*='premiere' i]"));
  const durationSeconds = playerDuration(video, playerDetails?.lengthSeconds ?? 0);
  const contentType = classifyContentType({
    path: location.pathname,
    durationSeconds,
    title,
    description,
    hashtags,
    channelName,
    isLive,
    isPremiere,
    category: attribute(["meta[itemprop='genre']"], "content"),
    chapterCount
  });
  const transcriptAnalysis = includeTranscript ? await readTranscriptAnalysis(title, description) : undefined;
  return {
    videoId,
    title,
    channelName,
    channelId,
    url: location.pathname.startsWith("/shorts/") ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
    durationSeconds,
    topics: classifyTopics(title, channelName, `${description} ${hashtags.join(" ")} ${transcriptAnalysis?.keywords.join(" ") ?? ""}`),
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    channelAvatarUrl: channelAvatar(channelElement),
    likeStatus: likePressed === "true" ? "liked" : dislikePressed === "true" ? "disliked" : likePressed ? "none" : "unknown",
    contentType,
    description: description.slice(0, 2_000),
    hashtags,
    chapterCount,
    transcriptAnalysis
  };
}
