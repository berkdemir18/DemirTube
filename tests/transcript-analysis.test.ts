import { describe, expect, it } from "vitest";
import { analyzeTranscript } from "../src/analytics/transcript-analysis";

describe("altyazı önemli an kategorileri", () => {
  it("altyazı cümlesini kopyalamak yerine semantik bölüm etiketi üretir", () => {
    const sentence = "Evet şimdi sıra ürünü incelemekte ve teknik özelliklerine yakından bakacağız";
    const result = analyzeTranscript([
      { startSeconds: 12, text: "Bugün yeni telefonun kutusunu açıyoruz" },
      { startSeconds: 88, text: sentence },
      { startSeconds: 220, text: "Şimdi performans testini deneyelim ve sonuçlara bakalım" }
    ], "Yeni telefon kutu açılışı ve inceleme");

    expect(result.keyMoments.map((moment) => moment.label)).toContain("Kutu açılışı");
    expect(result.keyMoments.map((moment) => moment.label)).toContain("Ürün incelemesi");
    expect(result.keyMoments.some((moment) => moment.label === sentence)).toBe(false);
  });
});
