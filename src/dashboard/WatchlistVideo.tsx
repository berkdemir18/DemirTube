import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import type { WatchlistItem } from "../shared/types";
import { LearningCard } from "./LearningCard";

export type ListPresentation = { videoId: string; title?: string; thumbnailUrl?: string; channelAvatarUrl?: string; score?: number; label?: string };
const safeImage = (source?: string) => {
  try { const url = new URL(source ?? ""); return url.protocol === "https:" && /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/.test(url.hostname) ? url.href : undefined; } catch { return undefined; }
};

export function WatchlistVideo({ item, presentation, loading, failed, onSave, onRemove }: { item: WatchlistItem; presentation?: ListPresentation; loading: boolean; failed: boolean; onSave: (item: WatchlistItem) => Promise<void>; onRemove: (id: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const title = presentation?.title || item.title;
  const thumbnail = safeImage(presentation?.thumbnailUrl || item.thumbnailUrl) || `https://i.ytimg.com/vi/${encodeURIComponent(item.videoId)}/hqdefault.jpg`;
  const avatar = safeImage(presentation?.channelAvatarUrl || item.channelAvatarUrl);
  const seconds = Math.max(0, Math.round(item.durationSeconds));
  const time = seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const score = presentation?.score;
  return <article className="saved-video">
    <a className="saved-video-cover" href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`} target="_blank" rel="noreferrer" aria-label={`${title} videosunu aç`}>
      {!imageFailed ? <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <span className="saved-cover-fallback">Kapak kullanılamıyor</span>}
      <span className="saved-play"><Play size={25} fill="currentColor" /></span>
      {seconds > 0 && <span className="saved-duration">{time}</span>}
    </a>
    <div className="saved-video-info"><span className="saved-avatar">{avatar && !avatarFailed ? <img src={avatar} alt={`${item.channelName} kanal fotoğrafı`} loading="lazy" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : item.channelName.slice(0, 2).toLocaleUpperCase("tr-TR")}</span>
      <div className="saved-video-copy"><h2><a href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`} target="_blank" rel="noreferrer">{title}</a></h2><p>{item.channelName}</p><small>{item.topics.join(" · ") || "Konu bekleniyor"}</small></div>
      <button className="saved-remove" onClick={() => onRemove(item.videoId)} aria-label={`${title} videosunu listeden kaldır`}><Trash2 size={16} /></button>
    </div>
    <div className="saved-score" data-tone={score === undefined ? "unknown" : score >= 70 ? "good" : score >= 45 ? "medium" : "low"} title={presentation?.label}>
      <span>Uygunluk</span><strong>{score === undefined ? loading ? "Hesaplanıyor…" : failed ? "Hesaplanamadı" : "Veri yetersiz" : `${score}/100`}</strong><span>{score !== undefined ? presentation?.label : ""}</span>
    </div>
    <LearningCard item={item} onSave={onSave} />
  </article>;
}
