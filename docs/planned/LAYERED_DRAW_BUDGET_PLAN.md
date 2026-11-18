# Katmanlı çizim bütçesi planı (Faz 5c R9c)

**Sürüm:** v0.1 · 2026-11-18 — İlk taslak: katmanlar, altı adım, şehir sahnesi, açık sorular.
Yalnız plan; kod yok. Kararlar kullanıcıda (aşağıda §8).

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

| Katman | Hangi nesneler | Mekanizma | Bugünkü durum | Açık |
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
  izinli son kaskat (0 = hiç). Gölge sınıfı katmanları (16–19 boş; 0–15 dolu: gölge görünümleri
  1–8, ana 9, kamera 10–13, bölge 14–15): mesh sınıf katmanında, ana kamera bütün sınıf
  katmanlarını, kaskat k kamerası `kmax ≥ k` olan sınıfları açar; katman 0'daki diğer her şey
  (terrain, karakter) değişmez. Bölge kipleri (`ZONE_SHADOW_LAYER` / `ZONE_HIDDEN_LAYER`) sınıfla
  birleşir: `applyZoneMode` katmanı kip × sınıftan seçer. Sınıf yalnız profil ya da kaskat
  kurulumu değişince yeniden hesaplanır (CSM dilim küresi dönüşte sabit).
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

### 5.3 Adım 3 — Bölge düzeltmeleri (a, b, d)

