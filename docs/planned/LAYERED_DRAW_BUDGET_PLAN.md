# Katmanlı çizim bütçesi planı (Faz 5c R9c)

**Sürüm:** v0.4 · 2026-11-19 — Adım 5 kapandı. S12 kararıyla üretimde mevcut `auto` ve S1 kullanılır.

**Önceki sürüm:** v0.3 · 2026-11-18 — Adım 2 ve Adım 3 donanım doğrulaması ve kullanıcı
görsel onayıyla kapandı. Adım 3 aynı zamanda R9b’nin yeni Z6 kabulünü tamamladı.

Bu belge ana plandan ayrıdır (kullanıcı kararı 2026-11-18; `CLAUDE.md`'deki "tek ana plan"
kuralının istisnası). Ana planda ([FORGE_WEBGPU_REBUILD_PLAN.md](FORGE_WEBGPU_REBUILD_PLAN.md))
yalnız R9c satırı, bu belgeye bağlantı ve §11 satırları durur. Adım kapanınca ilerleme bu
belgenin §10'una, kısa satırı ana planın §11'ine yazılır; mimari karar çıkarsa mimari rapor
§4.4'e. Çelişkide mimari rapor geçerlidir.

## 1. Amaç

Draw call'u (CPU gönderimi) ve GPU işini katman katman düşürmek. Örnek senaryo bir şehir:
çok bina, iç mekânlı binalar, sokak eşyası, dağınık küçük nesne, ağaç, park etmiş araç.

Bizdeki maliyet modeli (R6–R9b ölçümleri):

- **Draw ≈ görünürdeki benzersiz (model × materyal slotu) batch × görünüm sayısı.** Görünüm =
  ana kamera + gölge kaskatları (`high` 3, `ultra` 4) + varsa kamera görünümleri (yansıma).
  Nesne sayısı draw'ı belirlemez; R8.1 slot birleştirmesinden beri model başına draw = slot sayısı.
- CPU gönderimi draw başına (~8 µs, Faz 1 S4; three r187 düğüm materyalli render nesnesini her
  karede tazeler, bundle bunu çözmüyor, R3). GPU yolu batch × görünüm başına üç dispatch
  (~50 µs gönderim / batch, R9.0).
- GPU işi köşe (görünür örnek × üçgen, her görünümde) ve piksel. Instanced batch'in sınır küresi
  bütün örneklerini kapsar: level'a yayılmış batch frustum'da da, gölge kamerasında da hiç
  ayıklanmaz; köşe işi bütün örnekler için her görünümde sürer. GPU yolu örnek başına ayıklar.

Hedef: şehir sahnesinin her pozunda görünüm başına draw ve GPU süresini ölçüyle düşürmek,
açık dünya referans level'larında (Derekavak, Island, WbPilotValley, OpenWorldTest) gerileme
olmadan. G6 (Derekavak P2) R10 / F7'de ölçülür; bu plan ona girdi verir, onu değiştirmez.

## 2. Katmanlar

