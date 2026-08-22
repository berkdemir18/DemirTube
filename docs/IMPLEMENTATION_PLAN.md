# DemirTube AI — MVP uygulama planı

1. Manifest V3, Vite çoklu girişleri ve ortak TypeScript veri sözleşmelerini kur.
2. Eklenti kökeninde çalışan IndexedDB repository katmanını ve mesaj tabanlı service worker API'sini oluştur.
3. YouTube SPA navigasyonunu, değişen video elementini ve aktif izleme aralıklarını güvenilir biçimde izle.
4. Tamamlama, konu, süre, kanal, pişmanlık ve tercih skorlarını saf/şeffaf fonksiyonlar olarak geliştir.
5. React dashboard, popup ve YouTube içi öneri panelini aynı tasarım sistemiyle uygula.
6. Dışa aktar, içe aktar, tümünü/tek kaydı sil ve takibi durdur kontrollerini gerçek veri katmanına bağla.
7. Vitest testleri, TypeScript kontrolü ve üretim buildi ile teslimatı doğrula.

## Hedef dosya ağacı

```text
public/manifest.json
src/
  analytics/       # saf ve test edilebilir hesaplamalar
  background/      # service worker ve mesaj API'si
  content/         # YouTube takipçisi, SPA gözlemcisi, panel
  dashboard/       # analiz sayfaları ve ortak dashboard bileşenleri
  popup/           # hızlı ayarlar
  storage/         # IndexedDB ve repository katmanı
  shared/          # tipler, sabitler, yardımcılar, mesaj sözleşmesi
  styles/          # ortak tasarım sistemi
tests/             # analitik ve depolama-dışı birim testleri
```
