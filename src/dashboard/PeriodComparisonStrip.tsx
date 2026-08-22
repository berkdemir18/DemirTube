import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { comparePeriodSummaries, summarizePeriod } from "../analytics/insights-suite";

export function PeriodComparisonStrip({ currentVideos, currentSessions, previousVideos, previousSessions }: {
  currentVideos: VideoRecord[];
  currentSessions: WatchSession[];
  previousVideos: VideoRecord[];
  previousSessions: WatchSession[];
}) {
  const comparison = comparePeriodSummaries(
    summarizePeriod(currentVideos, currentSessions),
    summarizePeriod(previousVideos, previousSessions)
  );
  const rows = [
    { label: "Aktif süre", ...comparison.watchSeconds, render: formatDuration },
    { label: "Video", ...comparison.videoCount, render: (value: number) => String(value) },
    { label: "Tamamlama", ...comparison.averageCompletion, render: (value: number) => `%${value}` },
    { label: "Shorts payı", ...comparison.shortsShare, render: (value: number) => `%${value}` }
  ];
  return <section className="comparison-strip" aria-label="Önceki dönem karşılaştırması">
    <div className="comparison-title"><small>DÖNEM KARŞILAŞTIRMASI</small><strong>Önceki döneme göre</strong></div>
    {rows.map((row) => {
      const change = row.percent;
      const Icon = change === undefined || change === 0 ? ArrowRight : change > 0 ? ArrowUpRight : ArrowDownRight;
      return <article key={row.label}><span>{row.label}</span><strong>{row.render(row.current)}</strong><small><Icon size={12}/>{change === undefined ? "Önceki veri yok" : `${change > 0 ? "+" : ""}${change}%`} · önceki {row.render(row.previous)}</small></article>;
    })}
  </section>;
}
