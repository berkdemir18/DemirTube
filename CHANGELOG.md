# Değişiklik günlüğü

## Yayınlanmamış

### Eklenenler

- Bulut yedeklemeye ikinci sağlayıcı olarak **Firebase** eklendi ve varsayılan seçim yapıldı: Firebase Auth (e-posta/şifre) ile giriş, yedek gövdesi Realtime Database'de `backups/<uid>` düğümünde tek JSON metni. Cloud Storage elendi çünkü Firebase, Ekim 2024'ten sonra açılan projelerde Storage için ücretli Blaze planı istiyor; Firestore elendi çünkü belge sınırı 1 MiB ve tek kullanıcının geçmişi bunu birkaç ayda aşıyor. Gövde ağaç yerine metin olarak yazılıyor: Realtime Database boş dizileri ve null alanları saklamıyor, dizileri nesneye çeviriyor. Senkron 15 dakikada bir çalıştığı için önce yalnızca künye düğümü okunuyor; uzak sürüm bu cihazın yazdığıysa gövde indirilmiyor, yerel içerik değişmediyse yüklenmiyor (Spark planının aylık 10 GB indirme kotası aksi halde tükenirdi). Kurallar `firebase/database.rules.json` içinde; her hesap yalnızca kendi düğümüne erişir. Bulut katmanı sağlayıcı arayüzüne ayrıldı (`src/cloud/provider.ts`), birleştirme/zamanlama/durum mantığı iki sağlayıcıda ortak kaldı, Ayarlar kartına sağlayıcı seçici geldi. Sağlayıcı alanı olmadan kaydedilmiş eski yapılandırmalar Supabase olarak okunmaya devam eder.
- Yerel veritabanı eklentinin kontrolü dışında sıfırlandığında (tarayıcı site verisi temizliği, eklentinin kaldırılıp yeniden yüklenmesi, leveldb bozulması) dashboard'ın sessizce bomboş açılması yerine kalıcı bir kayıp uyarısı gösteren veri kaybı dedektörü eklendi. Kayıt sayısı, IndexedDB silindiğinde ayakta kalan `chrome.storage.local` içinde en yüksek gördüğü değer olarak tutulur; kayıptan sonra izlenen ilk video bu kanıtı ezmez. Uyarı yedeği içe aktarmaya yönlendirir, kasıtlı silme ve video silme sonrasında ise çıkmaz.
- Dashboard'a adres tabanlı yönlendirme eklendi: seçili sayfa, dönem ve tarih çıpası `#/channels?period=week&at=2026-07-28` biçiminde adrese yazılır; yenilemede aynı ekran açılır, tarayıcı geri/ileri tuşları çalışır ve bir ekranın bağlantısı paylaşılabilir.
- İzleme Geçmişi'ndeki filtrelenmiş sonuçlar artık JSON'un yanında CSV olarak da indirilebilir.
- Ayarlar'daki Groq kartına, anahtarın cihazda şifrelenmeden saklandığını açıklayan ve Groq tarafından iptal bağlantısı veren gizlilik notu eklendi.
- Tüm dönemsel analizlere önceki dönem karşılaştırma şeridi; aktif süre, video sayısı, tamamlama ve Shorts payı deltaları eklendi.
- YouTube paneline oynatma koşulunu açıklayan canlı sayaç durumu ve altyazı kategorilerini izlenen/atlanan/tekrar izlenen aralıklarla birleştiren dikkat haritası eklendi.
- Dashboard'a oturum geçişlerini görselleştiren İzleme Yolculuğu ve cihazda saklanan düzenlenebilir Kişisel Hedefler ekranları eklendi.
- Kanal karar kartları, haftalık anomali içgörüleri ve İstatistikler kartlarından ham yerel kanıta geçiş eklendi.
- Video paneline “Bu videodan ne beklemelisin?” kartı, tıklanabilir önemli altyazı anları ve kullanıcı tarafından doğrulanabilen ayrıntılı video formatı seçimi eklendi.
- Video formatı taksonomisine ders, kurs, canlı kodlama, ekran demosu, vaka analizi, derin analiz, liste, soru-cevap, tartışma, panel, video deneme, hikâye, kutu açılımı, ilk bakış, walkthrough, derleme, kamera arkası, webinar, ASMR ve canlı performans biçimleri eklendi.
- Kişisel adaptif modele kanal, konu, süre ve başlığın yanında beşinci sinyal olarak video formatı eklendi; model ağırlık kartı format güvenilirliğini de gösterir.
- Canlı yayın tespiti YouTube oynatıcı yanıtı, yayın mikroformatı ve DOM rozetleriyle güçlendirildi; prömiyerden canlı yayına geçiş açık sayfada otomatik algılanır.
- Canlı yayınlar artık klasik tamamlanma formülleri yerine aktif izleme süresi, yeniden açma, geri sarma ve açık geri bildirim sinyalleriyle ayrı Pişmanlık/Sarılma analizi alır.

### Düzeltilenler

