import { describe, expect, it } from "vitest";
import { buildCommands, searchCommands } from "../src/dashboard/command-search";
import type { VideoRecord } from "../src/shared/types";

function video(videoId: string, title: string, channelName: string, lastSeenAt: string, topics: string[] = []): VideoRecord {
  return {
    videoId, title, channelName, lastSeenAt, topics,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationSeconds: 600,
    firstSeenAt: lastSeenAt,
    totalWatchSeconds: 0,
    totalActiveWatchSeconds: 0,
    uniqueWatchedSeconds: 0,
    rewatchSeconds: 0,
    uniquePlaybackSegments: [],
    completionRate: 0,
    sessionCount: 1,
    completed: false,
    regretScore: 0,
    engagementScore: 0,
    contentType: "standard",
  } as VideoRecord;
}

const videos = [
  video("v1", "Rust ile sistem programlama", "Kod Kanalı", "2026-07-10T10:00:00.000Z", ["Programlama"]),
  video("v2", "Beşiktaş maç analizi", "Spor Kanalı", "2026-07-12T10:00:00.000Z", ["Futbol"]),
  video("v3", "Yapay zekâ ajanları", "AI Kanalı", "2026-07-14T10:00:00.000Z", ["Yapay zekâ"]),
];

describe("komut paleti araması", () => {
  it("sayfa, kanal, konu, dönem, işlem ve video komutlarını birlikte üretir", () => {
    const commands = buildCommands(videos);
    const kinds = new Set(commands.map((command) => command.kind));

    expect(kinds).toEqual(new Set(["page", "channel", "topic", "period", "action", "video"]));
    expect(commands.filter((command) => command.kind === "video")).toHaveLength(3);
    expect(commands.some((command) => command.id === "page:channels")).toBe(true);
  });

  it("boş sorguda önce gezinme komutlarını gösterir", () => {
    const results = searchCommands(buildCommands(videos), "");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe("page");
    expect(results.every((command) => command.kind !== "video")).toBe(true);
  });

  it("sayfa adını Türkçe büyük/küçük harf farkına rağmen bulur", () => {
    const results = searchCommands(buildCommands(videos), "İSTATİSTİK");

    expect(results[0].id).toBe("page:statistics");
  });

  it("video başlığı ve kanal adıyla arama yapar", () => {
    const byTitle = searchCommands(buildCommands(videos), "beşiktaş");
    expect(byTitle[0]).toMatchObject({ kind: "video", videoId: "v2" });

    // Kanal adı arandığında derin bağlantı komutu videonun önüne geçer.
    const byChannel = searchCommands(buildCommands(videos), "AI Kanalı");
    expect(byChannel[0]).toMatchObject({ kind: "channel", channelName: "AI Kanalı" });
    expect(byChannel.some((command) => command.kind === "video" && command.videoId === "v3")).toBe(true);
  });

  it("kanal ve konu komutları derin bağlantı verisini taşır", () => {
    const commands = buildCommands(videos);

    expect(commands.find((command) => command.id === "channel:Spor Kanalı"))
      .toMatchObject({ kind: "channel", channelName: "Spor Kanalı", hint: "Kanal · 1 video" });
    expect(commands.find((command) => command.id === "topic:Yapay zekâ"))
      .toMatchObject({ kind: "topic", topic: "Yapay zekâ" });
  });

  it("konu adıyla arayınca konu komutunu bulur", () => {
    const results = searchCommands(buildCommands(videos), "futbol");

    expect(results[0]).toMatchObject({ kind: "topic", topic: "Futbol" });
  });

  it("baştan eşleşmeyi içerik eşleşmesinin önüne koyar", () => {
    const results = searchCommands(buildCommands(videos), "rust");

    expect(results[0].label).toBe("Rust ile sistem programlama");
  });

  it("eşleşme yoksa boş liste döndürür ve sonuç sayısını sınırlar", () => {
    expect(searchCommands(buildCommands(videos), "zzzzqq")).toEqual([]);
    expect(searchCommands(buildCommands(videos), "a", 3)).toHaveLength(3);
  });

  it("dönem komutları analiz dönemini taşır", () => {
    const results = searchCommands(buildCommands(videos), "haftalık");

    expect(results.some((command) => command.kind === "period" && command.period === "week")).toBe(true);
  });
});
