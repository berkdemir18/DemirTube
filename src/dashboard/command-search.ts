// DemirTube · komut paleti arama çekirdeği
//
// Dashboard 19 ekrana çıktı; sidebar'da bölüm açıp alt sayfa aramak yavaşladı.
// Bu modül Ctrl/Cmd+K paletinin saf (DOM'suz, React'siz) beynidir: komut listesini
// üretir ve sorguya göre sıralar. Böylece sıralama davranışı testlenebilir kalır.
import type { VideoRecord } from "../shared/types";
import { normalizeText } from "../shared/utils";
import { analyticsPeriodLabels, type AnalyticsPeriod } from "../analytics/period";
import { navigationSections, type PageId } from "./navigation";

export type Command =
  | { id: string; kind: "page"; label: string; hint: string; haystack: string; page: PageId }
  | { id: string; kind: "period"; label: string; hint: string; haystack: string; period: AnalyticsPeriod }
  | { id: string; kind: "channel"; label: string; hint: string; haystack: string; channelName: string }
  | { id: string; kind: "topic"; label: string; hint: string; haystack: string; topic: string }
  | { id: string; kind: "video"; label: string; hint: string; haystack: string; url: string; videoId: string }
  | { id: string; kind: "action"; label: string; hint: string; haystack: string; action: CommandAction };

export type CommandAction = "toggle-theme" | "export-data" | "open-settings" | "generate-report";

/** Sorgusuz açılışta hangi türlerin önce geleceğini belirler. */
const KIND_WEIGHT: Record<Command["kind"], number> = { page: 0, channel: 1, topic: 2, period: 3, action: 4, video: 5 };

/** Geçmişteki her video komuta çevrilirse palet binlerce satır olur; en yeniler yeter. */
const VIDEO_LIMIT = 400;

const actionCommands: Command[] = [
  { id: "action:toggle-theme", kind: "action", label: "Temayı değiştir", hint: "Açık / koyu", haystack: "", action: "toggle-theme" },
  { id: "action:open-settings", kind: "action", label: "Ayarları aç", hint: "Ayarlar", haystack: "", action: "open-settings" },
  { id: "action:export-data", kind: "action", label: "Verileri JSON olarak dışa aktar", hint: "Yedek", haystack: "", action: "export-data" },
  { id: "action:generate-report", kind: "action", label: "Haftalık raporu üret", hint: "Rapor", haystack: "", action: "generate-report" },
];

function withHaystack(command: Command): Command {
  return { ...command, haystack: normalizeText(`${command.label} ${command.hint}`) };
}

export function buildCommands(videos: VideoRecord[]): Command[] {
  const pages: Command[] = navigationSections.flatMap((section) =>
    (section.children.length ? section.children : [[section.root, section.label] as const]).map(([page, label]) => ({
      id: `page:${page}`,
      kind: "page" as const,
      label,
      hint: section.label,
      haystack: "",
      page,
    }))
  );

  const periods: Command[] = (Object.entries(analyticsPeriodLabels) as [AnalyticsPeriod, string][])
    .map(([period, label]) => ({
      id: `period:${period}`,
      kind: "period" as const,
      label: `Dönem: ${label}`,
      hint: "Analiz dönemi",
      haystack: "",
      period,
    }));

  // Kanal ve konu komutları doğrudan derin bağlantıya gider: video sayısına göre
  // sıralanır ki en çok izlenenler kısa sorguda öne çıksın.
  const channelCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  for (const video of videos) {
    channelCounts.set(video.channelName, (channelCounts.get(video.channelName) ?? 0) + 1);
    for (const topic of video.topics) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }

  const channels: Command[] = [...channelCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([channelName, count]) => ({
      id: `channel:${channelName}`,
      kind: "channel" as const,
      label: channelName,
      hint: `Kanal · ${count} video`,
      haystack: "",
      channelName,
    }));

  const topics: Command[] = [...topicCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({
      id: `topic:${topic}`,
      kind: "topic" as const,
      label: topic,
      hint: `Konu · ${count} video`,
      haystack: "",
      topic,
    }));

  const recentVideos: Command[] = videos
    .toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, VIDEO_LIMIT)
    .map((video) => ({
      id: `video:${video.videoId}`,
      kind: "video" as const,
      label: video.title,
      hint: video.channelName,
      haystack: "",
      url: video.url,
      videoId: video.videoId,
    }));

  return [...pages, ...channels, ...topics, ...periods, ...actionCommands, ...recentVideos].map(withHaystack);
}

/**
 * Puanlama: tam eşleşme > baştan eşleşme > kelime başı eşleşme > içerik eşleşmesi.
 * Eşit puanda tür ağırlığı karar verir; sayfa komutları videonun önünde kalır.
 */
function scoreOf(haystack: string, query: string) {
  if (haystack === query) return 100;
  if (haystack.startsWith(query)) return 80;
  const wordStart = new RegExp(`(^|[\\s·:·/-])${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (wordStart.test(haystack)) return 60;
  if (haystack.includes(query)) return 40;
  return 0;
}

export function searchCommands(commands: Command[], rawQuery: string, limit = 9): Command[] {
  const query = normalizeText(rawQuery.trim());

  if (!query) {
    // Boş sorgu: gezinme komutları ve son izlenen birkaç video.
    return commands
      .toSorted((a, b) => KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind])
      .slice(0, limit);
  }

  return commands
    .map((command) => ({ command, score: scoreOf(command.haystack, query) }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) =>
      b.score - a.score
      || KIND_WEIGHT[a.command.kind] - KIND_WEIGHT[b.command.kind]
      || a.command.label.localeCompare(b.command.label, "tr")
    )
    .slice(0, limit)
    .map((entry) => entry.command);
}
