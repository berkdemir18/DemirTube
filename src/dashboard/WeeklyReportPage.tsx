// DemirTube Aurora UI v2 · unified dashboard visual system
import { BrainCircuit, Clipboard, Clock3, Download, FileJson, RefreshCw, RotateCcw, ShieldAlert, Target } from "lucide-react";
import type { VideoRecord, WatchSession, WeeklyReport } from "../shared/types";
import { generateWeeklyReport } from "../analytics/weekly-report";
import { formatDuration } from "../shared/utils";
import { PageHeading } from "./ui";

export function WeeklyReportPage({
  videos,
  sessions,
  stored,
  onGenerate
}: {
  videos: VideoRecord[];
  sessions: WatchSession[];
  stored: WeeklyReport[];
  onGenerate: () => Promise<WeeklyReport>;
}) {
  const preview = stored.toSorted((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? generateWeeklyReport(videos, sessions);
  const download = () => {
    const url = URL.createObjectURL(new Blob([preview.text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `demirtube-haftalik-${preview.id}.txt`; link.click(); URL.revokeObjectURL(url);
  };
  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(preview, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `demirtube-haftalik-${preview.id}.json`; link.click(); URL.revokeObjectURL(url);
  };
  return <><PageHeading eyebrow="HAFTALIK İÇGÖRÜ" title="Haftalık Rapor" copy="Son yedi günün izleme özeti, değişimi ve uygulanabilir önerileri."/>
    <div className="report-actions"><button className="button primary" onClick={() => void onGenerate()}><RefreshCw size={15}/>Raporu yenile</button><button className="button" onClick={() => void navigator.clipboard.writeText(preview.text)}><Clipboard size={15}/>Metni kopyala</button><button className="button" onClick={download}><Download size={15}/>Metin indir</button><button className="button" onClick={downloadJson}><FileJson size={15}/>JSON indir</button></div>
    <nav className="report-actions" aria-label="Rapor sonrası adımlar"><a className="button" href="#/goals">Haftalık hedefi düzenle</a><a className="button" href="#/watchlist">İzleme planı yap</a><a className="button" href="#/feedback">Geri bildirimleri düzelt</a></nav>
    <section className="surface weekly-report premium-report">
      <header><div><small>{new Date(preview.weekStart).toLocaleDateString("tr-TR")} – {new Date(preview.weekEnd).toLocaleDateString("tr-TR")}</small><h2>Bu haftanın özeti</h2></div>{preview.weekOverWeekPercent !== undefined ? <strong className={preview.weekOverWeekPercent <= 0 ? "positive" : ""}>{preview.weekOverWeekPercent > 0 ? "+" : ""}%{preview.weekOverWeekPercent}</strong> : null}</header>
      <div className="report-metrics"><div><small>Aktif izleme</small><b>{formatDuration(preview.totalWatchSeconds)}</b></div><div><small>Video</small><b>{preview.videoCount}</b></div><div><small>Tamamlama</small><b>%{preview.averageCompletion}</b></div><div><small>Pişmanlık</small><b>{preview.regretCount}</b></div></div>
      <div className="weekly-comparisons">
        <Comparison label="Shorts süresi" value={formatDuration(preview.shortsWatchSeconds ?? 0)} change={preview.shortsChangePercent}/>
        <Comparison label="Pişmanlık oranı" value={`%${preview.regretRate ?? 0}`} change={preview.regretRateChange} point/>
        <Comparison label="Bilinçli seçim" value={`%${preview.consciousSelectionRate ?? 0}`} change={preview.consciousSelectionChange} point positive/>
        <Comparison label="Öğrenme / eğlence" value={`${formatDuration(preview.learningWatchSeconds ?? 0)} / ${formatDuration(preview.entertainmentWatchSeconds ?? 0)}`} change={preview.learningShareChange} point positive/>
      </div>
      <section className="weekly-discovery" aria-label="Haftalık kişisel keşif özeti">
        <header>
          <div><small>KİŞİSEL KEŞİF</small><h3>Bu hafta sende ne değişti?</h3></div>
          {preview.predictionAccuracy ? (
            <div className="prediction-accuracy">
              <Target size={18}/>
              <span><b>{preview.predictionAccuracy.sampleCount} tahminden {preview.predictionAccuracy.nearCount}'i yakın çıktı</b><small>Ortalama hata {preview.predictionAccuracy.meanError} puan</small></span>
            </div>
          ) : <div className="prediction-accuracy muted"><Target size={18}/><span><b>Tahmin doğruluğu birikiyor</b><small>İlk sonuçlar için tamamlanmış video gerekli</small></span></div>}
        </header>
        <div className="weekly-insight-list">
          {(preview.discoveryInsights ?? []).map((insight) => {
            const Icon = insight.kind === "interest" ? BrainCircuit : insight.kind === "time" ? Clock3 : insight.kind === "risk" ? ShieldAlert : RotateCcw;
            return <article className={`insight-${insight.kind}`} key={insight.kind}><Icon size={20}/><span><small>{insight.label}</small><strong>{insight.value}</strong></span></article>;
          })}
        </div>
      </section>
      <p className="report-text">{preview.text}</p>
      <div className="report-columns"><div><h3>En güçlü sarılma</h3><ol>{preview.strongestEngagement.map((item) => <li key={item}>{item}</li>)}</ol></div><div><h3>En çok pişman olunan</h3><ol>{preview.mostRegretted.map((item) => <li key={item}>{item}</li>)}</ol></div><div><h3>Öneriler</h3><ul>{preview.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
      {preview.topicChanges?.length ? <div className="topic-change-list"><h3>Konu değişimleri</h3>{preview.topicChanges.map((item) => <div key={item.topic}><span>{item.topic}</span><b>{formatDuration(item.currentSeconds)}</b><small>{item.changePercent === undefined ? "Yeni" : `${item.changePercent > 0 ? "+" : ""}%${item.changePercent}`}</small></div>)}</div> : null}
    </section>
  </>;
}

function Comparison({ label, value, change, point = false, positive = false }: { label: string; value: string; change?: number; point?: boolean; positive?: boolean }) {
  const favorable = change !== undefined && (positive ? change >= 0 : change <= 0);
  return <article><small>{label}</small><strong>{value}</strong><span className={favorable ? "good" : ""}>{change === undefined ? "Önceki veri yok" : `${change > 0 ? "+" : ""}${change}${point ? " puan" : "%"}`}</span></article>;
}
