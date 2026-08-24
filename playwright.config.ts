import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  // Tek bir duman testi ~40 gezinme ve onlarca beklenti çalıştırıyor; yerel
  // makinede bir dakikanın altında bitiyor ama paylaşımlı CI koşucusunda xvfb
  // altında 60 sn'yi aşıyordu. Süre testin kapsamına göre verildi.
  timeout: 150_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { trace: "retain-on-failure" }
});
