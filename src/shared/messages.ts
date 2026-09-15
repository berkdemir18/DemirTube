import type {
  AppData, CloudAnalysisInput, CloudConfig, CustomTopicRule, GroqConfig, KeywordRules, LegacyAppData, Settings,
  UserVideoFeedback, VideoMetadata, WatchSession, WatchlistItem
} from "./types";

export type ExtensionMessage =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: Settings }
  | { type: "SAVE_SESSION"; metadata: VideoMetadata; session: WatchSession }
  | { type: "GET_DATA" }
  | { type: "EXPORT_DATA" }
  | { type: "IMPORT_DATA"; data: AppData }
  | { type: "IMPORT_DATA_V2"; data: AppData | LegacyAppData; mode: "merge" | "replace" }
  | { type: "CLEAR_DATA" }
  | { type: "DELETE_VIDEO"; videoId: string }
  | { type: "SAVE_FEEDBACK"; feedback: UserVideoFeedback }
  | { type: "GET_VIDEO_CONTEXT"; videoId: string }
  | { type: "RESET_FEEDBACK"; videoId: string }
  | { type: "SET_LEAVE_REASON"; sessionId: string; reason: WatchSession["leaveReason"]; reasonText?: string }
  | { type: "GET_DIAGNOSTICS" }
  | { type: "GET_DATA_HEALTH" }
  | { type: "DISMISS_DATA_LOSS" }
  | { type: "REBUILD_SUMMARIES" }
  | { type: "RECLASSIFY_TOPICS" }
  | { type: "FINALIZE_STALE" }
  | { type: "REMOVE_ORPHANS" }
  | { type: "GENERATE_WEEKLY_REPORT" }
  | { type: "PUT_CUSTOM_TOPIC"; rule: CustomTopicRule }
  | { type: "DELETE_CUSTOM_TOPIC"; id: string }
  | { type: "PUT_KEYWORD_RULES"; rules: KeywordRules }
  | { type: "CONTENT_STATE"; state: string }
  | { type: "FEED_STATE"; status: import("./types").FeedRuntimeStatus }
  | { type: "GET_FEED_STATE" }
  | { type: "GET_RECOMMENDATION"; metadata: VideoMetadata }
  | { type: "GET_FEED_RECOMMENDATIONS"; items: VideoMetadata[] }
  | { type: "GET_VIDEO_DECISION"; metadata: VideoMetadata }
  | { type: "GET_FEED_DECISIONS"; items: VideoMetadata[] }
  | { type: "GET_SELECTION_BIAS" }
  | { type: "FETCH_YOUTUBE_CAPTIONS"; url: string }
  | { type: "WATCHLIST_GET" }
  | { type: "WATCHLIST_PRESENTATION" }
  | { type: "WATCHLIST_UPDATE"; videoId: string; patch: Pick<WatchlistItem, "note" | "noteSeconds" | "intent" | "learningStage" | "reviewOn" | "useful"> }
  | { type: "WATCHLIST_TOGGLE"; item: WatchlistItem }
  | { type: "WATCHLIST_REMOVE"; videoId: string }
  | { type: "WATCHLIST_ARCHIVE_GET" }
  | { type: "GET_CHANNEL_STATS"; channelName: string; days?: 30 | 90 }
  | { type: "GET_TODAY_WATCH" }
  | { type: "GET_DAILY_PULSE" }
  | { type: "IMPORT_WATCH_HISTORY"; entries: import("./types").ImportedHistoryEntry[] }
  | { type: "GET_HISTORY_IMPORT_REQUEST" }
  | { type: "REQUEST_HISTORY_IMPORT"; days: number }
  | { type: "GET_BUDGET_STATE" }
  | { type: "SET_SHORTS_PAUSE"; active: boolean }
  | { type: "DISMISS_BUDGET_NOTICE" }
  | { type: "TOGGLE_PANEL" }
  | { type: "INJECT_VIDEO_UI" }
  | { type: "NTFY_TEST" }
  | { type: "AI_GET_STATUS" }
  | { type: "AI_CONFIGURE"; apiKey: string; config: GroqConfig }
  | { type: "AI_TEST" }
  | { type: "AI_RESET" }
  | { type: "AI_ANALYZE_VIDEO"; input: CloudAnalysisInput }
  | { type: "CLOUD_GET_STATUS" }
  | { type: "CLOUD_CONFIGURE"; config: CloudConfig }
  | { type: "CLOUD_SIGN_IN"; email: string; password: string }
  | { type: "CLOUD_SIGN_UP"; email: string; password: string }
  | { type: "CLOUD_SIGN_OUT" }
  | { type: "CLOUD_RESET" }
  | { type: "CLOUD_SYNC" }
  | { type: "MEDIA_PROGRESS"; report: import("../media/types").MediaProgressReport }
  | { type: "MEDIA_GET" }
  | { type: "MEDIA_SET_API_KEY"; apiKey: string }
  | { type: "MEDIA_SET_TRACKING"; enabled: boolean }
  | { type: "MEDIA_SEARCH"; query: string }
  | { type: "MEDIA_TOGGLE_FAVORITE"; titleKey?: string; result?: import("../media/types").TmdbSearchResult }
  | { type: "MEDIA_REMATCH"; titleKey: string; result: import("../media/types").TmdbSearchResult }
  | { type: "MEDIA_DELETE"; titleKey: string }
  | { type: "MEDIA_MARK_EPISODE"; progressId: string; completed: boolean }
  | { type: "MEDIA_PROVIDERS"; kind: "tv" | "movie"; tmdbId: number }
  | { type: "MEDIA_BACKFILL" }
  | { type: "MEDIA_REC_POOL"; force?: boolean }
  | { type: "MEDIA_RATE"; titleKey?: string; result?: import("../media/types").TmdbSearchResult; rating: "liked" | "disliked" | null }
  | { type: "MEDIA_DISMISS"; result: import("../media/types").TmdbSearchResult & { genreNames?: string[] } }
  | { type: "TRAKT_STATUS" }
  | { type: "TRAKT_SAVE_APP"; clientId: string; clientSecret: string }
  | { type: "TRAKT_START_DEVICE" }
  | { type: "TRAKT_POLL" }
  | { type: "TRAKT_SYNC"; full?: boolean }
  | { type: "TRAKT_DISCONNECT" }
  | { type: "TRAKT_IMPORT_EXPORT"; input: import("../media/trakt-import").TraktImportInput };

