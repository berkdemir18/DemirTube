// DemirTube · tarayıcıdan dosya indirme yardımcıları
import { videosToCsv } from "../analytics/csv-export";
import type { VideoRecord } from "../shared/types";

export function downloadFile(content: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Bugünün tarihiyle biten dosya adı: demirtube-videolar-2026-08-02.csv */
export function datedFileName(prefix: string, extension: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

/** Excel'in Türkçe yerelde doğru açması için başa UTF-8 BOM eklenir. */
export function downloadVideosCsv(videos: VideoRecord[], prefix: string) {
  downloadFile("﻿" + videosToCsv(videos), datedFileName(prefix, "csv"), "text/csv;charset=utf-8");
}
