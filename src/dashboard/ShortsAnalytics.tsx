import { AnalysisGuide } from "./AnalysisGuide";
// DemirTube Aurora UI v2 · unified dashboard visual system
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxis, chartGrid, chartSeries } from "./chart-theme";
import { shortsAnalytics } from "../analytics/shorts-analytics";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { ChartFrame, Empty, PageHeading } from "./ui";

export function ShortsAnalytics({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const stats = shortsAnalytics(videos, sessions);
  return <><PageHeading eyebrow="KISA İÇERİK" title="Shorts Analizi" copy="Kısa video tüketimini standart videolardan ayrı değerlendirir."/>
      <AnalysisGuide takeaway="Kısa videolara toplam ne kadar zaman ayırdığını ve onları nasıl izlediğini gösterir." definitions={[["Ortalama izleme","Bir Shorts videosuna ayırdığın ortalama aktif süre; tekrar oynatmalar dahil olabilir."],["Etkileşim puanı","0–100 arasında tamamlama ve tekrar izleme gibi davranışlardan hesaplanır; beğeni sayısı değildir."],["Pişmanlık sinyali","Pişmanlık puanı 60 ve üzeri olan Shorts videolarının yüzdesi."]]} hint="Bir kısa videoyu bitirmek kolay olabilir. Alışkanlığını anlamak için toplam süreye de bak." />
    {!stats.count ? <Empty>Henüz sınıflandırılmış bir Short kaydı yok.</Empty> : <>
      <div className="metric-grid shorts-metrics"><Metric label="Short sayısı" value={String(stats.count)}/><Metric label="Toplam süre" value={formatDuration(stats.totalWatchSeconds)}/><Metric label="Ortalama izleme" value={formatDuration(stats.averageWatchSeconds)}/><Metric label="Ortalama tamamlama" value={`%${stats.averageCompletion}`}/><Metric label="Etkileşim puanı" value={`${stats.averageEngagement}/100`}/><Metric label="Pişmanlık oranı" value={`%${stats.regretRate}`}/></div>
      <section className="surface chart-block neon-chart"><div className="section-head"><div><h2>Shorts’a ayrılan saatler</h2><p>Yerel saate göre aktif oynatma, dakika</p></div><strong>{stats.peakHour?.watchSeconds ? `Zirve: ${stats.peakHour.label}` : "Veri birikiyor"}</strong></div><ChartFrame summary={`Shorts’a ayrılan saatler: ${stats.hourly.filter((row) => row.watchSeconds > 0).map((row) => `${row.label} ${Math.round(row.watchSeconds / 60)} dakika`).join(", ") || "kayıt yok"}.`}><ResponsiveContainer width="100%" height={260}><BarChart data={stats.hourly.map((item) => ({ ...item, minutes: Math.round(item.watchSeconds / 60) }))}><CartesianGrid stroke={chartGrid} vertical={false}/><XAxis dataKey="label" interval={2} stroke={chartAxis}/><YAxis stroke={chartAxis}/><Tooltip/><Bar dataKey="minutes" name="Dakika" fill={chartSeries[1]} radius={[5,5,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></ChartFrame></section>
    </>}
  </>;
}
function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><div><small>{label}</small><strong>{value}</strong></div></article>; }
