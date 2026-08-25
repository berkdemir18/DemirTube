// DemirTube · seçim yanlılığı analizi
//
// Modelin en büyük kör noktası: tahmin kaydı yalnızca kullanıcının AÇTIĞI
// videolar için tutuluyordu. Yüksek puan verilip hiç tıklanmayan video hiçbir
// yere yazılmıyor, dolayısıyla model kendi önerilerinin tutup tutmadığını asla
// öğrenemiyordu. Elde yalnızca kullanıcının zaten seçtiği örnekler olunca
// ölçülen şey "izlenen videonun ne kadarı bitirilir" oluyor; oysa ürünün
// vaadi "bunu izlemeli misin".
//
// Bu modül, gösterilen kartları (impression) izleme geçmişiyle eşleştirip
// modelin gerçek AYIRT ETME gücünü ölçer.
//
// Uyarı — ve bu kodun her kullanıcısı bunu bilmeli: "açılmadı", "beğenilmedi"
// demek değildir. Kart görüş alanına girmemiş, sonraya bırakılmış ya da başka
// bir cihazda izlenmiş olabilir. Buradaki sayılar bir etiket değil, bir
// yanlılık ölçüsüdür.
import type { FeedImpression, VideoRecord } from "../shared/types";
import { evidenceLevel } from "./evidence";
import { clamp, round } from "../shared/utils";
import type { Confidence } from "../shared/types";

export type ScoreBand = {
  label: string;
  min: number;
  max: number;
  shown: number;
  opened: number;
  /** Bu bantta gösterilen kartların açılma oranı (%). */
  openRate: number;
};

export type SelectionBiasReport = {
  /** Puanlanıp gösterilmiş kart sayısı. */
  shown: number;
  /** Bunlardan kaçı sonradan izlendi. */
  opened: number;
  openRate: number;
  /** Açılanların ortalama puanı. */
  openedAverageScore: number;
  /** Açılmayanların ortalama puanı. */
  skippedAverageScore: number;
  /**
   * Ayırt etme gücü (AUC, 0–1). Rastgele bir açılan videonun puanının,
   * rastgele bir açılmayanınkinden yüksek olma olasılığı. 0.5 = puan seçimle
   * hiç ilgili değil; 0.5'in altı = puan tersine çalışıyor.
   */
  discrimination: number;
  /** Puan bantlarına göre açılma oranı; iyi bir modelde monoton artar. */
  bands: ScoreBand[];
  /** Yüksek puan verilip hiç açılmamış kart sayısı — modelin fazla güvendiği yer. */
  overconfident: number;
  confidence: Confidence;
  /** Ölçüm anlamlı bir sonuç üretecek kadar veri var mı? */
  enoughData: boolean;
};

export const EMPTY_SELECTION_BIAS: SelectionBiasReport = {
  shown: 0, opened: 0, openRate: 0, openedAverageScore: 0, skippedAverageScore: 0,
  discrimination: .5, bands: [], overconfident: 0, confidence: "low", enoughData: false,
};

const BAND_EDGES: Array<{ label: string; min: number; max: number }> = [
  { label: "0–40", min: 0, max: 40 },
  { label: "40–60", min: 40, max: 60 },
  { label: "60–80", min: 60, max: 80 },
  { label: "80+", min: 80, max: 101 },
];

/** Anlamlı bir ayırt etme ölçümü için gereken en az gösterim. */
export const MIN_IMPRESSIONS_FOR_BIAS = 20;

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * Mann–Whitney U üzerinden AUC. Eşit puanlar ortalama sıra alır; aksi hâlde
 * çok sayıda aynı puanlı kart sonucu yapay olarak yukarı çeker.
 */
export function discriminationAuc(opened: number[], skipped: number[]): number {
  if (!opened.length || !skipped.length) return .5;
  const all = [...opened.map((score) => ({ score, opened: true })), ...skipped.map((score) => ({ score, opened: false }))]
    .toSorted((a, b) => a.score - b.score);

  // Ortalama sıra: beraberlik gruplarına aynı sıra verilir.
  const ranks = new Array<number>(all.length);
  let index = 0;
  while (index < all.length) {
    let end = index;
    while (end + 1 < all.length && all[end + 1].score === all[index].score) end += 1;
    const shared = (index + end) / 2 + 1;
    for (let position = index; position <= end; position += 1) ranks[position] = shared;
    index = end + 1;
  }

  const openedRankSum = all.reduce((sum, item, position) => sum + (item.opened ? ranks[position] : 0), 0);
  const positives = opened.length;
  const negatives = skipped.length;
  return clamp(
    (openedRankSum - (positives * (positives + 1)) / 2) / (positives * negatives),
    0, 1
  );
}

/**
 * Gösterilen kartları izleme geçmişiyle eşleştirir. Bir kart, gösterildikten
 * SONRA izlenmişse açılmış sayılır: gösterimden önce izlenmiş bir video zaten
 * "öneri tuttu" örneği değildir.
 */
export function analyzeSelectionBias(
  impressions: FeedImpression[],
  history: VideoRecord[]
): SelectionBiasReport {
  const watched = new Map(history.map((video) => [video.videoId, video]));
  const scored = impressions.filter((item) => item.score !== undefined);
  if (!scored.length) return EMPTY_SELECTION_BIAS;

  const openedScores: number[] = [];
  const skippedScores: number[] = [];
  for (const impression of scored) {
    const video = watched.get(impression.videoId);
    const openedAfterShown = video !== undefined && video.lastSeenAt >= impression.firstShownAt;
    (openedAfterShown ? openedScores : skippedScores).push(impression.score!);
  }

  const bands = BAND_EDGES.map(({ label, min, max }) => {
    const inBand = (score: number) => score >= min && score < max;
    const shown = openedScores.filter(inBand).length + skippedScores.filter(inBand).length;
    const opened = openedScores.filter(inBand).length;
    return { label, min, max, shown, opened, openRate: shown ? round(opened / shown * 100) : 0 };
  });

  return {
    shown: scored.length,
    opened: openedScores.length,
    openRate: round(openedScores.length / scored.length * 100),
    openedAverageScore: round(average(openedScores)),
    skippedAverageScore: round(average(skippedScores)),
    discrimination: round(discriminationAuc(openedScores, skippedScores), 3),
    bands,
    overconfident: skippedScores.filter((score) => score >= 75).length,
    confidence: evidenceLevel(scored.length, MIN_IMPRESSIONS_FOR_BIAS, 80).confidence,
    enoughData: scored.length >= MIN_IMPRESSIONS_FOR_BIAS && openedScores.length > 0 && skippedScores.length > 0,
  };
}

/** Ayırt etme gücünün insan diliyle karşılığı. */
export function discriminationLabel(auc: number): string {
  if (auc >= .7) return "Puan, seçimlerini güçlü biçimde öngörüyor";
  if (auc >= .58) return "Puan, seçimlerinle ölçülebilir biçimde uyumlu";
  if (auc >= .45) return "Puan, hangi videoyu açacağını neredeyse hiç öngörmüyor";
  return "Puan seçimlerinle ters yönde çalışıyor";
}