- Shorts kayıtlarının %91'inde başlık olarak videonun adı değil sayfadaki alakasız metinler saklanıyordu: yorum butonunun etiketi ("Yorumlar 1,4 B") veya sekme başlığı ("YouTube"). Sebep, Shorts başlığını arayan seçici zincirinin sonundaki `h2` yakalayıcısıydı; reel içindeki ilk `h2` çoğu zaman yorum başlığı oluyordu. Başlık artık oynatıcı künyesinden okunuyor, DOM seçicileri daraltıldı ve başlık olarak kullanılamayacak metinler eleniyor. Kanalın yanında başlık da okunamadığında oEmbed yedeği devreye giriyor.
- Shorts kayıtlarının %81'inde süre 0 saklanıyordu. `<video>` öğesi metadata yüklenmeden sorulduğunda süre gelmiyor, yedek olarak yazılan `window.ytInitialPlayerResponse` okuması ise izole içerik dünyasından hiçbir zaman görünmüyordu. Süre artık MAIN dünyadaki köprüden gelen oynatıcı künyesiyle tamamlanıyor.
- Süresi okunamamış kayıtlarda tamamlanma oranı zorunlu olarak 0 hesaplanıyor ve bu kayıtlar tercih istatistiklerine "hiç bitirilmemiş" olarak giriyordu. Bozuk Shorts kayıtları geçmişin yarısına yaklaştığında kişisel taban gerçekte %41 iken %22 görünüyordu. Ölçülemeyen kayıtlar artık puanlama ve model öğreniminin dışında.
- Kişisel uygunluk puanı, kullanıcının kendi izleme alışkanlığı ne olursa olsun sabit %50 tamamlanmaya çapalıydı. Uzun video izleyen birinde gerçek taban %25–40 olduğu için en sevilen konu bile 50'nin altına düşüyor, tüm puanlar 10–30 bandına sıkışıyordu: gerçek bir geçmişte medyan puan 17, dörtte üçü 43'ün altındaydı. Kalibrasyon artık ağırlıklı olarak kişisel tabana göre yapılıyor (aynı geçmişte medyan 53, çeyrekler 36–64). Aynı sabit çapa kanal bağlılığının Bayesyen öncülünde de vardı; öncül artık kullanıcının kendi ortalaması.
- Bozuk başlıkla saklanmış eski kayıtlar arka planda oEmbed üzerinden onarılıyor ve başlık düzelince konuları yeniden sınıflandırılıyor; bu kayıtların neredeyse tamamı "Diğer" konusunda kalmıştı.
- Bulut yedekleme hiç yapılandırılmamışken periyodik senkron alarmının 15 dakikada bir "Bulut yedekleme yapılandırılmadı." tanılama kaydı yazması giderildi. 100 kayıtlık tanılama halkası bir günden kısa sürede doluyor, gerçek arka plan hataları (otomatik yedek, bildirim, senkron) daha okunmadan halkadan düşüyordu; senkron artık yapılandırma yoksa hiç denenmiyor.
- Haftalık rapor ve yerel yedek bildirimlerinin "Unable to download all specified images" hatasıyla düşmesi giderildi; ikon yolu artık `chrome.runtime.getURL` ile mutlak olarak veriliyor.
- Panelde "Puanlama yanıt vermedi" hatası giderildi. Kişisel model, geçmişteki her kayıt için tüm geçmişi yeniden tarıyordu (O(n²)); 600 videoda tek karar 18 sn, 2.000 videoda dakikalar sürüyor ve panelin 7 saniyelik isteği zaman aşımına uğruyordu. Amaç kuralları artık bir kez derleniyor, kayıt formatı ve başlık n-gram'ları önbelleğe alınıyor, güvenilirlik hesabı en yeni 400 kayıttan örnekleniyor ve kişisel model panel ile keşfet arasında paylaşılıyor: 2.000 videoluk geçmişte tek karar 9 sn'den 0,6 sn'ye indi.
- Panelin, istek başarısız olduğunda "Puanlama yanıt vermedi" başlığının yanında önceki denemeden kalan puanı göstermesi giderildi; hata durumunda puan halkası artık boş.
- Keşfet kartındaki rozet puanı ile videoyu açtıktan sonra yan panelde görünen puanın birbirini tutmaması giderildi. Kart yalnızca başlık, kanal ve süreyi görebiliyor; izleme sayfası ayrıca açıklama, hashtag, bölüm işaretleri ve altyazıyı okuyup farklı konu/format üretiyor, aynı formül iki farklı puan veriyordu. Puanlama artık her iki tarafta da bulunan ortak tabandan hesaplanıyor; açıklama ve altyazı analizi puanı değil yalnızca panelin İçerik sekmesini besliyor.
- Kanal adının kartta "Kanal Adı • 128 B görüntüleme • 2 gün önce" satırından, izleme sayfasında ise satır sonlu ham metinden okunması yüzünden aynı kanalın iki farklı isimle eşleşmemesi giderildi; kanal geçmişi sinyali kartta sessizce düşüyordu. Kart tarafındaki "Bilinmeyen Kanal" yazımı da izleme sayfasıyla aynı hale getirildi (eksik kanal onarımı artık bu kayıtları da görüyor).
- Groq GPT-OSS analizinde 420 tokenlık eski JSON Object Mode nedeniyle oluşan `failed_generation` hatası; 1.200 token bütçeli, düşük muhakemeli ve katı JSON Schema çıktısına geçirilerek giderildi.
- YouTube altyazı izi geç yayınlandığında analizin tek denemede vazgeçmesi giderildi; gecikmeli otomatik denemeler, Türkçe/insan altyazısı önceliği, alternatif track, JSON3/XML fallback zinciri ve sayfa CORS kısıtını aşan güvenli service-worker timedtext isteği eklendi.
- YouTube yan panelinin her 5 saniyede ağır öneri/karar analizlerini yeniden çalıştırarak kasması, altyazı güncellemesinde React kökünü söküp yeniden kurması ve hızlı aç/kapa işlemlerindeki ayar yarışları giderildi.
- Keşfet rozeti gözlemcisinin her YouTube DOM değişiminde ayar okuyup tüm kartları taraması engellendi; tarama yalnızca yeni video kartlarında ve seyrek güvenlik aralığında çalışıyor.
- YouTube SPA geçişlerinde izole içerik script'inden görülemeyen altyazı izleri, güncel oynatıcı yanıtını okuyan güvenli MAIN-world köprüsüyle düzeltildi; görünür transkript, sayfa kaynağı ve JSON3/XML yedekleri korunuyor.
- Altyazı anahtarı açıkken “Yerel standart” analiz modunun altyazı okuyucusunu sessizce devre dışı bırakması giderildi; altyazı ayarı artık analiz modundan bağımsız çalışıyor.
- Kişisel uygunluk puanlarının nötr aralıkta birbirine yaklaşması, kişisel tabana göre örneklem duyarlı kalibrasyon ve izleme amacı için sınırlı ek düzeltmeyle giderildi.
- Başlık veya açıklamasında “canlı yayın” geçen normal videoların ve YouTube SPA geçişinde önceki videodan kalan gizli canlı rozetlerinin canlı yayın olarak sınıflandırılması engellendi.
- Opera Video Popout veya standart Picture-in-Picture penceresinde oynatılan YouTube videoları, başka sekmeye geçildiğinde artık aktif izleme süresine ve ilerlemeye dahil edilir. Normal gizli sekme oynatmaları sayılmaya devam etmez.
- JSON yedekleri artık kişisel listenin aktif ve arşivlenmiş kayıtlarını birlikte taşır. Birleştir içe aktarması daha yeni kayıtları korur; yerine koy içe aktarması eski listeleri temizler.
- “Bu cihazdaki verileri sil” işlemi aktif ve arşiv kişisel listeleri birlikte temizler; dashboard işlemi önce geri döndürülemez silme onayı ister.
- Dar ekranda kapalı sidebar artık ekran okuyucu ve klavye odağından çıkar.
- Klavye odağı artık her etkileşimli öğede görünür; ana düğmeler ve sidebar navigasyonundaki `outline:none` kuralları geri alındı.
- Recharts grafiklerinin eksen ve tick metinleri ekran okuyucuya bağlamsız sayı yığını olarak okunuyordu; grafikler dekoratif işaretlendi, verisi yalnızca grafikte olanlara görsel gizli metin özeti eklendi.

