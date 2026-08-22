import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { buildAttentionSections } from "../analytics/insights-suite";
import { Meter } from "./ui";

export function AttentionTimeline({ video, sessions }: { video: VideoRecord; sessions: WatchSession[] }) {
  const sections = buildAttentionSections(video, sessions.flatMap((session) => session.playbackSegments));
  if (!sections.length) return null;
  return <section className="attention-timeline"><header><strong>Bölüm ve dikkat haritası</strong><small>Altyazı kategorileri + gerçekten izlenen aralıklar</small></header><div>{sections.map((section) => <article className={`attention-${section.status.replaceAll(" ", "-")}`} key={`${section.startSeconds}-${section.label}`}><span><b>{formatDuration(section.startSeconds)}</b><strong>{section.label}</strong><small>{section.status}</small></span><em>%{section.watchedPercent}</em><Meter value={section.watchedPercent}/></article>)}</div></section>;
}
