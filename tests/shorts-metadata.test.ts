import { describe, expect, it } from "vitest";
import { usableTitle } from "../src/shared/utils";
import { needsMetadataRepair } from "../src/background/youtube-metadata";
import { calibratePreferenceSignal } from "../src/analytics/preference-score";
import { hasMeasurableDuration } from "../src/analytics/completion";

describe("shorts başlık ayıklama", () => {
  it("yorum butonunun etiketini başlık saymaz", () => {
    expect(usableTitle("Yorumlar\n      1,4 B")).toBe("");
    expect(usableTitle("Comments\n 233")).toBe("");
  });

  it("sekme başlığı yedeğini başlık saymaz", () => {
    expect(usableTitle("YouTube")).toBe("");
    expect(usableTitle("Başlıksız video")).toBe("");
  });

  it("gerçek başlıkları olduğu gibi geçirir", () => {
    expect(usableTitle("  Yapay zekâ ile 10 dakikada uygulama  ")).toBe("Yapay zekâ ile 10 dakikada uygulama");
  });

  it("içinde geçen kelimeler yüzünden geçerli başlığı elemez", () => {
    expect(usableTitle("YouTube algoritması nasıl çalışıyor?")).toBe("YouTube algoritması nasıl çalışıyor?");
    expect(usableTitle("Yorumlarınıza cevap veriyorum")).toBe("Yorumlarınıza cevap veriyorum");
  });
});

describe("bozuk kayıt tespiti", () => {
  it("yorum etiketi başlık olarak saklanmış kaydı onarıma alır", () => {
    expect(needsMetadataRepair({ title: "Yorumlar\n      1 B", channelName: "@trendritim" })).toBe(true);
  });

  it("kanalı bilinmeyen kaydı onarıma alır", () => {
    expect(needsMetadataRepair({ title: "Gerçek bir başlık", channelName: "Bilinmeyen kanal" })).toBe(true);
  });

  it("sağlam kaydı onarıma almaz", () => {
    expect(needsMetadataRepair({ title: "Gerçek bir başlık", channelName: "@kanal" })).toBe(false);
  });
});

describe("ölçülebilirlik", () => {
  it("süresi okunamamış kaydı istatistik dışı bırakır", () => {
    expect(hasMeasurableDuration({ durationSeconds: 0 })).toBe(false);
    expect(hasMeasurableDuration({ durationSeconds: Number.NaN })).toBe(false);
    expect(hasMeasurableDuration({ durationSeconds: 42 })).toBe(true);
  });
});

describe("tercih sinyali kalibrasyonu", () => {
  it("tabanın üstündeki grubu 50'nin üstüne taşır", () => {
    // Kullanıcının genel tamamlaması %25 iken %45'lik bir konu güçlü bir tercihtir.
    expect(calibratePreferenceSignal(45, 25, 40)).toBeGreaterThan(60);
  });

  it("düşük tamamlamalı kullanıcıyı topluca cezalandırmaz", () => {
    // Taban da %25 ise bu grup sıradandır; nötre yakın kalmalı, 30'lara düşmemeli.
    expect(calibratePreferenceSignal(25, 25, 40)).toBeGreaterThan(40);
  });

  it("tabanın altındaki grubu aşağı çeker", () => {
    expect(calibratePreferenceSignal(10, 25, 40)).toBeLessThan(45);
  });

  it("az örnekli grupları nötre yakın tutar", () => {
    const few = calibratePreferenceSignal(45, 25, 1);
    const many = calibratePreferenceSignal(45, 25, 40);
    expect(few).toBeLessThan(many);
  });
});
