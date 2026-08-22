// DemirTube Aurora UI v2 · unified dashboard visual system
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { feedbackQueue } from "../analytics/feedback-queue";
import type { ContentType, UserVideoFeedback, VideoFormat, VideoRecord } from "../shared/types";
import { VIDEO_FORMAT_OPTIONS } from "../analytics/video-intelligence";
import { Empty, PageHeading } from "./ui";

export function FeedbackCenter({ videos, feedback, onSave, onReset }: {
  videos: VideoRecord[];
  feedback: UserVideoFeedback[];
  onSave: (feedback: UserVideoFeedback) => Promise<void>;
  onReset: (videoId: string) => Promise<void>;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const queue = useMemo(() => feedbackQueue(videos, feedback), [videos, feedback]);
  const completed = videos.filter((video) => feedback.some((item) => item.videoId === video.videoId));
  const items = showCompleted ? completed.map((video) => ({ video, reason: "Daha önce düzeltildi", priority: 0 })) : queue;
  return <><PageHeading eyebrow="MODEL EĞİTİMİ" title="Geri Bildirim Merkezi" copy="DemirTube’un emin olmadığı kayıtları hızlıca düzelt; açık geri bildirimin davranış tahminlerinden önce gelir."/>
    <div className="feedback-toolbar premium-toolbar"><span>{queue.length} kayıt doğrulama bekliyor</span><button className="button" onClick={() => setShowCompleted((value) => !value)}>{showCompleted ? "Bekleyenleri göster" : "Düzeltilenleri göster"}</button></div>
    {items.length ? <div className="feedback-queue">{items.map(({ video, reason }) => <FeedbackCard key={video.videoId} video={video} reason={reason} current={feedback.find((item) => item.videoId === video.videoId)} onSave={onSave} onReset={onReset}/>)}</div> : <Empty><span><CheckCircle2/> Şimdilik doğrulama bekleyen kayıt yok.</span></Empty>}
  </>;
}

function FeedbackCard({ video, reason, current, onSave, onReset }: {
  video: VideoRecord; reason: string; current?: UserVideoFeedback;
  onSave: (feedback: UserVideoFeedback) => Promise<void>; onReset: (videoId: string) => Promise<void>;
}) {
  const save = (patch: Partial<UserVideoFeedback>) => onSave({ videoId: video.videoId, updatedAt: new Date().toISOString(), ...current, ...patch });
  return <article className="surface feedback-card">
    {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt=""/> : <div className="feedback-thumb"/>}
    <div className="feedback-card-copy"><span>{reason}</span><h2>{video.title}</h2><p>{video.channelName} · {video.contentType} · {video.regretLabel ?? "Puanlanıyor"}</p>
      <label>Konular<input defaultValue={(current?.manualTopics ?? video.topics).join(", ")} onBlur={(event) => void save({ manualTopics: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></label>
    </div>
    <div className="feedback-card-actions">
      <div><button className={current?.liked === true ? "selected" : ""} onClick={() => void save({ liked: true })}>Sardı</button><button className={current?.liked === false ? "selected" : ""} onClick={() => void save({ liked: false })}>Sarmadı</button></div>
      <div><button className={current?.clickbait === true ? "selected danger" : ""} onClick={() => void save({ clickbait: true })}>Clickbait</button><button className={current?.clickbait === false ? "selected" : ""} onClick={() => void save({ clickbait: false })}>Değil</button></div>
      <select value={current?.manualContentType ?? video.contentType} onChange={(event) => void save({ manualContentType: event.target.value as ContentType })}><option value="short">Short</option><option value="standard">Standart</option><option value="long_form">Uzun format</option><option value="podcast">Podcast</option><option value="livestream">Canlı yayın</option><option value="premiere">Premiere</option><option value="music">Müzik</option><option value="unknown">Bilinmiyor</option></select>
      <select aria-label="Video formatı" value={current?.manualVideoFormat ?? video.videoFormat ?? "general"} onChange={(event) => void save({ manualVideoFormat: event.target.value as VideoFormat })}>
        {VIDEO_FORMAT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label className="check-label"><input type="checkbox" checked={current?.excludedFromAnalytics ?? false} onChange={(event) => void save({ excludedFromAnalytics: event.target.checked })}/> Analiz dışı</label>
      {current ? <button className="reset-link" onClick={() => void onReset(video.videoId)}><RotateCcw size={13}/> Sıfırla</button> : null}
    </div>
  </article>;
}
