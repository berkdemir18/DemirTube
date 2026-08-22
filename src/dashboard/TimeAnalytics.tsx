// DemirTube Aurora UI v2 · unified dashboard visual system
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import {
  buildTimeInsights, dayOfWeekAnalytics, hourlyAnalytics, timeOfDayAnalytics,
  weekdayWeekendAnalytics, type TimeBucket
} from "../analytics/time-analytics";
import { ChartFrame, Empty, PageHeading } from "./ui";

function BucketTable({ rows }: { rows: TimeBucket[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Dönem</th><th>İzleme</th><th>Video</th><th>Tamamlama</th><th>Pişmanlık</th><th>Öne çıkan konu</th><th>Süre</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.key}><td>{row.label}</td><td>{formatDuration(row.totalWatchSeconds)}</td><td>{row.videoCount}</td><td>%{row.averageCompletion}</td><td>%{row.regretRate}</td><td>{row.preferredTopics.join(", ") || "—"}</td><td>{row.preferredDuration ?? "—"}</td></tr>)}</tbody>
  </table></div>;
}

export function TimeAnalytics({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const hourly = hourlyAnalytics(videos, sessions);
  const dayParts = timeOfDayAnalytics(videos, sessions);
  const days = dayOfWeekAnalytics(videos, sessions);
  const weekday = weekdayWeekendAnalytics(videos, sessions);
  if (!sessions.length) return <><PageHeading eyebrow="ZAMAN DAVRANIŞI" title="İzleme Zamanları" copy="Ne zaman izlediğini ve farklı saatlerde nasıl seçim yaptığını gösterir."/><Empty>Zaman analizi için izleme oturumu birikmesi gerekiyor.</Empty></>;
  return <><PageHeading eyebrow="ZAMAN DAVRANIŞI" title="İzleme Zamanları" copy="Saat, gün ve hafta içi/sonu davranışını aktif izleme süresiyle karşılaştır."/>
    <div className="time-insights">{buildTimeInsights(dayParts).map((insight) => <article className="surface" key={insight}>{insight}</article>)}</div>
    <section className="surface chart-block neon-chart"><div className="section-head"><div><h2>Saatlere göre aktif izleme</h2><p>24 saatlik dağılım, dakika</p></div></div>
      <ChartFrame summary={`Saatlere göre aktif izleme: ${hourly.filter((row) => row.totalWatchSeconds > 0).map((row) => `${row.label} ${Math.round(row.totalWatchSeconds / 60)} dakika`).join(", ") || "kayıt yok"}.`}>
      <ResponsiveContainer width="100%" height={250}><BarChart data={hourly.map((row) => ({ ...row, minutes: Math.round(row.totalWatchSeconds / 60) }))}><CartesianGrid stroke="#1f3442" vertical={false}/><XAxis dataKey="label" stroke="#728797"/><YAxis stroke="#728797"/><Tooltip/><Bar dataKey="minutes" name="Dakika" fill="#00c9d4" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>
      </ChartFrame>
    </section>
    <div className="time-grid">
      <section className="surface"><h2>Günün bölümleri</h2><BucketTable rows={dayParts}/></section>
      <section className="surface"><h2>Hafta içi / hafta sonu</h2><BucketTable rows={weekday}/></section>
    </div>
    <section className="surface"><h2 className="table-title">Günlere göre davranış</h2><BucketTable rows={days}/></section>
  </>;
}
