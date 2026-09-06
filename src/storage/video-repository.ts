import type { CloudVideoAnalysis, UserVideoFeedback, VideoMetadata, VideoRecord, WatchSession } from "../shared/types";
import { calculatePlaybackMetrics, isCompleted, isEarlyAbandonment } from "../analytics/completion";
import { analyzeRegret } from "../analytics/regret-score";
import { analyzeEngagement } from "../analytics/engagement-score";
import { getDatabase, withDatabase } from "./database";
import { calculatePreference } from "../analytics/preference-score";
import { analyzeVideoIntelligence } from "../analytics/video-intelligence";

export function resolveVideoMetadata(metadata: VideoMetadata, existing?: VideoRecord): VideoMetadata {
  return {
    ...metadata,
    title: metadata.title || existing?.title || "Başlıksız video",
    channelName: metadata.channelName !== "Bilinmeyen kanal"
      ? metadata.channelName
      : existing?.channelName && existing.channelName !== "Bilinmeyen kanal"
        ? existing.channelName
        : metadata.channelName,
    channelId: metadata.channelId ?? existing?.channelId,
    thumbnailUrl: metadata.thumbnailUrl ?? existing?.thumbnailUrl,
    channelAvatarUrl: metadata.channelAvatarUrl ?? existing?.channelAvatarUrl,
    description: metadata.description || existing?.description,
    hashtags: metadata.hashtags?.length ? metadata.hashtags : existing?.hashtags,
    chapterCount: metadata.chapterCount || existing?.chapterCount,
    transcriptAnalysis: metadata.transcriptAnalysis?.available ? metadata.transcriptAnalysis : existing?.transcriptAnalysis,
    contentType: metadata.contentType === "unknown" && existing?.contentType ? existing.contentType : metadata.contentType,
    videoFormat: metadata.videoFormat ?? existing?.inferredVideoFormat
  };
}

