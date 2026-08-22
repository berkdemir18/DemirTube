// DemirTube Aurora UI v2 · unified dashboard visual system
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { calendarAnalytics } from "../analytics/calendar-analytics";
import { lastMonthSameDay } from "../analytics/nostalgia";
import type { VideoRecord, WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { Empty, PageHeading } from "./ui";

export function CalendarPage({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const days = useMemo(() => calendarAnalytics(videos, sessions, 91), [videos, sessions]);
  const flash = useMemo(() => lastMonthSameDay(videos, sessions), [videos, sessions]);
  const [selected, setSelected] = useState(days.at(-1)?.date);
  const detail = days.find((day) => day.date === selected);
  const maximum = Math.max(1, ...days.map((day) => day.watchSeconds));
  const videoMap = new Map(videos.map((video) => [video.videoId, video]));
  return <><PageHeading eyebrow="AKTİVİTE TAKVİMİ" title="İzleme Takvimi" copy="Son 13 haftadaki günlük YouTube süreni ve konu dağılımını gösterir."/>
    {flash ? (
      <p className="nostalgia-card"><History size={15} /> <span>📅 Geçen ay bugün ({flash.dateLabel}): <strong>{formatDuration(flash.watchSeconds)} · {flash.videoCount} video</strong>{flash.topTopic ? ` — en çok ${flash.topTopic}` : ""}</span></p>
    ) : null}
    <section className="surface calendar-surface premium-panel"><div className="calendar-grid">{days.map((day) => <button key={day.date} aria-label={`${day.date}: ${formatDuration(day.watchSeconds)}`} title={`${day.date} · ${formatDuration(day.watchSeconds)} · ${day.videoCount} video`} className={selected === day.date ? "selected" : ""} style={{ "--calendar-level": String(day.watchSeconds / maximum) } as React.CSSProperties} onClick={() => setSelected(day.date)}/>)}</div>
      <div className="calendar-legend"><span>Az</span>{[.08,.25,.5,.75,1].map((level) => <i key={level} style={{ opacity: level }}/>) }<span>Çok</span></div>
    </section>
    {detail?.videoCount ? <section className="surface calendar-detail"><header><div><small>{new Date(`${detail.date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}</small><h2>{formatDuration(detail.watchSeconds)} · {detail.videoCount} video</h2></div><span>%{detail.averageCompletion} tamamlama · {detail.regretCount} pişmanlık</span></header><p>{detail.topics.join(", ") || "Konu yok"}</p><ul>{detail.videoIds.map((id) => videoMap.get(id)).filter(Boolean).map((video) => <li key={video!.videoId}><a href={video!.url} target="_blank" rel="noreferrer">{video!.title}</a><span>{video!.channelName}</span></li>)}</ul></section> : <Empty>Seçili günde izleme kaydı yok.</Empty>}
  </>;
}
