// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { candidates, clearFeedDecorations, feedResultTargetIsCurrent, repairFeedCardState } from "../src/content/feed-decorator";

describe("ana sayfa rozet yaşam döngüsü", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("YouTube rozet içeriğini silerse analiz işaretini onarır", () => {
    const card = document.createElement("ytd-rich-item-renderer");
    card.dataset.demirtubeAnalyzed = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "demirtube-feed-analysis";
    card.append(wrapper);

    expect(repairFeedCardState(card, "video-a")).toBe(true);
    expect(card.dataset.demirtubeAnalyzed).toBeUndefined();
    expect(card.querySelector(".demirtube-feed-analysis")).toBeNull();
  });

  it("kart başka video için geri dönüştürülürse eski rozeti kaldırır", () => {
    const card = document.createElement("ytd-rich-item-renderer");
    card.dataset.demirtubeAnalyzed = "true";
    card.innerHTML = '<div class="demirtube-feed-analysis"><button class="demirtube-feed-badge" data-video-id="video-a"></button></div>';

    expect(repairFeedCardState(card, "video-b")).toBe(true);
    expect(card.querySelector(".demirtube-feed-badge")).toBeNull();
  });

  it("bağlı ve güncel rozeti korur", () => {
    const card = document.createElement("ytd-rich-item-renderer");
    card.innerHTML = '<div class="demirtube-feed-analysis"><button class="demirtube-feed-badge" data-video-id="video-a"></button></div>';

    expect(repairFeedCardState(card, "video-a")).toBe(false);
    expect(card.dataset.demirtubeAnalyzed).toBe("true");
  });

  it("ayar kapandığında rozetleri, özetleri ve bekleyen işaretleri birlikte temizler", () => {
    document.body.innerHTML = '<ytd-rich-item-renderer data-demirtube-analyzed="true" data-demirtube-pending="true"><div class="demirtube-feed-analysis"></div></ytd-rich-item-renderer><div class="dt-feed-mini-summary"></div>';

    clearFeedDecorations();

    const card = document.querySelector<HTMLElement>("ytd-rich-item-renderer")!;
    expect(card.dataset.demirtubeAnalyzed).toBeUndefined();
    expect(card.dataset.demirtubePending).toBeUndefined();
    expect(document.querySelector(".demirtube-feed-analysis")).toBeNull();
    expect(document.querySelector(".dt-feed-mini-summary")).toBeNull();
  });

  it("aynı videonun başka karttaki özeti dururken eski kartın özetini kimliğiyle temizler", () => {
    const card = document.createElement("ytd-rich-item-renderer");
    card.dataset.demirtubeAnalyzed = "true";
    card.innerHTML = '<div class="demirtube-feed-analysis" data-instance-id="old-card"><button class="demirtube-feed-badge" data-video-id="video-a"></button></div>';
    document.body.append(card);
    const oldSummary = document.createElement("div");
    oldSummary.className = "dt-feed-mini-summary";
    oldSummary.dataset.owner = "old-card";
    const otherSummary = document.createElement("div");
    otherSummary.className = "dt-feed-mini-summary";
    otherSummary.dataset.owner = "other-card";
    document.body.append(oldSummary, otherSummary);

    expect(repairFeedCardState(card, "video-b")).toBe(true);
    expect(document.querySelector('[data-owner="old-card"]')).toBeNull();
    expect(document.querySelector('[data-owner="other-card"]')).not.toBeNull();
  });

  it("istek sürerken kart başka videoya dönüşürse eski sonucu reddeder", () => {
    const card = document.createElement("ytd-rich-item-renderer");
    card.innerHTML = '<a href="https://www.youtube.com/watch?v=video-a">A videosu</a><div class="demirtube-feed-analysis"></div>';
    document.body.append(card);
    const wrapper = card.querySelector<HTMLElement>(".demirtube-feed-analysis")!;

    expect(feedResultTargetIsCurrent(card, wrapper, "video-a")).toBe(true);
    card.querySelector("a")!.href = "https://www.youtube.com/watch?v=video-b";
    expect(feedResultTargetIsCurrent(card, wrapper, "video-a")).toBe(false);
    wrapper.remove();
    expect(feedResultTargetIsCurrent(card, wrapper, "video-b")).toBe(false);
  });
});

describe("tarama maliyeti", () => {
  /**
   * Gerçekçi bir YouTube kartı: başlık bağlantısı ve metadata çapası.
   * Çapa `id` yerine sınıfla veriliyor — jsdom, belgede tekrarlanan `id`
   * değerlerinde `card.querySelector("#meta")` çağrısını kart kapsamında değil
   * belge kapsamında çözüyor ve ilk karttan sonrası boş dönüyor. Gerçek
   * tarayıcıda sorun değil, ama testin kurgusu buna takılmamalı.
   */
  const makeCard = (index: number) => {
    const card = document.createElement("ytd-compact-video-renderer");
    card.innerHTML = `<div class="details"><a class="yt-simple-endpoint" href="/watch?v=video-${index}">Başlık ${index}</a></div>`;
    document.body.append(card);
    return card;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("kart konumunu kart başına bir kez okur ve okuma/yazmayı ayırır", () => {
    const cardCount = 30;
    for (let index = 0; index < cardCount; index += 1) makeCard(index);

    let rectReads = 0;
    /** Konum okunurken kaç kart zaten işaretlenmişti? Sıfırdan büyükse thrash var. */
    let readsAfterWrite = 0;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function stub(this: Element) {
      rectReads += 1;
      if (document.querySelectorAll("[data-demirtube-pending]").length > 0) readsAfterWrite += 1;
      return { top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };

    try {
      const found = candidates(20);

      expect(found).toHaveLength(20);
      // Kart başına tek okuma. Eskiden sıralama karşılaştırıcısının içinde
      // okunuyordu: O(n log n) okuma, yani burada 30 yerine 100'ün üzerinde.
      expect(rectReads).toBe(cardCount);
      // Tüm okumalar, ilk DOM yazmasından önce bitmiş olmalı (forced reflow yok).
      expect(readsAfterWrite).toBe(0);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("görünmeyen kartları puanlamaya almaz", () => {
    makeCard(0);
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () =>
      ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);

    try {
      expect(candidates(20)).toHaveLength(0);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});