**(a) Atama: yalnız tamamen sığan bölgeye girer (öneri; S1).** Yerleşimin dünya kutusu (model
sınırları × matris; şekil sınırları biliniyor) bir bölgenin kutusuna küçük toleransla (öneri
2 cm) tamamen sığarsa o bölgeye (en küçüğüne) aittir; sığmayan bölgesizdir ve hep çizilir. Duvar,
döşeme, tavan iki odanın sınırına ya da dışarıya taştığı için bölgesiz kalır: oda gizlenince
yapı kaybolmaz. Model sınırları yüklenene kadar yerleşim bölgesizdir (görünür taraf), yüklenince
yeniden anahtarlanır (Z3'ün `onChange` yolu). Şema ipucundaki "sınır küresinin merkezi"
yazısı da düzeltilir (bugün kod yerleşim noktasını kullanıyor). Sığmayan ama bina içinde kalan
ara duvar / döşeme için S2.

**(b) Dış düğüm.** Dışarısı portal grafında bir düğümdür (`OUTSIDE`). Dış portal = bir tarafı
bölge, öbür tarafı dışarı olan portal (kapı, pencere, üst açıklık).
- Kamera hiçbir bölgede değilse yürüyüş dış düğümden tam ekran dikdörtgenle başlar; bölge ancak
  dış portaldan görünüyorsa çizilir. Bugünkü "bölge dışında hepsi görünür" kuralı kalkar.
- Kamera içerideyken dış portal geçilirse dış düğüme varılır; bölgesiz içerik zaten hep çizilir,
  dış düğümden başka binaların dış portallarına devam edilir (derinlik sınırı).
- Üretim (`zoneGeneration.ts`): oda hücreleriyle dış hücrelerin (sınıra ulaşan boşluk) sınır
  koşuları dış portal olur (dış kapı); pencereler için duvar hücrelerinin dikey profili birkaç
  yükseklikte taranır, boşluk dış portal olur (S3); tavanı olmayan odaya tavan yüksekliğinde
  yatay üst açıklık portalı (S4).
- Elle portal: otomatik bağlantı yalnız bir bölge bulursa öbür taraf dış (öneri; bugün
  `unlinked`). Yeni şema alanı gerekmez (S18).
- **Bütçe:** dış düğümden her binanın her dış portalını test etmek şehirde kare bütçesini (256)
  aşar ve bütçe aşımı "hepsi görünür"e düşer. Dış düğümden yalnız frustum içindeki ve belli
  mesafedeki dış portallar test edilir (dış portal ızgarası; mesafe adım 4'ün yükleme mesafesiyle
  aynı, öneri). Ölçümde portal testi sütunu var.

**(d) Bölgeye ait içerik HLOD'a girmez.** `tools/world/hlodInput.ts` / `hlodBuild.ts`
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

**Tasarım.** Bina = dış portalı olan bölgelerin iç portallarla bağlı bileşeni (öneri; S5).
Kamera binanın dış portallarına (ya da bölgelerine) yükleme mesafesinden yakın değilse binanın
iç mekânı yüklü değildir: bölgeye ait yerleşimler batch'e girmez, model / doku cache kullanımı
bırakılır. Yaklaşınca önyükleme (`compileAsync` dahil), uzaklaşınca histerezisle boşaltma
(öneri: yükleme 40 m × kalite çarpanı, önyükleme 1,5×, boşaltma 1,25×; F4'ün oranları; S6).
Kamera binanın bir bölgesindeyse bina her zaman yüklü. Kare başına yükleme bütçesi.

**Ne boşalır (S7):** öneri önce render: batch yerleşimleri + model cache kullanımı (GPU geometri,
doku); World aktörleri (oyun bileşenleri, fizik) yerinde kalır. World aktörlerinin de boşaltılması
WP'ye ikinci bir akış birimi ekler, ayrı karar.

**Üyelik yüklemeden önce gerekir (S8):** (a)'nın sığma kuralı model sınırlarını ister; modeli
yüklemeden "bunu yükleme" denebilmesi için sınırlar asset dizininde olmalı (öneri: `tools/assets`
model asset'inin yerel AABB'sini dizine yazar, build `forge/` dizinine taşır; HLOD, bölge ve
`forge stats` da kullanır). Seçenek: level parçası olarak üyelik dizini (bölge üretiminin çıktısı).

**Modüller:** `engine/world/buildingStreaming.ts` (yeni, saf), `render/sync/zoneDrawing.ts`
(bina residency, batch'e giriş / çıkış), `features/static-mesh/render.ts` (yerleşimi beklet,
cache kullanımını bırak), `engine/world/assetResidency.ts` ile ilişki, `tools/assets` + asset
dizini (S8), `?debug` (yüklü / önyüklenen bina, kuyruk).

**Veri / şema:** S8'e göre asset dizinine `bounds` (dizin biçimi; `.forge-cache/asset-index.json`
ve `dist/forge/`); bileşen şeması değişmez.

**Editör:** editörde akış kapalı (bütün iç mekân yüklü, düzenlenebilir; 5b'nin kısmi oturum
kuralıyla çelişmez), Play'de açık. Öneri; S7 ile birlikte sorulur.

**Kapı:** saf testler (bileşen, histerezis, bütçe, kamera içerideyken hep yüklü); `walk` yolu:
sızıntı yok (heap, geometri / doku sayısı döngü sonunda başa döner), en uzun kare ve p99 eşiği
(5b G-ölçütleri gibi, ölçümden önce yazılır), içeri girerken boş oda görülmez; iki arka uçta
smoke; kullanıcı görsel kabulü (`walk`, `facade`).

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

Öneri (S14): adım 3 (a, b, d) **R9b'nin tamamlanmasıdır**: (a) ve (d) R9b tasarımının düzeltmesi,
(b) R9b'nin "bölge dışında hepsi görünür" kuralının değişmesi; üçü de görünürlük kapsamında
(R9b kararı 2 "önce yalnız görünürlük"). R9b, adım 3'ün kabulüyle (yeni Z6 kabulü) kapanır; ana
planın R9b kaydına o zaman Z8–Z10 olarak işlenir. Adım 4 (c) yenidir: R9b kararı 2'nin ertelediği
bellekten boşaltma; R9c'nin kendi adımı.

## 8. Açık sorular (kullanıcı yanıtlayacak)

| # | Soru | Öneri | Gerekçe |
|---|---|---|---|
| S1 | Bölge ataması "sığma" mı "boyut eşiği" mi? | Sığma (dünya kutusu bölgeye tamamen, tolerans ~2 cm); sınır yüklenene kadar bölgesiz | Boyut eşiği (≥ 1,5 m bölgesiz) büyük dolabı hep çizer, sınırdaki küçük nesneyi (duvar tablosu) yanlış odaya atar; sığma yapıyı da sınırdaki eşyayı da görünür tarafta bırakır |
| S2 | Sığmayan ama bina içinde kalan ara duvar / döşeme | Önce hep çiz (bölgesiz); ölçümde payı büyükse üretimin voksel ızgarasından "dış hücreye değmiyor" üyeliği (bina üyeliği) | Şekil batch'leri az draw üretir, köşe işi küçük; bina üyeliği yeni kavram ve level parçası ister. Bina modelin içine gömülü iç duvar zaten bölünemez |
| S3 | Pencereler portal değilse dışarıdan iç boş görünür. Ne yapılsın? | Üretim duvarın dikey profilinden pencereyi bulur, dış portal yazar; kalanı elle; kabul ölçütü `facade` pozu | Cam materyalini portal saymak materyal bilgisine bağlanır ve şekillerde yok; yalnız elle portal şehirde ölçeklenmez |
| S4 | Tavansız oda (avlu, yıkık bina) | Üretim tavanı olmayan odaya yatay üst açıklık portalı yazar | Yürüyüş kendiliğinden çalışır (yukarıdan bakınca görünür); odayı bölgesiz bırakmak avlu eşyasını hep çizer |
| S5 | "Bina" (akış birimi) nasıl tanımlanır? | Portal grafında dış portalı olan bölgelerin bağlı bileşeni | Ek veri yok; elle `building` alanı yalnız bileşen yanlış çıkarsa (iki bina ortak portalla) |
| S6 | Bina akış mesafesi ve histerezisi | Yükleme 40 m × kalite, önyükleme 1,5×, boşaltma 1,25× (F4 oranları); şehirde ölçülür | Pencereden 40 m ötede iç mekân ekranda küçük; önyükleme `compileAsync` sıçramasını gizler, histerezis sınırda titremeyi önler |
| S7 | Akışta ne boşalır? Editörde akış? | Önce render (batch + model / doku); World aktörleri kalır. Editörde kapalı, Play'de açık | Oyun bileşenli aktörü boşaltmak WP'ye ikinci akış birimi ekler; editör her şeyi düzenleyebilmeli |
| S8 | Yüklemeden önce üyelik için model sınırları nereden? | Asset dizinine model AABB'si (`tools/assets` + build) | Genel: HLOD, bölge, `forge stats` da kullanır; level başına bayatlık yok. Seçenek üyelik level parçası |
| S9 | Gölge cull formülü ve kalite profiliyle ilişki | Texel kuralı `r ≥ τ · t_k`, τ profil alanı (`shadowCasterMinTexels`, öneri `ultra` 1,5, `high` 2, düşükler 3); level / nesne geçersiz kılması yok (bölgenin `alwaysCastShadows`'u gibi gerekirse sonra) | Yarıçap × K kuralı harita boyutunu ve kaskat sayısını görmez; texel kuralı profille kendiliğinden ölçeklenir. τ ölçümle |
| S10 | Gölge kesilmesi solsun mu? | Evet, `maskShadowNode` dither, izinli son bölmenin son %15'i | Kaskat sınırında küçük gölgenin birden kaybolması sokakta görülür; maliyeti ihmal edilebilir |
| S11 | Yakın kaskadın kapsadığı gölge düşürücü uzak kaskattan çıkarılsın mı? | Şimdi değil; adım 2 ölçümünden sonra | Gölge hacmi kaskattan taşabilir (gün batımı); yanlış gizleme riski, kazancı adım 2'den sonra küçük olabilir |
| S12 | Instanced küçük nesne: GPU yolu mu hücre bölmesi mi? | İkisini `street`'te ölç; ön tahmin GPU yolu (yayılma + yerleşim koşuluyla) | Hücre draw'ı artırır (azalttığımız şey); GPU yolu draw'ı sabit tutar, gölge kuralını örnek başına uygular. Bedeli dispatch, sayısı sınırlı |
| S13 | World Partition çoklu menzil gerekli mi? | Şimdilik hayır | Draw'ı detay cull + adım 5 çözer; menzil yalnız bellek / yükleme sorunuysa |
| S14 | Adım 3 R9b'nin tamamlanması mı, ayrı mı? | R9b'nin tamamlanması (Z8–Z10, yeni Z6 kabulü); adım 4 R9c'nin | §7 |
| S15 | Şehir sahnesinin modelleri | Prosedürel deterministik GLB, yalnız ölçüm kopyasında | Şekiller slot üretmez (draw dili yanlış çıkar); referans projesi modelleri az arketip; lisans sorunu yok |
| S16 | Çok katlı bina bölgesi | Şehirde 2 bina iki katlı; üretim tek koşuda birden çok kat dilimi (bugün `--floor` tek, ikinci koşu ilkini siler) — ayrı alt adım mı, adım 3'ün içinde mi? | Şehirde çok katlı bina olağan; bugünkü üretim tek katlı |
| S17 | R9c'nin foliage sırasıyla (F0–F7, R10) yeri | Adım 1 hemen (çakışmasız); adım 2 F1 commit'lendikten sonra, F7 / R10'dan önce (G6 gölge kuralıyla ölçülsün); adım 3–5 F serisiyle paralel | Ortak dosyalar §6; G6'nın gölge payı adım 2'ye bağlı |
| S18 | Dış portal için şema alanı? | Gerek yok: otomatik bağlantı tek bölge bulursa öbür taraf dış | Kullanıcının önerisi; yanlış boyutlu iç portal dış olur, hata görünür tarafta. Editör rengi ayırt eder |

## 9. Riskler ve ölçülmeden verilmeyecek kararlar

**Riskler**
- Dış düğüm bütçesi: büyük şehirde portal testi bütçeyi aşarsa "hepsi görünür"e düşer; ızgara ve
  mesafe sınırı şart (§5.3).
- Sınırların geç gelmesi: model yüklenince yeniden anahtarlama instanced batch'i yeniden kurar;
  açılışta toplu yeniden kurma sıçraması. S8 bunu da giderir.
- Gölge kesilmesi: kaskat sınırında, gün batımında uzun gölgede görünebilir (S10, kullanıcı kabulü).
- Katman bütçesi: three katmanları 32 bit; 0–15 dolu, gölge sınıfı 16–19. Yeni görünüm türü
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
- GPU yolu mu hücre bölmesi mi (S12), yerleşim / yayılma eşikleri.
- Bina akış mesafeleri (S6) ve yükleme bütçesi.
- S2'nin bina üyeliği, S11'in kaskat iç içe kesimi, dispatch birleştirme.
- WP çoklu menzil (S13) ve atlas (§5.6).
- `GPU_STATIC_MIN_TRIANGLES` (S1 eşiği) değişikliği.

## 10. İlerleme kaydı

| Tarih | Sürüm | Ne oldu |
|---|---|---|
| 2026-11-18 | v0.1 | İlk taslak (kullanıcıyla tartışmanın planı): katmanlar, sıra 1–6, şehir sahnesi, adım tasarımları, R9b'nin durumu, açık sorular S1–S18. Kod yok |
| 2026-11-18 | v0.1 | Adım 1'in üreteci, geçici proje hazırlığı ve `measure:city` koşucusu eklendi. Varsayılan normal ve ağır sahnelerde 28.964 model yerleşimi, 234 zemin kat odası, 312 iç portal ve 36 HLOD hücresi üretildi. Gerçek WebGPU referans koşusu ve sonuç tablosu §5.1’de. |
