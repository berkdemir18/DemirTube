import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firebaseProvider } from "../src/cloud/firebase-provider";
import type { AppData, FirebaseCloudConfig } from "../src/shared/types";
import type { CloudAuth } from "../src/cloud/provider";

const config: FirebaseCloudConfig = {
  provider: "firebase",
  apiKey: "AIzaSyDEMIRTUBE0000000000000000000000000",
  databaseUrl: "https://demirtube-default-rtdb.europe-west1.firebasedatabase.app",
  autoSync: true
};

const auth: CloudAuth = {
  accessToken: "id-token",
  refreshToken: "refresh-token",
  expiresAt: Date.now() + 3_600_000,
  userId: "user-42",
  email: "berk@example.com"
};

const backup = (overrides: Partial<AppData> = {}) => ({
  version: 2,
  schemaVersion: 2,
  videos: [],
  sessions: [],
  feedback: [],
  customTopics: [],
  keywordRules: { id: "default", ignored: [], clickbait: [], positive: [], updatedAt: "2026-08-01T00:00:00Z" },
  weeklyReports: [],
  diagnostics: [],
  settings: { theme: "dark" },
  watchlist: [],
  watchlistArchive: [],
  ...overrides
}) as unknown as AppData;

const storage: Record<string, unknown> = {};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => (key in storage ? { [key]: storage[key] } : {}),
        set: async (items: Record<string, unknown>) => Object.assign(storage, items)
      }
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("firebase yapılandırma doğrulaması", () => {
  it("sondaki eğik çizgiyi temizler", () => {
    const validated = firebaseProvider.validateConfig({ ...config, databaseUrl: `${config.databaseUrl}/` });
    expect(validated.databaseUrl).toBe(config.databaseUrl);
  });

  it("eski firebaseio.com adreslerini de kabul eder", () => {
    expect(() => firebaseProvider.validateConfig({ ...config, databaseUrl: "https://demirtube.firebaseio.com" })).not.toThrow();
  });

  it("API anahtarı AIza ile başlamıyorsa reddeder", () => {
    expect(() => firebaseProvider.validateConfig({ ...config, apiKey: "sb_publishable_abc" })).toThrow(/AIza/);
  });

  it("veritabanı adresi biçimi tutmuyorsa reddeder", () => {
    expect(() => firebaseProvider.validateConfig({ ...config, databaseUrl: "https://demirtube.example.com" })).toThrow(/firebasedatabase/);
  });
});

describe("firebase oturumu", () => {
  it("giriş yanıtını ortak oturum biçimine çevirir", async () => {
    mockFetch(() => jsonResponse({ idToken: "id-1", refreshToken: "refresh-1", localId: "user-9", email: "berk@example.com", expiresIn: "3600" }));

    const session = await firebaseProvider.signIn(config, "berk@example.com", "sifre");

    expect(session.accessToken).toBe("id-1");
    expect(session.userId).toBe("user-9");
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("Firebase hata kodunu Türkçe mesaja çevirir", async () => {
    mockFetch(() => jsonResponse({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, 400));

    await expect(firebaseProvider.signIn(config, "berk@example.com", "yanlis")).rejects.toThrow("E-posta veya şifre hatalı.");
  });

  it("tanınmayan kodda ham mesajı korur", async () => {
    mockFetch(() => jsonResponse({ error: { message: "SOMETHING_NEW" } }, 400));

    await expect(firebaseProvider.signIn(config, "berk@example.com", "x")).rejects.toThrow("SOMETHING_NEW");
  });

  it("oturumu refresh token ile yeniler", async () => {
    const spy = mockFetch(() => jsonResponse({ id_token: "id-2", refresh_token: "refresh-2", user_id: "user-42", expires_in: "3600" }));

    const refreshed = await firebaseProvider.refresh(config, auth);

    expect(refreshed.accessToken).toBe("id-2");
    expect(refreshed.refreshToken).toBe("refresh-2");
    expect(String(spy.mock.calls[0][0])).toContain("securetoken.googleapis.com");
  });
});

describe("firebase yedek düğümü", () => {
  it("uzakta yedek yoksa hata değil undefined döner", async () => {
    mockFetch(() => jsonResponse(null));

    expect(await firebaseProvider.readBackup(config, auth)).toBeUndefined();
  });

  it("gövdeyi kullanıcının kendi düğümüne JSON metni olarak yazar", async () => {
    const spy = mockFetch(() => jsonResponse(true));

    await firebaseProvider.writeBackup(config, auth, backup({ videos: [{ videoId: "v1" }] as unknown as AppData["videos"] }));

    const [payloadUrl, payloadInit] = spy.mock.calls[0];
    expect(String(payloadUrl)).toContain("/backups/user-42/payload.json?auth=id-token");
    expect(payloadInit?.method).toBe("PUT");
    // Gövde ağaç olarak değil tek metin olarak gider: JSON.parse iki kez çözülür.
    expect(JSON.parse(JSON.parse(String(payloadInit?.body)) as string).videos).toHaveLength(1);
    expect(String(spy.mock.calls[1][0])).toContain("/backups/user-42/meta.json");
  });

  it("içerik değişmediyse ikinci yüklemeyi hiç yapmaz", async () => {
    const spy = mockFetch(() => jsonResponse(true));

    await firebaseProvider.writeBackup(config, auth, backup());
    const afterFirst = spy.mock.calls.length;
    await firebaseProvider.writeBackup(config, auth, backup());

    expect(afterFirst).toBe(2);
    expect(spy.mock.calls).toHaveLength(2);
  });

  it("yalnızca exportedAt değiştiyse yüklemeyi tekrarlamaz", async () => {
    const spy = mockFetch(() => jsonResponse(true));

    await firebaseProvider.writeBackup(config, auth, backup({ exportedAt: "2026-08-20T10:00:00Z" }));
    await firebaseProvider.writeBackup(config, auth, backup({ exportedAt: "2026-08-20T11:00:00Z" }));

    expect(spy.mock.calls).toHaveLength(2);
  });

  it("uzaktaki sürüm bizim yazdığımızsa gövdeyi indirmez", async () => {
    let meta: unknown = null;
    const spy = mockFetch((url) => {
      if (url.includes("/meta.json")) return jsonResponse(meta);
      return jsonResponse(true);
    });

    await firebaseProvider.writeBackup(config, auth, backup());
    meta = JSON.parse(String(spy.mock.calls[1][1]?.body));
    spy.mockClear();

    expect(await firebaseProvider.readBackup(config, auth)).toBeUndefined();
    expect(spy.mock.calls).toHaveLength(1);
    expect(String(spy.mock.calls[0][0])).toContain("/meta.json");
  });

  it("uzakta başka bir sürüm varsa gövdeyi indirir", async () => {
    const remote = backup({ videos: [{ videoId: "uzak" }] as unknown as AppData["videos"] });
    mockFetch((url) => {
      if (url.includes("/meta.json")) return jsonResponse({ checksum: "farkli", updatedAt: "2026-08-20T12:00:00Z", videos: 1, sessions: 0 });
      return jsonResponse(JSON.stringify(remote));
    });

    const downloaded = await firebaseProvider.readBackup(config, auth);

    expect(downloaded?.videos).toHaveLength(1);
  });

  it("izin hatasında kural kurulumunu işaret eder", async () => {
    mockFetch(() => jsonResponse({ error: "Permission denied" }, 401));

    await expect(firebaseProvider.readBackup(config, auth)).rejects.toThrow(/database\.rules\.json/);
  });
});
