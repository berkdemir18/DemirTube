// DemirTube Aurora UI v2 · unified dashboard visual system
import { ArrowLeft } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VideoRecord } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { channelStats, topicStats } from "./analytics";
import { DataMaturity, Empty, Meter, PageHeading } from "./ui";

/**
 * Odaklanılan konu adreste tutulur (`#/topics?...&topic=Yapay%20zek%C3%A2`);
 * yenilemede aynı konu açılır ve tek bir konunun dökümü paylaşılabilir.
 */
export function Topics({
  videos, selected, onSelect,
}: {
  videos: VideoRecord[];
  selected?: string;
  onSelect: (topic?: string) => void;
}) {
  const rows = topicStats(videos);
  const topicVideoMap = new Map(rows.map((r) => [r.topic, videos.filter((v) => v.topics.includes(r.topic))]));

  if (selected) {
    return <TopicDetail topic={selected} videos={topicVideoMap.get(selected) ?? []} onBack={() => onSelect(undefined)} />;
  }

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
                      <td>
                        <button className="link-button" type="button" onClick={() => onSelect(r.topic)}>
                          <strong>{r.topic}</strong>
                        </button>
                      </td>
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

function TopicDetail({ topic, videos, onBack }: { topic: string; videos: VideoRecord[]; onBack: () => void }) {
  const row = topicStats(videos).find((item) => item.topic === topic);
  const channels = channelStats(videos).slice(0, 5);
  const recent = videos.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 12);

  return (
    <>
      <button className="button" type="button" onClick={onBack}><ArrowLeft size={15} />Konulara dön</button>
      <PageHeading
        eyebrow="KONU ODAĞI"
        title={topic}
        copy={row
          ? `${row.videoCount} video · ${formatDuration(row.watchSeconds)} · ortalama tamamlama %${row.averageCompletion}`
          : "Bu konunun seçili dönemde kaydı yok."}
      />

      {videos.length ? (
        <>
          <section className="surface table-wrap">
            <h2>Bu konuyu en çok izlediğin kanallar</h2>
            <table>
              <thead><tr><th>Kanal</th><th>Video</th><th>Süre</th><th>Ort. Tamamlama</th></tr></thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.channelName}>
                    <td><strong>{channel.channelName}</strong></td>
                    <td>{channel.videoCount}</td>
                    <td>{formatDuration(channel.watchSeconds)}</td>
                    <td>
                      <div className="completion-cell"><Meter value={channel.averageCompletion} /><b>{channel.averageCompletion}</b></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="surface table-wrap">
            <h2>Son videolar</h2>
            <table>
              <thead><tr><th>Video</th><th>Kanal</th><th>Tamamlama</th></tr></thead>
              <tbody>
                {recent.map((video) => (
                  <tr key={video.videoId}>
                    <td><a href={video.url} target="_blank" rel="noreferrer noopener">{video.title}</a></td>
                    <td>{video.channelName}</td>
                    <td>%{Math.round(video.completionRate * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : <Empty>Seçili dönemde bu konudan izleme yok. Dönemi genişletmeyi dene.</Empty>}
    </>
  );
}
