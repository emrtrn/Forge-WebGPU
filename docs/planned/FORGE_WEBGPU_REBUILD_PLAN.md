# Forge WebGPU — Yeniden İnşa Planı

**Sürüm:** v0.7 · 2026-11-10 (v0.6'dan fark: K10, K11, A10, A11 karara
bağlandı, dördü de öneri olduğu gibi. v0.6: belge incelemesi işlendi — açık
kararlar K10–K11 ve A10–A11 eklendi; Faz 0'a özellik envanteri ve GO sayıları,
Faz 1 S4'e compute culling prototipi, 2a'ya 50.000 aktör ölçümü ve DOM'suz
Details tanımı, 2b'ye test sınıflaması ve içe aktarıcı kabulü girdi; Faz 5
5a–5d'ye bölündü; adı geçmeyen alt sistemler fazlara atandı; §11 ilerleme kaydı
açıldı. v0.5: K2, K4–K9 karara bağlandı. v0.4: depoya taşındı, A1–A9 işlendi,
Faz 1 ∥ 2a, cut-over 2b'ye kaydı)
**Durum:** Bütün kararlar kapalı (K1–K11, A1–A11; 2026-11-10). Faz 2a sürüyor:
depo iskeleti, katman denetimi + öz-testi, kapılar ve çekirdek (şema DSL'i,
normalize, geçiş zinciri, şema kaydı, `forge.level/1` veri modeli, form tanımı,
JSON Schema), asset modeli (A10), hücre veri modeli (A11) kuruldu; 50.000 aktör
ölçümü eşik içinde; kayıt servisi, uygulama kabuğu ve oyun projesi sözleşmesi
kuruldu. Sıradaki işler: depo düzeni (content pack'ler), kapıların bekleyenleri;
Faz 0 envanteri ve referans görüntüleri, Faz 1 spike (paralel).
**Mimari:** [FORGE_WEBGPU_ARCHITECTURE.md](FORGE_WEBGPU_ARCHITECTURE.md) —
veri modeli, katmanlar, özellik modülleri, oyun projesi sözleşmesi. Bu plan
fazların sırasını, o rapor yapının kendisini tanımlar; çelişkide rapor geçerlidir.
**Yerini aldığı belge:** `FORGE_WEBGPU_EDITION_MASTER_PLAN.md` (v0.1; Forge
deposunda `C:\Users\emret\Desktop\Forge\docs\planned\`). v0.1 aynı
depoda ikinci bir editör öneriyordu; 2026-11-10 kararıyla hedef değişti. v0.1'in
geçerli ilkeleri §2 ve §9'a taşındı.
**Ölçüm tabanı:** Forge `main` @ `0396ad79`, `three@0.187.0` (npm'deki en son
sürüm, 2026-10-30). Mimari raporun ölçümleri 7 commit sonrasında, `b2efc208`'de
alındı; iki belge arasındaki birkaç satırlık farklar (ör. `SceneApp` 16.375 /
16.379) bundandır.

> **Hedef:** Açık dünya oyunlarında daha iyi görsel kalite. Forge (WebGL) bakım
> moduna geçer ve basit projeler için kullanılmaya devam eder. Forge WebGPU,
> Forge'un mimarisini referans alan ayrı bir depoda kurulur. World Builder, araç
> hasarı ve terrain deformasyonu oraya taşınır. three.js'in WebGPU örnekleri ve
> addon'ları (SSR, SSGI, TRAA, LightProbeGrid, LightMapper, ClusteredLighting,
> MeshletDrawingPipeline…) uyarlama gerekmeden kullanılabilir hâle gelir.

---

## 1. "Yeniden inşa" neyi kapsıyor — ölçülmüş tablo

Forge'un mimari sınırları (`verify:imports`) işe yaramış: `engine/` altında
`render-three` dışındaki 23 dizinin hiçbiri three.js import etmiyor (tek istisna
bir fizik dosyası). Bu yüzden yeniden inşa her şeyi sıfırdan yazmak değil; üç
ayrı işlem:

- **Taşı:** olduğu gibi kopyala, testleriyle doğrula.
- **Uyarla:** three çekirdek sınıfları (`Mesh`, `Object3D`, `BufferGeometry`…)
  WebGPU tarafında aynı; yalnız renderer'a dokunan yerler değişir.
- **Yeniden yaz / kur:** GLSL, `onBeforeCompile`, `EffectComposer`, WebGL render
  target'ları ve büyük orkestratör sınıfları.

| Katman | Boyut | three bağımlılığı | İşlem |
|---|---|---|---|
| `engine/*` alt sistemleri (ai, physics, terrain, navigation, movement, audio, dialogue, behavior, worldbuilder algoritmaları, environment, perf, animation, assets, input, loading, perception, ui, vfx, gameplay, core) | ~53.000 satır | yok | **Taşı** (`engine/assets` manifesti A10'a göre yeniden kurulur) |
| `engine/scene`, `engine/persistence`, `engine/world` (level veri modeli, kayıt oyunu, hücreler) | ~17.000 satır | yok | **Yeniden tasarla** (mimari §4.4–4.6); algoritmalar korunur |
| `tools/` (World Builder betikleri, doğrulayıcılar) + `builder/` | ~44.700 satır | 3 dosya | **Taşı**; `saveValidator.ts` (4.640 satır) şema kaydıyla yer değiştirir |
| `tests/engine` | 176 dosya, ~42.000 satır | — | Modülüyle birlikte **taşı**; `check()` → Vitest `test()`, modülün yanına (mimari A5). Yeniden tasarlanan `scene` / `persistence` / `world` modeline dayanan testler mekanik çevrilmez, yeniden yazılır (2b başında sınıflanır) |
| `vite.config.ts` dev endpoint'leri | 2.632 satır | — | **Kısmen taşı**, modüllere bölerek; 20'den fazla `/__save-*` ucu taşınmaz, şemaya göre çalışan genel uç ailesiyle yer değiştirir (mimari §4.6) |
| `engine/render-three` | 113 dosya, ~23.300 satır | 101 dosya; 42'si WebGL'e özgü | 42 dosya **yeniden yaz** (TSL); kalanı **uyarla** |
| `src/scene` (`SceneApp` 16.375, `RuntimeSceneApp` 7.182 satır) | 83 dosya, ~40.800 satır | 34 dosya | **Yeniden kur** — referans alınır, büyük sınıflar bölünür |
| ↳ `src/scene/capabilities` (runtime modülleri) | 30 dosya, ~7.500 satır | 11 dosya | **Uyarla** |
| `src/editor` (DOM panelleri) | 88 dosya, ~38.800 satır | 14 dosya; 6'sı WebGL'e özgü | **Uyarla** — `SceneApp` bağımlılığı (26 dosya) yeni servislere |

Kodun yaklaşık yarısı olduğu gibi taşınır. Asıl yeni iş: mimari iskelet (veri
modeli, şema kaydı, kayıt servisi, özellik modülleri), render katmanı, uygulama
kabuğu (editör + runtime orkestrasyonu) ve editör viewport'u.

### 1.1 Değerli sistemler bu ayrımda nereye düşüyor

| Sistem | Three'siz çekirdek (taşınır) | Yeniden yazılacak / uyarlanacak render parçası |
|---|---|---|
| World Builder | `engine/worldbuilder` (47 dosya, ~12.600 satır), `tools/world` (~2.900 satır, CLI dahil) | Render parçası yok; level yazan çıktı katmanı yeni formata, editör penceresi (`panels/world`, ~1.600 satır DOM) yeni editöre uyarlanır |
| Terrain deformasyonu | `deformationField`, `deformationStateCodec`, `terrainHeightQuery`, `terrainDeformationModule` | `terrain/terrainDeformation.ts` (556 satır, GLSL) → TSL/compute |
| Araç hasarı | `physics/deformable`, `physics/fracture` (~2.000 satır, Voronoi bake dahil) | `dentWear.ts` (101 satır, GLSL) → TSL; `deformableMeshSync`, `fractureGeometry`, `deformablePartNodes` uyarlanır |
| Araç fiziği | `engine/physics` (Rapier, ~8.500 satır) | Tekerlek görseli uyarlanır |

Bu üç sistemin değeri neredeyse tamamen three'siz çekirdekte. Faz 2b'de
taşınırlar; görsel parçaları ilgili fazda bağlanır.

---

## 2. Mimari ilkeler (Forge'dan alınan dersler)

1. **Aynı katman sınırları, ilk günden zorunlu.** `core` ve `engine` three'siz
   kalır; `render` katmanı (ve özelliklerin `render.ts` dosyaları) `three/webgpu`
   ve `three/tsl` import eden tek yerdir; editör dinamik import arkasındadır ve
   oyun bundle'ına girmez; yeniden kullanılabilir oyun çatısı `gameplay`
   katmanındadır, oyuna özel kod oyunun deposunda (mimari §4.2, §4.8). Katman
   denetimi (dependency-cruiser + öz-test, mimari A3) ve `verify:dist --strict`
   ilk commit'te kurulur.
2. **Tanrı nesnesi yok.** `SceneApp` ve `RuntimeSceneApp` yeniden üretilmez.
   Editör küçük servislere bölünür: viewport host, seçim, transform aracı,
   kayıt, içerik. Runtime, `FORGE_LAYERED_RUNTIME_PLAN`'daki LevelRuntime +
   capability modülü düzenine kurulur. Editör ve oyun sahneyi aynı kurucuyla
   inşa eder; "editörde başka, oyunda başka" görüntü olmaz.
3. **Materyal sözleşmesi.** Işık alan her yüzey `MeshStandardNodeMaterial` /
   `MeshPhysicalNodeMaterial` slotları (`colorNode`, `normalNode`,
   `positionNode`, `roughnessNode`…) üzerine kurulur. `fragmentNode` yalnız
   ışıksız yardımcı pass'lerde kullanılır: r187'de `fragmentNode` MRT
   çıktılarını atlıyor (`NodeMaterial.js` setup), TRAA/SSR/SSGI ise bunlara
   dayanıyor.
4. **Tek render pipeline, kalite profilleri.** Tek `RenderPipeline`: MRT'li
   sahne pass'i → GTAO / SSR / SSGI → TRAA → bloom / DoF → tonemap. Her efekt bir
   profil anahtarıdır (Compatibility / Balanced / Cinematic). three addon'ları
   kendi ince sarmalayıcı modüllerimizin arkasında kullanılır; deneysel API
   değiştiğinde tek yer düzelir.
5. **Ölçek için GPU tarafı.** Açık dünyada WebGPU'nun asıl kazancı: instancing /
   `BatchedMesh`, foliage ve prop'lar için compute culling + indirect draw;
   okyanus FFT'si, partiküller ve terrain deformasyonu için compute.
6. **Gerçek WebGPU doğrulaması** (v0.1 ADR-005). `renderer.backend.isWebGPUBackend`
   kontrol edilir; WebGL2 backend'ine sessiz düşüş "WebGPU çalışıyor" sayılmaz
   ve ekranda gösterilir.
7. **Yeni tek tip veri formatı + tek yönlü içe aktarıcı.** Level, tek tip aktör
   ve şemalı bileşen modeliyle yazılır (mimari §4.4–4.5); her şey kalıcı GUID
   taşır. Forge WebGL level'ları ve sidecar'ları (`*.vehicle.json`,
   `*.fracture.json`, `*.deformable.json`, `*.effect.json`, `*.skeleton.json`,
   terrain, world / foliage hücreleri) `tools/import-forge-webgl` ile bir kez
   çevrilir; çevrilemeyen alan sessiz düşmez, raporlanır. Terrain tile'ları
   gibi ikili veri olduğu gibi kalır. İki formatı birlikte yaşatmak hedeflenmez.
8. **Eşzamanlı kayıt koruması ilk günden.** Forge WebGL'de layout kaydında sürüm
   kontrolü yok (mevcut 409'lar yalnız içerik oluştururken var olan dosyayı
   korur). Yeni dev server her yazmada temel sürümü kontrol eder.
9. **Görünüm ayarı kullanıcıda.** Claude sistemleri kurar ve parametreleri
   editöre açar; ışık / renk / efekt ayarını ve görsel kabulü kullanıcı yapar.
10. **Ölçüm disiplini** (v0.1 §7.2). Her performans ölçümü şunlarla kaydedilir:
    commit, three sürümü, backend kanıtı, tarayıcı, GPU + sürücü, sahne + kamera
    pozu, çözünürlük + DPR, profil, medyan / p95 kare süresi, GPU süresi, draw
    call. Yükleme ölçümlerinde ayrıca: level yükleme süresi (soğuk / sıcak),
    pipeline / shader derleme süresi ve ölçülebiliyorsa GPU bellek kullanımı;
    yeni sekme Play'in soğuk başlangıcı (mimari A6) bu formatta ölçülür.
    Ölçülmeyen şey "ölçülmedi" yazılır; CPU süresi GPU süresi diye sunulmaz.
11. **Algoritmalar olduğu gibi, iskelet yeniden.** Fizik, terrain verisi, AI,
    nav, hareket, ses, diyalog ve World Builder algoritmaları taşınırken
    tasarımları değiştirilmez; eşdeğerliği testler kanıtlar. Veri modeli,
    serileştirme, kayıt, uygulama kabuğu ve editör ise mimari rapora göre
    yeniden tasarlanır. Taşınan modülde iyileştirme ayrı bir adımdır.

---

## 3. Forge WebGL'in geleceği

- **"Arşiv" = bakım modu**, GitHub'ın salt okunur arşivi değil. Model 1 oyunları
  (minigolf, miniracer, platformer, freshcounter) upstream'den hata düzeltmesi
  çekmeye devam eder; WebGPU'ya geçişleri oyun başına ayrı karardır. Ridgebound
  (Model 2) göç edene kadar Forge WebGL'de kalır.
- Cut-over'da (Faz 2b başı; 2026-11-10 kararıyla 2a'dan kaydı)
  `forge-webgl-final` etiketi atılır; `CLAUDE.md` ve README'ye bakım modu notu
  eklenir. Sonrasında yalnız hata düzeltmesi. Etiket, algoritmaların kopyalandığı
  Forge commit'ini işaretler; kopyalama 2b'de başladığı için etiket de orada atılır,
  böylece 2b'ye kadar Forge WebGL'de biten three'siz işler etikete girer.
- **K6 kuralı (karar 2026-11-10):** Faz 1 GO'ya kadar `engine/render-three`'ye
  yeni iş yalnız şu üç koşulla girer: oyunun şu anki bir kilometre taşı istiyor;
  algoritma / parametre kısmı three'siz `engine/` modülünde ve shader ince; yeni
  `onBeforeCompile` yaması ve WebGL görsel kabul cilası yok. GO'dan sonra yalnız
  hata düzeltmesi yapılır; bu katman yeniden yazılacak. NO-GO çıkarsa kural
  kalkar. Three'siz sistemler (World Builder, fizik, terrain verisi,
  save-game) cut-over'a kadar Forge WebGL'de gelişmeye devam edebilir;
  cut-over'da olduğu gibi taşınırlar.

### 3.1 Devam eden işler için öneri

| İş | Öneri |
|---|---|
| World Builder ada + okyanus (çalışma ağacında, commit'lenmemiş) | Generator tarafı (`engine/worldbuilder`, `tools/world`) bitirilip commit'lenir; okyanus shader'ına yeni yatırım yapılmaz (WebGPU'da compute ile yeniden yazılacak) |
| Terrain deformasyonu Faz 5 (kalıcılık) | Three'siz; Forge WebGL'de bitebilir, taşınır |
| Terrain deformasyonu Faz 6 (editör yüzeyi) | Forge WebGPU Faz 8'e devredilir |
| Araç hasarı / Doruk K-180 form ve içerik işi | Motordan bağımsız; sürer |
| WebGL görsel kabulleri (RDR2 su, deformable Faz 7, WES) | Kapatılır; kabul WebGPU'da verilir |
| Adaptif kalite planı | WebGPU kalite profillerine (§2.4) devredilir |
| Editör UI redesign planı | Plan dosyası Forge'da 2026-07-15'te kaldırıldı (`11bb20e9`); bir kısmı panellere işlendi. Forge WebGPU'da paneller bugünkü hâliyle taşınır (K7) |

---

## 4. Faz planı

Büyüklükler görelidir (S < M < L < XL); süre tahmini değildir.

| Faz | Amaç | Büyüklük | Bağımlılık | Kapı |
|---|---|---|---|---|
| 0 | Kararlar + özellik envanteri + referans görüntüler | S | — | §8 kararları kayıtlı; envanter çıktı; WebGL baseline alındı; GO sayıları kondu |
| 1 | Doğrulama spike'ı (Forge `spikes/webgpu/`) | M | 0 (2a ile paralel) | **GO / NO-GO** kullanıcı kararı |
| 2a | Mimari iskelet: veri modeli, şema kaydı, kayıt servisi, özellik modülleri, SDK, sınır zorlaması | L | 0, A10, A11 (1 ile paralel) | İlk özellik (Height Fog) iskeletten uçtan uca geçiyor; 50.000 aktör ölçümü eşik içinde; CI yeşil |
| 2b | Cut-over (`forge-webgl-final`) + three'siz alt sistemlerin taşınması + Forge WebGL içe aktarıcısı | M | 2a, 1 (GO) | Taşınan testler yeşil; referans level'lar çevrildi, içe aktarma raporu ve sayım karşılaştırması temiz |
| 3 | Render çekirdeği + level görüntüleyici | L | 2b | Referans sahnelerde ilk görsel kabul |
| 4 | Editör çekirdeği | L | 3 | Editör smoke'u (yerleştir / taşı / undo / kaydet / yeniden aç) |
| 5 | Açık dünya: 5a terrain, 5b akış + HLOD, 5c foliage, 5d editör araçları + World Builder penceresi | XL | 3, 4 | Alt faz başına kapı; sonda açık dünya sahnelerinde görsel + performans kabulü |
| 6 | Oyun runtime'ı + araçlar + Ridgebound pilotu (K8) | L | 3; araç kapısı için 5a (5b–5d ile paralel yürüyebilir) | Runtime smoke'u; araç terrain üstünde sürülüyor; pilot kopya `check:projects`'te yeşil |
| 7 | Su ve yansımalar | L | 5 | Su görsel kabulü |
| 8 | Terrain deformasyonu + araç hasarı | L | 5, 6 | Ridgebound kopya sahnesinde senaryolar |
| 9 | İleri aydınlatma (her teknik ölçümle) | M–L | 5 | Teknik başına ölçüm + kullanıcı kararı |
| 10 | Ridgebound göçü + sürüm | M | 8 | Ridgebound Forge WebGPU'da tam akışla çalışıyor |

Sıranın mantığı: en büyük bilinmeyen (WebGPU açık dünyada istenen kaliteyi kabul
edilebilir maliyetle veriyor mu?) en başta, ucuz bir spike'la cevaplanır. Mimari
iskelet (2a) taşımadan ve render'dan önce gelir, çünkü Forge WebGL'de sonradan
düzeltilen kararların çoğu (veri modeli, kimlik, kayıt, kayıt noktaları) en başta
verilmesi gereken kararlardı. **Faz 1 ile 2a paralel yürür** (karar 2026-11-10):
2a'nın işi (aktör modeli, şema, kayıt servisi, SDK, katman denetimi) three'siz ve
renderer'dan bağımsızdır; spike NO-GO çıksa da iskelet korunur ve `render` katmanı
klasik `WebGLRenderer` ile kurulur (K10). GO / NO-GO kapısı 2b'nin, yani
cut-over'ın önündedir.
Görsel
kalite (Faz 3) editörden önce gelir, çünkü projenin amacı o. Editör (Faz 4) açık
dünya araçlarından önce gelir, çünkü sculpt / paint / foliage / World Builder ve
görünüm ayarı onun üstünde çalışır.

### Faz 0 — Kararlar ve referans görüntüler

- [x] §8'deki K1–K9 ve mimari raporundaki A1–A9 kararları (hepsi 2026-11-10).
- [x] v0.6 incelemesinin açtığı kararlar: K10, K11 (§8) ve A10, A11 (mimari
      §8) — hepsi 2026-11-10'da, öneri olduğu gibi.
- [ ] **Forge özellik envanteri:** Forge WebGL'in kullanıcıya görünen
      özellikleri (editör panelleri ve modları, aktör / bileşen türleri, asset
      türleri, runtime alt sistemleri, araçlar) tek tabloda; her satıra hedef
      faz ya da "taşınmayacak" + gerekçe yazılır. Tablo `docs/PORT_LOG.md`
      kapsama matrisinin paydasıdır (§7); fazı olmayan satır kalmaz.
- [ ] Referans sahneler seçilir: çok tile'lı bir terrain level'ı, Island, bir
      World Builder rastgele dünyası, Ridgebound'un **kopya** bir sahnesi.
- [ ] Her sahnede sabit kamera pozlarından Forge WebGL ekran görüntüleri ve
      `?debug` ölçümleri (kare süresi, GPU süresi, draw call); referans R1'de
      (K9), §2.10 formatında.
- [ ] **GO ölçüt sayıları:** baseline'dan sonra kullanıcıyla konur ve Faz 1'in
      "GO ölçütleri" paragrafına yazılır (profil × çözünürlük başına kare
      süresi / GPU süresi sınırı, S4 için draw call ve CPU kare süresi sınırı).
      Sayılar spike ölçümünden önce yazılmış olur.
- [x] K6 kuralı yürürlükte (2026-11-10): GO'ya kadar seçici, GO'dan sonra tam
      durdurma (§3).

### Faz 1 — Doğrulama spike'ı (GO / NO-GO)

Yer: Forge `spikes/webgpu/`. Mevcut spike düzeni geçerli: uygulama build'ine,
kök `tsc`'ye ve `verify:imports`'a girmez; tip kontrolü `npx tsc -p spikes`.
Forge'un three'siz terrain / level yükleyicilerini olduğu gibi kullanır. Kod
atılabilir; sonuçlar bu plana yazılır.

- [ ] **S1 Boot:** `WebGPURenderer` + `await renderer.init()`, gerçek backend
      kanıtı, GPU timestamp (`trackTimestamp`), adaptör / cihaz bilgisi.
- [ ] **S2 Terrain:** referans terrain'in tile'ları TSL CDLOD malzemesiyle:
      `positionNode` ile displacement, `sampler2DArray` boya katmanları, normal;
      `CSMShadowNode` gölgesi; `SkyMesh` + sis. Görsel yükseklik Rapier
      heightfield ile aynı mı?
- [ ] **S3 Pipeline:** MRT + TRAA + GTAO + SSR + SSGI + bloom; her efektin GPU
      maliyeti ayrı ölçülür (1080p ve 1440p).
- [ ] **S4 Açık dünya stresi:** referans level'ın gerçek yerleşim ve foliage
      sayılarıyla draw call ve CPU kare süresi; WebGL baseline'ıyla
      karşılaştırma. WebGPURenderer'ın nesne başına CPU maliyeti burada ölçülür.
      Aynı sahnede küçük bir **compute culling + indirect draw** prototipi
      (tek foliage türü yeter) kurulur ve aynı formatta ölçülür: §2.5'in ve
      K4'teki "fallback yok" kararının dayandığı yol r187'de çalışıyor mu,
      kazancı ne kadar?
- [ ] **S5 (isteğe bağlı):** `LightProbeGrid` bake süresi ve görsel etkisi;
      `ClusteredLighting` ile N nokta ışık.
- [ ] Sonuç tablosu + yan yana ekran görüntüleri bu plana yazılır.

**GO ölçütleri** (sayılar Faz 0 baseline'ından sonra kullanıcıyla konur ve
buraya yazılır; henüz konmadı): görsel fark kullanıcıya göre anlamlı; referans
sahnede kare süresi konan sınırın içinde; S4'teki CPU maliyeti instancing ve
compute culling + indirect draw prototipiyle **ölçülerek** sınırın içine
iniyor; terrain görseli collider ile eşleşiyor.

**NO-GO (K10):** 2a kapısına kadar tamamlanır; iskelet korunur ve `render`
katmanı Forge `render-three`'den (klasik `WebGLRenderer`) uyarlanır; 2b'ye
~23.300 satırlık render uyarlaması eklenir. WebGL tarafındaki kalite seçenekleri
(`SSRPass`, `TAARenderPass`, `LightProbeGridWebGL`) o katmanda değerlendirilir.
`WebGPURenderer`'ın WebGL2 backend'i çare sayılmaz: NO-GO'nun nedeni renderer'ın
nesne başına CPU maliyetiyse aynı maliyeti taşır.

### Faz 2a — Mimari iskelet (Faz 1 ile paralel)

Bu fazın her maddesi [mimari raporun](FORGE_WEBGPU_ARCHITECTURE.md) bir
bölümünü uygular.

- [x] Depo oluşturulur (K1): Vite + TypeScript strict, `three@0.187.0` sabit
      sürüm (K5), Rapier, Vitest. Portlar: dev **5183**, smoke **5283**
      (`strictPort`). Araç sürümleri Forge ile aynı ana sürümde tutuldu
      (TypeScript 5.9, Vite 7, Rapier 0.19.3 tam sabit): 2b eşdeğerlik
      testlerini sürüm farkı bulandırmasın; TypeScript 7 / Vite 8 / Rapier
      yükseltmesi ayrı adım. (2026-11-10)
- [x] Katman denetimi: dependency-cruiser kuralları (yol ve dosya rolüne göre)
      + kasıtlı ihlal fixture'ıyla öz-test; iki tsconfig (uygulama + Node
      araçları) (mimari §4.2, A3). `.dependency-cruiser.cjs` 14 kural;
      `tests/fixtures/layer-violations` 19 ihlal (çok satırlı import,
      `import type`, `export * from`, dinamik `import()`, çözülemeyen import);
      öz-test eksik ya da fazla ihlalde kırılır. (2026-11-10)
- [x] Çekirdek: aktör + bileşen modeli, GUID'ler, şema DSL'i ve kaydı, sürüm
      geçiş zinciri, özellik kayıt noktaları (`defineFeature`), dosya boyutu
      bütçesi (mimari §4.3–4.5). `src/core`: on alan türlü şema DSL'i
      (tanımlar dondurulmuş düz veri, tip tanımdan türer), yükleme ve kaydın
      ortak tek normalize fonksiyonu, geçiş zinciri, örnek tabanlı şema kaydı
      (`registerComponent`), `defineFeature` + `installFeatures`,
      `forge.level/1` ve `forge.actorClass/1` veri modeli (uzamsal hiyerarşi,
      prefab override'ları, tekillik), DOM'suz Details form tanımı, JSON Schema
      dışa aktarımı; örnek özellik `src/features/height-fog`. `subsystems`,
      `render` ve editör kayıt noktaları kendi katmanlarıyla gelir. Override
      girdilerinin sürüm geçişi asset modeli adımında kapandı (mimari §4.4).
      (2026-11-10)
- [x] Asset modeli (A10): asset kimliği, manifest / dizin, referans bütünlüğü
      (taşıma, yeniden adlandırma, silme, asılı referans); içe aktarmada tür +
      lisans + kaynak zorunlu ve CI'da kapı (mimari D16, §4.10). `src/core/assets`
      (saf): `defineAssetType` + `registerAssetType` (yerleşik belge türleri
      `forge.level`, `forge.actorClass`), `forge.assetMeta/1` normalize'ı
      (lisans SPDX ya da `LicenseRef-…`, `Unknown` reddedilir), kimlik geçişi,
      şemadan yürüyen referans toplama + ters dizin, bütünlük + `planDelete`,
      dizinden beslenen `ClassResolver`. DSL'e metin alan türü eklendi. `tools/assets`:
      içerik kökü taraması, `.forge-cache/asset-index.json` önbelleği,
      `verify:assets` kapısı (gate + CI), `assets:index`. Yeni katman kuralı
      `src-no-node-builtins`. Override girdileri sürüm etiketi taşır, geçişler
      kısmi veriyle çalışır (mimari §4.4). Testler `tests/fixtures/assets`'in
      geçici kopyasında. Bugün depoda içerik kökü yok; kapı 0 asset görür.
      (2026-11-10)
- [x] Hücre / akış veri modeli (A11): hücre dosya biçimi, dizin dosyası, hücre
      ataması, hücreler arası referans kuralı. Akışın kendisi 5b'de; burada
      yalnız veri biçimi ve kayıt servisiyle bağı kurulur. Level bir klasör:
      `level.json` (kalıcı katman + `settings.cellSize`, varsayılan 128 m,
      ızgara kapatılamaz), `cells.json` (`forge.levelCells/1`, dosya
      revizyonları), `cells/<x>_<z>.json` (`forge.levelCell/1`). Aktör bayrağı
      `spatiallyLoaded`; atama kök konumundan, alt aktör kökünü izler, singleton
      ağacı kalıcı katmanda; `parent` artık dosya başına denetlenir.
      `src/core/level`: `cells.ts` (ızgara + `assignCells`), `cellDocs.ts`
      (normalize + JSON Schema), `levelParts.ts` (`mergeLevelParts`,
      `splitLevel`, `partsToWrite`, `planLevelFiles`, `nextCellIndex`,
      kanonik `stringifyDocument`). Asset dizini level klasörlerini birleştirip
      dosyalar arası kuralları denetler (çift kimlik / singleton, dizin ↔ dosya,
      yanlış hücre uyarısı, asılı `actorRef`); `tools/assets` JSON dosyalarına
      bayt revizyonu koyar, dizinle uyuşmayan dosya kapıyı kırar. Fixture level'ı
      klasör düzeninde. Yarım kalan kaydın kurtarılması kayıt servisinde
      (mimari §4.4 hücre modeli uygulaması). (2026-11-10)
- [x] **Ölçek ölçümü:** 50.000 aktörlük level'da yükleme, kayıt ve geçiş
      zinciri süresi + bellek (mimari §4.4 "ölçek yedeği", §7). Eşik ölçümden
      önce bu maddeye yazılır; aşılırsa mimari §4.4'teki çareler sırayla
      denenir. Aynı level Faz 4'te Outliner ölçüm sahnesidir.
      *Eşikler (R1, ölçümden önce yazıldı, 2026-11-10):* level sabit tohumlu
      üretilir (`npm run bench:level`; 4 km × 4 km, `cellSize` 128 m, ~%80
      düz statik mesh, ~%15 override'lı sınıf örneği, ~%5 alt aktör, birkaç
      kalıcı aktör). Bir soğuk + 5 ılık koşu; medyan / p95.
      S1 bütün level yükleme (disk → normalize → birleştirme) ≤ 2 s;
      S2 tek hücre yükleme p95 ≤ 4 ms; S3 tek aktör düzenle + kayıt planı
      (kirlenen parçalar, normalize, kanonik metin, revizyon) ≤ 50 ms;
      S4 tam kayıt (bölme + bütün dosyalar + revizyon + diske yazma) ≤ 3 s;
      S5 bütün bileşenler eski sürümdeyken S1 ≤ 1,5 × S1; S6 asset dizini
      kurulumu ≤ 3 s; S7 birleşmiş level heap artışı ≤ 150 MB, diskte level
      ≤ 50 MB.
      *Sonuç (R1, Node 24.19, 2026-11-10, `f60f79a`):* 50.000 aktör (21 kalıcı),
      1.024 hücre. İlk koşuda S1 2.066 ms, S3 109 ms, S4 6.365 ms eşiği aştı;
      sebep veri biçimi değil uygulamaydı (`splitLevel` her hücre için bütün
      aktörleri tarıyordu, birleştirme / bölme her aktörü kopyalıyordu,
      `assignCells` aktör başına nesne ayırıyordu, bench yükleyicisi dosyaları
      sırayla okuyordu). Düzeltmeden sonra iki koşu, medyan (p95):
      S1 816–897 ms (929–956); S2 hücre başına 1,13–1,16 ms (p95 1,43–1,58,
      en büyük hücre 74 aktör); S3 38,5–41,4 ms (49–54; eşik medyana
      uygulandı, p95 sınırda); S4 2.219–2.225 ms; S5 1,11–1,26 × S1;
      S6 1.702–1.743 ms; S7 heap 57,6 MB, disk 37,8 MB. Hepsi eşik içinde;
      mimari §4.4'teki ölçek çarelerine (sütunlu transform, yoğun depolama)
      gerek yok. Ölçüm sırasında bulunan hata düzeltildi: yanlış hücredeki
      aktörün iki hücresi kayıtta birlikte yazılır (aksi halde aktör ya
      hiçbir dosyada ya da iki dosyada kalıyordu). S3'teki en büyük kalem
      bütün level'ın yeniden ataması (~29 ms); kayıt servisi artımlı atamaya
      geçerse düşer. Rapor `.forge-cache/bench/level-scale/report.json`.
- [x] Kayıt servisi: işlem / undo, sıralı atomik çok dosyalı kayıt, revizyon
      çakışma kontrolü (409), şemaya göre çalışan genel kayıt uçları, ikili
      kanal; proje kökü izolasyonu ve local-only middleware Forge'dan taşınır
      (mimari §4.6). `tools/server/projectPaths.ts` (Forge'un
      `resolveProjectPath`'i + yazma politikası: yazılabilir kökler, fixture /
      `samples/` / `.` adları salt okunur), `tools/save` (günlük + ileri sarma,
      dosya başına temel revizyon, sunucunun kurduğu level dizini, şemaya göre
      doğrulama ve kanonik yazım, sınıf deposu), `tools/server/forgeServer.ts`
      (`/__forge/save`, `/__forge/stage-binary`, `/__forge/read`; soket +
      `Host` + `Origin` + `X-Forge-Request` koruması) ve `npm run dev`'e bağlı
      Vite eklentisi. `src/core/edit`: işlem / undo / redo / birleştirme,
      sürümlü kirli takibi (F01), level oturumu (kayıt planı, `needs-load`,
      hücre yükle / boşalt), `fetch` verilen kayıt istemcisi. Çökme testi her
      adımda kesip kurtarmanın tamamlanmış duruma eşit olduğunu doğrular;
      uçtan uca test aç → düzenle → kaydet → oku ve iki oturumla 409.
      Faz 4'e kalan: editör servisleri ve yeniden yükle / karşılaştır
      arayüzü (mimari §4.6). (2026-11-10)
- [x] Uygulama kabuğu: World, sahne kurucu (LevelAssembler), alt sistem ana
      makinesi + yaşam döngüsü, oyun modülü ana makinesi, renderer'dan bağımsız
      boot hata ekranı (mimari §4.7). World yalıtımı (modül düzeyinde değişebilir
      tekil yok; bir sayfada iki World kurulup yok edilir testi) (mimari A6).
      Çekirdekte alt sistem / servis sözleşmesi (`defineSubsystem`, tick
      grupları, `createServiceKey`, `SubsystemContext`) ve
      `defineFeature.subsystems`; `src/runtime`: `world.ts`, `assembler.ts`,
      `gameModule.ts`, `boot.ts` + `bootScreen.ts`; `main.ts` boot eder.
      Height Fog şema → level → kurucu → World → `HeightFogState` servisi
      zincirinden uçtan uca geçiyor; render bağlaması Faz 3'te servisi okur.
      Boot ekranı başlıksız Chrome'da `--dump-dom` ile görüldü (proje yokken
      "Nothing to open"). (2026-11-10)
- [x] Oyun projesi sözleşmesi: `@forge/sdk` / `@forge/editor-sdk` iskeleti,
      başlatıcı (yalnız SDK takma adlarını tanıyan TypeScript ayarlarını üretir,
      `sdkVersion` uyumunu denetler), SDK API anlık görüntüsü + CI fark kapısı,
      `samples/starter`, `create-project`, `check:projects`, `/__forge/identity`
      (mimari §4.8, A8). `forge.project/1` manifest + sürüm uyumu çekirdekte;
      SDK 0.1.0 ve changelog; `verify:sdk-api` (snapshot + changelog hash'i);
      `npm run forge -- check|dev`; dev server'da proje seçimi, salt okunur
      `samples/` / fixture, `/__forge/identity`, `/__forge/classes`, sanal oyun
      modülü, oyun şemalarıyla kayıt doğrulaması; `samples/starter` (sis +
      Player Start, SDK'lı oyun modülü); `create-project`; `check:projects`
      (gate'te; başsız açılış). `tests/fixtures/projects/` (good, bad-imports,
      old-sdk, type-error). `npm run dev` başlıksız Chrome'da starter'ı açtı,
      depo dışı bir proje `forge dev` ile kendi portunda açıldı. Content pack'ler
      depo düzeni kutusunda. (2026-11-10)
- [ ] Depo düzeni: `content/engine/`, `content/packs/starter/` (manifestte
      `contentPacks`), `samples/`, `tests/fixtures/projects/`; testler fixture'ın
      geçici kopyasında çalışır, dev server fixture / `samples/` köklerine yazmaz
      (mimari A9).
- [x] **İskeletin kabul testi:** Height Fog özelliği tek klasörde uçtan uca:
      şema → kayıt / yükleme turu → undo → otomatik Details **form tanımı**
      (şemadan üretilen, DOM'suz alan listesi: ad, tür, aralık, varsayılan, TR
      ipucu; testle doğrulanır) → runtime alt sistemi. Form tanımını DOM'a
      çeviren UI kiti Faz 4'te (K7), render bağlaması Faz 3'te. Kabuk
      dosyalarında değişiklik yok. *Hazır (2026-11-10):* şema, kayıt / yükleme
      turu (level düzeyinde), form tanımı ve testi; undo (düzenleme modeli) ve
      runtime alt sistemi (uygulama kabuğu); `height-fog.test.ts`'teki kabul
      testi zinciri tek testte kurar; `main.ts` özellikleri klasörden toplar.
      Render bağlaması Faz 3'te, UI kiti Faz 4'te.
- [ ] Kapılar ve CI: tip kontrolü (iki tsconfig), katman denetimi + öz-testi,
      Vitest, build, dist doğrulaması, SDK API snapshot farkı, boyut bütçesi,
      alt dizin (`base`) yayını testi (mimari §4.10, F06). *Kuruldu
      (2026-11-10):* `npm run gate` = tip kontrolü (iki tsconfig) + katman
      denetimi + öz-test + dosya boyutu bütçesi + Node yükleme kapısı
      (`verify:node-load`) + asset kapısı (`verify:assets`, D16) + SDK API
      kapısı (`verify:sdk-api`) + proje uyumluluğu (`check:projects`) +
      Vitest + build; aynı kapı `.github/workflows/ci.yml`'de. *Bekleyen:*
      dist doğrulaması (editör gelince), alt dizin yayını testi.
- [ ] `CLAUDE.md`, `AGENTS.md`, `docs/architecture/ARCHITECTURE.md` (mimari
      rapordan) yazılır. (Bu plan ve rapor 2026-11-10'da yeni deponun
      `docs/planned/` klasörüne taşındı.) *`CLAUDE.md` ve `AGENTS.md` yazıldı
      (2026-11-10); `ARCHITECTURE.md` iskelet oluşunca.*
- [ ] Plan belgesi düzeni: faz başına yaşayan plan belgesi mi, yalnız bu ana
      plan mı; biten planların arşiv yeri ve dizini (Forge'da `Forge-Archive` +
      `COMPLETED_WORK_INDEX.md` idi). `CLAUDE.md`'ye yazılır.
- [ ] `docs/PORT_LOG.md`: Faz 0 envanterinin üstüne taşıma günlüğü bölümü
      açılır (§7).

### Faz 2b — Cut-over, alt sistemlerin taşınması ve içe aktarıcı

Ön koşul: Faz 1 GO.

- [ ] Forge WebGL'e `forge-webgl-final` etiketi ve bakım modu notu (§3);
      taşıma bu SHA'dan yapılır ve `docs/PORT_LOG.md`'ye yazılır.

- [ ] **Test sınıflaması (ilk iş):** Forge'un 176 test dosyası iki kümeye
      ayrılır: algoritma testleri (mekanik `check()` → `test()` çevirisi) ve
      eski `scene` / `persistence` / `world` veri modeline dayananlar (yeni
      modele göre yeniden yazılır ya da düşer). Sayılar `PORT_LOG`'a yazılır;
      "taşınan testler yeşil" kapısının paydası budur.
- [ ] **Taşıma:** `engine/*` three'siz alt sistemleri (ai, physics, terrain
      verisi, navigation, movement, audio, dialogue, behavior, worldbuilder
      algoritmaları, environment, perf, animation, input, loading, perception,
      ui, vfx, gameplay, core) ve ilgili testleri: kopyala → sınırda yeni
      aktör / şema modeline bağla → testler yeşil. Algoritmalar değiştirilmez
      (§2.11). `engine/assets` A10 modeline göre yeniden kurulur.
- [ ] Kayıt oyunu (`engine/persistence`) ve World Partition (`engine/world`)
      yeni modele göre yeniden kurulur; GUID anahtarlı. Kayıt oyunu `persist`
      işaretli bileşen alanlarını ve `defineSaveState` bölümlerini saklar;
      tipsiz `flags` torbası yok (mimari A7).
- [ ] `tools/world` taşınır; World Builder çıktısı yeni level formatını yazar;
      `npm run world:random` çalışır (test dünyaları ilk günden üretilebilir).
      Çıktı kuralları: üretilen level projenin içerik ağacına yazılır, asset
      olarak kayıtlıdır (Content Browser'da görünür) ve var olanın üstüne
      `--force` olmadan yazılmaz; recipe, bölge profili ve referans görseli
      level'ın yanında durur. Her yerleşim GUID + rol bileşeni taşır
      (placeholder → model geçişi için). Bölge profili oyun verisidir, motor
      deposuna girmez.
- [ ] World Builder taşıma kapsamı envanterde işaretlenir: algoritmalar
      (arazi yazma, rota çözücü, yerleşim, ped, foliage) taşınır; yeniden
      çalıştırılabilir aşama / sahiplik / Dry Run yüzeyi konseptten sahne
      akışında kullanılmadığı için (kullanıcı kararı 2026-11-07) varsayılan
      olarak taşınmaz.
- [ ] Kenney dizin aracı (`tools/asset-library-index.mjs`, `kenney-assets.tsv`)
      için karar: bu depoya taşınır mı, Forge'da mı kalır. Kütüphanenin kendisi
      depoya girmez (mimari A9).
- [ ] **İçe aktarıcı** `tools/import-forge-webgl`: level, hücreler, foliage,
      sidecar'lar → yeni format; terrain tile'ları olduğu gibi. Çevrilemeyen
      alan raporlanır. Referans level'lar ve starter content bununla gelir;
      referans level'lar depo dışı yerel içerik projesine yazılır, starter
      content `content/packs/starter/`'a (mimari A9).
- [ ] **İçe aktarıcının kabulü:** her eski tür için küçük fixture + beklenen
      çıktı testi; referans level'larda kaynak ve hedef arasında tür başına
      sayım karşılaştırması (aktör, bileşen, foliage örneği, hücre) ve
      çevrilemeyen alan raporu. Fark açıklanmadan kapı geçilmez; görsel
      eşdeğerlik Faz 3 kapısında.

### Faz 3 — Render çekirdeği ve level görüntüleyici

- [ ] Render kaynak önbelleği (geometri, doku, pipeline) asset GUID'iyle
      anahtarlı ve renderer'a ait, World'den ayrı (mimari A6).
- [ ] Renderer host: init, resize, DPR, cihaz kaybı, gerçek backend rozeti;
      `?debug` overlay (`engine/perf` zaten three'siz) + GPU timestamp.
- [ ] Materyal sistemi: `ForgeMaterialDef` → node material (§2.3);
      katman / anizotropi / ORM; GLB + KTX2.
- [ ] Işık ve gölge: `CSMShadowNode`, reversed-Z (`reversedDepthBuffer` yapıcı
      seçeneği; WebGL'deki `EXT_clip_control` hilesi gerekmez), view distance.
- [ ] Çevre: sky atmosphere, height fog, cloud layer, WES bağlantısı
      (`engine/environment` three'siz), sky light / IBL (PMREM), reflection
      capture.
- [ ] Olay bazlı gün saati: level'da saat varsayılan olarak durur; gün / gece
      değişimi zamanlı bir geçiştir (süre parametreli), sonra saat yine durur.
      Geçiş sırasında sky light / IBL yeniden yakalama sıklığı ölçülerek
      seçilir. (Forge'da `setHour` anlık atlıyordu.)
- [ ] `RenderPipeline` + kalite profilleri (§2.4).
- [ ] Level görüntüleyici: level.json → statik mesh'ler, instancing, HLOD;
      runtime route'unda salt görüntüleme.
- [ ] **Render regresyon smoke'u:** kabul edilen referans pozlar yerelde,
      başlıklı tarayıcıda, gerçek WebGPU backend'inde yeniden çekilip referans
      görüntüyle karşılaştırılır. Kurallar: görüntü `page.screenshot({ clip })`
      ile alınır, boş / siyah görüntü kontrolü zorunlu, backend kanıtı kayda
      yazılır. `render/**` ve `features/*/render.ts` dokunan push'lardan önce
      çalışır; CI'da çalışmaz (GPU yok). Referans görüntüler kullanıcının
      kabulünden sonra güncellenir.
- [ ] Kapı: referans sahnelerin statik içeriği ve çevresi, Faz 0 görüntüleriyle
      yan yana; kullanıcının ilk görsel kabulü.

### Faz 4 — Editör çekirdeği

- [ ] Editör kabuğu ve servisleri (§2.2): viewport host, kamera, seçim (CPU
      raycast picking), `TransformControls` gizmo, pivot, grup / hiyerarşi,
      undo / redo.
- [ ] Editör çizim katmanı: gizmo, seçim çerçevesi, ızgara ve yardımcı
      çizimler TRAA'dan sonra, jitter'sız ayrı bir pass'te çizilir (TRAA
      geçmişine girerlerse titrer ve iz bırakır); derinlik testi sahne
      derinliğine karşı yapılır.
- [ ] **Önce UI kiti (K7):** tasarım token'ları + Forge `paramFields` mantığı
      (kaydırıcı + kutu, sınıra çekme, %30/%70, TR ipucu / EN ad) küçük bir kit
      olarak taşınır; şemadan üretilen Details ve taşınan paneller aynı kiti
      kullanır.
- [ ] DOM panelleri uyarlanarak taşınır (framework yok, redesign yok): Outliner,
      Details (şema tabanlı), Content Browser, World Settings, ortam ve
      post-process ayrıntıları (görünüm ayarı burada yapılır), Add Actor menüsü.
      Outliner sanallaştırılmış liste; 50.000 aktörde akıcı (mimari A1 ölçüm
      sahnesi). `data-testid` sözleşmesi korunur.
- [ ] Kaydet / aç, Open Level, Play (runtime'ı yeni sekmede açar; kaydedilmemiş
      anlık görüntüyle, diske yazmadan — mimari A6).
- [ ] Kapı: Forge'daki `editor-authoring` smoke'unun karşılığı yeşil.

### Faz 5 — Açık dünya

Dört alt faz; her birinin kendi kapısı var, görsel kabul sonda toplu istenir.
5a önce gelir; 5b ve 5c onun üstünde paralel yürüyebilir; 5d, 5a–5c'nin
çıktısını kullanır.

- [ ] **5a Terrain:** spike'taki TSL CDLOD üretim kalitesine çıkar: morph,
      tile seam, 8 boya katmanı, su birikintisi, kıyı ıslaklığı, kostik; tile
      akışı (editör ve runtime), global harita. *Kapı:* referans terrain
      level'ı §2.10 ölçümüyle sınırın içinde; görsel yükseklik collider ile
      eşleşiyor.
- [ ] **5b Akış + HLOD:** World Partition hücre akışı (A11 modeli; editör de
      akışla çalışır), HLOD, view distance, küçük nesne culling. *Kapı:* hücre
      yükle / boşalt döngüsünde sızıntı yok (bellek ve GPU kaynağı ölçümü);
      akış sırasında kare süresi sıçraması sınırın içinde.
- [ ] **5c Foliage:** instancing + compute culling + indirect draw; impostor /
      billboard, rüzgâr, fade; foliage hücreleri. *Kapı:* referans level'ın
      gerçek foliage sayılarıyla S4 ölçümünün üretim karşılığı.
- [ ] **5d Editör araçları + World Builder:** sculpt, paint, foliage paint,
      landscape spline; World Builder penceresi + `/__world-random` endpoint'i
      + önizleme worker'ı. *Kapı:* araç başına editör smoke'u (düzenle → kaydet
      → yeniden aç); üretilen dünya Content Browser'da görünüyor.
- [ ] Faz kapısı: referans açık dünya sahnelerinde görsel + performans kabulü;
      terrain collider ile eşleşiyor.

### Faz 6 — Oyun runtime'ı ve araçlar

- [ ] Runtime alt sistemleri (bugünkü capability modülleri), oyun çatısı
      (`gameplay` katmanı: bugünkü `src/game`'in yeniden kullanılabilir kısmı —
      TPS / araç / RTS modları, kamera yöneticisi, ragdoll), actor
      script'leri, input (`engine/input`), karakter + kamera, Rapier fizik,
      ses, oyun UI'ı (`engine/ui`: widget, bağlama, tema, yerelleştirme, dünya
      widget'ı), yükleme ilerlemesi (`engine/loading`), save-game, AI + algı
      (`engine/perception`) + Recast/Detour nav, diyalog.
- [ ] Skeletal mesh ve animasyon: skinning'li mesh'in WebGPU'da çizimi (MRT /
      hız vektörü sözleşmesine uygun), klip oynatma, blend space
      (`engine/animation`), animasyon–ragdoll geçişi. Faz 3 yalnız statik
      mesh'i kapsar; karakter görseli burada gelir.
- [ ] VFX: partikül efektleri TSL'de. WebGPU'da nokta boyutu yok; büyük
      noktalar `Sprite` + instancing ile `PointsNodeMaterial`'a çevrilir.
      Mümkünse compute partikül.
- [ ] Araçlar: Vehicle component, tekerlek görsel node'ları, motor sesi, yüzey
      tepkisi.
- [ ] `templates/game-starter` karşılığı.
- [ ] Oyun projesi build'i: Forge'daki `game-project-build` / `build-record` /
      `verify:build` karşılığı; editörsüz üretim çıktısı, `verify:dist
      --strict`, alt dizin yayını. Pilot bunu kullanır; Faz 10'a bırakılmaz.
- [ ] K4: oyunda WebGL2 fallback kararı — hedef kitlenin WebGPU kapsamı ve
      compute'suz yolların maliyeti ölçülür; kullanıcı kararı. Oyunun tarayıcı
      kapsamı (K11) aynı ölçümle kesinleşir.
- [ ] Kapı: runtime smoke'ları (boot, playflow, checkpoint); araç terrain
      üstünde sürülüyor (5a terrain'i gerekir).
- [ ] **Ridgebound pilotu (K8, kapıdan sonra):** Ridgebound'un bir **kopyası**
      `forge.projects.local.json` ile kaydedilir ve `check:projects`'e girer. M0
      oyun kodu `@forge/sdk`'ya, `TransportState` `defineSaveState`'e taşınır;
      içerik içe aktarıcıdan geçer. Deformasyon / hasar kapsam dışı. Çıkan SDK
      eksikleri Faz 7–8'den önce düzeltilir. Forge WebGL bağı kesilmez.

### Faz 7 — Su ve yansımalar

- [ ] Okyanus: FFT compute shader'a (bugün `RawShaderMaterial` ping-pong'u);
      yüzey, köpük, ada girintileri (inlet), kostik, kıyı.
- [ ] Göl ve nehir (TSL), sualtı, su–terrain bağlantıları.
- [ ] Yansımalar: önce SSR; gereken yerlerde `reflector()` ile planar yansıma;
      reflection capture / probe.
- [ ] Kapı: su görsel kabulü ve ölçüm.

### Faz 8 — Terrain deformasyonu ve araç hasarı

- [ ] Terrain deformasyonu: GPU yükseklik güncellemesi (texture veya compute),
      collider senkronu, ıslak iz, save-game kalıcılığı, editör yüzeyi.
- [ ] Araç hasarı: impact deform + mesh senkronu, `dentWear` TSL'de, parça
      kopma, kırılma (Voronoi bake) + debris / VFX / ses.
- [ ] Araç sözleşmesi (`FORGE_VEHICLE_COMPONENT_AND_DAMAGE_CONTRACT.md`) ve
      Doruk K-180 kaynağı (`art/vehicles/doruk-k180/`): "motor deposunda oyun
      yok" kuralının bilinçli istisnası. Yeni depo düzenindeki yerleri (mimari
      A9) taşımadan önce kullanıcıyla belirlenir.
- [ ] Kapı: Ridgebound kopya sahnesinde hasar ve iz senaryoları.

### Faz 9 — İleri aydınlatma (her teknik ayrı karar)

Her teknik için: hipotez, küçük deneme, §2.10 ölçümü, geri alma yolu, kullanıcı
kararı.

- [ ] `LightProbeGrid` — açık dünya GI. Gün saati olay bazlı değiştiği için
      (sürekli hareketli güneş yok), geçişten sonra yeniden bake ya da iki durum
      arasında karışım mümkün; bu, bake'li GI için önemli bir avantaj.
- [ ] `ClusteredLighting` — gece sahneleri, farlar, sokak lambaları.
- [ ] SSGI profil ayarı; VXGI denemesi.
- [ ] `LightMapper` — yalnız statik yapılar için.
- [ ] `MeshletDrawingPipeline` — yalnız ölçümde yoğun mesh darboğaz çıkarsa.

### Faz 10 — Ridgebound göçü ve sürüm

- [ ] Ridgebound içeriği içe aktarıcıyla çevrilir (önce kopya, sonra gerçek
      veri); oyun kodu (bugün 926 satır, Forge'un 19 iç modülünü import ediyor)
      `@forge/sdk`'ya taşınır; kontrat / depo / kargo tanımları oyunun asset ve
      bileşen türlerine, `TransportState` bir `defineSaveState` bölümüne geçer
      (mimari A7).
- [ ] Oyun kuralları ve UI; tam Edit → Play → Save akışı.
- [ ] Üretim build'i (editörsüz, `verify:dist --strict`); build hattı Faz 6'da
      kuruldu, burada gerçek oyunla sürüm çıktısı alınır.
- [ ] Kapı: kullanıcı kabulü; Ridgebound'un Forge WebGL bağı kesilir.

---

## 5. Paralel yürütme

- Faz 5 ve Faz 6 ayrı oturumlarda paralel yürüyebilir (ortak dosyaları az);
  Faz 6'nın araç kapısı 5a'yı bekler. 5b ve 5c de birbirine paralel yürüyebilir.
- İş bölümü mevcut düzende kalır: toplu taşımadaki derleme / test düzeltmeleri
  ve iyi tanımlı saf fonksiyonlar + testleri Codex'e uygun; TSL / render
  tasarımı, Rapier ve inceleme Claude'da.
- Paralel oturumlar aynı index'i paylaşır: commit'ler yol sınırlı
  (`git commit -- <yollar>`).

## 6. Riskler

| Risk | Önlem |
|---|---|
| WebGPURenderer'ın nesne başına CPU maliyeti açık dünyada yüksek çıkar | Faz 1 S4'te ölçülür; instancing, `BatchedMesh`, indirect draw |
| Deneysel addon API'leri sürümle değişir | three sabit sürüm; addon'lar kendi sarmalayıcılarımızın arkasında; yükseltme ayrı, planlı adım |
| Akışla gelen yeni materyallerde shader derleme takılması | `compileAsync` ile ön ısıtma; materyal varyant sayısını sınırlama |
| Geçiş döneminde iki motorun bakımı | Cut-over sonrası Forge WebGL'de yeni özellik yok; taşınmış modüllere sonradan gelen hata düzeltmeleri port günlüğünde izlenir |
| Kapsam şişmesi ("her şeyi yeniden tasarlayalım") | §2.11: yalnız iskelet yeniden tasarlanır; algoritmalar olduğu gibi taşınır |
| CI'da GPU yok | CI: tsc, build, engine testleri, dist doğrulaması. Render testleri yerelde, başlıklı (headed) tarayıcıda; headless'ta canvas görüntüsü siyah gelebiliyor |
| Görsel kabul darboğazı | Kabuller faz sonlarında toplu istenir |
| WebGPU'suz cihazlar | K4 |
| Kabul edilmiş görüntü sonraki fazlarda fark edilmeden bozulur | Faz 3'teki render regresyon smoke'u (yerel, başlıklı, boş görüntü kontrollü) |
| Test taşıması "mekanik" sanılır; eski veri modeline dayanan testler çevrilemez | 2b'nin ilk işi test sınıflaması; kapının paydası sınıflanmış sayılar |
| Forge'daki bir özellik sessizce taşınmadan kalır | Faz 0 özellik envanteri; her satırda hedef faz ya da "taşınmayacak" |
| Compute yolu (culling + indirect draw) r187'de beklenen kazancı vermez | Faz 1 S4 prototipi; GO ölçütünün parçası |
| NO-GO'da 2a iskeleti ve bu depo sahipsiz kalır | K10 |
| İçe aktarıcı hatası ancak görsel kabulde fark edilir | 2b'de fixture testleri + tür başına sayım karşılaştırması |

## 7. Taşıma günlüğü

Yeni depoda `docs/PORT_LOG.md`. Her satır: modül, kaynak yol, Forge SHA, işlem
(taşındı / uyarlandı / yeniden yazıldı), testler, durum. Aynı belge, Faz 3–8
boyunca hangi Forge özelliğinin WebGPU'da hazır olduğunu gösteren kapsama
matrisini de taşır; matrisin paydası Faz 0'da çıkarılan özellik envanteridir
(her özellik: hedef faz ya da "taşınmayacak"). Cut-over'dan sonra Forge WebGL'de taşınmış bir
modüle hata düzeltmesi yapılırsa buraya "port bekliyor" diye işlenir.

## 8. Kararlar

| ID | Konu | Öneri | Durum |
|---|---|---|---|
| K1 | Yeni deponun adı ve yeri | `Forge-WebGPU` — yerel `C:\Users\emret\Desktop\Forge-WebGPU`, GitHub `emrtrn/Forge-WebGPU` | **Kapandı** 2026-11-10: ad "Forge WebGPU", depo `Forge-WebGPU` (private) |
| K2 | Forge WebGL'in durumu | Bakım modu; GitHub arşivi değil; `Forge` deposu ve adı kalır | **Kapandı** 2026-11-10: bakım modu, depo ve ad kalır. Cut-over'a (2b başı) kadar three'siz sistemlerde geliştirme sürebilir; sonrasında yalnız hata düzeltmesi, taşınmış modüle gelen düzeltme `PORT_LOG.md`'ye "port bekliyor". Ad karışıklığı yeniden adlandırmayla değil README / `CLAUDE.md` notuyla çözülür. GitHub arşivi Model 1 fork'larını ve Ridgebound'u düzeltmesiz bıraktığı, yeniden adlandırma `upstream` / `FORGE_ROOT` / `../../Forge` yollarını kırdığı için reddedildi |
| K3 | Veri formatları | Yeni tek tip format + tek yönlü içe aktarıcı (mimari A1; v0.2'deki "aynı şema" önerisi geri çekildi) | **Kapandı** 2026-11-10 mimari A1 kararıyla: tek tip aktör + bileşen (bileşen hiyerarşili) + tek yönlü içe aktarıcı |
| K4 | WebGPU olmayan cihaz | Editör: WebGPU zorunlu. Oyun: başlangıçta zorunlu + açık mesaj; WebGL2 backend fallback'i Faz 6'da ölçümle karara bağlanır | **Kapandı** 2026-11-10: öneri olduğu gibi. "WebGPU yok" mesajı renderer'dan bağımsız boot hata ekranında (mimari §4.7). Faz 6 fallback kararının ölçütleri: hedef kitlenin WebGPU kapsamı ve compute'suz yolların maliyeti; o güne kadar özelliklere WebGL2 yolu yazılmaz. `forceWebGL` yalnız CI smoke'ları için, WebGPU kabulü sayılmaz. Baştan Compatibility fallback'i compute özelliklerine (foliage culling, FFT okyanus, partikül, deformasyon) ikinci yol yükü getirdiği için reddedildi |
| K5 | three sürümü | 0.187.0 sabit (npm'deki en son); yükseltme ayrı adım | **Kapandı** 2026-11-10: tam sabit `0.187.0` (`^` yok, lock commit'li). Yükseltme faz sınırlarında değerlendirilir, faz ortasında yapılmaz; kontrol listesi: three geçiş notları, addon sarmalayıcıları, referans sahnelerde görsel karşılaştırma + ölçüm, sonuç plana / `PORT_LOG`'a. Kritik düzeltme gerekirse ara yükseltme ayrı commit'te aynı listeyle. Forge WebGL de 0.187.0'da; 2b taşımasında eşdeğerlik testlerini sürüm farkı bulandırmaz. `^` (r sürümü kırıcı) ve aylık takip (sürekli addon kayması) reddedildi |
| K6 | Render-three yatırım durdurma | Hemen yürürlüğe girsin (§3) | **Kapandı** 2026-11-10: GO'ya kadar seçici, GO'dan sonra tam durdurma (§3). Faz 1 GO'ya kadar `render-three`'ye yeni iş yalnız şu üç koşulla girer: (a) oyunun şu anki bir kilometre taşı istiyor; (b) algoritma / parametre kısmı three'siz `engine/` modülünde, shader ince; (c) yeni `onBeforeCompile` yaması yok, WebGL görsel kabul cilası yok. GO'dan sonra yalnız hata düzeltmesi. Kural Forge oturumları için Forge'un Claude hafızasına (`forge-webgpu-rebuild-plan`) yazıldı. Hemen tam durdurma, `render-three` hâlâ aktifken (1 Ekim'den beri 146 commit) NO-GO ihtimalinde kayıp zaman yarattığı için reddedildi |
| K7 | Editör UI | Mevcut paneller önce uyarlanarak taşınsın; redesign Faz 4 sonrası ayrı karar | **Kapandı** 2026-11-10: paneller vanilla DOM olarak uyarlanıp taşınır; framework yok, redesign yok (Temmuz 2026 redesign'ının bir kısmı panellerde zaten var; yenisi gerekirse Faz 4 sonrası ayrı karar). Faz 4'ün ilk işi UI kiti (token'lar + `paramFields` kuralları; şemadan üretilen Details de bunu kullanır); Outliner sanallaştırılmış (50.000 aktör); `data-testid` sözleşmesi korunur. UI framework'ü ~38.800 satırı yeniden yazıma çevirdiği, reaktiflik kazancı işlem / undo servisiyle zaten sağlandığı için reddedildi |
| K8 | Ridgebound göç zamanı | Faz 8 kabulünden sonra (Faz 10) | **Kapandı** 2026-11-10: Faz 6 kapısından sonra pilot, Faz 10'da gerçek göç. Pilot: Ridgebound **kopyası** `check:projects`'e girer; M0 kodu `@forge/sdk`'ya, `TransportState` `defineSaveState`'e, içerik içe aktarıcıdan; deformasyon / hasar yok. SDK (A8) ve oyun verisi (A7) kararları Faz 7–8'den önce gerçek bir oyunla sınanır. Gerçek göç ve Forge WebGL bağının kesilmesi Faz 8 kabulünden sonra. Yalnız Faz 10 (SDK ilk kez geç sınanır) ve Faz 6'da tam göç (oyun Faz 7–8 boyunca hasarsız kalır) reddedildi |
| K9 | Referans donanım | Kullanıcının GPU'su; performans hedefleri Faz 0 baseline'ından sonra konur | **Kapandı** 2026-11-10: referans **R1** = NVIDIA GeForce RTX 3060 12 GB (sürücü 610.60, 2026-11-10) / Intel i5-11400F / 16 GB RAM / 1920×1080 60 Hz ekran. 1440p ölçümleri render çözünürlüğüyle (ekran dışı hedef / DPR) alınır ve kayıtta öyle yazılır. Hedef sayılar Faz 0 baseline'ından sonra; biçim: profil × çözünürlük başına medyan / p95 kare süresi + GPU süresi, 60 Hz bütçe 16,6 ms. Sürücü değişikliği ölçüm kaydına yazılır. İkinci (düşük) referans gerekip gerekmediği K4'ün Faz 6 kararıyla birlikte. Dış hedef sınıf, ölçülemediği için reddedildi |
| K10 | Faz 1 NO-GO çıkarsa bu depo ve 2a iskeleti | 2a kapısına kadar tamamlanır (three'siz, renderer'dan bağımsız). Sonra iskelet korunur ve `render` katmanı Forge `render-three`'den (klasik `WebGLRenderer`) uyarlanır; mimari kazançlar (veri modeli, şema, kayıt, SDK) renderer'a bağlı değil. Bedeli: 2b'ye ~23.300 satırlık render uyarlaması eklenir ve iki depo dönemi uzar | **Kapandı** 2026-11-10: öneri olduğu gibi — NO-GO'da yeni iskelet + klasik `WebGLRenderer` katmanı. Depoyu dondurup Forge WebGL'de devam etmek 2a'nın mimari kazançlarını (veri modeli, şema, kayıt, SDK) Forge'a parça parça geri taşımayı gerektirdiği, kararı NO-GO anına bırakmak 2a'yı belirsiz hedefle yürüttüğü için reddedildi. `WebGPURenderer`'ın WebGL2 backend'i seçenek değil: NO-GO nedeni renderer'ın CPU maliyetiyse aynı maliyeti taşır |
| K11 | Tarayıcı kapsamı | Editör: yalnız masaüstü Chromium (Chrome / Edge), R1'de. Oyun: başlangıçta aynı; Firefox / Safari kapsamı Faz 6'da K4 fallback ölçümüyle birlikte karara bağlanır. Kapsam dışı tarayıcıda boot hata ekranı açık mesaj verir | **Kapandı** 2026-11-10: öneri olduğu gibi — editör yalnız masaüstü Chromium; oyunun Firefox / Safari kapsamı Faz 6'da K4 ölçümüyle. Oyun için Firefox + Safari'yi ilk günden hedeflemek her fazın kabulüne iki tarayıcı daha eklediği için reddedildi |

## 9. v0.1'den korunanlar

- Gerçek WebGPU doğrulaması; sessiz fallback yok (§2.6).
- Ölçüm kayıt formatı ve "ölçülmedi" dürüstlüğü (§2.10).
- Görünür özellik kapsama matrisi (§7).
- Kayıt güvenliği: allowlist ve `droppedFields` fikri artık şema kaydının
  doğal parçası (mimari §4.5); proje kökü sınırı aynen (§2.7, §2.8).
- Ridgebound verisine Faz 10'a kadar yalnız kopya üzerinden dokunulması.

v0.1 dosyası (`FORGE_WEBGPU_EDITION_MASTER_PLAN.md`) bu belgeyle geçersizdir;
silinebilir.

## 10. İlk adımlar

1. ~~§8 kararları (K1–K9) ve mimari raporundaki A1–A9~~ — tamam (2026-11-10).
2. ~~Açık kararlar: A10, A11, K10, K11~~ — tamam (2026-11-10).
3. Faz 0: Forge özellik envanteri, referans sahneler, WebGL ekran görüntüleri
   ve ölçümleri, GO ölçüt sayıları.
4. Faz 1: spike S1 → S4 (compute culling prototipiyle), ardından GO / NO-GO.
   Faz 2a bununla paralel başlar.

## 11. İlerleme kaydı

| Tarih | Sürüm | Ne oldu |
|---|---|---|
| 2026-11-10 | v0.4 | Plan ve mimari rapor Forge'dan bu depoya taşındı; A1–A9 karara bağlandı; Faz 1 ∥ 2a, cut-over 2b'ye kaydı (`137dbc3`) |
| 2026-11-10 | v0.5 | K2, K4–K9 karara bağlandı (`f87bef1`) |
| 2026-11-10 | v0.6 | Belge incelemesi: tutarsızlıklar düzeltildi; açık kararlar K10–K11, A10–A11 eklendi; Faz 0 / 1 / 2a / 2b / 3 / 4 / 6 / 8 kutuları genişledi; Faz 5 5a–5d'ye bölündü. Kod yok, hiçbir faz başlamadı (`3d25f5e`) |
| 2026-11-10 | v0.7 | K10, K11, A10, A11 karara bağlandı (dördü de öneri); bütün kararlar kapalı (`b0b8f6f`) |
| 2026-11-10 | v0.7 | Faz 2a başladı: depo iskeleti (Vite 7, TypeScript 5.9 strict, three 0.187.0, Rapier 0.19.3, Vitest 5), katman denetimi + öz-testi, dosya boyutu bütçesi, `npm run gate`, CI, `CLAUDE.md`, `AGENTS.md`; ilk çekirdek modül `src/core/id.ts`. Kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a çekirdek kutusu kapandı (`0b1bce0` … `67add88` ve JSON Schema commit'i): göreli import'lar depo genelinde `.ts` uzantılı + `verify:node-load`; `feature.ts` editörü anmaz (yeni katman kuralı `feature-does-not-name-editor`); şema DSL'i, tek normalize, geçiş zinciri, şema kaydı + `defineFeature`, `forge.level/1` + `forge.actorClass/1`, Details form tanımı, JSON Schema. Mimari rapora 2a kararları işlendi: tam yazım, yanlış tip kuralı, override kuralı v1. 215 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a asset modeli kutusu kapandı (`d2c96c6` … `5098d05`): DSL'e metin alan türü; asset türleri ve `registerAssetType`; `forge.assetMeta/1` (tür + lisans + kaynak zorunlu, D16); saf asset dizini (kimlik, şemadan yürüyen referanslar, ters dizin, bütünlük, `planDelete`, dizinden `ClassResolver`); `tools/assets` taraması, `.forge-cache` önbelleği, `verify:assets` gate'te; `src-no-node-builtins` kuralı. Mimari §4.4'teki açık soru kapandı: override sürüm etiketi + kısmi veri geçiş sözleşmesi. Mimari rapor v0.5. 286 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a hücre veri modeli kutusu kapandı (`87821dd` … `bb91a59`): `settings.cellSize` + `spatiallyLoaded`; ızgara ve hücre ataması; `forge.levelCell/1` + `forge.levelCells/1`; split / merge, kayıt planı ve kanonik metin; asset dizininde level klasörleri ve dosyalar arası bütünlük; `tools/assets` revizyon denetimi. Mimari rapor v0.6. 383 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a ölçek ölçümü kapandı (`239abc9` … `f60f79a`): `npm run bench:level` (sabit tohumlu 50.000 aktörlük level, S1–S7), eşikler ölçümden önce yazıldı (`1bd2e6b`). İlk koşuda S1 / S3 / S4 aştı; sebep uygulama (O(hücre × aktör) bölme, aktör kopyaları), biçim değil; düzeltmeden sonra hepsi eşik içinde. Mimari §4.4 ölçek çarelerine gerek yok. Ölçümde bulunan kayıp hatası (yanlış hücredeki aktör) düzeltildi. 390 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a kayıt servisi kutusu kapandı (`c89cbfc` … `51bc7e7`): proje yolu + yazma politikası, günlüklü atomik çok dosyalı kayıt (çökme testli), sunucunun kurduğu level dizini, dosya başına temel revizyon (409), sunucuda şema doğrulaması ve kanonik yazım (422), ikili sahneleme, `/__forge/` uçları + localhost / CSRF koruması, `src/core/edit` düzenleme modeli ve kayıt istemcisi, uçtan uca test. Mimari rapor v0.7. 457 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a uygulama kabuğu kutusu kapandı (`2dc5dba` … `5f2e762`): alt sistem / servis sözleşmesi çekirdekte, World (yaşam döngüsü, tick grupları, bileşen dizini, iki World yalıtım testi), sahne kurucu, Height Fog alt sistemi ve uçtan uca test, oyun modülü host'u, renderer'sız boot ekranı, `main.ts` boot eder. Mimari rapor v0.8. 486 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a oyun projesi sözleşmesi kutusu kapandı (`2d6700c` … `6ccac78` ve kabul testi): `forge.project/1`, `@forge/sdk` 0.1.0 + changelog + API anlık görüntüsü kapısı, `forge check|dev`, dev server'da proje seçimi / salt okunur örnekler / kimlik, `samples/starter`, `create-project`, `check:projects` (gate'te, başsız açılış). İskeletin kabul testi kutusu da kapandı. Mimari rapor v0.9. 526 test, kapı yeşil |
