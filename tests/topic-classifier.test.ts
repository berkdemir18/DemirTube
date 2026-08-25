import { describe, expect, it } from "vitest";
import { classifyTopics } from "../src/analytics/topic-classifier";
import { buildTopicMemory, isManuallyLabeled, unclassifiedShare } from "../src/analytics/topic-memory";
import type { VideoRecord } from "../src/shared/types";

function video(partial: Partial<VideoRecord> & { videoId: string; title: string }): VideoRecord {
  return {
    channelName: "Kanal",
    url: `https://www.youtube.com/watch?v=${partial.videoId}`,
    durationSeconds: 900,
    topics: ["Diğer"],
    firstSeenAt: "2026-07-01T10:00:00.000Z",
    lastSeenAt: "2026-07-01T10:00:00.000Z",
    totalWatchSeconds: 400,
    totalActiveWatchSeconds: 400,
    uniqueWatchedSeconds: 400,
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    completionRate: .5,
    sessionCount: 1,
    completed: false,
    regretScore: 10,
    engagementScore: 50,
    contentType: "standard",
    ...partial,
  } as VideoRecord;
}

describe("Türkçe ek ve yazım toleransı", () => {
  it("kelime eki almış başlıkları tanır", () => {
    // Eskiden hepsi "Diğer" idi: eşleşme tam kelime sınırı arıyordu.
    expect(classifyTopics("Python ile programlamayı sıfırdan öğreniyorum")).toContain("Programlama");
    expect(classifyTopics("Bu oyunları bitirmeden bırakamadım")).toContain("Oyun");
    expect(classifyTopics("Uzayın derinliklerinde neler var")).toContain("Bilim");
  });

  it("ünsüz yumuşamasını çözer (k → ğ)", () => {
    // "güvenlik" + ek = "güvenliği"; kök harfi değiştiği için hiç bulunamıyordu.
    expect(classifyTopics("Siber güvenliği nereden öğrenmeli")).toContain("Siber güvenlik");
  });

  it("aksansız ve düzeltme işaretsiz yazımı eşleştirir", () => {
    // YouTube başlıkları sık sık Türkçe karakter kullanmadan yazılıyor.
    expect(classifyTopics("Besiktas transferde sona geldi")).toContain("Beşiktaş");
    expect(classifyTopics("Yapay zeka her seyi degistirdi")).toContain("Yapay zekâ");
    expect(classifyTopics("Yapay zekâya güvenilir mi")).toContain("Yapay zekâ");
  });

  it("kısa anahtarları ön ek olarak saymaz", () => {
    // "ai" ön ek sayılsaydı "aile" yapay zekâ olurdu; "car" ise kargo.
    expect(classifyTopics("Aile içi iletişim üzerine")).not.toContain("Yapay zekâ");
    expect(classifyTopics("Kargo takip sistemi nasıl çalışır")).not.toContain("Otomobil");
  });

  it("kısa köklerde yalnızca geçerli çekim eklerini kabul eder", () => {
    // "maç" 3 harflik bir kök; serbest ek verilseydi "macera" da futbol olurdu.
    expect(classifyTopics("Efsane geri dönüş! Maçın özeti")).toContain("Futbol");
    expect(classifyTopics("Golleri tekrar tekrar izledim")).toContain("Futbol");
    expect(classifyTopics("Bu dizinin son bölümü")).toContain("Dizi ve film");

    expect(classifyTopics("Golf sahasında bir gün")).toEqual(["Diğer"]);
    expect(classifyTopics("Dizin yapısı nasıl kurulur")).toEqual(["Diğer"]);
    expect(classifyTopics("Sporadik bir davranış")).toEqual(["Diğer"]);
    // Buna karşılık gerçek bir ek almış hâli tanınmalı.
    expect(classifyTopics("Sporcu beslenmesi nasıl olmalı")).toContain("Sağlık");
  });

  it("eki yalnızca sona kabul eder, öne değil", () => {
    expect(classifyTopics("Mikrofon incelemesi")).toContain("Teknoloji");
    expect(classifyTopics("Bakır tel nasıl üretilir")).not.toContain("Programlama");
  });

  it("kural tutmazsa Diğer döner", () => {
    expect(classifyTopics("Bugün hava çok kapalıydı")).toEqual(["Diğer"]);
  });

  it("başlıkta doğrudan geçen eğlence diğer konuların önüne geçer", () => {
    expect(classifyTopics("Komik futbol anları derlemesi")).toEqual(["Eğlence"]);
  });
});

