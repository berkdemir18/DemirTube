export type DefaultTopic =
  | "Yapay zekâ" | "Teknoloji" | "Programlama" | "Siber güvenlik"
  | "Futbol" | "Beşiktaş" | "Basketbol" | "Formula 1" | "Otomobil"
  | "Oyun" | "Dizi ve film" | "Eğitim" | "Eğlence" | "Bilim" | "Tarih" | "Finans" | "Sağlık" | "Seyahat" | "Müzik"
  | "Hazırlık" | "Diğer";

export type Topic = string;
export type PlaybackSegment = { start: number; end: number };
export type ContentType = "short" | "standard" | "long_form" | "podcast" | "livestream" | "premiere" | "music" | "unknown";
export type VideoFormat =
  | "short_vertical" | "step_by_step" | "hands_on_review" | "comparison"
  | "news_update" | "explainer" | "conversation" | "interview"
  | "documentary_story" | "reaction" | "gameplay_series" | "vlog"
  | "sports_highlights" | "music_video" | "trailer" | "long_form"
  | "lecture" | "course_lesson" | "coding_build" | "screen_demo"
  | "case_study" | "deep_dive" | "listicle" | "qa"
  | "debate" | "panel_discussion" | "video_essay" | "storytime"
  | "unboxing" | "first_impressions" | "walkthrough" | "compilation"
  | "behind_the_scenes" | "webinar" | "ambient_asmr" | "live_performance"
  | "general";
export type LeaveReason =
  | "misleading_title" | "too_long" | "repetitive" | "not_interesting"
  | "presentation" | "accidental" | "watch_later" | "answer_found" | "already_knew" | "no_time" | "other";
export type Confidence = "low" | "medium" | "high";
export type AnalysisMode = "local_standard" | "local_advanced" | "groq_cloud";
export type WatchIntent = "open" | "learn" | "focus" | "relax" | "research";
export type FeedFilterMode = "show_all" | "soften_low" | "hide_risky";

export type GroqConfig = {
  model: "openai/gpt-oss-120b" | "openai/gpt-oss-20b";
};

export type GroqStatus = {
  configured: boolean;
  model: GroqConfig["model"];
  lastTestedAt?: string;
  lastError?: string;
};

export type FeedRuntimeStatus = {
  state: "waiting" | "active" | "disabled" | "error";
  count: number;
  message: string;
  updatedAt: string;
};

/** Günlük izleme bütçesinin anlık durumu; içerik betiği ve popup bunu okur. */
export type BudgetState = {
  seconds: number;
  budgetMinutes: number;
  /** Bütçe açık ve aşılmış mı. */
  exceeded: boolean;
  percent: number;
  /** Shorts gün sonuna kadar gizlenmiş mi. */
  shortsPaused: boolean;
  shortsPausedUntil?: string;
  /** Aşım uyarısı bugün kapatıldı mı. */
  noticeDismissed: boolean;
};

export type TrackingRuntimeStatus = {
  state: "counting" | "paused" | "hidden" | "buffering" | "seeking" | "ended" | "waiting";
  label: string;
  detail: string;
};

export type CloudVideoAnalysis = {
  provider: "groq";
  model: string;
  summary: string;
  keyPoints: string[];
  titleVerdict: "fulfilled" | "partial" | "weak" | "unknown";
  valueAssessment: string;
  recommendation: string;
  risks: string[];
  confidence: Confidence;
  analyzedAt: string;
  inputFingerprint: string;
};

export type CloudAnalysisInput = {
  videoId: string;
  title: string;
  channelName: string;
  description?: string;
  topics: string[];
  durationSeconds: number;
  contentType: ContentType;
  transcriptAnalysis?: TranscriptAnalysis;
};

export type TranscriptMoment = {
  startSeconds: number;
  label: string;
};

export type TranscriptAnalysis = {
  available: boolean;
  status?: "ready" | "no_tracks" | "empty_track" | "fetch_failed";
  language?: string;
  wordCount: number;
  keywords: string[];
  summary: string;
  informationDensity: number;
  repetitionRate: number;
  titlePromiseCoverage: number;
  promiseVerdict: "fulfilled" | "partial" | "weak" | "unknown";
  keyMoments: TranscriptMoment[];
  analyzedAt: string;
};

export type PredictionSnapshot = {
  score?: number;
  estimatedCompletion?: number;
  rawEstimatedCompletion?: number;
  provenance?: "first-watch";
  confidence: Confidence;
  modelVersion: string;
  predictedAt: string;
  signals: string[];
};