export const videoRepository = {
  async get(videoId: string) { return withDatabase((database) => database.get("videos", videoId)); },
  async all() { return withDatabase((database) => database.getAll("videos")); },
  /**
   * Kaydı olduğu gibi yazar. Yalnızca geçmiş içe aktarımı gibi oturumdan
   * türetilmeyen kayıtlar için; normal akış `rebuild` üzerinden gider.
   */
  async put(record: VideoRecord) {
    await withDatabase((database) => database.put("videos", record));
    return record;
  },
  async byChannel(channelName: string) {
    return withDatabase((database) => database.getAllFromIndex("videos", "by-channel", channelName));
  },
  async saveCloudAnalysis(videoId: string, cloudAnalysis: CloudVideoAnalysis) {
    const database = await getDatabase();
    const existing = await database.get("videos", videoId);
    if (!existing) throw new Error("Video kaydı henüz hazır değil.");
    const next = { ...existing, cloudAnalysis };
    await database.put("videos", next);
    return next;
  },
  async remove(videoId: string) {
    const database = await getDatabase();
    const transaction = database.transaction(["videos", "sessions", "feedback"], "readwrite");
    await Promise.all([
      transaction.objectStore("videos").delete(videoId),
      transaction.objectStore("feedback").delete(videoId),
      ...((await transaction.objectStore("sessions").index("by-video").getAllKeys(videoId))
        .map((key) => transaction.objectStore("sessions").delete(key)))
    ]);
    await transaction.done;
  },
  async rebuild(metadata: VideoMetadata, sessions: WatchSession[], feedback?: UserVideoFeedback): Promise<VideoRecord> {
    const existing = await this.get(metadata.videoId);
    const resolved = resolveVideoMetadata(metadata, existing);
    // Imported/legacy summaries have no sessions from which to reconstruct outcomes.
    if (existing && !sessions.length) {
      const preserved: VideoRecord = {
        ...existing, ...resolved,
        topics: feedback?.manualTopics?.length ? feedback.manualTopics : resolved.topics,
        contentType: feedback?.manualContentType ?? resolved.contentType,
        videoFormat: feedback?.manualVideoFormat ?? existing.videoFormat,
        excludedFromAnalytics: feedback?.excludedFromAnalytics ?? existing.excludedFromAnalytics,
      };
      await withDatabase((database) => database.put("videos", preserved));
      return preserved;
    }
    const playback = calculatePlaybackMetrics(sessions, resolved.durationSeconds);
    const latest = sessions.toSorted((a, b) => (b.updatedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.startedAt))[0];
    const isCurrentlyWatching = sessions.some((session) => session.active);
    const endedNaturally = sessions.some((session) => session.endedNaturally);
    const topics = feedback?.manualTopics?.length ? feedback.manualTopics : resolved.topics;
    const contentType = feedback?.manualContentType ?? resolved.contentType;
    const inferredVideoFormat = resolved.videoFormat
      ?? analyzeVideoIntelligence({ ...resolved, topics, contentType, videoFormat: undefined }).format;
    const videoFormat = feedback?.manualVideoFormat ?? inferredVideoFormat;
    const completionForType = contentType === "livestream" ? 0 : playback.completionRate;
    const regret = analyzeRegret({
      title: resolved.title,
      totalActiveWatchSeconds: playback.totalActiveWatchSeconds,
      durationSeconds: resolved.durationSeconds,
      completionRate: completionForType,
      reopened: sessions.length > 1,
      followedByAnotherVideo: Boolean(latest?.followedByAnotherVideo),
      endedNaturally,
      active: isCurrentlyWatching,
      feedback,
      leaveReason: latest?.leaveReason ?? feedback?.reason,
      contentType
    });
    const engagement = analyzeEngagement({
      completionRate: completionForType,
      rewatchSeconds: playback.rewatchSeconds,
      backwardSeeks: sessions.reduce((sum, session) => sum + session.backwardSeekCount, 0),
      sessionCount: sessions.length,
      endedNaturally,
      earlyAbandoned: isEarlyAbandonment(playback.totalActiveWatchSeconds, completionForType),
      feedback,
      contentType,
      totalActiveWatchSeconds: playback.totalActiveWatchSeconds
    });
    let prediction = existing?.predictionSnapshot;
    const firstSession = sessions.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
    const predictionTime = new Date().toISOString();
    const openingAge = Date.parse(predictionTime) - Date.parse(firstSession?.startedAt ?? "");
    if (!existing && !prediction && sessions.length === 1 && firstSession?.active
      && openingAge >= 0 && openingAge <= 15_000 && playback.totalActiveWatchSeconds <= 15) {
      const prior = (await this.all()).filter((video) => video.lastSeenAt <= firstSession.startedAt);
      const preference = calculatePreference(resolved, prior);
      prediction = {
        score: preference.score,
        estimatedCompletion: preference.estimatedCompletion,
        rawEstimatedCompletion: preference.rawEstimatedCompletion,
        provenance: "first-watch",
        confidence: preference.model.confidence,
        modelVersion: preference.model.version,
        predictedAt: predictionTime,
        signals: [
          ...preference.explanation.slice(0, 2),
          ...preference.intelligence.signals.slice(0, 2).map((signal) => signal.label)
        ]
      };
    }
    const record: VideoRecord = {
      ...resolved,
      topics,
      inferredTopics: resolved.topics,
      contentType,
      videoFormat,
      inferredVideoFormat,
      firstSeenAt: existing?.firstSeenAt ?? sessions.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))[0]?.startedAt ?? new Date().toISOString(),
      lastSeenAt: latest?.endedAt ?? latest?.updatedAt ?? latest?.startedAt ?? existing?.lastSeenAt ?? new Date().toISOString(),
      totalWatchSeconds: playback.totalActiveWatchSeconds,
      ...playback,
      completionRate: completionForType,
      sessionCount: sessions.length,
      completed: contentType !== "livestream" && isCompleted(completionForType, endedNaturally),
      regretScore: regret.regretScore,
      regretLabel: regret.regretLabel,
      regretFactors: regret.contributingFactors,
      regretConfidence: regret.confidence,
      engagementScore: engagement.engagementScore,
      engagementLabel: engagement.engagementLabel,
      engagementFactors: engagement.contributingFactors,
      engagementConfidence: engagement.confidence,
      isCurrentlyWatching,
      excludedFromAnalytics: feedback?.excludedFromAnalytics ?? false,
      predictionSnapshot: prediction,
      cloudAnalysis: existing?.cloudAnalysis,
      source: "tracked"
    };
    await withDatabase((database) => database.put("videos", record));
    return record;
  },
  async rebuildExisting(videoId: string, feedback?: UserVideoFeedback) {
    const existing = await this.get(videoId);
    if (!existing) return;
    const database = await getDatabase();
    const sessions = await database.getAllFromIndex("sessions", "by-video", videoId);
    const metadata: VideoMetadata = {
      videoId: existing.videoId,
      title: existing.title,
      channelName: existing.channelName,
      channelId: existing.channelId,
      url: existing.url,
      durationSeconds: existing.durationSeconds,
      topics: existing.inferredTopics ?? existing.topics,
      likeStatus: existing.likeStatus,
      thumbnailUrl: existing.thumbnailUrl,
      channelAvatarUrl: existing.channelAvatarUrl,
      description: existing.description,
      hashtags: existing.hashtags,
      chapterCount: existing.chapterCount,
      transcriptAnalysis: existing.transcriptAnalysis,
      contentType: existing.contentType ?? "unknown",
      videoFormat: existing.inferredVideoFormat
    };
    return this.rebuild(metadata, sessions, feedback);
  }
};
