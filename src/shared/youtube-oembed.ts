export type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
  author_url?: string;
};

export async function readYouTubeOEmbed(videoId: string): Promise<YouTubeOEmbed | undefined> {
  if (!videoId) return undefined;
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
      credentials: "omit",
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return undefined;
    return await response.json() as YouTubeOEmbed;
  } catch {
    return undefined;
  }
}