### Değişenler

- İçerik betiği ikiye ayrıldı: her YouTube sayfasına yüklenen çekirdek 347 KB'den 94 KB'ye indi. React panel, dock ve erken çıkış istemi artık yalnızca watch/shorts rotasına girildiğinde `chrome.scripting` ile enjekte ediliyor (yeni `scripting` izni). Ana sayfa, arama ve kanal sayfalarında React hiç yüklenmiyor.
- Hiç kullanılmayan Tailwind bağımlılığı kaldırıldı; dashboard CSS paketi 111 KB'den 97 KB'ye indi.
- `global.css` (463 satırda 65 KB minified) formatlanıp kaynak sırası birebir korunarak beş katman dosyasına bölündü: `01-base`, `02-features`, `03-premium`, `04-aurora`, `05-focus`. Karşılığı olmayan 15 ölü kural silindi.
- `Dashboard.tsx` yalnızca kabuk oldu; veri erişimi `hooks/useAppData`, adres durumu `hooks/useHashRoute`, 19 dallı sayfa seçimi ise `pages.tsx` içindeki sayfa haritasına taşındı.
- Panelin 819 satırlık Shadow DOM stili `content/panel-css.ts` dosyasına ayrıldı; `recommendation-panel.tsx` 1520 satırdan 700 satıra indi.
- Groq derin analizi artık video açılışında otomatik çalışmaz; yalnızca kullanıcı paneldeki düğmeye bastığında istek gönderir.
- Dashboard sayfaları ilk açılış paketinden ayrıldı; ziyaret edilmeyen analiz ekranları gerektiğinde yüklenir.
- README, 0.10.0 sürümü, takvim ayı dönemi, otomatik yedek ve ntfy bildirim izinleriyle güncellendi.

