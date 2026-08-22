import { describe, expect, it } from "vitest";
import { makeVideoDecision } from "../src/analytics/decision-assistant";
import { derivePersonalModel } from "../src/analytics/personal-model";
import { DEFAULT_SETTINGS } from "../src/shared/constants";
import type { VideoMetadata, VideoRecord } from "../src/shared/types";

const baseVideo: VideoRecord = {
  videoId: "video", title: "Yapay zeka rehberi", channelName: "Test Kanalı", url: "https://youtube.com/watch?v=video",
  durationSeconds: 120, topics: ["Yapay zekâ"], firstSeenAt: "2026-07-27T10:00:00Z", lastSeenAt: "2026-07-27T10:02:00Z",
  totalWatchSeconds: 60, totalActiveWatchSeconds: 60, uniqueWatchedSeconds: 60, rewatchSeconds: 0,
  uniquePlaybackSegments: [{ start: 0, end: 60 }], completionRate: .5, sessionCount: 1, completed: false,
  regretScore: 10, engagementScore: 50, contentType: "standard"
};

const learningMetadata: VideoMetadata = {
  videoId: "candidate", title: "TypeScript ile API kurulumu adım adım", channelName: "Kod Kanalı",
  url: "https://youtube.com/watch?v=candidate", durationSeconds: 600,
  topics: ["Programlama"], contentType: "standard"
};

const historyWithTopics = (topics: string[], count = 10): VideoRecord[] =>
  Array.from({ length: count }, (_, index) => ({ ...baseVideo, videoId: `history-${index}`, topics }));

describe("karar asistanı serbest izleme amaç uyumu", () => {
  it("önceden hesaplanan kişisel model aynı karar sonucunu korur", () => {
    const history = historyWithTopics(["Eğitim"]);
    const regular = makeVideoDecision(learningMetadata, history, [], DEFAULT_SETTINGS, []);
    const reused = makeVideoDecision(
      learningMetadata,
      history,
      [],
      DEFAULT_SETTINGS,
      [],
      derivePersonalModel(history)
    );

    expect(reused.score).toBe(regular.score);
    expect(reused.scoreContributions).toEqual(regular.scoreContributions);
    expect(reused.preference.model.weights).toEqual(regular.preference.model.weights);
  });

  it("öğrenme ağırlıklı geçmişte öğrenme videosuna yüksek uyum verir", () => {
    const decision = makeVideoDecision(learningMetadata, historyWithTopics(["Eğitim"]), [], DEFAULT_SETTINGS, []);
    expect(decision.goalFit).toBe(82);
  });

  it("eğlence ağırlıklı geçmişte öğrenme videosuna nötr uyum verir", () => {
    // Regresyon: eski kod mevcut videonun valueType'ını tüm geçmişe uyguluyor,
    // geçmiş dağılımını hiç okumuyordu; eğlence geçmişiyle de 82 dönüyordu.
    const decision = makeVideoDecision(learningMetadata, historyWithTopics(["Oyun", "Eğlence"]), [], DEFAULT_SETTINGS, []);
    expect(decision.goalFit).toBe(72);
  });

  it("geçmiş boşken varsayılan dağılımla çalışır", () => {
    const decision = makeVideoDecision(learningMetadata, [], [], DEFAULT_SETTINGS, []);
    expect(decision.goalFit).toBe(82);
    expect(decision.recommendation).not.toBe("skip");
    expect(decision.score).toBeUndefined();
    expect(decision.channelTrust.score).toBeUndefined();
    expect(decision.novelty.score).toBeUndefined();
    expect(decision.reasons).toContain("Kişisel puan gösterilmiyor; en az 5 geçmiş video gerekli.");
  });

  it("kanal ve başlık yüzdesini yeterli örnek olmadan üretmez", () => {
    const decision = makeVideoDecision(learningMetadata, historyWithTopics(["Eğitim"], 2), [], DEFAULT_SETTINGS, []);
    expect(decision.channelTrust).toMatchObject({ score: undefined, sampleCount: 0, label: "Kanal verisi yetersiz" });
    expect(decision.novelty).toMatchObject({ score: undefined, sampleCount: 2 });
  });

  it("izleme modu nihai puanı ölçülü biçimde değiştirir ve katkıları toplam puanı açıklar", () => {
    const history = historyWithTopics(["Eğitim"]);
    const open = makeVideoDecision(learningMetadata, history, [], DEFAULT_SETTINGS, []);
    const learn = makeVideoDecision(learningMetadata, history, [], { ...DEFAULT_SETTINGS, watchIntent: "learn" }, []);
    const shortBreak = makeVideoDecision(
      { ...learningMetadata, durationSeconds: 1_800 },
      history,
      [],
      { ...DEFAULT_SETTINGS, watchIntent: "relax" },
      []
    );
    expect(learn.score).toBeGreaterThanOrEqual(open.score ?? 0);
    expect(shortBreak.goalFit).toBe(42);
    expect(learn.scoreContributions.reduce((sum, item) => sum + item.points, 50)).toBe(learn.score);
    expect(learn.scoreContributions).toContainEqual(expect.objectContaining({ key: "intent", label: "İzleme modu" }));
    expect(learn.decisionLabel).not.toBe("Veri yetersiz");
  });
});
