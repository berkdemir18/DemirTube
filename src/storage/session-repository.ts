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
  async updateLeaveReason(id: string, reason: WatchSession["leaveReason"], reasonText?: string) {
    const database = await getDatabase();
    const session = await database.get("sessions", id);
    if (!session) throw new Error("Oturum bulunamadı.");
    const updated = { ...session, leaveReason: reason, leaveReasonText: reasonText, feedbackPromptShown: true, updatedAt: new Date().toISOString() };
    await database.put("sessions", updated);
    return updated;
  }
};
