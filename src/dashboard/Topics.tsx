import { AnalysisGuide } from "./AnalysisGuide";
// DemirTube Aurora UI v2 · unified dashboard visual system
import { ArrowLeft } from "lucide-react";
import { chartAccent, chartAxis, chartGrid } from "./chart-theme";
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
      <AnalysisGuide takeaway="Aynı konudaki videoları birlikte değerlendirerek hangi konulara zaman ayırdığını gösterir." definitions={[["İzlenen bölüm","%60, videoların ortalama %60’ını izlediğin anlamına gelir. Aynı bölümü tekrar izlemek oranı artırmaz."],["İlgi puanı","0–100 arasında davranıştan hesaplanan bir tahmin. Konuyu sevdiğinin kesin kanıtı değildir."],["Erken ayrılma","Kısa izleyip çıktığın videoların oranı. Cevabı bulup çıkmış da olabilirsin."]]} hint="Bir konuya tıklayarak bu sonuca hangi videoların katkıda bulunduğunu görebilirsin. Bir video birden fazla konuda sayılabilir." />
      <DataMaturity count={videos.length} />

      {rows.length ? (
        <>
          <section className="topic-overview-grid" aria-label="Konu özetleri">{rows.map(row => <button className="topic-overview-card" key={row.topic} onClick={() => onSelect(row.topic)}><span>{row.videoCount} video</span><h2>{row.topic}</h2><strong>{formatDuration(row.watchSeconds)}</strong><small>bu konuya ayırdığın süre</small><div><span>Ortalama izlenen bölüm</span><b>%{row.averageCompletion}</b></div><Meter value={row.averageCompletion} /><em>Videoları ve ayrıntıları gör →</em></button>)}</section>
          <details className="analysis-detail"><summary>Tüm konuları tablo ve grafikle karşılaştır</summary>
          {videos.length >= 3 ? (
            <section className="surface chart-block neon-chart" aria-hidden="true">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={rows} layout="vertical">
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke={chartAxis} />
                  <YAxis type="category" dataKey="topic" width={120} stroke={chartAxis} />
                  <Tooltip />
                  <Bar dataKey="preferenceScore" fill={chartAccent} radius={[0, 6, 6, 0]} isAnimationActive={false} />
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
                  <th>İzlenen bölüm (%)</th>
                  <th>Erken Çıkış</th>
                  <th>İlgi puanı /100</th>
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
          </details>
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
      <AnalysisGuide takeaway="Aynı konudaki videoları birlikte değerlendirerek hangi konulara zaman ayırdığını gösterir." definitions={[["İzlenen bölüm","%60, videoların ortalama %60’ını izlediğin anlamına gelir. Aynı bölümü tekrar izlemek oranı artırmaz."],["İlgi puanı","0–100 arasında davranıştan hesaplanan bir tahmin. Konuyu sevdiğinin kesin kanıtı değildir."],["Erken ayrılma","Kısa izleyip çıktığın videoların oranı. Cevabı bulup çıkmış da olabilirsin."]]} hint="Bir konuya tıklayarak bu sonuca hangi videoların katkıda bulunduğunu görebilirsin. Bir video birden fazla konuda sayılabilir." />

      {videos.length ? (
        <>
          <section className="surface table-wrap">
            <h2>Bu konuyu en çok izlediğin kanallar</h2>
            <table>
              <thead><tr><th>Kanal</th><th>Video</th><th>Süre</th><th>İzlenen bölüm (%)</th></tr></thead>
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
