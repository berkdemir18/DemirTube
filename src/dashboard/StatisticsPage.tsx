import { AnalysisGuide } from "./AnalysisGuide";
import { Activity, CalendarRange, Clock3, Layers3, Repeat2, TimerReset } from "lucide-react";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { advancedStatistics } from "../analytics/statistics";
import { ChartFrame, Empty, Meter, PageHeading } from "./ui";
import { useState, type CSSProperties } from "react";
import { ActivityTrend, CompletionRings, CountUp, FormatDonut, HourClock, WeekHeatmap } from "./StatsCharts";

export function StatisticsPage({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const [evidenceMetric, setEvidenceMetric] = useState<string>();
  const stats = advancedStatistics(videos, sessions);
  if (!videos.length && !sessions.length) return (
    <><PageHeading eyebrow="İZLEME ANATOMİSİ" title="İstatistikler" copy="Süre, tekrar, oturum ve format davranışını aynı ekranda birleştirir." />
      <AnalysisGuide takeaway="Toplam izleme sürenin tek seferlik izleme, tekrarlar ve ayrı açılışlar arasında nasıl dağıldığını gösterir." definitions={[["Aktif izleme","Video gerçekten oynarken sayılan süre; duraklatılan süre dahil değildir."],["Oturum","Bir videoyu açıp izlediğin ziyaret. Aynı videoya geri dönmek yeni bir oturum olabilir."],["Tekrar payı","İzlediğin bölümleri yeniden oynatmaya ayırdığın sürenin payı."]]} hint="Bir sayı kartına tıklayarak hesaplamaya giren kayıtları görebilirsin. Uzun izlemek tek başına daha iyi öğrenmek demek değildir." /><Empty /></>
  );

  const rewatchShare = stats.activeWatchSeconds ? round(stats.rewatchSeconds / stats.activeWatchSeconds * 100) : 0;
  const cards = [
    [Clock3, "Aktif izleme", stats.activeWatchSeconds, (v: number) => formatDuration(v)],
    [TimerReset, "Ortalama oturum", stats.averageSessionSeconds, (v: number) => formatDuration(v)],
    [Repeat2, "Tekrar payı", rewatchShare, (v: number) => `%${Math.round(v)}`],
    [CalendarRange, "Aktif gün", stats.activeDayCount, (v: number) => String(Math.round(v))],
    [Layers3, "Oturum / video", stats.videoCount ? stats.sessionCount / stats.videoCount : 0, (v: number) => v.toFixed(1)],
    [Activity, "En uzun oturum", stats.longestSessionSeconds, (v: number) => formatDuration(v)]
  ] as const;

  return (
    <>
      <PageHeading eyebrow="İZLEME ANATOMİSİ" title="İstatistikler" copy="Ne kadar izlediğinden öte, izleme sürenin nasıl oluştuğunu gösterir." />
      <AnalysisGuide takeaway="Toplam izleme sürenin tek seferlik izleme, tekrarlar ve ayrı açılışlar arasında nasıl dağıldığını gösterir." definitions={[["Aktif izleme","Video gerçekten oynarken sayılan süre; duraklatılan süre dahil değildir."],["Oturum","Bir videoyu açıp izlediğin ziyaret. Aynı videoya geri dönmek yeni bir oturum olabilir."],["Tekrar payı","İzlediğin bölümleri yeniden oynatmaya ayırdığın sürenin payı."]]} hint="Bir sayı kartına tıklayarak hesaplamaya giren kayıtları görebilirsin. Uzun izlemek tek başına daha iyi öğrenmek demek değildir." />
      <section className="stats-metric-grid">
        {cards.map(([Icon, label, value, format], index) => <button type="button" className={`surface stats-metric ${evidenceMetric === label ? "active" : ""}`} key={label} style={{ "--i": index } as CSSProperties} onClick={() => setEvidenceMetric((current) => current === label ? undefined : label)}><Icon size={18}/><small>{label}</small><strong><CountUp value={value} format={format}/></strong><em>Hangi kayıtlardan?</em></button>)}
      </section>
      {evidenceMetric ? <MetricEvidence metric={evidenceMetric} videos={videos} sessions={sessions} onClose={() => setEvidenceMetric(undefined)}/> : null}
      <section className="surface chart-block stats-trend stats-reveal">
        <div className="section-head"><div><h2>İzleme nabzı</h2><p>Son 30 günün aktif izleme süresi ve 7 günlük hareketli ortalaması</p></div></div>
        <ActivityTrend sessions={sessions} />
      </section>
      <div className="stats-analysis-grid">
        <section className="surface chart-block stats-reveal">
          <div className="section-head"><div><h2>Günün ritmi</h2><p>24 saatlik aktif süre dağılımı · zirve {stats.peakHourLabel}</p></div></div>
          <ChartFrame summary={`Günün ritmi: ${stats.hourly.map((row) => `${row.label} ${formatDuration(row.seconds)}`).join(", ")}.`}>
            <HourClock sessions={sessions} />
          </ChartFrame>
        </section>
        <section className="surface stats-quality stats-reveal">
          <h2>Tamamlama ve geri dönüşler</h2>
          <CompletionRings rows={[["Ortalama tamamlama", stats.averageCompletion], ["Tamamlanan video", stats.completedRate], ["Yeniden dönülen", stats.revisitRate]]} />
          <dl><div><dt>Benzersiz süre</dt><dd>{formatDuration(stats.uniqueWatchSeconds)}</dd></div><div><dt>Tekrar izleme</dt><dd>{formatDuration(stats.rewatchSeconds)}</dd></div></dl>
        </section>
      </div>
      <section className="surface stats-reveal">
        <div className="section-head"><div><h2>Haftalık ısı haritası</h2><p>Hangi gün, hangi saatte izliyorsun — koyu hücre daha çok süre</p></div></div>
        <WeekHeatmap sessions={sessions} />
      </section>
      <section className="surface stats-formats stats-reveal">
        <div className="section-head"><div><h2>Format performansı</h2><p>İzleme süresini hangi video biçimlerinin taşıdığı</p></div></div>
        <div className="stats-formats-body"><FormatDonut formats={stats.formats} total={stats.activeWatchSeconds} /><div>{stats.formats.slice(0, 8).map((format) => <article key={format.label}><span><strong>{format.label}</strong><small>{format.count} video</small></span><b>{formatDuration(format.seconds)}</b><Meter value={stats.activeWatchSeconds ? format.seconds / stats.activeWatchSeconds * 100 : 0}/></article>)}</div></div>
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
  return <section className="surface metric-evidence"><header><div><small>HESABA GİREN KAYITLAR</small><h2>{metric} nasıl oluştu?</h2><p>Dahil edilen yerel kayıtlar; hiçbir veri dışarı gönderilmez.</p></div><button type="button" onClick={onClose}>Kapat</button></header>{rows.length ? <div>{rows.slice(0, 30).map((row, index) => <article key={`${row.title}-${index}`}><span><strong>{row.title}</strong><small>{row.detail}</small></span><b>{row.value}</b></article>)}</div> : <p className="detail-empty">Bu metrik için gösterilecek kayıt yok.</p>}</section>;
}