## 0.10.0 — 2026-07-28

### Eklenenler

- **Aurora v3 tasarım katmanı**: Sidebar revize (gradient yüzey, aktif glow pill, hover kaydırma), topbar gelişmiş cam (blur 24px), metrik kartları büyütüldü (44px ikon, 34px sayı), surface daha belirgin cam, dashboard-pulse güçlendirildi, tablo/toggle/buton iyileştirmeleri, sayfa geçiş animasyonu (fade+slide+blur).
- **Zaman navigasyonu (DateNav)**: Topbar'a gün/hafta/ay bazında ileri-geri gezinme + doğrudan takvim seçimi. Günlük: input type=date ile istenen gün; haftalık: etiket; aylık: input type=month. "Bugün/Bu ay/Bu hafta" sıfırlama butonu.

### Değişenler

- Aylık dönem artık "son 30 gün" değil **takvim ayı** (1'inden sonuna kadar). Tüm istatistik sayfalarında tutarlı.
- Grafik (watchTrend) aylık görünümde gün gün kovalara dönüştü (28-31 bölmeli).
- Dönem değiştirince anchor bugüne sıfırlanır. Dönem içi navigasyon anchor'ı korur.
- `period.ts`: `periodStart`, `periodEnd`, `periodDateLabel` anchor'ı takvim ayı mantığıyla çalışır. Testler güncellendi.

### Testler

- `tests/period-anchor.test.ts`: Anchor gün/ay filtreleme, periodEnd gelecek kırpma, month label, weekTrend day 5 test.
- `tests/analytics.test.ts`: Month beklentisi "son 30 gün → takvim ayı" olarak güncellendi (Temmuz 2026: 3→2).

## 0.9.1 — 2026-07-28

### Eklenenler

- **"Değdi mi?" bitiş kartı**: Video sona erdiğinde player üzerinde tek dokunuş 👍/👎 geri bildirimi; kişisel model çok daha hızlı öğrenir. 12 saniyede kendini gizler.
- **Veri seviyesi kartı**: Genel Bakış'ta toplam video sayısına göre 6 kademeli seviye (Isınma Turu → Ruh İkizi), seviye içi ilerleme çubuğu ve sonraki seviyeye kalan.
- **Kanal çeşitliliği kartı**: Dönem içindeki farklı kanal sayısı ve en baskın kanalın süre payı; tek kanala gömülünce uyaran etiket.
- **"Geçen ay bugün" nostalji kartı**: İzleme Takvimi'nde bir ay önceki aynı günün süre/video/top konu özeti.
- **Polish v3 tasarım katmanı**: Daha okunaklı muted tonları, sıcak nebula arka plan dokunuşu, temalı ince scrollbar, metrik kartlarında üst ışık çizgisi, daha yumuşak buton basımı, zarif boş durumlar, duo kart ve nostalji kartı stilleri.

### Testler

- `tests/polish-features.test.ts`: Veri seviyesi eşik/ilerleme, nostalji hesabı ve kanal çeşitliliği için 7 test.

## 0.9.0 — 2026-07-27

### Eklenenler

- **Açılabilir HUD**: Tam ekran/tiyatro mini göstergesine (🧠 pill) tıklayınca detay kartı açılır — karar, uyum skoru, tahmini tamamlama, kanal güveni, günlük bütçe çubuğu ve "Listeme ekle" düğmesi. Kart açıkken otomatik gizlenme duraklar.
- **Alt+D kısayolu**: Paneli her YouTube sayfasında açıp kapatır (chrome.commands; `chrome://extensions/shortcuts` sayfasından değiştirilebilir).
- **İstek önbelleği**: Panelin 5 saniyedeki ağır analiz istekleri 30 saniyelik TTL önbelleğinden döner; veri yazımında önbellek temizlenir.
- **"✓ İzledin" feed rozeti**: Daha önce izlenen video keşfette tekrar çıkarsa "✓ 12 gün önce izledin · %85" rozeti görünür.
- **Kanal karnesi**: Kanal sayfalarında başlık altında "X video izledin · %Y tamamlama · pişmanlık durumu · toplam süre" kartı.
- **Kapsül sayfası**: Dashboard'da aylık özet (süre, tamamlama, en uzun gün, top konu/kanal, hazırlık süresi, aylık kıyas) + Yıllık Wrapped (toplam süre, yılın konuları/kanalları, maraton günü, en çok tekrar, en saran video).
- **"Hazırlık" konu kategorisi**: YBS, mühendislik bölümleri, üniversite/kampüs/ders içerikleri otomatik sınıflandırılır; haftalık raporda öğrenme süresine dahil edilir, Kapsül'de ayrı izlenir.
- **Watchlist arşivi**: Listeden kaldırılan videolar silinmek yerine arşive taşınır; Kişisel Listem sayfasında kanal/konu istatistikleri ve son kaldırılanlar görünür. 7+ gün bekleyen videolara "⏳ bayat" rozeti.
- **CSV dışa aktarımı**: Ayarlar → Yerel veriler bölümünden Excel uyumlu (noktalı virgül + UTF-8 BOM) video tablosu indirme.
- **Otomatik yedek**: Ayar açıkken JSON yedeği periyodik olarak İndirilenler/DemirTube klasörüne sessizce indirilir (isteğe bağlı downloads izni).
- **ntfy.sh telefon bildirimi**: Ayarlar'dan konu adı girilince haftalık rapor telefona ücretsiz push olarak düşer; test düğmesi var.
- **Obsidian'a aktar**: Ayarlar'dan tek tıkla günün özetini Markdown satırı olarak panoya kopyalama veya .md indirme.

### Değişenler

- **Panel okunabilirliği**: YouTube içi panelin tüm yazı ve sayı boyutları büyütüldü (9–13px → 10.5–16px), düşük kontrastlı gri tonları açıldı (#94a3b8 → #aebbd0 / #d3dde9).
- **Dropdown düzeltmesi**: Dashboard'daki native select açılır listeleri koyu temada okunamaz durumdaydı; option arka plan/yazı renkleri sabitlendi.
- Sürüm `package.json`, `APP_VERSION` ve manifest'te 0.9.0 olarak hizalandı.

### Düzeltilenler

- Haftalık rapor ve ntfy push'u Chrome bildirim ayarına bağlıydı; ayar kapalıysa rapor hiç üretilmiyordu. Artık rapor her hafta üretilir, ntfy push'u konu adı varsa bağımsız gönderilir.

### Testler

- `tests/capsule-and-export.test.ts`: CSV kaçışı/biçimi, günlük not satırı, aylık kapsül ve yıllık wrapped hesapları için 8 test.

## 0.8.4 — 2026-07-27

### Düzeltilenler

- `player-overlay.ts`: HUD şablonunda React `className` niteliği kullanılması — tam ekran/tiyatro mini göstergesi hiç stil almıyordu. Ayrıca sponsor/intro atlama butonu `innerHTML` yerine güvenli DOM düğümleriyle kuruluyor.
- `player-overlay.ts`: `mousemove` dinleyicisi `unmountPlayerOverlay()` içinde kaldırılmıyordu — her video geçişinde bir dinleyici birikiyordu (bellek sızıntısı).
- `search-filter-bar.ts`: Filtre uygulama ve yeniden deneme zamanlayıcıları temizlenmiyordu; watch sayfalarında uygun konteyner bulunamadığı için her gezinmede yeni bir sonsuz `setInterval` oluşuyordu. Zamanlayıcılar tekilleştirildi, bar DOM'dan kalkınca kendini temizliyor, yeniden denemeler 10 tur ile sınırlı.
- `feed-decorator.ts`: Keşfet kartı detay popover'ında video başlığı ve açıklama metni `innerHTML`'e kaçışsız basılıyordu (XSS riski) — tüm popover artık `textContent` tabanlı güvenli düğümlerle kuruluyor; kanal güven ve küçük resim rozetleri de aynı desene çekildi.
- `feed-decorator.ts`: Keşfet kartlarından gönderilen metadata'da `topics` hep boştu — rozet skorlarında konu sinyali tamamen devre dışıydı ve küçük resim "Öne Çıkanlar" katmanı hiç görünmüyordu. Kart başlığı/kanalı artık `classifyTopics()` ile sınıflandırılıyor.
- `decision-assistant.ts`: Serbest izleme ("open") modunda `learningRatio` hesabı filtre içindeki video yerine mevcut videonun `valueType`'ını okuyordu — geçmiş dağılımı hiç etki etmiyordu. Artık geçmiş videoların konularından gerçek öğrenme oranı hesaplanıyor (regresyon testleri eklendi).
- `service-worker.ts`: `GET_VIDEO_CONTEXT` kanal video sayısı için tüm video tablosunu belleğe çekiyordu — `by-channel` index'i kullanılıyor (`videoRepository.byChannel`).
- `personal-model.ts`: Başlık sinyali güvenilirliği için her video çiftinde `analyzeVideoIntelligence()` yeniden çalışıyordu (O(n²)); her model türetiminde video başına tek hesap yapılacak şekilde önbelleğe alındı.
- Sürüm tutarsızlığı giderildi: `package.json`, `APP_VERSION` ve manifest 0.8.2'de kalmıştı, 0.8.4 olarak hizalandı.

### Eklenenler

- `tests/decision-assistant.test.ts`: Serbest izleme amaç uyumu için 3 regresyon testi (öğrenme/eğlence geçmişi dağılımı ve boş geçmiş).

## 0.8.3 — 2026-07-27

### Eklenenler

- **Kişisel model öğreniyor**: `personal-model.ts` artık `predictionSnapshot` verisi olan videolarda gerçek tahmin hatasını ölçen `outcomeReliability()` fonksiyonu kullanıyor. Model izledikçe sinyal ağırlıklarını (kanal, konu, süre, başlık) gerçek tamamlama sapmasına göre kalibre ediyor.
- **Model nesil sayacı**: Her 10 sonuç snapshot'unda model bir nesil ilerliyor; Akıllı Merkez'de ve panelde gösteriliyor.
- **Kişisel model ağırlık kartı**: Akıllı Merkez sayfasına `ModelWeightsCard` bileşeni eklendi — dört sinyalin ağırlıkları ve güvenilirlik yüzdeleri renkli çubuklarla gösteriliyor.
- **Panel sinyal çubukları**: YouTube içi panelde uygunluk skoru altında kanal/konu/süre/başlık sinyalleri ayrı çubuklarla görünür hale geldi.
- **Model güven chip'i**: Panel uygunluk bölümünde model güveni (düşük/orta/yüksek) ve nesil etiketi gösteriliyor.
- **Bütçe kısıtlama kaldırıldı**: İzleme bütçesi dolduğunda `skip` tavsiyesi verilmesi kaldırıldı; bütçe yalnızca bilgilendirme amaçlı kalıyor.

### Düzeltilenler

- `decision-assistant.ts`: Kalan bütçe sıfır olduğunda `timeFit=0` hesaplanıp yanlış "Listeye al" / "Temkinli ol" tavsiyesi verilmesi.
- `recommendation-panel.tsx`: `WATCHLIST_TOGGLE` yanıtı `null` döndüğünde `response.saved` erişiminin çökmesi; `Array.isArray` guard eklendi.
- `personal-model.ts`: `analyzeVideoIntelligence()` boş `history` argümanıyla çağrılması — başlık pattern güvenilirliği her zaman düşük kalıyordu.
- `preference-score.ts`: Yeni bir kanalda "Kişisel sinyal < 2" erken dönüşün çok agresif tetiklenmesi; kanal bilinmediğinde ağırlık topic'e aktarılarak puan üretiliyor.
- `Overview.tsx`: Boş `videos` dizisinde `completionRate / 0` hesabı korumasız bırakılmıştı.

### Değişenler

- `personal-model.ts` sürümü `adaptive-v1` → `adaptive-v2`; `outcomeAccuracy`, `adaptationGeneration`, `calibratedAt` alanları eklendi.
- `preference-score.ts`: `estimatedCompletion` artık model ağırlıklı hesaplanıyor; `signals` alanı döndürülüyor (panel çubuk grafik için).
- `Overview.tsx` JSX'i bakım kolaylığı için ayrı bileşenlere parçalandı.
- `global.css`: Hover animasyonları ve `model-weights-card` stilleri eklendi.

## 0.7.3 — 2026-07-27


### Düzeltilenler

- Canlı YouTube ana sayfasında kullanılan gerçek `ytLockupMetadataViewModelTitle` ve ilişkili camelCase metadata sınıfları desteklenir.
- Başlık bağlantılarında `title` niteliği bulunmadığında da kartlar tanınır.
- Popup artık yüklü sürümü ve keşfet analizinin kaç kartta çalıştığını gösterir.

## 0.7.2 — 2026-07-27

### Düzeltilenler

- Güncel `yt-lockup-view-model` keşfet/ana sayfa kartlarının analiz taramasına alınmaması.
- Rozetin başlık satırının taşma alanına eklenerek görünmeden kırpılması.
- YouTube sürekli DOM güncellerken taramanın devamlı ertelenmesi; tarama artık throttle ve periyodik güvenlik kontrolü kullanır.
- İç içe eski/yeni kart kapsayıcılarında aynı görünümün iki kez işaretlenmesi.

## 0.7.1 — 2026-07-27

### Düzeltilenler

- Groq model doğrulama adresinde `/` karakterinin `%2F` yapılması nedeniyle GPT-OSS 20B ve 120B modellerinin bulunamaması.
- Model yolu artık Groq'un beklediği `models/openai/gpt-oss-*` biçiminde gönderilir.

## 0.7.0 — 2026-07-27

### Eklenenler

- Gemini kullanmadan, isteğe bağlı Groq GPT-OSS 120B/20B derin video analizi.
- Ayarlarda API anahtarı bağlama, bağlantı testi, model seçimi ve güvenli kaldırma.
- YouTube panelinde Türkçe özet, önemli noktalar, değer değerlendirmesi, öneri, risk ve güven etiketi.
- İçerik parmak izine bağlı sonuç önbelleği; değişmeyen video için gereksiz tekrar istek yok.

### Gizlilik ve dayanıklılık

- Groq izni yalnızca kullanıcı bağlantıyı başlatınca istenir.
- API anahtarı export ve Supabase yedeğinin dışında, yalnızca yerel uzantı deposunda tutulur.
- Ham altyazı, izleme geçmişi, kişisel davranış puanları ve geri bildirim Groq'a gönderilmez.
- Kota, ağ veya model hatasında yerel gelişmiş analiz kesintisiz çalışmaya devam eder.

## 0.6.0 — 2026-07-27

### Eklenenler

- Erişilebilir YouTube altyazısından ham metni saklamadan anahtar kavram, bilgi yoğunluğu, tekrar ve önemli an analizi.
- Başlık vaadi ile altyazı kapsamını karşılaştıran içerik tutarlılığı sonucu.
- Kanal, konu, süre ve başlık ağırlıklarını geçmiş sonuçlara göre yeniden kalibre eden adaptif kişisel model.
- YouTube ana sayfa, arama ve öneri kartlarında açılmadan önce uyum, amaç veya başlık riski rozeti.
- Öğrenme, araştırma, eğlence, gezinme ve Shorts döngüsü oturum sınıflandırması.
- Akıllı Merkez içinde bilgi haritası, doğal dil geçmiş araması, yeniden izleme önerileri ve tahmin doğruluğu.
- Ayarlarda yerel standart/gelişmiş analiz modu, altyazı zekâsı ve feed rozeti kontrolleri.

### Gizlilik

- Ham altyazı saklanmaz; yalnızca türetilmiş sayısal ve kısa açıklanabilir içgöriler tutulur.
- Harici LLM, telemetri, uzak JavaScript veya yeni Chrome izni eklenmedi.
- Gelişmiş mod da tamamen yerel çalışır. Supabase yalnızca kullanıcı tarafından etkinleştirilen yedek yolu olarak kalır.

### Uyumluluk

- Yeni video ve ayar alanları güvenli varsayılanlı ve opsiyoneldir; IndexedDB şeması ile export v2 değişmedi.
- Eski videoların ön tahmin alanları dashboard ilk açıldığında mevcut ham oturumlardan geriye uyumlu biçimde oluşturulur.

## 0.5.0 — 2026-07-27

### Eklenenler

- Başlık, açıklama, hashtag, kanal, süre, içerik türü ve bölüm yapısını birlikte yorumlayan yerel video zekâsı.
- Öğretici, inceleme, karşılaştırma, haber, yorum, röportaj, belgesel ve eğlence amacı sınıflandırması.
- Değer türü, içerik derinliği, odak yükü, zamana duyarlılık ve başlık taktiği açıklamaları.
- Geçmişteki benzer videoları bulup tamamlama ve pişmanlık davranışıyla izleme tavsiyesi üretme.
- İzleme bittikten sonra tahmin ile gerçek davranışı karşılaştıran sonuç değerlendirmesi.
- Dashboard'da otonom güçlü format, başlık riski ve öğrenme/eğlence dengesi içgörüleri.

### Değişenler

- Konu ve özel konu kuralları artık yalnızca başlığa değil açıklama ve hashtaglere de bakar.
- Kişisel uygunluk için veri az olsa bile video yapısının ön analizi gösterilir.

### Gizlilik ve uyumluluk

- Analiz tamamen cihazda ve deterministik çalışır; harici AI servisi, telemetri veya yeni Chrome izni eklenmedi.
- Yeni metadata alanları opsiyoneldir. IndexedDB şeması ve export sürümü değişmedi; eski kayıtlar çalışmaya devam eder.

## 0.4.0 — 2026-07-27

### Eklenenler

- Belirsiz konu, içerik türü, clickbait ve beğeni kayıtları için öncelikli Geri Bildirim Merkezi.
- Shorts’a özel süre, adet, ortalama izleme, tamamlama, Sarılma, pişmanlık ve saat dağılımı.
- `/shorts/{id}` SPA rotalarında gerçek oynatma takibi ve video kimliği çıkarımı.
- Kanal, konu, süre, başlık ve içerik türü geçmişiyle açıklanan “neden seçtin?” analizi.
- Son 13 haftayı günlük yoğunluk ve video ayrıntısıyla gösteren İzleme Takvimi.
- Konu, kanal ve içerik türü karşılaştırma ekranı.
- Shorts süresi, pişmanlık oranı, bilinçli seçim ve konu değişimlerini önceki haftayla kıyaslayan rapor kartları.
- Ortak düşük/orta/yüksek veri güvenilirliği modeli.
- JSON dosyasını kendiliğinden yazmadan, kullanıcı izniyle çalışan yerel yedek hatırlatması.
- Gizlilik, yerel depolama ve veri olgunluğunu anlatan üç adımlı onboarding.

### Düzeltilenler

- Dashboard veri isteği başarısız olduğunda sonsuz yükleme yerine açıklayıcı hata ve tekrar deneme ekranı.
- Çok sayıda menü öğesinde sidebar taşması.
- Onboarding, yeni analiz sayfaları ve mobil menü için responsive yerleşim sorunları.
- Haftalık dönem başlangıcı ve önceki hafta aralığının birbiriyle örtüşmesi.
- Playwright testinde runtime `console.error` ve yakalanmamış sayfa hatalarının gözden kaçması.

### Gizlilik

- Yeni özelliklerin tamamı deterministik ve yereldir; yeni host izni, telemetri veya uzak servis eklenmedi.
- Yerel yedek hatırlatması mevcut isteğe bağlı `notifications` iznini yalnızca kullanıcı açtığında ister.

### Migrasyon notları

- IndexedDB şeması değişmedi. Yeni ayarlar eski kayıtlarda güvenli varsayılanlarla tamamlanır.
- Eski haftalık rapor alanları opsiyonel kaldığından kayıtlar yeniden üretim gerektirmeden açılır.

### Bilinen sınırlamalar

- Chrome güvenlik modeli nedeniyle bir uzantı kullanıcının seçmediği klasöre sessiz ve sürekli dosya yazamaz; yerel yedek özelliği zamanında hatırlatıp kullanıcı eylemiyle JSON indirir.
- Az örnekli karşılaştırmalar düşük güven olarak işaretlenir ve kesin tercih iddiasında bulunmaz.

## 0.3.0 — 2026-07-27

### Eklenenler

- YouTube ana sayfa, arama, kanal, oynatma listesi ve Shorts dahil tüm YouTube rotalarında güvenli SPA yaşam döngüsü; izleme yalnızca geçerli `/watch?v=…` rotasında başlar.
- Aynı video elementi değiştiğinde yeni oturum açmadan yeniden bağlanma; gerçek video kimliği değişince önceki oturumu kapatma.
- Toplam aktif süre, benzersiz izlenen süre, tekrar izleme süresi ve oturumlar arası birleştirilmiş oynatma aralıkları.
- Benzersiz izleme tabanlı tamamlanma; tekrar izlemeler tamamlanma oranını şişirmez.
- Beğendim/beğenmedim, clickbait/clickbait değil, kazara tıklama, analiz dışı bırakma, manuel konu ve içerik türü geri bildirimleri.
- Erken çıkış nedenleri ve kapatılabilir YouTube içi soru.
- Açıklanabilir 0–100 Pişmanlık ve Sarılma puanları; etkenler ile güven seviyesi.
- İzleme ısı haritası, zaman analizi, içerik türü performansı ve haftalık rapor.
- Tek kelime yanında iki/üç kelimelik başlık cümlecikleri; özel başlık ve konu kuralları.
- Veri Sağlığı/Tanılama ekranı ve güvenli onarım eylemleri.
- Doğrulamalı export v2, v1 içe aktarma uyumluluğu, birleştir/değiştir önizlemesi.
- 16, 32, 48 ve 128 piksel Chrome ikonları.

### Değişenler

- IndexedDB şeması v2’ye yükseltildi; eski video ve oturum kayıtları korunur ve yeni özetler ham oturumlardan tekrar hesaplanır.
- İçerik script eşleşmesi `https://www.youtube.com/*` olarak genişletildi; ek zorunlu site izni eklenmedi.
- Bulut yedeği export v2 veri modelini birleştirir. Supabase erişimi hâlâ tamamen isteğe bağlıdır.

### Düzeltilenler

- Ana sayfa veya arama gibi bir rotadan SPA ile videoya geçildiğinde içerik script’inin hiç yüklenmemesi.
- Aynı video elementinin yeniden oluşturulmasında mükerrer oturum açılması.
- Tekrar izlenen bölümlerin tamamlanma oranını %100’e kadar yapay biçimde yükseltmesi.
- Uzantı güncellendikten sonra eski içerik script’inin `React is not defined` ve `Extension context invalidated` hatalarını sürekli üretmesi; yeni betik IIFE içinde React runtime’ını taşır ve geçersiz bağlamda kendini güvenli kapatır.

### Gizlilik

- Telemetri, uzak kod, harici AI API’si, geçmiş, çerez, kamera ve mikrofon izni eklenmedi.
- Supabase alan adı izni isteğe bağlı kalır.
- `notifications` izni yalnızca kullanıcı haftalık bildirimi açtığında Chrome tarafından sorulur.

### Migrasyon notları

- IndexedDB v1 kayıtları yerinde korunur; v2 mağaza ve indeksleri monotonic upgrade içinde eklenir.
- Eski video özetleri ilk veri okumasında ham oturumlardan yeni benzersiz/tekrar izleme metrikleriyle yeniden kurulur.
- Export v1 dosyaları ve eski v1 Supabase yedekleri v2 modeline birleştirilir.

### Bilinen sınırlamalar

- YouTube metadata DOM’u değiştiğinde kanal adı geçici olarak bilinmeyebilir; oEmbed onarımı sonraki dashboard açılışında denenir.
- İçerik türü tespiti sezgiseldir; kullanıcı geçmiş ayrıntısından düzeltebilir.
- Tarayıcı çökmesinden hemen önceki en fazla beş saniyelik oynatma, son kontrol noktasına ulaşmamış olabilir.

### Doğrulama

- TypeScript strict denetimi.
- 29 birim/jsdom/migrasyon regresyon testi.
- Üretim build’i.
- Paketlenmiş MV3 uzantısını Chromium’a yükleyen, dashboard’u açan ve sahte YouTube watch rotasında içerik panelini doğrulayan Playwright smoke testi.