| Katman | Hangi nesneler | Mekanizma | Başlangıç durumu | İlgili adım |
|---|---|---|---|---|
| Batch + slot birleştirme (zemin) | Hepsi | Aynı model + slot materyali tek batch; slot başına tek geometri (R8.1) | Var; `instanced` / `gpu` / `auto` yol seçimi (R9, S1: > 5.000 üçgenli parça GPU yolu) | Farklı materyallerin atlası (kayıplı) yok — adım 6 |
| Otomatik LOD (zemin) | GPU yolundaki statikler, foliage | Ekran hatasıyla ayrık LOD (R7) | Yalnız GPU yoluna giden batch'lerde | Instanced hafif batch'lerde LOD yok (kasıtlı, S1) |
| 1. HLOD | Uzak bina kabukları, büyük yapılar | Hücre yüklü değilken proxy; 4 × 4 küme katmanı; görüş ötesinde landmark (R8) | Var, kabul edildi. Proxy gölge düşürmez | `hlodIncludesPlacement` yalnız küçükleri dışlar (yarıçap × 200 ≤ `loadRange`; 384 m'de yarıçap ≤ 1,92 m). İç duvar, döşeme, büyük mobilya pişer: dışarıdan görünmeyen üçgen — adım 3 (d) |
| 2. World Partition | Direk, sokak eşyası, bütün hücreli statikler | Hücre ızgarası, `loadRange` içinde yüklü (5b) | Level başına tek ızgara, tek `loadRange` | Boyut sınıfı menzilleri yok — adım 6, ölçüme göre |
| 3. Cull distance (detay) | Küçük nesneler | Yarıçap × 200 (× kalite), %80'den dither solma (`detailCulling.ts`) | GPU yolu örnek başına ayıklar. Instanced'da batch ancak **bütün** örnekleri uzaktaysa düşer (`detailBatchCulled`); şehre yayılmış batch hiç düşmez, shader'da solar, köşe işi sürer | Adım 5 |
| 4. Gölge | Gölge düşüren her şey | Her kaskat ayrı görünüm; GPU yolunda gölge görünümü ana kameranın mesafesiyle ayıklar | Her gölge düşüren her kaskatta çizilir; kaskatlar iç içe (uzak kaskat yakını da kapsar). Küçük nesnenin uzak kaskattaki gölgesi texel'in altında | Adım 2: muhtemelen en büyük ve en genel kaldıraç |
| 5. İç mekân | Oda içeriği | Bölge + portal görünürlüğü (R9b) | Z6 görsel kabulü **geçmedi** (§7). Kamera bölge dışındayken her şey çizilir; bellekten boşaltma yok | Adım 3 (a, b, d), adım 4 (c) |
| 6. Foliage | Ağaç, çalı, ot | GPU güdümlü, uzakta billboard (R4, F1–F3) | Halka F1'de (başka oturum, çalışıyor) | Gölge payı: adım 2'nin kuralı foliage batch'lerine de uygulanır, ölçümde ayrı sütun |

## 3. Sıra (kullanıcı onayı, 2026-11-18)

| # | İş | Bağımlılık |
|---|---|---|
| 1 | Sentetik şehir sahnesi + görünüm başına draw / GPU / gönderim ölçümü (§4) | — |
| 2 | Boyuta göre gölge cull distance (§5.2) | 1 (önce / sonra) |
| 3 | Bölge düzeltmeleri (a) atama, (b) dış düğüm, (d) HLOD'dan çıkarma (§5.3) | 1 |
| 4 | Bina akışı (c): iç mekânın bellekten boşaltılması (§5.4) | 3 |
| 5 | Küçük, çok yerleşimli statikler için örnek başına cull (§5.5) | 1, 2 |
| 6 | Ölçüme göre: WP boyut sınıfı menzilleri, materyal birleştirme / atlas (§5.6) | 1–5 |

Hafif içerikle karar verilmez (R9.0 dersi): her adımın kararı şehir sahnesinin ölçümüyle verilir,
referans level'lar yalnız gerileme denetimidir.

## 4. Şehir test sahnesi (adım 1)

`tools/scenes/indoorScene.ts` kalıbı: saf, deterministik üreteç (I/O yok) + level yazan ince
araç + `measure` betiği. Sahne depo dışı referans projesinin `.forge-cache/` altındaki kopyasına
yazılır (`measure:streaming` gibi; referans projesine yazılmaz).

### 4.1 Boyutlar ve içerik (öneri; parametreli)

| Öğe | Varsayılan | Not |
|---|---|---|
| Alan | 768 × 768 m, düz zemin (terrain yok) | `cellSize` 128, `loadRange` 384, `viewDistance` 1.500 |
| Sokak ızgarası | 8 × 8 blok, blok 80 × 80 m, sokak 16 m (yol 10 + iki kaldırım 3) | Ortadaki blok meydan (boş, çeşme, bank, ağaç) |
| Binalar | 63 blok × 4 = 252 bina, taban 18–36 m, yükseklik 8–40 m | 12 arketip, arketip başına 5 slot (cephe, cam, çatı, süs, kapı); 1–2 kule `landmark` (120 m) |
| İç mekânlı binalar | ~%10 (26 bina), zemin kat 3 × 3 oda, oda 6 m | Duvar / döşeme / tavan şekil (`indoorScene` gibi); dış kapı 1, pencere oda başına 0–2 (portal adayı); 2 bina tavansız avlulu; 2 bina iki katlı (S16) |
| İç mekân eşyası | Oda başına 12, 15 arketip model, 1–2 slot | Ağır kip (`--heavy`): eşyanın yarısı 36,5 bin üçgen (R9a O5 gibi) |
| Sokak eşyası | Lamba 24 m'de bir (~1.150), bank ve çöp 48 m'de bir (~575 + 575), yangın musluğu ~300, trafik lambası kavşak × 4 (~324), otobüs durağı ~60 | 6 arketip, 1–3 slot |
| Küçük nesne | ~20.000 (şişe, kutu, taş, tabela, baba), yarıçap 0,1–0,5 m | Kaldırıma ve iç mekâna dağınık: "yayılmış batch" sorunu görünür olsun |
| Ağaç | Kaldırımda 12 m'de bir (~2.300) + meydan | Statik mesh (gövde + taç, 2 slot), 3 arketip; R7 LOD'u |
| Araç | ~400 park etmiş, 4 arketip, 4 slot (gövde, cam, lastik, far) | Draw yükü için |

Toplam ~30.000 yerleşim, ~125 benzersiz (model × slot) batch: `high`'da 4 görünümle görünüm
başına yüz civarı, toplamda ~500 draw beklenir (tahmin; ölçüm verecek).

**Modeller (S15):** üreteç, yerleşimlerle birlikte deterministik prosedürel GLB'ler de yazar
(kutu / silindir ilkelleri, arketip başına slot ve hedef üçgen sayısı: bina kabuğu 2–8 bin, eşya
200–2.000, küçük 50–300, ağaç 1.500, araç 3.000). Asset'ler yalnız ölçüm kopyasında
(`assetMeta` ile); motor içeriğine ya da paketlere girmez. Kenney / Quaternius yok.

### 4.2 Pozlar

| Poz | Yer | Ne ölçülür |
|---|---|---|
| `street` | Göz 1,7 m, uzun cadde boyunca | Yayılmış küçük nesne, gölge kaskatları, detay cull |
| `square` | Meydan ortası, landmark kuleye doğru | Açık alan, çok bina, HLOD geçişi |
| `inside` | Bölgeli binanın orta odası | Bölge görünürlüğü, dış düğüm |
| `threshold` | Dış kapı eşiği, içeri bakış | İç + dış birlikte, kapı eşiği kuralı |
| `facade` | Sokaktan 15 m'den iç mekânlı binanın cephesine | Dış portal (pencere) üzerinden iç mekân; (b)'nin kabulü |
| `high` | 120 m yükseklik, 30° aşağı | HLOD kümeleri, landmark, uzak kaskat |
| `walk` (yol) | Sokak → bina içi → sokak, sabit hızla | Adım 4: yükleme / boşaltma, en uzun kare, p99, bellek |

### 4.3 Metrikler

Her poz × kalite (`high`, `ultra`) × yol (`auto`, gerekirse `instanced` / `gpu`), 1080p, DPR 1,
başlıklı gerçek WebGPU, kare döngüsü duraklatılıp 60 Hz adımlı (R9.0 düzeneği):

- **Draw, görünüm başına:** ana, kaskat 1..n, kamera görünümleri; ayrıca toplam. Bugünkü sayaç
  (`renderer.info` + `gpuDriven.lastDraws`) toplamı verir. Ölçüm sayfası (yalnız test tarafı)
  `renderer.backend.draw`'ı sarıp çağrıyı render nesnesinin kamerasına göre kovalar; dolaylı
  çizimler de oradan geçer. three iç API'sine dayanır, yalnız ölçümde.
- Gönderim (`pipeline.render` + overlay duvar süresi), kare CPU, GPU (timestamp), compute
  dispatch sayısı.
- Çizilen üçgen (GPU yolu geri okuması + `renderer.info`), görünür örnek.
- Gölge: gölge düşüren batch / örnek, kaskat başına. GPU'da gölge payı için gölgeli / gölgesiz A/B.
- Bölge: kamera bölgesi, görünür bölge, gizli batch, portal testi (bütçe aşımı dahil).
- Bellek: `renderer.info.memory` (geometri, doku), JS heap, model cache kullanımı, yüklü iç mekân.
- Yol (`walk`): en uzun kare, p99, iç mekân yükleme süresi.

Kayıt `render-refs/runs/<stamp>-city.json`. Kapıda ve CI'da değil.

### 4.4 Modüller ve kapı

- `tools/scenes/cityScene.ts` (saf: yerleşimler, model tanımları, pozlar, sayımlar),
  `tools/scenes/cityModels.ts` (saf: arketip → GLB baytları, gltf-transform),
  `tools/bench-city-level.ts` (level + asset'leri yazar; ardından `forge hlod` ve `forge zones`),
  `tests/smoke/cityMeasure.config.ts` + `city.measure.ts`, `package.json`'da `measure:city`,
  `CLAUDE.md` komut tablosuna satır.
- Kapı: üretecin odaklı testleri (aynı tohum aynı baytlar, sayımlar, bina / sokak çakışması yok,
  iç mekânlı binada `generateZones` beklenen oda / portal sayısı); bir kez gerçek WebGPU koşusu,
  kayıt ve sonuç tablosu bu belgede. Görsel kabul yok (ölçüm sahnesi).
- **Codex (X):** `cityScene.ts` ve `cityModels.ts`. İmza:
  `cityScene(options?: CitySceneOptions): CityScene` (`actors`, `models: CityModelSpec[]`,
  `poses`, `bounds`, `counts`), `cityModelGlb(spec: CityModelSpec): Uint8Array`. Kabul: iki
  koşu aynı bayt; `counts` §4.1 varsayılanlarında ±%2; her `CityModelSpec`'in slot ve üçgen
  sayısı GLB'de birebir; iç mekânlı bina `zoneGeneration` ile 9 oda (tek katlı) verir.

## 5. Adımlar

Her adımda iki arka uç: WebGPU (kabul) ve WebGL2 ikizi (`cpuDrivenBatch` aynı kuralı CPU'da;
instanced yol iki arka uçta aynı). SDK yüzeyi bu planın hiçbir adımında değişmiyor (şemalar ve
kalite profili SDK'da değil); oyun koduna API açılırsa (portal aç / kapa, bina yükleme olayı)
snapshot + changelog aynı commit'te.

### 5.1 Adım 1 — Şehir sahnesi ve ölçüm

§4. Çıktı: bugünkü durumun tablosu (her poz, görünüm başına draw ve GPU, gölge payı). Adım 2–6'nın
öncesi bu tablodur.

18 Kasım 2026 temel ölçümü [ham JSON kaydı](../reference/measurements/2026-11-18T12-56-43-343Z-city.json) ile
`2cd3878` commit’inde alındı. Chrome 157.0.8103.79, NVIDIA Ampere, donanım WebGPU,
1920 × 1080, DPR 1, `auto` yolu. Varsayılan sahnede 28.964 model yerleşimi, 234 oda,
312 portal ve 36 HLOD hücresi üretildi. Her poz ve gölge ayarı için 60 kare ısınma
sonrası 300 kare örneklendi. GPU süreleri ortalamadır. Gölge farkı, açık ve kapalı
koşulların ortalamaları arasındaki farktır. Çizim çağrıları gölgeler açıkken
alınan bir tanılama karesinden gelir.

| Profil | Poz | Ana görünüm | Gölge kaskatları (1–4) | Diğer | Toplam | Gölgeli GPU (ms) | Gölgesiz GPU (ms) | Gölge farkı (ms) |
|---|---|---:|---|---:|---:|---:|---:|---:|
| high | `street` | 358 | 126 / 245 / 495 | 1 | 1225 | 3,39 | 1,31 | 2,09 |
| high | `square` | 156 | 102 / 102 / 288 | 1 | 649 | 4,51 | 1,53 | 2,99 |
| high | `inside` | 125 | 145 / 145 / 145 | 1 | 561 | 4,39 | 1,55 | 2,85 |
| high | `threshold` | 281 | 296 / 296 / 364 | 1 | 1238 | 4,80 | 1,69 | 3,11 |
| high | `facade` | 338 | 208 / 296 / 332 | 1 | 1175 | 4,59 | 1,58 | 3,01 |
| high | `high` | 163 | 101 / 101 / 134 | 1 | 500 | 4,24 | 1,58 | 2,66 |
| ultra | `street` | 387 | 124 / 126 / 354 / 548 | 1 | 1540 | 4,23 | 1,33 | 2,90 |
| ultra | `square` | 185 | 102 / 102 / 143 / 421 | 1 | 954 | 5,37 | 1,47 | 3,89 |
| ultra | `inside` | 125 | 145 / 145 / 145 / 145 | 1 | 706 | 5,27 | 1,53 | 3,74 |
| ultra | `threshold` | 281 | 296 / 296 / 297 / 474 | 1 | 1645 | 5,79 | 1,69 | 4,10 |
| ultra | `facade` | 338 | 193 / 296 / 297 / 419 | 1 | 1544 | 5,68 | 1,59 | 4,09 |
| ultra | `high` | 163 | 101 / 101 / 110 / 158 | 1 | 634 | 5,22 | 1,60 | 3,62 |

Sokak → bina → sokak yürüyüşünde tarayıcı kare aralığı `high` ve `ultra` için
sırasıyla p99’da 50,2 ve 50,2 ms, en uzun karede 66,7 ve 66,6 ms oldu.

### 5.2 Adım 2 — Boyuta göre gölge cull distance

**Durum:** Kapalı. Yerel donanım WebGPU doğrulaması ve kullanıcı görsel kabulü
18 Kasım 2026’da tamamlandı.

**Tasarım.** Bir nesnenin kaskat k'ya gölge düşürmesi için dünya yarıçapı, o kaskadın texel
boyunun belli bir katından büyük olmalı (texel kuralı, öneri; S9):

`casts(k) ⇔ r ≥ τ · t_k`,  `t_k = kaskat k'nın genişliği / mapSize`,  τ ≈ 2 texel (ölçümle).

`sunCascades.ts`'in referans hesabıyla (tahmin; çalışma anı three'nin `CSMShadowNode`'u):

| Profil | Bölmeler (m) | Texel (cm) | τ = 2'de en küçük gölge düşüren yarıçap (cm) |
|---|---|---|---|
| `high` (3 × 1024, 150 m) | 16,7 / 46,3 / 150 | 3,8 / 10,6 / 34,5 | 7,6 / 21 / 69 |
| `ultra` (4 × 2048, 200 m) | 15,5 / 35,7 / 77,4 / 200 | 1,8 / 4,1 / 8,9 / 23 | 3,6 / 8,2 / 18 / 46 |

Örnek (`high`): 0,3 m'lik çöp kutusu yalnız ilk iki kaskatta (46 m'ye kadar), lamba direği
(yarıçap ~1,5 m) her kaskatta. Kaskatlar iç içe olduğu için yakındaki küçük nesne uzak kaskatta
çizilmez; uzaktaki alıcı uzak kaskadı okuduğundan nesnenin gölgesi izinli son kaskadın
bölmesinde biter. Kalite profiliyle ilişki kendiliğinden: `shadowMapSize`, `shadowDistanceScale`
ve `shadowCascades` texel'i belirler, τ profil alanıdır (S9).

- **GPU yolu:** gölge görünümü başına uniform `minCasterRadius[view]` (gpuDriven gölge
  kamerasının frustum genişliğinden her kare yazar); cull'a `yarıçap × maxScale ≥ minCasterRadius`
  koşulu (görünüm 0 ve kamera görünümlerinde 0). Örnek başına kesin; foliage batch'leri dahil.
  İzinli son kaskadın bölmesine yakın solma (S10): `maskShadowNode`'da ana kamera mesafesiyle
  dither, bugünkü detay solmasının ikinci penceresi.
- **Instanced yol:** batch başına sınıf: `kmax` = batch yarıçapı × en büyük örnek ölçeğiyle
  izinli son kaskat (0 = CSM gölgesi yok). Görünür sınıflar 16–19, yalnız gölge veren bölge
  sınıfları 20–23. Sınıf 0 aynı iki kip için 24–25'i kullanır. Ana kamera görünür sınıfların
  tamamını, kaskat k ise her iki kipte `kmax ≥ k` olan sınıfları görür. Tek haritalı ışıklar
  boyut eşiği uygulamaz. Gizli bölgeler 15'te kalır. Sınıf, profil, kaskat genişliği veya
  batch'in en büyük ölçeği değişince yeniden hesaplanır.
- **Kapsam dışı (S11):** yakın kaskadın tamamen kapsadığı gölge düşürücüyü uzak kaskattan çıkarmak
  (gölge hacmi dışarı taşabilir; yanlış gizleme riski). Ölçümden sonra ayrı karar.

**Modüller:** `src/engine/world/shadowCasters.ts` (yeni, saf), `engine/world/instanceCulling.ts`
(görünüme `minCasterRadius`, CPU referansı), `render/gpu/gpuDrivenBatch.ts` (uniform, cull,
gölge solması), `render/gpu/gpuDriven.ts` (görünüm başına değer, sınıf katmanlarının kamera
maskesi), `render/gpu/cpuDrivenBatch.ts` (ikiz), `render/sync/instanceBatches.ts` (sınıf, katman),
`render/materials/detailFade.ts` (gölge penceresi), `engine/perf/qualityProfiles.ts` (τ alanı),
`render/sync/debugTags.ts` / `?debug` (kaskat başına gölge düşüren batch / örnek), `forge stats`
(`shadowDrawsPerCascade` kaskat başına sınıfla).

**Veri / şema:** kalite profiline bir alan (öneri `shadowCasterMinTexels`); bileşen şeması
değişmez. Nesne başına "gölgesi hep düşsün" geçersiz kılması S9'da soru.

**Editör:** World Settings > Shadows'ta τ'nın level geçersiz kılması yok (öneri: profilde kalır;
görsel ayar kullanıcıda, parametre açık). `?debug` satırları.

**Kapı:** saf testler; CPU referansı = GPU sayısı her kaskatta (`gpuCulling.smoke.ts`'e gölge
görünümleri); render smoke iki arka uçta; `measure:city` önce / sonra (`street`, `square`, `high`)
+ `measure:static-path` referans level'larda gerileme yok; kullanıcı görsel kabulü (sokak pozunda
kaskat sınırında gölge kesilmesi, gün batımı uzun gölgesi).

**Codex (X):** `shadowCasters.ts`:
`cascadeTexelSize(width: number, mapSize: number): number`,
`maxCasterCascade(radius: number, texels: readonly number[], minTexels: number): number` (0 = hiç,
k = 1..n), `casterLayerMask(cascade: number, classLayers: readonly number[]): number`. Kabul:
sınırda eşitlik dahil, NaN / 0 / negatif girişte 0, texel dizisi artan değilse hata; tablodaki
örnek değerler testte.

**Yerel doğrulama — 18 Kasım 2026.** `1076ea5`, yerel `main` geçmişinde doğrulandı.
Adım 2’nin ölçümleri yalıtılmış `1076ea5` çalışma ağacında, şehir referansı §5.1’deki
`2cd3878` kaydıyla ve statik yol kontrolleri `af16f21` ebeveyniyle karşılaştırılır.
İlk tam şehir koşusu donanım WebGPU ile 11 profil-poz çiftini ölçtü. `ultra / high`
açılırken 20 dakikalık test bütçesi doldu ve koşucu JSON yazamadı. Tam koşu bütçesi
30 dakikaya çıkarıldı.

- **Donanım WebGPU.** Beş odaklı dosyada 31 test geçti. Derekavak P2 smoke’unda ana
  görünüm ve kaskat sayımları CPU referansıyla uyuştu. İlk bundle görüntü karşılaştırması
  başarısız oldu. Tekrar koşusunda yeniden kurulum ve görüntü alımı boyunca sahne saati
  sabitlendi, mevcut piksel toleransıyla test geçti. Editörde gölgeleri kapatma görüntüyü
  1,490 ortalama piksel birimi değiştirdi, açınca fark sıfıra döndü.
  [Culling kaydı](../reference/measurements/2026-11-18T14-49-46-708Z-gpu-culling.json)
- **WebGL2.** CPU culling ikizi ve editörde gölge anahtarı testi geçti. Editörde kapatma
  farkı 1,491, yeniden açma farkı sıfırdı.
  [Culling kaydı](../reference/measurements/2026-11-18T14-44-03-032Z-gpu-culling-webgl.json)

**Şehir karşılaştırması.** Odaklı tekrar koşusunda istenen altı profil-poz çifti
aynı sahne, `auto` yolu, 1920 × 1080, DPR 1, 60 ısınma ve 300 ölçüm karesiyle kaydedildi.
Chrome 157.0.8103.79, NVIDIA GeForce RTX 3060 (Ampere), donanım WebGPU ve timestamp
sorguları. Rakamlar önce → sonra sırasındadır. GPU farkı, gölgeli eksi gölgesiz
ortalama süredir. Gölge kapalıyken kaskat geçişi ve kaskat draw’u sıfırdır.
[Referans JSON](../reference/measurements/2026-11-18T12-56-43-343Z-city.json)
[Adım 2 JSON](../reference/measurements/2026-11-18T14-56-13-740Z-city.json)

| Profil | Poz | Ana draw açık | Ana draw kapalı | Kaskat draw (1–4), önce → sonra | Toplam draw açık | Toplam draw kapalı |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| high | street | 358 → 358 | 358 → 358 | 126 / 245 / 495 → 126 / 245 / 404 | 1225 → 1134 | 359 → 359 |
| high | square | 156 → 156 | 156 → 156 | 102 / 102 / 288 → 102 / 102 / 270 | 649 → 631 | 157 → 157 |
| high | high | 163 → 163 | 163 → 163 | 101 / 101 / 134 → 101 / 101 / 134 | 500 → 500 | 164 → 164 |
| ultra | street | 387 → 387 | 387 → 387 | 124 / 126 / 354 / 548 → 124 / 126 / 354 / 548 | 1540 → 1540 | 388 → 388 |
| ultra | square | 185 → 185 | 185 → 185 | 102 / 102 / 143 / 421 → 102 / 102 / 143 / 421 | 954 → 954 | 186 → 186 |
| ultra | high | 163 → 163 | 163 → 163 | 101 / 101 / 110 / 158 → 101 / 101 / 110 / 158 | 634 → 634 | 164 → 164 |

| Profil | Poz | Render GPU açık / kapalı / fark (ms), önce → sonra | Compute GPU açık / kapalı / fark (ms), önce → sonra |
| --- | --- | --- | --- |
| high | street | 3,392 / 1,306 / 2,085 → 3,448 / 1,283 / 2,165 | 0,000 / 0,000 / 0,000 → 0,000 / 0,000 / 0,000 |
| high | square | 4,513 / 1,527 / 2,986 → 4,442 / 1,531 / 2,911 | 0,000 / 0,000 / 0,000 → 0,000 / 0,000 / 0,000 |
| high | high | 4,242 / 1,582 / 2,661 → 4,260 / 1,579 / 2,681 | 0,000 / 0,000 / 0,000 → 0,000 / 0,000 / 0,000 |
| ultra | street | 4,234 / 1,332 / 2,901 → 4,082 / 1,280 / 2,802 | 0,000 / 0,000 / 0,000 → 0,000 / 0,000 / 0,000 |
| ultra | square | 5,367 / 1,475 / 3,892 → 5,610 / 1,493 / 4,117 | 0,000 / 0,000 / 0,000 → 0,000 / 0,000 / 0,000 |
| ultra | high | 5,216 / 1,599 / 3,617 → 5,323 / 1,619 / 3,704 | 0,000 / 0,000 / 0,000 → 0,000 / 0,000 / 0,000 |

`high / street` K3’te 91 (%18,4), `high / square` K3’te 18 (%6,3) draw azaldı.
Altı ana görünümün draw sayısı aynı kaldı. Boş indirect komutları sayaca dahil
olabilir. Bu `auto` örneklerinde açık ve kapalı koşulda compute dispatch ve indirect
draw kaydedilmedi, dolayısıyla düşüş doğrudan draw’larda ölçüldü. Gölgeli render
süresi örnekler arasında −0,152 ile +0,243 ms değişti.

**Görünüm başına GPU render süresi.** §5.1 JSON’u yalnız toplam süre içeriyor.
Ana görünüm ve kaskat süreleri için `af16f21` ve `1076ea5` üzerinde ayrı birer
donanım WebGPU koşusunda, her koşulda 15 ısınma ve 30 ölçüm karesi kullanıldı.
Her poz yeni sayfada açıldı. Render timestamp’leri kameraya göre toplandı.
Gölge kapalı kaskat süresi 0 ms. Bu örneklerde compute dispatch olmadığı için
ana görünüm, kaskatlar ve diğer geçişlerin compute süresi 0 ms.
[Önceki geçiş süreleri](../reference/measurements/af16f21-city-pass-times.json)
[Adım 2 geçiş süreleri](../reference/measurements/1076ea5-city-pass-times.json)

| Profil | Poz | Ana render açık (ms) | Ana render kapalı (ms) | Kaskat render (ms), önce → sonra | Diğer render açık (ms) |
| --- | --- | ---: | ---: | --- | ---: |
| high | street | 1,669 → 1,654 | 1,520 → 1,466 | 0,623 / 0,636 / 0,717 → 0,599 / 0,616 / 0,686 | 0,035 → 0,037 |
| high | square | 1,802 → 1,726 | 1,724 → 1,684 | 0,944 / 0,979 / 0,985 → 0,918 / 0,924 / 0,963 | 0,039 → 0,042 |
| high | high | 1,877 → 1,898 | 1,800 → 1,813 | 0,883 / 0,893 / 0,915 → 0,885 / 0,885 / 0,904 | 0,031 → 0,035 |
| ultra | street | 1,728 → 1,719 | 1,525 → 1,536 | 0,592 / 0,614 / 0,644 / 0,765 → 0,623 / 0,629 / 0,673 / 0,793 | 0,033 → 0,039 |
| ultra | square | 1,811 → 1,798 | 1,684 → 1,715 | 0,937 / 0,920 / 0,944 / 1,051 → 0,887 / 0,880 / 0,907 / 0,992 | 0,037 → 0,028 |
| ultra | high | 1,935 → 1,962 | 1,802 → 1,811 | 0,850 / 0,841 / 0,883 / 0,976 → 0,889 / 0,856 / 0,880 / 0,950 | 0,042 → 0,033 |

**Referans sahneler.** `measure:static-path` dört sahne × üç yol için iki commit’te
de tamamlandı. İlk GPU yolu açılışındaki sayfa yenilemesini önlemek için Vite,
üçgen worker’ının kullandığı mevcut `meshoptimizer/simplifier` girişini önceden
hazırlıyor. İki kayıttaki çalışma ağacı değişikliği aynı Vite ayarıdır.
[Önceki kayıt](../reference/measurements/2026-11-18T15-10-58-511Z-static-path.json)
[Adım 2 kaydı](../reference/measurements/2026-11-18T15-09-22-362Z-static-path.json)

| Sahne / poz | Statik yol | Draw | Gönderim ort. (ms) | Kare CPU ort. (ms) | GPU render ort. (ms) | GPU render p95 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| derekavak / p2 | instanced | 119 → 119 | 1,393 → 1,317 | 2,984 → 2,763 | 3,526 → 3,112 | 5,112 → 5,112 |
| derekavak / p2 | gpu | 135 → 135 | 2,124 → 2,265 | 3,532 → 3,757 | 4,146 → 4,116 | 5,177 → 5,177 |
| derekavak / p2 | auto | 43 → 119 | 1,555 → 1,276 | 3,004 → 2,686 | 3,388 → 3,126 | 5,177 → 5,112 |
| wb-pilot / p1 | instanced | 68 → 51 | 1,194 → 1,189 | 2,158 → 2,138 | 3,800 → 3,826 | 4,850 → 4,784 |
| wb-pilot / p1 | gpu | 89 → 89 | 1,796 → 1,871 | 2,731 → 2,825 | 3,696 → 3,764 | 4,784 → 4,915 |
| wb-pilot / p1 | auto | 68 → 51 | 1,217 → 1,251 | 2,148 → 2,238 | 3,989 → 3,603 | 4,850 → 4,653 |
| island / p1 | instanced | 29 → 29 | 0,750 → 0,769 | 1,777 → 1,806 | 2,246 → 2,287 | 2,884 → 2,884 |
| island / p1 | gpu | 28 → 28 | 0,760 → 0,791 | 1,783 → 1,851 | 2,290 → 2,316 | 2,753 → 3,146 |
| island / p1 | auto | 28 → 28 | 0,762 → 0,750 | 1,782 → 1,755 | 2,267 → 2,264 | 2,753 → 3,015 |
| open-world / p1 | instanced | 3 → 3 | 0,325 → 0,322 | 0,633 → 0,615 | 1,325 → 1,293 | 1,507 → 1,573 |
| open-world / p1 | gpu | 3 → 3 | 0,329 → 0,339 | 0,631 → 0,635 | 1,315 → 1,268 | 1,573 → 1,507 |
| open-world / p1 | auto | 3 → 3 | 0,319 → 0,339 | 0,604 → 0,631 | 1,323 → 1,281 | 1,573 → 1,573 |

Varsayılan `auto` yolunda dört sahnenin GPU render ortalaması düştü. Island P1’de
GPU render p95, `auto` yolunda +0,262 ms ve `gpu` yolunda +0,393 ms ölçüldü.
Island tekrarında GPU render ortalaması `auto` için 2,243 → 2,182 ms,
`gpu` için 2,343 → 2,281 ms oldu. p95 farkı sırasıyla +0,065 ms ve −0,131 ms.
İlk ölçümdeki kuyruk gecikmesi artışı aynı büyüklükte tekrarlanmadı.
[Island önce](../reference/measurements/2026-11-18T15-18-45-397Z-static-path.json)
[Island sonra](../reference/measurements/2026-11-18T15-19-09-919Z-static-path.json)

Statik yol komutunun tek karelik draw sayacı, duraklatılmış sahnede bazı
geçişleri kaçırabildiğinden karşılaştırma GPU ve CPU sürelerine dayanıyor.

**Görsel inceleme.** Donanım WebGPU, `high`, 1080p. Sokak pozuna yalnız görsel
inceleme için turuncu bir koni, büyük bir küre ve ortam dolgu ışığı eklendi.
Koni, ölçülen K2/K3 eşiği arasındaki 0,320 m yarıçapıyla son olarak K2’ye gölge
düşürüyor. K2 sınırı 46,33 m, solma 39,38 m’de başlıyor. Aşağıdaki yakın
çekimlerde koninin zemindeki gölgesi karşılaştırılabilir.

- [Solma öncesi (37,52 m)](../reference/measurements/r9c-step2-visual/street-fade-before.png)
- [Solma bandı (43,31 m)](../reference/measurements/r9c-step2-visual/street-fade-within.png)
  ve [aynı kamera, boyut eşiği kapalı](../reference/measurements/r9c-step2-visual/street-fade-within-threshold-off.png)
- [Kaskat sınırının ötesi (47,48 m)](../reference/measurements/r9c-step2-visual/street-fade-beyond.png)
- [Öğle](../reference/measurements/r9c-step2-visual/street-day.png),
  [gün batımı, 17.33](../reference/measurements/r9c-step2-visual/street-sunset.png).
  Ağaç ve lamba gölgeleri kaldırım boyunca uzuyor. Bu kadrajda boyut eşiği
  açık ve kapalı gün batımı PNG’lerinin SHA-256 değerleri aynıydı.
  [Çekim parametreleri](../reference/measurements/r9c-step2-visual/street-visual.json)

Kullanıcı, sokak pozundaki kaskat solmasını ve gün batımı gölgelerini 18 Kasım 2026’da onayladı.

### 5.3 Adım 3 — Bölge düzeltmeleri (a, b, d)

**Durum:** Yerelde tamamlandı. Kullanıcı görselleri 18 Kasım 2026’da onayladı.
(a) için `zoneOfBox` instanced batch ve GPU örnek
yuvasına bağlı. (b) için dış kamera portal grafına `OUTSIDE` düğümünden giriyor.
Üretim S16 kararı uyarınca katları tek koşuda tarıyor. (d) için HLOD hücre ve
landmark proxy’lerinden bölgeye sığan yerleşimler çıkarılıyor. Kaynak hash’i
bölge ve portal yerleşimlerini içeriyor.

Tam sığma sınırı, döndürülmüş bölge, model yüklenince yeniden atama ve GPU
yoluna tam model kutusunun aktarılması odaklı testlerle doğrulandı.

Sentetik iç mekânda tekrar üretim 64 oda, 112 iç kapı ve 64 açık tavan portalı
için aynı baytları verdi. İki katlı sahnenin tek koşusu 0 ve 3 m zeminlerde dört
oda ve sekiz portal üretti. İki katta da dış kapı ve pencere, üst katta iki açık
tavan portalı oluştu. HLOD testinde sığan model ve şekil proxy’den çıkarıldı,
taşan model korundu ve bir portalın taşınması proxy’yi bayat olarak işaretledi.

Şehir üretimi 0 ve 3,2 m zeminlerde 234 + 18 oda buldu. 336 iç portal ve
338 dış portal oluştu. Dış portallar 26 kapı, 310 pencere ve iki avlu üst
açıklığından oluşuyor. Şehir üreteci sentetik bina kabuklarını ve bina
modellerini engel olarak kullanıyor. Ağaç ve sokak eşyalarının kutuları
önceki denemede sokakta dokuz sahte oda oluşturuyordu. Açık dış kapıyla
`threshold` pozunda içeri bakılabiliyor.

`zones.smoke.ts` donanım WebGPU ve WebGL2’de geçti. İç kapıdan iki oda
göründü. Dış pencereye dönünce bir oda görünür kaldı, açıklıklardan uzağa
bakınca görünür oda sayısı sıfıra indi. Editörde `Outside` etiketi ve üretimin
tek Undo davranışı iki arka uçta doğrulandı.
[Pencereden görülen oda (RTX 3060)](../reference/measurements/r9c-step3-visual/outside-through-window.png).

**Ağır iç mekân, WebGPU.** 768 adet 36.480 üçgenli örnek, `auto`, poz başına 120 kare.
Her yol tek batch kullandı. Bölge portal test sayısı en fazla 234/256 oldu, bütçe
aşımı görülmedi. Oda pozunda GPU ortalaması 0,405 ms arttı. Diğer üç değişim
−0,083 ile +0,032 ms arasında. Tek kare draw sayacı bazı pozlarda 13 ile 36
arasında değiştiği için bu kayıttan draw kazancı çıkarılmadı.
[Ham ölçüm](../reference/measurements/2026-11-18T16-18-27-868Z-zones.json).

| Poz | GPU ms, bölgesiz → bölgeli | CPU ms, bölgesiz → bölgeli | Görünür oda / 64 | Portal testi |
|---|---:|---:|---:|---:|
| `room` | 1,916 → 2,321 | 0,925 → 1,362 | 9 | 45 |
| `corridor` | 2,444 → 2,476 | 1,093 → 1,087 | 10 | 49 |
| `diagonal` | 2,091 → 2,076 | 0,809 → 0,884 | 6 | 36 |
| `above` | 1,808 → 1,725 | 0,750 → 0,938 | 24 | 234 |

**Şehir, RTX 3060 WebGPU.** `auto`, 1920 × 1080, DPR 1. Poz ve gölge ayarı başına
60 ısınma ve 300 örnek. `street` §5.2 ile, diğer pozlar §5.1 ile karşılaştırıldı.
§5.1 referansında dış kapı kanadı kapalıydı. Karşılaştırma açık kapıyı ve yeni
portal/HLOD üretimini de kapsıyor. GPU sütunu gölgeler açık/kapalı render
ortalamalarını veriyor. Bu koşuda indirect draw, compute dispatch ve compute
süresi sıfırdı.
[Şehir ölçümü ve görünüm sayaçları](../reference/measurements/2026-11-18T16-38-24-150Z-city.json).

| Profil | Poz | Ana draw, önce → sonra | Toplam draw, önce → sonra | GPU açık/kapalı ms, önce → sonra | Görünür oda / 252 | Portal testi / 256 |
|---|---|---:|---:|---:|---:|---:|
| high | `inside` | 125 → 124 | 561 → 548 | 4,392 / 1,546 → 4,729 / 1,662 | 2 | 7 |
| high | `threshold` | 281 → 199 | 1.238 → 783 | 4,802 / 1,688 → 4,705 / 1,716 | 5 | 30 |
| high | `facade` | 338 → 289 | 1.175 → 1.008 | 4,588 / 1,582 → 4,587 / 1,644 | 9 | 44 |
| high | `street` | 358 → 118 | 1.134 → 422 | 3,448 / 1,283 → 3,345 / 1,235 | 0 | 0 |
| ultra | `inside` | 125 → 124 | 706 → 701 | 5,267 / 1,527 → 5,725 / 1,719 | 2 | 7 |
| ultra | `threshold` | 281 → 199 | 1.645 → 1.018 | 5,788 / 1,686 → 5,604 / 1,697 | 5 | 30 |
| ultra | `facade` | 338 → 289 | 1.544 → 1.341 | 5,680 / 1,587 → 5,587 / 1,658 | 9 | 44 |
| ultra | `street` | 387 → 118 | 1.540 → 523 | 4,082 / 1,280 → 3,969 / 1,225 | 0 | 0 |

Portal bütçesi hiçbir şehir pozunda aşılmadı. `street` pozunda 20 dış aday
projeksiyon öncesi mesafe filtresini geçti ve hiçbiri yürüyüş bütçesine girmedi.
Gölgeli `inside` render süresi `high` için 0,337 ms, `ultra` için 0,458 ms arttı.
`inside` p95 değeri `high` için 4,522 → 5,243 ms, `ultra` için 5,439 → 6,226 ms.
`street` toplam draw sayısı iki profilde sırasıyla %62,8 ve %66,0 azaldı.

**Görsel inceleme.** Şehir kareleri `high`, donanım WebGPU ve ölçümdeki kamera
pozlarıyla alındı. İç mekân ayrıntılarını okunur kılmak için çekimde gölgesiz dolgu
ışığı kullanıldı. Üretim ve performans JSON’u ölçüm sahnesinin güneş ışığıyla alındı.
[İç mekân](../reference/measurements/r9c-step3-visual/city-inside.png),
[dış kapı eşiği](../reference/measurements/r9c-step3-visual/city-threshold.png),
[15 m cephe](../reference/measurements/r9c-step3-visual/city-facade.png),
[yakın cephe ve pencere (3 m)](../reference/measurements/r9c-step3-visual/city-facade-close.png),
[sokak](../reference/measurements/r9c-step3-visual/city-street.png).
Kullanıcı Adım 3 görsellerini onayladı. Bu onay yeni Z6 görsel kabulünü tamamladı.

**(a) Atama: yalnız tamamen sığan bölgeye girer (S1, kullanıcı kararı).** Yerleşimin dünya kutusu
(model veya şekil sınırları × matris) bir bölgenin kutusuna 2 cm toleransla tamamen sığarsa
o bölgeye (en küçüğüne) aittir; sığmayan bölgesizdir ve hep çizilir. Duvar,
döşeme, tavan iki odanın sınırına ya da dışarıya taştığı için bölgesiz kalır: oda gizlenince
yapı kaybolmaz. Model sınırları yüklenene kadar yerleşim bölgesizdir (görünür taraf), yüklenince
yeniden anahtarlanır. Şema ipucu 2 cm toleranslı kutu kuralını gösterir. Sığmayan ama bina içinde kalan
ara duvar / döşeme için S2.

**(b) Dış düğüm.** Dışarısı portal grafında bir düğümdür (`OUTSIDE`). Dış portal = bir tarafı
bölge, öbür tarafı dışarı olan portal (kapı, pencere, üst açıklık).
- Kamera hiçbir bölgede değilse yürüyüş dış düğümden tam ekran dikdörtgenle başlar; bölge ancak
  dış portaldan görünüyorsa çizilir.
- Kamera içerideyken dış portal geçilirse dış düğüme varılır; bölgesiz içerik zaten hep çizilir,
  dış düğümden başka binaların dış portallarına devam edilir (derinlik sınırı).
- Üretim (`zoneGeneration.ts`): oda hücreleriyle dış hücrelerin (sınıra ulaşan boşluk) sınır
  koşuları dış portal olur (dış kapı); pencereler için duvar hücrelerinin dikey profili birkaç
  yükseklikte taranır, boşluk dış portal olur (S3); tavanı olmayan odaya tavan yüksekliğinde
  yatay üst açıklık portalı (S4).
- Elle portal: otomatik bağlantı bir bölge bulursa ve karşı taraf açık kalırsa portal dışarıya
  bağlanır. Bu bağlantı mevcut şema ile çözülür (S18).
- **Bütçe:** dış düğümden her binanın her dış portalını test etmek şehirde kare bütçesini (256)
  aşar ve bütçe aşımı "hepsi görünür"e düşer. Dış düğümden yalnız frustum içindeki ve belli
  mesafedeki dış portallar yürüyüş bütçesini kullanır. Şimdiki mesafe 40 m. Dış portal
  ızgarası yakın adayları seçer ve debug satırı projeksiyon sayısını gösterir.

**(d) Bölgeye ait içerik HLOD'a girmez.** `tools/world/hlodAssets.ts` / `hlodBuild.ts`
yerleşimleri bölge kümesine (a)'nın kuralıyla atar, bölgeye ait olanları pişirmez. HLOD kaynak
hash'i bölge / portal kümesini içerir (bölge değişince HLOD bayat; editörün Auto HLOD'u görür).
(a)'da bölgesiz kalan ara duvar HLOD'da kalır (S2).

