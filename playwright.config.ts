import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  // Tek bir duman testi ~40 gezinme ve onlarca beklenti çalıştırıyor; yerel
  // makinede ~30 sn sürüyor. Paylaşımlı CI koşucusunda xvfb altında daha yavaş
  // olduğu için dört katına yakın pay bırakıldı.
  //
  // Bu değer bir ara 150 sn'ye çıkarılmıştı, çünkü test sürekli zaman aşımına
  // uğruyordu. Sebep yavaşlık değildi: `.compare-toggle` düğmesinin üstüne
  // taşan tarih gezgini oku tıklamayı yiyordu ve test o tıklamada süresiz
  // bekliyordu. Zaman aşımını büyütmek, gerçek bir arayüz hatasını gizliyordu.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // Tıklama ve doldurma varsayılan olarak süresiz bekler; bulunamayan bir öğe
  // tüm testi 120 sn'lik zaman aşımına sürükleyip hangi adımda kalındığını
  // gizliyordu (v0.11.2–v0.11.3 CI kırmızısı). Artık takılan adım 15 sn içinde
  // kendi hata mesajıyla düşer.
  use: { trace: "retain-on-failure", actionTimeout: 15_000 }
});
