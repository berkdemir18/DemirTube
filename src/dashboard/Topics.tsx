// DemirTube Aurora UI v2 · unified dashboard visual system
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VideoRecord } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { topicStats } from "./analytics";
import { DataMaturity, Empty, Meter, PageHeading } from "./ui";

export function Topics({ videos }: { videos: VideoRecord[] }) {
  const rows = topicStats(videos);
  const topicVideoMap = new Map(rows.map((r) => [r.topic, videos.filter((v) => v.topics.includes(r.topic))]));

  return (
    <>
      <PageHeading eyebrow="İÇERİK DNA’SI" title="Konular" copy="Tıklama sayısından çok, ne kadar süre kaldığını ölçer." />
      <DataMaturity count={videos.length} />

      {rows.length ? (
        <>
          {videos.length >= 3 ? (
            <section className="surface chart-block neon-chart" aria-hidden="true">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={rows} layout="vertical">
                  <CartesianGrid stroke="#1f3442" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke="#728797" />
                  <YAxis type="category" dataKey="topic" width={120} stroke="#9aabb7" />
                  <Tooltip />
                  <Bar dataKey="preferenceScore" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          ) : null}

          <section className="surface table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Konu</th>
                  <th>Video</th>
                  <th>Toplam Süre</th>
                  <th>Ort. Tamamlama</th>
                  <th>Erken Çıkış</th>
                  <th>Tercih</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const topicVideos = topicVideoMap.get(r.topic) ?? [];
                  const isWatchingTopic = topicVideos.some((v) => v.isCurrentlyWatching);
                  return (
                    <tr key={r.topic}>
                      <td><strong>{r.topic}</strong></td>
                      <td>{r.videoCount}</td>
                      <td>{formatDuration(r.watchSeconds)}</td>
                      <td>%{r.averageCompletion}</td>
                      <td>{isWatchingTopic ? "İzleniyor" : `%${r.earlyExitRate}`}</td>
                      <td>
                        {videos.length < 3 ? (
                          <span className="insufficient">Öğreniliyor</span>
                        ) : (
                          <div className="completion-cell">
                            <Meter value={r.preferenceScore} />
                            <b>{r.preferenceScore}</b>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <Empty />
      )}
    </>
  );
}
