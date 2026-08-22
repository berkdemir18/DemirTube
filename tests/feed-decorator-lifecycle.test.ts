// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { clearFeedDecorations, feedResultTargetIsCurrent, repairFeedCardState } from "../src/content/feed-decorator";

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
