// DemirTube Aurora UI v2 · unified dashboard visual system
import { Info } from "lucide-react";
import type { ReactNode } from "react";

type PageHeadingProps = {
  title: string;
  copy: string;
  eyebrow?: string;
  action?: ReactNode;
};

export function PageHeading({ title, copy, eyebrow = "DEMIRTUBE INTELLIGENCE", action }: PageHeadingProps) {
  return <header className="page-heading">
    <div className="page-heading-copy">
      <span className="page-eyebrow"><i />{eyebrow}</span>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
    {action ? <div className="page-heading-action">{action}</div> : null}
  </header>;
}

/**
 * Grafikleri ekran okuyucudan gizler.
 *
 * Recharts'ın ürettiği SVG, eksen etiketlerini ve tick değerlerini bağlamsız
 * metin düğümleri olarak bırakır; ekran okuyucu bunları anlamsız bir sayı
 * yığını gibi okur. Grafiğin taşıdığı bilgi zaten çevresindeki başlık, legend
 * veya tabloda bulunduğu için görsel katman `aria-hidden` yapılır.
 *
 * Sayısal bilgi yalnızca grafikte varsa `summary` ile görsel olarak gizli ama
 * ekran okuyucunun okuduğu bir metin karşılığı geç.
 */
export function ChartFrame({
  summary,
  className,
  children,
}: {
  summary?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return <>
    {summary ? <p className="visually-hidden">{summary}</p> : null}
    <div className={className} aria-hidden="true">{children}</div>
  </>;
}

export function Empty({ children = "Henüz yeterli veri yok." }: { children?: ReactNode }) {
  return <div className="empty" role="status"><span className="empty-orbit"><i /></span><div>{children}</div></div>;
}

export function Meter({ value }: { value: number }) {
  const safeValue = Math.min(Math.max(value, 0), 100);
  return <div className="meter" aria-label={`Yüzde ${Math.round(safeValue)}`}><i style={{ width: `${safeValue}%` }} /></div>;
}

export function Score({ value }: { value?: number }) {
  return value === undefined
    ? <span className="insufficient">Yeterli veri yok</span>
    : <strong className="score" style={{ "--score": Math.min(Math.max(value, 0), 100) } as React.CSSProperties}>{Math.round(value)}</strong>;
}

export function InfoTip({
  title,
  children,
  align = "left",
}: {
  title: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <details className={`info-tip info-tip-${align}`} name="dashboard-metric-info">
      <summary aria-label={`${title} hakkında bilgi`} title={`${title} nasıl hesaplanır?`}>
        <Info size={14} />
      </summary>
      <div className="info-tip-popover" role="note">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </details>
  );
}

export function DataMaturity({ count, goal = 10 }: { count: number; goal?: number }) {
  const progress = Math.min(count / goal * 100, 100);
  const label = count < 3 ? "Başlangıç verisi" : count < goal ? "Öğrenme devam ediyor" : "Güvenilir profil";
  return <section className="maturity" aria-label={`Veri olgunluğu ${count}/${goal}`}>
    <div className="maturity-copy"><strong>{label}</strong><span>{count}/{goal} video</span></div>
    <div className="maturity-track"><i style={{ width: `${progress}%` }}/></div>
    <p>{count < 3 ? "İlk kayıtların ayrıntıları gösteriliyor; karşılaştırmalı puanlar üç videodan sonra anlamlılaşır." : count < goal ? "Her yeni video, konu ve süre tahminlerini daha güvenilir yapar." : "Karşılaştırmalı analizler için yeterli davranış örneği oluştu."}</p>
  </section>;
}
