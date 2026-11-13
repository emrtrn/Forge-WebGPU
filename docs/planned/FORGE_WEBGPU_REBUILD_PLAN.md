# Forge WebGPU — Yeniden İnşa Planı

**Sürüm:** v1.3 · 2026-11-13 (v1.2'den fark: Faz 3 adım 1, dikey dilim
tamam — renderer host, boot'un `render` aşaması, render bağlamaları, GUID
anahtarlı kaynak önbelleği, şekil / static mesh / Height Fog çizimi, render
smoke iskeleti; mimari v1.7. v1.2: Faz 3 başladı — döküm, içe
aktarıcı çeviricileri, tasarım kararları 1–11 ve adım sırası Faz 3 bölümünde,
kararlar mimari v1.6'da; HLOD 5b'de, terrain salt çizimi Faz 3'te, GPU timer
kontrolü D. v1.1: Faz 2b kapandı ve arşivlendi —
cut-over, alt sistemlerin taşınması, `tools/world`, içe aktarıcı, kayıt oyunu
ve World Partition'ın saf kısmı; ertelenen Forge kontrolleri faz kapılarında.
v1.0: ürün tezi ve kapsam ölçütü
(mimari §0.0) — K12 kapsam kararları: diyalog, AI yazım yığını (BT / State
Tree / EQS / Blackboard / Smart Object), Actor Script'in betik yüzeyi, ragdoll,
Sound Cue / ses bileşeni, hareketli platform, spline takipçisi, portallar
taşınmaz; karakter hareketi, takip kamerası, Recast navigasyonu, Player Start
taşınır; Faz 4'e genel veri editörü (A13) ve ajan düzenleme komutları (A12);
Faz 2b'de cut-over, test sınıflaması, Kenney kararı. v0.9: Faz 0 kapandı ve arşivlendi —
özellik envanteri, referans sahneler, WebGL baseline; Faz 1 GO ölçüt sayıları
G1–G9 kondu. v0.8: Faz 2a kapandı, ayrıntısı
`docs/archive/PHASE_2A.md`'ye taşındı; dist doğrulaması ve alt dizin yayını
testi Faz 4'e; plan belgesi düzeni: tek ana plan + faz kapanınca arşiv. v0.7:
K10, K11, A10, A11 karara
bağlandı, dördü de öneri olduğu gibi. v0.6: belge incelemesi işlendi — açık
kararlar K10–K11 ve A10–A11 eklendi; Faz 0'a özellik envanteri ve GO sayıları,
Faz 1 S4'e compute culling prototipi, 2a'ya 50.000 aktör ölçümü ve DOM'suz
Details tanımı, 2b'ye test sınıflaması ve içe aktarıcı kabulü girdi; Faz 5
5a–5d'ye bölündü; adı geçmeyen alt sistemler fazlara atandı; §11 ilerleme kaydı
açıldı. v0.5: K2, K4–K9 karara bağlandı. v0.4: depoya taşındı, A1–A9 işlendi,
Faz 1 ∥ 2a, cut-over 2b'ye kaydı)
**Durum:** Bütün kararlar kapalı (K1–K11, A1–A11; 2026-11-10). Faz 2a kapandı
(2026-11-11; [arşiv](../archive/PHASE_2A.md)). Faz 0 kapandı (2026-11-11;
[arşiv](../archive/PHASE_0.md)): envanter, referans sahneler, WebGL baseline,
GO sayıları. Faz 1 spike'ı S1–S4 ile tamamlandı; **GO (koşullu, kullanıcı kararı
2026-11-11):** GPU güdümlü foliage 5c'de zorunlu, G6 orada yeniden ölçülür. S5
yapılmadı (Faz 9'a, kullanıcı kararı). Faz 1 [arşivde](../archive/PHASE_1.md). Faz 2b
kapandı (2026-11-12; [arşiv](../archive/PHASE_2B.md)). Faz 3 başladı (2026-11-12):
döküm ve tasarım kararları onaylandı, sırada adım 1 (dikey dilim).
**Ürün tezi ve kapsam ölçütü:** [mimari §0.0](FORGE_WEBGPU_ARCHITECTURE.md);
kapsam kararları §8 K12.
**Belge düzeni:** tek ana plan; biten fazın ayrıntısı faz kapanınca
[`docs/archive/`](../archive/INDEX.md)'e taşınır. Kısa mimari harita:
[`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md);
taşıma günlüğü: [`docs/PORT_LOG.md`](../PORT_LOG.md).
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
   denetimi (dependency-cruiser + öz-test, mimari A3) ilk commit'te kurulur;
   `verify:dist --strict` editör build'iyle (Faz 4).
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

### Faz 0 — Kararlar ve referans görüntüler (kapandı 2026-11-11)

Ayrıntı: [docs/archive/PHASE_0.md](../archive/PHASE_0.md). K1–K11 (§8) ve
A1–A11 (mimari §8) kapalı; K6 kuralı yürürlükte (§3). Forge özellik
envanteri [`docs/PORT_LOG.md`](../PORT_LOG.md) §1'de (234 satır, her satırda
faz). Referans sahneler (OpenWorldTest, Island, WbPilotValley, Derekavak
kopyası; sahne başına 3 poz) depo dışı `Games/ForgeReference` projesinde.
WebGL baseline R1'de ölçüldü: Derekavak GPU'ya bağlı (~15–17 ms, ~1.800 draw
call), Island CPU'ya bağlı (~6 ms); tablo arşivde. GO sayıları (G1–G9)
[Faz 1 arşivinde](../archive/PHASE_1.md).

### Faz 1 — Doğrulama spike'ı (kapandı 2026-11-11, GO)

Ayrıntı: [docs/archive/PHASE_1.md](../archive/PHASE_1.md) (S1–S4 sonuçları,
GO ölçütleri G1–G9 ve sonuç tablosu, yöntem notları). Spike Forge
`spikes/webgpu/`'de, kayıtlar `Games/ForgeReference/baseline/spike/`.

- **Karar: GO, koşullu (kullanıcı, 2026-11-11).** WebGPU yolu sürer, K10'un
  NO-GO yolu kapanır. Koşul: GPU güdümlü foliage bütün türlerde ve gölge
  kaskatlarında zorunlu (5c); G6 (Derekavak P2, 60 Hz: render gönderimi
  ≤ 3 ms, ana iş parçacığı ≤ 6 ms) 5c kapısında yeniden ölçülür.
- **Sonuç:** G1 (terrain 18 / 18, gerçek içerik 6 / 6; kare oranı ≤ 0,86), G2
  (≤ 6,83 / 14 ms), G3 (≤ 11,51 / 16,6 ms), G5 (327 / 212 draw call), G7, G8
  (≤ 4,9 mm) geçer. G6: ana iş parçacığı geçer, render gönderimi 3,9 ms
  (sınır 3) GO koşuluna bağlandı. G4 yalnız rapor. G9: GO yan yana
  görüntülerle verildi, ayrı not yok. S5 yapılmadı (Faz 9).
- **Profiller (S3):** Balanced = TRAA + GTAO (tam çözünürlük, birleştirmede)
  + bloom (level yazmışsa) + SSR yarım çözünürlükte (level seçmişse);
  Cinematic = SSGI + SSR tam. Profil efekti zorla açmaz, izin verir.
- **Yansıma (kullanıcı kararı):** genel yansıma SSR (Post Process
  `reflection: off | ssr`, Faz 3); düz yüzeyler planar (Faz 7); sphere
  reflection capture taşınmaz.
- **Sonraki fazlara taşınan bulgular:** beş MRT hedefi WebGPU'nun varsayılan
  renk eki sınırını (32 bayt / örnek) aşar (Faz 3); WebGPURenderer'ın CPU
  maliyeti ~1,3 ms sabit + draw call başına ~8 µs (5c); r187'de compute
  culling + `drawIndexedIndirect` doğru çiziyor (5c); `CSMShadowNode`'a kamera
  elle verilmez; renk çıkışı negatifleri 0'a kırpar.

### Faz 2a — Mimari iskelet (kapandı 2026-11-11)

Ayrıntı: [docs/archive/PHASE_2A.md](../archive/PHASE_2A.md); kararlar mimari
raporda (§4.3–4.8). Kuruldu: depo + katman denetimi ve öz-testi, şema DSL'i ve
kaydı, `forge.level/1` aktör + bileşen modeli, asset modeli (A10), hücre
modeli (A11), kayıt servisi, uygulama kabuğu, oyun projesi sözleşmesi ve SDK,
depo düzeni (motor içeriği, content pack'ler), `npm run gate` + CI. Kapı:
Height Fog iskeletten uçtan uca geçiyor; 50.000 aktör ölçümü eşik içinde
(R1); CI yeşil (`a77587a`'ya kadar, kullanıcı teyidi). Dist doğrulaması ve
alt dizin (`base`) yayını testi Faz 4'e taşındı.

### Faz 2b — Cut-over, alt sistemlerin taşınması ve içe aktarıcı (kapandı 2026-11-12)

Ayrıntı: [docs/archive/PHASE_2B.md](../archive/PHASE_2B.md); kararlar mimari
raporda (§0.0 K12, §4.4, §4.6, §4.8; v1.2–v1.5), modül başına kayıt
[`docs/PORT_LOG.md`](../PORT_LOG.md) §2. Yapıldı: cut-over (Forge
`forge-webgl-final` = `04b5fb23`, bakım modu); test sınıflaması
(`npm run port:forge-tests`); three'siz alt sistemlerin taşınması (ses, UI,
input, zaman, iş bölme, perf, physics + kırılma / göçük algoritmaları, terrain,
navigation, movement, behavior, environment, loading, perception, vfx,
worldbuilder); `tools/world` (`world:random` / `world:brief` yeni level
formatıyla); Forge WebGL içe aktarıcısı ve kabulü (`import:forge`, starter
paketi, depo dışı referans projesi `Games/ForgeReference/webgpu-scenes`);
kayıt oyunu (`src/core/save`, `forge.saveGame/1`, `persist` / `state` /
`defineSaveState`, durum defteri) ve World Partition'ın saf kısmı (tek dünya
ızgarası `src/core/grid`, hücre yerleşim planlayıcısı). Sonuç: **A 885 / 1.022**
taşınan Forge kontrolü yeşil; geri kalanı fazına yazılı ve o fazın kapısında
(Faz 3 40, 5a 4, 5b 54, 5c 8, 5d 4, Faz 6 5, Faz 7 20, Faz 8 2; TSV `deferred`
sütunu). Geçiş iskeleleri `src/engine/testing/` ve `src/engine/legacy/` Faz 6'da
silinir. Faz 6'ya açık soru: Player Start kalıcı katmanda mı. CI `4d844ce`'ye
kadar yeşil (kullanıcı teyidi).

### Faz 3 — Render çekirdeği ve level görüntüleyici

**Başladı 2026-11-12.** Tasarım kullanıcı onayıyla (2026-11-12, "hepsi öneri
gibi"); kararlar mimari raporda (v1.6: §4.3, §4.6, §4.7, §4.9, §4.10), bu
bölüm kutuları, dökümü ve sırayı tutar. Görsel ayar kullanıcıda (§2.9): sistem
kurulur, parametreler şemaya açılır; sahne doğrulaması işlevsel, tek kontrol
çekimi.

**Döküm (2026-11-12).** Fazı 3 olan 36 envanter satırı (`PORT_LOG` §1) aşağıdaki
kutulara dağılır; Forge kaynakları yalnız okunur (`render-three` TSL ile yeniden
yazılır, spike `spikes/webgpu/` referans).

| Kutu | INV | Forge kaynağı | Ertelenen A | R kontrolleri (öneri, kesin sayım kutuda `PORT_LOG` §2'ye) |
|---|---|---|---|---|
| Kaynak önbelleği | G03, E06, E08 | `render-three/{gltfLoader,gltfModelLoader,models}`; spike `shared/{content,contentRender}` | — | 2 yeniden yaz (GUID'le model sınırları, GLB slot sırası) |
| Renderer host | G01, H18, H19 | `render-three/renderer`; spike `shared/spike` | GPU timer 1 → D (karar 6) | — |
| Materyal | E09–E12, G02, G26, C08 (motor), H20 (asset raporu) | `engine/assets/material`; `render-three/{materials,textureConfig,aoSurfaceMaterials,worldMaskPatch}`; `tools/assetPerfReport` | starter materyal 1, asset perf 3 | 5 yeniden yaz; 6 düşer (world mask yaması 3, AO yüzey materyali 3) |
| Işık ve gölge | D04, D46, G04, G05 | `render-three/{lights,sunCascadeShadow,sunFollowShadow,depthMode}`; `engine/world/{sunCascades,followShadow}`; spike `shared/environment` | güneş kaskatları 9, takipli gölge 9 | 19 yeniden yaz; 3 düşer (GLSL yaması 2, eski indeks etiketi 1) |
| Çevre | D08–D11, D16, D17 (render alanları), G06–G09 | `render-three/{skyAtmosphere,moonDisc,starField,heightFog,cloudLayer,reflection,authoredEnvironment}`; alanlar `engine/scene/*`; taşınmış `engine/environment` | — | 18 yeniden yaz; 6 düşer (`resolve*` 3 → şema normalize'ı, sis yaması 2, varsayılan level 1); sphere capture 10 D (INV-D12) |
| Gün saati | D16, F26 | taşınmış `worldClock`, `worldEnvironmentController`, `recapturePolicy` | — | — |
| Pipeline + kalite | D15, G11, G29, A10 (motor) | `render-three/postProcess`; `engine/perf/{qualityProfiles,adaptiveQuality,hardwareHints}`, `engine/persistence/userSettingsStore`; spike `shared/pipeline` | kalite / uyarlama / ipuçları 13, kullanıcı ayarları 4 | 10 yeniden yaz; 1 düşer (`resolvePostProcess`) |
| Level görüntüleyici | D01, D05, D40 (+ G13 salt çizim, karar 1) | `src/scene` runtime (referans); spike kip (b), `shared/terrain` | — | 4 yeniden yaz; 2 düşer (World yaşam döngüsü yerini aldı) |
| Render smoke'u | H18 / H19 (ölçüm biçimi) | `ForgeReference/baseline/tools`, spike `run.mjs` | — | — |

three'nin GLSL chunk çapalarını sınayan 6 R da düşer. Faz 3'e düşen R: 92
(58 yeniden yaz, 34 düşer); kalan 526 R fazlarında (4 editör, 5a terrain
render, 5b HLOD / culling / LOD, 5c foliage, 5d / 6 spline mesh, 6 animasyon /
VFX / oyun kamerası, 7 su, 8 deformable / kırılma).

**İçe aktarıcının Faz 3 çeviricileri** (her biri kendi kutusunda; sonra
`--pack starter` ve `webgpu-scenes`'in 7 level'ı `--force` ile yeniden alınır,
GUID'ler aynı; `--compare` yeni aktör sayımlarını açıklar; World Builder
level'ları `world:brief` ile, greybox ışık / gökyüzü `worldBuild`'in
`deferred`'ından çıkar):

| Forge alanı | Hedef |
|---|---|
| `lights[]` | aktör başına `forge.directionalLight` / `forge.pointLight` / `forge.spotLight`; güneş `atmosphereSun` işaretli tek directional (Forge'un güneş seçme kuralı çeviride) |
| `skyAtmosphere` | tekil `forge.skyAtmosphere` (pozlama ölçeği Forge'daki gibi, 1 → 0,2) |
| `reflection` + sky light yakalama | tekil `forge.skyLight` (PMREM) |
| `cloudLayer` / `postProcess` / `worldEnvironment` | tekil `forge.cloudLayer` / `forge.postProcess` (+ `reflection: off \| ssr`, `antialias: none \| traa \| smaa`) / `forge.worldEnvironment` (sürekli gün döngüsü yok, karar 8) |
| `worldSettings` | render alanları (arka plan, ortam ışığı, gölge varsayılanları) Faz 3'ün tekillerine (karar 7); view distance 5b, rüzgâr 5c, yerçekimi / kill Z / game mode 6 |
| `instances[].{color, castShadow, materialSlot}` | `forge.staticMesh` sürüm 2 (`color`, `castShadow`, `materials`), `forge.shape`'e `castShadow` |
| `landscapes[].material` | `forge.terrain.material` |
| `*.material.json` | `forge.material` (doku başvuruları GUID) |
| `*.materials.json`, `*.uvw.json`, `*.vertexcolors.json` | `forge.model` içe aktarma ayarları sürüm 2: `materials`, `uvw`, `vertexColors` (boş `meshes` yazılmaz) |

**Kararlar (kullanıcı, 2026-11-12; ayrıntı mimari v1.6):**

1. *Terrain:* spike S2'nin TSL CDLOD'u Faz 3'e salt çizim olarak gelir
   (yükseklik, 8 katman, normal, gölge; su birikintisi / kıyı / kostik / tile
   akışı yok); 5a üretim kalitesine çıkarır. Referans sahneler kapıda terrain'le.
2. *`render.ts` kaydı:* editör deseni. Render host `features/*/render.ts`'i
   kendisi toplar; `feature.ts` render'ı anmaz (statik ya da dinamik). Yeni
   katman kuralı + kasıtlı ihlal fixture'ı. Başsız açılışta (`check:projects`)
   render yok.
3. *Kalite modeli:* Forge'un merdiveni (ultra / high / medium / low / custom),
   uyarlamalı kalite ve donanım ipuçları olduğu gibi taşınır; ayrı adımda
   WebGPU izin alanları (`traaAllowed`, `ssrAllowed: off | half | full`,
   `ssgiAllowed`, `aoResolutionScale`) ve eşleme: ultra / high → Balanced,
   medium → GTAO'suz Balanced, low → Compatibility; Cinematic merdiven dışı
   ayrı seçim, uyarlamalı kalite ona çıkmaz. Profil izin verir, açmaz.
4. *MRT:* biçim sıkıştırma, `requiredLimits` yok: output RGBA16F 8 + normal
   RGBA8 8 + velocity RG16F 4 + metalrough RG8 2 + diffuse RGBA8 8 = 30 bayt
   ≤ 32. Bayt maliyetleri ilk pipeline adımında gerçek cihazda doğrulanır; bir
   test her profilin toplamını sınar.
5. *Materyal:* `forge.material` şemalı JSON asset türü (çekirdeğe yeni yetenek,
   A13'ün de temeli: başvurular dizinde yürünür, form şemadan). Forge'un
   `normalizeForgeMaterialDef`'i içe aktarıcının okuyucusu olarak olduğu gibi
   taşınır. Starter materyal A kontrolü paketteki çevrilmiş materyalleri aynı
   iddialarla sınar (yol ve normalize çağrısı değişir; `PORT_LOG`'da
   "uyarlandı").
6. *GPU timer A kontrolü* (WebGL `EXT_disjoint_timer_query`): D, payda 1.021.
   three WebGPU'da ve WebGL2 backend'inde kendi timestamp sorgusunu kullanıyor.
   Araçta (`DROPPED_CHECKS`) kalite adımında uygulanır.
7. *worldSettings:* her alan sahibi özelliğin tekil bileşenine; World Settings
   paneli (Faz 4) bu tekilleri tek yerde gösterir. Tek `forge.worldSettings`
   bileşeni yok.
8. *Sürekli gün döngüsü yok:* şemada yalnız sabit saat + zamanlı geçiş; Forge'da
   `dayLength > 0` olan level raporda "çevrilmedi (kullanıcı kararı)".
9. *HLOD 5b'de* (akışla; hücre boşaltılmadan anlamı yok).
10. *Cihaz kaybı v1:* render durur, renderer'sız ekran + "yeniden yükle";
    otomatik yeniden kurulum sonra.
11. Shape mesh'leri prosedürel geometri (asset yok); referans görüntüler depo
    dışında (`Games/ForgeReference/render-refs/`, içerik lisansı doğrulanmadı).

**Sıra** (her adım yeşilse ayrı commit + push; adımdan sonra `PORT_LOG` §2 /
§2.1, bu bölüm + §11, `npm run port:forge-tests`, gerekirse mimari rapor ve
harita, hafıza):

1. ~~**Dikey dilim:** `@playwright/test` (Forge'daki sürüm, tam sabit);
   `src/render` iskeleti; renderer host (backend kanıtı + rozet, DPR, resize,
   cihaz kaybı, `data-forge-perf` + timestamp); boot'un `render` aşaması;
   render bağlaması sözleşmesi + host toplaması (karar 2); GUID anahtarlı
   kaynak önbelleği + iki World testi; `forge.shape` + `forge.staticMesh`
   (GLB kendi materyalleriyle) + Height Fog `render.ts` + ışıksız level'a
   varsayılan güneş / ortam ışığı; terrain'siz level (PhysicsInteractionTest /
   L03); smoke iskeleti (1 level × 1 poz, boş görüntü, backend kanıtı).~~ —
   **tamam** (2026-11-13, `093a77c`). `render.ts`'leri `main.ts` Vite glob'uyla
   toplayıp host'a verir (`render` katmanı `features/`'ı import edemez; yeni
   kural `feature-does-not-name-render`). GUID → URL için dev server'a
   `GET /__forge/asset-files`. Height Fog Forge formülüyle TSL sis düğümü.
   Varsayılan güneş Forge'un; ortam ışığı Forge world settings varsayılanıyla
   0 (Forge gibi eklenmez), gölge adım 3'te. Smoke: L03 × 1 poz, gerçek WebGPU
   (NVIDIA Ampere), kaynak hatası yok; referans yok, aday
   `render-refs/candidates/l03/p1.png` (kabul adım 9'da). A 885 / 1.022
   değişmedi; adıma düşen R: 1 yeniden yazıldı, 5 düştü, 4 adım 4 / 5 / 8'e
   (`PORT_LOG` §2).
2. Kalite profilleri / uyarlamalı kalite / donanım ipuçları / kullanıcı ayarları
   taşınır (17 A), GPU timer D; WebGPU izin alanları ayrı commit.
3. Işık ve gölge: ışık bileşenleri + çevirici, `sunCascades` / `followShadow`
   taşınır (18 A), `CSMShadowNode` (Forge bölmeleri, kamerayı düğüm kendi alır),
   takipli gölge, reversed-Z.
4. Materyal: şemalı JSON asset türü, `forge.material`, `forge.model` / `texture`
   / `staticMesh` sürüm 2 + geçiş, node material + katkı sırası, çeviriciler,
   starter'a 10 materyal (1 A), asset perf raporu (3 A).
5. Çevre: gökyüzü, sky light / IBL, bulut, WES bağlaması (ay, yıldız, gece),
   world settings alanları + çeviriciler.
6. `RenderPipeline` + Post Process + kalite eşlemesi + MRT.
7. Olay bazlı gün saati (`timeTransition`, ayrı commit) + yakalama sıklığı ölçümü.
8. Görüntüleyiciyi tamamla: instancing (kip b), terrain salt çizimi, bütün
   referans level'lar, kamera, `?debug`.
9. Smoke tam set + Faz 0 görüntüleriyle yan yana ızgara → kullanıcı kabulü → kapı.

- [ ] Render kaynak önbelleği (geometri, doku, materyal; pipeline three'nin)
      asset GUID'iyle anahtarlı ve renderer'a ait, World'den ayrı (mimari A6,
      §4.9). *Adım 1:* önbellek, World başına sayaç, iki World testi, model ve
      şekil anahtarları; doku / materyal anahtarları adım 4'te.
- [ ] Renderer host: init, resize, DPR, cihaz kaybı (karar 10), gerçek backend
      rozeti; `?debug` overlay (`engine/perf` zaten three'siz) + GPU timestamp.
      *Adım 1:* `?debug` overlay dışında hepsi; overlay adım 8'de, DPR'nin
      kalite bağı adım 2'de.
- [ ] Materyal sistemi: `forge.material` (karar 5) → node material (§2.3);
      katman / anizotropi / ORM; GLB + KTX2 (three'nin `examples/jsm/libs`'i,
      yeni npm bağımlılığı ve vendor kopyası yok).
- [ ] Işık ve gölge: `CSMShadowNode`, reversed-Z (`reversedDepthBuffer` yapıcı
      seçeneği; WebGL'deki `EXT_clip_control` hilesi gerekmez), view distance.
- [ ] Çevre: sky atmosphere, height fog, cloud layer, WES bağlantısı
      (`engine/environment` three'siz), sky light / IBL (PMREM). Sphere
      reflection capture taşınmaz (kullanıcı kararı 2026-11-11): genel yansıma
      SSR, düz yüzeyler planar (Faz 7).
- [ ] Olay bazlı gün saati: level'da saat varsayılan olarak durur; gün / gece
      değişimi zamanlı bir geçiştir (süre parametreli), sonra saat yine durur
      (karar 8). Geçiş sırasında sky light / IBL yeniden yakalama sıklığı
      ölçülerek seçilir. (Forge'da `setHour` anlık atlıyordu.)
- [ ] `RenderPipeline` + kalite profilleri (§2.4, karar 3). Profil tanımı S3'te
      (Faz 1). Post Process'te yansıma seçeneği `reflection: off | ssr`
      (kullanıcı kararı 2026-11-11); profil izin verir, zorla açmaz. MRT sınırı
      biçim sıkıştırmayla (karar 4).
- [ ] Level görüntüleyici: level.json → statik mesh'ler, şekiller, instancing,
      terrain salt çizimi (karar 1); runtime route'unda salt görüntüleme. HLOD
      5b'de (karar 9).
- [ ] **Render regresyon smoke'u** (`npm run smoke:render`, Playwright, başlıklı
      Chrome, port 5283): kabul edilen referans pozlar yerelde, gerçek WebGPU
      backend'inde yeniden çekilip referans görüntüyle karşılaştırılır.
      *Adım 1:* iskele (`tests/smoke`, L03 × 1 poz); tam set adım 9'da.
      Kurallar: görüntü `page.screenshot({ clip })` ile alınır, hazır sinyali
      `data-forge-ready` (gizli doğan katmana bakılmaz), boş / siyah görüntü
      kontrolü zorunlu, `isWebGPUBackend` false ise koşu başarısız, backend
      kanıtı ve §2.10 alanları kayda yazılır. `render/**` ve
      `features/*/render.ts` dokunan push'lardan önce çalışır; gate'e ve CI'a
      girmez (GPU yok). Referans görüntüler depo dışında, kullanıcının
      kabulünden sonra güncellenir.
- [ ] Kapı: referans sahnelerin statik içeriği, terrain'i ve çevresi, Faz 0
      görüntüleriyle yan yana; kullanıcının ilk görsel kabulü. Ertelenen Forge A
      kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred` `3`, 39:
      kalite profilleri / uyarlamalı kalite 13, asset perf 3, starter
      materyal 1, güneş kaskatları 9, takipli gölge 9, kullanıcı ayarları 4;
      GPU timer 1 D, karar 6).

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
- [ ] Dist doğrulaması (`verify:dist --strict`: editör sızıntısı yok; motor
      içeriği ve seçili paketler dist'te) ve alt dizin (`base`) yayını testi
      kapıya ve CI'a girer (mimari §4.8 build, §4.10, F06). 2a'dan taşındı
      (2026-11-11).
- [ ] **Genel veri editörü (mimari A13):** oyunun şemalı veri asset'leri
      (ekonomi, denge, tablolar) Content Browser'dan açılır, Details ile aynı
      kitle şemadan üretilen formda ve tablo görünümünde düzenlenir. Forge'daki
      Data Table editörünün yerini alır; oyuna özel düzenleme arayüzü yazılmaz.
- [ ] **Ajan düzenleme komutları (mimari A12):** editörün düzenleme modeli
      üzerinden CLI: aktör ekle / taşı / sil, bileşen alanı yaz, sınıf
      override'ı. Kayıt servisinden geçer (doğrulama, çakışma); çıktı kısa.
      Kabul: aynı değişiklik editörden ve komuttan aynı kanonik dosyayı yazar.
- [ ] Kapı: Forge'daki `editor-authoring` smoke'unun karşılığı yeşil.

### Faz 5 — Açık dünya

Dört alt faz; her birinin kendi kapısı var, görsel kabul sonda toplu istenir.
5a önce gelir; 5b ve 5c onun üstünde paralel yürüyebilir; 5d, 5a–5c'nin
çıktısını kullanır.

- [ ] **5a Terrain:** Faz 3'ün terrain salt çizimi (spike S2'nin TSL CDLOD'u,
      Faz 3 karar 1) üretim kalitesine çıkar: morph,
      tile seam, 8 boya katmanı, su birikintisi, kıyı ıslaklığı, kostik; tile
      akışı (editör ve runtime), global harita. *Kapı:* referans terrain
      level'ı §2.10 ölçümüyle sınırın içinde; görsel yükseklik collider ile
      eşleşiyor; ertelenen 4 A yeşil (su birikintisi 3, öksüz tile 1).
- [ ] **5b Akış + HLOD:** World Partition hücre akışı (A11 modeli; editör de
      akışla çalışır), HLOD, view distance, küçük nesne culling. *Kapı:* hücre
      yükle / boşalt döngüsünde sızıntı yok (bellek ve GPU kaynağı ölçümü);
      akış sırasında kare süresi sıçraması sınırın içinde; ertelenen 54 A yeşil
      (`terrainRuntimeStreaming` 2, eşzamansız hücre yükleyici 17, asset residency
      18, görüş mesafesi 9 + sis 1, dünya haritası 5, ayrıntı culling 2).
- [ ] **5c Foliage:** instancing + compute culling + indirect draw; impostor /
      billboard, rüzgâr, fade; foliage hücreleri. GPU güdümlü yol bütün foliage
      türlerinde ve gölge kaskatlarında zorunlu (Faz 1 GO koşulu; S4: kip (b)'de
      Derekavak P2'nin 327 draw call'unun 260'ı foliage). *Kapı:* referans
      level'ın gerçek foliage sayılarıyla S4 ölçümünün üretim karşılığı; G6
      Derekavak P2'de 60 Hz'de render gönderimi ≤ 3 ms, ana iş parçacığı ≤ 6 ms;
      ertelenen 8 A yeşil (foliage halkası).
- [ ] **5d Editör araçları + World Builder:** sculpt, paint, foliage paint,
      landscape spline; World Builder penceresi + `/__world-random` endpoint'i
      + önizleme worker'ı. *Kapı:* araç başına editör smoke'u (düzenle → kaydet
      → yeniden aç); üretilen dünya Content Browser'da görünüyor; ertelenen
      4 A yeşil (`worldTerrainMove`, su tipleri Faz 7'yle).
- [ ] Faz kapısı: referans açık dünya sahnelerinde görsel + performans kabulü;
      terrain collider ile eşleşiyor.

### Faz 6 — Oyun runtime'ı ve araçlar

- [ ] Runtime alt sistemleri (bugünkü capability modülleri), oyun çatısı
      (`gameplay` katmanı: bugünkü `src/game`'in yeniden kullanılabilir kısmı —
      TPS / araç / RTS modları, kamera yöneticisi, takip kamerası, spring arm),
      koddan kayıtlı davranışlar (betik yüzeyi yok, K12), input
      (`engine/input`), karakter hareketi + kamera, Player Start, Rapier fizik,
      ses (kod kütüphanesi; ayarları şemalı veri, A13), oyun UI'ı (`engine/ui`:
      widget, bağlama, tema, yerelleştirme, dünya widget'ı), yükleme ilerlemesi
      (`engine/loading`), save-game, algı (`engine/perception`) + Recast/Detour
      nav. AI mantığı oyun kodunda; BT / State Tree / EQS / Blackboard / Smart
      Object, diyalog, ragdoll, hareketli platform, spline takipçisi, portallar
      yok (K12).
- [ ] Taşınan alt sistemler (`src/engine/subsystem.ts` biçimi) özellikleriyle
      World'e `defineSubsystem` üzerinden bağlanır; iskeleyle tick'lenen
      testleri World'e çevrilir; `src/engine/testing/` ve
      `engine-testing-is-test-only` kuralı silinir (2b iskele kararı).
      Alt sistemler şemalı bileşenlerden okur; `src/engine/legacy/` ve
      `engine-legacy-stays-in-engine` kuralı silinir (2b geçiş kararı).
- [ ] **UI widget editörü (açık karar, K12):** görsel widget düzenleyici
      mimari §0.0'ın "istemsiz müdahale" ayağına uyar (HUD yerleşimi); Faz 6
      başında kullanıcı kararı. O güne kadar widget'lar şemalı JSON.
- [ ] Skeletal mesh ve animasyon: skinning'li mesh'in WebGPU'da çizimi (MRT /
      hız vektörü sözleşmesine uygun), klip oynatma, blend space
      (`engine/animation`). Faz 3 yalnız statik mesh'i kapsar; karakter görseli
      burada gelir. Animasyon–ragdoll geçişi yok (K12).
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
      üstünde sürülüyor (5a terrain'i gerekir). Ertelenen Forge A kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred`
      `6`: Player Start / varsayılan piyon 4, starter kayıt arayüzü 1).
- [ ] **Ridgebound pilotu (K8, kapıdan sonra):** Ridgebound'un bir **kopyası**
      `forge.projects.local.json` ile kaydedilir ve `check:projects`'e girer. M0
      oyun kodu `@forge/sdk`'ya, `TransportState` `defineSaveState`'e taşınır;
      içerik içe aktarıcıdan geçer. Deformasyon / hasar kapsam dışı. Çıkan SDK
      eksikleri Faz 7–8'den önce düzeltilir. Forge WebGL bağı kesilmez.

### Faz 7 — Su ve yansımalar

- [ ] Okyanus: FFT compute shader'a (bugün `RawShaderMaterial` ping-pong'u);
      yüzey, köpük, ada girintileri (inlet), kostik, kıyı.
- [ ] Göl ve nehir (TSL), sualtı, su–terrain bağlantıları.
- [ ] Yansımalar (kullanıcı kararı 2026-11-11): düz yüzeyler (su, mirror
      plane, reflective surface, su birikintisi) `reflector()` ile planar;
      genel yansıma Post Process'teki SSR (Faz 3). Suda SSR kullanılmaz;
      sphere reflection capture yok. Planar'ın maliyet ilk okuması S4'te.
- [ ] Kapı: su görsel kabulü ve ölçüm. Ertelenen Forge A kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred`
      `7`: göl / okyanus / nehir 20).

### Faz 8 — Terrain deformasyonu ve araç hasarı

- [ ] Terrain deformasyonu: GPU yükseklik güncellemesi (texture veya compute),
      collider senkronu, ıslak iz, save-game kalıcılığı, editör yüzeyi.
- [ ] Araç hasarı: impact deform + mesh senkronu, `dentWear` TSL'de, parça
      kopma, kırılma (Voronoi bake) + debris / VFX / ses.
- [ ] Araç sözleşmesi (`FORGE_VEHICLE_COMPONENT_AND_DAMAGE_CONTRACT.md`) ve
      Doruk K-180 kaynağı (`art/vehicles/doruk-k180/`): "motor deposunda oyun
      yok" kuralının bilinçli istisnası. Yeni depo düzenindeki yerleri (mimari
      A9) taşımadan önce kullanıcıyla belirlenir.
- [ ] Kapı: Ridgebound kopya sahnesinde hasar ve iz senaryoları. Ertelenen Forge A kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred`
      `8`: off-road test level'ı 2).

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
| WebGPURenderer'ın nesne başına CPU maliyeti açık dünyada yüksek çıkar | Faz 1 S4'te ölçüldü: ~1,3 ms sabit + draw call başına ~8 µs; instancing ile Derekavak P2 render gönderimi 3,9 ms (sınır 3). Çare GPU güdümlü foliage (5c, GO koşulu) |
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
| Compute yolu (culling + indirect draw) r187'de beklenen kazancı vermez | Faz 1 S4: tek türde doğru çiziyor, GPU maliyeti yok (G7); bütün türler + gölge kaskatları 5c'de ölçülür |
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
| K12 | Kapsam: hangi Forge özellikleri taşınmaz | Ürün tezinin ölçütüne göre (mimari §0.0); eski oyunların kullanımı ölçüt değil | **Kapandı** 2026-11-11 (kullanıcı, öneri olduğu gibi). **Taşınmaz:** diyalog (`engine/dialogue`, editör, asset'ler, rapor hattı); AI yazım yığını (`engine/ai`: controller, BT, State Tree, EQS, Blackboard, Smart Object ve editörleri; AI mantığı oyun kodunda); Actor Script'in betik yüzeyi (değişkenler, olay / mesaj bağlamaları, dispatcher, arayüz, referans, construction; sınıf parametreleri şemalı bileşen alanlarıyla); ragdoll ve kalkma karışımı, montage girişleri; Sound Cue editörü, ses bileşeni ve Ambient Sound; hareketli platform, spline takipçisi, level geçişi / portallar. **Taşınır:** ses ve UI kod kütüphaneleri, karakter hareketi, takip kamerası ve spring arm, Recast / Detour navigasyonu, algı, Player Start. **Yeni:** genel veri editörü (A13) ve ajan düzenleme komutları (A12), Faz 4. **Açık:** UI widget editörü, Faz 6 başında. Taşınmayan kod `forge-webgl-final` etiketinde durur; bir oyun isterse dikey özellik modülü olarak gelir. **Behavior (kullanıcı kararı 2026-11-12):** olay ve mesaj işleyicileri davranışın kod kaydında (`BehaviorDefinition`: `tick`, `events`, `messages`); aktör `Behavior` bileşeniyle (script + parametreler) davranışı seçer |

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
3. ~~Faz 0: Forge özellik envanteri, referans sahneler, WebGL ekran görüntüleri
   ve ölçümleri, GO ölçüt sayıları~~ — tamam (2026-11-11).
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
| 2026-11-10 | v0.7 | Faz 2a depo düzeni kutusu kapandı (`790e769` … `7b85e38`): manifestte `contentPacks`, etiketli içerik kökleri (`engine:`), motor içeriği ve paketler proje dizininde salt okunur, bilinmeyen paket `forge check`'te hata, `verify:assets`'te paket bağımlılık yönü, `content/engine/` + starter paketi (Height Fog sınıfı) ve `samples/starter` onu kullanır. Mimari rapor v1.0. 534 test, kapı yeşil |
| 2026-11-11 | v0.8 | Faz 2a kapandı: belge kutuları (`docs/architecture/ARCHITECTURE.md` rapordan kısa harita, `docs/PORT_LOG.md` iskeleti, plan belgesi düzeni `CLAUDE.md`'de: tek ana plan, faz kapanınca `docs/archive/` + `INDEX.md`). Dist doğrulaması ve alt dizin yayını testi Faz 4'e taşındı (kullanıcı kararı). 2a ayrıntısı `docs/archive/PHASE_2A.md`'de. Mimari rapor v1.1 |
| 2026-11-11 | v0.8 | Faz 0 özellik envanteri kutusu kapandı (`e2c20e6` … `a77587a` ve bu commit): `docs/PORT_LOG.md` §1, Forge `b3fa0c1a`'dan 234 satır (A–H), her satırda faz ya da "taşınmaz"; planda adı geçmeyen 27 satırın fazı kullanıcı onayıyla. CI `a77587a`'ya kadar yeşil (kullanıcı teyidi). 534 test, kapı yeşil |
| 2026-11-11 | v0.8 | Faz 0 referans sahneler kutusu kapandı: depo dışı referans projesi (`Games/ForgeReference`), dört sahne (OpenWorldTest, Island, WbPilotValley, Derekavak kopyası), sahne başına üç sabit poz; aday görüntüler R1'de gerçek WebGL'de alındı, kullanıcı onayladı |
| 2026-11-11 | v0.8 | Faz 0 WebGL baseline kutusu kapandı: 4 sahne × 3 poz × high / ultra × 1080p / 1440p, 96 koşu, sınırsız kare hızı, adaptif kapalı; kare (1/fps), p95, GPU, draw call, üçgen; soğuk / sıcak yükleme ayrı ölçüldü. Derekavak GPU'ya bağlı (~15–17 ms, ~1.800 draw call), Island CPU'ya bağlı (~6 ms) |
| 2026-11-11 | v0.9 | Faz 0 kapandı: GO ölçüt sayıları G1–G9 Faz 1'e yazıldı (kullanıcı onayı, öneri olduğu gibi: G2 Balanced 1080p ortalama ≤ 14 / p95 ≤ 16,6 ms, G5 draw call ≤ WebGL'in %50'si, G6 Derekavak CPU ≤ 6 ms…); Faz 0 ayrıntısı `docs/archive/PHASE_0.md`'ye taşındı |
| 2026-11-11 | v0.9 | Faz 1 başladı: spike yeri Forge `spikes/webgpu/` (kullanıcı kararı; `CLAUDE.md` istisnası `6ba3b26`). S1 Boot kapandı (Forge `517961b1`): gerçek WebGPU, çekirdek kip, NVIDIA Ampere, timestamp query çalışıyor, sınırsız kare hızı açılıyor |
| 2026-11-11 | v0.9 | Faz 1 S2 Terrain ölçüldü (Forge `6818d201` … `4cc0d5b9`): CDLOD terrain'in TSL karşılığı, `high` gölgesi, sky + sis. G8: tam çözünürlüklü bölgede fark ≤ 4,9 mm; morph bandı ve ötesinde CDLOD'un kendi sapması (≤ 2,2 m), ölçütün yorumu kullanıcı kararında. G1 (yalnız terrainli WebGL kopyalarına karşı): 18 / 18 geçer, kare oranı 0,26–0,86. Faz 0 baseline'ının navmesh hata ayıklama çiziminden etkilenmediği A/B ile doğrulandı |
| 2026-11-11 | v0.9 | S2 kapandı: G8 kullanıcı kararıyla tam çözünürlüklü bölgeye uygulanır (≤ 4,9 mm, geçer); GO tablosundaki G8 satırı buna göre netleşti |
| 2026-11-11 | v0.9 | Faz 1 S3 Pipeline ölçüldü (Forge `33c0c00d` … `407720e1`): tek `RenderPipeline`, MRT → GTAO / SSGI / SSR → TRAA → bloom; efekt maliyeti 3 sahne × 3 poz × 1080p / 1440p. 1080p medyan: GTAO 1,6, TRAA 0,4, bloom 0,1, SSR 6,2 (üst sınır), SSGI 7,3 ms; yarım çözünürlükte SSR 1,1, SSGI 2,0, GTAO 0,5 ms. Balanced adayı (TRAA + GTAO + bloom) terrain-only kare ≤ 4,4 ms (1080p) / ≤ 7,2 ms (1440p). Beş MRT hedefi WebGPU'nun varsayılan renk eki sınırını (32 bayt) aşıyor. Balanced profil kararı kullanıcıda. CI `f2b29cf`, `0519c3b`, `4ed6381` (Forge `517961b1` … `4cc0d5b9`) yeşil (kullanıcı teyidi) |
| 2026-11-11 | v0.9 | S3 kapandı (Forge `e0e64051`, `a4286990`): Balanced = TRAA + GTAO + bloom (level yazmışsa) + SSR yarım çözünürlük (level seçmişse); Cinematic SSGI + SSR tam (kullanıcı kararı). G2 / G3 terrain-only geçer: en kötü Derekavak P2, SSR açık 1080p 5,5 / p95 6,4 ms, 1440p 9,7 / p95 10,6 ms; kesin okuma S4'te. Yansıma kararı: genel yansıma SSR (Post Process `reflection: off \| ssr`, Faz 3), düz yüzeyler planar (Faz 7), sphere reflection capture taşınmaz (PORT_LOG INV-D12, G09). S4'e planar yansıma ölçümü eklendi (rapor) |
| 2026-11-11 | v0.9 | Faz 1 S4 ölçüldü (Forge `2a135526` … `46986836`): Derekavak ve WbPilotValley'nin gerçek içeriği Forge'un yükleme kurallarıyla (cell'ler, materyal slotları, bellekteki tile'larla foliage halkası, uzak billboard'lar); içerik WebGL'le sayılarak doğrulandı. G1 6 / 6 (kare oranı 0,54–0,68), G2 / G3 kesin (≤ 6,83 / ≤ 11,51 ms), G5 (327 / 212), G7 geçer; G6 render gönderimi 3,9 ms (sınır 3) aşar, foliage draw call'ları toplanınca 2,2 ms. G5 tabanı eşdeğer kopyaya göre (kullanıcı kararı). G9 ve GO / NO-GO kullanıcıda |
| 2026-11-11 | v0.9 | Faz 1 GO (kullanıcı kararı, koşullu): WebGPU yolu sürer, K10'un NO-GO yolu kapanır. Koşul: GPU güdümlü foliage bütün türlerde ve gölge kaskatlarında zorunlu (5c), G6 render gönderimi 5c kapısında yeniden ölçülür. Risk tablosu S4 sonuçlarıyla güncellendi |
| 2026-11-11 | v0.9 | S5 yapılmadı (kullanıcı kararı): `LightProbeGrid` ve `ClusteredLighting` Faz 9'da ölçülür; probe verisinin hücre formatındaki yeri 5b tasarımında |
| 2026-11-11 | v0.9 | Faz 1 kapandı (GO, koşullu): ayrıntı `docs/archive/PHASE_1.md`'ye taşındı; planda özet, koşul 5c'de |
| 2026-11-11 | v0.9 | Faz 2b başladı, cut-over: Forge `forge-webgl-final` = `04b5fb23` (bakım modu notu `CLAUDE.md` / `README.md` / `AGENTS.md`); Forge WebGL'de bundan sonra yalnız hata düzeltmesi, taşınmış modüle gelen düzeltme `PORT_LOG` §3'e. Envanter farkı yok |
| 2026-11-11 | v0.9 | 2b test sınıflaması kapandı: `npm run port:forge-tests` (TypeScript AST, değer düzeyinde ve sözcüksel kapsamlı ulaşım), 2.588 kontrol yeri → A algoritma 1.010 (kapı paydası), M eski model 959, R render 619; satırlar `docs/port/forge-engine-tests.tsv`, özet `PORT_LOG` §2.1 |
| 2026-11-11 | v0.9 | 2b Kenney kararı (kullanıcı): bu projede Kenney / Quaternius yok; dizin üreticileri ve Kenney dizini GameDesign klasörüne taşındı, Forge'dan kaldırıldı (Forge `92a709aa`); INV-H25 taşınmaz |
| 2026-11-11 | v1.0 | Ürün tezi ve kapsam ölçütü (mimari §0.0, v1.2): K12 kapsam kararları, A12 ajan düzenleme komutları ve A13 genel veri editörü Faz 4'e; 2b taşıma listesinden dialogue ve ai çıktı, ragdoll bağı kesilir; test paydası yeniden hesaplandı (`PORT_LOG` §2.1) |
| 2026-11-11 | v1.0 | 2b ilk taşıma: ses (`src/engine/audio`, `src/runtime/audio`), 37 Forge kontrolü birebir Vitest'te yeşil; `engine` DOM'suz (kullanıcı kararı; `tsconfig.tools.json` + `verify:node-load` zorlar), `src` testlerine yalnız `node:assert` (`src-tests-node-assert-only`), testler ayrı `tsconfig.tests.json`; Sound Cue D, payda 927; `port:forge-tests` taşınanı etiketle sayar (37 / 927) |
| 2026-11-11 | v1.0 | 2b: UI kütüphanesi taşındı (`src/engine/ui`, DOM kısmı `src/runtime/ui/uiDom.ts`), 50 Forge kontrolü yeşil; 5 M kontrol bırakıldı. A 87 / 927 |
| 2026-11-11 | v1.0 | 2b: input (eylem haritası, varsayılan bağlamalar; ragdoll tuşu yok), zaman kontrolü, işbirlikçi iş bölme, kare ölçümü taşındı (`src/engine/{input,time,work,perf}`), 13 kontrol yeşil. A 100 / 927 |
| 2026-11-11 | v1.0 | 2b test iskelesi (kullanıcı kararı): eski döngü `src/engine/testing/`'te, yalnız testlere açık (yeni katman kuralı + kasıtlı ihlal); Faz 6'da silinir. Perf hesabı, `inputSubsystem`, Forge alt sistem biçimi taşındı. A 118 / 927 |
| 2026-11-11 | v1.0 | 2b physics: `PhysicsSubsystem` beşe bölündü (bütçe), ragdoll çıktı, araçlar / zemin / çarpışma geldi; eski bileşen okuyucuları geçiş olarak `src/engine/legacy/` (kullanıcı kararı, yeni katman kuralı + kasıtlı ihlal). 96 kontrol yeşil; testler için `tsconfig.tests.json` üç bayrağı gevşetir. A 214 / 923 |
| 2026-11-12 | v1.0 | 2b terrain (sınıflandırma kullanıcı onayıyla): `src/engine/terrain` (34 dosya) + saf landscape algoritmaları, `src/engine/spline`, `src/engine/world` (ızgara / akış matematiği), `terrainCollider`; su Faz 7'ye, su birikintisi 5a'ya, runtime akışı 5b'ye, `worldTerrainMove` 5d / 7'ye ertelendi. 153 kontrol yeşil (terrain 150); taşıma araçlarında üç düzeltme (varsayılan değerli parametre özelliği, `checkAsync` kaydı, dinamik etiket sayımı), Vitest süre sınırı 30 sn. `heightmapPng` 3 kontrol `node:zlib` kararını bekliyor. A 367 / 923 |
| 2026-11-12 | v1.0 | 2b: `node:zlib` `src` testlerine açıldı (bağımsız referans kodlayıcı; kullanıcı kararı, `src-tests-node-assert-only` + kontrol fixture'ı); `heightmapPng` 3 kontrol yeşil. CI `d8b7891`, `8d7ab7c` yeşil (kullanıcı teyidi). A 370 / 923 |
| 2026-11-12 | v1.0 | 2b navigation: `src/engine/navigation` (Recast / Detour, döşemeli planlayıcı, ajan profili, yerel kaçınma), worker mesajlaşması `src/runtime/navigation`; `@recast-navigation/core` `0.43.1` tam sabit; `navFloorSampler` movement ile. 23 kontrol yeşil; taşıma aracı async kayıt fonksiyonlarını `await` ile çağırır. A 393 / 923 |
| 2026-11-12 | v1.0 | 2b movement: `src/engine/movement` + `animation/blendSpace` + `navFloorSampler`; hareketli platform bağı kesildi (K12), `LaunchOptions` / `TransformSink` movement'a; karakter hareketi okuyucusu legacy'ye. 76 kontrol yeşil; taşıma aracı isteğe bağlı parametre özelliğini `T | undefined` diye yazar. A 469 / 923 |
| 2026-11-12 | v1.0 | 2b behavior: koddan kayıtlı davranış + script mesajları; olay / mesaj bağlamaları kod kaydında (`BehaviorDefinition`, kullanıcı kararı, K12 satırında); referans / arayüz / dispatcher / değişken / ses bileşeni yok. `behaviorSubsystem` bütçe için bölündü (tipler `behaviorTypes`). Forge fixture'ları test köprüsünden geçer; kontrol düzeyinde D listesi (payda 922). 33 kontrol yeşil. A 502 / 922 |
| 2026-11-12 | v1.0 | 2b küçük alanlar: environment, loading, perception, vfx, perf'in kalanı; kalite profilleri / uyarlamalı kalite / donanım ipuçları / WebGL GPU timer Faz 3'e, Player Start Faz 6'ya, `lakeQuality` Faz 7'ye, `puddleWind` 5a'ya. 57 kontrol yeşil. A 559 / 922 |
| 2026-11-12 | v1.0 | 2b worldbuilder (seçenek B, kullanıcı kararı): algoritmalar + aşama üreticileri; Stage Runner / sahiplik / Dry Run / üretici sürümleri taşınmadı, köken `recipe.generatedBy`, korumalı bölgeler üst düzeyde (World Builder kapsam kutusunda). 53 kontrol yeşil, 15 D (payda 907); 58 kontrol `node:fs` kararını bekliyor. A 612 / 907 |
| 2026-11-12 | v1.0 | 2b: `node:fs` `src` testlerine açıldı (ortak test fixture'ı okumak için; kullanıcı kararı, `src-tests-node-assert-only` + kontrol fixture'ı, kasıtlı ihlal `node:child_process`'e geçti); nötr bölge profili fixture'ı `tests/engine/fixtures/`'ta, worldbuilder 58 kontrol yeşil. A 670 / 907 |
| 2026-11-12 | v1.0 | 2b `tools/world` tasarımı (kullanıcı onayı; mimari v1.3): dönüştürücü + deterministik GUID, köken `forge.worldRole.stage`'e, girdiler ve terrain GUID'li veri belgesi (tile'lar metasız parça), örtü ön ayarları `worldbuilder` paketinde. Adım 1: veri belgeleri + `forge.staticMesh` / `forge.shape` / `forge.worldRole` / `forge.terrain` şemaları (`d1a50f5`). A 670 / 907 |
| 2026-11-12 | v1.0 | 2b `tools/world` kutusu kapandı: `npm run world:random` / `world:brief` yeni level formatını kayıt servisinden yazar (`65285df`; kurulum `src/engine/worldbuilder/build`, deterministik GUID, `--force` kuralı, `worldbuilder` paketi); bekleyen World Builder kontrolleri + test dünyaları + terrain onarımı 27 kontrol (`8f29972`), D'ye düşen yol spline kontrolü yeniden yazıldı; World Builder kapsam kutusu da kapandı (köken nesnelerde). Açık 4 A: eski level belgesi 2, off-road fixture 2. A 697 / 907 |
| 2026-11-12 | v1.0 | 2b (kullanıcı kararı, CI `90b88fd` … `a16cd94` yeşil): Forge'un eski level belgesini sınayan 2 kontrol D (payda 905; `testWorld`'ün deterministiklik yarısı yeni testte), off-road test level'ı ve 2 kontrolü Faz 8'e. A 697 / 905 |
| 2026-11-12 | v1.0 | 2b physics kırılma + göçük (kullanıcı onayı): `src/engine/physics/{fracture,deformable}` three'siz algoritmalar; asset türü / bileşen / mesh senkronu / TSL / editör Faz 8. 88 kontrol yeşil (`fractureRuntime`'ın 4 R kontrolü dışarıda). Physics'te bekleyen araç içeriği 34 (içe aktarıcıyla) + runtime kabuğu 7. A 785 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı tasarımı (kullanıcı kararları; mimari v1.4): şimdi çevrilen alanlar (yerleşim, arazi, hücreler, Height Fog, World Builder yan dosyaları), geri kalanı level raporunda faza bağlı; ortak çevirici `src/engine/forgeImport/`; üç yalnız-şema ikili tür `forge.model` / `forge.texture` / `forge.sound`; lisans sorumluluğu kullanıcıda, köken tablosu ve `LicenseRef-forge-unverified`; starter tohum listesinden, referans level'lar depo dışı projede. A 785 / 905 |
| 2026-11-12 | v1.0 | 2b araç kontrolleri: `surfaceResponse` 20, `vehicleDrivetrain` 13, `vehicleAssets` 1 elle taşındı (A kontroller eski room layout / actor script'e ulaşmıyor; stok GAZ-52 tanımı `tests/engine/fixtures/`'ta). A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 2: ortak yerleşim → aktör çevirisi ve Forge level çevirisi `src/engine/forgeImport/` (World Builder `worldLevel` onu kullanır; çevrilmeyen alanlar faz tablosuyla raporlanır), yalnız-şema ikili türler `forge.model` / `forge.texture` / `forge.sound`. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 3: `npm run import:forge` (köken tablosu, asset planı, level raporu, yan dosyalar yeni etiketlerle, `--force` / `--dry-run`); WbPilotValley geçici projede kapıdan geçer ve World Builder'la yeniden kurulur. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 4a (kullanıcı kararları): starter paketi yalnız motor varsayılanlarıyla (28 asset, 21,8 MB; lisansı bilinmeyenler dahil), `import:forge --pack`. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 4b: depo dışı referans projesi `Games/ForgeReference/webgpu-scenes` (yerel kayıtlı): 7 referans level kullandıkları asset'lerle, asset dizini 0 sorun; paylaşılan yan dosya bir kez yazılır. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı ve kabulü kutuları kapandı: `import:forge --compare` (`f1851bc`), yedi referans level'da sayımlar eşit, hücre farkları açıklamalı (bölümlenmemiş kaynak; pilotun Player Start'ı kendi hücresinde, kalıcı katman sorusu Faz 6). Çeviriciler kendi fazlarında eklenip içe aktarıcı yeniden çalıştırılır. A 819 / 905 |
| 2026-11-12 | v1.0 | CI `c5d2605`'e kadar yeşil (kullanıcı teyidi) |
| 2026-11-12 | v1.0 | 2b "Taşıma" kutusu kapandı (kullanıcı kararları): kalan 86 A gövde düzeyinde sınıflandı; 17 dosya düzeyinde ertelenmiş saf kontrol taşındı (`546f696`), eski manifest / şablon / klasör düzeni 12 kontrol D, 1 M, sarmalayıcı çağrısı 2 sayılmaz (`ab662b5`); ertelenen A'lar paydada kalır, fazı TSV `deferred` sütununda, her faz kapısı kendininkini ister (3: 18, 5a: 4, 5b: 2, 5d: 4, 6: 4, 7: 20, 8: 2). A 836 / 890 |
| 2026-11-12 | v1.0 | 2b kayıt oyunu + World Partition tasarımı (kullanıcı kararları; mimari v1.5): sınıflama `engine/world` / `engine/persistence`'ı modül düzeyinde eski model sayar (129 M → A, 40 D; `4bdc041`), tek dünya ızgarası `src/core/grid` (`e005bc2`), slot deposu (`8b8449f`), hücre yerleşim planlayıcısı + durum belleği (`38aca39`), `forge.saveGame/1` + `persist` / `state` / `defineSaveState` + durum defteri, SDK 0.1.1 (`3f9b423`). Kutu kapandı; runtime akışı 5b, runtime kayıt özelliği Faz 6. Ertelenen A: Faz 3 40, 5a 4, 5b 54, 5c 8, 5d 4, Faz 6 5, Faz 7 20, Faz 8 2. A 885 / 1.022 |
| 2026-11-12 | v1.1 | Faz 2b kapandı (CI `4d844ce`'ye kadar yeşil, kullanıcı teyidi): ayrıntı `docs/archive/PHASE_2B.md`'ye taşındı, planda özet; A 885 / 1.022, ertelenen Forge kontrolleri faz kapılarında. Sıradaki: Faz 3 |
| 2026-11-12 | v1.2 | Faz 3 başladı: döküm (36 INV satırı, ertelenen 40 A, Faz 3'e düşen 92 R: 58 yeniden yaz / 34 düşer), içe aktarıcının Faz 3 çeviricileri ve tasarım kullanıcı onayıyla ("hepsi öneri gibi"; mimari v1.6): terrain salt çizimi Faz 3'te, `render.ts`'i render host toplar, Forge kalite merdiveni + WebGPU izin alanları (Cinematic merdiven dışı), MRT biçim sıkıştırmasıyla 30 bayt, `forge.material` şemalı JSON asset türü, GPU timer kontrolü D (payda 1.021, kalite adımında), worldSettings alanları sahibi özelliğin tekiline, sürekli gün döngüsü yok, HLOD 5b, cihaz kaybında v1 yeniden yükle. Kod yok; sırada adım 1 (dikey dilim) |
| 2026-11-13 | v1.3 | Faz 3 adım 1, dikey dilim (`093a77c`): `src/render/{host,resources,materials,pipeline,sync,viewer}`; `WebGPURenderer` (timestamp, reversed-Z), backend kanıtı + `data-forge-perf` + rozet, DPR / resize, cihaz kaybı v1; boot'un `render` aşaması; `defineRenderBinding` + `main.ts` toplaması + `feature-does-not-name-render`; GUID anahtarlı kaynak önbelleği (iki World testi), `GET /__forge/asset-files`, glTF KTX2 + meshopt three'nin libs'iyle; `forge.shape` / `forge.staticMesh` / Height Fog (TSL) çizimi, varsayılan güneş; `npm run smoke:render` (`@playwright/test` 1.61.1) L03'te gerçek WebGPU'da yeşil, aday görüntü depo dışında. 1.537 test, kapı yeşil. A 885 / 1.022; R akıbetleri `PORT_LOG` §2. Mimari v1.7 |
