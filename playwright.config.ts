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
  use: { trace: "retain-on-failure" }
});
