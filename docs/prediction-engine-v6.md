# Tahmin motoru v6

6 Eylül 2026. `demirtubetahminmotoruanaliz.md` bulguları mevcut kodla karşılaştırılarak uygulandı.

## Davranış değişiklikleri

- Oturumsuz içe aktarılmış veya eski özetler yeniden hesaplamada korunur. Eksik tahmin fotoğrafı artık veri göçü gerekçesi değildir. Önceden silinmiş izleme verisi bu değişiklikle geri getirilemez.
- Yeni tahmin fotoğrafı yalnızca ilk aktif oturumun ilk 15 saniyesinde oluşturulur; mevcut kayıtların tahminleri sonradan doldurulmaz. Eski fotoğraflar silinmez, ancak tarihi ilk izleme anından sonraysa kalibrasyonda ve doğruluk karnesinde kullanılmaz. Yeni fotoğraflar kökenini ve kalibrasyon öncesi ham tahmini taşır.
- Eğitim ve canlı tamamlanma tahmini aynı `completion-features.ts` hesabını kullanır: kanal, tüm eşleşen konuların birleşimi, süre, format ve ayrı başlık kelimesi kanıtı. Birden fazla ortak konu aynı videoyu çoğaltmaz.
- Ortalama ve etkin örnek miktarı birlikte 45 günlük sönüm kullanır. İçe aktarılmış ilerleme göstergesi yarım örnek ağırlığındadır; bu katsayı sezgisel bir veri kalitesi öncülüdür, deneysel olarak doğrulanmış değildir.
- Başlık ağırlığı artık format ağırlığına eklenmez. Adayın konu hafızası yalnızca o anda bilinen geçmişten oluşturulur; izleme sayfasına özgü açıklama ve altyazı tamamlanma girdisine eklenmez.
- Sinyal güvenilirliği, yalnızca önceki tahminlerde ilgili grubun tamamlanma ortalamasının kişisel tabana göre hata azalmasından hesaplanır. `0.5`, tabana karşı kazanım olmadığını belirtir. Az örnekte güvenilirlik öncüle çekilir.
- Ağırlık öğrenimi ilk %70 üzerinde yapılır; son %30 ayrı ölçülür. O sırada henüz sonuçlanmamış veya sonradan yeniden izlenmiş özetler önceki tahminlere giremez. Öğrenme sınırından sonra sonuçlanan eğitim etiketleri ağırlık aramasından dışlanır. Küçük test dilimi eğitim verisiyle değiştirilmez.
- En yeni 400 kayıt ilk görülme sırasıyla seçilir; eğitim, canlı kanıt ve kalibrasyon aynı sınırı kullanır. Kanıt matrisi ağırlık aramasından önce hazırlanır.
- Arayüzdeki tamamlanma değeri, backtestte kullanılan kalibrasyonlu hesapla üretilir. Test sonucuna bakılarak sonradan uygulanan ve ayrıca ölçülmeyen tabana harmanlama kaldırıldı; tabanı geçememe açıklaması korunur.
- `±` payı artık MAE'nin sezgisel çarpanı değildir. En az 10 test hatası varsa %80 hedefli ampirik mutlak hata yüzdeliği gösterilir. Bu bir kapsama garantisi değildir; gerçek kapsama ayrıca raporlanır.

## Tekrar çalıştırılabilir değerlendirme

`npm run eval:model` üç deterministik sentetik senaryo üretir: süre örüntüsü, sinyallerden bağımsız gürültü, izleme tercihlerinin yön değiştirmesi. Eğitim sınırları %40, %60 ve %80'dir; her sınırdan sonraki %20 test edilir. Test dilimleri çakışmaz. Her tahminde yalnızca önceki sonuçlar kullanılır; test ilerledikçe geçmiş genişler, ağırlıklar o dilimde sabit kalır.

`--input` bir DemirTube JSON dışa aktarımı veya `VideoRecord[]` kabul eder. `--output` rapor yoludur. Hesap cihazda çalışır; girdi veya rapor dış servise gönderilmez. JSON raporu yalnızca toplu metrikleri içerir, video başlıklarını veya kimliklerini içermez. Metrikler: eğitim/test MAE, medyan hata, işaretli hata, taban MAE, beceri, ±10/±20 isabet, tahmin kovalarındaki ortalama sapmanın ağırlıklı mutlak değeri, aralık kapsamı ve eğitim/test farkı.

Kapsama ölçümündeki aralık her örnekten önceki kesinleşmiş hatalardan hesaplanır. Test hata yüzdeliği ise sonraki canlı tahminin payını sağlar. Az örnekte eksik metrikler başarı gibi yorumlanmamalıdır.

6 Eylül sentetik koşusunun [JSON raporu](model-evaluation-synthetic.json) depoda saklandı. Süre örüntüsünde test MAE değerleri 10,5 / 8,1 / 7,1 puan; kişisel ortalama tabanı yaklaşık 38 puandır. Gürültü senaryosunda beceri yaklaşık sıfırdır. Tercih değişiminde bir dilimde beceri negatiftir (-0,041), değişimin başladığı dilimde aralık kapsaması %50'ye iner. Bu sonuçlar hem öğrenilen örüntüyü hem de değişen alışkanlıklarda kalan sınırı gösterir; eski sürüme veya gerçek kullanıcı verisine karşı karşılaştırma değildir.

## Sınırlar ve uyumluluk

Tamamlanma tahmini, videonun açıldığı koşuldaki izleme oranını öğrenir. Uygunluk puanı hâlâ ayrı bir sezgisel sıralamadır; kalibre edilmiş tıklama veya memnuniyet olasılığı değildir. Açılmamış gösterimler otomatik olarak olumsuz eğitim etiketi yapılmadı. Yeni model ailesi, bağlamsal sinyaller ve kişisel veriye dayalı hiperparametre ayarı bu değişikliğe dahil değildir.

Geçmiş dışa aktarımları her andaki metadata/etiket sürümünü içermez. Bu nedenle sonradan yapılmış kullanıcı konu/format düzeltmeleri için eksiksiz tarihsel yeniden oynatma mümkün değildir. Yeniden izlenen kayıtlarda son durum bilinmeden önce örnek dışlanır; bu koruma kullanılabilir test sayısını düşürebilir.

Yeni fotoğraf alanları isteğe bağlıdır; IndexedDB şeması veya dışa aktarım sürümü değişmedi. Yeni izin, ağ çağrısı veya ML bağımlılığı eklenmedi. Eklentiyi kullanmak için üretim derlemesinden sonra Chrome'da mevcut eklentiyi yeniden yüklemek gerekir.
