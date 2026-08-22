// DemirTube Aurora UI v2 · unified dashboard visual system
import { BarChart3, Database, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

const steps = [
  { icon: ShieldCheck, title: "Veri sende kalır", copy: "DemirTube yalnızca YouTube sayfasında görünen video metadata'sını analiz eder; oynatma davranışını ise sadece watch ve Shorts sayfalarında kaydeder. Geçmişine, çerezlerine, kamerana veya mikrofonuna erişmez." },
  { icon: Database, title: "Önce yerel kayıt", copy: "Video ve oturumlar eklentinin IndexedDB alanında saklanır. Bulut yedeği yalnızca kendi Supabase hesabını açıkça bağlarsan çalışır." },
  { icon: BarChart3, title: "Sonuçlar zamanla güçlenir", copy: "İlk videolarda düşük güven gösterilir. Yaklaşık 5 örnekte karşılaştırmalar, 12 ve üzeri örnekte daha güvenilir örüntüler oluşur." }
];
export function Onboarding({ onComplete }: { onComplete: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const current = steps[step]; const Icon = current.icon;
  return <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><section className="onboarding-card onboarding-card-premium"><button className="onboarding-close" aria-label="Tanıtımı kapat" onClick={() => void onComplete()}><X/></button><span className="onboarding-icon"><Icon/></span><small>{step + 1} / {steps.length}</small><h1 id="onboarding-title">{current.title}</h1><p>{current.copy}</p><div className="onboarding-dots">{steps.map((_, index) => <i key={index} className={index === step ? "active" : ""}/>)}</div><button className="button primary" onClick={() => step === steps.length - 1 ? void onComplete() : setStep((value) => value + 1)}>{step === steps.length - 1 ? "DemirTube’u kullan" : "Devam"}</button></section></div>;
}
