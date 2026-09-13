import { AnalysisGuide } from "./AnalysisGuide";
// DemirTube Aurora UI v2 · unified dashboard visual system
import type { KeywordRules, UserVideoFeedback, VideoRecord } from "../shared/types";
import { calculateKeywordStatistics } from "../analytics/keyword-statistics";
import { Empty, PageHeading } from "./ui";

type DisplayMetric = "completion" | "regret";

export function TitleAnalysis({ videos, feedback = [], rules }: { videos: VideoRecord[]; feedback?: UserVideoFeedback[]; rules?: KeywordRules }) {
  const reliable = calculateKeywordStatistics(videos, 2, feedback, rules);
  const provisional = reliable.length === 0 && videos.length > 0;
  const stats = provisional ? calculateKeywordStatistics(videos, 1, feedback, rules) : reliable;
  const groups: Array<{ title: string; metric: DisplayMetric; items: typeof stats }> = provisional
    ? [
        { title: "Başlıklarda geçen kelimeler", metric: "completion", items: stats.toSorted((a, b) => b.count - a.count || b.averageCompletion - a.averageCompletion) },
        { title: "Yüksek tamamlamalı örnekler", metric: "completion", items: stats.toSorted((a, b) => b.averageCompletion - a.averageCompletion) },
        { title: "Pişmanlık sinyali olan örnekler", metric: "regret", items: stats.toSorted((a, b) => b.averageRegretScore - a.averageRegretScore) }
      ]
    : [
        { title: "İzlediğin başlıklarda en sık geçenler", metric: "completion", items: stats.toSorted((a, b) => b.count - a.count) },
        { title: "En yüksek tamamlama", metric: "completion", items: stats.toSorted((a, b) => b.averageCompletion - a.averageCompletion) },
        { title: "Pişmanlık sinyali yüksek başlıklar", metric: "regret", items: stats.toSorted((a, b) => b.averageRegretScore - a.averageRegretScore) }
      ];
  const copy = provisional
    ? "Tekrarlanan kelime henüz yok; tek videoluk örnekler keşif amaçlı gösteriliyor."
    : "Karşılaştırmalı sonuçlarda yalnızca en az iki farklı videoda geçen kelimeler kullanılır.";

  return <>
    <PageHeading eyebrow="BAŞLIK PSİKOLOJİSİ" title="Başlık Analizi" copy={copy} />
      <AnalysisGuide takeaway="İzlediğin videoların başlıklarında tekrar eden kelimeleri ve bu videoları ne kadar izlediğini karşılaştırır." definitions={[["İzlenen bölüm (%)","Kelimenin geçtiği videoların ortalama tamamlanma yüzdesi."],["Pişmanlık puanı (/100)","O videolardaki ortalama pişmanlık sinyali. Düşük değer daha az olumsuz sinyal demektir."],["Veri güveni","Kelime ne kadar çok farklı videoda görüldüyse çıkarım için o kadar çok örnek vardır."]]} hint="Bir kelimenin sık görünmesi, seni tıklamaya onun ikna ettiğini kanıtlamaz. Açmadığın tüm videolar burada karşılaştırılmaz." />
    {stats.length ? <>
      <div className="keyword-grid premium-grid">{groups.map(({ title, metric, items }) =>
        <section className="surface" key={title}>
          <h2>{title}</h2><p className="analysis-unit">{metric === "regret" ? "Ortalama pişmanlık puanı · 0–100" : "Ortalama izlenen bölüm · yüzde"}</p>
          <ol className="keyword-list">{items.slice(0, 8).map((stat) =>
            <li key={stat.keyword}>
              <span>{stat.keyword}<em>{stat.kind === "phrase" ? "cümlecik" : "kelime"}</em></span>
              <small>{stat.count} video · {stat.confidence === "high" ? "yüksek" : stat.confidence === "medium" ? "orta" : "düşük"} güven{provisional ? " · ön veri" : ""}</small>
              <b title={metric === "regret" ? "Ortalama pişmanlık puanı" : "Ortalama tamamlama"}>
                {metric === "regret" ? `${stat.averageRegretScore}/100` : `%${stat.averageCompletion}`}
              </b>
            </li>
          )}</ol>
        </section>
      )}</div>
      {provisional
        ? <p className="analysis-note">Bu kelimeler henüz bir tercih tahmini değildir. Aynı kelime ikinci bir videoda görüldüğünde karşılaştırmalı analize geçer.</p>
        : null}
    </> : <Empty>Başlık analizi için izleme kaydı bulunamadı.</Empty>}
  </>;
}
