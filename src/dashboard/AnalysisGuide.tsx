import { BookOpen, ArrowLeft } from "lucide-react";

export function AnalysisGuide({ takeaway, definitions, hint }: { takeaway: string; definitions: [string, string][]; hint: string }) {
  return <section className="analysis-guide" aria-label="Bu verileri nasıl okumalı?">
    <div className="analysis-takeaway"><BookOpen size={21} /><div><small>BU EKRAN NE ANLATIYOR?</small><p>{takeaway}</p></div></div>
    <dl className="analysis-definitions">{definitions.map(([name, description]) => <div key={name}><dt>{name}</dt><dd>{description}</dd></div>)}</dl>
    <div className="analysis-guide-footer"><p>{hint}</p><a href={`#/analysis${location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""}`}><ArrowLeft size={14} />Analiz Merkezi</a></div>
  </section>;
}
