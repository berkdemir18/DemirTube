import { AnalysisGuide } from "./AnalysisGuide";
// DemirTube · Zaman Maliyeti
//
// Tek soruya cevap verir: bu dönemde ne kadar süre pişman olduğun içeriğe gitti
// ve nereye yığılmış? Hesap analytics/time-cost.ts içinde; burada yalnızca sunum
// ve kanal/konu derin bağlantıları var.
import { ExternalLink } from "lucide-react";
import type { UserVideoFeedback, VideoRecord } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { calculateTimeCost, type CostBucket } from "../analytics/time-cost";
import { DataMaturity, Empty, InfoTip, Meter, PageHeading } from "./ui";

const confidenceLabel = { low: "Düşük güven", medium: "Orta güven", high: "Yüksek güven" } as const;

function BucketTable({
  title, buckets, onOpen, emptyCopy,
}: {
  title: string;
  buckets: CostBucket[];
  onOpen: (key: string) => void;
  emptyCopy: string;
}) {
  if (!buckets.length) return null;
  return (
    <section className="surface table-wrap">
      <h2>{title}</h2><p className="analysis-unit">Dar ekranda tüm sütunlar için tabloyu yana kaydırabilirsin.</p>
      {buckets.length ? (
        <table>
          <thead>
            <tr><th>Ad</th><th>Tahmini süre</th><th>Pay</th><th>Video</th><th>Yüksek pişmanlık</th></tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.key}>
                <td>
                  <button className="link-button" type="button" onClick={() => onOpen(bucket.key)}>
                    <strong>{bucket.key}</strong>
                  </button>
                </td>
                <td>{formatDuration(bucket.costSeconds)}</td>
                <td>
                  <div className="completion-cell"><Meter value={bucket.sharePercent} /><b>%{bucket.sharePercent}</b></div>
                </td>
                <td>{bucket.videoCount}</td>
                <td>{bucket.highRegretCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>{emptyCopy}</p>}
    </section>
  );
}

export function CostPage({
  videos, feedback, onOpenChannel, onOpenTopic,
}: {
  videos: VideoRecord[];
  feedback: UserVideoFeedback[];
  onOpenChannel: (channelName: string) => void;
  onOpenTopic: (topic: string) => void;
}) {
  const report = calculateTimeCost(videos, feedback);

  return (
    <>
      <PageHeading
        eyebrow="ZAMAN MALİYETİ"
        title="Zaman Maliyeti"
        copy="İzleme sürenin hangi bölümünü yeniden değerlendirmek isteyebilirsin?"
      />
      <AnalysisGuide takeaway="Erken çıkış gibi sinyallerden hareketle, yeniden değerlendirmek isteyebileceğin izleme süresini tahmin eder." definitions={[["Tahmini süre","Örnek: 10 dakika izlenen ve pişmanlık puanı 40 olan bir video bu hesaba 4 dakika ekler."],["Pay","Bu kanalın veya konunun, hesaplanan toplam tahmini süre içindeki yüzdesi."],["Belirsizlik","Bu değer gerçekten boşa giden zamanı ölçmez. Davranış ve geri bildirimlerden türetilir."]]} hint="Yanlış yorumlanan videoları Geri Bildirim ekranından düzelterek sonucu iyileştirebilirsin." />
      <DataMaturity count={report.measuredVideoCount} />

      {report.measuredVideoCount ? (
        <>
          <section className="cost-hero surface">
            <div className="cost-hero-main">
              <small>
                PİŞMANLIK AĞIRLIKLI SÜRE
                <InfoTip title="Zaman maliyeti">
                  Maliyet = aktif izleme süresi × (pişmanlık puanı ÷ 100). Süresi okunamamış,
                  analiz dışı bırakılmış ve hâlâ izlenen kayıtlar hesaba girmez.
                </InfoTip>
              </small>
              <strong>{formatDuration(report.costSeconds)}</strong>
              <p>İzleme süresi ve pişmanlık sinyallerinden hesaplanan tahmin: {formatDuration(report.costSeconds)}. Bu, gerçekten boşa giden sürenin ölçümü değildir.</p>
            </div>
            <div className="cost-hero-side">
              <div>
                <span>Aktif sürenin payı</span>
                <Meter value={report.costPercent} />
                <b>%{report.costPercent}</b>
              </div>
              <ul>
                <li><strong>{report.highRegretCount}</strong> yüksek pişmanlıklı video</li>
                <li><strong>{formatDuration(report.activeSeconds)}</strong> ölçülen toplam aktif süre</li>
                <li><strong>{confidenceLabel[report.confidence]}</strong> · {report.measuredVideoCount} ölçülebilir kayıt</li>
              </ul>
            </div>
          </section>

          <BucketTable
            title="Tahmini sürenin kanallara dağılımı"
            buckets={report.channels}
            onOpen={onOpenChannel}
            emptyCopy="Kanal bazında ölçülebilir maliyet yok."
          />
          <BucketTable
            title="Tahmini sürenin konulara dağılımı"
            buckets={report.topics}
            onOpen={onOpenTopic}
            emptyCopy="Konu bazında ölçülebilir maliyet yok."
          />

          {report.worstVideos.length ? (
            <section className="surface cost-videos">
              <h2>Maliyeti en yüksek videolar</h2>
              <ul>
                {report.worstVideos.map((video) => (
                  <li key={video.videoId}>
                    <div className="cost-video-head">
                      <a href={video.url} target="_blank" rel="noreferrer noopener">
                        {video.title}<ExternalLink size={13} />
                      </a>
                      <span>{formatDuration(video.costSeconds)} · pişmanlık {video.regretScore}</span>
                    </div>
                    <small>{video.channelName}</small>
                    {video.factors.length ? <p>{video.factors.slice(0, 3).join(" ")}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <Empty>Bu dönemde ölçülebilir kayıt yok. Süresi okunamamış ve analiz dışı bırakılmış videolar hesaba girmez.</Empty>
      )}
    </>
  );
}
