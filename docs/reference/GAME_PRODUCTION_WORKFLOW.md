# Forge ile oyun üretim akışı

İlk teslimi, oyuncunun bir hedefe ulaştığı ve sonucu gördüğü tek bir oynanabilir
kesit olarak tanımla. GDD, hedef kareler, oyun kuralları ve kabul kayıtları oyun
deposunda tutulur. Forge, sahneyi düzenleme, içerik doğrulama, WebGPU ölçümü ve
üretim build'i için ortak araçları sağlar. Oyun kodu `@forge/sdk` kullanır.

## 1. Brief ve oynanabilir taslak

- Oyuncu hedefini, başlangıç ve sonuç akışını, yeniden denemeyi, kamerayı ve
  giriş aygıtlarını yaz. HUD, menü, yükleme, sonuç ve oyuncunun duyacağı ses
  olaylarını ilk brief'e ekle.
- Hedef cihazı, tarayıcıyı, çözünürlüğü ve kalite profilini belirt. Kare süresi,
  ilk yükleme ve oynanış için kabul ölçütlerini ilk ölçümden önce yaz.
- Yeni oyun projesi için `npm run create-project` kullan. Dünya taslağı
  gerekiyorsa `worldbuilder` içerik paketini seç ve `world:random` ile üret.
  Kaydedilen `.worldbrief.json` aynı taslağı `world:brief` ile yeniden kurar.
  Üretilen sahneyi geliştirirken aktörleri editörden veya `forge edit` ile
  düzenle. Brief'ten yeniden üretimi, elle düzenlenen seviyenin bir kopyasında yap.
- Basit geometriyle başlangıçtan sonuca giden akışı, başarısızlığı ve yeniden
  denemeyi oynanabilir hâle getir. İlk insan testi bu aşamada başlar. Aynı
  rotayı yeniden çalıştırabilmek için girişleri, varsa tohumu ve kontrol
  noktalarını oyun projesinde kaydet.

## 2. Görünüm ve asset kabulü

1. Oyun kamerasından az sayıda hedef kare seç. Her karede beklenen ışık yönünü,
   renkleri, görüş mesafesini ve okunması gereken nesneleri yaz. Karşılaştırma
   pozları arasına rotanın okunması en zor bölümünü de ekle.
2. Taslak sahnede ışığı, sisi ve pozlamayı ayarla. Aynı kamera, çözünürlük,
   kalite profili ve dünya durumuyla tam boy kareler çek. Hedef kareyle yan
   yana aç, en büyük farkı yaz, onu düzelt ve aynı pozu yeniden çek. Mümkünse
   karşılaştırmayı sahneyi düzenleyen kişiden veya ajandan ayrı biri incelesin.
3. İçerik üretimine her asset ailesinden bir örnekle başla. Ölçek, yön, pivot,
   UV, materyal ve çarpışmayı oyun sahnesinde kontrol et. Hareketli parçalarda
   adları, hiyerarşiyi ve klipleri hem kaynakta hem optimize edilmiş GLB'de
   karşılaştır. Görsel kabulü seviyenin ışığında, oynama mesafesinde yap.
4. Kaynak dosyayı, üretim veya lisans kaydını ve oyun çıktısını ilişkilendir.
   İkili asset'in `.meta.json` kaydında tür, kaynak ve lisans bulunur. Bir
   üretim sağlayıcısı deneniyorsa kullanılan sürümü, iş kimliğini, tekrarları
   ve düzeltme süresini yaz. İlk örneğin kabulünden sonra seri üretime geç.

`forge stats` sahne maliyetindeki farkları teşhis etmeye yardımcı olur.
`smoke:render` başlıklı Chrome'da gerçek WebGPU ile motorun referans pozlarını
çeker. Oyuna özgü hedef kareleri ve rotayı oyun projesinin çekimlerinde tut.

Motor deposundan örnek proje ve seviye denetimi

```powershell
npm.cmd run forge -- check --project "C:\Games\MyGame"
npm.cmd run forge -- stats --project "C:\Games\MyGame" --level content/levels/main --json
```

## 3. Doğrulama ve teslim

| Kontrol | Kaydedilecek kanıt |
| --- | --- |
| Oyun akışı | Gerçek arayüz üzerinden başlama, sonuç ve yeniden deneme. Varsa duraklatma ve kontrol noktası. İnsanın oynadığı rota ve bulguları. |
| Görüntü ve ses | Aynı pozda tam boy hedef ve oyun kareleri, en büyük açık fark ve rotadaki okunabilirlik sorunları. Oyuncu olaylarının sesleri gerçek oynanışta dinlenir. |
| Yükleme | Soğuk ve sıcak açılışta hazır olma süresi ile ana iş parçacığının en uzun bloklanması. Açık dünya kesitinde hücre geçişindeki sıçramalar da kaydedilir. |
| Performans | Gerçek WebGPU, aynı donanım ve profilde tekrarlı rota. Medyan ve p95 kare süresi, rota üzerindeki en kötü nokta ve mümkünse CPU/GPU ayrımı. Karşılaştırma için sabitlenmiş bir build. Ölçüm sırasında başka GPU işi çalıştırma. |
| Proje ve yayın | `forge check` ile SDK ve derleme sözleşmesi. `check:projects`, kayıtlı projelerde asset denetimi ve başsız açılışı da kapsar. Üretim çıktısında `verify:dist --strict` ve hedef URL'de gerçek oyun akışı. Forge'daki `smoke:dist` alt dizin sözleşmesini starter üzerinden doğrular. |

Her teslim için oyun build'i veya commit'i, Forge/SDK sürümü, seviye ve rota,
tarayıcı ve GPU, profil ve çözünürlük, kabul ölçütü, sonuç, kanıt yolu ve açık
bulguları tek kayıtta tut. Oynanış otomasyonu, insan testi ve WebGPU ölçümü
kendi sonuçlarıyla kayda girer. Komutların tam kullanımı ve motor değişiklikleri
için kapsamlı doğrulamanın ne zaman gerektiği [CLAUDE.md](../../CLAUDE.md)
dosyasındadır.

## İlk uygulama

Önce bir Forge referans sahnesinde tek rota, sabit kamera pozları ve bir asset
ailesiyle görsel karşılaştırma ve ölçüm kaydını dene. Oyun runtime kapısı
geçildiğinde aynı kayıt düzenini, ana plandaki Ridgebound pilot kopyasının bir
oynanabilir kesitinde kullan. İlk adım sahne üretimini ve ölçümü, ikinci adım
oyuncu akışını doğrular.

Pilotun runtime önkoşulları [Forge yeniden inşa planında](../planned/FORGE_WEBGPU_REBUILD_PLAN.md#faz-6--oyun-runtimeı-ve-araçlar)
yer alır. Bu akışın çıkış noktası yerel `docs/scenario-threejs-game-world`
incelemesindeki `references/production-order.md` ve `references/testing.md`
belgeleridir.
