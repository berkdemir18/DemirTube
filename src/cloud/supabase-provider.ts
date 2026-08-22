// DemirTube · Supabase bulut sağlayıcısı
//
// Yedek, demirtube_backups tablosunda kullanıcı başına tek satırdır (supabase/schema.sql).
// Erişimi RLS politikaları sınırlar; anon anahtar tek başına başkasının satırını açmaz.
import type { AppData, LegacyAppData, SupabaseCloudConfig } from "../shared/types";
import { authExpiry, type CloudAuth, type CloudProvider } from "./provider";

async function authRequest(config: SupabaseCloudConfig, path: string, body: object) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.msg ?? payload.error_description ?? payload.message ?? "Bulut hesabı işlemi başarısız."));
  return payload;
}

function authFromPayload(payload: Record<string, unknown>, email: string): CloudAuth | undefined {
  const user = payload.user as { id?: string; email?: string } | undefined;
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string" || !user?.id) return undefined;
  return {
    accessToken,
    refreshToken,
    expiresAt: authExpiry(payload.expires_in),
    userId: user.id,
    email: user.email ?? email
  };
}

async function restFetch(config: SupabaseCloudConfig, auth: CloudAuth, path: string, init?: RequestInit) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(payload.message ?? payload.hint ?? `Bulut isteği başarısız (${response.status}).`));
  }
  return response;
}

export const supabaseProvider: CloudProvider<SupabaseCloudConfig> = {
  label: "Supabase",
  hostPermissions: ["https://*.supabase.co/*"],

  validateConfig(config) {
    const supabaseUrl = config.supabaseUrl.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) throw new Error("Geçerli bir https://…supabase.co proje adresi gir.");
    if (config.anonKey.trim().length < 40) throw new Error("Supabase anon/publishable anahtarı eksik görünüyor.");
    return { ...config, supabaseUrl, anonKey: config.anonKey.trim() };
  },

  async signIn(config, email, password) {
    const payload = await authRequest(config, "token?grant_type=password", { email, password });
    const auth = authFromPayload(payload, email);
    if (!auth) throw new Error("Giriş yanıtında oturum bilgisi bulunamadı.");
    return auth;
  },

  async signUp(config, email, password) {
    return authFromPayload(await authRequest(config, "signup", { email, password }), email);
  },

  async refresh(config, auth) {
    const payload = await authRequest(config, "token?grant_type=refresh_token", { refresh_token: auth.refreshToken });
    const refreshed = authFromPayload(payload, auth.email);
    if (!refreshed) throw new Error("Bulut oturumu yenilenemedi. Tekrar giriş yap.");
    return refreshed;
  },

  async readBackup(config, auth) {
    const response = await restFetch(config, auth, "demirtube_backups?select=payload,updated_at&limit=1");
    const rows = await response.json() as Array<{ payload?: AppData | LegacyAppData }>;
    return rows[0]?.payload;
  },

  async writeBackup(config, auth, payload) {
    await restFetch(config, auth, "demirtube_backups?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: auth.userId, payload, updated_at: new Date().toISOString() })
    });
  }
};
