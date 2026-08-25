import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DB_NAME, DB_VERSION } from "../shared/constants";
import type {
  CustomTopicRule,
  DiagnosticLog,
  KeywordRules,
  FeedImpression,
  UserVideoFeedback,
  VideoRecord,
  WatchSession,
  WeeklyReport
} from "../shared/types";

export interface DemirTubeSchema extends DBSchema {
  videos: {
    key: string;
    value: VideoRecord;
    indexes: { "by-last-seen": string; "by-channel": string; "by-content-type": string };
  };
  sessions: {
    key: string;
    value: WatchSession;
    indexes: { "by-video": string; "by-started": string };
  };
  feedback: {
    key: string;
    value: UserVideoFeedback;
    indexes: { "by-updated": string };
  };
  customTopics: {
    key: string;
    value: CustomTopicRule;
    indexes: { "by-priority": number };
  };
  keywordRules: {
    key: "default";
    value: KeywordRules;
  };
  diagnostics: {
    key: string;
    value: DiagnosticLog;
    indexes: { "by-timestamp": string };
  };
  weeklyReports: {
    key: string;
    value: WeeklyReport;
    indexes: { "by-week": string };
  };
  impressions: {
    key: string;
    value: FeedImpression;
    indexes: { "by-first-shown": string };
  };
}

let databasePromise: Promise<IDBPDatabase<DemirTubeSchema>> | undefined;

/**
 * Bağlantı, eklentinin kontrolü dışında kapanabilir: disk dolduğunda tarayıcı
 * transaction'ı iptal edip bağlantıyı kapatır, başka bir sekme sürüm yükseltmesi
 * tetikleyebilir, tarayıcı bellek baskısı altında bağlantıyı sonlandırabilir.
 * Promise'i sonsuza kadar önbellekte tutarsak bundan sonraki her istek
 * "The database connection is closing" ile ölür ve ancak eklenti yeniden
 * yüklenerek düzelir. Kapanışı dinleyip önbelleği temizliyoruz ki bir sonraki
 * çağrı yeni bağlantı açsın.
 */
function openDatabase() {
  const pending = openDB<DemirTubeSchema>(DB_NAME, DB_VERSION, {
    terminated() {
      if (databasePromise === pending) databasePromise = undefined;
    },
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (!database.objectStoreNames.contains("videos")) {
        const videos = database.createObjectStore("videos", { keyPath: "videoId" });
        videos.createIndex("by-last-seen", "lastSeenAt");
        videos.createIndex("by-channel", "channelName");
        videos.createIndex("by-content-type", "contentType");
      } else if (oldVersion < 2) {
        const videos = transaction.objectStore("videos");
        if (!videos.indexNames.contains("by-content-type")) videos.createIndex("by-content-type", "contentType");
      }
      if (!database.objectStoreNames.contains("sessions")) {
        const sessions = database.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-video", "videoId");
        sessions.createIndex("by-started", "startedAt");
      }
      if (!database.objectStoreNames.contains("feedback")) {
        const feedback = database.createObjectStore("feedback", { keyPath: "videoId" });
        feedback.createIndex("by-updated", "updatedAt");
      }
      if (!database.objectStoreNames.contains("customTopics")) {
        const topics = database.createObjectStore("customTopics", { keyPath: "id" });
        topics.createIndex("by-priority", "priority");
      }
      if (!database.objectStoreNames.contains("keywordRules")) {
        database.createObjectStore("keywordRules", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("diagnostics")) {
        const diagnostics = database.createObjectStore("diagnostics", { keyPath: "id" });
        diagnostics.createIndex("by-timestamp", "timestamp");
      }
      if (!database.objectStoreNames.contains("weeklyReports")) {
        const reports = database.createObjectStore("weeklyReports", { keyPath: "id" });
        reports.createIndex("by-week", "weekStart");
      }
      if (!database.objectStoreNames.contains("impressions")) {
        const impressions = database.createObjectStore("impressions", { keyPath: "videoId" });
        impressions.createIndex("by-first-shown", "firstShownAt");
      }
    }
  });
  pending.then(
    (database) => {
      database.addEventListener("close", () => {
        if (databasePromise === pending) databasePromise = undefined;
      });
    },
    () => {
      // Açılış başarısızsa hatalı promise'i önbellekte bırakma.
      if (databasePromise === pending) databasePromise = undefined;
    }
  );
  return pending;
}

/** Bağlantının kapandığını yalnızca bir işlem denerken öğrenebildiğimiz durumlar. */
function isClosedConnectionError(error: unknown) {
  return error instanceof Error
    && (/database connection is closing|connection is closing/i.test(error.message)
      || (error.name === "InvalidStateError" && /clos/i.test(error.message)));
}

export function getDatabase() {
  databasePromise ??= openDatabase();
  return databasePromise;
}

/**
 * Kapanmış bağlantı hatasında bir kez yeniden bağlanıp işlemi tekrarlar.
 * Disk dolu gibi kalıcı hatalar ikinci denemede de patlar ve çağırana ulaşır —
 * amaç hatayı gizlemek değil, geçici kapanışın kalıcı arızaya dönüşmesini
 * engellemek.
 */
export async function withDatabase<T>(run: (database: IDBPDatabase<DemirTubeSchema>) => Promise<T>): Promise<T> {
  try {
    return await run(await getDatabase());
  } catch (error) {
    if (!isClosedConnectionError(error)) throw error;
    databasePromise = undefined;
    return run(await getDatabase());
  }
}

export function resetDatabaseConnectionForTests() {
  databasePromise = undefined;
}