**Modüller:** `engine/world/zones.ts` (`zoneOfBox`, `OUTSIDE`, dış portal, dış düğümden yürüyüş,
dış portal ızgarası), `engine/world/zoneGeneration.ts` (dış kapı, pencere, üst açıklık),
`engine/world/zoneLevel.ts`, `render/sync/zoneDrawing.ts` (kutu ataması, sınır gelince yeniden
anahtar), `render/sync/batchCells.ts` (`placementZone` kutuyla), `features/static-mesh/render.ts`
ve şekil bağlaması (dünya kutusu), `features/zone/{schema,editorRender,editor}.ts` (ipucu, dış
portal rengi), `engine/world/hlod.ts` + `tools/world/hlod*.ts`, `tools/zones/`,
`tools/scenes/indoorScene.ts` (dış kapı, pencere).

**Veri / şema:** `forge.zone@1` / `forge.portal@1` alanları değişmez (S18 öneriyle); HLOD index'in
hash girdisi genişler (v2 içinde bayatlık, yeniden üretim).
Mevcut bölgeli seviyelerde kapı ve pencereden dış görüş için portalları yeniden
üretmek veya bu açıklıklara elle portal yerleştirmek gerekir.

**Editör:** dış portallar ayrı renk, Details'ta çözülen taraflar ("Outside" gösterimi),
`?debug`: dış düğüm, test edilen dış portal, bütçe aşımı.

