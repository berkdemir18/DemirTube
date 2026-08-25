import { Activity, CalendarRange, Clock3, Layers3, Repeat2, TimerReset } from "lucide-react";
import { chartSeries } from "./chart-theme";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { advancedStatistics } from "../analytics/statistics";
import { ChartFrame, Empty, Meter, PageHeading } from "./ui";
import { useState } from "react";

export function StatisticsPage({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const [evidenceMetric, setEvidenceMetric] = useState<string>();
  const stats = advancedStatistics(videos, sessions);
  if (!videos.length && !sessions.length) return (
    <><PageHeading eyebrow="İZLEME ANATOMİSİ" title="İstatistikler" copy="Süre, tekrar, oturum ve format davranışını aynı ekranda birleştirir." /><Empty /></>
  );

  const cards = [
    [Clock3, "Aktif izleme", formatDuration(stats.activeWatchSeconds)],
    [TimerReset, "Ortalama oturum", formatDuration(stats.averageSessionSeconds)],
    [Repeat2, "Tekrar payı", `%${stats.activeWatchSeconds ? round(stats.rewatchSeconds / stats.activeWatchSeconds * 100) : 0}`],
    [CalendarRange, "Aktif gün", String(stats.activeDayCount)],
    [Layers3, "Oturum / video", stats.videoCount ? (stats.sessionCount / stats.videoCount).toFixed(1) : "0"],
    [Activity, "En uzun oturum", formatDuration(stats.longestSessionSeconds)]
  ] as const;

  return (
    <>
      <PageHeading eyebrow="İZLEME ANATOMİSİ" title="İstatistikler" copy="Ne kadar izlediğinden öte, izleme sürenin nasıl oluştuğunu gösterir." />
      <section className="stats-metric-grid">
        {cards.map(([Icon, label, value]) => <button type="button" className={`surface stats-metric ${evidenceMetric === label ? "active" : ""}`} key={label} onClick={() => setEvidenceMetric((current) => current === label ? undefined : label)}><Icon size={18}/><small>{label}</small><strong>{value}</strong><em>Kanıtı gör</em></button>)}
      </section>
      {evidenceMetric ? <MetricEvidence metric={evidenceMetric} videos={videos} sessions={sessions} onClose={() => setEvidenceMetric(undefined)}/> : null}
      <div className="stats-analysis-grid">
        <section className="surface chart-block">
          <div className="section-head"><div><h2>Günün ritmi</h2><p>Gerçek aktif sürenin dört saatlik dağılımı · zirve {stats.peakHourLabel}</p></div></div>
          <ChartFrame summary={`Günün ritmi: ${stats.hourly.map((row) => `${row.label} ${formatDuration(row.seconds)}`).join(", ")}.`}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.hourly}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label"/><YAxis tickFormatter={(value) => `${round(Number(value) / 60)} dk`}/><Tooltip formatter={(value) => formatDuration(Number(value))}/><Bar dataKey="seconds" name="Aktif izleme" fill={chartSeries[1]} radius={[7,7,0,0]} isAnimationActive={false}/></BarChart>
          </ResponsiveContainer>
          </ChartFrame>
        </section>
        <section className="surface stats-quality">
          <h2>İzleme kalitesi</h2>
          <div><span>Ortalama tamamlama</span><b>%{stats.averageCompletion}</b><Meter value={stats.averageCompletion}/></div>
          <div><span>Tamamlanan video</span><b>%{stats.completedRate}</b><Meter value={stats.completedRate}/></div>
          <div><span>Yeniden dönülen video</span><b>%{stats.revisitRate}</b><Meter value={stats.revisitRate}/></div>
          <dl><div><dt>Benzersiz süre</dt><dd>{formatDuration(stats.uniqueWatchSeconds)}</dd></div><div><dt>Tekrar izleme</dt><dd>{formatDuration(stats.rewatchSeconds)}</dd></div></dl>
        </section>
      </div>
      <section className="surface stats-formats">
        <div className="section-head"><div><h2>Format performansı</h2><p>İzleme süresini hangi video biçimlerinin taşıdığı</p></div></div>
        <div>{stats.formats.slice(0, 8).map((format) => <article key={format.label}><span><strong>{format.label}</strong><small>{format.count} video</small></span><b>{formatDuration(format.seconds)}</b><Meter value={stats.activeWatchSeconds ? format.seconds / stats.activeWatchSeconds * 100 : 0}/></article>)}</div>
      </section>
    </>
  );
}

function MetricEvidence({ metric, videos, sessions, onClose }: { metric: string; videos: VideoRecord[]; sessions: WatchSession[]; onClose: () => void }) {
  const videoMap = new Map(videos.map((video) => [video.videoId, video]));
  let rows: Array<{ title: string; detail: string; value: string }> = [];
  if (metric === "Tekrar payı") rows = videos.filter((video) => video.rewatchSeconds > 0).toSorted((a,b)=>b.rewatchSeconds-a.rewatchSeconds).map((video) => ({ title: video.title, detail: `${video.sessionCount} oturum`, value: formatDuration(video.rewatchSeconds) }));
  else if (metric === "Aktif gün") {
    const days = new Map<string, number>();
    sessions.forEach((session) => { const day = new Date(session.startedAt).toLocaleDateString("tr-TR"); days.set(day, (days.get(day) ?? 0) + session.watchSeconds); });
    rows = [...days.entries()].map(([day, seconds]) => ({ title: day, detail: "Günlük aktif süre", value: formatDuration(seconds) }));
  } else if (metric === "Oturum / video") rows = videos.toSorted((a,b)=>b.sessionCount-a.sessionCount).map((video) => ({ title: video.title, detail: `${round(video.completionRate*100)}% tamamlandı`, value: `${video.sessionCount} oturum` }));
  else {
    const sorted = sessions.toSorted((a,b)=>b.watchSeconds-a.watchSeconds);
    rows = sorted.map((session) => ({ title: videoMap.get(session.videoId)?.title ?? session.videoId, detail: new Date(session.startedAt).toLocaleString("tr-TR"), value: formatDuration(session.watchSeconds) }));
  }
  return <section className="surface metric-evidence"><header><div><small>HAM KANIT</small><h2>{metric} nasıl oluştu?</h2><p>Dahil edilen yerel kayıtlar; hiçbir veri dışarı gönderilmez.</p></div><button type="button" onClick={onClose}>Kapat</button></header>{rows.length ? <div>{rows.slice(0, 30).map((row, index) => <article key={`${row.title}-${index}`}><span><strong>{row.title}</strong><small>{row.detail}</small></span><b>{row.value}</b></article>)}</div> : <p className="detail-empty">Bu metrik için gösterilecek kayıt yok.</p>}</section>;
}
