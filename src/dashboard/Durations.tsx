// DemirTube Aurora UI v2 · unified dashboard visual system
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAccent, chartAxis, chartGrid } from "./chart-theme";
import type { ContentType, VideoRecord } from "../shared/types";
import { round } from "../shared/utils";
import { durationStats } from "./analytics";
import { DataMaturity, PageHeading } from "./ui";

const contentLabels: Record<ContentType, string> = {
  short: "Short",
  standard: "Standart",
  long_form: "Uzun format",
  podcast: "Podcast",
  livestream: "Canlı yayın",
  premiere: "Premiere",
  music: "Müzik",
  unknown: "Bilinmiyor",
};

export function Durations({ videos }: { videos: VideoRecord[] }) {
  const rows = durationStats(videos);
  const contentRows = (Object.keys(contentLabels) as ContentType[])
    .map((type) => {
      const items = videos.filter((video) => video.contentType === type);
      return {
        type,
        label: contentLabels[type],
        count: items.length,
        completion: items.length ? round((items.reduce((sum, video) => sum + video.completionRate, 0) / items.length) * 100) : 0,
        engagement: items.length ? round(items.reduce((sum, video) => sum + video.engagementScore, 0) / items.length) : 0,
        regret: items.length ? round((items.filter((video) => video.regretScore >= 60).length / items.length) * 100) : 0,
      };
    })
    .filter((row) => row.count);

  return (
    <>
      <PageHeading eyebrow="İZLEME FORMATI" title="Video Süresi ve İçerik Türü" copy="Hangi uzunluk ve formatlara gerçekten zaman ayırdığını karşılaştır." />
      <DataMaturity count={videos.length} />

      {videos.length >= 3 ? (
        <section className="surface chart-block neon-chart" aria-hidden="true">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows}>
              <CartesianGrid stroke={chartGrid} vertical={false} />
              <XAxis dataKey="bucket" stroke={chartAxis} />
              <YAxis domain={[0, 100]} stroke={chartAxis} />
              <Tooltip />
              <Bar dataKey="completion" name="Tamamlama %" fill={chartAccent} radius={[7, 7, 0, 0]}  isAnimationActive={false}/>
            </BarChart>
          </ResponsiveContainer>
        </section>
      ) : null}

      <div className="duration-grid">
        {rows.map((row) => (
          <article className={`duration-row ${row.count ? "has-data" : ""}`} key={row.bucket}>
            <h3>{row.bucket}</h3>
            <strong>{row.count ? `%${row.completion}` : "—"}</strong>
            <dl>
              <div>
                <dt>Video</dt>
                <dd>{row.count}</dd>
              </div>
              <div>
                <dt>Ort. izleme</dt>
                <dd>{row.count ? `${row.watch} dk` : "—"}</dd>
              </div>
              <div>
                <dt>Erken çıkış</dt>
                <dd>{row.count ? `%${row.early}` : "—"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {contentRows.length ? (
        <section className="surface content-type-table">
          <h2>İçerik türü performansı</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tür</th>
                  <th>Video</th>
                  <th>Ortalama Tamamlama</th>
                  <th>Ortalama Sarılma</th>
                  <th>Pişmanlık Oranı</th>
                </tr>
              </thead>
              <tbody>
                {contentRows.map((row) => (
                  <tr key={row.type}>
                    <td><strong>{row.label}</strong></td>
                    <td>{row.count}</td>
                    <td>{row.type === "livestream" ? "Uygulanmaz" : `%${row.completion}`}</td>
                    <td>{row.engagement}/100</td>
                    <td>%{row.regret}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