**Kapı:** saf testler (sığma sınırı, tolerans, dış düğüm yürüyüşü, bütçe, pencere / üst açıklık
üretimi; sentetik iç mekânda 64 oda + dış portallar birebir, ikinci koşu aynı bayt);
`zones.smoke.ts` iki arka uçta (oda gizliyken duvar görünür; dışarıdan iç mekân çizilmez,
pencereden görünür); `measure:heavy-props -g zones` + `measure:city` (`inside`, `threshold`,
`facade`, `street`); **kullanıcı görsel kabulü** (Z6'nın yerine, §7).

**Codex (X):** `zones.ts` eklentileri: `zoneOfBox(set: ZoneSet, box: ZoneBox, tolerance?: number):
string | null`; `visibleZones`'a dış düğüm (`PortalInput`'ta çözülmüş taraf `OUTSIDE` olabilir,
`VisibleZoneOptions.exteriorRange`). Kabul: Z2 testleri değişmeden geçer (bölge dışı kamera testi
yeni kurala çevrilir), dış düğümden yalnız dış portaldan görünen bölgeler, bütçe davranışı.
`zoneGeneration.ts` dış kapı / pencere / üst açıklık; kabul: sentetik iç mekân + şehir binası
sayımları, aynı bayt.

### 5.4 Adım 4 — Bina akışı (c)

