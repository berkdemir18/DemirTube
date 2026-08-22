import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Clock3, Film, Lightbulb, Repeat2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { channelStats } from "./analytics";
import { channelDecision } from "../analytics/insights-suite";
import { ChartFrame, Empty, Meter, PageHeading, Score } from "./ui";

export function Channels({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const [selected, setSelected] = useState<string>();
  const rows = channelStats(videos);
  const records = new Map(rows.map((row) => [row.channelName, videos.filter((video) => video.channelName === row.channelName)]));

  useEffect(() => {
    if (selected && !records.has(selected)) setSelected(undefined);
  }, [selected, videos]);

  if (selected) {
    return <ChannelDetail name={selected} videos={records.get(selected) ?? []} sessions={sessions} onBack={() => setSelected(undefined)} />;
  }

  return (
    <>
      <PageHeading eyebrow="KANAL UYUMU" title="Kanallar" copy="Bir kanala tıklayarak seçili gün, hafta, ay veya tüm zamanlardaki ayrıntılı istatistiklerini aç." />
      {rows.length ? (
        <section className="channel-gallery premium-grid">
          {rows.map((row) => {
            const channelVideos = records.get(row.channelName) ?? [];
            const latest = channelVideos.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
            const avatar = channelVideos.find((video) => video.channelAvatarUrl)?.channelAvatarUrl ?? latest?.thumbnailUrl;
            return (
              <button className="channel-card" key={row.channelName} type="button" onClick={() => setSelected(row.channelName)}>
                <div className="channel-card-top">
                  <div className="channel-avatar">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span>{row.channelName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>}</div>
                  <div><small>KANAL PROFİLİ</small><h2>{row.channelName}</h2><p>{row.videoCount} video · {formatDuration(row.watchSeconds)}</p></div>
                </div>
                <div className="channel-score"><span>Uyum</span><Score value={row.affinityScore} /></div>
                <div className="channel-meter"><span>Tamamlama %{row.averageCompletion}</span><Meter value={row.averageCompletion} /></div>
                <div className="channel-card-foot"><span>Erken çıkış %{row.earlyExitRate}</span><small>{latest?.topics.slice(0, 2).join(" · ") || "Konu algılanıyor"}</small></div>
              </button>
            );
          })}
        </section>
      ) : <Empty />}
    </>
  );
}

function ChannelDetail({ name, videos, sessions, onBack }: { name: string; videos: VideoRecord[]; sessions: WatchSession[]; onBack: () => void }) {
  const ids = new Set(videos.map((video) => video.videoId));
  const channelSessions = sessions.filter((session) => ids.has(session.videoId));
  const row = channelStats(videos)[0];
  const decision = channelDecision(videos);
  const totalWatch = channelSessions.reduce((sum, session) => sum + session.watchSeconds, 0);
  const uniqueWatch = videos.reduce((sum, video) => sum + video.uniqueWatchedSeconds, 0);
  const rewatch = videos.reduce((sum, video) => sum + video.rewatchSeconds, 0);
  const dailyMap = new Map<string, number>();
  for (const session of channelSessions) {
    const key = new Date(session.startedAt).toLocaleDateString("en-CA");
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + session.watchSeconds);
  }
  const daily = [...dailyMap.entries()].toSorted((a, b) => a[0].localeCompare(b[0])).map(([date, seconds]) => ({
    date: new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), seconds
  }));
  const metrics = [
    [Clock3, "Aktif izleme", formatDuration(totalWatch)],
    [Film, "Video", String(videos.length)],
    [Repeat2, "Tekrar izleme", formatDuration(rewatch)],
    [CalendarDays, "Aktif gün", String(daily.length)]
  ] as const;

  return (
    <>
      <button className="button channel-back" type="button" onClick={onBack}><ArrowLeft size={15}/> Tüm kanallar</button>
      <PageHeading eyebrow="KANAL DETAYI" title={name} copy={`${channelSessions.length} oturum · ${row ? `%${row.averageCompletion} ortalama tamamlama` : "Bu dönemde veri yok"}`} />
      <section className={`surface channel-decision ${decision.tone}`}><Lightbulb size={21}/><div><small>DEMIRTUBE KANAL KARARI</small><strong>{decision.label}</strong><p>{decision.detail}</p></div></section>
      <section className="channel-detail-metrics">{metrics.map(([Icon, label, value]) => <article className="surface" key={label}><Icon size={18}/><small>{label}</small><strong>{value}</strong></article>)}</section>
      <div className="channel-detail-grid">
        <section className="surface chart-block">
          <div className="section-head"><div><h2>Gün gün izleme</h2><p>Seçili dönemde kanala ayrılan gerçek aktif süre</p></div></div>
          {daily.length ? <ChartFrame summary={`Gün gün izleme: ${daily.map((point) => `${point.date} ${formatDuration(point.seconds)}`).join(", ")}.`}><ResponsiveContainer width="100%" height={260}><AreaChart data={daily}><defs><linearGradient id="channelArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00c9d4" stopOpacity={.42}/><stop offset="95%" stopColor="#00c9d4" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date"/><YAxis tickFormatter={(value) => `${round(Number(value) / 60)} dk`}/><Tooltip formatter={(value) => formatDuration(Number(value))}/><Area type="monotone" dataKey="seconds" name="Aktif izleme" stroke="#00c9d4" fill="url(#channelArea)" strokeWidth={2}/></AreaChart></ResponsiveContainer></ChartFrame> : <Empty>Bu dönemde kanal oturumu yok.</Empty>}
        </section>
        <section className="surface channel-detail-quality"><h2>İzleme davranışı</h2><div><span>Kanal uyumu</span><Score value={row?.affinityScore}/></div><div><span>Ortalama tamamlama</span><b>%{row?.averageCompletion ?? 0}</b><Meter value={row?.averageCompletion ?? 0}/></div><dl><div><dt>Benzersiz izleme</dt><dd>{formatDuration(uniqueWatch)}</dd></div><div><dt>Tekrar payı</dt><dd>%{totalWatch ? round(rewatch / totalWatch * 100) : 0}</dd></div><div><dt>Erken çıkış</dt><dd>%{row?.earlyExitRate ?? 0}</dd></div></dl></section>
      </div>
      <section className="surface channel-video-list"><div className="section-head"><div><h2>Bu dönemin videoları</h2><p>En son izlenenden başlayarak</p></div></div>{videos.toSorted((a,b)=>b.lastSeenAt.localeCompare(a.lastSeenAt)).map((video) => <a href={video.url} target="_blank" rel="noreferrer" key={video.videoId}><span><strong>{video.title}</strong><small>{new Date(video.lastSeenAt).toLocaleDateString("tr-TR")} · %{round(video.completionRate * 100)} tamamlandı</small></span><b>{formatDuration(video.totalActiveWatchSeconds)}</b></a>)}</section>
    </>
  );
}
