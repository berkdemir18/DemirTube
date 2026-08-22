import { analyzeTranscript, type TranscriptSegment } from "../analytics/transcript-analysis";
import type { TranscriptAnalysis } from "../shared/types";
import { getVideoId } from "../shared/utils";
import { sendMessage } from "../shared/messages";
import { sanitizeCaptionTracks, type CaptionTrack } from "./caption-tracks";

const BRIDGE_SOURCE = "demirtube-page-bridge";
const CONTENT_SOURCE = "demirtube-content";
const bridgeTracks = new Map<string, CaptionTrack[]>();

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: string; type?: string; videoId?: string; tracks?: CaptionTrack[] } | null;
    if (data?.source !== BRIDGE_SOURCE || data.type !== "CAPTION_TRACKS" || !data.videoId || !Array.isArray(data.tracks)) return;
    const safeTracks = sanitizeCaptionTracks(data.tracks);
    if (safeTracks.length) bridgeTracks.set(data.videoId, safeTracks);
  });
}

function balancedArray(source: string, start: number) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") quoted = false;
      continue;
    }
    if (character === "\"") quoted = true;
    else if (character === "[") depth += 1;
    else if (character === "]" && --depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

export function captionTracksFromSource(source: string): CaptionTrack[] {
  let offset = 0;
  while (offset < source.length) {
    const marker = source.indexOf("\"captionTracks\":", offset);
    if (marker < 0) return [];
    const start = source.indexOf("[", marker);
    if (start < 0) return [];
    try {
      const tracks = JSON.parse(balancedArray(source, start)) as CaptionTrack[];
      if (tracks.some((track) => track.baseUrl)) return tracks;
    } catch {
      // Aynı kaynak içindeki sonraki olası oynatıcı yanıtını dene.
    }
    offset = start + 1;
  }
  return [];
}

function captionTracksFromPage(): CaptionTrack[] {
  for (const script of document.scripts) {
    const tracks = captionTracksFromSource(script.textContent ?? "");
    if (tracks.length) return tracks;
  }
  return [];
}

function visibleTranscript(): TranscriptSegment[] {
  return [...document.querySelectorAll<HTMLElement>(
    "ytd-transcript-segment-renderer, yt-formatted-string.segment-text, [class*='transcript-segment']"
  )].map((element, index) => {
    const text = element.querySelector<HTMLElement>(".segment-text")?.textContent?.trim()
      || element.textContent?.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, "").trim()
      || "";
    const timestamp = element.querySelector<HTMLElement>(".segment-timestamp")?.textContent?.trim() ?? "";
    const parts = timestamp.split(":").map(Number);
    const startSeconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2 ? parts[0] * 60 + parts[1]
        : index * 5;
    return { startSeconds, text };
  }).filter((segment) => segment.text);
}

export function parseJson3Transcript(payload: {
  events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
}): TranscriptSegment[] {
  return (payload.events ?? []).map((event) => ({
    startSeconds: (event.tStartMs ?? 0) / 1_000,
    text: (event.segs ?? []).map((segment) => segment.utf8 ?? "").join("").replace(/\s+/g, " ").trim()
  })).filter((segment) => segment.text).slice(0, 10_000);
}

export function parseTimedTextXml(source: string): TranscriptSegment[] {
  const decode = (value: string) => value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
  const elements = [...source.matchAll(/<(text|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
  return elements.map((match) => {
    const attributes = match[2] ?? "";
    const startValue = attributes.match(/\bstart="([^"]+)"/i)?.[1];
    const timedValue = attributes.match(/\bt="([^"]+)"/i)?.[1];
    const legacyStart = Number(startValue);
    const timedStartMs = Number(timedValue);
    return {
      startSeconds: startValue !== undefined && Number.isFinite(legacyStart)
        ? legacyStart
        : timedValue !== undefined && Number.isFinite(timedStartMs) ? timedStartMs / 1_000 : 0,
      text: decode(match[3] ?? "").replace(/\s+/g, " ").trim()
    };
  }).filter((segment) => segment.text).slice(0, 10_000);
}

async function tracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {
  if (!videoId) return [];
  const response = await fetch(`/watch?v=${encodeURIComponent(videoId)}&hl=tr`, {
    credentials: "include",
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return [];
  return captionTracksFromSource(await response.text());
}

async function tracksFromPlayerBridge(videoId: string): Promise<CaptionTrack[]> {
  const cached = bridgeTracks.get(videoId);
  if (cached?.length) return cached;
  window.postMessage({ source: CONTENT_SOURCE, type: "REQUEST_CAPTION_TRACKS", videoId }, location.origin);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_800) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const tracks = bridgeTracks.get(videoId);
    if (tracks?.length) return tracks;
  }
  return [];
}

async function remoteTranscript(track: CaptionTrack): Promise<TranscriptSegment[]> {
  if (!track.baseUrl) return [];
  const original = new URL(track.baseUrl);
  if (!/(^|\.)youtube\.com$/i.test(original.hostname) || original.pathname !== "/api/timedtext") return [];
  const json3 = new URL(original);
  json3.searchParams.set("fmt", "json3");
  for (const url of [json3, original]) {
    let source = "";
    try {
      const result = await sendMessage<{ source?: string }>({ type: "FETCH_YOUTUBE_CAPTIONS", url: url.toString() });
      source = result?.source ?? "";
    } catch {
      const response = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(7_000) });
      if (!response.ok) continue;
      source = await response.text();
    }
    if (!source.trim()) continue;
    try {
      const segments = parseJson3Transcript(JSON.parse(source));
      if (segments.length) return segments;
    } catch {
      const segments = parseTimedTextXml(source);
      if (segments.length) return segments;
    }
  }
  return [];
}

function unavailableTranscript(
  title: string,
  description: string,
  status: NonNullable<TranscriptAnalysis["status"]>,
  language?: string
): TranscriptAnalysis {
  return { ...analyzeTranscript([], title, description, language), status };
}

export function rankCaptionTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  const languageRank = (language = "") => /^tr(?:-|$)/i.test(language) ? 0 : /^en(?:-|$)/i.test(language) ? 1 : 2;
  return [...tracks].toSorted((a, b) =>
    languageRank(a.languageCode) - languageRank(b.languageCode)
    || Number(Boolean(a.kind)) - Number(Boolean(b.kind))
  );
}

export async function readTranscriptAnalysis(
  title: string,
  description = "",
  videoId = getVideoId()
): Promise<TranscriptAnalysis> {
  let visible = visibleTranscript();
  if (visible.length) return analyzeTranscript(visible, title, description);
  let tracks = await tracksFromPlayerBridge(videoId);
  if (!tracks.length) tracks = captionTracksFromPage();
  if (!tracks.length) {
    try {
      tracks = await tracksFromWatchPage(videoId);
    } catch {
      // YouTube sayfası fallback'i başarısız olursa yerel analiz kesintisiz sürer.
    }
  }
  if (!tracks.length) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    visible = visibleTranscript();
    if (visible.length) return analyzeTranscript(visible, title, description);
    tracks = captionTracksFromPage();
  }
  if (!tracks.length) return unavailableTranscript(title, description, "no_tracks");
  let fetchFailed = false;
  for (const track of rankCaptionTracks(tracks).slice(0, 4)) {
    try {
      const segments = await remoteTranscript(track);
      if (segments.length) return analyzeTranscript(segments, title, description, track.languageCode);
    } catch {
      fetchFailed = true;
    }
  }
  return unavailableTranscript(title, description, fetchFailed ? "fetch_failed" : "empty_track", tracks[0]?.languageCode);
}
