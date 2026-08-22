// DemirTube · dashboard veri katmanı
//
// Service worker mesajlaşmasının tamamı burada toplanır. Mesaj sözleşmesi
// (shared/messages.ts) değişmez; yalnızca çağıran taraf tek yerde toplanmıştır.
// Eklenti bağlamı yoksa (vite dev sunucusu) örnek veriyle çalışır.
import { useCallback, useEffect, useState } from "react";
import type { AppData, DataLossReport, LegacyAppData, Settings, UserVideoFeedback, WatchlistItem, WeeklyReport } from "../../shared/types";
import { sendMessage } from "../../shared/messages";
import { oneVideoSeedData, seedData } from "../seed-data";
import { generateWeeklyReport } from "../../analytics/weekly-report";

export function useAppData() {
  const [data, setData] = useState<AppData>();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [dataLoss, setDataLoss] = useState<DataLossReport>();
  const [loadError, setLoadError] = useState("");

  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.id);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      if (extensionAvailable) {
        const [next, list, health] = await Promise.all([
          sendMessage<AppData>({ type: "GET_DATA" }),
          sendMessage<WatchlistItem[]>({ type: "WATCHLIST_GET" }),
          sendMessage<DataLossReport>({ type: "GET_DATA_HEALTH" }).catch(() => undefined),
        ]);
        setData(next);
        setWatchlist(list);
        setDataLoss(health?.lost ? health : undefined);
      } else {
        setData(new URLSearchParams(location.search).get("sample") === "one" ? oneVideoSeedData : seedData);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Dashboard verisi yüklenemedi.");
    }
  }, [extensionAvailable]);

  useEffect(() => { void load(); }, [load]);

  const setSettings = useCallback(async (settings: Settings) => {
    if (extensionAvailable) await sendMessage({ type: "SET_SETTINGS", settings });
    setData((current) => current ? { ...current, settings } : current);
  }, [extensionAvailable]);

  const deleteVideo = useCallback(async (videoId: string) => {
    if (extensionAvailable) await sendMessage({ type: "DELETE_VIDEO", videoId });
    setData((current) => current ? { ...current, videos: current.videos.filter((video) => video.videoId !== videoId) } : current);
  }, [extensionAvailable]);

  const saveFeedback = useCallback(async (feedback: UserVideoFeedback) => {
    if (extensionAvailable) {
      await sendMessage({ type: "SAVE_FEEDBACK", feedback });
      await load();
      return;
    }
    setData((current) => current
      ? { ...current, feedback: [...current.feedback.filter((item) => item.videoId !== feedback.videoId), feedback] }
      : current);
  }, [extensionAvailable, load]);

  const resetFeedback = useCallback(async (videoId: string) => {
    if (extensionAvailable) {
      await sendMessage({ type: "RESET_FEEDBACK", videoId });
      await load();
      return;
    }
    setData((current) => current
      ? { ...current, feedback: current.feedback.filter((item) => item.videoId !== videoId) }
      : current);
  }, [extensionAvailable, load]);

  const dismissDataLoss = useCallback(async () => {
    if (extensionAvailable) await sendMessage({ type: "DISMISS_DATA_LOSS" });
    setDataLoss(undefined);
  }, [extensionAvailable]);

  const clear = useCallback(async () => {
    if (!window.confirm("Tüm izleme geçmişi, geri bildirimler ve kişisel listeler bu cihazdan silinecek. Bu işlem geri alınamaz.")) return;
    if (extensionAvailable) await sendMessage({ type: "CLEAR_DATA" });
    setData((current) => current
      ? { ...current, videos: [], sessions: [], feedback: [], customTopics: [], weeklyReports: [], watchlist: [], watchlistArchive: [] }
      : current);
    setWatchlist([]);
  }, [extensionAvailable]);

  const importData = useCallback(async (next: AppData | LegacyAppData, mode: "merge" | "replace") => {
    if (extensionAvailable) {
      await sendMessage({ type: "IMPORT_DATA_V2", data: next, mode });
      await load();
    }
  }, [extensionAvailable, load]);

  const exportData = useCallback(
    async () => extensionAvailable ? sendMessage<AppData>({ type: "EXPORT_DATA" }) : data!,
    [extensionAvailable, data],
  );

  const generateReport = useCallback(async () => {
    const report = extensionAvailable
      ? await sendMessage<WeeklyReport>({ type: "GENERATE_WEEKLY_REPORT" })
      : generateWeeklyReport(data!.videos, data!.sessions);
    setData((current) => current
      ? { ...current, weeklyReports: [...current.weeklyReports.filter((item) => item.id !== report.id), report] }
      : current);
    return report;
  }, [extensionAvailable, data]);

  const removeFromWatchlist = useCallback((videoId: string) => {
    void sendMessage<WatchlistItem[]>({ type: "WATCHLIST_REMOVE", videoId }).then(setWatchlist);
  }, []);

  const reclassifyTopics = useCallback(() => {
    void sendMessage({ type: "RECLASSIFY_TOPICS" }).then(load);
  }, [load]);

  return {
    data, watchlist, dataLoss, loadError, extensionAvailable, load,
    setSettings, deleteVideo, saveFeedback, resetFeedback, clear, dismissDataLoss,
    importData, exportData, generateReport, removeFromWatchlist, reclassifyTopics,
  };
}
