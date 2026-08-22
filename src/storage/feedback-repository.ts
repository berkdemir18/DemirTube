import type { UserVideoFeedback } from "../shared/types";
import { withDatabase } from "./database";

export const feedbackRepository = {
  async get(videoId: string) {
    return withDatabase((database) => database.get("feedback", videoId));
  },
  async all() {
    return withDatabase((database) => database.getAll("feedback"));
  },
  async put(feedback: UserVideoFeedback) {
    await withDatabase((database) => database.put("feedback", feedback));
    return feedback;
  },
  async remove(videoId: string) {
    await withDatabase((database) => database.delete("feedback", videoId));
  }
};