**Durum.** Teknik kabul 19 Kasım 2026'da kapandı. Akış açık ilk `walk` p99,
donanım WebGPU'da `high` için 10,0 ms, `ultra` için 10,4 ms oldu. İki arka uçta
da görüntüler 18 Kasım 2026'da onaylanan kayıtlarla eşleşti. Adım 4'te açık
kabul maddesi kalmadı.

**Karar ve kabul bütçesi (18 Kasım 2026).** Kullanıcı S5–S8 varsayılanlarını ve
görsel kabulü onayladı. Donanım WebGPU'da RTX, 1080p, DPR 1 ve kare hızı sınırı
kaldırılmış `walk` rotasında p99 kare aralığı **≤ 20 ms**, en uzun kare
**≤ 50 ms**. Rota ön yükleme ve boşaltma sınırlarını geçer. İlk yaklaşma ve
tekrar giriş örnekleri, başlangıç ve tahliye sonrası kaynak sayaçları kaydedilir.
`facade` aynı donanımda ölçülür. WebGL2 smoke ayrı kaydedilir.

**Tasarım.** Bina, en az bir dış portalı bulunan ve iç portallarla bağlı bölge
kümesidir (S5). `OUTSIDE` düğümü yalnız dış açıklıklara erişim verir.
Uzaktaki bir binanın iç yerleşimleri batch dışında bekler. Yaklaşınca önyükleme
(`compileAsync` dahil), uzaklaşınca histerezisle boşaltma
(yükleme 40 m × kalite çarpanı, önyükleme 1,5×, boşaltma 1,25×; S6). Mesafe
en yakın dış portal açıklığından ölçülür ve dış portal görünürlüğü aynı yükleme
menzilini kullanır. Kamera binanın bir bölgesindeyse bina yüklü kalır.
Yerleşim kuyruğu 3 ms/kare bütçeyle işlenir.

**Kaynak sahipliği (S7).** Akış, render batch yerleşimlerini ve onların önbellek
referanslarını bırakır. Paylaşılan kaynakları son kullanıcısına kadar önbellek
tutar. Sıfır referanslı kaynaklar mevcut 30 sn tahliye süresine girer.
World aktörleri ve fizik, World Partition yaşam döngüsüne bağlıdır. §5.3'te HLOD
proxy'sinden çıkarılan iç yerleşimlerin hazırlanması, hücrenin dış kabuğunun
HLOD geçişini bekletmez.

**Üyelik (S8).** Asset dizini varsayılan glTF sahnesinin yerel AABB'sini
taşır. Play modeli istemeden önce §5.3'teki 2 cm tam sığma kuralını uygular.
Sınırı dizinde bulunmayan yerleşim, model yüklenip yeniden atanabilene kadar
görünür tarafta kalır.

**Modüller:** `engine/world/buildingStreaming.ts` (yeni, saf), `render/sync/zoneDrawing.ts`
(bina residency, batch'e giriş / çıkış), `features/static-mesh/render.ts` (yerleşimi beklet,
cache kullanımını bırak), `engine/world/assetResidency.ts` ile ilişki, `tools/assets` + asset
dizini (S8), `?debug` (yüklü / önyüklenen bina, kuyruk).

**Veri / şema:** S8'e göre asset dizinine `bounds` (dizin biçimi; `.forge-cache/asset-index.json`
ve `dist/forge/`); bileşen şeması değişmez.

**Editör:** bina akışı Play'de açık, editörde kapalı (S7).

**Kapı:** saf testler (bileşen, histerezis, bütçe, kamera içerideyken hep yüklü); `walk` yolu:
sızıntı yok (heap, geometri / doku sayısı döngü sonunda başa döner), en uzun kare ve p99 eşiği
(5b G-ölçütleri gibi, ölçümden önce yazılır), içeri girerken boş oda görülmez; iki arka uçta
smoke; kullanıcı görsel kabulü (`walk`, `facade`).

Tekrar koşusu `measure:city` ve `FORGE_CITY_BUILDING_STREAMING=1` ile yapılır.
RTX için `high` ve `ultra` profilleri ve akış açık/kapalı eşleri alınır.
WebGL2 smoke kendi kaydında tutulur. Görsel incelemede gölgesiz dolgu ışığı kullanılır.

**RTX 3060 WebGPU, 18 Kasım 2026.** 1920 × 1080, DPR 1, `auto`, Chrome 157.
252 odalı ve 674 portallı şehirde 8 m/s sokak → bina → sokak rotası.
Kare aralıkları sürekli `requestAnimationFrame` üzerinden, `facade` GPU
süresi ise 120 adımlı karenin zaman damgalarından alındı.
[Ham WebGPU ölçümü](../reference/measurements/r9c-step4/webgpu.json).

| Profil | Akış | İlk `walk` p99 / en uzun (ms) | Tekrar `walk` p99 / en uzun (ms) | `facade` GPU ort. (ms) | `facade` toplam draw |
|---|---|---:|---:|---:|---:|
| high | Kapalı | 36,0 / 69,0 | 35,6 / 43,7 | 4,605 | 1.008 |
| high | Açık | **21,5** / 35,6 | 16,8 / 32,8 | 4,475 | 1.008 |
| ultra | Kapalı | 43,1 / 80,4 | 36,7 / 66,0 | 5,649 | 1.341 |
| ultra | Açık | **23,0** / 46,8 | 17,3 / 33,7 | 5,667 | 1.341 |

Hedef binada ilk önyükleme örneği iki profilde de yaklaşık 59,7 m'de
alındı. 180/180 yerleşim `high` profilde 49,4 m'de, `ultra` profilde
48,5 m'de hazırdı. Eşikte ve içeride 180/180 hazır kaldı. 79,3 m'ye
dönüldüğünde hedefin render yerleşimleri sıfıra indi.
`facade` pozunda iki profilde de dokuz oda görünürdü. Çizimden önce
bekleyen iş sayısı yerleşik pozda sıfırdı.
[Kapı eşiği](../reference/measurements/r9c-step4/webgpu-threshold.png),
[oda içi](../reference/measurements/r9c-step4/webgpu-inside.png),
[15 m cephe](../reference/measurements/r9c-step4/webgpu-facade.png).

İlk yürüyüş World Partition'da bir ek hücre açtı. Bellek kıyası aynı
yerleşik 34 hücreyle, ilk dönüş ve ikinci dönüşten 31 sn sonra alındı.
Geometri/doku sayaçları `high` için 145/9, `ultra` için 145/11,
cache giriş sayısı iki profilde de 48 kaldı. GC sonrası heap artışı
sırasıyla %0,27 ve %0,25. Cephede paylaşımlı mobilya modellerinin cache
kullanım sayısı akış kapalıyken 2.916, açıkken 108. Odaklı bağlama testi
uzaklaşınca tek modelin ve materyalinin referanslarının iade edildiğini doğruladı.

**WebGL2 smoke.** `high` profilinde yaklaşma, içeride tutma, eşik ve dönüş
kontrolleri geçti. Kaynak kontrolünde kamera bina menzillerinin üstüne
çıkarıldı. Aynı 34 WP hücresi açıkken mobilya modeli kullanımları 108'den
sıfıra indi ve 15 model mevcut tahliye kuyruğuna girdi. Tarayıcı hatası
görülmedi. [WebGL2 kayıt dosyası](../reference/measurements/r9c-step4/webgl2.json),
[WebGL2 kapı eşiği](../reference/measurements/r9c-step4/webgl2-threshold.png),
[WebGL2 oda içi](../reference/measurements/r9c-step4/webgl2-inside.png),
[WebGL2 cephe](../reference/measurements/r9c-step4/webgl2-facade.png).

**19 Kasım 2026 başlangıç koşusu (`main`, `66832fd`).** `FORGE_CITY_BUILDING_STREAMING=1`
ile aynı 252 odalı, 674 portallı şehirde 8 m/s rota kullanıldı. Her senaryo yeni
sayfada açıldı ve ilk yürüyüşten önce başlangıç pozunda yerleşti. Chrome 157,
1920 × 1080, DPR 1, `auto`, kare hızı sınırı kapalı. Chrome'un GPU kaydı RTX 3060'ı,
WebGPU adaptör kaydı NVIDIA Ampere'ı, `isFallbackAdapter=false` ve zaman damgası
desteğini gösterdi. [Ham başlangıç ölçümü](../reference/measurements/r9c-step4/main-66832fd-webgpu.json).

