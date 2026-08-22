// DemirTube Focus UI · readable monthly capsule and yearly wrapped
import { CalendarRange, Flame, Gift, GraduationCap, Repeat, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { VideoRecord, WatchSession } from "../shared/types";
import { monthlyCapsule, yearlyWrapped } from "../analytics/monthly-capsule";
import { formatDuration } from "../shared/utils";
import { Empty, InfoTip, PageHeading } from "./ui";

export function CapsulePage({ videos, sessions }: { videos: VideoRecord[]; sessions: WatchSession[] }) {
  const capsule = monthlyCapsule(videos, sessions);
  const wrapped = yearlyWrapped(videos, sessions);

  if (!sessions.length) {
    return (
      <>
        <PageHeading eyebrow="ZAMAN KAPSÜLÜ" title="Kapsül" copy="Aylık özet ve yıllık wrapped burada üretilir." />
        <Empty>Henüz izleme verisi yok. Biraz YouTube izle, kapsülün dolsun.</Empty>
      </>
    );
  }

  const monthChange = capsule.monthOverMonthPercent;
  const monthComparison = monthChange === undefined
    ? "Geçen aya göre kıyas oluşturmak için önceki ay verisi gerekiyor."
    : `Geçen aya göre %${Math.abs(monthChange)} ${monthChange >= 0 ? "daha fazla" : "daha az"} izleme.`;

  return (
    <>
      <PageHeading
        eyebrow="ZAMAN KAPSÜLÜ"
        title="Kapsül"
        copy="Bu ayın özeti ve yılın wrapped kartı; veriler cihazında anlık hesaplanır."
      />

      <CapsuleReport
        tone="monthly"
        icon={<CalendarRange size={20} />}
        title={capsule.monthLabel}
        copy={`Aylık kapsül · ${monthComparison}`}
        metrics={[
          {
            label: "İzleme süresi",
            value: formatDuration(capsule.totalWatchSeconds),
            meta: `${capsule.videoCount} video · ${capsule.completedCount} tamamlandı`,
            help: "Bu ay başlayan oturumların aktif oynatma süreleri toplanır. Duraklama, sekmenin gizli olduğu anlar ve yüklenme beklemeleri sayılmaz.",
            lead: true,
          },
          {
            label: "Ortalama tamamlama",
            value: `%${capsule.averageCompletion}`,
            meta: "Benzersiz izlemeye göre",
            help: "Her videoda benzersiz izlenen saniye video süresine bölünür; aynı bölümün tekrar izlenmesi oranı şişirmez. Sonra videoların ortalaması alınır.",
          },
          {
            label: "En uzun gün",
            value: formatDuration(capsule.longestDaySeconds),
            meta: capsule.longestDayLabel ?? "Henüz gün verisi yok",
            help: "Aynı takvim gününde başlayan tüm izleme oturumlarının aktif süreleri toplanır ve en yüksek toplam seçilir.",
          },
          {
            label: "Top konular",
            value: capsule.topTopics.join(" · ") || "Henüz belirlenmedi",
            meta: capsule.topChannels.slice(0, 2).join(" · ") || "Kanal verisi oluşmadı",
            help: "Bu ay izlenen videolar konularına göre gruplanır; izleme süresi ve video sayısı en yüksek konular öne çıkarılır.",
            text: true,
          },
        ]}
        preparation={capsule.preparationSeconds > 0 ? (
          <><GraduationCap size={16} /> Bu ay üniversite hazırlığına <strong>{formatDuration(capsule.preparationSeconds)}</strong> ayırdın.</>
        ) : undefined}
      />

      <CapsuleReport
        tone="wrapped"
        icon={<Gift size={20} />}
        title={`${wrapped.year} Wrapped`}
        copy="Yıl başından bugüne oluşan kişisel izleme özeti"
        metrics={[
          {
            label: "Toplam izleme",
            value: formatDuration(wrapped.totalWatchSeconds),
            meta: `${wrapped.videoCount} video · %${wrapped.averageCompletion} tamamlama`,
            help: "Yılın başından bugüne başlayan tüm oturumların gerçek aktif oynatma süreleri toplanır.",
            lead: true,
          },
          {
            label: "Yılın konuları",
            value: wrapped.topTopics.slice(0, 3).join(" · ") || "Henüz belirlenmedi",
            meta: wrapped.topChannels.slice(0, 3).join(" · ") || "Kanal verisi oluşmadı",
            help: "Yıl içindeki videolar konu ve kanal bazında gruplanır; toplam izleme davranışında en güçlü olanlar sıralanır.",
            text: true,
          },
          {
            label: "Maraton günü",
            value: formatDuration(wrapped.longestDaySeconds),
            meta: wrapped.longestDayLabel ?? "Henüz gün verisi yok",
            help: "Yıl içindeki her günün aktif izleme toplamı karşılaştırılır; en uzun gün ve toplam süresi gösterilir.",
            icon: <Flame size={14} />,
          },
          {
            label: "En çok tekrar",
            value: wrapped.mostRewatchedTitle ?? "Yeterli tekrar yok",
            meta: wrapped.strongestEngagementTitle ? `En saran: ${wrapped.strongestEngagementTitle}` : "Etkileşim verisi oluşmadı",
            help: "Aynı bölümlerin toplam 30 saniyeden fazla tekrar izlendiği videolar karşılaştırılır. En yüksek tekrar süresi olan video seçilir.",
            icon: <Repeat size={14} />,
            text: true,
          },
        ]}
        preparation={wrapped.preparationSeconds > 0 ? (
          <><Trophy size={16} /> {wrapped.year}'de hazırlık videolarına toplam <strong>{formatDuration(wrapped.preparationSeconds)}</strong> yatırdın.</>
        ) : undefined}
      />
    </>
  );
}

type CapsuleMetric = {
  label: string;
  value: string;
  meta: string;
  help: string;
  lead?: boolean;
  text?: boolean;
  icon?: ReactNode;
};

function CapsuleReport({
  tone,
  icon,
  title,
  copy,
  metrics,
  preparation,
}: {
  tone: "monthly" | "wrapped";
  icon: ReactNode;
  title: string;
  copy: string;
  metrics: CapsuleMetric[];
  preparation?: ReactNode;
}) {
  return (
    <section className={`capsule-report capsule-report-${tone}`}>
      <header className="capsule-report-head">
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
      </header>
      <div className="capsule-stat-grid">
        {metrics.map((metric, index) => (
          <article
            className={`capsule-stat ${metric.lead ? "capsule-stat-lead" : ""} ${metric.text ? "capsule-stat-text" : ""}`}
            key={metric.label}
          >
            <div className="capsule-stat-label">
              {metric.icon}
              <span>{metric.label}</span>
              <InfoTip title={metric.label} align={index === metrics.length - 1 ? "right" : "left"}>{metric.help}</InfoTip>
            </div>
            <strong>{metric.value}</strong>
            <small>{metric.meta}</small>
          </article>
        ))}
      </div>
      {preparation ? <p className="capsule-prep">{preparation}</p> : null}
    </section>
  );
}
