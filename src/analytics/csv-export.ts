import type { VideoRecord } from "../shared/types";

/** Excel'in Türkçe yerelde sevdiği biçim: noktalı virgül ayraç + UTF-8 (BOM çağıran tarafta eklenir). */
export function videosToCsv(videos: VideoRecord[]): string {
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const percent = (value: number) => Math.round(value * 100);
  const header = [
    "Video ID", "Başlık", "Kanal", "Konular", "İçerik Türü", "Süre (sn)",
    "Aktif İzleme (sn)", "Benzersiz İzleme (sn)", "Tamamlama (%)", "Sarılma", "Pişmanlık",
    "Oturum Sayısı", "Tamamlandı", "İlk Görülme", "Son Görülme", "URL"
  ].join(";");
  const rows = videos.map((video) => [
    video.videoId,
    escape(video.title),
    escape(video.channelName),
    escape(video.topics.join(", ")),
    video.contentType,
    video.durationSeconds,
    Math.round(video.totalActiveWatchSeconds),
    Math.round(video.uniqueWatchedSeconds),
    percent(video.completionRate),
    video.engagementScore,
    video.regretScore,
    video.sessionCount,
    video.completed ? "Evet" : "Hayır",
    video.firstSeenAt,
    video.lastSeenAt,
    video.url
  ].join(";"));
  return [header, ...rows].join("\r\n");
}
