export type DataLevel = {
  level: number;
  label: string;
  tagline: string;
  /** Sonraki seviye için gereken toplam video; son seviyede undefined. */
  nextAt?: number;
  /** Mevcut seviye içindeki ilerleme (0-100). */
  progress: number;
};

const LEVELS: Array<{ min: number; label: string; tagline: string }> = [
  { min: 0, label: "Isınma Turu", tagline: "İlk videoların; sistem seni izlemeye başladı." },
  { min: 5, label: "Öğreniyor", tagline: "Tercih profilin şekillenmeye başladı." },
  { min: 20, label: "Seni Çözüyor", tagline: "Skorlar artık kişisel geçmişine dayanıyor." },
  { min: 50, label: "Seni Tanıyor", tagline: "Kanal, konu ve süre kalıpların netleşti." },
  { min: 120, label: "İçli Dışlı", tagline: "Tahminler gerçek davranışınla kalibre ediliyor." },
  { min: 300, label: "Ruh İkizi", tagline: "DemirTube seni senden iyi tanıyor." }
];

/** Toplam izlenen video sayısından veri olgunluk seviyesini üretir. */
export function dataLevel(videoCount: number): DataLevel {
  let index = 0;
  LEVELS.forEach((entry, i) => { if (videoCount >= entry.min) index = i; });
  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const progress = next
    ? Math.min(100, Math.round(((videoCount - current.min) / (next.min - current.min)) * 100))
    : 100;
  return { level: index + 1, label: current.label, tagline: current.tagline, nextAt: next?.min, progress };
}
