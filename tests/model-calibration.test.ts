import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEUTRAL_CALIBRATION, applyCalibration, backtestCompletion, calibrationFromHistory,
  evidenceWeight, median, shrinkToPrior, weightedMedian,
  hasProspectivePrediction, errorRadius80,
} from "../src/analytics/model-calibration";
import { calculatePreference, predictCompletion } from "../src/analytics/preference-score";
import { derivePersonalModel } from "../src/analytics/personal-model";
import type { VideoMetadata, VideoRecord } from "../src/shared/types";

const DAY = 86_400_000;
const BASE = new Date("2026-07-01T12:00:00.000Z").getTime();

function video(partial: Partial<VideoRecord> & { videoId: string }): VideoRecord {
  const seen = partial.lastSeenAt ?? new Date(BASE).toISOString();
  return {
    title: `${partial.videoId} başlık`,
    channelName: "Kanal A",
    url: `https://www.youtube.com/watch?v=${partial.videoId}`,
    durationSeconds: 900,
    topics: ["Teknoloji"],
    firstSeenAt: seen,
    lastSeenAt: seen,
    totalWatchSeconds: 450,
    totalActiveWatchSeconds: 450,
    uniqueWatchedSeconds: 450,
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    completionRate: .5,
    sessionCount: 1,
    completed: false,
    regretScore: 20,
    engagementScore: 50,
    contentType: "standard",
    ...partial,
  } as VideoRecord;
}

/** Belirli bir tamamlanma oranını taşıyan tutarlı kayıt. */
function watched(videoId: string, completion: number, extra: Partial<VideoRecord> = {}): VideoRecord {
  return video({
    videoId,
    completionRate: completion,
    uniqueWatchedSeconds: Math.round(900 * completion),
    totalActiveWatchSeconds: Math.round(900 * completion),
    totalWatchSeconds: Math.round(900 * completion),
    ...extra,
  });
}

function metadataOf(partial: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    videoId: "aday",
    title: "Yeni bir video başlığı",
    channelName: "Kanal A",
    url: "https://www.youtube.com/watch?v=aday",
    durationSeconds: 900,
    topics: ["Teknoloji"],
    contentType: "standard",
    ...partial,
  } as VideoMetadata;
}

afterEach(() => vi.useRealTimers());

describe("kalibrasyon yardımcıları", () => {
  it("gözlemi örnek sayısına göre öncüle çeker", () => {
    // Tek örnek öncüle yakın kalır, çok örnek gözleme yaklaşır.
    expect(shrinkToPrior(90, 1, 50)).toBeCloseTo(58, 0);
    expect(shrinkToPrior(90, 20, 50)).toBeCloseTo(83.3, 1);
    expect(shrinkToPrior(90, 0, 50)).toBe(50);
  });

  it("kanıt ağırlığı örnekle birlikte artar ve 1'i geçmez", () => {
    expect(evidenceWeight(0)).toBe(0);
    expect(evidenceWeight(4)).toBeCloseTo(.5, 5);
    expect(evidenceWeight(1_000)).toBeLessThan(1);
    expect(evidenceWeight(1_000)).toBeGreaterThan(.99);
  });

  it("ortanca uç değerden etkilenmez", () => {
    expect(median([1, 2, 3, 4, 500])).toBe(3);
    expect(median([2, 4])).toBe(3);
    expect(median([])).toBe(0);
  });

  it("ağırlıklı ortanca taze kayıtlara doğru kayar", () => {
    // Aynı değerler, ama son kayıt çok daha ağır: ortanca ona doğru kayar.
    expect(weightedMedian([10, 20, 90], [1, 1, 1])).toBe(20);
    expect(weightedMedian([10, 20, 90], [.1, .1, 10])).toBe(90);
    expect(weightedMedian([], [])).toBe(0);
  });
});

