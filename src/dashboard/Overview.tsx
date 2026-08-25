// DemirTube Aurora UI v2 · unified dashboard visual system
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BrainCircuit, Clock3, Flame, Gauge,
  MousePointerClick, Sparkles, Trophy, Users, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
  ReferenceLine,
} from "recharts";
import { chartAccent, chartAxis, chartGrid, chartMuted, chartSeries } from "./chart-theme";
import type { Settings, VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { isEarlyAbandonment } from "../analytics/completion";
import { durationStats, topicStats } from "./analytics";
import { ChartFrame, Empty, InfoTip, Meter } from "./ui";
import { analyticsPeriodLabels, periodDateLabel, watchTrend, type AnalyticsPeriod } from "../analytics/period";
import { selectionReasons } from "../analytics/selection-reasons";
import { evidenceLevel } from "../analytics/evidence";
import { autonomousInsights } from "../analytics/video-intelligence";
import { dataLevel } from "../analytics/data-level";
import { channelDiversity } from "../analytics/diversity";
import { comparePeriodSummaries, summarizePeriod } from "../analytics/insights-suite";

const COLORS = chartSeries;

/** Ortalama tamamlama %70, yüksek etkileşimli video oranı %30 ağırlıkla birleşir. */
function focusOf(videos: VideoRecord[]) {
  if (!videos.length) return 0;
  const average = (videos.reduce((sum, v) => sum + v.completionRate, 0) / videos.length) * 100;
  const engaged = videos.filter((v) => v.engagementScore >= 60).length / videos.length;
  return round(Math.min(100, average * 0.7 + engaged * 30));
}

function regretOf(videos: VideoRecord[]) {
  return videos.length ? round(videos.reduce((sum, v) => sum + v.regretScore, 0) / videos.length) : 0;
}

/** Önceki dönem sıfırsa yüzde değişim tanımsızdır; kart o zaman rozet göstermez. */
function percentChange(current: number, previous: number) {
  return previous > 0 ? round(((current - previous) / previous) * 100) : undefined;
}

// ── Ana sayfa ──────────────────────────────────────────────────────────────

export function Overview({
  videos,
  sessions,
  period,
  settings,
  onReclassify,
  totalVideoCount,
  anchor,
  previousVideos,
  previousSessions,
}: {
  videos: VideoRecord[];
  sessions: WatchSession[];
  period: AnalyticsPeriod;
  settings?: Settings;
  onReclassify?: () => void;
  /** Dönem filtresinden bağımsız toplam video sayısı (veri seviyesi için). */
  totalVideoCount?: number;
  /** Geçerli dönem anchor'ı (DateNav'den). dateLabel ve watchTrend anchor'a göre hesaplanır. */
  anchor?: Date;
  /** Bir önceki dönemin kayıtları; metrik kartlarındaki değişim rozetleri için. */
  previousVideos?: VideoRecord[];
  previousSessions?: WatchSession[];
}) {
  const dateLabel = periodDateLabel(period, anchor);
  const watch = videos.reduce((sum, v) => sum + v.totalActiveWatchSeconds, 0);

  const average = videos.length
    ? (videos.reduce((sum, v) => sum + v.completionRate, 0) / videos.length) * 100
    : 0;

  const topics = topicStats(videos);
  const dominantTopic = topics.length ? topics[0].topic : "Bilinmiyor";
  const focusScore = focusOf(videos);

  const ideal = durationStats(videos)
    .filter((b) => b.count >= 3)
    .toSorted((a, b) => b.completion - a.completion)[0];

  const chartDivisor = watch < 600 ? 1 : watch < 7200 ? 60 : 3600;
  const chartUnit = watch < 600 ? "saniye" : watch < 7200 ? "dakika" : "saat";
  const trend = watchTrend(sessions, period, anchor).map((pt) => ({
    label: pt.label,
    izleme: round(pt.seconds / chartDivisor),
  }));
  const trendTitle =
    period === "day"
      ? "Saatlere göre izleme süresi"
      : period === "week"
      ? "Günlere göre izleme süresi"
      : period === "month"
      ? "Günlere göre izleme süresi"
      : "Aylara göre izleme süresi";

  const evidence = evidenceLevel(videos.length);
  const latest = videos.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
  const reasons = latest ? selectionReasons(latest, videos).slice(0, 3) : [];
  const smartInsights = autonomousInsights(videos);
  const regretAverage = regretOf(videos);
  const overviewTitle = videos.length
    ? focusScore >= 70
      ? "Bu dönem daha bilinçli izledin"
      : "Bu dönemin izleme ritmi"
    : "İzleme ritmin burada oluşacak";

  // Önceki dönem verisi varsa her kart kendi değişimini taşır: "%14.9" tek başına
  // bir şey söylemediği için karşılaştırma rozeti kartın içinde duruyor.
  const hasPrevious = period !== "all" && !!previousVideos?.length && !!previousSessions;
  const summaryDelta = hasPrevious
    ? comparePeriodSummaries(
        summarizePeriod(videos, sessions),
        summarizePeriod(previousVideos!, previousSessions!)
      )
    : undefined;

  const metrics = [
    {
      icon: Clock3,
      label: "İzleme Süresi",
      value: formatDuration(watch),
      help: "Seçili dönemde videolar gerçekten oynarken, sekme görünürken veya video Picture-in-Picture/Opera Video Popout penceresindeyken ve video hazırken sayılan aktif sürelerin toplamıdır.",
      change: summaryDelta?.watchSeconds.percent,
      lowerIsBetter: false,
    },
    {
      icon: Gauge,
      label: "Ortalama Tamamlama",
      value: `%${round(average)}`,
      help: "Her videoda benzersiz izlenen saniye video süresine bölünür. Aynı bölümün tekrar izlenmesi oranı şişirmez; videoların ortalaması gösterilir.",
      change: summaryDelta?.averageCompletion.percent,
      lowerIsBetter: false,
    },
    {
      icon: Zap,
      label: "Odak Puanı",
      value: `%${focusScore}`,
      help: "Ortalama tamamlama %70 ağırlıkla, 60 ve üzeri etkileşim puanı alan videoların oranı %30 ağırlıkla birleştirilir.",
      change: hasPrevious ? percentChange(focusScore, focusOf(previousVideos!)) : undefined,
      lowerIsBetter: false,
    },
    {
      icon: Flame,
      label: "Pişmanlık",
      value: `%${regretAverage}`,
      help: "Erken çıkış, düşük benzersiz tamamlama, hemen başka videoya geçme, tekrar açmama ve açık geri bildirimlerden oluşan video puanlarının dönem ortalamasıdır.",
      change: hasPrevious ? percentChange(regretAverage, regretOf(previousVideos!)) : undefined,
      lowerIsBetter: true,
    },
  ];

  const [lead, ...supporting] = metrics;

  return (
    <>
      <PeriodLede
        period={period}
        dateLabel={dateLabel}
        headline={overviewTitle}
        videoCount={videos.length}
        dominantTopic={dominantTopic}
        lead={lead}
        supporting={supporting}
        today={todayProgress(sessions, settings)}
      />
      {videos.length > 0 && videos.length < 3 ? (
        <StarterSummary
          video={videos.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0]}
          sessions={sessions}
        />
      ) : null}
      {videos.length ? (
        <>
          <div className="overview-focus-grid">
            <WatchTrendChart trend={trend} trendTitle={trendTitle} chartUnit={chartUnit} />
            <TodayRecommendation latest={latest} reasons={reasons} />
          </div>
          <RecentHistoryTable videos={videos} />
          <details className="overview-more">
            <summary>
              <span>Derin içgörüleri aç</span>
              <small>Veri seviyesi, çeşitlilik, konu performansı ve kişisel örüntüler</small>
            </summary>
            <div className="overview-more-body">
              <EvidenceBanner evidence={evidence} onReclassify={onReclassify} />
              <div className="overview-duo">
                <DataLevelCard count={totalVideoCount ?? videos.length} />
                <DiversityCard videos={videos} />
              </div>
              <SelectionReasonsCard latest={latest} reasons={reasons} />
              <div className="overview-secondary-grid">
                <TopicPerfCard topics={topics} />
                <InsightsSidebar videos={videos} ideal={ideal} topics={topics} />
              </div>
              <AutonomousInsightsSection insights={smartInsights} />
            </div>
          </details>
        </>
      ) : (
        <Empty>Bu dönemde izleme kaydı yok. Başka bir dönem seçebilir veya yeni bir video izleyebilirsin.</Empty>
      )}
    </>
  );
}

