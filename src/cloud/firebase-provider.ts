// DemirTube · Firebase bulut sağlayıcısı
//
// Kimlik doğrulama Firebase Auth REST (Identity Toolkit), yedek gövdesi ise
// Realtime Database üzerinde backups/<uid> altındaki tek düğümdür.
//
// Neden Cloud Storage değil: Firebase, Ekim 2024'ten sonra açılan projelerde
// Storage için ücretli Blaze planı istiyor. Realtime Database ücretsiz Spark
// planında kalmaya devam ediyor (1 GB saklama, aylık 10 GB indirme).
// Neden Firestore değil: bir Firestore belgesi en fazla 1 MiB tutar, tek
// kullanıcının izleme geçmişi bunu birkaç ayda aşar.
//
// Yedek, ağaç olarak değil **tek bir JSON metni** olarak yazılır. Realtime
// Database boş dizileri ve null alanları saklamaz, dizileri nesneye çevirir;
// ağaç olarak yazılsaydı geri okunan yedek yerelden farklı biçimde dönerdi.
//
// Firebase web apiKey'i gizli değildir (istemciye gömülmek üzere tasarlanmıştır);
// veriyi koruyan şey firebase/database.rules.json içindeki uid eşleşmesidir.
import type { AppData, FirebaseCloudConfig, LegacyAppData } from "../shared/types";
import { checksumPayload } from "../storage/data-service";
import { authExpiry, type CloudAuth, type CloudProvider } from "./provider";

const IDENTITY_HOST = "https://identitytoolkit.googleapis.com/v1";
const TOKEN_HOST = "https://securetoken.googleapis.com/v1";
const SYNC_STATE_KEY = "firebaseSyncState";

type FirebaseSyncState = {
  /** En son başarıyla yüklenen içeriğin özeti; uzaktaki sürümün kimliği olarak kullanılır. */
  lastSyncedChecksum?: string;
};

/** Yedek düğümünün yanında duran küçük künye; tam gövdeyi indirmeden değişiklik olup olmadığını söyler. */
type BackupMeta = {
  checksum: string;
  updatedAt: string;
  videos: number;
  sessions: number;
};

/** Firebase Auth hata kodları ham haliyle ("EMAIL_EXISTS") kullanıcıya gösterilemez. */
const AUTH_MESSAGES: Record<string, string> = {
  EMAIL_EXISTS: "Bu e-posta ile zaten bir hesap var. Giriş yap.",
  EMAIL_NOT_FOUND: "Bu e-posta ile kayıtlı hesap yok.",
  INVALID_PASSWORD: "Şifre hatalı.",
  INVALID_LOGIN_CREDENTIALS: "E-posta veya şifre hatalı.",
  INVALID_EMAIL: "E-posta adresi geçersiz.",
  WEAK_PASSWORD: "Şifre en az 6 karakter olmalı.",
  USER_DISABLED: "Bu hesap devre dışı bırakılmış.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Çok fazla deneme yapıldı, bir süre sonra tekrar dene.",
  OPERATION_NOT_ALLOWED: "Firebase projesinde E-posta/Şifre oturum açma yöntemi açık değil.",
  ADMIN_ONLY_OPERATION: "Firebase projesinde kendi kendine kayıt kapalı; hesabı konsoldan oluştur."
};

function authErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const error = payload.error as { message?: string } | undefined;
  const raw = typeof error?.message === "string" ? error.message : "";
  // Firebase bazı kodları "WEAK_PASSWORD : Password should be…" biçiminde döndürür.
  const code = raw.split(":")[0].trim();
  return AUTH_MESSAGES[code] ?? (raw || fallback);
}

