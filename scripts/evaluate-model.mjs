import { build } from "esbuild";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Bundle the real TypeScript engine without adding a runtime dependency.
const temporary = await mkdtemp(join(tmpdir(), "demirtube-eval-"));
try {
  const bundle = join(temporary, "engine.mjs");
  await build({ entryPoints: ["src/analytics/model-training.ts"], outfile: bundle,
    bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  const engine = await import(pathToFileURL(bundle).href);
  const args = process.argv.slice(2);
  const option = (key) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  const input = option("--input");
  const output = resolve(option("--output") ?? "test-results/model-evaluation.json");
  const fixture = (mode) => Array.from({ length: 120 }, (_, index) => {
    const short = index % 2 === 0;
    const completionRate = mode === "duration" ? (short ? 0.9 : 0.15)
      : mode === "drift" ? (index < 60 ? (short ? 0.9 : 0.2) : (short ? 0.2 : 0.9))
      : ((index * 2654435761) % 997) / 997;
    const seen = new Date(Date.UTC(2026, 0, 1 + index)).toISOString();
    return { videoId: `synthetic-${index}`, title: `Video ${index}`, channelName: `Kanal ${index % 7}`,
      url: `https://www.youtube.com/watch?v=synthetic-${index}`, topics: ["Teknoloji"],
      durationSeconds: short ? 200 : 3000, contentType: "standard", firstSeenAt: seen, lastSeenAt: seen,
      completionRate, totalWatchSeconds: 100, totalActiveWatchSeconds: 100, uniqueWatchedSeconds: 100,
      rewatchSeconds: 0, uniquePlaybackSegments: [], sessionCount: 1, completed: completionRate >= 0.9,
      regretScore: 0, engagementScore: 50 };
  });
  let datasets;
  if (input) {
    const parsed = JSON.parse(await readFile(resolve(input), "utf8"));
    const videos = Array.isArray(parsed) ? parsed : parsed.videos;
    if (!Array.isArray(videos) || videos.some((video) => !video || typeof video.videoId !== "string"
      || typeof video.title !== "string" || typeof video.channelName !== "string" || !Array.isArray(video.topics)
      || !Number.isFinite(video.durationSeconds) || !Number.isFinite(video.completionRate))) {
      throw new Error("Input must be a DemirTube export or valid VideoRecord array.");
    }
    datasets = { localExport: videos };
  } else datasets = Object.fromEntries(["duration", "noise", "drift"].map((mode) => [mode, fixture(mode)]));
  const neutral = { channel: 0.75, topic: 0.75, duration: 0.75, title: 0.75, format: 0.75 };
  const results = {};
  for (const [name, records] of Object.entries(datasets)) {
    const started = performance.now();
    const ordered = engine.trainingOrder(records).slice(-400);
    const folds = [];
    for (const share of [0.4, 0.6, 0.8]) {
      const from = Math.floor(ordered.length * share);
      const to = Math.floor(ordered.length * (share + 0.2) + 1e-8);
      if (from < 10 || to <= from) continue;
      const training = engine.learnSignalWeights(ordered, neutral, from);
      const train = engine.incrementalBacktest(ordered, training.weights, neutral,
        { to: from, outcomeBefore: ordered[from]?.firstSeenAt });
      const holdout = engine.incrementalBacktest(ordered, training.weights, neutral, { from, to });
      folds.push({ from, to, weights: training.weights, learned: training.learned, train, holdout,
        generalizationGap: train.sampleCount && holdout.sampleCount
          ? Number((holdout.meanAbsoluteError - train.meanAbsoluteError).toFixed(2)) : null });
    }
    results[name] = { inputCount: records.length, evaluatedCount: ordered.length,
      elapsedMs: Math.round(performance.now() - started), folds };
  }
  const report = { modelVersion: "adaptive-v6", dataset: input ? "local-export" : "synthetic",
    note: "Conditional completion only. Synthetic results do not establish real-user accuracy. Intervals target 80%; coverage is measured separately.", results };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Saved: ${output}`);
} finally {
  if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !temporary.includes("demirtube-eval-")) {
    throw new Error("Refusing to remove an unexpected temporary path.");
  }
  await rm(temporary, { recursive: true, force: true });
}
