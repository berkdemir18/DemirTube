// DemirTube · bulut sağlayıcı sözleşmesi
//
// Bulut yedeklemenin sağlayıcıya bağlı olan tek kısmı üç iştir: hesap açma/giriş,
// oturum tazeleme ve tek bir yedek belgesini okuma/yazma. Birleştirme, zamanlama,
// durum ve hata yönetimi cloud-service.ts içinde ortaktır.
import type { AppData, CloudConfig, LegacyAppData } from "../shared/types";

export type CloudAuth = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
};

export interface CloudProvider<TConfig extends CloudConfig> {
  /** Kullanıcının girdiği alanları kırpıp doğrular; hatalıysa Türkçe mesajla fırlatır. */
  validateConfig(config: TConfig): TConfig;
  signIn(config: TConfig, email: string, password: string): Promise<CloudAuth>;
  /** Doğrulama e-postası bekleyen sağlayıcılarda oturum dönmeyebilir. */
  signUp(config: TConfig, email: string, password: string): Promise<CloudAuth | undefined>;
  refresh(config: TConfig, auth: CloudAuth): Promise<CloudAuth>;
  /** Uzakta yedek yoksa undefined döner; bu bir hata değildir. */
  readBackup(config: TConfig, auth: CloudAuth): Promise<AppData | LegacyAppData | undefined>;
  writeBackup(config: TConfig, auth: CloudAuth, payload: AppData): Promise<void>;
  /** chrome.permissions.request için gereken origin listesi. */
  hostPermissions: string[];
  /** Kurulum ekranındaki "önce şunu yap" yönlendirmesinde geçen ad. */
  label: string;
}

export function authExpiry(expiresIn: unknown) {
  return Date.now() + Number(expiresIn ?? 3600) * 1000;
}
