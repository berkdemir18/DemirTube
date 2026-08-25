import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNAL_WEIGHTS, type PersonalSignal,
} from "../src/analytics/model-calibration";
import {
  evaluateModel, incrementalBacktest, learnSignalWeights, trainingOrder,
  type SignalReliability,
} from "../src/analytics/model-training";
import { derivePersonalModel } from "../src/analytics/personal-model";
import type { VideoRecord } from "../src/shared/types";

const DAY = 86_400_000;
const BASE = new Date("2026-07-01T12:00:00.000Z").getTime();

/** Her sinyal bilgi taşıyor kabul edilir; ölçülen şey yalnızca ağırlıklar. */
const reliability: SignalReliability = {
  channel: .9, topic: .9, duration: .9, title: .9, format: .9,
};

function record(index: number, completion: number, extra: Partial<VideoRecord> = {}): VideoRecord {
  const seen = new Date(BASE + index * DAY).toISOString();
  return {
    videoId: `v${index}`,
    title: `Video ${index}`,
    channelName: "Kanal",
    url: `https://www.youtube.com/watch?v=v${index}`,
    durationSeconds: 900,
    topics: ["Teknoloji"],
    firstSeenAt: seen,
    lastSeenAt: seen,
    totalWatchSeconds: 450,
    totalActiveWatchSeconds: 450,
    uniqueWatchedSeconds: Math.round(900 * completion),
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    completionRate: completion,
    sessionCount: 1,
    completed: completion >= .9,
    regretScore: 10,
    engagementScore: 50,
    contentType: "standard",
    ...extra,
  } as VideoRecord;
}

/**
 * Gerçeği YALNIZCA süre kovası belirliyor: kısa videolar bitiriliyor, uzunlar
 * yarıda bırakılıyor. Kanal ve konu bilerek gürültü — kanala göre tahmin eden
 * bir model burada hiçbir şey öğrenemez.
 */
const durationDriven: VideoRecord[] = Array.from({ length: 60 }, (_, index) => {
  const short = index % 2 === 0;
  return record(index, short ? .9 : .15, {
    durationSeconds: short ? 200 : 3_000,
    channelName: `Kanal ${index % 5}`,
    topics: [["Teknoloji", "Eğlence", "Eğitim"][index % 3]],
  });
});

describe("ağırlık öğrenimi", () => {
  it("gerçeği belirleyen sinyalin ağırlığını yükseltir", () => {
    const ordered = trainingOrder(durationDriven);
    const training = learnSignalWeights(ordered, reliability);

    expect(training.learned).toBe(true);
    // Süre, varsayılanda dördüncü sıradaki sinyal; öğrenme onu öne çıkarmalı.
    expect(training.weights.duration).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.duration);
    expect(training.weights.duration).toBeGreaterThan(training.weights.channel);
  });

  it("öğrenilen ağırlık, sabit varsayılandan daha az hata yapar", () => {
    const ordered = trainingOrder(durationDriven);
    const training = learnSignalWeights(ordered, reliability);

    // Ölçüm ağırlıkların GÖRMEDİĞİ dilimde; aynı veriyle hem eğitip hem sınamak
    // hatayı olduğundan iyi gösterir.
    const range = { from: training.trainEnd };
    const learned = incrementalBacktest(ordered, training.weights, reliability, range);
    const defaults = incrementalBacktest(ordered, DEFAULT_SIGNAL_WEIGHTS, reliability, range);

    expect(learned.sampleCount).toBeGreaterThan(5);
    expect(learned.meanAbsoluteError).toBeLessThan(defaults.meanAbsoluteError);
  });

  it("az kayıtta ağırlık aramaz, öncülde kalır", () => {
    const short = trainingOrder(durationDriven.slice(0, 12));
    const training = learnSignalWeights(short, reliability);

    expect(training.learned).toBe(false);
    expect(training.weights).toEqual(DEFAULT_SIGNAL_WEIGHTS);
  });

  it("hiçbir sinyalin işe yaramadığı geçmişte tabanı yenemediğini itiraf eder", () => {
    // Tamamlanma hiçbir gruba bağlı değil: deterministik ama sinyallerden
    // bağımsız bir sayı dizisi. Öğrenilecek örüntü yok.
    const scramble = (index: number) => ((index * 2_654_435_761) % 997) / 997;
    const noise = Array.from({ length: 60 }, (_, index) =>
      record(index, scramble(index), {
        channelName: `Kanal ${index % 7}`,
        durationSeconds: 300 + (index % 9) * 400,
      }));
    const ordered = trainingOrder(noise);
    const training = learnSignalWeights(ordered, reliability);
    const result = evaluateModel(ordered, training.weights, reliability, training);

    // Beceri skoru burada yüksek çıkarsa model kendini kandırıyordur.
    expect(result.skill).toBeLessThan(.35);
  });
});

describe("kişisel model karnesi", () => {
  it("modelin ölçülen becerisini raporlar ve tabanı yener", () => {
    const model = derivePersonalModel(durationDriven);

    expect(model.weightsLearned).toBe(true);
    expect(model.benchmark.sampleCount).toBeGreaterThan(5);
    expect(model.benchmark.meanAbsoluteError).toBeLessThan(model.benchmark.baselineMeanAbsoluteError);
    expect(model.benchmark.skill).toBeGreaterThan(0);
    expect((Object.keys(model.weights) as PersonalSignal[]).reduce((sum, key) => sum + model.weights[key], 0))
      .toBeCloseTo(1, 2);
  });

  it("boş geçmişte çökmez", () => {
    const model = derivePersonalModel([]);
    expect(model.benchmark.sampleCount).toBe(0);
    expect(model.weightsLearned).toBe(false);
  });
});

describe("maliyet", () => {
  it("400 kayıtlık geçmişte model türetimi keşfet taramasını kilitlemez", () => {
    // Keşfet 250 ms'de bir tarıyor ve model service worker'da paylaşılıyor;
    // ağırlık araması buraya eklendiği için maliyetin sabit kalması önemli.
    const large = Array.from({ length: 400 }, (_, index) =>
      record(index, (index % 10) / 10, {
        channelName: `Kanal ${index % 20}`,
        topics: [["Teknoloji", "Eğitim", "Eğlence", "Oyun"][index % 4]],
        durationSeconds: 200 + (index % 12) * 350,
      }));

    const started = performance.now();
    const model = derivePersonalModel(large);
    const elapsed = performance.now() - started;

    expect(model.weightsLearned).toBe(true);
    expect(elapsed).toBeLessThan(4_000);
    // Ölçüm (geliştirme makinesinde): ~270 ms; sınır CI için geniş bırakıldı.
  });
});