describe("v6 tahmin kökeni", () => {
  it("sonradan üretilmiş, geçersiz ve aktif tahminleri dışlar", () => {
    const legitimate = watched("safe", .8, { predictionSnapshot: {
      estimatedCompletion: 70, confidence: "medium", modelVersion: "adaptive-v6",
      predictedAt: new Date(BASE).toISOString(), signals: [],
    } });
    expect(hasProspectivePrediction(legitimate)).toBe(true);
    for (const predictedAt of ["invalid", new Date(BASE + DAY).toISOString()]) {
      expect(hasProspectivePrediction({ ...legitimate, predictionSnapshot: { ...legitimate.predictionSnapshot!, predictedAt } })).toBe(false);
    }
    expect(calibrationFromHistory([{ ...legitimate, isCurrentlyWatching: true }]).sampleCount).toBe(0);
  });

  it("kalibrasyon ham tahmini düzeltirken doğruluğu gösterilen tahminle ölçer", () => {
    const history = Array.from({ length: 12 }, (_, index) => watched(`raw${index}`, .7, {
      predictionSnapshot: { estimatedCompletion: 70, rawEstimatedCompletion: 50, confidence: "medium",
        modelVersion: "adaptive-v6", predictedAt: new Date(BASE).toISOString(), signals: [] },
    }));
    const calibration = calibrationFromHistory(history);
    expect(calibration.meanAbsoluteError).toBe(0);
    expect(calibration.correction).toBeGreaterThan(0);
  });

  it("belirsizliği az örnekte uydurmaz, ampirik yüzde 80 hata sınırını kullanır", () => {
    expect(errorRadius80([1, 2, 3])).toBeUndefined();
    expect(errorRadius80([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])).toBe(9);
  });
});

describe("sonuç kalibrasyonu", () => {
  const withSnapshot = (videoId: string, predicted: number, actual: number) =>
    watched(videoId, actual / 100, {
      predictionSnapshot: {
        estimatedCompletion: predicted, confidence: "medium",
        modelVersion: "adaptive-v6", predictedAt: new Date(BASE).toISOString(), signals: [],
      },
    });

  it("eski sürümle üretilmiş tahminleri düşük ağırlıkla sayar", () => {
    // Sürüm değişince tüm kalibrasyonu çöpe atmak, aylarca birikmiş sonucu
    // silip düzeltmeyi sıfırdan başlatıyordu. Artık eski sürüm sayılıyor ama
    // yeni sürümün kendi sonuçlarına göre çok daha az ağırlıkla.
    const legacy = (count: number) => Array.from({ length: count }, (_, index) =>
      watched(`o${index}`, .75, {
        predictionSnapshot: {
          estimatedCompletion: 60, confidence: "medium",
          modelVersion: "adaptive-v3", predictedAt: new Date(BASE).toISOString(), signals: [],
        },
      }));
    const current = (count: number) => Array.from({ length: count }, (_, index) =>
      withSnapshot(`y${index}`, 60, 75));

    const old = calibrationFromHistory(legacy(10));
    const fresh = calibrationFromHistory(current(10));

    // Aynı sapma, aynı örnek sayısı: eski sürüm belirgin biçimde daha az düzeltir.
    expect(old.sampleCount).toBe(10);
    expect(old.effectiveSampleCount).toBeLessThan(fresh.effectiveSampleCount / 2);
    expect(old.correction).toBeGreaterThan(0);
    expect(old.correction).toBeLessThan(fresh.correction);
  });

  it("tahmin seviyesine bağlı sapmayı (eğim) yakalar", () => {
    // Model düşük tahminlerde iyimser, yüksek tahminlerde kötümser: tek sayılı
    // düzeltme bunu göremezdi, çünkü ortalama sapma sıfıra yakın.
    const skewed = [
      ...Array.from({ length: 8 }, (_, index) => withSnapshot(`d${index}`, 20, 5)),
      ...Array.from({ length: 8 }, (_, index) => withSnapshot(`u${index}`, 80, 95)),
    ];
    const calibration = calibrationFromHistory(skewed);

    expect(Math.abs(calibration.medianSignedError)).toBeLessThan(10);
    expect(calibration.slopeCorrection).toBeGreaterThan(.1);
    // Düşük tahmin daha da aşağı, yüksek tahmin daha da yukarı çekilir.
    expect(applyCalibration(20, calibration)).toBeLessThan(20);
    expect(applyCalibration(80, calibration)).toBeGreaterThan(80);
  });

  it("üç örneğin altında düzeltme üretmez", () => {
    const calibration = calibrationFromHistory([withSnapshot("a", 40, 80), withSnapshot("b", 40, 80)]);
    expect(calibration.sampleCount).toBe(2);
    expect(calibration.correction).toBe(0);
  });

  it("sistematik sapmayı ölçer ve sönümleyerek düzeltir", () => {
    // Model sürekli 30 puan düşük tahmin ediyor.
    const history = Array.from({ length: 12 }, (_, index) => withSnapshot(`v${index}`, 40, 70));
    const calibration = calibrationFromHistory(history);

    expect(calibration.medianSignedError).toBe(30);
    expect(calibration.meanAbsoluteError).toBe(30);
    expect(calibration.hitRate).toBe(0);
    // Ham sapmanın tamamı uygulanmaz ve üst sınır aşılmaz.
    expect(calibration.correction).toBeGreaterThan(0);
    expect(calibration.correction).toBeLessThanOrEqual(12);
  });

  it("isabetli modelde düzeltme sıfıra yakın kalır", () => {
    const history = Array.from({ length: 10 }, (_, index) => withSnapshot(`v${index}`, 60 + (index % 2 ? 4 : -4), 60));
    const calibration = calibrationFromHistory(history);

    expect(Math.abs(calibration.correction)).toBeLessThanOrEqual(1);
    expect(calibration.hitRate).toBe(1);
  });
});