async function identityRequest(config: FirebaseCloudConfig, path: string, body: object) {
  const response = await fetch(`${IDENTITY_HOST}/${path}?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(authErrorMessage(payload, "Firebase hesap işlemi başarısız."));
  return payload;
}

function authFromIdentity(payload: Record<string, unknown>, email: string): CloudAuth | undefined {
  const { idToken, refreshToken, localId } = payload;
  if (typeof idToken !== "string" || typeof refreshToken !== "string" || typeof localId !== "string") return undefined;
  return {
    accessToken: idToken,
    refreshToken,
    expiresAt: authExpiry(payload.expiresIn),
    userId: localId,
    email: typeof payload.email === "string" ? payload.email : email
  };
}

async function readSyncState(): Promise<FirebaseSyncState> {
  if (!globalThis.chrome?.storage) return {};
  return ((await chrome.storage.local.get(SYNC_STATE_KEY))[SYNC_STATE_KEY] as FirebaseSyncState | undefined) ?? {};
}

async function writeSyncState(state: FirebaseSyncState) {
  if (!globalThis.chrome?.storage) return;
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
}

/**
 * İçerik özeti: exportedAt ve tanılama kayıtları her dışa aktarımda değiştiği
 * için yedeğin gövde özetine katılmaz. Böylece "veri gerçekten değişti mi?"
 * sorusu güvenilir yanıtlanır ve değişmediyse hiç yükleme yapılmaz.
 */
function contentChecksum(payload: AppData) {
  return checksumPayload({
    videos: payload.videos,
    sessions: payload.sessions,
    feedback: payload.feedback,
    customTopics: payload.customTopics,
    keywordRules: payload.keywordRules,
    weeklyReports: payload.weeklyReports,
    settings: payload.settings,
    watchlist: payload.watchlist,
    watchlistArchive: payload.watchlistArchive
  });
}

function databaseUrl(config: FirebaseCloudConfig, auth: CloudAuth, child: string) {
  return `${config.databaseUrl}/backups/${auth.userId}/${child}.json?auth=${encodeURIComponent(auth.accessToken)}`;
}

async function databaseError(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  if (response.status === 401 || response.status === 403) {
    return new Error("Firebase veritabanı yedeğe izin vermedi. firebase/database.rules.json içindeki kuralları yayınladığından emin ol.");
  }
  return new Error(typeof payload.error === "string" ? payload.error : `Firebase veritabanı isteği başarısız (${response.status}).`);
}

export const firebaseProvider: CloudProvider<FirebaseCloudConfig> = {
  label: "Firebase",
  hostPermissions: [
    "https://identitytoolkit.googleapis.com/*",
    "https://securetoken.googleapis.com/*",
    "https://*.firebasedatabase.app/*",
    "https://*.firebaseio.com/*"
  ],

  validateConfig(config) {
    const apiKey = config.apiKey.trim();
    const url = config.databaseUrl.trim().replace(/\/+$/, "");
    if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey)) throw new Error("Firebase web API anahtarı AIza… ile başlamalı.");
    if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebasedatabase\.app|firebaseio\.com)$/i.test(url)) {
      throw new Error("Veritabanı adresi https://projen-default-rtdb.europe-west1.firebasedatabase.app biçiminde olmalı.");
    }
    return { ...config, apiKey, databaseUrl: url };
  },

  async signIn(config, email, password) {
    const payload = await identityRequest(config, "accounts:signInWithPassword", { email, password, returnSecureToken: true });
    const auth = authFromIdentity(payload, email);
    if (!auth) throw new Error("Giriş yanıtında oturum bilgisi bulunamadı.");
    return auth;
  },

  async signUp(config, email, password) {
    const payload = await identityRequest(config, "accounts:signUp", { email, password, returnSecureToken: true });
    return authFromIdentity(payload, email);
  },

  async refresh(config, auth) {
    const response = await fetch(`${TOKEN_HOST}/token?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refreshToken }).toString()
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(authErrorMessage(payload, "Firebase oturumu yenilenemedi. Tekrar giriş yap."));
    const { id_token: idToken, refresh_token: refreshToken, user_id: userId } = payload;
    if (typeof idToken !== "string" || typeof refreshToken !== "string") throw new Error("Firebase oturumu yenilenemedi. Tekrar giriş yap.");
    return {
      accessToken: idToken,
      refreshToken,
      expiresAt: authExpiry(payload.expires_in),
      userId: typeof userId === "string" ? userId : auth.userId,
      email: auth.email
    };
  },

  /**
   * Önce yalnızca künye okunur. Uzaktaki sürüm bizim en son yazdığımızsa gövde
   * hiç indirilmez: senkron 15 dakikada bir çalıştığı için tam yedeği her
   * seferinde indirmek Spark planının aylık 10 GB indirme kotasını yakardı.
   */
  async readBackup(config, auth) {
    const metaResponse = await fetch(databaseUrl(config, auth, "meta"));
    if (!metaResponse.ok) throw await databaseError(metaResponse);
    const meta = await metaResponse.json() as BackupMeta | null;
    if (!meta) return undefined;

    const state = await readSyncState();
    if (state.lastSyncedChecksum && meta.checksum === state.lastSyncedChecksum) return undefined;

    const response = await fetch(databaseUrl(config, auth, "payload"));
    if (!response.ok) throw await databaseError(response);
    const raw = await response.json() as string | null;
    if (typeof raw !== "string") return undefined;
    return JSON.parse(raw) as AppData | LegacyAppData;
  },

  async writeBackup(config, auth, payload) {
    const checksum = contentChecksum(payload);
    const state = await readSyncState();
    // İçerik değişmediyse yükleme yapma; boşta geçen senkronlar yalnızca künyeyi okur.
    if (state.lastSyncedChecksum === checksum) return;

    const meta: BackupMeta = {
      checksum,
      updatedAt: new Date().toISOString(),
      videos: payload.videos.length,
      sessions: payload.sessions.length
    };
    const write = async (child: string, value: unknown) => {
      const response = await fetch(databaseUrl(config, auth, child), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value)
      });
      if (!response.ok) throw await databaseError(response);
    };
    // Gövde önce yazılır: künye yazılamazsa uzakta eski künye kalır ve bir
    // sonraki senkron gövdeyi yeniden indirir; ters sırada veri kaybı görünürdü.
    await write("payload", JSON.stringify(payload));
    await write("meta", meta);
    await writeSyncState({ lastSyncedChecksum: checksum });
  }
};