| Profil | Akış | İlk `walk` p99 / en uzun (ms) | Tekrar `walk` p99 / en uzun (ms) | `facade` GPU ort. (ms) | `facade` toplam draw |
|---|---|---:|---:|---:|---:|
| high | Kapalı | 45,5 / 69,0 | 52,6 / 91,3 | 4,317 | 1.008 |
| high | Açık | **38,0 / 85,8** | **28,4 / 52,0** | 4,502 | 1.008 |
| ultra | Kapalı | 36,5 / 52,4 | 36,4 / 67,7 | 5,682 | 1.341 |
| ultra | Açık | **32,2** / 49,4 | **30,5** / 47,1 | 5,461 | 1.341 |

Akış açık iki profilde de kapı eşiğinde ve odada 180/180 yerleşim hazırdı.
Uzaklaşınca hedef bina sıfır yerleşime döndü. Kaynak bırakma kontrolünde mobilya
modeli kullanımı 108'den sıfıra indi. İlk ve ikinci dönüşte 34 etkin hücre,
48 cache girdisi ve aynı geometri/doku sayaçları görüldü (`high` 145/9, `ultra`
145/11). 31 sn tahliye beklemesinden sonra bekleyen tahliye sıfırdı. GC sonrası
heap artışı sırasıyla %0,29 ve %0,27 oldu.

**19 Kasım WebGL2 smoke geçti.** `high` profilinde eşik ve oda içinde 180/180
yerleşim hazırdı. Çıkışta hedef binanın yerleşimleri sıfıra indi. 34 etkin hücreyle
mobilya modeli kullanımı 108'den sıfıra düştü ve 15 model tahliye kuyruğuna girdi.
Tarayıcı hatası görülmedi. İki arka uçtaki altı görsel, onaylanmış dosyalarla bayt
düzeyinde aynı çıktı. [Ham WebGL2 smoke kaydı](../reference/measurements/r9c-step4/main-66832fd-webgl2.json).

**İlk yürüyüşün zaman çizelgesi.** `FORGE_CITY_BUILDING_TIMELINE=1` ile ayrı
tanı koşusunda p99 `high` için
28,1 ms, `ultra` için 33,1 ms oldu. 20 ms'yi aşan 32 `high` ve 74 `ultra` aralığında
World Partition çekirdek güncellemesi 1 ms'nin altında kaldı. Aktör katılımı
dahil hücre akışı CPU örneklerinde yavaş bir aralığa sırasıyla 4,6 ve 4,8 ms'ye
kadar katkı verdi. Bina yerleşim güncellemesi her profilde yalnız bir yavaş
aralıkta 1 ms'yi geçti. Rota boyunca yeni kaynak yükü kaydedilmedi. Profil başına
234 `compileAsync` çağrısında ana iş parçacığındaki en uzun çağrı 0,3 ms,
en uzun tamamlanma süresi 0,4 ms oldu. Tanı araçları açıkken ölçülen p99
değerleri kabul tablosundan ayrı tutuldu.
[High zaman çizelgesi](../reference/measurements/r9c-step4/high-timeline.json),
[ultra zaman çizelgesi](../reference/measurements/r9c-step4/ultra-timeline.json),
[high CPU profili](../reference/measurements/r9c-step4/high-cpu.json),
[ultra CPU profili](../reference/measurements/r9c-step4/ultra-cpu.json).

CPU profilleri, hücreler yerleştikten sonra HLOD'un yaklaşık 30.000 aktörün
çizime hazırlığını her karede tekrar sorguladığını gösterdi. Hücreler hazır
sonucunu çizim hazırlığı revizyonu değişene veya hücre çıkana kadar saklar.
Bekleyen hücrelerin hazırlığı sorgulanmaya devam eder. Aktör ekleme, çıkarma,
değiştirme, geç yerleşim ataması ve bir dış batch'in yeniden hazırlanması önceki
sonucu geçersiz kılar. Bina içlerinin hazırlanması dış HLOD geçişini bekletmez.

**Hazırlık düzeltmesinden sonra, 19 Kasım 2026.** Aynı şehir ve rota korundu.
Her senaryo ayrı Chrome bağlamında açıldı. Ölçümde tanı araçları kapalıydı.
RTX 3060, donanım WebGPU ve DPR 1 yeniden doğrulandı.
[Ham WebGPU karşılaştırması](../reference/measurements/r9c-step4/after-readiness-webgpu.json).

| Profil | Akış | İlk `walk` p99 / en uzun (ms) | Tekrar `walk` p99 / en uzun (ms) | `facade` GPU ort. (ms) | `facade` toplam draw |
|---|---|---:|---:|---:|---:|
| high | Kapalı | 26,5 / 48,5 | 19,0 / 35,5 | 4,537 | 1.008 |
| high | Açık | **10,0 / 33,1** | 8,7 / 27,3 | 3,887 | 1.008 |
| ultra | Kapalı | 27,1 / 35,5 | 18,1 / 37,4 | 5,352 | 1.341 |
| ultra | Açık | **10,4 / 32,5** | 11,6 / 29,8 | 4,333 | 1.341 |

Akış açıkken ilk ve tekrar yürüyüşleri iki profilde de 20 ms p99 ve 50 ms
en uzun kare sınırlarını karşıladı. Hedef bina yaklaşık 59,3 m'de önyükleme
evresindeydi ve yaklaşık 55,3 m'de 180/180 yerleşim hazırdı. Eşik ve oda içinde
180/180 hazır kaldı. 79,3 m'ye dönüldüğünde hedef binanın yerleşimleri sıfıra
indi. Kaynak bırakma kontrolünde 34 WP hücresi etkin kalırken mobilya modeli
kullanımı 108'den sıfıra düştü. İlk ve ikinci dönüşte cache 48 girdide, geometri/doku
sayıları `high` için 145/9, `ultra` için 145/11'de kaldı. 31 sn sonra tahliye
kuyruğu boştu. GC sonrası heap farkı %0,24 ve %0,18 oldu.

**Düzeltme sonrası WebGL2 bina akışı smoke geçti.** Eşik ve oda içinde 180/180
yerleşim hazır kaldı. Dönüşte hedef binanın yerleşimleri sıfıra indi. Kaynak
kontrolünde 34 WP hücresi etkin kalırken mobilya modeli kullanımı 108'den sıfıra
indi ve 15 model tahliye kuyruğuna girdi. Tarayıcı hatası görülmedi. Bu işlevsel
koşuda ilk yürüyüş p99 10,9 ms, ölçülen en uzun kare 247,2 ms idi. 20/50 ms
kabul eşikleri donanım WebGPU koşusuna uygulanır. Düzeltme sonrası iki arka
uçtaki altı görsel, 18 Kasım'da onaylanan görüntülerle bayt düzeyinde eşleşti.
[Ham WebGL2 smoke kaydı](../reference/measurements/r9c-step4/after-readiness-webgl2.json).

**Odaklı doğrulama.** İlk uygulamada bina grafiği, kuyruk bütçesi, bölge/çizim
bağları ve kaynak sahipliği testleri geçti. Starter üretim asset dizininde
18 modelin 18'i yerel AABB içeriyordu. Hazırlık düzeltmesinden sonra 9 dosyada
72 birim testi ve TypeScript denetimleri geçti. `zones.smoke.ts` ve
`triangles.smoke.ts` WebGPU ve WebGL2'de ayrı ayrı geçti (4/4).

**Codex (X):** `buildingStreaming.ts`: `buildingsOf(set: ZoneSet): Building[]` (bileşen, dış
portallar, sınır kutusu); `planBuildingResidency(buildings, camera: ZoneVec3, state:
ReadonlyMap<string, Residency>, options): { load: string[]; unload: string[]; next: Map<…> }`.
Kabul: aynı giriş aynı çıkış, histerezis bandında titreme yok, bütçe sırası en yakından.

### 5.5 Adım 5 — Küçük, çok yerleşimli statikler için örnek başına cull

**Sorun.** Hafif (≤ 5.000 üçgen) batch instanced kalır (S1); şehre yayılmış küçük nesne batch'i
ne detay cull'la ne frustum'la düşer, her görünümde bütün örneklerin köşe işi sürer. Adım 2'nin
sınıfı gölgeyi kısar ama ana görünümü çözmez.

**Seçenekler (S12):**
- **GPU yolu:** `auto` kuralına ikinci koşul: batch'in detay cull mesafesi var, yerleşim sayısı
  eşiği aşıyor (öneri ≥ 64) ve yerleşimler cull mesafesinden geniş alana yayılıyor (sınır küresi
  yarıçapı ≥ 2 × cull mesafesi). Örnek başına frustum + mesafe + gölge kuralı kesin; draw artmaz;
  bedeli batch × görünüm başına üç dispatch (~50 µs). Dispatch birleştirme (görünüm başına bütün
  batch'ler tek dispatch, R9'da ayrı karar) bu bedeli düşürür, bu adımın parçası değil.
- **Hücre bölmesi:** yalnız bu batch'ler cull mesafesine bağlı hücreye bölünür (`batchCells.ts`,
  hücre ≈ cull mesafesi); her hücre batch'i kendi küresiyle düşer. Draw görünür hücre sayısıyla
  artar (R9a: iç mekânda 4 → 63).

Öneri: ikisini şehir sahnesinde (`street`) ölçmek; ön tahmin GPU yolu (draw sabit, gölge kuralı
örnek başına). Karar ölçümden sonra.

**Modüller:** `render/triangles/staticPath.ts` (kural), `render/sync/instanceBatches.ts` (yol
seçimine yerleşim bilgisi), ya da `render/sync/batchCells.ts` (hücre). WebGL2 ikizi CPU'da
ayıklar (20.000 örnekte CPU maliyeti ölçülür; kabul değil).

**Kapı:** saf testler; `measure:city` (`street`, `square`) + `measure:static-path` referans
level'larda gerileme yok; render / editör smoke iki arka uçta.

**Codex (X):** `lodParts(path, parts, placements?: { count: number; spreadRadius: number;
cullDistance: number | null })` kuralı ya da `detailCellSize(cullDistance: number): number`;
kabul: S1'in mevcut testleri değişmeden, yeni koşulun sınırları.

#### S12 şehir karşılaştırması (19 Kasım 2026)

`12a53f2` üzerine kurulan geliştirme kipleri `s12-gpu` ve `s12-cells`, opak ve toplamı
en çok 5.000 üçgen olan aynı kaynak batch'leri kullandı. Adaylık için en az 64 yerleşim
ve yerleşim konumlarının AABB'sinden hesaplanan küre yarıçapının ölçek 1 detay cull
mesafesinin en az iki katı olması arandı. Hücre kenarı bu mesafeydi. GPU adayı kaynak
üçgenlerini korudu ve mevcut GPU yolunun parça küreleriyle eledi. Hücre adayı mevcut
batch gölge sınıfını kullandı. Model parçası başına yerleşim sayıları iki adayda bütün
koşullarda eşleşti. `street` 18.839, `square` 29.118 parça-örnek içerdi.