describe("tamamlanma tahmini", () => {
  const neutral = NEUTRAL_CALIBRATION;

  it("kanıtsız sinyalleri nötr 50 ile değil kişisel tabanla doldurur", () => {
    const prediction = predictCompletion(
      [{ observed: undefined, sampleCount: 0, weight: .5, reliability: .9 }, { observed: undefined, sampleCount: 0, weight: .5, reliability: .9 }],
      28,
      neutral
    );
    expect(prediction).toBe(28);
  });

  it("güçlü kanıt tabanı kendine çeker, zayıf kanıt çekemez", () => {
    const strong = predictCompletion([{ observed: 85, sampleCount: 25, weight: 1, reliability: .9 }], 30, neutral);
    const weak = predictCompletion([{ observed: 85, sampleCount: 1, weight: 1, reliability: .9 }], 30, neutral);

    expect(strong).toBeGreaterThan(70);
    expect(weak).toBeLessThan(45);
    expect(weak).toBeGreaterThan(30);
  });

  it("kalibrasyon düzeltmesini uygular ve 0–100 dışına taşmaz", () => {
    expect(predictCompletion([{ observed: 60, sampleCount: 20, weight: 1, reliability: .9 }], 50, { ...neutral, correction: 10 }))
      .toBeGreaterThan(predictCompletion([{ observed: 60, sampleCount: 20, weight: 1, reliability: .9 }], 50, neutral));
    expect(predictCompletion([{ observed: 98, sampleCount: 99, weight: 1, reliability: .9 }], 98, { ...neutral, correction: 12 })).toBe(100);
  });
});

