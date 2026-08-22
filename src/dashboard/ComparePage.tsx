// DemirTube Aurora UI v2 · unified dashboard visual system
import { useMemo, useState } from "react";
import type { VideoRecord } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { Empty, PageHeading } from "./ui";

type Dimension = "topic" | "channel" | "contentType";
export function ComparePage({ videos }: { videos: VideoRecord[] }) {
  const [dimension, setDimension] = useState<Dimension>("topic");
  const options = useMemo(() => dimension === "topic" ? [...new Set(videos.flatMap((video) => video.topics))] : dimension === "channel" ? [...new Set(videos.map((video) => video.channelName))] : [...new Set(videos.map((video) => video.contentType))], [videos, dimension]);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const groups = [left, right].map((value) => ({ value, videos: videos.filter((video) => dimension === "topic" ? video.topics.includes(value) : dimension === "channel" ? video.channelName === value : video.contentType === value) }));
  return <><PageHeading eyebrow="KARŞILAŞTIRMALI ANALİZ" title="Karşılaştır" copy="İki konu, kanal veya içerik türünü aynı metriklerle yan yana incele."/>
    <div className="compare-controls premium-controls"><select value={dimension} onChange={(event) => { setDimension(event.target.value as Dimension); setLeft(""); setRight(""); }}><option value="topic">Konu</option><option value="channel">Kanal</option><option value="contentType">İçerik türü</option></select><select value={left} onChange={(event) => setLeft(event.target.value)}><option value="">Birinci seçimi yap</option>{options.map((option) => <option key={option}>{option}</option>)}</select><select value={right} onChange={(event) => setRight(event.target.value)}><option value="">İkinci seçimi yap</option>{options.filter((option) => option !== left).map((option) => <option key={option}>{option}</option>)}</select></div>
    {left && right ? <div className="compare-grid">{groups.map((group) => <ComparisonCard key={group.value} label={group.value} videos={group.videos}/>)}</div> : <Empty>Karşılaştırmak için iki farklı grup seç.</Empty>}
  </>;
}
function ComparisonCard({ label, videos }: { label: string; videos: VideoRecord[] }) {
  const average = (get: (video: VideoRecord) => number) => videos.length ? round(videos.reduce((sum, video) => sum + get(video), 0) / videos.length) : 0;
  return <section className="surface comparison-card"><h2>{label}</h2><dl><div><dt>Video</dt><dd>{videos.length}</dd></div><div><dt>Toplam aktif</dt><dd>{formatDuration(videos.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0))}</dd></div><div><dt>Tamamlama</dt><dd>%{average((video) => video.completionRate * 100)}</dd></div><div><dt>Sarılma</dt><dd>{average((video) => video.engagementScore)}/100</dd></div><div><dt>Pişmanlık</dt><dd>%{videos.length ? round(videos.filter((video) => video.regretScore >= 60).length / videos.length * 100) : 0}</dd></div><div><dt>Tekrar izleme</dt><dd>{formatDuration(videos.reduce((sum, video) => sum + video.rewatchSeconds, 0))}</dd></div></dl></section>;
}