RTX 3060, Chrome 157.0.8103.79, donanım WebGPU, 1920 × 1080, DPR 1. Aynı sentetik
şehir, kamera ve kalite ayarlarında, bina içi akış kapalı ve gölgeler açıkken 60 kare
ısınma ardından 300 kare ölçüldü. Süreler ortalamadır. CPU gönderimi eleme dahil render
gönderiminin duvar süresidir. GPU süresi render ve compute timestamp toplamıdır.
Draw sayaçları ayrı bir kareden alınır. Sıfır örnekli dolaylı draw komutları da sayılır.
[Ham şehir ve WebGL2 smoke kaydı](../reference/measurements/2026-11-19T06-47-37-238Z-city-s12.json).

| Kalite | Poz | Yol | Ana draw | Gölge draw (kaskat sırası) | Dispatch | Gönderim CPU (ms) | GPU (ms) | Ana / gölge üçgen (milyon) | Kare CPU (ms) |
|---|---|---|---:|---|---:|---:|---:|---:|---:|
| high | `street` | `auto` | 118 | 101 / 101 / 101 | 0 | 3,539 | 3,322 | 6,641 / 18,153 | 11,676 |
| high | `street` | `s12-gpu` | 118 | 101 / 101 / 101 | 444 | 6,943 | 2,892 | 2,818 / 3,386 | 14,034 |
| high | `street` | `s12-cells` | 345 | 121 / 185 / 319 | 0 | 4,819 | 1,856 | 4,319 / 7,915 | 13,512 |
| high | `square` | `auto` | 105 | 102 / 102 / 102 | 0 | 4,116 | 4,468 | 9,291 / 27,705 | 16,728 |
| high | `square` | `s12-gpu` | 105 | 102 / 102 / 102 | 444 | 9,139 | 2,607 | 2,534 / 4,684 | 21,750 |
| high | `square` | `s12-cells` | 326 | 113 / 185 / 320 | 0 | 7,603 | 1,751 | 4,307 / 9,379 | 23,327 |
| ultra | `street` | `auto` | 118 | 101 / 101 / 101 / 101 | 0 | 3,925 | 4,004 | 6,641 / 24,204 | 12,067 |
| ultra | `street` | `s12-gpu` | 118 | 101 / 101 / 101 / 101 | 555 | 8,013 | 3,440 | 2,827 / 4,995 | 15,018 |
| ultra | `street` | `s12-cells` | 354 | 121 / 159 / 217 / 368 | 0 | 5,936 | 2,275 | 4,429 / 10,824 | 15,265 |
| ultra | `square` | `auto` | 105 | 102 / 102 / 102 / 102 | 0 | 4,116 | 5,267 | 9,291 / 36,939 | 15,432 |
| ultra | `square` | `s12-gpu` | 105 | 102 / 102 / 102 / 102 | 555 | 8,532 | 3,352 | 2,545 / 6,732 | 19,042 |
| ultra | `square` | `s12-cells` | 341 | 112 / 171 / 250 / 433 | 0 | 8,497 | 2,349 | 4,589 / 14,006 | 23,335 |

GPU adayı için parça-örnek başına frustum, mesafe ve gölge boyutu katkısı, aynı
görünümlerin CPU referansında sıralı olarak ölçüldü. Sonuç GPU geri okumasıyla eşleşti.
Gölge satırları kaskat toplamıdır, aynı örnek birden fazla kaskatta sayılır.

| Kalite | Poz | Görünüm | Girdi | Frustum sonrası | Mesafe sonrası | Gölge eşiği sonrası | GPU çizdi |
|---|---|---|---:|---:|---:|---:|---:|
| high | `street` | Ana | 18.839 | 7.588 | 2.660 | 2.660 | 2.660 |
| high | `street` | Gölge | 56.517 | 4.599 | 2.343 | 2.024 | 2.024 |
| high | `square` | Ana | 29.118 | 6.302 | 2.227 | 2.227 | 2.227 |
| high | `square` | Gölge | 87.354 | 3.826 | 1.953 | 1.640 | 1.640 |
| ultra | `street` | Ana | 18.839 | 7.588 | 2.721 | 2.721 | 2.721 |
| ultra | `street` | Gölge | 75.356 | 8.044 | 4.116 | 4.086 | 4.086 |
| ultra | `square` | Ana | 29.118 | 6.302 | 2.297 | 2.297 | 2.297 |
| ultra | `square` | Gölge | 116.472 | 7.496 | 3.574 | 3.561 | 3.561 |

**WebGL2 CPU ikizi.** `high/street` şehir smoke'u geçti ve adayın `cpu` yolunu
kullandığı doğrulandı. 18.839 parça-örneğin 2.660'ı ana görünümde çizildi. Render
gönderimi `auto` ile 2,696 ms, ikizle 18,583 ms oldu. `gpuDriven.cull` CPU süresi
sırasıyla 0,610 ve 15,138 ms, kare CPU süresi 10,442 ve 26,233 ms oldu.
Ayrı tekrarda aynı `street` popülasyonu 37 parçada 20.000 parça-örneğe oranlandı.
Üç kaskat ve ana görünüm için üretim CPU ikizinin eleme, sıkıştırma ve tampon yazımı
ortalama 15,100 ms, p95 16,500 ms sürdü. Bu süreye sürücüye draw gönderimi dahil değil.
[Ham 20.000 parça-örnek kaydı](../reference/measurements/2026-11-19T07-08-40-218Z-city-s12-webgl2-cpu.json).

Tekrar koşusu için `measure:city` komutunda `FORGE_CITY_S12=1` şehir karşılaştırmasını,
`FORGE_CITY_S12=cpu` ayrı CPU ölçümünü seçer.

**S12 kararı (kullanıcı onayı, 19 Kasım 2026).** Üretimde mevcut `auto` ve S1
üçgen eşiği kullanılır. `s12-gpu` ve `s12-cells` geliştirme ölçüm kipleridir. İki aday da dört
koşulda GPU süresini ve çizilen üçgeni düşürdü, CPU gönderimini ve kare CPU süresini
yükseltti. GPU yolu `street` draw bütçesini korudu ve 444–555 dispatch ekledi. Hücre
yolu `street`te 549–697 ek draw üretti ve `square`da da aynı maliyet yönü görüldü.
Yeni bir ölçümde önce GPU yolunu, en az 128 yerleşim ve en büyük yerleşim ölçeğiyle
düzeltilmiş detay mesafesinin en az iki katı yayılım koşuluyla dene. Alt sınırın
128'e çıkması bu sahnede 37 aday parçanın 16'sını dışarıda bırakır. Ölçek koşulu,
ana görünümde mesafe elemesine hiç takılmayan şehir ağaçları gibi adayları ayırır.
Bu dar eşik bir sonraki ölçüm önerisidir.

**Referans level gerileme kontrolü.** `measure:static-path` dört level'da `auto`
yoluyla donanım WebGPU ve `FORGE_STATIC_PATH_BACKEND=webgl2` ile çalıştı. `12a53f2`
kaynak arşivi ve yalnız Adım 5 kaynak değişiklikleri aynı yalıtılmış kopyada ölçüldü.
Kayıtlardaki `dirty` alanı üst çalışma ağacına aittir. Her level ayrı sekmede açıldı,
kamera pozu doğrulandı ve kaynaklar yerleşene kadar beklendi. Her motor adımından önce
yeni tarayıcı karesi beklendi, böylece Three.js post-process sahne geçişi her örnekte
çalıştı. İki arka uçta kamera, draw, doğrudan üçgen, GPU güdümlü batch ve örnek sayıları
önce ve sonra birebir eşleşti. WebGL2'de GPU timestamp'i kapalıydı.
[WebGPU başlangıç](../reference/measurements/2026-11-19T07-31-38-645Z-static-path.json) ·
[WebGPU Adım 5](../reference/measurements/2026-11-19T07-32-34-818Z-static-path.json) ·
[WebGL2 başlangıç](../reference/measurements/2026-11-19T07-29-43-681Z-static-path-webgl2.json) ·
[WebGL2 Adım 5](../reference/measurements/2026-11-19T07-30-45-373Z-static-path-webgl2.json).

| Arka uç | Level / poz | Draw | CPU gönderim önce → sonra (ms) | GPU önce → sonra (ms) |
|---|---|---:|---:|---:|
| WebGPU | `derekavak/p2` | 119 | 3,443 → 3,947 | 5,193 → 10,199 |
| WebGPU | `wb-pilot/p1` | 68 | 2,536 → 2,952 | 2,576 → 4,148 |
| WebGPU | `island/p1` | 29 | 1,861 → 1,752 | 1,469 → 1,671 |
| WebGPU | `open-world/p1` | 4 | 0,868 → 0,809 | 0,751 → 1,076 |
| WebGL2 | `derekavak/p2` | 119 | 5,015 → 4,369 | — |
| WebGL2 | `wb-pilot/p1` | 59 | 3,182 → 3,489 | — |
| WebGL2 | `island/p1` | 18 | 2,280 → 1,742 | — |
| WebGL2 | `open-world/p1` | 4 | 0,841 → 0,597 | — |

İlk tam çiftteki yüksek WebGPU süreleri için `derekavak/p2` ve `wb-pilot/p1`,
başlangıç → Adım 5 → Adım 5 → başlangıç sırasıyla tekrar ölçüldü. Draw ve üçgen
sayıları her tekrarda eşleşti. Derekavak GPU ortalaması sırayla 5,274 / 5,298 /
5,222 / 9,286 ms, WbPilotValley ortalaması 2,473 / 2,551 / 2,582 / 3,419 ms oldu.
Büyük süre farkı Adım 5'e özgü olarak tekrarlanmadı. Çizim işi eşleşirken GPU süresi
koşular arasında değişti.
[Ham WebGPU süre tekrarları](../reference/measurements/r9c-s12-webgpu-timing-recheck.json).

**Odaklı doğrulama.** `triangles.test.ts` ve `instanceBatches.test.ts` toplam 20 test
geçti. Deney için 64 yerleşim, iki kat yayılım ve toplam 5.000 üçgen sınırları, S1 için
parça başına 5.000 ve 5.001 üçgen doğrulandı. `triangles` ve `zones` render smoke'ları
WebGPU ve WebGL2'de toplam 4 test geçti. Statik model/slot bırakma, iki seçim ve
viewport smoke'ları her arka uçta 4'er test geçti.

### 5.6 Adım 6 — Ölçüme göre

- **WP boyut sınıfı menzilleri (S13):** küçük nesneler daha kısa menzilde akar. Draw'ı detay cull
  ve adım 5 zaten düşürür; bu iş yalnız bellek / yükleme ölçümü gerektirirse. Öneri: adım 1–5'in
  ölçümünde bellek ya da hücre yükleme süresi sorun değilse yapılmaz.
- **Materyal birleştirme / atlas:** farklı materyalleri tek dokuya (kayıplı; R8 kararında
  "sonra"). Kalan draw'ın kaynağı arketip başına çok slot çıkarsa. Ayrı tasarım, ayrı karar.
- **Kaskat iç içe kesimi** (S11) ve **dispatch birleştirme** (adım 5) ölçüme göre buraya gelir.

## 6. Paralel iş ve ortak dosyalar

Foliage sırası (ana plan v1.73, F0–F7, R10) başka oturumda yürüyor; F1 bugün
`render/gpu/gpuDriven.ts`, `gpuDrivenDev.ts`, `render/sync/renderWorld.ts`,
`renderBinding.ts` gibi dosyalara dokunuyor. Adım 2 aynı GPU yolu dosyalarına girer; adım 1 yalnız
`tools/` ve `tests/smoke/` (çakışmasız). Sıra S17'de.