describe("tahmin motorunun tutarlılığı", () => {
  const history = Array.from({ length: 12 }, (_, index) =>
    watched(`h${index}`, index % 3 === 0 ? .9 : .4, {
      lastSeenAt: new Date(BASE - index * DAY).toISOString(),
      firstSeenAt: new Date(BASE - index * DAY).toISOString(),
    }));

  it("aynı girdi için duvar saatinden bağımsız olarak aynı puanı verir", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T03:00:00.000Z"));
    const night = calculatePreference(metadataOf(), history);

    vi.setSystemTime(new Date("2026-09-20T14:00:00.000Z"));
    const day = calculatePreference(metadataOf(), history);

    expect(day.score).toBe(night.score);
    expect(day.estimatedCompletion).toBe(night.estimatedCompletion);
  });

  it("tahmin tamamlanma ölçeğinde kalır: kanalın gerçek ortalamasına yakınsar", () => {
    // Tek kanal, tutarlı %80 tamamlanma. Tahmin de o civarda olmalı.
    const steady = Array.from({ length: 14 }, (_, index) =>
      watched(`s${index}`, .8, {
        lastSeenAt: new Date(BASE - index * DAY).toISOString(),
        firstSeenAt: new Date(BASE - index * DAY).toISOString(),
      }));
    const result = calculatePreference(metadataOf(), steady);

    expect(result.estimatedCompletion).toBeGreaterThan(65);
    expect(result.estimatedCompletion).toBeLessThan(95);
  });

  it("tek pişman video koca kanalı uçurumdan atmaz", () => {
    const withOneRegret = history.map((item, index) => index === 0 ? { ...item, regretScore: 90 } : item);
    const before = calculatePreference(metadataOf(), history).score!;
    const after = calculatePreference(metadataOf(), withOneRegret).score!;

    // Eskiden tek video 14 puanlık sabit ceza getiriyordu.
    expect(before - after).toBeLessThan(6);
  });

  it("modeli kalibrasyonuyla birlikte raporlar", () => {
    const model = derivePersonalModel(history);
    expect(model.version).toBe("adaptive-v6");
    expect(model.calibration).toBeDefined();
    expect(Object.values(model.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 2);
  });
});

describe("geriye dönük sınama", () => {
  /** Gerçek bir örüntü: "Derin Kanal" hep bitirilir, "Gürültü" hep yarıda bırakılır. */
  const realistic: VideoRecord[] = Array.from({ length: 40 }, (_, index) => {
    const deep = index % 2 === 0;
    const seen = new Date(BASE - (40 - index) * DAY).toISOString();
    return watched(`b${index}`, deep ? .85 : .15, {
      channelName: deep ? "Derin Kanal" : "Gürültü",
      topics: [deep ? "Eğitim" : "Eğlence"],
      lastSeenAt: seen,
      firstSeenAt: seen,
    });
  });

  it("model, 'herkes ortalamada davranır' tabanından daha iyi tahmin eder", () => {
    const result = backtestCompletion(realistic, (candidate, prior) => {
      if (prior.length < 6) return undefined;
      return calculatePreference(
        metadataOf({
          videoId: candidate.videoId,
          title: candidate.title,
          channelName: candidate.channelName,
          topics: candidate.topics,
          durationSeconds: candidate.durationSeconds,
        }),
        prior
      ).estimatedCompletion;
    });

    expect(result.sampleCount).toBeGreaterThan(20);
    // Asıl ölçüt: kişisel ortalamayı papağan gibi tekrar eden modelden iyi olmak.
    // Ölçüm (bu kurgu geçmişte): MAE 18.2, taban 36.0, isabet %74, sapma +1.1.
    expect(result.meanAbsoluteError).toBeLessThan(result.baselineMeanAbsoluteError * 0.7);
    expect(result.hitRate).toBeGreaterThan(.6);
    // Sistematik sapma olmamalı: model ne sürekli yüksek ne sürekli düşük tahmin etmeli.
    expect(Math.abs(result.meanSignedError)).toBeLessThan(6);
  });

  it("tahmin üretilemeyen kayıtları atlar ve boş geçmişte çökmez", () => {
    expect(backtestCompletion([], () => undefined).sampleCount).toBe(0);
    expect(backtestCompletion(realistic, () => undefined).sampleCount).toBe(0);
  });
});
