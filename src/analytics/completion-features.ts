import type { VideoMetadata, VideoRecord } from "../shared/types";
import { channelKey, clamp } from "../shared/utils";
import { hasMeasurableDuration } from "./completion";
import { durationBucket } from "./duration";
import { titleWords } from "./keyword-statistics";
import { toScoringMetadata } from "./scoring-metadata";
import { buildTopicMemory } from "./topic-memory";
import { analyzeVideoIntelligence, recordVideoFormat } from "./video-intelligence";
import { SIGNAL_TIERS, type CompletionEvidence, type PersonalSignal } from "./model-calibration";

export const completionEligible = (video: VideoRecord) =>
  !video.excludedFromAnalytics && !video.isCurrentlyWatching
  && video.contentType !== "livestream" && hasMeasurableDuration(video)
  && Number.isFinite(video.completionRate)
  && Number.isFinite(Date.parse(video.firstSeenAt)) && Number.isFinite(Date.parse(video.lastSeenAt));

export const MODEL_SAMPLE_LIMIT = 400;

export type CompletionFeatures = {
  baseline: number;
  observations: Record<PersonalSignal, { observed: number | undefined; sampleCount: number }>;
};

/** A per-run cache, discarded with its caller; immutable record inputs are required. */
export function createCompletionFeatureBuilder() {
  const records = new WeakMap<VideoRecord, { channel: string; words: string[]; seen: number; format: string; duration: string }>();
  const properties = (video: VideoRecord) => {
    let value = records.get(video);
    if (!value) {
      value = { channel: channelKey(video.channelName), words: titleWords(video.title),
        seen: Date.parse(video.lastSeenAt), format: recordVideoFormat(video), duration: durationBucket(video.durationSeconds) };
      records.set(video, value);
    }
    return value;
  };
  return (candidate: VideoMetadata, history: VideoRecord[]): CompletionFeatures => {
    const prior = history.filter((video) => video.videoId !== candidate.videoId && completionEligible(video))
      .toSorted((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.videoId.localeCompare(b.videoId))
      .slice(-MODEL_SAMPLE_LIMIT);
    const metadata = toScoringMetadata({ ...candidate, videoFormat: undefined }, buildTopicMemory(prior));
    const format = analyzeVideoIntelligence(metadata).format;
    const words = new Set(titleWords(metadata.title));
    const channel = channelKey(metadata.channelName);
    const duration = durationBucket(metadata.durationSeconds);
    const anchor = prior.reduce((latest, video) => Math.max(latest, properties(video).seen), 0);
    const summarize = (videos: VideoRecord[]) => {
      let sum = 0;
      let mass = 0;
      for (const video of videos) {
        // Imported progress is a proxy; one imported item supplies half an observation.
        const weight = Math.exp(-Math.max(0, anchor - properties(video).seen) / (45 * 86_400_000))
          * (video.source === "imported" ? 0.5 : 1);
        sum += clamp(video.completionRate * 100, 0, 100) * weight;
        mass += weight;
      }
      return { observed: mass ? sum / mass : undefined, sampleCount: mass };
    };
    return {
      baseline: summarize(prior).observed ?? 50,
      observations: {
        channel: summarize(prior.filter((video) => properties(video).channel === channel)),
        topic: summarize(prior.filter((video) => video.topics.some((topic) => metadata.topics.includes(topic)))),
        duration: summarize(prior.filter((video) => properties(video).duration === duration)),
        format: summarize(prior.filter((video) => properties(video).format === format)),
        title: summarize(prior.filter((video) => properties(video).words.some((word) => words.has(word)))),
      },
    };
  };
}

/** Same population, decay and topic union for training and live predictions. */
export const buildCompletionFeatures = (candidate: VideoMetadata, history: VideoRecord[]) =>
  createCompletionFeatureBuilder()(candidate, history);

export function completionEvidence(features: CompletionFeatures, weights: Record<PersonalSignal, number>, reliability: Record<PersonalSignal, number>): CompletionEvidence[] {
  return (Object.keys(features.observations) as PersonalSignal[]).map((key) => ({
    ...features.observations[key], weight: weights[key], reliability: reliability[key], tier: SIGNAL_TIERS[key],
  }));
}
