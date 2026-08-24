import type { WatchSession } from "../shared/types";
import { getDatabase, withDatabase } from "./database";

export const sessionRepository = {
  async put(session: WatchSession) {
    await withDatabase((database) => database.put("sessions", session));
  },
  async byVideo(videoId: string) {
    return withDatabase((database) => database.getAllFromIndex("sessions", "by-video", videoId));
  },
  async all() {
    return withDatabase((database) => database.getAll("sessions"));
  },
  /**
   * Yalnızca verilen andan sonra başlayan oturumlar. Günlük bütçe her dakika
   * sorulduğu için tüm geçmişi taramak (binlerce kayıt) gereksiz pahalıydı;
   * `by-started` indeksi aramayı bugüne indiriyor.
   */
  async startedSince(iso: string) {
    return withDatabase((database) =>
      database.getAllFromIndex("sessions", "by-started", IDBKeyRange.lowerBound(iso)));
  },
  async updateLeaveReason(id: string, reason: WatchSession["leaveReason"], reasonText?: string) {
    const database = await getDatabase();
    const session = await database.get("sessions", id);
    if (!session) throw new Error("Oturum bulunamadı.");
    const updated = { ...session, leaveReason: reason, leaveReasonText: reasonText, feedbackPromptShown: true, updatedAt: new Date().toISOString() };
    await database.put("sessions", updated);
    return updated;
  }
};