/**
 * Keşfette PUANLANIP kullanıcıya gösterilmiş ama henüz açılmamış bir kart.
 *
 * Model bugüne kadar yalnızca izlenen videolardan öğreniyordu: yüksek puan
 * verip kullanıcının hiç açmadığı video hiçbir yere yazılmıyordu. Bu, modeli
 * "izlenen videonun ne kadarını bitirirsin" tahmincisine indiriyor, oysa ürün
 * "bunu izlemeli misin" sorusunu cevaplıyormuş gibi davranıyordu. Negatif
 * örnek olmadan seçim yanlılığı ölçülemez.
 *
 * Not: "açılmadı" temiz bir olumsuz örnek değildir — kart görülmemiş, sonra
 * başka cihazda izlenmiş ya da kaydedilip sonraya bırakılmış olabilir. Bu
 * yüzden veri bir etiket değil, yanlılık ÖLÇÜSÜ olarak kullanılır.
 */
export type FeedImpression = {
  videoId: string;
  title: string;
  channelName: string;
  /** Kartta gösterilen uygunluk puanı. */
  score?: number;
  /** O anki tamamlanma tahmini. */
  estimatedCompletion?: number;
  /** Puanı üreten model sürümü; formül değişince eski kayıtlar ayırt edilebilsin. */
  modelVersion: string;
  firstShownAt: string;
  lastShownAt: string;
  /** Kart kaç kez puanlanıp gösterildi. */
  shownCount: number;
};

export type UserVideoFeedback = {
  videoId: string;
  liked?: boolean;
  clickbait?: boolean;
  accidentalClick?: boolean;
  excludedFromAnalytics?: boolean;
  manualTopics?: string[];
  manualContentType?: ContentType;
  manualVideoFormat?: VideoFormat;
  reason?: LeaveReason;
  reasonText?: string;
  updatedAt: string;
};

export type ExplainableScore = {
  score: number;
  label: string;
  contributingFactors: string[];
  confidence: Confidence;
  enoughData: boolean;
};

/**
 * YouTube geçmiş sayfasından kullanıcının isteğiyle okunan kayıt. Oturum verisi
 * yoktur; yalnızca "ne izlendi ve kaçta kalındı" bilinir.
 */
export type ImportedHistoryEntry = {
  videoId: string;
  title: string;
  channelName: string;
  url: string;
  durationSeconds: number;
  /** Küçük resimdeki kaldığın yer çubuğundan okunan yüzde. */
  progressPercent?: number;
  /** Bölüm başlığından çözülen tarih (ISO). Çözülemediyse yok. */
  watchedAt?: string;
  contentType: ContentType;
  topics: Topic[];
};

export type VideoRecord = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  url: string;
  durationSeconds: number;
  topics: Topic[];
  inferredTopics?: Topic[];
  likeStatus?: "liked" | "disliked" | "none" | "unknown";
  thumbnailUrl?: string;
  channelAvatarUrl?: string;
  description?: string;
  hashtags?: string[];
  chapterCount?: number;
  transcriptAnalysis?: TranscriptAnalysis;
  predictionSnapshot?: PredictionSnapshot;
  cloudAnalysis?: CloudVideoAnalysis;
  firstSeenAt: string;
  lastSeenAt: string;
  /** @deprecated Use totalActiveWatchSeconds. Kept for v1 export compatibility. */
  totalWatchSeconds: number;
  totalActiveWatchSeconds: number;
  uniqueWatchedSeconds: number;
  rewatchSeconds: number;
  uniquePlaybackSegments: PlaybackSegment[];
  completionRate: number;
  sessionCount: number;
  completed: boolean;
  regretScore: number;
  regretLabel?: string;
  regretFactors?: string[];
  regretConfidence?: Confidence;
  engagementScore: number;
  engagementLabel?: string;
  engagementFactors?: string[];
  engagementConfidence?: Confidence;
  contentType: ContentType;
  videoFormat?: VideoFormat;
  inferredVideoFormat?: VideoFormat;
  isCurrentlyWatching?: boolean;
  excludedFromAnalytics?: boolean;
  /**
   * Kaydın nereden geldiği. "imported" olanlar YouTube geçmiş sayfasından
   * kullanıcı isteğiyle alınmıştır: oturumları yoktur, tamamlanma oranı
   * küçük resimdeki ilerleme çubuğundan gelir. Soğuk başlangıçta modele kanıt
   * olurlar; oturum tabanlı analizler (ritim, ısı haritası) oturum tablosunu
   * okuduğu için onları zaten görmez.
   */
  source?: "tracked" | "imported";
  importedAt?: string;
};

export type WatchSession = {
  id: string;
  videoId: string;
  startedAt: string;
  updatedAt?: string;
  endedAt?: string;
  watchSeconds: number;
  maximumPosition: number;
  exitPosition?: number;
  pauseCount: number;
  forwardSeekCount: number;
  backwardSeekCount: number;
  tabHiddenCount: number;
  playbackSegments: PlaybackSegment[];
  endedNaturally: boolean;
  followedByAnotherVideo?: boolean;
  active?: boolean;
  leaveReason?: LeaveReason;
  leaveReasonText?: string;
  feedbackPromptShown?: boolean;
};