## 7. R9b'nin durumu

Z0–Z5, Z3b ve Z7 commit'li; **Z6 kullanıcı görsel kabulü geçmedi** (2026-11-18): duvar ve döşemenin
yerleşim noktası bölge sınırına (sınır dahil) düştüğü için bölgeye atanıyor, oda gizlenince
duvar da kayboluyor. Ayrıca kamera bölge dışındayken her şey çiziliyor; hedef tersi.

R9b, Adım 3’te Z8–Z10 ve yeni Z6 görsel kabulüyle yerelde kapandı. Z8 dünya
kutusunun bölgeye tam sığmasını, Z9 dış portal yürüyüşünü ve çok katlı üretimi,
Z10 HLOD filtresini kapsıyor. Adım 4 (c), R9c kapsamında bina akışı ve bellekten
boşaltmayı ele alıyor.

## 8. Açık sorular (kullanıcı yanıtlayacak)

| # | Soru | Öneri | Gerekçe |
|---|---|---|---|
| S1 | Bölge ataması "sığma" mı "boyut eşiği" mi? | **Onaylandı (18 Kasım):** Dünya kutusu 2 cm toleransla bölgeye tamamen sığmalı; sınır yüklenene kadar yerleşim bölgesiz | Boyut eşiği (≥ 1,5 m bölgesiz) büyük dolabı hep çizer, sınırdaki küçük nesneyi (duvar tablosu) yanlış odaya atar; sığma yapıyı da sınırdaki eşyayı da görünür tarafta bırakır |
| S2 | Sığmayan ama bina içinde kalan ara duvar / döşeme | Önce hep çiz (bölgesiz); ölçümde payı büyükse üretimin voksel ızgarasından "dış hücreye değmiyor" üyeliği (bina üyeliği) | Şekil batch'leri az draw üretir, köşe işi küçük; bina üyeliği yeni kavram ve level parçası ister. Bina modelin içine gömülü iç duvar zaten bölünemez |
| S3 | Pencereler portal değilse dışarıdan iç boş görünür. Ne yapılsın? | Üretim duvarın dikey profilinden pencereyi bulur, dış portal yazar; kalanı elle; kabul ölçütü `facade` pozu | Cam materyalini portal saymak materyal bilgisine bağlanır ve şekillerde yok; yalnız elle portal şehirde ölçeklenmez |
| S4 | Tavansız oda (avlu, yıkık bina) | Üretim tavanı olmayan odaya yatay üst açıklık portalı yazar | Yürüyüş kendiliğinden çalışır (yukarıdan bakınca görünür); odayı bölgesiz bırakmak avlu eşyasını hep çizer |
| S5 | "Bina" (akış birimi) nasıl tanımlanır? | **Onaylandı (18 Kasım).** İç portallarla bağlı, en az bir dış portala sahip bölge kümesi | Üyelik mevcut portal grafından çıkarılır |
| S6 | Bina akış mesafesi ve histerezisi | **Onaylandı (18 Kasım).** 40 m × kalite, önyükleme 1,5×, boşaltma 1,25× | Önyüklemeye `compileAsync` dahildir, yerleşim kuyruğu 3 ms/kare bütçeli |
| S7 | Akışta ne boşalır? Editörde akış? | **Onaylandı (18 Kasım).** Render batch ve kaynak referansları. Editörde kapalı, Play'de açık | World aktörleri ve fizik WP'ye bağlı, son referanstan sonra cache tahliyesi 30 sn |
| S8 | Yüklemeden önce üyelik için model sınırları nereden? | **Onaylandı (18 Kasım).** Asset dizininde yerel model AABB'si | Model yüklenmeden 2 cm tam sığma testi, eksik sınırda geç yüklenen modelden yeniden atama |
| S9 | Gölge cull formülü ve kalite profiliyle ilişki | Texel kuralı `r ≥ τ · t_k`, τ profil alanı (`shadowCasterMinTexels`, öneri `ultra` 1,5, `high` 2, düşükler 3); level / nesne geçersiz kılması yok (bölgenin `alwaysCastShadows`'u gibi gerekirse sonra) | Yarıçap × K kuralı harita boyutunu ve kaskat sayısını görmez; texel kuralı profille kendiliğinden ölçeklenir. τ ölçümle |
| S10 | Gölge kesilmesi solsun mu? | Evet, `maskShadowNode` dither, izinli son bölmenin son %15'i | Kaskat sınırında küçük gölgenin birden kaybolması sokakta görülür; maliyeti ihmal edilebilir |
| S11 | Yakın kaskadın kapsadığı gölge düşürücü uzak kaskattan çıkarılsın mı? | Şimdi değil; adım 2 ölçümünden sonra | Gölge hacmi kaskattan taşabilir (gün batımı); yanlış gizleme riski, kazancı adım 2'den sonra küçük olabilir |
| S12 | Instanced küçük nesne: GPU yolu mu hücre bölmesi mi? | **Onaylandı (19 Kasım):** Mevcut `auto` (S1) üretim varsayılanı. | İki aday da `street` ve `square` koşularında CPU gönderim ve kare CPU süresini artırdı (§5.5). |
| S13 | World Partition çoklu menzil gerekli mi? | Şimdilik hayır | Draw'ı detay cull + adım 5 çözer; menzil yalnız bellek / yükleme sorunuysa |
| S14 | Adım 3 R9b'nin tamamlanması mı, ayrı mı? | R9b'nin tamamlanması (Z8–Z10, yeni Z6 kabulü); adım 4 R9c'nin | §7 |
| S15 | Şehir sahnesinin modelleri | Prosedürel deterministik GLB, yalnız ölçüm kopyasında | Şekiller slot üretmez (draw dili yanlış çıkar); referans projesi modelleri az arketip; lisans sorunu yok |
| S16 | Çok katlı bina bölgesi | **Onaylandı (18 Kasım):** Çok katlı üretim Adım 3 kapsamında. Kat dilimleri varsayılan üretim koşusunda birlikte bulunur. | Şehirde iki bina iki katlı. Kullanıcı tek koşuda üretimi seçti. |
| S17 | R9c'nin foliage sırasıyla (F0–F7, R10) yeri | Adım 1 hemen (çakışmasız); adım 2 F1 commit'lendikten sonra, F7 / R10'dan önce (G6 gölge kuralıyla ölçülsün); adım 3–5 F serisiyle paralel | Ortak dosyalar §6; G6'nın gölge payı adım 2'ye bağlı |
| S18 | Dış portal için şema alanı? | Gerek yok: otomatik bağlantı tek bölge bulursa öbür taraf dış | Kullanıcının önerisi; yanlış boyutlu iç portal dış olur, hata görünür tarafta. Editör rengi ayırt eder |

## 9. Riskler ve ölçülmeden verilmeyecek kararlar

**Riskler**
- Dış düğüm bütçesi: büyük şehirde portal testi bütçeyi aşarsa "hepsi görünür"e düşer; ızgara ve
  mesafe sınırı şart (§5.3).
- Sınırların geç gelmesi: model yüklenince yeniden anahtarlama instanced batch'i yeniden kurar;
  açılışta toplu yeniden kurma sıçraması. S8 bunu da giderir.
- Gölge kesilmesi: kaskat sınırında, gün batımında uzun gölgede görünebilir (S10, kullanıcı kabulü).
- Katman bütçesi: three katmanları 32 bit; 0–15 dolu, gölge sınıfları 16–25. Yeni görünüm türü
  eklenirse bütçe daralır.
- Ölçüm sayacı three iç API'sine (`backend.draw`) dayanır; three yükseltmesinde kırılabilir
  (yalnız ölçüm, ürün kodu değil).
- Sentetik şehir kutulardan: draw / gönderim sonuçları taşınır, GPU süresi gerçek içerikte farklı.
- İç mekân akışı: eşikte model cache'in gidip gelmesi, ilk görüşte pipeline derleme sıçraması.
- WebGL2 ikizi 20.000 küçük örneği CPU'da ayıklar; smoke süresi uzar (kabul değil).
- Paralel F serisi aynı GPU yolu dosyalarında (§6).
- Bölge değişince HLOD bayatlar (d); Auto HLOD kapalı projede eski proxy iç mekânı göstermeye devam eder.

**Ölçülmeden verilmeyecek kararlar**
- τ (S9) ve solma bandı (S10).
- İlk `walk` rotasında 20 ms p99 sınırı (§5.4).
- S2'nin bina üyeliği, S11'in kaskat iç içe kesimi, dispatch birleştirme.
- WP çoklu menzil (S13) ve atlas (§5.6).
- `GPU_STATIC_MIN_TRIANGLES` (S1 eşiği) değişikliği.

## 10. İlerleme kaydı

| Tarih | Sürüm | Ne oldu |
|---|---|---|
| 2026-11-18 | v0.1 | İlk taslak (kullanıcıyla tartışmanın planı): katmanlar, sıra 1–6, şehir sahnesi, adım tasarımları, R9b'nin durumu, açık sorular S1–S18. Kod yok |
| 2026-11-18 | v0.1 | Adım 1'in üreteci, geçici proje hazırlığı ve `measure:city` koşucusu eklendi. Varsayılan normal ve ağır sahnelerde 28.964 model yerleşimi, 234 zemin kat odası, 312 iç portal ve 36 HLOD hücresi üretildi. Gerçek WebGPU referans koşusu ve sonuç tablosu §5.1’de. |
| 2026-11-18 | v0.1 | Adım 2'nin kaskat boyutu eşiği ve son izinli kaskatta dither solması bağlandı. Başlangıç değerleri `ultra` 1,5 / `high` 2 / `medium` ve `low` 3 texel ve son %15 solma. WebGPU karşılaştırması, referans level gerileme koşusu ve görsel kabul açık. |
| 2026-11-18 | v0.2 | Adım 2 kapandı. Donanım WebGPU ölçümleri, iki arka uçta smoke sonuçları ve kullanıcı görsel onayı §5.2’de. Adım 3 (a) için kullanıcı 2 cm toleranslı tam sığma kuralını seçti; instanced ve GPU çizim yollarına bağlandı. |
| 2026-11-18 | v0.2 | Adım 3’te dış portal yürüyüşü ve HLOD filtresi yerelde uygulandı. S16 uyarınca üretim katları tek koşuda tarıyor. Odaklı doğrulamalar §5.3’te. |
| 2026-11-18 | v0.2 | Adım 3 şehir ve ağır iç mekân ölçümleri tamamlandı. Şehirde iki kat, 252 oda ve 674 portal doğrulandı. Görsel kabul açık (§5.3). |
| 2026-11-18 | v0.3 | Kullanıcı Adım 3 görsellerini onayladı. Adım 3 ve R9b Z8–Z10, yeni Z6 kabulüyle kapandı. |
| 2026-11-18 | v0.3 | S5–S8 onaylandı ve Adım 4 yerelde uygulandı. Görsel onay, WebGPU/WebGL2 kayıtları ve ilk yürüyüşte açık kalan p99 kabulü §5.4’te. |
| 2026-11-19 | v0.4 | Adım 5 kapandı. Kullanıcı S12 için mevcut `auto` ve S1'i onayladı. Şehir karşılaştırması, iki arka uçtaki referans ve smoke sonuçları §5.5’te. |
