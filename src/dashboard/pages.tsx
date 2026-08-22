// DemirTube · dashboard sayfa haritası
//
// Her sayfa tembel yüklenir ve tek bir kayıt üzerinden bağlanır. Yeni bir ekran
// eklemek için: navigation.ts'e kimlik/etiket, buraya bir lazy import ve bir
// satırlık render girdisi eklemek yeterlidir.
import { lazy } from "react";
import type { ReactNode } from "react";
import type { AppData, LegacyAppData, Settings, UserVideoFeedback, VideoRecord, WatchSession, WatchlistItem, WeeklyReport } from "../shared/types";
import type { AnalyticsPeriod } from "../analytics/period";
import type { PageId } from "./navigation";

const Overview = lazy(async () => ({ default: (await import("./Overview")).Overview }));
const Topics = lazy(async () => ({ default: (await import("./Topics")).Topics }));
const Channels = lazy(async () => ({ default: (await import("./Channels")).Channels }));
const Durations = lazy(async () => ({ default: (await import("./Durations")).Durations }));
const TitleAnalysis = lazy(async () => ({ default: (await import("./TitleAnalysis")).TitleAnalysis }));
const WatchHistory = lazy(async () => ({ default: (await import("./WatchHistory")).WatchHistory }));
const SettingsPage = lazy(async () => ({ default: (await import("./Settings")).Settings }));
const TimeAnalytics = lazy(async () => ({ default: (await import("./TimeAnalytics")).TimeAnalytics }));
const WeeklyReportPage = lazy(async () => ({ default: (await import("./WeeklyReportPage")).WeeklyReportPage }));
const FeedbackCenter = lazy(async () => ({ default: (await import("./FeedbackCenter")).FeedbackCenter }));
const ShortsAnalytics = lazy(async () => ({ default: (await import("./ShortsAnalytics")).ShortsAnalytics }));
const CalendarPage = lazy(async () => ({ default: (await import("./CalendarPage")).CalendarPage }));
const ComparePage = lazy(async () => ({ default: (await import("./ComparePage")).ComparePage }));
const IntelligenceHub = lazy(async () => ({ default: (await import("./IntelligenceHub")).IntelligenceHub }));
const Watchlist = lazy(async () => ({ default: (await import("./Watchlist")).Watchlist }));
const CapsulePage = lazy(async () => ({ default: (await import("./CapsulePage")).CapsulePage }));
const StatisticsPage = lazy(async () => ({ default: (await import("./StatisticsPage")).StatisticsPage }));
const JourneyPage = lazy(async () => ({ default: (await import("./JourneyPage")).JourneyPage }));
const GoalsPage = lazy(async () => ({ default: (await import("./GoalsPage")).GoalsPage }));

export type PageContext = {
  data: AppData;
  watchlist: WatchlistItem[];
  period: AnalyticsPeriod;
  anchor: Date;
  /** Seçili döneme düşen kayıtlar. */
  videos: VideoRecord[];
  sessions: WatchSession[];
  /** Hedef ekranı her zaman içinde bulunulan haftayı gösterir. */
  currentWeekVideos: VideoRecord[];
  currentWeekSessions: WatchSession[];
  /** Bir önceki dönemin kayıtları; karşılaştırma rozetleri için. "all" döneminde boştur. */
  previousVideos: VideoRecord[];
  previousSessions: WatchSession[];
  extensionAvailable: boolean;
  setSettings(settings: Settings): Promise<void>;
  deleteVideo(videoId: string): Promise<void>;
  saveFeedback(feedback: UserVideoFeedback): Promise<void>;
  resetFeedback(videoId: string): Promise<void>;
  clear(): Promise<void>;
  importData(next: AppData | LegacyAppData, mode: "merge" | "replace"): Promise<void>;
  exportData(): Promise<AppData>;
  generateReport(): Promise<WeeklyReport>;
  removeFromWatchlist(videoId: string): void;
  reclassifyTopics(): void;
};

export const pages: Record<PageId, (context: PageContext) => ReactNode> = {
  overview: (c) => <Overview videos={c.videos} sessions={c.sessions} period={c.period} anchor={c.anchor} settings={c.data.settings} totalVideoCount={c.data.videos.length} previousVideos={c.previousVideos} previousSessions={c.previousSessions} onReclassify={c.extensionAvailable ? c.reclassifyTopics : undefined} />,
  intelligence: (c) => <IntelligenceHub videos={c.data.videos} sessions={c.data.sessions} feedback={c.data.feedback} />,
  journey: (c) => <JourneyPage videos={c.videos} sessions={c.sessions} allVideos={c.data.videos} allSessions={c.data.sessions} />,
  goals: (c) => <GoalsPage videos={c.currentWeekVideos} sessions={c.currentWeekSessions} settings={c.data.settings} onSettings={c.setSettings} />,
  topics: (c) => <Topics videos={c.videos} />,
  channels: (c) => <Channels videos={c.videos} sessions={c.sessions} />,
  statistics: (c) => <StatisticsPage videos={c.videos} sessions={c.sessions} />,
  durations: (c) => <Durations videos={c.videos} />,
  time: (c) => <TimeAnalytics videos={c.videos} sessions={c.sessions} />,
  titles: (c) => <TitleAnalysis videos={c.videos} feedback={c.data.feedback} rules={c.data.keywordRules} />,
  shorts: (c) => <ShortsAnalytics videos={c.videos} sessions={c.sessions} />,
  calendar: (c) => <CalendarPage videos={c.data.videos} sessions={c.data.sessions} />,
  compare: (c) => <ComparePage videos={c.data.videos} />,
  watchlist: (c) => <Watchlist items={c.watchlist} onRemove={c.removeFromWatchlist} />,
  feedback: (c) => <FeedbackCenter videos={c.data.videos} feedback={c.data.feedback} onSave={c.saveFeedback} onReset={c.resetFeedback} />,
  history: (c) => <WatchHistory videos={c.videos} sessions={c.sessions} feedback={c.data.feedback} onDelete={c.deleteVideo} onFeedback={c.saveFeedback} onResetFeedback={c.resetFeedback} />,
  report: (c) => <WeeklyReportPage videos={c.data.videos} sessions={c.data.sessions} stored={c.data.weeklyReports} onGenerate={c.generateReport} />,
  capsule: (c) => <CapsulePage videos={c.data.videos} sessions={c.data.sessions} />,
  settings: (c) => <SettingsPage data={c.data} settings={c.data.settings} onSettings={c.setSettings} onClear={c.clear} onExport={c.exportData} onImport={c.importData} />,
};