export class ExtensionContextInvalidatedError extends Error {
  constructor(message = "Extension context invalidated.") {
    super(message);
    this.name = "ExtensionContextInvalidatedError";
  }
}

export function isExtensionContextInvalidated(error: unknown) {
  return error instanceof ExtensionContextInvalidatedError
    || (error instanceof Error && /extension context invalidated|receiving end does not exist/i.test(error.message));
}

/** Chrome service worker'ı uyandırmak için boş bir ping gönderir. */
function wakeServiceWorker(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!globalThis.chrome?.runtime?.id) { resolve(); return; }
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, () => {
      void chrome.runtime.lastError; // lastError'u tüket, yoksa Chrome uyarır
      resolve();
    });
  });
}

export function sendMessage<T>(message: ExtensionMessage, attempt = 0): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.id) {
      reject(new ExtensionContextInvalidatedError());
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          const msg = lastError.message ?? "";
          if (/extension context invalidated|receiving end does not exist/i.test(msg)) {
            reject(new ExtensionContextInvalidatedError(msg));
            return;
          }
          // "message channel closed before a response" = service worker uyudu;
          // kısa bekleyip bir kez daha dene.
          if (/message channel closed|channel closed before/i.test(msg) && attempt < 2) {
            void wakeServiceWorker().then(() =>
              sendMessage<T>(message, attempt + 1).then(resolve, reject)
            );
            return;
          }
          reject(new Error(msg));
          return;
        }
        if (response && typeof response === "object" && "error" in response) {
          reject(new Error(String(response.error)));
          return;
        }
        // Chrome bazen undefined/null döndürür (SW yeni uyandıysa);
        // tip T'ye uygun boş değer ver, null patlamasını engelle.
        if (response == null) {
          resolve(undefined as unknown as T);
          return;
        }
        resolve(response as T);
      });
    } catch (error) {
      reject(isExtensionContextInvalidated(error) ? new ExtensionContextInvalidatedError() : error);
    }
  });
}

/**
 * `chrome.storage.onChanged` aboneliği, uzantı yeniden yüklendiğinde eski
 * sekmelerde çöker: yetim içerik betiğinde `chrome.storage` tanımsız kalır ve
 * her erişim "Cannot read properties of undefined (reading 'onChanged')"
 * fırlatır. Abonelik buradan kurulur; API yoksa sessizce hiçbir şey yapmaz ve
 * geri döndürdüğü sökme fonksiyonu da güvenlidir.
 */
export function onStorageChanged(
  listener: (changes: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => void
): () => void {
  const api = globalThis.chrome?.storage?.onChanged;
  if (!api) return () => undefined;
  try {
    api.addListener(listener);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      globalThis.chrome?.storage?.onChanged?.removeListener(listener);
    } catch {
      // Uzantı bağlamı çoktan gitmiş; sökülecek bir şey yok.
    }
  };
}
