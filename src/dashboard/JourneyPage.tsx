import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Compass, Route } from "lucide-react";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { buildWatchJourney, detectWatchAnomalies } from "../analytics/insights-suite";
import { Empty, PageHeading } from "./ui";

export function JourneyPage({ videos, sessions, allVideos, allSessions }: { videos: VideoRecord[]; sessions: WatchSession[]; allVideos: VideoRecord[]; allSessions: WatchSession[] }) {
  const journeys = buildWatchJourney(videos, sessions);
  const anomalies = detectWatchAnomalies(allVideos, allSessions);
  return <>
    <PageHeading eyebrow="OTURUM ZEKÂSI" title="İzleme Yolculuğu" copy="Video geçişlerini, konu değişimlerini ve izleme modlarını oturum oturum gösterir." />
    {anomalies.length ? <section className="journey-alerts">{anomalies.map((item) => <article className={`surface ${item.kind}`} key={item.title}>{item.kind === "positive" ? <CheckCircle2/> : item.kind === "warning" ? <AlertTriangle/> : <Compass/>}<div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</section> : null}
    {journeys.length ? <section className="journey-list">{journeys.map((journey) => <article className={`surface journey-card journey-${journey.mode}`} key={journey.id}>
      <header><span><Route size={18}/><div><small>{new Date(journey.startedAt).toLocaleDateString("tr-TR", { day:"numeric", month:"long" })}</small><strong>{journey.label}</strong></div></span><b><Clock3 size={14}/>{formatDuration(journey.watchSeconds)}</b></header>
      <div className="journey-flow">{journey.items.map((item, index) => <div className="journey-item" key={item.session.id}>{index ? <ArrowRight className="journey-arrow" size={14}/> : null}<span className={item.video?.contentType === "short" ? "short" : ""}>{item.video?.thumbnailUrl ? <img src={item.video.thumbnailUrl} alt=""/> : <i/>}<em><small>{new Date(item.session.startedAt).toLocaleTimeString("tr-TR", { hour:"2-digit", minute:"2-digit" })} · {formatDuration(item.session.watchSeconds)}</small><strong>{item.video?.title ?? item.session.videoId}</strong>{item.transition ? <b>{item.transition}</b> : null}</em></span></div>)}</div>
    </article>)}</section> : <Empty>Seçili dönemde izleme yolculuğu oluşturacak oturum yok.</Empty>}
  </>;
}
