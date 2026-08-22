// DemirTube Aurora UI v2 · unified dashboard visual system
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, ExternalLink, Pause, RotateCcw, Search, SkipBack, SkipForward, Trash2 } from "lucide-react";
import type { ContentType, Topic, UserVideoFeedback, VideoFormat, VideoRecord, WatchSession } from "../shared/types";
import { VIDEO_FORMAT_OPTIONS } from "../analytics/video-intelligence";
import { formatDuration, round } from "../shared/utils";
import { Empty, Meter, PageHeading } from "./ui";
import { PlaybackHeatmap } from "./PlaybackHeatmap";
import { AttentionTimeline } from "./AttentionTimeline";
import { datedFileName, downloadFile, downloadVideosCsv } from "./file-download";

export function WatchHistory({
  videos,
  sessions,
  feedback,
  onDelete,
  onFeedback,
  onResetFeedback
}: {
  videos: VideoRecord[];
  sessions: WatchSession[];
  feedback: UserVideoFeedback[];
  onDelete: (id: string) => Promise<void>;
  onFeedback: (feedback: UserVideoFeedback) => Promise<void>;
  onResetFeedback: (videoId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [topic, setTopic] = useState("");
  const [channel, setChannel] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState("date");
  const [contentType, setContentType] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("demirtube-history-filters") ?? "{}") as Record<string, string | boolean>;
      if (typeof saved.topic === "string") setTopic(saved.topic);
      if (typeof saved.channel === "string") setChannel(saved.channel);
      if (typeof saved.contentType === "string") setContentType(saved.contentType);
      if (typeof saved.sort === "string") setSort(saved.sort);
      if (typeof saved.showExcluded === "boolean") setShowExcluded(saved.showExcluded);
    } catch { /* Bozuk eski filtre tercihini sessizce yok say. */ }
  }, []);
  useEffect(() => {
    localStorage.setItem("demirtube-history-filters", JSON.stringify({ topic, channel, contentType, sort, showExcluded }));
  }, [topic, channel, contentType, sort, showExcluded]);
  const topics = [...new Set(videos.flatMap((video) => video.topics))] as Topic[];
  const channels = [...new Set(videos.map((video) => video.channelName))];
  const sessionMap = useMemo(() => {
    const map = new Map<string, WatchSession[]>();
    for (const session of sessions) map.set(session.videoId, [...(map.get(session.videoId) ?? []), session]);
    return map;
  }, [sessions]);
  const filtered = useMemo(() => videos
    .filter((video) =>
      (!deferredQuery || `${video.title} ${video.channelName}`.toLocaleLowerCase("tr").includes(deferredQuery.toLocaleLowerCase("tr")))
      && (!topic || video.topics.includes(topic as Topic))
      && (!channel || video.channelName === channel)
      && (!date || video.lastSeenAt.slice(0, 10) === date)
      && (!contentType || video.contentType === contentType)
      && (showExcluded || !video.excludedFromAnalytics)
    )
    .toSorted((a, b) => sort === "completion"
      ? b.completionRate - a.completionRate
      : sort === "watch"
        ? b.totalWatchSeconds - a.totalWatchSeconds
        : sort === "regret"
          ? b.regretScore - a.regretScore
          : b.lastSeenAt.localeCompare(a.lastSeenAt)
    ), [videos, deferredQuery, topic, channel, date, contentType, sort, showExcluded]);
  const exportFiltered = () =>
    downloadFile(JSON.stringify(filtered, null, 2), datedFileName("demirtube-filtreli", "json"), "application/json");

  return <>
    <PageHeading eyebrow="DETAYLI KAYITLAR" title="İzleme Geçmişi" copy="Kayıtlarını ara, filtrele, sırala veya ayrıntılı oturum hareketlerini incele."/>
    <div className="filters premium-controls">
      <label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Video veya kanal ara…"/></label>
      <select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">Tüm konular</option>{topics.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Tüm kanallar</option>{channels.map((item) => <option key={item}>{item}</option>)}</select>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)}/>
      <select value={contentType} onChange={(event) => setContentType(event.target.value)}><option value="">Tüm içerik türleri</option><option value="short">Short</option><option value="standard">Standart</option><option value="long_form">Uzun format</option><option value="podcast">Podcast</option><option value="livestream">Canlı yayın</option><option value="premiere">Premiere</option><option value="music">Müzik</option><option value="unknown">Bilinmiyor</option></select>
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">En yeni</option><option value="completion">Tamamlama</option><option value="watch">İzleme süresi</option><option value="regret">Pişmanlık</option></select>
      <label className="check-label history-check"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)}/> Hariç tutulanlar</label>
      <button className="button" onClick={exportFiltered}><Download size={14}/>{filtered.length} sonuç · JSON</button>
      <button className="button" onClick={() => downloadVideosCsv(filtered, "demirtube-gecmis")} title="Görünen kayıtları Excel/Google Sheets için CSV olarak indir"><Download size={14}/>{filtered.length} sonuç · CSV</button>
    </div>
    {filtered.length ? <section className="surface table-wrap">
      <table>
        <thead><tr><th>Video</th><th>Kanal / konu</th><th>Toplam aktif</th><th>Benzersiz</th><th>Tekrar</th><th>Tamamlama</th><th>Sarılma</th><th>Pişmanlık</th><th>Güven</th><th>Tarih</th><th></th></tr></thead>
        <tbody>{filtered.map((video) => {
          const videoSessions = sessionMap.get(video.videoId) ?? [];
          const isExpanded = expanded === video.videoId;
          return <Fragment key={video.videoId}>
            <tr>
              <td><button className="history-title" onClick={() => setExpanded(isExpanded ? undefined : video.videoId)} aria-expanded={isExpanded}>
                {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt=""/> : null}
                <span>{video.title}<small>{video.isCurrentlyWatching ? "Şu anda izleniyor" : `${video.sessionCount} oturum`} </small></span>
                <ChevronDown className={isExpanded ? "rotated" : ""} size={15}/>
              </button></td>
              <td>{video.channelName}<small className="sub">{video.topics.join(", ")}</small></td>
              <td>{formatDuration(video.totalActiveWatchSeconds)}</td>
              <td>{formatDuration(video.uniqueWatchedSeconds)}</td>
              <td>{formatDuration(video.rewatchSeconds)}</td>
              <td><div className="completion-cell"><Meter value={video.completionRate * 100}/><span>%{round(video.completionRate * 100)}</span></div></td>
              <td><span className="score">{video.engagementScore}</span></td>
              <td>{video.isCurrentlyWatching ? <span className="insufficient">İzleniyor</span> : <span className={`regret regret-${Math.floor(video.regretScore / 30)}`}>{video.regretScore}</span>}</td>
              <td><span className={`confidence confidence-${video.regretConfidence ?? "low"}`}>{video.regretConfidence === "high" ? "Yüksek" : video.regretConfidence === "medium" ? "Orta" : "Düşük"}</span></td>
              <td>{new Date(video.lastSeenAt).toLocaleDateString("tr-TR")}</td>
              <td><div className="row-actions"><a className="icon-button" aria-label="YouTube'da aç" href={video.url} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a><button className="icon-button danger" aria-label={`${video.title} kaydını sil`} onClick={() => onDelete(video.videoId)}><Trash2 size={16}/></button></div></td>
            </tr>
            {isExpanded ? <tr className="history-detail-row"><td colSpan={11}><VideoDetails video={video} sessions={videoSessions} feedback={feedback.find((item) => item.videoId === video.videoId)} onFeedback={onFeedback} onResetFeedback={onResetFeedback}/></td></tr> : null}
          </Fragment>;
        })}</tbody>
      </table>
    </section> : <Empty>Filtrelere uyan kayıt bulunamadı.</Empty>}
  </>;
}

