// DemirTube Aurora UI v2 · unified dashboard visual system
import type { AppData, Topic, VideoRecord, WatchSession } from "../shared/types";
import { APP_VERSION, DEFAULT_KEYWORD_RULES, DEFAULT_SETTINGS } from "../shared/constants";

const seeds: Array<[string, string, string, number, number, Topic[], number]> = [
  ["gpt5", "Yeni GPT modeli gerçekten her şeyi değiştiriyor mu?", "Değişim Mühendisi", 942, 603, ["Yapay zekâ", "Teknoloji"], 18],
  ["react", "React performansında bilmen gereken 7 kural", "Frontend Türkiye", 1008, 948, ["Programlama"], 4],
  ["f1", "Ferrari yeni tabanı neden getiriyor?", "Padok Türkiye", 1320, 812, ["Formula 1", "Otomobil"], 12],
  ["bjk", "Beşiktaş'ın yeni transferi detaylı analiz", "Kara Kartal TV", 1540, 1180, ["Futbol", "Beşiktaş"], 8],
  ["cyber", "Bu oltalama saldırısını kimse fark etmedi", "Siber Günlük", 720, 125, ["Siber güvenlik"], 67],
  ["game", "Yılın en iyi bağımsız oyunları", "Oyun Atlası", 2080, 910, ["Oyun"], 28],
  ["edu", "Lineer cebir: özvektörleri sezgisel anlamak", "Açık Ders", 1880, 1730, ["Eğitim"], 2],
  ["movie", "Yeni bilim kurgu filmleri neden aynı?", "Perde Arkası", 1100, 520, ["Dizi ve film"], 21]
];

const now = Date.now();
export const seedVideos: VideoRecord[] = seeds.map(([videoId, title, channelName, durationSeconds, watch, topics, regretScore], index) => ({
  videoId, title, channelName, url: `https://www.youtube.com/watch?v=${videoId}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  durationSeconds, topics,
  firstSeenAt: new Date(now - (index + 8) * 86400000).toISOString(),
  lastSeenAt: new Date(now - index * 86400000).toISOString(),
  totalWatchSeconds: watch,
  totalActiveWatchSeconds: watch,
  uniqueWatchedSeconds: Math.min(watch, durationSeconds),
  rewatchSeconds: Math.max(0, watch - durationSeconds),
  uniquePlaybackSegments: [{ start: 0, end: Math.min(watch, durationSeconds) }],
  completionRate: Math.min(watch / durationSeconds, 1),
  sessionCount: index % 3 === 0 ? 2 : 1,
  completed: watch / durationSeconds >= 0.9,
  regretScore,
  engagementScore: Math.round(Math.min(watch / durationSeconds, 1) * 100),
  contentType: durationSeconds >= 1200 ? "long_form" : "standard"
}));

/**
 * Oturum tabanlı ekranlar (izleme trendi, ritim, yolculuk) örnek veride de dolu
 * görünsün diye oturumlar videolardan türetilir: süreler videonun aktif izleme
 * süresine bölünür, tarihler videonun son görülme gününe yaslanır.
 */
export const seedSessions: WatchSession[] = seedVideos.flatMap((video, index) => {
  const parts = video.sessionCount;
  const share = Math.floor(video.totalActiveWatchSeconds / parts);
  return Array.from({ length: parts }, (_, part) => {
    const watchSeconds = part === parts - 1
      ? video.totalActiveWatchSeconds - share * (parts - 1)
      : share;
    const startedAt = new Date(now - (index + part) * 86400000 - (2 + part * 5) * 3600000);
    const reached = Math.min(watchSeconds, video.durationSeconds);
    return {
      id: `${video.videoId}-s${part + 1}`,
      videoId: video.videoId,
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + watchSeconds * 1000).toISOString(),
      watchSeconds,
      maximumPosition: reached,
      exitPosition: reached,
      pauseCount: index % 3,
      forwardSeekCount: index % 2,
      backwardSeekCount: part,
      tabHiddenCount: (index + part) % 2,
      playbackSegments: [{ start: 0, end: reached }],
      endedNaturally: video.completed && part === parts - 1,
      followedByAnotherVideo: index % 2 === 0
    };
  });
});

const sampleEnvelope = {
  version: 2 as const,
  schemaVersion: 2 as const,
  appVersion: APP_VERSION,
  checksum: "development-sample",
  feedback: [],
  customTopics: [],
  keywordRules: DEFAULT_KEYWORD_RULES,
  weeklyReports: [],
  diagnostics: [],
  settings: DEFAULT_SETTINGS
};

export const seedData: AppData = {
  ...sampleEnvelope,
  exportedAt: new Date().toISOString(),
  counts: { videos: seedVideos.length, sessions: seedSessions.length, feedback: 0, customTopics: 0 },
  videos: seedVideos,
  sessions: seedSessions
};

export const oneVideoSeedData: AppData = {
  ...sampleEnvelope,
  exportedAt: new Date().toISOString(),
  videos: [{
    ...seedVideos[0],
    totalWatchSeconds: 48,
    completionRate: 48 / seedVideos[0].durationSeconds,
    sessionCount: 1,
    completed: false,
    regretScore: 45,
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg"
  }],
  sessions: [{
    id: "sample-session",
    videoId: seedVideos[0].videoId,
    startedAt: new Date(now - 48_000).toISOString(),
    updatedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    watchSeconds: 48,
    maximumPosition: 52,
    exitPosition: 52,
    pauseCount: 1,
    forwardSeekCount: 1,
    backwardSeekCount: 0,
    tabHiddenCount: 0,
    playbackSegments: [{ start: 0, end: 48 }],
    endedNaturally: false,
    active: false
  }],
  counts: { videos: 1, sessions: 1, feedback: 0, customTopics: 0 }
};
