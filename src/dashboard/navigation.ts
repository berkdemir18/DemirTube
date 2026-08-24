// DemirTube · dashboard navigasyon sözleşmesi
// Sayfa kimlikleri, menü yapısı ve dönem seçicisi gösterilen sayfalar tek yerde
// tanımlanır; hem kabuk (Dashboard.tsx) hem de hash yönlendirmesi bunu kullanır.
import { BarChart3, History, LayoutDashboard, Newspaper, Settings as SettingsIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PageId =
  | "overview" | "topics" | "channels" | "statistics" | "cost" | "intelligence" | "journey" | "goals" | "durations"
  | "time" | "titles" | "shorts" | "calendar" | "compare"
  | "watchlist" | "feedback" | "history" | "report" | "capsule" | "settings";

export type NavChild = [id: PageId, label: string];

export type NavSection = {
  label: string;
  icon: LucideIcon;
  root: PageId;
  children: NavChild[];
};

export const navigationSections: NavSection[] = [
  {
    label: "Bugün",
    icon: LayoutDashboard,
    root: "overview",
    children: [
      ["overview", "Genel Bakış"],
      ["intelligence", "Akıllı Merkez"],
      ["journey", "İzleme Yolculuğu"],
      ["goals", "Kişisel Hedefler"],
      ["watchlist", "Kişisel Listem"],
    ],
  },
  {
    label: "Analizler",
    icon: BarChart3,
    root: "topics",
    children: [
      ["topics", "Konular"],
      ["channels", "Kanallar"],
      ["statistics", "İstatistikler"],
      ["cost", "Zaman Maliyeti"],
      ["durations", "Video Süresi"],
      ["time", "İzleme Zamanları"],
      ["titles", "Başlık Analizi"],
      ["shorts", "Shorts Analizi"],
    ],
  },
  {
    label: "Geçmiş",
    icon: History,
    root: "history",
    children: [
      ["history", "İzleme Geçmişi"],
      ["calendar", "İzleme Takvimi"],
      ["feedback", "Geri Bildirim"],
    ],
  },
  {
    label: "Raporlar",
    icon: Newspaper,
    root: "report",
    children: [
      ["report", "Haftalık Rapor"],
      ["compare", "Karşılaştır"],
      ["capsule", "Kapsül"],
    ],
  },
  { label: "Ayarlar", icon: SettingsIcon, root: "settings", children: [] },
];

/** Üst çubukta dönem seçici ve dönem karşılaştırması gösterilen sayfalar. */
export const periodPages = new Set<PageId>([
  "overview", "journey", "topics", "channels", "statistics", "cost", "durations", "time", "titles", "shorts",
]);

const knownPages = new Set<string>(
  navigationSections.flatMap((section) => [section.root, ...section.children.map(([id]) => id)]),
);

export function isPageId(value: string): value is PageId {
  return knownPages.has(value);
}

export function sectionForPage(page: PageId) {
  return navigationSections.find(
    (section) => section.root === page || section.children.some(([id]) => id === page),
  ) ?? navigationSections[0];
}
