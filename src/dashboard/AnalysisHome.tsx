import { ArrowUpRight, BarChart3, Clock3, Hash, Layers, Radio, Timer, Users, Wallet } from "lucide-react";
import type { VideoRecord } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { PageHeading } from "./ui";

const sections = [
  ["topics", "Konular", "Hangi konulara gerçekten zaman ayırıyorsun?", Layers],
  ["channels", "Kanallar", "İzlemekten memnun kaldığın kanalları tanı.", Users],
  ["statistics", "İstatistikler", "İzleme süren, tamamlanma ve tekrarların.", BarChart3],
  ["cost", "Zaman Maliyeti", "Pişmanlık sinyali veren içeriklere ayırdığın süre.", Wallet],
  ["durations", "Video Süresi", "Sana uyan video uzunluklarını keşfet.", Timer],
  ["time", "İzleme Zamanları", "Günün ve haftanın izleme ritmini gör.", Clock3],
  ["titles", "Başlık Analizi", "Seni çeken kelimeler ve karşılanan beklentiler.", Hash],
  ["shorts", "Shorts Analizi", "Kısa videoların izleme alışkanlığındaki yeri.", Radio],
] as const;

export function AnalysisHome({ videos }: { videos: VideoRecord[] }) {
  const groups = [{ title: "Ne izliyorum?", copy: "İçeriklerini ve tercihlerini tanı.", ids: ["topics", "channels", "titles"] }, { title: "Zamanım nereye gidiyor?", copy: "Süreni ve günlük ritmini anlamlandır.", ids: ["statistics", "time", "cost"] }, { title: "Nasıl izliyorum?", copy: "Uzun videolarla kısa içerikleri ayrı değerlendir.", ids: ["durations", "shorts"] }];
  const topics = new Set(videos.flatMap(video => video.topics));
  return <div className="analysis-home"><PageHeading eyebrow="İZLEME ALIŞKANLIKLARIN" title="Analizler" copy="YouTube alışkanlıklarını üç basit soruyla keşfet. Önce merak ettiğin soruyu, sonra ilgili görünümü seç." />
    <section className="analysis-summary"><div><small>SEÇİLİ DÖNEM</small><strong>{formatDuration(videos.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0))}</strong><span>aktif izleme</span></div><p><b>{videos.length}</b> video <span>·</span> <b>{topics.size}</b> konu<br /><small>{videos.length ? "Aşağıdan bir görünüm seçerek ayrıntılara in." : "İzleme kaydın oluştukça analizler burada şekillenecek."}</small></p></section>
    <p className="analysis-start">İlk kez mi bakıyorsun? Genel durumun için <a href="#/statistics">İstatistikler</a> ile başlayabilirsin. Sayfaların başındaki açıklamalar yüzdelerin ne anlama geldiğini anlatır.</p>
    {groups.map(group => <section className="analysis-category" key={group.title}><header><h2>{group.title}</h2><p>{group.copy}</p></header><div className="analysis-grid" aria-label={group.title}>{sections.filter(([id]) => group.ids.includes(id)).map(([id, title, copy, Icon]) => <a className="analysis-tile" key={id} href={`#/${id}${location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""}`}><span className="analysis-icon"><Icon size={23} /></span><ArrowUpRight className="analysis-arrow" size={20} /><h3>{title}</h3><p>{copy}</p><span className="analysis-open">Bu veriyi anlamak istiyorum →</span></a>)}</div></section>)}
  </div>;
}