describe("konu hafızası", () => {
  const f1Channel = Array.from({ length: 4 }, (_, index) =>
    video({
      videoId: `f1-${index}`,
      title: `Grand Prix analizi ${index}`,
      channelName: "Pit Radyo",
      topics: ["Formula 1"],
      inferredTopics: ["Formula 1"],
    }));

  it("tutarlı bir kanalın anlaşılamayan başlığını devralır", () => {
    const memory = buildTopicMemory(f1Channel);
    // Bu başlıkta hiçbir kural anahtarı yok; kanal olmasa "Diğer" olurdu.
    expect(classifyTopics("Cumartesi seansı sonrası ilk izlenimler", "Pit Radyo")).toEqual(["Diğer"]);
    expect(classifyTopics("Cumartesi seansı sonrası ilk izlenimler", "Pit Radyo", "", memory))
      .toEqual(["Formula 1"]);
  });

  it("kanal tutarsızsa devralmaz", () => {
    const mixed = [
      video({ videoId: "a", title: "A", channelName: "Karışık", topics: ["Oyun"], inferredTopics: ["Oyun"] }),
      video({ videoId: "b", title: "B", channelName: "Karışık", topics: ["Müzik"], inferredTopics: ["Müzik"] }),
      video({ videoId: "c", title: "C", channelName: "Karışık", topics: ["Tarih"], inferredTopics: ["Tarih"] }),
    ];
    const memory = buildTopicMemory(mixed);
    expect(classifyTopics("Belirsiz bir başlık", "Karışık", "", memory)).toEqual(["Diğer"]);
  });

  it("az videolu kanaldan sonuç uydurmaz", () => {
    const memory = buildTopicMemory(f1Channel.slice(0, 2));
    expect(classifyTopics("Cumartesi seansı", "Pit Radyo", "", memory)).toEqual(["Diğer"]);
  });

  it("elle düzeltilmiş videolardan kelime öğrenir", () => {
    // Kullanıcı iki videoyu elle "Hazırlık" olarak işaretlemiş; "vinç" kelimesi
    // hiçbir kuralda yok ama artık öğrenilmiş bir ipucu.
    const labeled = [
      video({ videoId: "m1", title: "Vinç operatörlüğü sınavı", topics: ["Hazırlık"], inferredTopics: ["Diğer"] }),
      video({ videoId: "m2", title: "Vinç operatörlüğü ikinci bölüm", topics: ["Hazırlık"], inferredTopics: ["Diğer"] }),
    ];
    const memory = buildTopicMemory(labeled);

    expect(memory.wordTopics.get("vinc")).toBe("Hazırlık");
    expect(classifyTopics("Vinç operatörlüğü tekrar", "Başka kanal", "", memory)).toContain("Hazırlık");
  });

  it("konudan konuya dağılan taşıyıcı kelimeleri öğrenmez", () => {
    const labeled = [
      video({ videoId: "m1", title: "Yeni bölüm burada", topics: ["Oyun"], inferredTopics: ["Diğer"] }),
      video({ videoId: "m2", title: "Yeni bölüm geldi", topics: ["Müzik"], inferredTopics: ["Diğer"] }),
      video({ videoId: "m3", title: "Yeni bölüm çıktı", topics: ["Tarih"], inferredTopics: ["Diğer"] }),
    ];
    const memory = buildTopicMemory(labeled);
    expect(memory.wordTopics.has("bolum")).toBe(false);
  });

  it("elle etiketi çıkarımdan ayırt eder", () => {
    expect(isManuallyLabeled(video({ videoId: "a", title: "A", topics: ["Oyun"], inferredTopics: ["Diğer"] }))).toBe(true);
    expect(isManuallyLabeled(video({ videoId: "b", title: "B", topics: ["Oyun"], inferredTopics: ["Oyun"] }))).toBe(false);
    // Eski kayıtlarda inferredTopics yok; bunlar elle etiket sayılmaz.
    expect(isManuallyLabeled(video({ videoId: "c", title: "C", topics: ["Oyun"] }))).toBe(false);
  });

  it("boş geçmişte hafıza kurmaz", () => {
    const memory = buildTopicMemory([]);
    expect(memory.channelTopics.size).toBe(0);
    expect(memory.wordTopics.size).toBe(0);
  });

  it("konusuz video payını raporlar", () => {
    const history = [
      video({ videoId: "a", title: "A", topics: ["Oyun"] }),
      video({ videoId: "b", title: "B", topics: ["Diğer"] }),
    ];
    expect(unclassifiedShare(history)).toEqual({ count: 1, share: .5 });
    expect(unclassifiedShare([])).toEqual({ count: 0, share: 0 });
  });
});
