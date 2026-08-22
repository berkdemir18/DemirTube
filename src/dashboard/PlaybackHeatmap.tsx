// DemirTube Aurora UI v2 · unified dashboard visual system
import type { PlaybackSegment } from "../shared/types";
import { formatDuration } from "../shared/utils";

export function PlaybackHeatmap({
  segments,
  durationSeconds,
  compact = false,
  exitPosition,
  endedNaturally = false
}: {
  segments: PlaybackSegment[];
  durationSeconds: number;
  compact?: boolean;
  exitPosition?: number;
  endedNaturally?: boolean;
}) {
  const duration = Math.max(1, durationSeconds);
  const bins = Array.from({ length: compact ? 32 : 64 }, () => 0);
  for (const segment of segments) {
    const start = Math.max(0, Math.min(duration, segment.start));
    const end = Math.max(start, Math.min(duration, segment.end));
    for (let index = 0; index < bins.length; index += 1) {
      const binStart = index / bins.length * duration;
      const binEnd = (index + 1) / bins.length * duration;
      if (Math.min(end, binEnd) > Math.max(start, binStart)) bins[index] += 1;
    }
  }
  const maximum = Math.max(1, ...bins);
  const description = `${bins.filter(Boolean).length}/${bins.length} zaman dilimi izlendi; en yoğun bölüm ${maximum} kez izlendi${endedNaturally ? "; video doğal tamamlandı" : exitPosition !== undefined ? `; son çıkış ${formatDuration(exitPosition)}` : ""}.`;
  return <div className={`playback-heatmap ${compact ? "compact" : ""}`} data-density={maximum > 2 ? "high" : maximum > 1 ? "medium" : "low"} role="img" tabIndex={0} aria-label={description} title={description}>
    <div>{bins.map((value, index) => <i key={index} className={value > 1 ? "rewatched" : value ? "watched" : "skipped"} title={`${formatDuration(index / bins.length * duration)} – ${formatDuration((index + 1) / bins.length * duration)}: ${value ? `${value} kez izlendi` : "atlanmış"}`} style={{ opacity: value ? .24 + value / maximum * .76 : .08 }}/>)}
      {exitPosition !== undefined && durationSeconds > 0 ? <b className="heatmap-exit" title={`Çıkış: ${formatDuration(exitPosition)}`} style={{ left: `${Math.min(100, Math.max(0, exitPosition / durationSeconds * 100))}%` }}/> : null}
    </div>
    {!compact ? <small><span>0:00</span><span>{formatDuration(durationSeconds)}</span></small> : null}
  </div>;
}
