import { AnalysisGuide } from "./AnalysisGuide";
// DemirTube Aurora UI v2 · unified dashboard visual system
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxis, chartGrid, chartSeries } from "./chart-theme";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import {
  buildTimeInsights, dayOfWeekAnalytics, hourlyAnalytics, timeOfDayAnalytics,
  weekdayWeekendAnalytics, type TimeBucket
} from "../analytics/time-analytics";
import { ChartFrame, Empty, PageHeading } from "./ui";

function BucketTable({ rows }: { rows: TimeBucket[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Dönem</th><th>İzleme</th><th>Video</th><th>İzlenen bölüm (%)</th><th>Pişmanlık sinyali (%)</th><th>Öne çıkan konu</th><th>Süre</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.key}><td>{row.label}</td><td>{formatDuration(row.totalWatchSeconds)}</td><td>{row.videoCount}</td><td>%{row.averageCompletion}</td><td>%{row.regretRate}</td><td>{row.preferredTopics.join(", ") || "—"}</td><td>{row.preferredDuration ?? "—"}</td></tr>)}</tbody>
  </table></div>;
}

export function TimeAnalytics({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const hourly = hourlyAnalytics(videos, sessions);
  const dayParts = timeOfDayAnalytics(videos, sessions);
  const days = dayOfWeekAnalytics(videos, sessions);
  const weekday = weekdayWeekendAnalytics(videos, sessions);
  if (!sessions.length) return <><PageHeading eyebrow="ZAMAN DAVRANIŞI" title="İzleme Zamanları" copy="Ne zaman izlediğini ve farklı saatlerde nasıl seçim yaptığını gösterir."/>
      <AnalysisGuide takeaway="Hangi saatlerde ve günlerde daha çok YouTube izlediğini gösterir; saatler cihazının yerel saatidir." definitions={[["Grafikteki sütun","Seçili dönem boyunca o saat aralığında biriken toplam izleme dakikası."],["Ortalama izlenen bölüm","O zaman aralığında izlenen videoların ortalama ne kadarını bitirdiğin."],["Pişmanlık sinyali","Pişmanlık puanı yüksek videoların oranı; doğrudan memnuniyetsizlik beyanı değildir."]]} hint="Yüksek sütun, o saatte daha çok zaman geçirdiğini anlatır; o saatin daha verimli olduğunu göstermez." /><Empty>Zaman analizi için izleme oturumu birikmesi gerekiyor.</Empty></>;
  return <><PageHeading eyebrow="ZAMAN DAVRANIŞI" title="İzleme Zamanları" copy="Saat, gün ve hafta içi/sonu davranışını aktif izleme süresiyle karşılaştır."/>
      <AnalysisGuide takeaway="Hangi saatlerde ve günlerde daha çok YouTube izlediğini gösterir; saatler cihazının yerel saatidir." definitions={[["Grafikteki sütun","Seçili dönem boyunca o saat aralığında biriken toplam izleme dakikası."],["Ortalama izlenen bölüm","O zaman aralığında izlenen videoların ortalama ne kadarını bitirdiğin."],["Pişmanlık sinyali","Pişmanlık puanı yüksek videoların oranı; doğrudan memnuniyetsizlik beyanı değildir."]]} hint="Yüksek sütun, o saatte daha çok zaman geçirdiğini anlatır; o saatin daha verimli olduğunu göstermez." />
    <div className="time-insights">{buildTimeInsights(dayParts).map((insight) => <article className="surface" key={insight}>{insight}</article>)}</div>
    <section className="surface chart-block neon-chart"><div className="section-head"><div><h2>Saatlere göre aktif izleme</h2><p>24 saatlik dağılım, dakika</p></div></div>
      <ChartFrame summary={`Saatlere göre aktif izleme: ${hourly.filter((row) => row.totalWatchSeconds > 0).map((row) => `${row.label} ${Math.round(row.totalWatchSeconds / 60)} dakika`).join(", ") || "kayıt yok"}.`}>
      <ResponsiveContainer width="100%" height={250}><BarChart data={hourly.map((row) => ({ ...row, minutes: Math.round(row.totalWatchSeconds / 60) }))}><CartesianGrid stroke={chartGrid} vertical={false}/><XAxis dataKey="label" stroke={chartAxis}/><YAxis stroke={chartAxis}/><Tooltip/><Bar dataKey="minutes" name="Dakika" fill={chartSeries[1]} radius={[5,5,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer>
      </ChartFrame>
    </section>
    <div className="time-grid">
      <section className="surface"><h2>Günün bölümleri</h2><BucketTable rows={dayParts}/></section>
      <section className="surface"><h2>Hafta içi / hafta sonu</h2><BucketTable rows={weekday}/></section>
    </div>
    <section className="surface"><h2 className="table-title">Günlere göre davranış</h2><BucketTable rows={days}/></section>
  </>;
}