function VideoDetails({ video, sessions, feedback, onFeedback, onResetFeedback }: {
  video: VideoRecord;
  sessions: WatchSession[];
  feedback?: UserVideoFeedback;
  onFeedback: (feedback: UserVideoFeedback) => Promise<void>;
  onResetFeedback: (videoId: string) => Promise<void>;
}) {
  const save = (patch: Partial<UserVideoFeedback>) => onFeedback({
    videoId: video.videoId,
    updatedAt: new Date().toISOString(),
    ...feedback,
    ...patch
  });
  return <div className="video-detail">
    <section className="video-summary">
      <PlaybackHeatmap segments={sessions.flatMap((session) => session.playbackSegments)} durationSeconds={video.durationSeconds} exitPosition={sessions.toSorted((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]?.exitPosition} endedNaturally={sessions.some((session) => session.endedNaturally)}/>
      <AttentionTimeline video={video} sessions={sessions}/>
      <dl><div><dt>Toplam aktif</dt><dd>{formatDuration(video.totalActiveWatchSeconds)}</dd></div><div><dt>Benzersiz izleme</dt><dd>{formatDuration(video.uniqueWatchedSeconds)}</dd></div><div><dt>Tekrar izleme</dt><dd>{formatDuration(video.rewatchSeconds)}</dd></div><div><dt>Sarılma</dt><dd>{video.engagementScore}/100</dd></div></dl>
      <p><strong>Pişmanlık: {video.regretLabel ?? video.regretScore}</strong>{video.regretFactors?.join(" · ") || "Yeterli açıklama verisi birikiyor."}</p>
    </section>
    <section className="feedback-controls" aria-label="Video geri bildirimi">
      <div><span>Video nasıldı?</span><button className={feedback?.liked === true ? "selected" : ""} onClick={() => void save({ liked: true })}>Beğendim</button><button className={feedback?.liked === false ? "selected" : ""} onClick={() => void save({ liked: false })}>Beğenmedim</button></div>
      <div><span>Başlık</span><button className={feedback?.clickbait === true ? "selected" : ""} onClick={() => void save({ clickbait: true })}>Clickbait</button><button className={feedback?.clickbait === false ? "selected" : ""} onClick={() => void save({ clickbait: false })}>Clickbait değil</button></div>
      <label>İçerik türü<select value={feedback?.manualContentType ?? video.contentType} onChange={(event) => void save({ manualContentType: event.target.value as ContentType })}><option value="standard">Standart</option><option value="short">Short</option><option value="long_form">Uzun format</option><option value="podcast">Podcast</option><option value="livestream">Canlı yayın</option><option value="premiere">Premiere</option><option value="music">Müzik</option><option value="unknown">Bilinmiyor</option></select></label>
      <label>Video formatı<select value={feedback?.manualVideoFormat ?? video.videoFormat ?? "general"} onChange={(event) => void save({ manualVideoFormat: event.target.value as VideoFormat })}>
        {VIDEO_FORMAT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="topic-editor">Konular<input defaultValue={(feedback?.manualTopics ?? video.topics).join(", ")} onBlur={(event) => void save({ manualTopics: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></label>
      <label className="check-label"><input type="checkbox" checked={feedback?.accidentalClick ?? false} onChange={(event) => void save({ accidentalClick: event.target.checked })}/> Yanlışlıkla tıkladım</label>
      <label className="check-label"><input type="checkbox" checked={feedback?.excludedFromAnalytics ?? false} onChange={(event) => void save({ excludedFromAnalytics: event.target.checked })}/> Analizlerden hariç tut</label>
      {feedback ? <button className="button" onClick={() => void onResetFeedback(video.videoId)}><RotateCcw size={13}/>Elle düzeltmeleri sıfırla</button> : null}
    </section>
    <SessionDetails sessions={sessions}/>
  </div>;
}

function SessionDetails({ sessions }: { sessions: WatchSession[] }) {
  if (!sessions.length) return <p className="detail-empty">Bu kayıt için oturum ayrıntısı bulunamadı.</p>;
  return <div className="session-details">
    {sessions.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt)).map((session) => <article key={session.id}>
      <header><strong>{new Date(session.startedAt).toLocaleString("tr-TR")}</strong><span>{session.active ? "Aktif" : session.endedNaturally ? "Doğal bitti" : "Kapatıldı"}</span></header>
      <dl>
        <div><dt>Aktif izleme</dt><dd>{formatDuration(session.watchSeconds)}</dd></div>
        <div><dt>Çıkış konumu</dt><dd>{formatDuration(session.exitPosition ?? session.maximumPosition)}</dd></div>
        <div><dt><Pause size={13}/> Duraklatma</dt><dd>{session.pauseCount}</dd></div>
        <div><dt><SkipForward size={13}/> İleri</dt><dd>{session.forwardSeekCount}</dd></div>
        <div><dt><SkipBack size={13}/> Geri</dt><dd>{session.backwardSeekCount}</dd></div>
        <div><dt>İzlenen bölüm</dt><dd>{session.playbackSegments.length}</dd></div>
      </dl>
    </article>)}
  </div>;
}
