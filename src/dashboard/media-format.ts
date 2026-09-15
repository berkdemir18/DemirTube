// DemirTube · Perde ekranlarının ortak biçimlendiricileri
import type { NextUp } from "../media/library";
import { TMDB_IMAGE } from "../media/tmdb";
import { percentWith } from "../media/turkish";

export const poster = (path?: string, size = "w342") => (path ? `${TMDB_IMAGE}/${size}${path}` : undefined);

export function episodeLabel(season: number, episode: number) {
  return season === 0 && episode === 0 ? "Film" : `${season}. sezon · ${episode}. bölüm`;
}

export function nextLabel(next: NextUp) {
  switch (next.state) {
    case "resume": return next.season === 0 && next.episode === 0 ? `${percentWith(next.percent, "possessive-locative")} kaldın` : `${next.season}. sezon ${next.episode}. bölüm · ${percentWith(next.percent, "possessive-locative")} kaldın`;
    case "next": return `Sırada ${next.season}. sezon ${next.episode}. bölüm`;
    case "caught-up": return "Yayınlanan tüm bölümleri izledin";
    case "finished-movie": return "İzlendi";
  }
}

export function relativeDay(iso: string, now = new Date()) {
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

/** "4 sa 12 dk" yerine büyük rakam için iki parça: değer ve birim. */
export function durationParts(seconds: number): { value: string; unit: string }[] {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return [{ value: String(minutes), unit: "dk" }];
  return minutes ? [{ value: String(hours), unit: "sa" }, { value: String(minutes), unit: "dk" }] : [{ value: String(hours), unit: "sa" }];
}

export const percent = (share: number) => `%${Math.round(share * 100)}`;

export const decimal = (value: number, digits = 1) => value.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
