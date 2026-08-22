export type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
};

type PlayerResponse = {
  videoDetails?: { videoId?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

export function captionTracksFromPlayerResponse(value: unknown): CaptionTrack[] {
  if (!value || typeof value !== "object") return [];
  const tracks = (value as PlayerResponse).captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? tracks.filter((track) => typeof track?.baseUrl === "string") : [];
}

export function videoIdFromPlayerResponse(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const videoId = (value as PlayerResponse).videoDetails?.videoId;
  return typeof videoId === "string" && /^[\w-]{6,20}$/.test(videoId) ? videoId : undefined;
}

export function sanitizeCaptionTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  return tracks.slice(0, 20).flatMap((track) => {
    if (!track.baseUrl || track.baseUrl.length > 8_000) return [];
    try {
      const url = new URL(track.baseUrl, location.origin);
      if (!/(^|\.)youtube\.com$/i.test(url.hostname) || url.pathname !== "/api/timedtext") return [];
      return [{
        baseUrl: url.toString(),
        languageCode: track.languageCode?.slice(0, 32),
        kind: track.kind?.slice(0, 32),
      }];
    } catch {
      return [];
    }
  });
}

export function isAllowedCaptionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && /(^|\.)youtube\.com$/i.test(url.hostname)
      && url.pathname === "/api/timedtext";
  } catch {
    return false;
  }
}