export type CustomTopicRule = {
  id: string;
  name: string;
  icon?: string;
  keywords: string[];
  channels: string[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KeywordRules = {
  id: "default";
  ignored: string[];
  clickbait: string[];
  positive: string[];
  updatedAt: string;
};

export type TopicPreference = {
  topic: Topic;
  videoCount: number;
  watchSeconds: number;
  averageCompletion: number;
  earlyExitRate: number;
  preferenceScore: number;
};

export type ChannelPreference = {
  channelName: string;
  videoCount: number;
  watchSeconds: number;
  averageCompletion: number;
  earlyExitRate: number;
  affinityScore?: number;
};

export type KeywordStatistic = {
  keyword: string;
  kind?: "word" | "phrase";
  count: number;
  averageCompletion: number;
  averageRegretScore: number;
  regretRate?: number;
  averageEngagementScore?: number;
  confirmedClickbaitRate?: number;
  confidence?: Confidence;
};

export type UserPreferenceProfile = {
  preferredTopics: TopicPreference[];
  preferredChannels: ChannelPreference[];
  preferredDurationRange?: { minMinutes: number; maxMinutes?: number };
  regretKeywords: KeywordStatistic[];
  preferredKeywords: KeywordStatistic[];
};

export type Settings = {
  trackingEnabled: boolean;
  theme: "dark" | "light" | "system";
  earlyExitPromptEnabled: boolean;
  weeklyNotificationEnabled: boolean;
  panelCollapsed: boolean;
  savedHistoryFilters?: Record<string, string>;
  onboardingCompleted: boolean;
  backupReminderEnabled: boolean;
  backupReminderDays: number;
  lastLocalExportAt?: string;
  analysisMode: AnalysisMode;
  feedBadgesEnabled: boolean;
  transcriptAnalysisEnabled: boolean;
  watchIntent: WatchIntent;
  dailyWatchBudgetMinutes: number;
  feedFilterMode: FeedFilterMode;
  /** ntfy.sh konuğu (boş = kapalı). Haftalık rapor telefona push gönderir. */
  ntfyTopic?: string;
  /** Otomatik JSON yedeği (downloads izni gerekir). */
  autoBackupEnabled?: boolean;
  /** Yerel haftalık izleme hedefleri; eski ayarlarda varsayılanlar kullanılır. */
  goals: UserGoals;
};

export type UserGoals = {
  weeklyLearningVideos: number;
  maxShortsPercent: number;
  weeklyCompletedVideos: number;
  lateNightStartHour: number;
  maxLateNightMinutes: number;
};

export type WatchlistItem = {
  thumbnailUrl?: string;
  channelAvatarUrl?: string;
  channelId?: string;
  videoId: string;
  title: string;
  channelName: string;
  url: string;
  topics: string[];
  durationSeconds: number;
  addedAt: string;
  note?: string;
  updatedAt?: string;
  intent?: WatchIntent;
  learningStage?: "saved" | "watched" | "practiced" | "mastered";
  noteSeconds?: number;
  reviewOn?: string;
  useful?: boolean;
};

/** Listeden kaldırılan ancak geçmişte görüntülenebilen kişisel liste kaydı. */
export type ArchivedWatchlistItem = WatchlistItem & {
  removedAt: string;
};

export type VideoDecision = {
  preference: import("../analytics/preference-score").PreferenceResult;
  /** Yalnızca kişisel model için yeterli geçmiş varsa üretilir. */
  score?: number;
  recommendation: "watch" | "save" | "skip";
  goalFit: number;
  timeFit: number;
  channelTrust: { score?: number; label: string; evidence: string; sampleCount: number };
  novelty: { score?: number; label: string; evidence: string; sampleCount: number };
  /** Nihai puanın açıklanabilir, puan cinsinden katkıları. */
  scoreContributions: Array<{
    key: "channel" | "topic" | "duration" | "title" | "format" | "intent" | "calibration";
    label: string;
    points: number;
    evidence: string;
  }>;
  decisionLabel: "Güçlü eşleşme" | "Uyumlu seçim" | "Yeni keşif" | "Dikkatli seç" | "Veri yetersiz";
  estimatedActiveMinutes: number;
  reasons: string[];
  /** Video daha önce izlendiyse dolu gelir (feed "✓ İzledin" rozeti için). */
  existingWatch?: { lastSeenAt: string; completionRate: number };
};

export type CloudProviderId = "supabase" | "firebase";

export type SupabaseCloudConfig = {
  provider: "supabase";
  supabaseUrl: string;
  anonKey: string;
  autoSync: boolean;
};

/** Firebase web yapılandırması: apiKey herkese açık olacak şekilde tasarlanmıştır, erişimi veritabanı kuralları sınırlar. */
export type FirebaseCloudConfig = {
  provider: "firebase";
  apiKey: string;
  databaseUrl: string;
  autoSync: boolean;
};

export type CloudConfig = SupabaseCloudConfig | FirebaseCloudConfig;

export type CloudStatus = {
  configured: boolean;
  provider: CloudProviderId;
  signedIn: boolean;
  email?: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  lastError?: string;
};

export type DiagnosticLog = {
  id: string;
  errorCode: string;
  timestamp: string;
  component: string;
  safeMessage: string;
  stack?: string;
  recovered: boolean;
};

/** IndexedDB dışında (chrome.storage.local) tutulan kayıt sayısı işareti. */
export type DataFingerprint = {
  videos: number;
  sessions: number;
  updatedAt: string;
};

export type DataLossReport = {
  lost: boolean;
  expected?: DataFingerprint;
  actual: { videos: number; sessions: number };
};

export type DiagnosticsReport = {
  extensionVersion: string;
  databaseVersion: number;
  videoCount: number;
  sessionCount: number;
  activeSessionCount: number;
  malformedRecords: number;
  missingMetadata: number;
  sessionsMissingDuration: number;
  orphanSessions: number;
  duplicateSessions: number;
  lastSuccessfulCheckpoint?: string;
  lastBackgroundError?: DiagnosticLog;
  lastSyncResult?: string;
  trackingEnabled: boolean;
  contentScriptState?: string;
  generatedAt: string;
};

export type WeeklyReport = {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalWatchSeconds: number;
  videoCount: number;
  completedVideos: number;
  averageCompletion: number;
  regretCount: number;
  topTopics: string[];
  topChannels: string[];
  preferredDuration?: string;
  strongestEngagement: string[];
  mostRegretted: string[];
  timeInsights: string[];
  weekOverWeekPercent?: number;
  recommendations: string[];
  shortsWatchSeconds?: number;
  shortsCount?: number;
  shortsChangePercent?: number;
  regretRate?: number;
  regretRateChange?: number;
  consciousSelectionRate?: number;
  consciousSelectionChange?: number;
  learningWatchSeconds?: number;
  entertainmentWatchSeconds?: number;
  learningShareChange?: number;
  topicChanges?: Array<{ topic: string; currentSeconds: number; previousSeconds: number; changePercent?: number }>;
  discoveryInsights?: Array<{
    kind: "interest" | "time" | "risk" | "return";
    label: string;
    value: string;
  }>;
  predictionAccuracy?: {
    sampleCount: number;
    nearCount: number;
    meanError: number;
  };
  text: string;
  generatedAt: string;
};

export type EvidenceLevel = {
  sampleCount: number;
  confidence: Confidence;
  label: string;
  enoughData: boolean;
  nextThreshold?: number;
};

export type SelectionReason = {
  key: "channel" | "topic" | "duration" | "title" | "content_type";
  label: string;
  score: number;
  explanation: string;
  confidence: Confidence;
};

export type VideoMetadata = Pick<VideoRecord,
  "videoId" | "title" | "channelName" | "channelId" | "url" | "durationSeconds" |
  "topics" | "likeStatus" | "thumbnailUrl" | "channelAvatarUrl" | "contentType" | "videoFormat" | "description" | "hashtags" | "chapterCount" | "transcriptAnalysis"
>;

export type AppData = {
  version: 2;
  schemaVersion: 2;
  appVersion: string;
  exportedAt: string;
  checksum: string;
  counts: { videos: number; sessions: number; feedback: number; customTopics: number };
  videos: VideoRecord[];
  sessions: WatchSession[];
  feedback: UserVideoFeedback[];
  customTopics: CustomTopicRule[];
  keywordRules: KeywordRules;
  weeklyReports: WeeklyReport[];
  diagnostics: DiagnosticLog[];
  settings: Settings;
  /** Kişisel izleme listesi; bulut yedeğine de dahil edilir. */
  watchlist?: WatchlistItem[];
  /** Kişisel liste arşivi; eski v2 yedeklerinde bulunmayabilir. */
  watchlistArchive?: ArchivedWatchlistItem[];
};

export type LegacyAppData = {
  version: 1;
  exportedAt: string;
  videos: Array<Partial<VideoRecord> & Pick<VideoRecord, "videoId" | "title" | "channelName" | "url" | "durationSeconds" | "topics" | "firstSeenAt" | "lastSeenAt" | "totalWatchSeconds" | "completionRate" | "sessionCount" | "completed" | "regretScore">>;
  sessions: WatchSession[];
  settings: Partial<Settings>;
};