// ── Alt bileşenler ─────────────────────────────────────────────────────────


// ── Dönem künyesi ───────────────────────────────────────────────────────────
//
// Eski üst blok üç ayrı kutuydu: dev başlık, "izleme nabzı" kartı ve dört eş
// metrik kartı. Üçü de aynı sesle konuştuğu için ekranın ilk yarısı hiçbir şeye
// öncelik vermiyordu. Burada tek panel var: bir baskın figür, onu okumaya yarayan
// bağlam satırı ve daha küçük puntoda üç destek ölçüsü. Kutu yerine çizgi ayırıyor.

type MetricEntry = {
  label: string;
  value: string;
  help: string;
  change?: number;
  lowerIsBetter: boolean;
};

/** Bugünkü dakika ve günlük bütçe; künyedeki ilerleme şeridini besler. */
function todayProgress(sessions: WatchSession[], settings?: Settings) {
  const today = new Date().toDateString();
  const minutes = Math.round(
    sessions
      .filter((session) => new Date(session.startedAt).toDateString() === today)
      .reduce((sum, session) => sum + session.watchSeconds, 0) / 60
  );
  const budget = settings?.dailyWatchBudgetMinutes ?? 0;
  return { minutes, budget };
}

function PeriodLede({
  period, dateLabel, headline, videoCount, dominantTopic, lead, supporting, today,
}: {
  period: AnalyticsPeriod;
  dateLabel: string;
  headline: string;
  videoCount: number;
  dominantTopic: string;
  lead: MetricEntry;
  supporting: MetricEntry[];
  today: { minutes: number; budget: number };
}) {
  const used = today.budget > 0 ? Math.min(100, Math.round((today.minutes / today.budget) * 100)) : 0;

  return (
    <section className="lede">
      <header className="lede-top">
        <p className="lede-meta">
          <span className="lede-period">{analyticsPeriodLabels[period].toLocaleUpperCase("tr-TR")}</span>
          <span>{dateLabel}</span>
          <span><b className="num">{videoCount}</b> video</span>
          <span>baskın konu: {dominantTopic}</span>
        </p>
        <h1>{headline}</h1>
      </header>

      <div className="lede-figures">
        <div className="lede-lead">
          <div className="lede-label">
            <small>{lead.label}</small>
            <InfoTip title={lead.label}>{lead.help}</InfoTip>
          </div>
          <strong className="num">{lead.value}</strong>
          <MetricDelta change={lead.change} lowerIsBetter={lead.lowerIsBetter} />
        </div>

        <div className="lede-support">
          {supporting.map((metric) => (
            <div key={metric.label}>
              <div className="lede-label">
                <small>{metric.label}</small>
                <InfoTip title={metric.label} align="right">{metric.help}</InfoTip>
              </div>
              <b className="num">{metric.value}</b>
              <MetricDelta change={metric.change} lowerIsBetter={metric.lowerIsBetter} />
            </div>
          ))}
        </div>
      </div>

      {today.budget > 0 ? (
        <div className="lede-budget">
          <div className="scrub" role="img" aria-label={`Bugün ${today.minutes} dakika, günlük bütçe ${today.budget} dakika`}>
            <i style={{ width: `${used}%` }} />
            <b style={{ left: `${used}%` }} />
          </div>
          <p>
            <span>bugün</span>
            <b className="num">{today.minutes}</b>
            <span>/</span>
            <b className="num">{today.budget}</b>
            <span>dk günlük bütçe</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}

function MetricDelta({ change, lowerIsBetter }: { change?: number; lowerIsBetter: boolean }) {
  if (change === undefined) return null;
  // Pişmanlıkta artış kötüdür; renk yönü metriğe göre ters çevrilir.
  const tone = change === 0 ? "flat" : change > 0 === lowerIsBetter ? "bad" : "good";
  const Icon = change === 0 ? ArrowRight : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <small className={`metric-delta metric-delta-${tone}`}>
      <Icon size={13} />
      {change > 0 ? "+" : ""}{change}% <span>önceki döneme göre</span>
    </small>
  );
}

function TodayRecommendation({
  latest,
  reasons,
}: {
  latest?: VideoRecord;
  reasons: ReturnType<typeof selectionReasons>;
}) {
  if (!latest) return null;
  const primaryReason = reasons[0]?.explanation ?? "Son izleme davranışına göre kişisel bir seçim.";
  const recommendation = latest.completionRate < 0.8
    ? "Yarım kalan videona dön"
    : latest.engagementScore >= 65
    ? "Bu çizgide devam et"
    : "Bir sonraki seçimini bilinçli yap";

  return (
    <aside className="surface overview-recommendation">
      <div className="recommendation-icon"><Sparkles size={24} /></div>
      <small>BUGÜNÜN ÖNERİSİ</small>
      <h2>{recommendation}</h2>
      <strong>{latest.title}</strong>
      <p>{primaryReason}</p>
      <a href={`https://www.youtube.com/watch?v=${latest.videoId}`} target="_blank" rel="noreferrer">
        <MousePointerClick size={17} />
        Videoya git
      </a>
    </aside>
  );
}

function DataLevelCard({ count }: { count: number }) {
  const level = dataLevel(count);
  return (
    <article className="duo-card level-card">
      <div className="duo-card-head">
        <span className="duo-chip level-chip"><Trophy size={15} /></span>
        <div>
          <small>VERİ SEVİYESİ</small>
          <strong>Seviye {level.level} · {level.label}</strong>
        </div>
        <span className="duo-count">{count} video</span>
      </div>
      <div className="duo-track" aria-label={`Seviye ilerlemesi %${level.progress}`}>
        <i style={{ width: `${level.progress}%` }} />
      </div>
      <p>{level.tagline}{level.nextAt ? ` Sonraki seviyeye ${level.nextAt - count} video.` : " En üst seviyedesin."}</p>
    </article>
  );
}

function DiversityCard({ videos }: { videos: VideoRecord[] }) {
  const diversity = channelDiversity(videos);
  return (
    <article className="duo-card diversity-card">
      <div className="duo-card-head">
        <span className="duo-chip diversity-chip"><Users size={15} /></span>
        <div>
          <small>KANAL ÇEŞİTLİLİĞİ</small>
          <strong>{diversity.channelCount} farklı kanal</strong>
        </div>
        <span className="duo-count">{diversity.topChannel ? `%${diversity.topShare} ${diversity.topChannel}` : "—"}</span>
      </div>
      <div className="duo-track" aria-label={`En çok izlenen kanal payı %${diversity.topShare}`}>
        <i className={diversity.topShare >= 60 ? "warn" : ""} style={{ width: `${Math.min(100, diversity.topShare)}%` }} />
      </div>
      <p>{diversity.label}.</p>
    </article>
  );
}

function EvidenceBanner({
  evidence,
  onReclassify,
}: {
  evidence: ReturnType<typeof evidenceLevel>;
  onReclassify?: () => void;
}) {
  return (
    <div className={`evidence-banner evidence-${evidence.confidence}`}>
      <strong>{evidence.label}</strong>
      <span>
        {evidence.sampleCount} video analizi ·{" "}
        {evidence.nextThreshold
          ? `${evidence.nextThreshold - evidence.sampleCount} video sonra daha güçlü tahmin`
          : "tahminlerin hazır"}
      </span>
      {onReclassify ? (
        <button onClick={onReclassify}>Kategorileri yenile</button>
      ) : null}
    </div>
  );
}

function SelectionReasonsCard({
  latest,
  reasons,
}: {
  latest: VideoRecord | undefined;
  reasons: ReturnType<typeof selectionReasons>;
}) {
  if (!latest) return null;
  return (
    <section className="surface selection-reasons">
      <div className="section-head">
        <div>
          <h2>Bu videoyu neden seçmiş olabilirsin?</h2>
          <p>{latest.title}</p>
        </div>
        <span>Davranışsal tahmin</span>
      </div>
      <div>
        {reasons.map((reason) => (
          <article key={reason.key}>
            <header>
              <strong>{reason.label}</strong>
              <b>{reason.score}/100</b>
            </header>
            <p>{reason.explanation}</p>
            <small>
              {reason.confidence === "high" ? "Yüksek" : reason.confidence === "medium" ? "Orta" : "Düşük"} güven
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function WatchTrendChart({
  trend,
  trendTitle,
  chartUnit,
}: {
  trend: { label: string; izleme: number }[];
  trendTitle: string;
  chartUnit: string;
}) {
  // Grafik tek başına "şu gün şu kadar" diyordu; asıl bilgi hangi günün kendi
  // ortalamandan saptığı. Medyan referans çizgisi ve işaretlenmiş zirve, grafiği
  // bakılan bir şeyden okunan bir şeye çeviriyor.
  const values = trend.map((point) => point.izleme).toSorted((a, b) => a - b);
  const median = values.length
    ? values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
    : 0;
  const peak = trend.reduce((top, point) => (point.izleme > top.izleme ? point : top), trend[0] ?? { label: "", izleme: 0 });
  const peakRatio = median > 0 ? round(peak.izleme / median, 1) : undefined;

  return (
    <section className="surface chart-wide">
      <div className="section-head">
        <div>
          <h2>{trendTitle}</h2>
          <p>Aktif oynatma süresi, {chartUnit}</p>
        </div>
        {peakRatio && peakRatio >= 1.5 ? (
          <p className="chart-note">
            <b>{peak.label}</b> medyanın <b className="num">{peakRatio}×</b>'i
          </p>
        ) : null}
      </div>
      <ChartFrame summary={`${trendTitle}: ${trend.map((point) => `${point.label} ${point.izleme} ${chartUnit}`).join(", ")}. Medyan ${median} ${chartUnit}.`}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={trend} barCategoryGap="30%">
          <CartesianGrid stroke={chartGrid} vertical={false} />
          <XAxis dataKey="label" stroke={chartAxis} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis domain={[0, "auto"]} allowDecimals={false} stroke={chartAxis} tickLine={false} axisLine={false} fontSize={11} width={34} />
          <Tooltip
            contentStyle={{ background: "#141617", border: "1px solid rgba(231,230,227,.14)", borderRadius: 4, boxShadow: "none", fontSize: 12 }}
            cursor={{ fill: "rgba(231,230,227,.05)" }}
          />
          {median > 0 ? (
            <ReferenceLine
              y={median}
              stroke={chartAxis}
              strokeDasharray="3 4"
              label={{ value: `medyan ${median}`, position: "insideTopLeft", fill: chartAxis, fontSize: 10 }}
            />
          ) : null}
          <Bar dataKey="izleme" name={chartUnit} fill={chartAccent} radius={[2, 2, 0, 0]} maxBarSize={44}  isAnimationActive={false}/>
        </BarChart>
      </ResponsiveContainer>
      </ChartFrame>
    </section>
  );
}

function TopicPerfCard({ topics }: { topics: ReturnType<typeof topicStats> }) {
  return (
    <section className="surface">
      <div className="section-head">
        <div>
          <h2>Konu performansı</h2>
          <p>Tamamlanma ve süre birlikte</p>
        </div>
      </div>
      <div className="topic-chart">
        <ChartFrame className="topic-chart-canvas">
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie
              data={topics.slice(0, 6)}
              dataKey="watchSeconds"
              nameKey="topic"
              innerRadius={55}
              outerRadius={82}
              paddingAngle={2}
             isAnimationActive={false}>
              {topics.slice(0, 6).map((topic, index) => (
                <Cell key={topic.topic} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        </ChartFrame>
        <div className="legend">
          {topics.slice(0, 5).map((topic, index) => (
            <div key={topic.topic}>
              <i style={{ background: COLORS[index] }} />
              <span>{topic.topic}</span>
              <b>%{topic.averageCompletion}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentHistoryTable({ videos }: { videos: VideoRecord[] }) {
  const sorted = videos.toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 5);
  return (
    <section className="surface history-preview">
      <div className="section-head">
        <div>
          <h2>Son izleme geçmişi</h2>
          <p>En son güncellenen videolar</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Video</th>
              <th>Kanal</th>
              <th>Aktif / benzersiz</th>
              <th>Tamamlama</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((video) => (
              <tr key={video.videoId}>
                <td><a href={video.url} target="_blank">{video.title}</a></td>
                <td>{video.channelName}</td>
                <td>
                  {formatDuration(video.totalActiveWatchSeconds)} / {formatDuration(video.uniqueWatchedSeconds)}
                </td>
                <td>
                  <div className="completion-cell">
                    <Meter value={video.completionRate * 100} />
                    <span>%{round(video.completionRate * 100)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InsightsSidebar({
  videos,
  ideal,
  topics,
}: {
  videos: VideoRecord[];
  ideal: ReturnType<typeof durationStats>[number] | undefined;
  topics: ReturnType<typeof topicStats>;
}) {
  return (
    <aside className="insights">
      <article>
        <Clock3 />
        <small>Tercih ettiğin süre</small>
        <strong>{ideal?.bucket ?? "Veri birikiyor"}</strong>
        <p>
          {ideal
            ? "En az üç örnekte en yüksek tamamlama."
            : "Bu tahmin için her süre grubunda üç örnek gerekir."}
        </p>
      </article>
      <article>
        <Trophy />
        <small>En çok sardığın konu</small>
        <strong>{videos.length >= 3 ? topics[0]?.topic ?? "—" : "Veri birikiyor"}</strong>
        <p>
          {videos.length >= 3
            ? `Tercih puanı %${topics[0]?.preferenceScore ?? 0}.`
            : "Üç videodan sonra karşılaştırılacak."}
        </p>
      </article>
      <article>
        <MousePointerClick />
        <small>Erken çıkış</small>
        <strong>
          {videos.filter(
            (v) => !v.isCurrentlyWatching && isEarlyAbandonment(v.totalWatchSeconds, v.completionRate)
          ).length}
        </strong>
        <p>Bitmiş oturumlarda ilk iki dakika içinde bırakılan video.</p>
      </article>
    </aside>
  );
}

function AutonomousInsightsSection({
  insights,
}: {
  insights: ReturnType<typeof autonomousInsights>;
}) {
  if (!insights.length) return null;
  return (
    <section className="surface autonomous-insights">
      <div className="section-head">
        <div>
          <h2><BrainCircuit size={18} /> DemirTube ne fark etti?</h2>
          <p>Videoların yapısı ile gerçek izleme davranışını birlikte yorumlar.</p>
        </div>
        <span>Otonom yerel analiz</span>
      </div>
      <div className="autonomous-grid">
        {insights.map((insight) => (
          <article key={insight.key}>
            <small>{insight.eyebrow}</small>
            <strong>{insight.headline}</strong>
            <p>{insight.explanation}</p>
            <span className={`confidence-dot ${insight.confidence}`}>
              {insight.confidence === "high" ? "Yüksek" : insight.confidence === "medium" ? "Orta" : "Düşük"} güven
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── StarterSummary ──────────────────────────────────────────────────────────

function StarterSummary({
  video,
  sessions,
}: {
  video: VideoRecord;
  sessions: WatchSession[];
}) {
  const videoSessions = sessions.filter((s) => s.videoId === video.videoId);
  const pauses = videoSessions.reduce((sum, s) => sum + s.pauseCount, 0);
  const seeks = videoSessions.reduce((sum, s) => sum + s.forwardSeekCount + s.backwardSeekCount, 0);
  return (
    <section className="surface starter-summary">
      <img src={video.thumbnailUrl} alt="" />
      <div className="starter-copy">
        <span>
          <Activity size={14} />
          {video.isCurrentlyWatching ? "Şu anda izleniyor" : "İlk video kaydedildi"}
        </span>
        <h2>{video.title}</h2>
        <p>{video.channelName} · {video.topics.join(", ")}</p>
      </div>
      <dl>
        <div><dt>Aktif izleme</dt><dd>{formatDuration(video.totalActiveWatchSeconds)}</dd></div>
        <div><dt>Benzersiz</dt><dd>{formatDuration(video.uniqueWatchedSeconds)}</dd></div>
        <div><dt>Duraklatma</dt><dd>{pauses}</dd></div>
        <div><dt>İleri / geri</dt><dd>{seeks}</dd></div>
      </dl>
    </section>
  );
}
