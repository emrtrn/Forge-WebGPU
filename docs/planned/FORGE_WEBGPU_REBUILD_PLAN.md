# Forge WebGPU — Yeniden İnşa Planı

**Güncelleme:** v1.64 · 2026-11-17 — R9a occlusion çalışması (üst sınır): Derekavak'ta GPU foliage üçgeninin en çok %0–21'i örtülü; öneri: üretime alınmaz, R10'a geçilir (kullanıcı kararı bekliyor).

**Önceki güncelleme:** v1.63 · 2026-11-17 — R9a adım 1 uygulandı: ikincil kamera görünümleri (yansıma kendi aynalanmış culling listesi, kendi katmanı, sayaca girer); iki arka uçta CPU referansıyla eşit. Sırada R9a occlusion tasarımı.

**Önceki güncelleme:** v1.62 · 2026-11-17 — R9 kapandı (kullanıcı kararı): statikler instanced, GPU yolu foliage'da; ikincil kamera görünümleri R9a'nın ilk adımı.

**Önceki güncelleme:** v1.61 · 2026-11-17 — R9.0–R9.4 uygulandı. Ölçümde GPU yolu hiçbir level'da kazandırmadı; statikler varsayılan olarak instanced kalır.

**Önceki güncelleme:** v1.60 · 2026-11-17 — R8 kapandı (kullanıcı görsel kabulü). R9 bulguları, kararları ve uygulama sırası R9.0–R9.5; R9.2'nin saf çekirdeği Codex'te. Kod yok.

**Önceki güncelleme:** v1.59 · 2026-11-17 — R8 uygulandı (R8.0–R8.6 ölçümü): Derekavak P2 sahne draw 398 → 68, gönderim 0,711 → 0,455 ms; StreamingBench HLOD 3,37 M → 1,64 M üçgen; landmark katmanı far değiştirmeden.

**Önceki güncelleme:** v1.58 · 2026-11-17 — R8.0–R8.3 uygulandı.

**Önceki güncelleme:** v1.57 · 2026-11-17 — R8 kararları ve uygulama planı (R8.0–R8.6): bundle kapalı, proxy'ler GPU yoluna girmez, slot düzeyinde kayıpsız materyal birleştirme, 4 × 4 ikinci HLOD katmanı, landmark katmanı ve far genişlemesi. Kod yok.

**Önceki güncelleme:** v1.56 · 2026-11-17 — R7 seçilebilir otomatik LOD altyapısı uygulandı ve iki arka uçta doğrulandı. Meshlet'e özel üretim kodu kaldırıldı; R6 araştırması korundu. v1.55'in R9a occlusion kararı değişmedi; R8 / R9 / R9a / R10 açık.

**Önceki güncelleme:** v1.45 · 2026-11-17 — Faz 5c adım 5: WebGL2 test arka ucunda GPU güdümlü batch'in CPU ikizi (kullanıcı kararı, `2544bdb`); çizim sayacı iki geçişli saydam materyalleri sayar. Mimari v1.45.

**Sürüm:** v1.34 · 2026-11-16 (v1.33’ten fark: World Settings genel gölge anahtarı ve tek Undo ile toplu nesne gölgeleri; Island sahne verisi korunur; mimari v1.37). v1.33 · 2026-11-16: Derekavak canlı kabulü; Island'da kamerayı izleyen koyu dörtgenin düzeltilmesi — ters derinlikte takip gölgesinin alt Z sınırı, kaynak geçişi ve GPU regresyonu; mimari v1.36. v1.32 · 2026-11-16: Faz 5a adım 8 teknik kapısı, A 957 / 1.021 ve görsel kabul adayları (mimari v1.35).

**Önceki sürümler:** v1.31 · 2026-11-15 (v1.30’dan fark: Faz 5a adım 7 tamam — WES v2 örtü / rüzgâr, simülasyonla birikim, A7 state, terrain katkısı, dokulu birikinti rüzgârı, içe aktarıcı değer karşılaştırması; kullanıcı kararları; SDK 0.1.12; mimari v1.34). v1.30 · 2026-11-15 (v1.29’dan fark: Faz 5a adım 6 tamam — su birikintisi: `forge.puddle` bileşeni, havza doldurma, TSL su, `reflector()` yansıması, editör ve içe aktarıcı; kullanıcı kararları: konum = tohum + seviye, terrain otomatik, rüzgâr adım 7’de, smoke dev kancasıyla; A 956 / 1.021; SDK 0.1.11; mimari v1.33). v1.29 · 2026-11-15 (v1.28’den fark: Faz 5a adım 5 tamam — G8 collider eşleşmesi: görsel yüksekliğin CPU ikizi Node’da Rapier’la, GPU geri okuması render smoke’unda; tam çözünürlükte ≤ 2,9 mm, GPU = CPU ikizi ≤ 0,8 mm; render 20 / 20; mimari v1.32). v1.28 · 2026-11-15 (v1.27’den fark: Faz 5a adım 4 tamam — `?debug` terrain haritası ve akış satırları (Forge’un `debugTerrainMap`’i, akışlar sahnedeki debug etiketinden), global harita / kaplama / ışın eşdeğerliği testleri (8 R), pick yüzeyinin far map’te datum hatası düzeltildi; render 17 / 17; mimari v1.31). v1.27 · 2026-11-15 (v1.26’dan fark: Faz 5a adım 3 tamam — terrain katmanları üretim kalitesinde: albedo ve normal dizileri (Forge’un `terrainLayerArray`’i), alfa’da pürüzlülük, katman normalleri, statik detay damgaları (TSL), deliklerin maskesi, half-float normaller, kalite kancaları (kendi üstüne gölge, uzak döşeme); 10 R yeniden yazıldı; render 17 / 17 referanslarla; mimari v1.30). v1.26 · 2026-11-15 (v1.25’ten fark: Faz 5a adım 2 tamam — terrain tile akışı (Forge’un `TerrainRuntimeStreaming`’i, akış çekirdeği 5b’den öne alındı, 19 A), çözme worker’da, global harita parçasından uzak alan, slot havuzu ve görüş + gölge frustum’u kesimi, hazır olma akışı bekler; A 953 / 1.021, 5b’de ertelenmiş 25; gerçek WebGPU render 17 / 17; mimari v1.29). v1.25 · 2026-11-15 (v1.24’ten fark: Faz 5 başladı — Faz 5 dökümü (29 INV satırı, ertelenen 60 A), 5a kararları 1–7 ve adım sırası 1–8 kullanıcı onayıyla; kıyı ıslaklığı ve kostik Faz 7’ye; 5b’nin ertelenen A sayısı 44 (view distance Faz 3’te taşınmıştı); Faz 6 bekliyor; mimari v1.28). v1.24 · 2026-11-15 (v1.23’ten fark: Faz 4 adım 10 ve kapanış — editör smoke tam seti (Forge’un `editor-authoring` karşılığı ve kapsamdaki editör smoke’ları, ortak `tests/editor/support.ts`), oyunun editör tarafı (INV-A32), kayıt sürerken meşgul Save, adım 9’un Windows testleri; kapı: 2.026 test, 66 editör + 1 dist smoke, gerçek WebGPU 66 / 66, Outliner 50.000 eşik içinde; bölüm `docs/archive/PHASE_4.md`’ye taşındı; mimari v1.27). v1.23 · 2026-11-15 (v1.22’den fark: Faz 4 adım 9 tamam — süreçler arası kayıt kilidi, ortak authoring modülü, `npm run forge -- edit` ajan komutları (A12), düzenleme işlemleri `src/engine/edit`'te, dosya olayları ve editörün canlı tazelenmesi; kullanıcı kararları 2026-11-15; "Ajan düzenleme komutları" kutusu kapandı; kapı 2.021 test, 57 editör + 1 dist smoke; mimari v1.26). v1.22 · 2026-11-15 (v1.21’den fark: Faz 4 adım 8 tamam — Play oturum katmanı (`.forge-session/<id>/`, `?play=<id>`, kaydetmez), level ve asset 409 akışı: şerit, alan düzeyinde üç yönlü Compare, Reload; kullanıcı kararları 2026-11-15; "Kaydet / aç, Open Level, Play" kutusu kapandı; kapı 1.985 test, 53 editör + 1 dist smoke; gerçek WebGPU 14/14, render 17/17; mimari v1.25). v1.21 · 2026-11-14 (kullanıcı kararı: WES + prosedürel bitki planı v0.6; 5a örtü, 5c ortak tepki ve küçük üretim, 5d tam araçlar; PV-WES kabul koşulları; yalnız plan, kutu kapanmadı; mimari v1.24). v1.20 · 2026-11-14 (v1.19’dan fark: Faz 4 adım 7 tamam — ortak asset oturumu / pencere, şemadan form + sanal tablo, materyal / model / aktör sınıfı araçları, tek GPU önizlemesi, sınıf override koruması; SDK 0.1.10; kapı 1.957 test, 47 editör + 1 dist smoke; gerçek WebGPU asset 8/8, render 17/17; mimari v1.23). v1.19 · 2026-11-14 (v1.18’den fark: Faz 4 adım 6 tamam — Content Browser 6a–g, motor içeriği kipi, motor level kayıt / 409, sınıf listesinin tazelenmesi; DOM panelleri kutusu kapandı; kapı yeşil: 1.946 test, 39 editör ve 1 dist smoke; mimari v1.22). v1.18 · 2026-11-14 (v1.17'den fark: Faz 4 adım 5 tamam — paneller: sanallaştırılmış Outliner (50.000 ölçümü), şemadan Details ve çoklu seçim, düzenleme işlemleri ve gruplama, Add Actor + sürükle-bırak, World Settings ve ortam ayrıntıları, kısayollar ve sağ tık menüsü; kullanıcı kararları 2026-11-14; SDK 0.1.7; mimari v1.21. v1.17 · 2026-11-14 (v1.16'dan fark: Faz 4 adım 4 tamam — gizmo (Forge'unki, sürükleme matematiği three'siz), araçlar ve snap widget'ları, zemin / duvar snap'i picker ışınlarıyla, pivot (kullanıcı kararı: aktör belgesinde `pivot`), instancing transform hızlı yolu; 11 R yeniden yazıldı; mimari v1.20. v1.16 · 2026-11-14 (v1.15'ten fark: Faz 4 adım 3 tamam — editör viewport'u: editör kamerası ve kipleri, çizim katmanı (sahne derinliğine karşı; pipeline'sız karede derinlik ön geçişi), ızgara, CPU picking ve seçim çerçevesi, View Mode / Show / Quality menüleri, `editorRender` bağlamaları ve ışığın yardımcıları; mimari v1.19. v1.15 · 2026-11-13 (v1.14'ten fark: Faz 4 adım 2 tamam — 2b üretim build'i (kullanıcı kararı: Faz 4), statik içerik, `verify:dist --strict`, alt dizin smoke'u; dist kutusu işaretli. v1.14 · 2026-11-13 (v1.13'ten fark: Faz 4 adım 2'nin dilimi — editörün World'ü (`inEditor`, kullanıcı kararı), `actorsChanged`, `editorRender` kuralı, editör oturumu, `?editor` kabuğu, editör smoke'u, `verify:dist`; kalan 2b üretim build'i. v1.13 · 2026-11-13 (v1.12'den fark: Faz 4 adım 1 tamam — UI kiti (`src/editor/ui`), `?editor-kit`, editörün tarayıcı denetimleri gate ve CI'da. v1.12 · 2026-11-13 (v1.11'den fark: Faz 4 başladı — döküm (36 INV satırı, ertelenmiş A yok, 11 R), kararlar 1–12 (kullanıcı onayı), adım sırası 1–10; mimari v1.16. v1.11 · 2026-11-13 (v1.10'dan fark: Faz 3 kapandı — adım 9: smoke tam seti Faz 0 pozu ve boyutuyla, Faz 0 ile yan yana ızgara (`npm run smoke:grid`), yönlü ışıkların dünya çerçevesi düzeltmesi; kullanıcının görsel kabulü ve referanslar; view distance 5b'ye (kullanıcı kararı); bölüm `docs/archive/PHASE_3.md`'ye taşındı; mimari v1.15. v1.10 · 2026-11-13 (v1.9'dan fark: Faz 3 adım 8 tamam — otomatik instancing, terrain salt çizimi, görüntüleyicinin varsayılan kamerası, `?debug` paneli, bütün çizen referans level'lar smoke'ta; kullanıcı kararları: terrain / örtü katman materyali GUID, paket manifesti `requires`, `?debug` kapsamı; referans projesi yeniden alındı; mimari v1.14. v1.9 · 2026-11-13 (v1.8'den fark: Faz 3 adım 7 tamam — olay bazlı gün saati: `timeTransition`, `WorldEnvironmentService.transitionTo` (`Promise<boolean>`, hep ileri), Sky Light yakalaması aynı PMREM'e, ölçülerek seçilen yakalama hızı (açı + 0,1 sn + durunca son yakalama), `npm run measure:sky-capture`; kullanıcı kararları; mimari v1.13. v1.8 · 2026-11-13 (v1.7'den fark: Faz 3 adım 6 tamam — `forge.postProcess`, `applyQualityToPostProcess`, TSL `RenderPipeline` (MRT 30 bayt, cihaz sondası), çıktı dönüşümü; kullanıcı kararları: gökyüzü kubbesi Post Process altında kendi pozlamasıyla, SSGI AO'nun yerine, pipeline'sız çizimde MSAA; referans projesi yeniden alındı; mimari v1.12. v1.7 · 2026-11-13 (v1.6'dan fark: Faz 3 adım 5 tamam — çevre:
`forge.skyAtmosphere` / `forge.skyLight` (arka plan ve ortam ışığı dahil,
kullanıcı kararı) / `forge.cloudLayer` / `forge.worldEnvironment` (sabit
saat), TSL gökyüzü + ay + yıldız, PMREM Sky Light, bulut, WES yorumu,
gökyüzü varken ACES; çeviriciler ve World Builder greybox görünümü;
`viewDistance` 5b'den öne alındı (10 A); mimari v1.11. v1.6: Faz 3 adım 4 tamam — şemalı
JSON asset türü, `forge.material`, model / texture / staticMesh / shape /
terrain sürüm 2, TSL materyal ve katkı sırası, materyal çeviricileri, starter
materyalleri, 4 A; Faz 3'te ertelenmiş A kalmadı; mimari v1.10. v1.5: Faz 3
adım 3 tamam — ışık
bileşenleri, CSMShadowNode + takipli gölge, ışık çevirisi, 18 A; statik gölge
varsayılanları bileşen başına (kullanıcı kararı); mimari v1.9. v1.4: Faz 3 adım 2 tamam — kalite
profilleri, uyarlamalı kalite, donanım ipuçları ve kullanıcı ayarları taşındı
(17 A), runtime kalite sürücüsü, GPU timer D, WebGPU izin alanları ve
merdiven dışı Cinematic; mimari v1.8. v1.3: Faz 3 adım 1, dikey dilim
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

### Faz 3 — Render çekirdeği ve level görüntüleyici (kapandı 2026-11-13)

Ayrıntı: [docs/archive/PHASE_3.md](../archive/PHASE_3.md) (döküm, içe aktarıcı
çeviricileri, kararlar 1–11, adım 1–9, kutular); kararlar mimari raporda (§4.3,
§4.6–§4.10; v1.6–v1.15), modül başına kayıt [`docs/PORT_LOG.md`](../PORT_LOG.md) §2.
Kuruldu: `src/render` (WebGPU renderer host: backend kanıtı, DPR, cihaz kaybı v1,
timestamp; GUID anahtarlı kaynak önbelleği; `render.ts` bağlamaları host toplar),
kalite merdiveni + uyarlamalı kalite + WebGPU izin alanları (Cinematic merdiven
dışı), `forge.light` + kaskatlı güneş (`CSMShadowNode`) / takipli gölge, şemalı
JSON asset türü ve `forge.material` (TSL slot düğümleri), gökyüzü / Sky Light (PMREM)
/ bulut / World Environment, olay bazlı gün saati (`transitionTo`, ölçülen yakalama
hızı), TSL `RenderPipeline` + Post Process + MRT 30 bayt, görüntüleyici (otomatik
instancing, TSL CDLOD terrain salt çizimi, varsayılan kamera, `?debug`); içe
aktarıcının Faz 3 çeviricileri ve yeniden alınan referans projesi; render smoke'u
(15 çekim, Faz 0 pozu ve boyutu) ve Faz 0 ile yan yana ızgara (`npm run
smoke:grid`). Kapı (2026-11-13): **A 934 / 1.021**, Faz 3'e ertelenmiş A yok;
kullanıcının ilk görsel kabulü verildi, referans görüntüler yazıldı. View distance
5b'ye taşındı (kullanıcı kararı). Bilinen farklar sonraki fazlarda: foliage 5c,
su 7, araçlar 6 / 8.

### Faz 4 — Editör çekirdeği (kapandı 2026-11-15)

Ayrıntı: [docs/archive/PHASE_4.md](../archive/PHASE_4.md) (döküm, kararlar 1–12,
adım 1–10, kutular); kararlar mimari raporda (§4.2, §4.3, §4.6–§4.11; v1.16–v1.27),
modül başına kayıt [`docs/PORT_LOG.md`](../PORT_LOG.md) §2. Kuruldu: UI kiti
(`src/editor/ui`, `?editor-kit`), `?editor` kabuğu ve editör oturumu (`actorsChanged`,
undo / redo, kayıt), viewport (`src/render/editor`: editör kamerası, çizim katmanı,
picking, seçim çerçevesi, menüler), Forge'un gizmo'su (three'siz sürükleme matematiği),
snap ve pivot, paneller (sanallaştırılmış Outliner, şemadan Details, World Settings, Add
Actor, kısayollar), Content Browser (küçük resim, referans güvenli işlemler, import,
motor içeriği kipi), asset editörleri (genel veri editörü A13 + önizlemeler), Play
oturum katmanı ve 409 Compare / Reload, ajan komutları `npm run forge -- edit` (A12)
ve editörün canlı tazelenmesi, oyunun editör tarafı (`virtual:forge/game-editors`),
üretim build'i ve alt dizin yayını. Kapı (2026-11-15): Forge'un `editor-authoring`
karşılığı ve editör smoke tam seti (66; gate ve CI'da `forceWebGL`, yerelde
`npm run smoke:editor:webgpu` gerçek WebGPU'da 66 / 66), `verify:dist --strict` ve
`smoke:dist`, Outliner 50.000 aktörde eşik içinde, A12 kabulü; **A 934 / 1.021**.
Sonraki fazlara kalanlar: Details'in fizik / nav bölümleri ve çarpışma görünümü (6),
su (7), kırılma (8), view distance (5b), UI widget editörü kararı (Faz 6 başı).

### Faz 5 — Açık dünya

Dört alt faz; her birinin kendi kapısı var, görsel kabul sonda toplu istenir.
5a önce gelir; 5b ve 5c onun üstünde paralel yürüyebilir; 5d, 5a–5c'nin
çıktısını kullanır.

**WES + prosedürel bitki bağı (kullanıcı kararı, 2026-11-14; yalnız plan):**
[prosedürel bitki planı](PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md) v0.6 ile
mevsime tepki veren bitkiler bu faza bağlandı. PG0 ortak sözleşmeleri ve
PG1–PG3 küçük üretim / CLI dilimi 5c ile birlikte ilerler; 5c'nin kapanışında
prosedürel üretilmiş bir yaprak döken ve bir iğne yapraklı ağaç kullanılır.
Tam tarif paneli / World Builder bağlantısı PG5 / 5d'de gelir. Böylece üretici
bütün Faz 5'i, 5c de tam üretici araçlarını beklemez. Mimari §4.9 ortak
sözleşmenin otoritesidir; ayrıntılar ve PV-WES kabul matrisi bitki planındadır.
Geometri önceden üretilir; tekil bitki bileşenli aktör ve kompakt foliage aynı
aile / WES tepki sistemini kullanır. Olay bazlı saat korunur, birikim geçen
simülasyon süresinden ilerler. WES örtüsü / rüzgârı 5a adım 7'de uygulandı; bitki ailesi / tepki şemaları ve PG0–PG3 5c'de, faz kutusu açık.

**Başladı 2026-11-15.** Faz 6 bekler (kullanıcı kararı 2026-11-15); 5a'dan sonra
5b ∥ 5c (PG0–PG3 5c ile), sonra 5d. Her alt fazın ayrıntılı dökümü ve kararları
kendi başında alınır; bugün 5a açıldı. Forge kaynakları yalnız okunur
(`forge-webgl-final`).

**Faz 5 dökümü (2026-11-15).** Fazı 5 olan 29 envanter satırı (`PORT_LOG` §1),
ertelenen 60 A (`npm run port:forge-tests`, TSV `deferred` `5a`–`5d`). R sayıları
dosya adından tahmindir, alt fazın dökümünde kesinleşir. Mevcut durum: terrain
verisi, sculpt / erosion / auto paint, spline, heightmap, World Builder ve World
Partition'ın saf kısmı 2b'de taşındı; Faz 3'ün terrain çizimi morph, skirt ve 8
katmanı çiziyor, ama bütün tile'lar bellekte, frustum kesimi ve collider yok.

| Alt faz | INV | Ertelenen A | R (tahmin) | Forge kaynağı |
|---|---|---|---|---|
| 5a | A21, B12, D18, D21, E25, F25, G14, H11 | 4 (birikinti 3, öksüz tile 1) | ~40 | `engine/render-three/terrain/*`, `landscape.ts`, `puddlePlanarReflections.ts`, `src/scene/{puddleWaterController,debugTerrainMap}.ts`, `capabilities/terrainWorkerPool.ts`, `engine/physics/terrainCollider.ts` |
| 5b | B11, D31, F24, G12, H13 | 44 (`assetResidency` 18, `worldStreaming` 17, `worldMapView` 5, `detailCulling` 2, `terrainRuntimeStreaming` 2) | ~6 | `engine/world/{worldStreamingSubsystem,assetResidency,hlod,detailCulling,worldMapView}.ts`, `render-three/{distanceLod,staticDetailCulling}.ts`, `src/scene/hlodProxies.ts` |
| 5c | D29, D30, E21, G16 | 8 (`foliageRing`) | ~15 | `engine/render-three/{foliage,foliageFade,foliageImpostor,windSway}.ts`, `engine/world/{foliageCells,foliageRing}.ts`, `src/scene/{proceduralFoliageRing,foliageCell*}.ts` |
| 5d | B01–B06, B08–B10, B13, E26, G21 | 4 (`worldTerrainMove`) | ~6 | `src/editor/{worldTerrainDialog,worldTerrainExpandDialog}.ts`, `panels/foliage/foliagePanel.ts`, `engine/scene/{foliagePaint,meshPaint,spline*}.ts`, `panels/world/*` |

**5a kararları (kullanıcı, 2026-11-15; ayrıntı mimari v1.28 §4.4, §4.9):**

1. *Kapsam:* kıyı ıslaklığı ve kostik Faz 7'ye, su gövdeleriyle (Forge'da
   `terrainShoreWetness` / `terrainCaustics` göl, nehir ve okyanustan beslenir).
   INV-G14 bölünür; su birikintisi 5a'da kalır.
2. *Su birikintisi:* uzamsal `forge.puddle` bileşeni, aktörüyle hücresinde.
   Forge'un çamur, önizleme, yansıma, dalgacık ve rüzgâr alanları şemada;
   Details şemadan (INV-A21, özel panel taşınmaz); yansıma `reflector()` ile
   planar (Faz 7'nin 2026-11-11 yansıma kararı), kalite profiline bağlı. İçe
   aktarıcıya birikinti çeviricisi; referans projesi yeniden alınır.
3. *Tile akışı:* terrain aktörü kalıcı katmanda; tile'lar kamera çevresinde 64
   slotluk havuza akar, uzak alan global haritadan; tile çözme Web Worker'da
   (`src/runtime`); editör aynı akışla, düzenlenen tile sabit
   (`keptTerrainTiles`); frustum kesimi açılır. 5b'nin hücre akışından bağımsız.
4. *Collider eşleşmesi (G8):* `engine/physics/terrainCollider` (Rapier
   heightfield) 5a'da; Node testi görsel yüksekliğin CPU ikizini collider'la,
   render smoke'u GPU'dan okunan yüksekliği aynı noktalarda karşılaştırır.
   Collider'ın World'e bağlanması Faz 6.
5. *WES örtüsü:* `forge.worldEnvironment` sürüm artışıyla `surface` (kar /
   ıslaklık hedefi, birimi tanımlı birikim / erime / kuruma oranları); birikim
   simülasyon süresiyle, `transitionTo`'nun saat atlaması sayılmaz; durum WES
   servisinde ve kayıt oyununda; terrain materyalinde katkı (sıra: world mask →
   fade → rüzgâr → ıslaklık → göçük); editör önizlemesi geçici, level'a yazılmaz,
   testle kanıtlanır.
6. *Teşhis:* `?debug` terrain haritası 5a'da (Faz 3'te 5a / 6'ya bırakılmıştı).
7. *Öksüz tile:* modül taşınır (1 A); ayrı araç yok, `verify:assets` raporlar.

**5a ilerleme:** adım 1 (`c6e1dba`), 2 (`ef83c69`), 3 (`3f2348f`) 4 (`af96fc2`), 5 (`523f0fb`), 6 (`1e8fe09`) ve 7 (`ad024bd`) tamam. Adım 8'in kodu ve teknik kapısı tamam (2026-11-16); kullanıcı statik görselleri ve Derekavak canlı görünümünü kabul etti. Island gölge düzeltmesinin yeniden canlı kabulü bekleniyor, 5a kutusu açık. *Adım 2 (2026-11-15):*
Forge'un `TerrainRuntimeStreaming`'i ve akış çekirdeği (`worldStreamingSubsystem`,
5b'den öne alındı; 19 A: çekirdek 16, worker 1, terrain akışı 2), terrain worker'ı
ve havuzu taşındı. Global harita parçası geçerli çok tile'lı terrain akar (render
menzili 2 tile, pasif önbellek 4 tile'lık bayt), tek tile ya da haritasız terrain
bir kerede okunur. Görünüm Forge'un `TerrainRenderer` kurallarıyla: 64 slot, karede
4 yükleme (katman başına), görüş + gölge ışıkları (CSM kaskatları dahil) yan
düzlemleriyle kesim, delik doldurma. Editör oyunla aynı akışla çizer; düzenlenen
tile'ın sabitlenmesi 5d'de, tutulan bölgeler World Partition paneliyle (5b). Akışın
sahibi şimdilik render bağlaması; collider gelince (Faz 6) fizikle paylaşılan alt
sisteme taşınır. Hazır olma (`data-forge-ready`) akış ve slotlar oturana kadar
bekler. Kanıt: OpenWorldTest 256 tile'dan 26'sını, Derekavak 64'ten 29'unu okuyor,
çözme 2 worker'da; render smoke'u gerçek WebGPU'da 17 / 17 (referanslarla eşleşti).
**A 953 / 1.021.** *Adım 3 (2026-11-15):* Forge'un aydınlatılmış katman
gölgelendiricisi TSL'de: katman albedoları tek dizi dokusu (`terrainLayerArray`,
CPU'da paketleme; KTX2 katman okunamaz, renkle çizilir — Forge gibi), pürüzlülük
haritası albedo alfa'sına, katman normal haritaları ve detay atlası ikinci dizi,
katman normalleri terrain normalinin teğet uzayında, statik detay damgaları
(`materials/terrainDetail.ts`), global haritadaki delikler `maskNode` ile her
geçişte, slot ve global normaller half-float, kalite kancaları `terrainSelfShadow` /
`terrainFarTiling`. Bağlama sayısı katman sayısından bağımsız (2 dizi). Hata ayıklama
görünümleri (5d), uzak foliage tonu (5c), iz / ıslaklık (8, 5a adım 7) sonra. 10 R
yeniden yazıldı (katman dizisi 5, detay atlası 1, tek örnekleyici 1, kesim / gölge /
kalite 2, en yakın slot yerleşimi 1). Referans terrain'lerinde diziler doğrulandı
(Derekavak: 5 albedo, wet-mud pürüzlülüğü alfa'da, 6 normal dilimi); render smoke'u
gerçek WebGPU'da 17 / 17 referanslarla (genel çekimlerde fark küçük: ortalama ≤ 2 / 255).
*Adım 4 (2026-11-15):* `?debug` terrain haritası Forge'un `debugTerrainMap`'i (tile başına kare, akış durumunun rengi, akış kaynağı noktası, smoke için `data-tiles` sayımı) ve okumada Forge'un akış satırları (`terrain streaming: loaded / active / queued / physics`, kare süresi, bayt, etkin tile'lar, lejant); collider olmadığı için physics 0, Forge'un "holding pawn"ı Faz 6'da. Akışın sahibi render bağlaması olduğundan panel akışları sahnedeki debug etiketinden okur (`render/sync/debugTags.ts`, `pickTags` gibi); anlık görüntü ve satırlar saf modülde (`engine/terrain/terrainStreamingDebug.ts`). Akmayan terrain'de harita gizli kalır; editörün Stats paneli aynı modülü kullanır. Global harita: dosyadan çözülen harita eksik tile'la hesaplananla aynı dokuları ve aynı seçimi verir. Kaplama: seçilen düğümler her kameradan ızgarayı bir kez kaplar, eksik tile tam çözünürlükte çizilmez, 2×3 kapsamda iz detayıyla alan footprint'e eşittir. Işın: pick yüzeyi referans mesh'le aynı mesafede isabet eder, delikte ve kenar ötesinde ıskalar, `far`'a uyar. **Düzeltilen hata:** pick yüzeyi ışını dünya origin'iyle atıyordu; yüklenmemiş tile'ın far map'i datum'a göreli olduğu için ışın datum kadar aşağıda isabet ediyordu. Artık Forge'un renderer'ı gibi terrain'in yerel çerçevesinde. 8 R yeniden yazıldı (global öznitelikler 1, kaplama 3, ışın 4); "döndürülmüş aktör" kısmı uygulanmaz (World Terrain tanımın origin'iyle yerleşir, dönmez), düzenlemenin ışını güncellemesi 5d'de. A 953 / 1.021 değişmedi. Render smoke'u gerçek WebGPU'da 17 / 17 (`?debug` smoke'u haritayı ve 64 tile'lık sayımı denetler).
*Adım 5 (2026-11-15):* G8 collider eşleşmesi. Görsel yüksekliğin CPU ikizi `engine/terrain/terrainVisualHeight.ts`'te: terrain vertex gölgelendiricisinin birebir karşılığı (düğüm, LOD kamerasına 3B uzaklıktan morph, tek grid köşelerinin üst ızgaraya kayması, tile'da collider'ın b–c köşegeni, global haritada bilinear), nokta rasterlenen üçgenin enterpolasyonu. Node testi gerçek LOD seçimiyle ikizi 512 m'lik terrain'de 1 m ızgarada Rapier heightfield'ına (`engine/physics/terrainCollider`, 2b'de taşınmıştı) atılan ışınla karşılaştırır: tam çözünürlükte (yaprak düğüm, tile yuvasından, morph'suz) ≤ 0,05 mm; kaba bantlar 5 cm'yi aşar (test ayırt eder). Render smoke'u (`tests/smoke/terrainCollider.smoke.ts`) GPU'dan okur: terrain materyalinin yükseklik sondası (aynı vertex aşaması ve delik kesimi, piksel başına dünya XYZ), ana kameranın LOD ve morph'uyla üstten ortografik, 1 px / m, 256 m; ölçüm yalnız dev'de `window.__forgeDev.terrainColliderMatch` (dinamik import, tarayıcıda Rapier). Gerçek WebGPU'da Derekavak / OpenWorldTest / Island P1: tam çözünürlükte en çok 2,9 / 0 / 2,9 mm (Faz 1 spike'ı 4,9 mm); morph bandı en çok 27 cm, kaba bantlar 31 cm (bilgi); GPU ile CPU ikizi her bantta ≤ 0,8 mm, yani Node testi GPU'nun yüzeyi için de geçerli. Kayıt `render-refs/runs/*-g8.json`. Rapier Vite'ın `optimizeDeps`'inde (ilk dinamik import'ta dev sunucusu sayfayı yeniden yüklüyordu). Collider'ın World'e bağlanması Faz 6. A 953 / 1.021 değişmedi. Render smoke'u 20 / 20.
*Adım 6 (2026-11-15):* su birikintisi. **Kullanıcı kararları (2026-11-15, hepsi öneri):** bileşenin dünya konumu tohum noktası (X / Z) ve su seviyesi (Y), bileşende yalnız çalışma alanı `size` (Forge'un `puddleRegionAroundSeed`'i, terrain ızgarasına oturur); yatak tohumun altındaki terrain (otomatik, `terrainRef` yok); rüzgâr WES `wind` alanından, adım 7'deki sürüm artışında; smoke birikintiyi dev kancasıyla ekler, referans projesine dokunulmaz (referans içeriğinde birikinti yok, yeniden alma gerekmedi). Taşınan saf modüller: `engine/terrain/{terrainPuddle,puddleWater,puddleInteraction (saf kısım)}`, `engine/environment/puddleWind`, yatak `engine/terrain/puddleBed` (Forge'un hazırlığı, uyarlanmış). `forge.puddle@1` (`src/features/puddle`): Forge'un alanları, varsayılanları ve aralıkları; Details şemadan, altında doldurmanın sonucu (`PuddleStatusKey` servisi; Details bağlamına `target()`, SDK 0.1.11). Render bağlaması terrain'i bulur, alanın tile'larını terrain'in okuyucusuyla okur (en çok 16), Forge'un havza doldurmasını karede 2 ms'lik dilimlerle çalıştırır, başarısız doldurmada önceki yüzeyi korur. Su `render/materials/puddle.ts` (TSL: derinlikten çamur ve alfa, IOR 1,333; planar yansıma Fresnel'li ek terim, ortam yoğunluğu (1 − güç)), yansıma seçimi `render/sync/puddleReflections.ts` (Forge'un kuralları, `reflector()`: seviye + kalite başına paylaşım, en çok 2, ekranın %1'i, 0,1 sn, kalite profilinin `terrainWaterQuality` tavanı). Editör: Add Actor > Visual Effects > Puddle bırakılan noktanın 5 cm üstünde. İçe aktarıcı `puddleWaters`'ı çevirir (`engine/forgeImport/puddles.ts`; eski gövdede mod yoksa `environment`, `t-water-n` rüzgâr normali GUID'iyle). Sonraya: rüzgâr dalgacığı gölgelendiricisi WES rüzgârıyla (adım 7), tekerlek dalgacıkları araçlarla (Faz 6 / 8), deforme yatak ve terrain'in birikinti maskesi Faz 8. Kanıt: render smoke'u `puddle.smoke.ts` (Derekavak'ta çukur, 117 m² hazır, görüntü farkı 1,5, çizim çağrısı 349 → 681: yansıma sahneyi yeniden çiziyor), editör smoke'u (Add Actor, Details, durum). **A 956 / 1.021** (ertelenmiş 3 A). Render smoke'u 21 / 21, editör gerçek GPU'da 67 / 67.

*Adım 7 (2026-11-15, `ad024bd`):* WES örtüsü ve ortak rüzgâr. **Kullanıcı kararları:** örtü level açılışında authored hedeflerden başlar; hedefler mevsim / havadan bağımsızdır. Kar birikimi / erime / ıslanma / kuruma oranları sırasıyla 0,01 / 0,005 / 0,1 / 0,01 örtü / simülasyon saniyesi (0 durdurur). Önizleme hedefi doğrudan gösterir. Rüzgârın tabanı `settings.wind`, WES'te `Use Level Wind` ya da override; içe aktarıcı Forge'un alan bazındaki WES → worldSettings → varsayılan önceliğini çözer. `forge.worldEnvironment@2` (v1 migration): `surface`, `wind`, A7 `liveEnvironment` state. `controller.setSurfaceTarget` hedefi değiştirir; `setSurface` doğrudan önizleme / atamadır. Saat atlaması örtü süresi değildir; aynı toplam sürede 30/60/144 Hz eşdeğerdir, pause durdurur; save/load tutulan örtü ve hedeflerden devam eder. Terrain katkısı `materials/surfaceCover`, sabit katkı sırasında (wetness), yalnız uniform: boya / yükseklik / fizik materyali ve shader grafiği değişmez. Editör sürgüleri dosya baytlarına / Play'e sızmaz; Make Default tek undo adımıdır. Birikinti: Forge'un rüzgâr bloğu TSL'e (iki normal katmanı, eğrisel tepe, paket / esinti, pürüzlülük genişlemesi); yansıma okuması yansıma kamerasından bükülür, `PuddleWindMotion` simülasyon saniyesiyle. Normal boşsa dalgacık yok; geç yükleme silinmiş birikintiyi diriltmez. Host'un texture kaynağı World kaynaklarına da bağlandı (dokulu GPU testi yakaladı). İçe aktarıcı raporu ve `--compare` örtü / rüzgâr değerlerini de doğrular. **A 956 / 1.021 değişmedi**, 5a'da öksüz tile 1; bitki PG0–PG3 / 8 foliageRing A 5c'de. SDK 0.1.12. Kapı: 2.101 test, 68 editör + 1 dist; gerçek WebGPU render 22 / 22, editör 68 / 68. GPU kanıtı: terrain ıslaklık farkı 17,31, kar 42,64, sıfıra dönüş 0; normal 1 istek, 2 simülasyon saniyesinde su farkı 0,134, pause'da 0 (0–255 ortalama parlaklık farkı). Kullanıcının görsel kabulü / referans yenilemesi yapılmadı. Sıradaki: adım 8 (öksüz tile ve 5a kapısı).

*Adım 8 (2026-11-16):* öksüz terrain parçaları ve teknik kapı. `tools/terrainOrphans.ts` Forge'un `collectJsonStrings` algoritmasını ve kalan 1 A testini taşır. Eski level'a özel klasör varsayımı yeni GUID modeline uyarlandı: aynı içerik kökünde kayıtlı terrain tanımı bulunmayan global / tile parçaları ve `data.tiles[].key` listesinde olmayan tile'lar `orphan-terrain-part` hatasıdır. Level'a yerleştirilmemiş geçerli terrain asset'i korunur. `verify:assets` ve `check:projects` raporlar; otomatik silme yok. Beş odaklı kontrol: 1 A + yeni sahiplik / kök izolasyonu / okunamayan liste / salt okunur rapor davranışı. **A 957 / 1.021**; 5a'ya ertelenmiş A kalmadı.

**§2.10 ölçümü:** `npm run measure:terrain`, RTX 3060, sürücü 32.0.16.1060, Chrome 157.0.8103.51, three 0.187.0, gerçek WebGPU; sabit `high`, adaptive kapalı, DPR 1, uncapped. Dört sahne × P1–P3 × 1080p / 1440p: 10 sn ısınma + 15 sn ham kare, toplam 149.194 kare. **24 / 24 bütçe içinde**; ayrıca yeni sekme Play açılışı geçti (25 / 25). Her sütun üç pozun ayrı ayrı en büyük değeridir; süreler ms:

| Sahne | 1080p ortalama / p95 | 1440p ortalama / p95 | 1440p GPU hareketli ortalaması | En uzun tek kare (iki boyut) |
|---|---|---|---|---|
| Derekavak | 5,96 / 7,00 | 9,83 / 11,20 | 8,72 | 39,50 |
| WbPilotValley | 2,84 / 3,50 | 4,54 / 5,30 | 4,04 | 45,00 |
| Island | 2,46 / 2,90 | 4,01 / 4,60 | 3,66 | 29,00 |
| OpenWorldTest | 1,30 / 1,60 | 2,04 / 2,50 | 1,77 | 24,90 |

Bütçe: 1080p ortalama ≤ 14 / p95 ≤ 16,6; 1440p ortalama ≤ 16,6 / p95 ≤ 20. GPU değerleri timestamp-query'nin 120 örneklik hareketli ortalamalarıdır (500 ms arayla); ham GPU kare yüzdelikleri değildir. Soğuk / sıcak açılış 1,11–3,27 / 1,34–3,43 sn. Soğuk: yeni context ve temiz HTTP cache; OS / sürücü shader cache'i temizlenmedi. Shader / pipeline API çağrılarının gecikmeleri ayrıca kayıtlı; saf derleyici süresi değildir, async çağrılar örtüşebilir. Isınma sonrasındaki 24 örnekleme penceresinde yeni render pipeline yok. Doku / geometri ve JS heap kayıtlı; GPU bellek baytı erişilemedi (null + gerekçe). Foliage / su gövdeleri / oyun henüz yok: bu terrain diliminin bütçesidir; G1 eşdeğer içerik ya da tam dünya G2 / G3 / G6 kabulü değildir. Tekil uzun kareler gizlenmedi; hücre akışı sıçrama kabulü 5b'de.

Kanıt: `ForgeReference/render-refs/runs/2026-11-16T11-06-51-509Z-terrain-measure.json`; yeni sekme Play'in profil bilgisi de aynı ölçüm komutunun odaklı koşusunda kaydedildi. **Kapı:** 2.106 test, 68 editör (`forceWebGL`) + 1 dist; gerçek WebGPU render **22 / 22**, editör **68 / 68**. G8 tam çözünürlükte azami 2,93 mm, GPU–CPU ikizi ≤ 0,8 mm; morph / kaba bantlar bilgi olarak ayrıca kayıtlı (`2026-11-16T11-21-23-834Z-g8.json`). WES kar / ıslaklık farkı 42,64 / 17,31; sıfıra dönüş 0. SDK yüzeyi değişmedi (0.1.12). `smoke:grid` içinde ayrı `#terrain-effects` bölümü: kuru / ıslak / karlı terrain ve temiz birikinti adayı. **§2.9 gereği kullanıcı görsel kabulü bekleniyor; kabul edilmiş referanslar yenilenmedi, 5a kutusu kapatılmadı ve arşivlenmedi.** Sıradaki: görsel kabul; sonra 5b / 5c kendi döküm ve kararlarıyla.

Play'in odaklı kaydı: `render-refs/runs/2026-11-16T11-25-35-768Z-terrain-measure.json`; gerçek WebGPU, `high`, 1280 × 720 / DPR 1, editörün ısıttığı HTTP cache ama yeni sekme / cihaz / modül grafiği. Navigasyondan hazır canvas'a 3,32 sn, Play tıklamasından hazır canvas'a 3,48 sn. Temiz birikinti adayı için odaklı render smoke'u da geçti (1 / 1).

**Görsel kabul güncellemesi (2026-11-16):** kullanıcı inceleme sayfasını açıp sorun görmediğini bildirdi; statik görüntüler kabul edildi. Kamera / detay geçişi, WES önizlemesi ve hareketli birikinti için canlı editör kontrolü bekliyor. VS Code `Terminal → Run Build Task` artık varsayılan `Open Editor` ile 5183'te Derekavak'ı açar: referans projenin `%TEMP%/forge-webgpu-reference-editor/webgpu-scenes` kopyası düzenlenebilir; ilk açılışta hazırlanır, tekrar açılışta kayıtlı düzenlemeler korunur. `tools/open-dev-server.ps1` varsayılan yolu `/?editor`'dür. Kaynak referans projesi değişmez. Canlı kontrol tamamlanana kadar 5a kutusu açık kalır.

**Island canlı incelemesi (2026-11-16):** kullanıcı Derekavak'ta sorun görmediğini bildirdi; Island'da kamerayı izleyen koyu dörtgen saptandı. Kaynak: tek takipli güneş gölgesi (`cascadedShadows: false`), r187'nin Z ≤ 1 kontrolünde ters derinliğin alt sınırının eksik olması. Kamera yüksekten bakınca far dışında kalan zemin boş gölge haritasında bile kararıyordu. `BoundedShadowNode`, mevcut filtreye Z ≥ 0 kontrolünü ekler; gölgeler, bias ve menzil kapatılarak / değiştirilerek gizlenmez. Varsayılan güneş ve kaskatsız yönlü ışıklar aynı yardımcıyı kullanır. Kamera hareketinde düğüm korunur; CSM geçişinde takip düğümü bırakılır, CSM'nin kapanışı `undefined` fallback'ine döner. Node testi düğümün yeniden kullanımı ve serbest bırakılmasını, gerçek GPU smoke'u iki derinlik kipinde boş harita içi / dışı ve gerçek kutu gölgesini denetler. Düzeltme öncesinde gölgesiz / gölgeli boş zemin RGB farkı 36 / 255, sonrasında 0; gerçek kutu gölgesi farkı 32 / 255 korunur. Kaynak referans ve kullanıcının düzenlenebilir kopyasındaki authored veriler değişmedi. 5a kapanışı için Island'ın yeniden canlı kontrolü bekleniyor.

*Island doğrulaması:* odaklı ışık / kaynak testleri 10 / 10. Tam kapı **2.107 test + 68 editör + 1 dist** (`VITEST_MAX_WORKERS=4`; mevcut World Builder testi varsayılan paralellikte 30 sn sınırını aştığı için, aynı test / süre sınırları korunarak dört worker kullanıldı). Mevcut render smoke'ları **22 / 22**; yeni takip gölgesi regresyonları **2 / 2** (fixture'ın favicon isteği düzeltildikten sonra odaklı tekrar). Gerçek WebGPU editörün viewport / ortam / Play alt kümesi **10 / 10**; 68'lik gerçek GPU tam seti bu düzeltmeden sonra tekrarlanmadı. Island'da `(500,300,400)` kamerasında özel test sekmelerinde yalnız shader'ın alt Z kontrolü kaldırılarak eski durum tekrar üretildi; aynı pozun düzeltilmiş görünümünde dörtgen kayboldu. İki sekme de gerçek WebGPU, sayfa hatası yok; dosyaya kayıt yapılmadı. Kanıtlar `.forge-cache/island-shadow-{before,after}.png`, `island-shadow-editor-proof.json`, `island-shadow-gate-4workers.log`, `island-shadow-render.log`, `island-shadow-regression-final.log` ve `island-shadow-editor-webgpu.log`. Referans görüntüler güncellenmedi, SDK ve A sayısı değişmedi (0.1.12, 957 / 1.021). Kullanıcının Island son canlı kabulü bekleniyor.

**Nihai görsel kabul (2026-11-16):** kullanıcı “Forge WebGPU faz 5a görsel kabulü onaylıyorum” diyerek Faz 5a görsel kabulünü onayladı. Bu onay, yukarıdaki statik / canlı inceleme ve Island son kabul bekleyişini tamamlar; mevcut teknik kapı ve ölçüm kayıtlarıyla **5a Terrain tamamlandı**. Referans görüntü dosyaları bu belge güncellemesinde yenilenmedi; yeni test koşusu yapılmadı. Faz 5’in 5b–5d kutuları ve toplu açık dünya kabulü açık olduğundan Faz 5 bölümü henüz arşivlenmez. Sıradaki: 5b / 5c dökümü ve kararları.

**5a adım sırası:** 1 döküm ve kararlar (bu docs commit'i) · 2 tile akışı,
frustum kesimi, worker'da çözme · 3 üretim kalitesi: doku havuzu, katman dizisi,
statik detay, seam (R'lerin çoğu) · 4 global harita ve `?debug` terrain haritası ·
5 collider eşleşmesi (G8) · 6 su birikintisi + içe aktarıcı çeviricisi (3 A) ·
7 WES örtüsü ve rüzgâr (tamam) · 8 öksüz tile ve kapı (§2.10 ölçümü, smoke, gerçek WebGPU: tamam; kullanıcı görsel kabulü 2026-11-16 tarihinde onaylandı).

**5b başlangıç dökümü (2026-11-16, `65b5efd`; uygulama öncesi anlık görüntü).** INV-B11 (World Partition paneli), D31 (HLOD proxy'leri),
F24 (runtime akışı, asset residency, akış politikası), G12 (mesafe LOD + statik detay
culling), H13 (HLOD build); D32'nin akış kısmı ve D17'nin view distance'ı. Ertelenen
**25 A**: `assetResidency` 18, `worldMapView` 5, `detailCulling` 2. Forge'un `hlod.test`'i
eski model sayıldı (`OLD_MODEL_MODULES`), A değil; kuralları yeni testlerle yeniden yazılır.

| Var (2b / 3 / 5a) | Eksik (5b) |
|---|---|
| Izgara `core/grid`, hücre ataması ve dosyaları `core/level/{cells,cellDocs,levelParts}`, kısmi level (`mergeLevelParts`, `notLoaded`) | Runtime ve editör bütün hücreleri açılışta okur (`runtime/projectLevel.ts`, `editor/main.ts`) |
| Akış politikası, yerleşim planlayıcısı `WorldPartitionStreaming<Id>`, eşzamansız yükleyici `WorldStreamingSubsystem` (terrain bunu kullanıyor), `streamedActorState`, kayıt defteri | Hücre getirme (dev uçları + dist statik içerik), `assembleActors` / `removeActors` ile ekle-çıkar, defter bağı, hazır olma |
| World'ün `addActors` / `removeActors`'u; render kaynak önbelleği World başına sayaçlı (A6) | Sayaç sıfırlanınca gecikmeli atma (`disposeGltfResources`, Faz 3'ten 5b'ye), sızıntı sayaçları |
| `engine/world/viewDistance` (sis CPU ikizi, Faz 3), kalite profilinde `viewDistanceMultiplier` / `lodBias` | `settings.viewDistance` / `loadRange`, kamera far, Fit to View Distance |
| Otomatik instancing (`render/sync/instanceBatches`): anahtar başına dünya çapında tek batch | Detay culling (dither fade + batch atlama), HLOD, World Partition paneli, Outliner WP sekmesi / hücre rozeti |

Referans level'lar küçük (en çok 46 hücre, WbPilotValley); `cellSize` hepsinde 128.

**5b kararları (kullanıcı, 2026-11-16; 1, 5, 9 ve 10 kullanıcının seçimi, gerisi A11'in ve
önceki kararların uygulaması):**

1. *Menziller level ayarında:* `settings.viewDistance` (isteğe bağlı; kamera far,
   Ground Mist'in Fit to View Distance'ı, HLOD menzili; yoksa bugünkü far) ve
   `settings.loadRange` (varsayılan 384 m, Forge'unki), `cellSize` / `wind` gibi
   `level.json`'da. Kalite profilinin `viewDistanceMultiplier`'ı ikisini ölçekler
   (Forge kuralı). Akışın sahibi motordur, tekil bileşen yok.
2. *Runtime hücre akışı (A11):* açılışta kalıcı katman; hücreler `WorldStreamingSubsystem`
   + `WorldPartitionStreaming` ile kamera / oyuncu kaynağı çevresinde getirilir, normalize
   edilir, `assembleActors` ile eklenir, boşalınca `removeActors`; aktörün oyun durumu
   kayıt defterine yazılır, hücre yeniden gelince uygulanır (§4.8). Kare bütçesi
   planlayıcının. Getirme `src/runtime`'da (dev: kayıt servisinin uçları, dist:
   `dist/forge/` statik içerik, Play: oturum katmanı). Hazır olma başlangıç hücreleri
   etkinleşene kadar bekler. Terrain tile akışı ayrı kalır (5a karar 3).
3. *Asset residency:* Forge'un `AssetResidency`'si olduğu gibi; sahip hücre, kimlikler
   aktörlerin model / doku GUID'leri; render kaynak önbelleği son sahip bırakınca
   Forge'un gecikmesiyle atar. Ölçüm için önbellek, `renderer.info` ve World aktör
   sayıları tek anlık görüntüde.
4. *Editör akışı (A11):* oyunla aynı politika ve `loadRange`; kirli hücre kaydedilene
   kadar boşalmaz; tutulan bölgeler World Partition panelinden. Yüklenmemiş hücreye
   yazan işlem (`notLoaded` / `needs-load`) önce hücreyi yükler; yüklenemiyorsa işlem
   atomik reddedilir (gölge işlemlerindeki kural). Outliner yalnız yüklü aktörleri
   listeler, World Partition sekmesi hücreleri ve rozetleri gösterir. Dünya çapı
   işler dosyalardan (ajan komutları, `forge edit find`) değişmez.
5. *HLOD (kullanıcı seçimi):* level klasöründe `hlod.json` dizini (`cellSize`, hücre
   başına üçgen sayısı ve `sourceHash`) + `hlod/<x>_<z>.glb`; hücre gibi level parçası,
   asset değil, commit'lenir. `npm run forge -- hlod --project <yol> --level <klasör>`
   üretir (ajan da aynı komutu çalıştırır); Forge'un `hlodBuild` algoritması
   (weld + meshoptimizer simplify, oran 0,25, hata 0,01; materyal başına doğrusal
   ortalama renk; detay culling'le hücre boşalmadan kaybolan küçük nesne girmez).
   Bayat `sourceHash` editör panelinde ve `verify:assets`'te uyarı, `npm run build`
   uyarır. Runtime Forge'un `HlodProxies` kuralı: hücre view distance içinde ve
   etkin değilken proxy, etkinleşince gerçek mesh; 1,25 × view distance ötesinde
   bırakılır; aynı anda 4 okuma; tek paylaşılan materyal, doku ve gölge yok.
   Editör de aynı proxy'leri çizer (akışlı editörde boş görünen uzak hücreler için).
   Renk `vertexColors` bayrağıyla değil `colorNode` ile köşe niteliğinden okunur:
   three'nin meshlet hattı `vertexColors`'lı materyali reddeder (karar 10).
   **5c R1 notu (2026-11-17):** `forge.shape` da pişirilir (yukarıdaki "yalnız static
   mesh" kuralı kalktı); ayrıntı 5c yeni sıra altında.
6. *Detay culling:* Forge'un `detailCulling` kuralı (yarıçap × 200 × ölçek, 1.000 m
   üstü hiç; %80–100 arası dither fade, gölge dahil; kalite ölçeği) TSL'de yeniden
   yazılır. Batch atlaması anlamlı olsun diye otomatik instancing batch'leri hücreye
   bölünür (anahtar + hücre; hücre boşalınca yalnız onun batch'i gider, frustum
   sınırı hücre kadar). Derekavak P2'de draw call ve render gönderimi öncesi / sonrası
   ölçülür; G6'yı (5c kapısı) tehdit ederse bölme geri alınır ve kullanıcıya getirilir.
   **Geri dönüş kararı uygulandı:** 398 → 713 draw call sonrası kullanıcı bölmeyi
   5c öncesi G6 / meshlet spike'ına bıraktı; 5b ortak batch'lerle devam eder.
7. *Dünya haritası + World Partition paneli (INV-B11):* `worldMapView` (5 A) ve Forge'un
   paneli: terrain tile'ları ve durumları, dolu / yüklü / kirli hücreler, kamera ve
   menzil, tıklayınca odak, sürükleyince tutulan bölge, Load / Unload, HLOD bayatlığı.
   UI kitiyle (`src/editor/ui`), parametre kuralları geçerli.
8. *View distance:* kamera far `effectiveViewDistance`; far > 1.000 m'de Forge'un
   uzak görüş kipi (Faz 3'te takip gölgesi var); Fit to View Distance (INV-A15'te
   5b'ye bırakılmıştı) Ground Mist'i bu alana oturtur.
9. *Kapı ölçümü (kullanıcı seçimi):* sentetik büyük level, geçici kopyada araçla
   üretilir (~4 × 4 km, ~50.000 aktör, starter içeriği; `bench:level`'ın tohumlu
   üreticisi gibi). `npm run measure:streaming`: başlıklı gerçek WebGPU, 1080p
   `high`, DPR 1, sabit kamera rotası. Ölçüt: akış sırasında p99 ≤ 20 ms ve akışa
   bağlı tek kare ≤ 50 ms; 10 yükle / boşalt döngüsünden sonra aktör, geometri, doku
   ve kaynak önbelleği sayıları başa döner, JS heap artışı ≤ %5. Kayıt
   `render-refs/runs/*-streaming.json`. Kapıda ve CI'da değil.
10. *Mesafe LOD (kullanıcı kararı):* 5b'den çıkarıldı (INV-G12'nin bu kısmı). Yerine
    three r187'nin meshlet hattı (`MeshletDrawingPipeline`: 64 üçgenlik kümeler,
    meshoptimizer'la en çok 6 düzey, compute'ta nesne başına düzey seçimi, küme
    frustum / derinlik culling'i, geometri + materyal başına tek dolaylı çizim)
    konuşulacak; bugünkü kaydı Faz 9 maddesinde ve bina planı Ek A.2'de. Karar
    verilene kadar 5b bu hatta bağlanmaz ama ona engel olmaz (karar 5'teki renk).

**5b adım sırası** (C: Claude, X: Codex — tanımı yazılmış saf modül / Node aracı /
mekanik taşıma; X'in diff'ini Claude inceler, kapıları çalıştırır, commit'i atar):

1. Döküm ve kararlar — C. **Tamam:** `65b5efd`.
2. Saf modüller: `assetResidency` (18 A), `detailCulling` (2 A), `worldMapView` (5 A)
   `npm run port:forge -- tests` ile `src/engine/world`'e; `hlod`'un saf kısmı yeni
   modelle (dizin normalize, `sourceHash`, aktörlerden yerleşim, dahil etme kuralı) ve
   testleri — **X** (high), C inceler. **Tamam:** `4cef956`; 25 A taşındı,
   **A 957 → 982 / 1.021**, 5b'ye ertelenmiş A kalmadı. HLOD'un saf kısmı ve
   yeni model kontrolleri de bu commit'te; render culling'i adım 8'de bekliyor.
3. Level ayarları `viewDistance` / `loadRange`, kamera far, Fit to View Distance,
   kalite çarpanı — C. **Tamam:** `89b6a87`, kanonik kayıt beklentisi
   `de8654d`; World Settings Streaming alanları, Height Fog Fit to View Distance,
   oyun kamerası ve içe aktarıcı bağı uygulandı (`viewDistance: 0`: kameranın far'ı).
4. Runtime hücre akışı: hücre istemcisi (dev / dist / Play), World'e ekle-çıkar, kayıt
   defteri, hazır olma, `?debug` satırları — C. Hücre istemcisinin URL / hata
   tablosunun Node testleri — X (medium). **Tamam:** `c7a5174`; `63815f9` ile
   aktörler ebeveyn önce, 32'lik parçalarla, kare başına 3 ms ekleme bütçesiyle
   katılır (en az bir parça); etkin olmayan hücre verisinin önbellek bütçesi
   16 MiB. Hücre etkinleştirme kuyruğunun ayrı bütçesi 4 ms; HLOD bütün aktörler
   katılınca gizlenir. Başsız açılış bütün hücreleri kurar; editör akışı adım 6'da.
5. Asset residency ↔ kaynak önbelleği, gecikmeli atma, sızıntı anlık görüntüsü — C;
   önbelleğin atma kurallarının Node testleri sözleşmeden — X (medium).
   **Tamam:** `045964c`; `AssetResidency` son kaynak sahibi bırakınca 30 sn
   sonra host'un `update()` çağrısında atar; `disposeResource` GPU nesnelerini
   bırakır. Önbellek / World / GPU sayaçları ölçüm kancasında (`dddd81b`, `63815f9`).
6. Editör akışı: kısmi level oturumu, `needs-load` yükle-sonra-uygula, kirli hücre
   tutma, canlı tazeleme yüklenmemiş hücrede, Outliner WP sekmesi / rozet, editör
   smoke'u (kamerayı taşı → hücre gelir / gider; hücrede düzenle → kaydet → yeniden
   aç) — C. **Uygulandı:** kısmi oturum, kamera menzili, kirli hücre tutma,
   yüklenmemiş hedefte atomik ret (panelden Load sonrası tekrar), kısmi canlı
   tazeleme, Outliner sekmesi / hücre rozeti ve editör HLOD kaynağı.
7. World Partition paneli + dünya haritası (karar 7), Forge panelinin taşınması —
   **X** (high; dosyalar, panel API'si ve kit bileşenleri istemde), C inceler ve
   editör smoke'unu yazar. **Uygulandı:** `worldPartitionPanel`, dünya / terrain
   hücreleri, durumlar, kamera / menzil, tıkla odak, sürükle tut, Load / Unload /
   Release, HLOD bilinen bayatlık / kontrol edilmemiş hücre ayrımı.
8. Detay culling TSL'de + hücreye bölünmüş batch'ler + draw call ölçümü — C.
   **TSL fade uygulandı; bölme geri alındı (kullanıcı onayı):** Derekavak P2'de
   398 → 713 draw call (+%79), CPU render gönderimi 4,29 → 4,28 ms ortalama.
   Uncapped koşu G6'nın 60 Hz kabulü değildir. Bölme 5c öncesi G6 / meshlet
   spike'ında yeniden ele alınacak; 5b'de mevcut ortak batch'ler korunur.
9. HLOD build: `forge hlod` komutu, `hlodBuild`'in Node'a taşınması (gltf-transform /
   meshoptimizer bağımlılıkları depoda), dosya düzeni, `verify:assets` bayatlık
   uyarısı, build kopyası — **X** (high), C inceler. HLOD proxy'lerinin render'ı ve
   editörde gösterimi — C. **Tamam:** build, bayatlık uyarısı ve üretim
   kopyası `d8676b4`; runtime proxy çizimi `dddd81b`; geometriyi bırakırken
   Mesh `dispose` olayı `63815f9` (renderer'ın render nesnelerini de bırakması
   için). **Editörde gösterim de uygulandı:** yükle / boşalt proxy geçişi,
   bilinen kaynak bayatlığı, HLOD dosyaları değişince canlı yeniden okuma.
10. Sentetik level üreticisi — **X** (medium; tohum, boyut, aktör dağılımı istemde);
    `measure:streaming` (Playwright, gerçek GPU) ve koşusu — C.
    **Düzenek tamam:** `f202569` (`bench:streaming-level`), `63815f9`
    (`measure:streaming`). **Ölçüm geçti:** temiz `a6f3521` koşusu, ilk uçuş
    p99 / max 13,3 / 35,1 ms; kayıt ve sınırlar aşağıda.
11. Kapı: 25 A, editör / render / dist smoke'ları (dist'te hücreler statik içerikten),
    gerçek WebGPU editör seti, `measure:streaming`, belgeler; kullanıcı görsel kabulü
    (HLOD geçişi, detay fade) — C. **Teknik kontroller ve streaming ölçümü
    geçti; kullanıcı görsel kabulü açık.** Sonuçlar aşağıda.

**5b güncel uygulama notu (2026-11-17).** Adım 6–7 ve editör HLOD gösterimi
uygulandı. `levelSession` hücre ekle / çıkarı `stream` olayıyla bildirir;
bu olay dirty / undo oluşturmaz. Düzenleme ve undo / redo, yüklenmemiş bir
hücreyi gerektiriyorsa atomik reddedilir; kayıt öncesi kaynak ve hedef kirli
hücreler tutulur. Compare, eski `level.json` aktörlerini hücrelere taşıyan ajan
işlemlerini de izler. Panelin tutulan dikdörtgeni hücre ve terrain akışında
ortaktır (`KeptRegionsKey`); kalıcı level verisine yazılmaz.

Detay fade'i `render/materials/detailFade.ts`: yerleşim yarıçapı × 200,
1.000 m üstünde kesim yok, %80–100 dither, gölge maskesi dahil; template'in
kendi düğüm ölçeği yerleşim ölçeğine karıştırılmaz. Tamamen uzaktaki batch
CPU'da atlanır. Hücre bölmesi G6 riski nedeniyle geri alındı ve kullanıcının
onayıyla 5c öncesi spike'a bırakıldı. Eşlenik kayıtlar:
`2026-11-16T18-00-08-142Z-terrain-measure.json` (önce) ve
`2026-11-16T18-03-41-993Z-terrain-measure.json` (bölünmüş deneme),
`ForgeReference/render-refs/runs/` altında. CPU ölçümü render dolaşımı / komut
hazırlama / gönderimin duvar süresidir; GPU süresi değildir.

Kullanıcının onayladığı ön ısıtma: host kuyruğu yeni batch'leri görünür
sahnenin dışında `renderer.compileAsync` ile, mevcut sahne ışıkları ve gerçek
MRT / depth / sample biçimleriyle hazırlar. Derleme bitince sahneye alınır;
HLOD, `RenderReadinessKey` ile o zamana kadar korunur. İptal edilen / boşalan
batch tekrar eklenmez. Editör yerleştirmesi CPU geometrisini hazırlık sırasında
ölçebilir; özel asset önizlemesi kendi çizim döngüsünde kalır. Derleme
sırasındaki GPU nesneleri derleme tamamlanmadan bırakılmaz. Async derlemenin
taşıdığı render target / MRT durumu görünür kare başında ve derleme sonunda
sıfırlanır / geri yüklenir; aksi halde çıktı sabit kalabiliyordu. İlk ölçüm
denemesi kaynak yenilemesiyle kesildi ve kabul kanıtı sayılmadı. Son streaming
ölçümü aşağıda geçti; kullanıcı görsel kabulü gelmeden 5b kutusu kapatılmaz.

**5b editörde otomatik HLOD üretimi (2026-11-17, `0c16852`; kullanıcı onaylı
plan, Codex başlattı, Claude bitirdi).** World Partition panelinde Auto Generate
HLOD (level başına, varsayılan açık) ve Generate / Rebuild / Save and Generate
HLOD; durumlar Not generated / Current / Update required / Generating / Failed,
son üretimin hücre / üçgen / süre / uyarıları. Yazılabilir sahne açılınca ve
başarılı kayıttan ya da bağımlılık dosyası değişince (model / materyal / doku,
aynı GUID'de bayt değişimi dahil; `cellSize`, `loadRange`) tazelik denetlenir,
Auto açıksa bayat / eksik HLOD üretilir. Kirli düzenleme kendiliğinden
kaydedilmez; kamera ve hücre yükle / boşalt tetiklemez; kendi çıktıları ve
boyanmış foliage (`foliage.json`, `foliage/`) izlenmez. Dev server'da proje
başına tek kuyruk (`GET` / `POST /__forge/hlod`), iş ayrı Node sürecinde
(`tools/world/hlodWorker.ts`); ardışık istekler birleşir. Tazelik damgası
etkin yerleşimler + GUID çözümü + okunan dosya baytlarıdır, önbellek
`.forge-cache/hlod/`. Yayımlama proje kilidinde; kaynak / çıktı değiştiyse
sonuç atılır ve iş yeniden sıraya girer, hata önceki proxy setini geri
yükler ve panelde görünür. Editör yeni yayımlamayı sayfa yenilemeden okur
(seçim, kamera, kirli düzenleme, Undo korunur); zaten okunmuş yayımlama
proxy'leri tekrar düşürmez. `forge hlod` aynı servisi kullanır. Doğrulama:
odaklı Vitest 96 / 96, typecheck / katman / dosya bütçesi, başsız editör
**78 / 78** (`hlod.spec.ts` dahil), gerçek WebGPU hlod / streaming / world
**11 / 11**. Tam gate çalıştırılmadı; kullanıcı Derekavak kabulü açık.

**Teknik doğrulama (2026-11-17):** tam gate koşusunda **299 dosya / 2.215
Vitest testi**, **76 / 76 başsız editör**, tip / katman / dosya bütçesi / Node
yükleme / asset / SDK / proje denetimleri, build ve `verify:dist --strict`
geçti. Son dist adımında eksik isteğe bağlı HLOD dosyası statik sunucunun
SPA HTML cevabına düştü; statik istemci düzeltildi ve dist **1 / 1** geçti.
Son düzeltmeler ayrıca odaklı Node testleri ve tip denetimiyle doğrulandı;
bütün gate'in düzeltmelerden sonra tek komutla tekrarlandığı iddia edilmez.
Gerçek WebGPU editör **76 / 76**. Render tam koşusu **23 / 25**; kalan iki
test yalnız eski level'ın isteğe bağlı `hlod.json` 404'ünde düşüyordu. Adresi
doğrulandı, yalnız bu 404 beklenen sayıldı ve iki test ayrı koşuda **2 / 2**
geçti: mevcut **25 render kontrolünün tamamı doğrulandı**. Kabul edilmiş
referans görüntüler değiştirilmedi. Detay fade GPU sondası: kırmızı piksel
4.186 → 2.092 → 0; gölge kararma toplamı 204.746 → 119.331 → 0.
G8 tam çözünürlükte ≤ 2,93 mm; GPU–CPU ikizi ≤ 0,8 mm. SDK 0.1.12 ve
**A 982 / 1.021** değişmedi; 5b'nin ertelenmiş 25 A'sı yeşil.

**Son streaming ölçümü — GEÇTİ (2026-11-17).**
[`2026-11-17T07-06-57-259Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-17T07-06-57-259Z-streaming.json):
temiz `a6f3521` (`dirty: false`, kod `1e1c987`). Aynı sentetik 50.000 aktör /
1.024 hücre, 1920 × 1080, `high`, DPR 1, uncapped, başlıklı gerçek WebGPU
(NVIDIA Ampere); 40 m/sn çapraz rota, sıcak dönüş, 10 A/B döngüsü ve 32 sn
bekleyiş. Her uçuşun ilk 60 kare aralığı önceki düzenekle aynı biçimde dışarıda.

| Ölçüt | Kayıt | Durum |
|---|---|---|
| İlk uçuş p99 / en uzun kare | **13,3 / 35,1 ms** (19.916 örnek) | ≤ 20 / 50 ms: geçti |
| Dönüş p99 / en uzun kare | **13,8 / 36,0 ms** (18.796 örnek) | İki eşik içinde |
| Hücre aktörü / önbellek girdisi | İlk varış, ilk döngü, 10. döngü, bekleyiş sonrası **2.583 / 63** | Kararlı |
| GPU geometri / doku | İlk varış **218 / 30**; ilk tam döngü, 10. döngü ve bekleyiş sonrası **216 / 30** | Harness'ın kararlı durum karşılaştırması geçti |
| GC sonrası heap | İlk döngü **37.738.256 B** → bekleyiş sonrası **37.866.888 B** | **%0,34** artış; ≤ %5: geçti |
| Bekleyen / başarısız işler | Hücre fetching / queued / failures ve önbellek pending / failed / pendingEvict: **0** | Geçti; `evicted: 0` sınırlaması korunur |

HLOD ilk varış 507 / 421 yüklü / görünür, ilk döngüden bekleyiş sonrasına
530 / 421. Yüklü hücre önbelleği ilk döngü 414, son 406; aktif hücre 43.
Kaynak atma sayacı yine 0: bu paylaşılan starter iş yükünde döngü kararlılığı
kanıtıdır, tüm kaynak türlerinin atıldığını veya genel sızıntısızlığı kanıtlamaz.
İlk uçuş öncesi / sonrası shader module sayısı 54 → 142, sync render pipeline
18 → 43, async render pipeline 15 → 40; dönüşte artış yok. API duvar gecikmesi
saf derleyici süresi değildir; async çağrılar örtüşebilir. Önceki 57,7 ms max
35,1 ms'ye indi; p99 9,4 → 13,3 ms oldu, yine sınır içinde. Bu koşu bütün
değişikliklerin birlikte sonucudur; tek başına ilk hipotezin nedensel kanıtı
sayılmaz. **Adım 10 ölçütleri geçti; 5b'nin kalan kapısı kullanıcı HLOD geçişi /
detay fade görsel kabulüdür.** Referans görüntüler yenilenmedi, faz arşivlenmedi.

**Önceki 5b ilerleme notu (2026-11-16, HEAD `63815f9`).** Adım 1–5 tamam; adım 9'un
build / runtime çizimi ve adım 10'un üretici / ölçüm düzeneği uygulandı. Adım
6, 7, 8 ve 11 bekliyor; editörde HLOD gösterimi adım 6 ile tamamlanacak.
5b kutusu ve Faz 5 toplu kabulü açık; faz arşivlenmez. Bu belge güncellemesinde
yalnız git geçmişi, kaynak ve mevcut JSON kayıtları okundu; test, tam kapı veya
yeni ölçüm çalıştırılmadı.

**Ön ısıtma öncesi streaming ölçümü (adım 10, kabul AÇIK).** Önceki kayıt
[`2026-11-16T17-41-23-820Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-16T17-41-23-820Z-streaming.json)
(`Games/ForgeReference/render-refs/runs/`): kayıt metadata'sı `dddd81b`,
`dirty: true`; temiz `63815f9` koşusu değildir. Düzenek
`tests/smoke/{streaming.measure.ts,streamingMeasure.config.ts}`: referans projesinin
`.forge-cache/measure-streaming/webgpu-scenes` kopyasında sentetik level + HLOD,
başlıklı gerçek WebGPU, 1080p `high`, DPR 1, uncapped; 40 m/sn çapraz uçuş,
sıcak dönüş ve 10 A/B yükle / boşalt döngüsü. Uçuş özetleri her yöndeki ilk
60 kare aralığını dışarıda bırakır. Sonuçlar:

| Ölçüt | Kayıt | Durum |
|---|---|---|
| İlk uçuş p99 / en uzun kare | **9,4 / 57,7 ms** | p99 ≤ 20 ms içinde; en uzun kare ≤ 50 ms sınırını aşıyor |
| Sıcak dönüş p99 / en uzun kare | **10 / 31,1 ms** | İki eşik içinde; ilk uçuşun kabul açığını kapatmaz |
| Hücre aktörü / önbellek girdisi | İlk varış, ilk döngü, 10. döngü ve 32 sn atma bekleyişi sonrası **2.583 / 63** | Döngü sayaçları başa dönüyor |
| GPU geometri / doku | İlk varış **216 / 30**; ilk döngü, 10. döngü ve bekleyiş sonrası **214 / 30** | Harness karşılaştırması ilk tam döngünün kararlı durumuna karşı; ilk varışla birebir eşitlik iddiası yok |
| GC sonrası JS heap | İlk varış **38.134.088 B**; ilk döngü **37.349.980 B**; 10. döngü **37.716.976 B**; bekleyiş sonrası **37.689.828 B** | Harness: ilk döngü → bekleyiş sonrası **%0,91** artış, ≤ %5 içinde |
| Bekleyiş sonrası işler | Hücre fetching / queued / failures **0 / 0 / 0**; önbellek pending / failed / pendingEvict / evicted **0 / 0 / 0 / 0** | Bu koşuda kaynak atma sayacı artmadı; paylaşılan starter kaynaklarıyla döngü kararlılığı, tüm kaynak türlerinin atıldığına dair kanıt değil |

HLOD yüklü / görünür sayıları ilk varışta 502 / 421, ilk döngüden bekleyiş
sonrasına 530 / 421; 1,25 × görüş mesafesi tutma kuralıyla ilk görülen proxy'ler
kalabilir. Sıçrama kayıtlarında 57,7 ms karede hücre işi 1,6 ms, 55,8 ms karede
3,7 ms; bunlar nedenin pipeline derlemesi olduğunu kanıtlamaz. İlk kez pipeline
derleme o günkü **hipotezdir**; o kayıtta `compileAsync` ön ısıtması henüz
uygulanmamıştı. Sonraki uygulama yukarıda; yeni ölçümle 50 ms sınırı ayrıca
doğrulanır. Önceki kayıt tam performans, sızıntı veya faz kabulü değildir.

Önceki mevcut koşular (salt okunur kanıt geçmişi; yeni koşu üretilmedi):
[`2026-11-16T17-09-48-501Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-16T17-09-48-501Z-streaming.json),
[`2026-11-16T17-15-35-260Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-16T17-15-35-260Z-streaming.json),
[`2026-11-16T17-21-20-544Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-16T17-21-20-544Z-streaming.json),
[`2026-11-16T17-34-06-960Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-16T17-34-06-960Z-streaming.json).

**5b nihai görsel kabul (2026-11-17):** kullanıcı “görsel kabulleri onaylıyorum, R6 ile devam et” diyerek HLOD / detay fade, editörde otomatik HLOD ve R1 Derekavak şekil proxy kabulünü onayladı. Mevcut teknik kapı ve streaming ölçümüyle 5b tamamlandı. Faz 5 bütünü açık olduğundan arşivlenmedi; referans görüntüler yenilenmedi, yeni gate çalıştırılmadı.

**5c başlangıç dökümü (2026-11-17).** INV-D29 (foliage hücreleri, kompakt dizi),
D30 (prosedürel halka, ground cover), E21 (Foliage Type), G16 (instancing, fade,
impostor / billboard, rüzgâr). Ertelenen **8 A** (`foliageRing`). Eski modelden
yeniden yazılacaklar: `proceduralFoliage` 14 M + 2 R, `windSway` 13 R,
`foliageFade` 5 R, `proceduralFoliageRing` 4 R, `foliageCell*` M.

| Var (2b / 3 / 5a / 5b) | Eksik (5c) |
|---|---|
| WES rüzgârı ve örtüsü (5a adım 7), `engine/environment/wind` | Foliage Type asset'i, landscape kuralları, boyanmış foliage dosya biçimi |
| TSL detay fade `render/materials/detailFade.ts`, `compileAsync` ön ısıtması, residency, HLOD (5b) | GPU güdümlü çizim (compute culling + indirect), gölge kaskatlarında da |
| Terrain maskesi, katman ağırlıkları, global harita (5a) | Prosedürel halka + worker, uzak billboard blokları |
| `groundCover` (World Builder, 2b) | Rüzgâr salınımı TSL, foliage fade, impostor |
| three r187 `IndirectStorageBufferAttribute`, `geometry.setIndirect`, örnek `MeshletDrawingPipeline` | İçe aktarıcı çeviricileri (bugün "→ phase 5c" raporlanıyor) |

Referans içerik: Derekavak'ta boyanmış foliage yok, 7 landscape kuralı var
(`layerId` + `foliageTypeId` + yoğunluk + `minWeight` + `seed`): foliage'ın
tamamı prosedürel halka ve uzak billboard. Island ve WbPilotValley'de
`.foliage.json`; 12 `foliagetype`. S4 hedefi: Derekavak P2'nin 327 draw
call'unun 260'ı foliage; foliage çizimleri toplanınca gönderim 3,9 → 2,2 ms.

**5c kararları (kullanıcı, 2026-11-17, "hepsi öneri gibi"; ayrıntı mimari v1.43 §4.4):**

1. *Önce G6 / meshlet spike'ı:* 5b'den bırakılan hücre bölmesi ve meshlet sorusu,
   üretim yolundan önce Derekavak P2'de 60 Hz'de ölçülür: ortak batch / hücreye
   bölünmüş batch / foliage compute culling + indirect / meshlet. Spike kodu
   commit'lenmez; kayıt `render-refs/runs/`'a, sonuç plana.
2. *Foliage Type:* şemalı JSON asset `forge.foliageType`: model GUID'i (ileride
   bitki ailesi GUID'i), Forge'un yerleşim alanları, cull / far alanları, rüzgâr
   kaynağı, LOD zinciri ve impostor yuvası (PG0 sözleşmesi 1). Genel veri
   editörüyle (A13).
3. *Landscape kuralları:* terrain aktöründe şemalı `forge.landscapeFoliage`
   bileşeni (kural başına katman, tür GUID'i, yoğunluk, `minWeight`, `seed`);
   ajan `forge edit set` ile düzenler.
4. *Boyanmış örnekler:* HLOD gibi level parçası: `foliage.json` dizini + hücre
   başına ikili `foliage/<x>_<z>.bin` (tür başına konum / dönüş / ölçek / seed).
   WP hücre akışıyla gelir; prosedürel halka terrain tile'ı gibi kameraya bağlı ayrı akar.
5. *GPU güdümlü çizim, bütün türlerde zorunlu:* örnekler tür başına storage
   buffer'da; compute geçişi görüş alanı, mesafe, fade ve LOD seçimini yapar,
   atomik sayaçla indirect argümanlarını yazar; çizim `drawIndexedIndirect`,
   gölge kaskatlarında da. Fade 5b'nin dither'ı; rüzgâr WES'ten, köşe niteliği
   varsa ondan, yoksa Forge'un yükseklik formülüyle (PG0 sözleşmesi 2). Çevre
   değişimi uniform'la, yeniden derleme yok.
6. *Uzak temsil:* önce Forge'un çalışma anı billboard'u TSL'de, içe aktarılan
   GLB türleri için; üretilen bitkinin offline impostor'u ve PK7 PG3'te.
7. *Bitki dilimi (PG0–PG3, 5c ile):* `forge.plantFamily` asset'i + `forge.plant`
   bileşeni; tepki çözücü `engine`'de saf, tekil aktör ve foliage aynı
   uniform'ları kullanır. PG1 kayası saf çekirdeğin (rastgele akışlar, mesh
   yazımı, LOD) ince dilimi olarak kapsamda.
8. *İçe aktarıcı:* foliage type, landscape kuralları ve boyanmış gruplar
   çevrilir; referans projesi yeniden alınmadan önce kullanıcıya sorulur.
9. *Kapı ölçümü:* `npm run measure:foliage`, başlıklı gerçek WebGPU: Derekavak
   P2 60 Hz G6, S4'ün üretim karşılığı (draw call, GPU), üretilmiş ormanda G6,
   çevre geçişinde en uzun kare / pipeline sayısı / tepe bellek, PV-WES-01–08.

**5c adım sırası** (C: Claude, X: Codex; X'in diff'ini Claude inceler, kapıları
çalıştırır, commit'i atar):

1. Döküm ve kararlar — C (bu docs güncellemesi).
2. G6 / meshlet spike'ı, sonucun kullanıcıya getirilmesi — C.
   **Ölçüldü (2026-11-17), karar kullanıcıda.** Spike kodu commit'lenmedi (kararın
   gereği). Düzenek: Derekavak P2, 1920 × 1080, `high`, DPR 1, başlıklı gerçek WebGPU
   (NVIDIA Ampere); kare döngüsü duraklatılıp 16,7 ms aralıkla 300 kare adımlandı
   (60 Hz; GPU yetişir, swapchain beklemesi yok). Ana iş parçacığı = adımın CPU süresi,
   gönderim = host'un `pipeline.render` + overlay duvar süresi (+ GPU culling dispatch).
   Foliage içeriği Node'da yeni saf modüllerle Derekavak'ın 7 kuralı ve gerçek
   terrain'iyle üretildi: **370 hücre / 1.640 örnek**, S4'ün WebGL sayımıyla birebir.
   Materyaller GLB'nin hamı (slot materyali yok); sallanma / fade yok. Koşular arası
   gürültü ±0,5 ms. Kayıtlar `render-refs/runs/2026-11-17T08-21-07-840Z-foliage-spike.json`,
   `…08-26-17-370Z…` (tekrar), `…08-29-05-175Z…` (bundle).

   | Kip | Gönderim ort. / p95 | Ana iş parçacığı ort. | Draw call |
   |---|---|---|---|
   | Foliage yok (bugünkü statikler) | 2,9–3,1 / 4,0–4,4 ms | 3,4–3,6 ms | 398 |
   | Forge yapısı (hücre × mesh, 583 nesne) | 8,4 / 11,6–17,3 | 9,1 | 775 |
   | 256 m bloklar (S4 kip b) | 8,0 / 14,7 | 9,2 | 650 |
   | Tür başına tek batch, CPU frustum | 3,15–3,45 / 3,7–5,1 | 3,6–4,0 | 440 |
   | Compute culling + indirect (9 parça), gölgesiz | 3,45–3,55 / 4,4–4,6 | 4,0 | 398 + 9 |
   | Aynısı gölgeli (ana kamera listesiyle) | 3,7–4,2 / 4,7–9,6 | 4,2–4,7 | |
   | **Statikler `BundleGroup`'ta**, foliage yok | **1,98** / 3,7 | 2,51 | (sayılmıyor) |
   | **Statikler + tek batch foliage `BundleGroup`'ta** | **1,81** / 2,1 | **2,31** | (sayılmıyor) |
   | Statikler bundle'da + compute culling foliage, gölgeli | 2,63 / 3,3 | 3,13 | |
   | Meshlet hattı | devreye girmiyor (0 küme) | | |

   Bulgular: (1) **G6'nın 3 ms gönderim sınırı foliage gelmeden aşılıyor**; statiklerin
   398 draw call'u düşmeden hiçbir foliage yapısı G6'yı geçiremez. (2) CPU maliyeti
   draw call başına; GPU culling örnek sayısını azaltır, draw call'u azaltmaz. (3)
   three r187'nin `MeshletDrawingPipeline`'ı `reversedDepthBuffer` açıkken hiç devreye
   girmez (`_meshletsSupported`); motor ters derinlikle çalışıyor (`renderHost`).
   Ayrıca çift yüzlü, `transparent` ve `maskShadowNode`'lu materyalleri reddeder:
   Derekavak'ta 121 materyalden 2'si uygun, foliage'ın hiçbiri. (4) Hücre bölmesi draw
   call'u artırır (5b: 398 → 713); CPU modeline göre G6'yı kötüleştirir. (5) Render
   bundle CPU'yu draw call sayısından ayırır: kayıt bir kez, her kare yeniden oynatılır.
   Bundle içinde frustum culling yok (`StandardDrawingPipeline.isCulled`,
   `_bundleDepth > 0`): kamera hareketinde nesne kaybolmaz ama hepsi çizilir; GPU
   culling + indirect bunu tamamlar (argümanlar her kare compute'ta, bundle aynı
   dolaylı çizimi oynatır). `renderer.info` bundle çizimlerini saymaz; G5 / `?debug`
   için kendi sayacımız gerekir. Bundle; üye eklenince / çıkınca, görünürlük ya da
   örnek sayısı değişince yeniden kaydedilir: sayı indirect argümanında tutulmalı,
   akış ve detay fade'in batch atlamasıyla yeniden kayıt maliyeti ölçülmeli.
   **Karar (kullanıcı, 2026-11-17: öneriyle adım 4–5'e geçişi onayladı):** meshlet ve hücre bölmesi 5c'de reddedilir
   (meshlet three yükseltmesinde ve ters derinlik desteğiyle yeniden bakılır, Faz 9
   notu); statikler ve foliage için ortak GPU güdümlü yol: batch başına storage
   buffer, görünüm başına (ana kamera + kaskatlar) compute culling, indirect çizim,
   çizimler `BundleGroup` içinde. Bu, 5b'nin `instanceBatches`'ine dokunur.
3. Saf modüller: `foliageRing` (8 A), prosedürel üretim, uzak ton — **X** (high).
   **Uygulandı (2026-11-17, `c03f40d`):** `engine/world/foliageRing.ts`
   (8 A, **A 982 → 990 / 1.021**, 5c'ye ertelenmiş A kalmadı),
   `engine/foliage/{foliageTypeParams,foliageRoll,proceduralFoliage}.ts` ve
   12 saf kontrol yeni arayüzle (25 test). `FoliageGlobalMap` dünya uzayındaki
   `TerrainGlobalMap`'i okur; dosyadan çözülen datum'a göreli haritanın çevirisi
   halkayı bağlayan adımda. Boya / silme fırçası 5d'de.
4. `forge.foliageType` + `forge.landscapeFoliage` şemaları, boyanmış foliage
   dosya biçimi — C; içe aktarıcı çeviricileri — X (medium).
   **Şema ve level parçası uygulandı (2026-11-17, `3706bc4`, C; Codex kotası dolduğu için
   level parçasını da Claude yazdı):** `src/features/foliage` (`forge.foliageType@1`
   `*.foliagetype.json`: eşit ölçek sayı, `heightLimit.enabled`, `receiveShadow`
   yok, `sway.source` height / vertex, `far`, `lods`, `impostor`;
   `forge.landscapeFoliage@1` kural dizisi, bantlar Forge varsayılanlarıyla),
   eşleyici `engine/foliage/foliageAsset.ts` (şema varsayılanı = Forge varsayılan
   türü, testle). Boyanmış örnekler `core/level/foliage.ts` (`forge.levelFoliage/1`:
   `level`, `cellSize`, artan sırada `types`, hücre başına `counts`) +
   `core/level/foliageCells.ts` (`FFOL` v1, tür başına SoA: konum f32×3, kuaterniyon
   f32×4, ölçek f32, seed u32 = 36 B / örnek; `buildLevelFoliage` hücreyi X / Z'den
   `cellAt` ile atar, bayt düzeyinde deterministik). Asset dizini HLOD gibi:
   parçalar metasız level parçası, level / cellSize uyuşmazlığı, eksik / sahipsiz
   `.bin`, türler `forge.foliageType` başvurusu (eksik tür `dangling-reference`,
   yanlış tür `asset-type-mismatch`); build zaten bütün dosyaları kopyalıyor. SDK
   yüzeyi değişmedi. 518 core + 5 feature testi, tip / katman / dosya bütçesi /
   `verify:assets` geçti. **Kalan:** içe aktarıcı çeviricileri (Codex).
   **İçe aktarıcı çeviricileri uygulandı (2026-11-17, `cbad9d5`, C; Codex kotası dolu):**
   saf `engine/forgeImport/foliage.ts`. Foliage type Forge'un `normalizeFoliageType`
   sırasıyla: `meshAssetId` → modelin GUID'i (tür modelini plana getirir), ölçek X,
   yükseklik sınırı `enabled` grubu (olmayan uç ±10000), `sway` → `source: height`,
   `farDistance` / `farTint` → `far`; `name`, `receiveShadow` düşer, `lods` boş.
   Kurallar Forge'un `normalizeLandscapeFoliageRule` varsayılan / sınırlarıyla
   `landscapeId`'nin terrain aktöründe `forge.landscapeFoliage@1`; landscape'i ya da
   türü hedefte olmayan kural raporlanır, yazılmaz. Boyanmış gruplar (bölünmüş
   level'ın `<Level>.cells/foliage/<key>.foliage.json` dosyaları dahil, Forge'un
   `mergeFoliageCells` sırası) `buildLevelFoliage` ile level parçası: Euler XYZ →
   kuaterniyon (`eulerXyzQuaternion`), ölçek X, seed yoksa grup kimliği + indeksten;
   staticMesh hedefli gruplar alınır ve sayılır, düzgün olmayan ölçek / boyama
   normali raporlanır. Kayıt servisi `forge.levelFoliage/1`'i (level klasöründe
   `foliage.json`, level kimliği) kabul eder; `--force` içe aktarıcının eski
   foliage parçalarını siler. `--compare` yazılan kural / örnek sayılarını sayar,
   fark nedeniyle. Testler: saf 3 + içe aktarıcı fikstürü (bölünmüş hücreler, eksik
   tür, başka landscape; ikinci koşu aynı baytlar); geçici kopyada `--dry-run`:
   Derekavak 7 kural / 6 tür, Island ve WbPilotValley 7'şer kural, boyanmış örnek
   yok. Referans projesi yeniden alınmadı (kullanıcıya sorulacak).
5. GPU güdümlü çizim: compute culling, indirect, kaskatlar, fade, rüzgâr — C.
   **Tasarım (2026-11-17, spike kararının uygulaması):** batch başına örnek
   storage buffer'ı (mat4 + fade / seed), görünüm başına compute culling (görüş
   alanı, mesafe, fade bandı, LOD) görünür indeks listesi + indirect argümanları
   yazar. Görünümler: ana kamera ve her gölge kaskatı; her görünümün kendi
   dolaylı mesh'i kendi `layers` katmanında (ana kamera ve kaskat kameralarının
   maskesi buna göre; three gölge geçişi kameranın katmanlarını korur, örnek
   matrisini materyalin `positionNode`'undan, fade'i `maskShadowNode`'dan alır).
   Bütün dolaylı mesh'ler tek `BundleGroup`'ta; bundle kamera başına kaydedilir,
   üyelik / kapasite değişmedikçe yeniden kaydedilmez, örnek sayısı indirect
   argümanında. Kendi draw call sayacı (`renderer.info` bundle'ı saymaz). Alt
   adımlar: 5.1 örnek kümesi + ana görünüm culling'i + CPU referans hesabı
   (Node testi; GPU smoke görünür sayıyı karşılaştırır, G7 gibi) — saf referans X;
   5.2 kaskat görünümleri; 5.3 bundle ve yeniden kayıt politikası; 5.4 foliage
   (halka adım 6, boyanmış hücreler adım 7) bu yolda; 5.5 statik batch'lerin
   (`instanceBatches`) geçişi: picking etiketleri, detay fade, editörün transform
   hızlı yolu, HLOD hazır olma ve `compileAsync` ön ısıtması korunur; 5.6 G6
   ölçümü (`measure:foliage` taslağı).
   **5.1 uygulandı (2026-11-17, `9deff0c`, C):** `render/gpu/gpuInstances.ts`
   (batch başına mat4 + extras vec4 storage buffer'ı: x örneğin kendi solması, y seed
   u32 bitleri; kararlı tutamaçlar, silmede son slot boşluğa taşınır, `flush` yalnız
   değişen aralığı yükler, büyüme ikiye katlar ve `generation` artar);
   `gpuDrivenBatch.ts` (görünüm başına üç dispatch: LOD sayaçlarını sıfırla, örnek
   başına cull: şablon küresi altı düzleme, ölçülen uzaklık cull ucuna (köken ya da
   ölçek bölünmüş, Forge'un iki kipi), LOD uzaklıkla, `atomicAdd` ile LOD'un görünür
   listesine; çizim başına `instanceCount` yaz. (LOD, parça, materyal grubu) başına
   bir `drawIndexedIndirect` mesh'i, geometri parçanın buffer'larını paylaşır; vertex
   `visible[lod × kapasite + instance_index]` örneğinin matrisi × parça matrisi
   `overrideNodes` ile `modelWorldMatrix` / normal / pozisyon / önceki matris yerine
   geçer, materyalin kendi düğümleri model uzayında çalışır; fade 5b'nin dither'ı ×
   örnek solması, `maskShadowNode`'da da). `gpuDriven.ts` host'un karesinde
   `pipeline.render`'dan önce ana kamerayı ayıklar (tek compute geçişi, gönderim
   süresine dahil); three dolaylı çizimi `renderer.info`'ya hiç saymadığı için
   `lastDraws` `?debug` ve perf tanığına eklenir. CPU referansı
   `engine/world/instanceCulling.ts` (düzlemler WebGPU kırpma derinliğinden, ters /
   sonsuz uzak dahil; f32 / f64 için kesin–olası aralığı; Forge'un `foliageFadeWindow`'u)
   + Node testi. `modelParts` `render/resources/modelParts.ts`'e taşındı (static-mesh
   aynı API'yi yeniden dışa aktarır). Smoke `gpuCulling.smoke.ts`: Derekavak P2
   foliage'ı Node'da (`gpuFoliageScene.ts`) kurallar Forge kaynağından içe aktarıcının
   çeviricileriyle, terrain referans projesinden, Forge'un yerleşik tile kuralıyla:
   **370 hücre / 1.640 örnek** (S4 sayımı). Gerçek WebGPU'da (NVIDIA Ampere, 1080p
   `high`): P2 / P1 / gökyüzü görünümlerinde 177 / 32 / 0 görünür örnek, altı batch'in
   her LOD'unda GPU sayısı CPU'nun kesin sayısına **birebir**; `?debug` 398 → 407
   (tam 9 dolaylı çizim); kayıt `render-refs/runs/2026-11-17T10-13-13-396Z-gpu-culling.json`,
   çekim `candidates/derekavak-p2-gpu-foliage.png` (ağaçlar arazide doğru yerde).
   Odaklı Vitest 24, tip / katman / dosya bütçesi, detay fade smoke'u geçti.
   5.1'de bilerek yok: gölge (mesh'ler gölge düşürmez, 5.2), bundle (5.3), ilk-görüş
   pipeline ön ısıtması, foliage binding'i (5.4).
   **WebGL2 ikizi (kullanıcı kararı ve uygulama, 2026-11-17, `2544bdb`):** WebGL2 test
   arka ucunda `gpuDriven` aynı arayüzle `cpuDrivenBatch` kurar: CPU referansı ayıklar
   (düzlemler −w..w kırpma derinliğinden de), LOD'un parçaları `InstancedMesh`'le, aynı
   dither solması örnek başına CPU'da hesaplanan değerle; three bu çizimleri kendisi
   sayar. Sayaç three'nin saydam çift yüzlü materyalleri iki geçişte çizmesini de
   sayar (Derekavak P2: 9 mesh, 15 çizim; 5.1 kaydındaki +9 eksik sayımdı). Smoke iki
   arka uçta: ikisinde de 177 / 32 / 0 görünür, `?debug` +15. Birim testleri 9.
6. Prosedürel halka + worker + uzak billboard — C (worker mesajlaşması X).
7. Boyanmış hücreler ↔ WP akışı, residency, `?debug` satırları — C.
8. PG0 sözleşmeleri + PG1 kaya — X saf çekirdek ve üretici / C materyal.
   **Saf çekirdek uygulandı (2026-11-17, Codex, Claude inceledi; `c03f40d`):**
   `engine/procgen/{random,noise,mesh,stats,convexHull,vector}.ts` ve
   `procgen/rock/{rockParams,rockGenerator,icosphere,rockCollider}.ts`: yol ağacından
   rastgele akışlar (Mulberry32, çatallanma ebeveyni ilerletmez), tohumlu 3B gradyan
   gürültü + fBm, ikosfer üstünde tek şekil fonksiyonu (düzlem kesikleri, normal
   boyunca gürültü, alt düzleme, gömülme), her LOD aynı fonksiyonun kaba örneklemesi,
   köşe rengi R oyukluk / G üst yüz / B yükseklik, LOD0'ı saran ≤ 32 noktalı collider,
   köşe bütçesi raporu. Varsayılan: LOD0 / 1 / 2 642 / 162 / 42 köşe, Node'da
   14–40 ms. 24 test. Şema, GLB yazımı, CLI ve materyal (A / C ölçümü) sonra.
9. PG2 iki ağaç: aile, bileşen, WES tepkisi — X üretici / C TSL ve tepki.
10. PG3 LOD / kart / impostor bake, PK7 — X rasterleyici / C.
11. `measure:foliage`, PV-WES, kapı, belgeler, görsel kabul — C.

**5c yeni sıra: üçgen ve draw call işi (kullanıcı, 2026-11-17, plan v1.46).**
Kullanıcı 5.2'yi durdurdu; adım 5'in kalan alt adımları (5.2–5.6) ve sahne
optimizasyonu tek sırada. Draw call (CPU gönderimi) ve üçgen (GPU) ayrı ele alınır.
Üçgen için kullanıcı meshlet / sanal geometri istiyor. r187'nin
`MeshletDrawingPipeline`'ı ters derinlikte kendini kapatır
(`reversedDepthBuffer !== true`, `examples/jsm/pipelines`); motor ters derinlikle
çalışır. Adaylar: **three-virtual-geometry** (MIT, 0.1.3, WebGPU; küme seçimi /
culling compute'ta, `IndirectStorageBufferAttribute` + `setIndirect`, mesh başına
tek çizim, node materyalleri; ters derinlikte yalnız occlusion culling kapanır) ve
r187 meshlet hattının ters derinliğe uyarlanmış **kendi kopyamız** (`src/render`,
three çekirdeğine dokunmaz, K5 korunur). **three-nanite elendi:** WebGL2
`WEBGL_multi_draw` için yazılmış, WebGPU'da küme aralığı başına bir `drawIndexed`
(raporunda 17.000 / kare); asset başına tek materyal, sabit örnek matrisi. Ön
işleyicisi (`clusterlod.h` portu) ve çatlak denetimi referanstır. Bütün adımlar C
(Codex kotası bitti).

| # | İş | Kapsam | Kapı |
|---|---|---|---|
| R1 | HLOD'a şekiller (kullanıcı kararı) | `forge.shape` (cube / sphere / cylinder / cone / plane) yerleşime girer; three'siz primitive üreticisi `render/resources/shapes.ts`'in boyut / topolojisiyle aynı (render testi three geometrisiyle eşitliği denetler); renk köşe rengine; `sourceHash` ve tazelik damgası primitive + renk içerir; `hlod.test.ts`'in şekil kuralı ters çevrilir, karar 5'e not | Odaklı test, `hlod.spec.ts`; Derekavak'ta OUT-001 proxy olur; sonra kullanıcı Derekavak kabulü (HLOD denetim listesi + şekiller) |
| R2 | 5.2 kaskat görünümleri | Yukarıdaki adım 5 tasarımı: kaskat başına compute culling, `layers`, `maskShadowNode` fade | GPU = CPU referansı her kaskatta; gölge çekimi |
| R3 | 5.3 bundle | Dolaylı mesh'ler tek `BundleGroup`'ta, kamera başına kayıt; yeniden kayıt politikası ve sayısı | Gönderim süresi bundle öncesi / sonrası, yeniden kayıt sayacı |
| R4 | 5.4 foliage bu yolda | Halka (adım 6) ve boyanmış hücreler (adım 7) bu batch'leri kullanır; WebGL2 ikizi korunur | Smoke iki arka uçta |
| R5 | Sahne maliyet raporu | Ajan komutu (öneri `npm run forge -- stats --project <yol> --level <klasör> [--json]`): aktör, benzersiz geometri / materyal, model başına materyal, saydam / çift yüzlü, kaynak üçgen; editör Stats: görünür draw call (dolaylı + bundle dahil) ve çizilen üçgen. `verify:assets` eşikleri sonra (yalnız rapor) | Derekavak ve sentetik level raporu; R6'nın ortak ölçü dili |
| R6 | Üçgen spike'ı (tamamlandı; kod commit'lenmez, port 5284+) | Derekavak P2 + yoğun mesh stres sahnesi: (a) three-virtual-geometry, (b) r187 meshlet hattının ters derinlik kopyası, (c) 5.1 yolu + meshoptimizer ayrık LOD zinciri. Ölçüt: çizilen üçgen, draw call, gönderim / ana iş parçacığı, GPU süresi, kaskat gölgesi, ters derinlik, MRT, R3 bundle'ı, WebGL2 ikizi, bellek / ön işleme süresi, three iç API bağımlılığı | Kayıt `render-refs/runs/`; kullanıcı seçimi aşağıda (2026-11-17) |
| R7 | Otomatik LOD üretimi (tamamlandı) | Meshoptimizer ile otomatik ayrık LOD, deterministik ön işleme / cache / build ve seçilebilir runtime bağı; WebGPU + WebGL2. Meshlet üretim kapsamı dışında; foliage mevcut 5.1 yolunda. Küçük nesnede önce üçgen düşer, sonra detay culling | 21 odaklı test, typecheck, katman, gerçek WebGPU + WebGL2 smoke; uygulama kaydı aşağıda. R8 / R9 / R9a / R10 ayrı |
| R8 | HLOD katmanları (draw call; tamamlandı, kullanıcı kabulü 2026-11-17) | Hiyerarşik HLOD (öneri: ikinci katman 4 × 4 hücre, uzak menzilde), siluet / landmark işareti (view distance ötesinde uzak katman), slot düzeyinde materyal birleştirme; proxy'ler düz mesh, bundle kapalı (v1.57 kararları ve R8.0–R8.6 aşağıda) | Draw call ve gönderim öncesi / sonrası |
| R9 | 5.5 statiklerin geçişi (tamamlandı 2026-11-17: altyapı bağlı, statikler ölçüm kararıyla `instanced`; R9.0–R9.4 aşağıda) | 5.1 yolu + otomatik LOD; picking, detay fade, transform hızlı yolu, HLOD hazır olma, `compileAsync` korunur | Editör / render smoke'ları iki arka uçta |
| R9a | GPU occlusion culling (açık; adım 1 tamamlandı) | İlk adım (tamamlandı 2026-11-17): ikincil kameralar (yansıma) kendi GPU culling görünümü ve sayacı. Sonra R10 öncesinde meshlet'ten bağımsız nesne / instance düzeyinde konservatif Hi-Z adayı: önce tasarım + açık alan / örtülü alan A/B ölçümü, sonra yararlıysa üretim. Ters derinlik, MRT, MSAA, kamera hareketi ve gölge doğruluğu | Yanlış gizleme yok; culling kapalı referansla doğruluk; CPU / GPU render + compute / bellek / görünür nesne / üçgen karşılaştırması; WebGL2 mevcut culling ile çalışır |
| R10 | 5.6 G6 ölçümü | Derekavak P2 60 Hz, R5 raporuyla; sonra 5c adım 6–11 eski sırayla | G6 sınırları |

Öneriyle ilerleyen kararlar (kullanıcı itiraz ederse değişir): foliage 5.1 yolunda
kalır, sanal geometri yalnız statik mesh adayıdır; ön işleme çıktısı commit'lenmez,
`.forge-cache/` ve build'de üretilir (asset türevi, deterministik); şekil üreticisi
three'siz tek kaynak, render'ın three geometrisi değişmez, eşitlik testle korunur.

**Güncel karar ve R7 kapsam değişikliği (kullanıcı, 2026-11-17; v1.55):**
Meshlet şimdilik üretimden çıkarılır; bu karar v1.54'teki hibrit seçimin yerini
alır. R6 araştırması ve ölçüm kayıtları korunur. Diğer oturumdaki R7 kodu henüz
commit edilmemiştir; otomatik LOD / cache / build / runtime işleri korunarak
meshlet'e özel üretim bağları o oturum tarafından ayrılmalı ve kaldırılmalıdır.
Bu belge güncellemesi kod temizliği yapmaz, R7'yi tamamlandı saymaz. Mevcut
taslak silinmeden önce kapsamı gözden geçirilir; aktif üretimde kullanılmayan
r187 kopyasını motorda kalıcı olarak tutmak hedef değildir.

R7'nin yeni çıktısı: elle LOD gerektirmeyen sadeleştirme, faydasız seviyeleri
atlama, deterministik türevler, arka planda hazırlık, kaynak değişince yenileme,
build / runtime veri sözleşmesi ve WebGPU / WebGL2 bağıdır. Geçişlerde kaynak
geometri, picking, fade, gölge ve HLOD hazır olma korunur. Ekrandaki hata temelli
LOD seçimi tasarlanır; R6'nın sabit 40 / 90 m eşikleri üretim sözleşmesi değildir.
Batch / compute maliyeti ayrıca ölçülür. Foliage ve terrain kendi yollarında;
statiklerin toplu geçişi R9'dadır. Meshlet ancak bu hat optimize edildikten sonra
gerçek içerikte geometri darboğazı kalırsa, eşit görsel hata / LOD verisiyle
karşılaştırılan yeni bir kullanıcı kararıyla yeniden ele alınır; tarihi şimdiden
belirlenmiş zorunlu bir meshlet adımı yoktur.

**R7 uygulama / kabul kaydı (2026-11-17; v1.56):**
- [x] `engine/geometry/{triangleData,prepareTriangles}`: three'siz deterministik
  ayrık LOD; en çok 1 / 0,5 / 0,15 hedefleri. ≤500 üçgenli primitive tek seviyede
  kalır; önceki seviyeden en az %15 kazanç yoksa yeni seviye yazılmaz. Materyal
  grupları ayrı sadeleşir, slot aralıkları korunur; kaynak köşe indeksleri ve
  seam sınırları korunur. LOD geometrileri köşe niteliklerini kaynakla paylaşır.
- [x] `tools/triangles`: NodeIO ile model primitive'lerinden
  `.forge-cache/triangles/<key>.json`; build aynı veriyi `forge/triangles/` altında
  yayımlar. Sürüm + sıralanmış nitelikler + indeks / grup verisi kimliğe girer;
  tam girdi imzası çakışma / bayatlık denetimidir. Dev okuması mevcut localhost /
  header kuralıyla korunur. Cache kaçırması / prosedürel / değişmiş UVW girdisi
  aynı üreticiyi tarayıcı worker'ında çalıştırır. Türevler commit'e girmez.
- [x] `render/triangles`, `host.triangles`, `InstanceBatchOptions.triangles`:
  **seçilebilir** 5.1 GPU batch / WebGL2 CPU ikizi. Mevcut statik çağrılar
  açılmadı; foliage ve terrain bağları değişmedi. Yeni üretim meshlet kopyası,
  seçicisi, küme verisi / referansı ve renderer pipeline bağlantısı kaldırıldı.
  `.forge-cache/r6` dört kaynak hash'i R6 kaydıyla aynı; araştırma silinmedi.
- [x] Ekran hatası: varsayılan 1 fiziksel piksel geometrik hata bütçesi;
  kaydedilmiş mutlak sadeleştirme hatası × yerel ölçek × projeksiyon / çizim
  yüksekliği. Perspektifte sınır küresinin en yakın noktasına konservatif
  uzaklık, ortografikte batch'in en büyük örnek ölçeği kullanılır. Sabit
  40 / 90 m eşikleri yoktur. LOD ve detay fade gölgelerde de ana kamerayı izler
  (5.1 sözleşmesi); fade 0,8..1 bandı, kalite / yerleşim ölçeği ve uzak culling
  korunur. Materyalin yüzü, context'i ve maskeleri sessizce değiştirilmez.
- [x] Kaynak mesh / aktör / slot tablosu CPU picking için kalır. Hazır olma
  türev üretimi + gerçek MRT / ışıklarla seri `compileAsync` kuyruğunu bekler;
  hazırlık sahnesinden ayrılan çizimler etkinleştirmede kendi ebeveynlerine
  döner. İptalde kaynaklar derleme bitince bırakılır. Olağan transform değişimi
  tamponları günceller; yapısal değişim bağı yeniden kurar.
  Geometri / materyal sahibinindir; türev, maskeler, worker ve batch yaşamları
  ayrıdır. Picking, yerel transform / fade, iptal ve HLOD hazır olma regresyonları
  odaklı testlerdedir.

**Doğrulama:** 6 dosyada **21 / 21** odaklı Vitest; dört tsconfig ile typecheck;
katman + 29 kasıtlı ihlal öz-testi. Render alt kümesi **7 / 7**: R7 iki backend,
mevcut foliage culling iki backend, detay fade ve iki ters / düz derinlik gölge
kontrolü. Yeni R7 yolu gerçek WebGPU MRT / ters derinlik / üç kaskat / bundle ve
WebGL2'de çalıştı; her görünümün LOD sayacı CPU kesin–olası aralığında.
Küçük küp tek LOD; yoğun küçük nesnede LOD sonra culling; taşınan batch'in görünür
listeleri yenilenir. Native pass / indirect / bundle replay draw'ları Stats'la
eşit; kararlı bundle penceresinde yeniden kayıt 0. Referans snapshot yenilenmedi.
Kod commit'i `134b2aa`. Odaklı üretim build'i `.forge-cache/r7/dist` altında
geçti: ayrı `triangleWorker` paketi ve statik `build-content` / türev dizini
üretildi (Starter: 78 dosya, 43 asset). Node GLB testi cache ve build türevlerinin
bayt eşitliğini de denetler. Üretim dist'inin tarayıcıda açılma smoke'u bu
kapsamda çalıştırılmadı; dev backend smoke'undan ayrı kabul sınırıdır.

**Dar R7 ölçümü (G6 kabulü değil):** Derekavak P2 + 48 yoğun küre, 6 küçük yoğun
küre ve 6 küçük küp; 1920×1080 high DPR 1, gerçek NVIDIA Ampere WebGPU.
40 ısınma + 30 örnek; **her elle adımdan önce ayrı RAF**. CPU, GPU bekleyişinden
önce `dev.step`'in senkron kaydıdır; render / compute timestamp'leri ayrıdır.
`renderer.info` elle sıfırlanır; sonraki RAF'ın sayacı silmesi engellenir.

| WebGPU | Draw (dolaylı dahil) | Gönderim ms | CPU ms | GPU render ms | GPU compute ms |
|---|---|---|---|---|---|
| Doğrudan | 438 (40 dolaylı) | 5,64 | 6,43 | 5,47 | 0,13 |
| Bundle | 438 (40 dolaylı; 16 replay) | 5,49 | 6,20 | 5,39 | 0,13 |

WebGL2 CPU ikizi aynı ana LOD adetlerini verdi: büyük iki batch'te 3 / 18 / 0;
küçük yoğun batch'te 0 / 1 / 2; küplerde 3. WebGL2 Stats 424 draw; WebGPU native
timestamp / dolaylı sayacı bu arka uçta yoktur. Ham kayıt / çekimler
`.forge-cache/r7/`, kalıcı ölçüm kaydı `render-refs/runs/2026-11-17-r7-lod.json`.
Bu örnek R6 stresinin eşdeğeri veya draw / compute optimizasyon kabulü değildir.
**G6 açık; son R6 gönderimi 3,03 ms.** Genel asset / hareketli kamera görsel
kabulü ve toplu statik geçiş R9'dadır. R8, R9, R9a ve R10 başlatılmadı;
occlusion eklenmedi. Tam gate ve push çalıştırılmadı.

**R9a occlusion tasarım / kabul notları (yeni plan işi, uygulanmadı):**
- **İlk adım: ikincil kamera görünümleri** (kullanıcı kararı, 2026-11-17; R9'da bulundu).
  GPU güdümlü culling yalnız kayıtlı görünümler için yapılır (ana kamera + gölge kaskatları).
  Sahneyi çizen başka bir kamera (su birikintisi `reflector()`'ı, ileride diğerleri) ana
  görünümün görünür listesini çizer: ana görüşün dışındaki ama yansımada görünen nesne eksik
  kalır; `?debug` o geçişin dolaylı çizimlerini saymaz. Bugün yalnız foliage'ı etkiler. Her
  kamera kendi görünümü olarak kaydedilir (kaskatlardaki gibi kendi katmanı, dispatch'i ve
  listesi; mesafe ölçüsü ana kameranın kalır mı ayrı tasarlanır), sayaca eklenir. Kapı: yansıma
  smoke'unda yansıyan foliage CPU referansıyla, `puddle.smoke.ts`'in `staticPath=instanced`'ı
  ve sayaç notu kaldırılabilir. Occlusion bunun üstüne kurulur: ana kameranın occlusion
  sonucu ne gölgeye ne yansımaya uygulanır.
  **Uygulandı (2026-11-17, `ef12079`):** `gpuDriven.add(CameraViewSource)`; görünümler rol
  (`main` / `shadow` / `camera`) ve katman taşır (`GpuCullView`): gölge 1–8, ana görünüm 9
  (`MAIN_VIEW_LAYER`, katman 0'dan çıktı; ana kamerada açılır), kamera görünümleri 10–13.
  Kayıtlı her kamera diğer görünüm katmanlarını kaybeder. Düzlemsel yansıma, ana görünümün su
  düzlemine göre aynası (`engine/world/instanceCulling.ts` `mirrorCullView`; eğik yakın düzlem
  yok sayılır, üst küme); mesafe aynalanmış gözden. Su birikintisi kaynağı yüzü dönükken
  görünüm açmaz (three'nin atlama kuralı). Rolü değişen slot yeniden kurulur; CPU ikizi aynı.
  Dev kancası `__forgeDev.gpuDriven.mirror(plane)`. Doğrulama: 439 odaklı Vitest (ayna özelliği
  500 rastgele nokta, CPU ikizi kamera görünümü), tip / katman; render smoke **29 / 29**:
  `gpuCulling` P2'de 5 m alttaki su düzleminin görünümü her batch'te CPU kesin–olası aralığında
  (iki arka uçta 49 görünür, ana 177), `puddle.smoke.ts` override'sız (draw 60 → 103).
- **Occlusion çalışması (2026-11-17, `5058c7b`; üst sınır, gizleme yok):** `engine/world/hiZ.ts`
  (Codex `gpt-6.1-sol` high, Claude inceledi: en uzak değerle küçülen piramit, kutu köşelerinden
  konservatif küre testi, 18 test, 1.000 durumda kaba kuvvetle konservatiflik) +
  `render/gpu/occlusionStudy.ts` (yalnız dev `__forgeDev.occlusionStudy`: ana kameradan katman 0
  sahnesinin derinliği, compute ile okunur, CPU Hi-Z; ana görünümün tuttuğu her GPU güdümlü örnek
  test edilir) + `npm run measure:occlusion` (kayıt `2026-11-17T20-14-12-758Z-occlusion.json`).
  Derekavak, 1.640 foliage örneği, 1080p; örtülü örnek (üçgen) payı:

  | Poz | Görünür | Statikler engelleyici | Yalnız arazi (statikler GPU'da) |
  |---|---|---|---|
  | P1 | 32 | %18,8 (%20,0) | %0 |
  | P2 | 177 | %0 | %0 |
  | P3 | 2 | %0 | %0 |
  | Yer K / D / G / B | 238 / 355 / 324 / 285 | %3,4 / %1,7 / %13,9 / %20,0 (%2,8 / %0,4 / %15,0 / %21,2) | %0,4 / %0 / %13,9 / %20,0 |

  Bu, bu karenin tam çözünürlüklü derinliğiyle iyimser sınır; gerçek bir geçiş derinlik kaynağının
  (engelleyici ön geçişi ya da iki aşamalı çizim) ve Hi-Z kurmanın maliyetini öder, daha azını
  gizler. P2'de GPU süresi zaten 1,8 ms. **Öneri (kullanıcı kararı bekliyor):** R9a üretime
  alınmaz; Hi-Z referansı ve çalışma ölçümü kalır, yoğun / örtülü içerik (kent, iç mekân) gelince
  `measure:occlusion` yeniden koşulur. Sırada R10 (G6).
- Mevcut frustum / mesafe culling ve ambient occlusion, nesne occlusion culling
  değildir. Mevcut meshlet taslağında `occlusionCulling: false`; bağımsız üretim
  occlusion sistemi doğrulanmadı. R7'ye eklenmez; önce R8 ve R9 tamamlanır.
- Aday Hi-Z, gerçek opak yüzey derinliğinden üretilir; bounding box'lar dolu
  engelleyici gibi çizilmez. Saydam ve dither ile kaybolan yüzeyler ilk sürümde
  engelleyici değildir; alpha-test ancak delikleri doğru yansıtan ayrı kabulle.
  Ters derinlik için indirgeme / karşılaştırma, MSAA depth resolve ve MRT
  yaşam döngüsü tasarımda açıkça doğrulanır. Hazır HZB kodu doğrudan kopyalanmaz.
- Önceki kare derinliği kullanılacaksa kamera kesmesi / teleport, yeni açılan
  alan, hareketli nesne, near-plane kesişimi, yeniden boyutlandırma ve akışla
  gelen nesne için güvenli görünür kabulü / güncel kare doğrulaması gerekir.
  Sırf eski karede örtülüydü diye görünür nesne gizlenmez.
- Ana kameradan örtülü nesne gölge düşürebilir: ana görünüm sonucu gölge
  kaskatlarının listesine uygulanmaz. Occlusion bir çizim kararıdır; aktör
  simülasyonu, picking kaynakları veya hücre residency'sini kapatmaz.
- Açık alan (düşük örtülme), bina / duvar arkası (yüksek örtülme), kamera
  hareketi ve dinamik engelleyici senaryolarında kapalı / açık karşılaştırılır.
  Hi-Z / depth pass maliyeti dahil net kazanç yoksa varsayılan kapalı kalır.
  WebGL2'de bu GPU yolu zorunlu değildir; frustum / mesafe / LOD devam eder.
- Kaynak araştırması: [r187 HZB](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/pipelines/MeshletDrawingPipeline.js)
  ve [Niagara](https://github.com/zeux/niagara) (Vulkan, algoritma referansı;
  doğrudan three/WebGPU eklentisi değil). Yeni bağımlılık kararı verilmedi.

**R8 kararları ve uygulama planı (kullanıcı, 2026-11-17; v1.57):**
Bulgular: HLOD proxy'leri zaten tek ortak materyalli (renk köşe renginde, gölge
yok), hücre başına bir draw. Derekavak'ta draw'ın kaynağı gerçek binalar: iki
modelde 117 primitive, görünüm ve kaskat başına 118 draw; `loadRange` 400 m,
görüş 2000 m, hücre 128 m, 22 hücre. 4 × 4 katmanın etkisi StreamingBench'te
(1.024 hücre, 3,37 M HLOD üçgeni) ölçülür. Kararlar:
- *Bundle kapalı kalır* (R3 varsayılanı); materyal / draw azaltmasından sonra
  R10 öncesinde yeniden ölçülür.
- *Proxy'ler GPU güdümlü yola girmez:* her proxy tek örnekli, kendine özgü
  geometri; indirect çizim draw düşürmez, r187'de multi-draw-indirect yok.
  Proxy'ler düz mesh kalır, azalmayı katmanlar sağlar. R8 satırındaki "GPU yoluna /
  bundle'a" maddesi bu kararla düşer.
- *Materyal birleştirme şimdi, kayıpsız:* bir modelin aynı materyal slotundaki
  primitive'leri düğüm dönüşümleri pişirilerek tek geometride birleşir; draw
  primitive sayısından slot sayısına iner. R7 hattı gibi türetilmiş veri. Farklı
  materyalleri doku atlasıyla birleştirme (kayıplı) ayrı karar, sonra.
- *İkinci katman 4 × 4 hücre;* geçiş mesafesi `max(2 × loadRange, 6 × hücre)`,
  kalite çarpanıyla.
- *Landmark:* `forge.staticMesh` / `forge.shape` bileşeninde işaret; işaretliler
  level başına tek proxy'ye pişer, görüş mesafesi ötesinde landmark menzilinde
  çizilir. Kamera far'ı landmark menziline genişler; diğer içerik kendi mesafe
  culling'iyle görüş mesafesinde, sis görüş mesafesine bağlı kalır.

| # | İş | Kapı |
|---|---|---|
| R8.0 | Ölçüm (Derekavak P2, StreamingBench uzak poz: draw / görünüm, gönderim, CPU, GPU) + HLOD sadeleştirmesinin üçgen düşürmemesinin teşhisi ve düzeltmesi (`tools/world/hlodBuild.ts`) | Kayıt `render-refs/runs/`; proxy üçgeni kaynaktan düşük |
| R8.1 | Slot düzeyinde primitive birleştirme (deterministik, `.forge-cache/` + build, worker yedeği; R7 LOD birleşmiş geometride); picking, slot override, detay fade, gölge korunur | Odaklı test; Derekavak draw / görünüm 118 → slot sayısı |
| R8.2 | `forge.levelHlod/2`: `layers` (katman 0 hücre, katman 1 `hlod/l1/<x>_<z>.glb`); katman 1 katman 0 çıktısından daha kaba; hash çocuklardan; v1 bayat, yeniden üretilir; `hlodJobs` / Auto kapsar | Odaklı test; üretim iki level'da |
| R8.3 | Çalışma anı katman seçimi (`render/sync/hlodProxies.ts`): 16 hücresi etkin olmayan uzak küme katman 1; yüklenmeden öbürü bırakılmaz, histerezis; hazır olma korunur | Odaklı test; `hlod` / streaming smoke iki arka uçta |
| R8.4 | Landmark işareti, `hlod/landmarks.glb`, far genişlemesi; SDK yüzeyi değişirse snapshot + changelog aynı commit'te | Odaklı test; smoke |
| R8.5 | `forge stats`, `?debug`, World Partition panelinde katman / proxy / birleşmiş draw | Rapor iki level'da |
| R8.6 | R8.0 ölçümünün tekrarı, öncesi / sonrası | Draw ve gönderim düşer; kullanıcı görsel kabulü (geçişte titreme yok, landmark) |

**R8 ilerleme kaydı (2026-11-17; v1.58):**
- [x] **R8.0** (`af30c37`): teşhis: proxy'deki yüz başına normaller `weld`'in hiçbir köşeyi
  birleştirmesine izin vermiyordu, sadeleştirici yalnız kenar görüp her üçgeni tutuyordu.
  Proxy artık yalnız konum + renk taşır, ortak materyal `flatShading`; çift yüzlü parçalar
  ayrı sadeleşir, arka yüzleri sonra eklenir. Derekavak HLOD **21.360 → 5.366** üçgen.
  Temel ölçüm `2026-11-17T15-10-01-535Z-gpu-driven.json`.
- [x] **R8.1** (`018c559`): slot birleştirme çalışma anında, şablon başına bir kez
  (`render/resources/modelParts.ts`); aynı slot + aynı köşe nitelikleri tek geometri,
  matris pişer (aynalıda sarım çevrilir), çok materyalli mesh grup grup bölünür, morph /
  skinned birleşmez. Planlanan cache / build türevi gerekmedi: birleştirme yalnız
  birleştirme (O(n) kopya), dosya okumaktan ucuz; geometriler şablonun, model cache
  girdisiyle atılır. `forge stats` Derekavak **118 → 15 draw / görünüm**, gölge kaskadı
  başına da 15. Render smoke gerçek WebGPU **29 / 29** (referans çekimleri dahil; görüntü
  değişmedi). Derekavak P2 (`2026-11-17T15-16-42-577Z-gpu-driven.json`): gönderim
  0,711 → **0,53 ms**, kare CPU 1,12 → 0,98, foliage ile 1,343 → 0,89 ms; GPU aynı (1,97).
  O koşudaki `sceneDraws` geçersiz (three'nin RAF'ı sayacı sıfırlıyordu; ölçüm
  `82c0150`'de düzeltildi); önceki değer R6'nın P2 kaydı 398 draw.
- [x] **R8.2 / R8.3** (`82c0150`): `forge.levelHlod/2` + `clusters`, dosyalar aynı klasörde
  `hlod/l1_<x>_<z>.glb` (planlanan alt klasör yerine; yayımlama / tarama değişmeden kalır).
  Küme, hücre proxy'lerinin sadeleşmiş çıktısını bir kez daha sadeleştirir; hash hücre
  kayıtlarını kapsar, bayatlık denetimi kümeyi de görür. `HlodSource.load(file)` göreli
  dosya alır. Çalışma anı: geçişin ötesinde, hücresi etkin olmayan küme çizilir, altındaki
  hücreler okunmaz; yaklaşınca küme görünür hücrelerin okuması bitene kadar kalır (%10
  histerezis), etkin hücre kümeyi hemen gizler. Kalite çarpanı host'tan gelir. Derekavak:
  22 hücre / 5.366 üçgen → 4 küme / 1.372 üçgen. Odaklı Vitest 421; editör HLOD + akış
  testleri gerçek WebGPU'da 5 / 5.
- [x] **R8.4** (landmark, kullanıcı: `landmarkDistance` level ayarı, 0 = 3 × görüş):
  `forge.staticMesh` / `forge.shape` `landmark` alanı (varsayılan kapalı). İşaretli bütün
  yerleşimler (kalıcı ve küçükler dahil) `hlod/landmarks.glb`'ye pişer; köşeler yerleşim
  kökenini (`_CENTER`) taşır, dizin ve bayatlık denetimi landmark hash'ini tutar. **Far
  genişlemesi yerine** (gölge kaskatlarının bölünmesini ve diğer culling'i değiştirirdi):
  tek mesh; kökeni görüş mesafesi içinde ya da landmark menzili dışında olan landmark
  noktaya çöker, kalanı kamera ışını boyunca far'ın hemen içine çekilir (aynı pikseller,
  yakın derinlik). Not: sis çekilmiş derinliği görür; görüş sonu tam sisliyse landmark da
  sislenir (görsel ayar kullanıcıda). Kanonik biçim yeni alanları (`landmark: false`,
  `landmarkDistance: 0`) belge kaydedildiğinde yazar. Editör smoke `landmark.spec.ts`
  (kırpılan küpü proxy çizer) gerçek WebGPU ve WebGL2'de; tam Vitest 2.388, editör smoke
  79 / 79 (ilk koşuda bir test bir kez kırıldı, tekrarda geçti).
- [x] **R8.5**: `forge stats` ve editörün HLOD satırı küme / landmark sayısı ve üçgenini
  yazar. `?debug`'a ayrı satır eklenmedi (draw'lar zaten sayılıyor).
- [x] **R8.6 ölçüm** (gerçek WebGPU): Derekavak P2 (`2026-11-17T16-07-20-940Z-gpu-driven.json`)
  sahne draw'ı (bütün görünümler) **398 → 68**, gönderim 0,711 → **0,455 ms**, kare CPU
  1,12 → 0,874 ms, GPU 1,97 → 1,88 ms. StreamingBench akışı
  (`2026-11-17T16-13-55-689Z-streaming.json`): HLOD 3.366.912 → **1.643.744** üçgen;
  ilk uçuş p99 / max 13,3 / 35,1 → **8,5 / 43,6 ms** (eşik 20 / 50; max yükseldi, sınırda
  değil), ilk döngü GPU geometri 216 → 120, heap artışı yok. Foliage senaryosunun
  `sceneDraws`'u (61) beklenenden düşük; o senaryoda sayaç güvenilir değil, değerlendirmeye
  alınmadı. Bundle R10 öncesi yeniden ölçülür.
- [x] **R8 kabulü** (kullanıcı, 2026-11-17): düz gölgeli proxy, küme geçişi ve landmark
  görsel olarak kabul edildi. R8 kapandı.

**R9 bulguları (2026-11-17; v1.60):** R7 altyapısı (`host.triangles`, `InstanceBatchOptions.triangles`)
hiçbir binding'e bağlı değil; `forge.staticMesh` ve `forge.shape` düz `InstancedMesh` çiziyor.
Picking (gizli materyalli kaynak `InstancedMesh`), hazır olma ve `compileAsync` R7'de korunmuş.
Bağı açmadan önce üç eksik:
1. Batch'e her yapısal değişim (ekleme / silme / renk) `triangles` yolunda bütün batch'i yeniden
   kurar: eski çizim hemen kalkar, LOD verisi yeniden okunur / üretilir, `compileAsync` beklenir.
   `GpuInstances`'ın kararlı tutamaçlı ekleme / silmesi kullanılmıyor.
2. `tools/triangles` LOD'u GLB'nin ham primitive'lerinden üretir; R8.1'den beri çalışma anı aynı
   slotun primitive'lerini birleştirir, birleşmiş geometrinin anahtarı önbellekte yok, her açılışta
   worker üretir. Bellekte geometri başına önbellek yok.
3. Morph / tam olmayan geometri `prepare`'de hata verir; saydam / skinned parça kuralı yok.

**R9 kararları (kullanıcı, 2026-11-17; v1.60):** öneriler kabul edildi.
- *Yol seçimi batch başına:* birden fazla LOD'u olan ya da örnek sayısı eşiği aşan batch GPU
  güdümlü yola geçer, kalanı `InstancedMesh`'te kalır; eşik R9.0 ölçümüyle belirlenir.
- *R9.1 ve R9.2 R9'un parçası:* yapısal değişim tutamaçla, LOD önbelleği birleşmiş slotlarda da
  çalışır.
- *Birleşmiş slotun LOD'u parçalardan:* yeniden sadeleştirme yerine her ham primitive'in
  önbellekteki zinciri, parçanın köşe kaymasıyla birleştirilir (aynalıda sarım çevrilir, hata ×
  pişmiş ölçek, en büyüğü; %15 kazanç kuralı). Araç ve çalışma anı aynı ham primitive anahtarını
  kullanır; GLTFLoader / three matematiğinin Node'da bayt düzeyinde kopyası gerekmez. Saf çekirdek
  `engine/geometry/mergeTriangleLods.ts` — X (Codex, `gpt-6.1-sol`, high).

| # | İş | Kapı |
|---|---|---|
| R9.0 | Ölçüm: Derekavak P2, StreamingBench ve şekil ağırlıklı sentetik sahnede `InstancedMesh` / GPU yolu (draw, gönderim, CPU, GPU render + compute); LOD önbellek isabet oranı | Kayıt `render-refs/runs/`; yol seçim eşiği |
| R9.1 | Yapısal değişim tutamaçla (ekleme / silme / renk); kapasite büyümesinde yeni çizim hazır olana kadar eski kalır | Odaklı test; editörde ekleme sırasında batch kaybolmaz |
| R9.2 | Birleşmiş slot LOD'u parça zincirlerinden (`mergeTriangleLods`, X); bellek önbelleği anahtar başına | Odaklı test; Derekavak'ta worker üretimi 0 |
| R9.3 | Uygun olmayan parça (morph, skinned, saydam) aynı batch içinde `InstancedMesh`'te kalır | Odaklı test |
| R9.4 | `ctx.triangles` bağı, `forge.staticMesh` / `forge.shape` batch başına yol seçimi | Editör / render smoke iki arka uçta |
| R9.5 | R9.0 ölçümünün tekrarı, belgeler | Draw / gönderim / GPU önce–sonra |

**R9 ilerleme kaydı (2026-11-17; v1.61):**
- [x] **R9.1 / R9.2** (`7724d18`): kapasite içinde ekleme / silme LOD bağını yerinde günceller
  (tutamaçlar sondan; slot = kaynak indeksi, renk tamponu ve CPU ikizi slotla okur); kapasite /
  renk tamponu değişiminde eski çizim yenisi hazır olana kadar kalır. Birleşmiş / pişmiş parça
  ham parçalarını taşır (`LodPiece`), LOD zinciri parça zincirlerinden
  (`engine/geometry/mergeTriangleLods.ts`, Codex `gpt-6.1-sol` high, 31 test, Claude inceledi);
  geometri başına bellek önbelleği.
- [x] **R9.3 / R9.4** (`b5bc837`): `render/triangles/staticPath.ts` parça uygunluğu (morph, kısmi
  çizim aralığı, > 4 bileşenli nitelik, saydam → `InstancedMesh`) ve batch başına yol (`auto`:
  ≥ 16 yerleşim ya da > 500 üçgenli parça; `gpu` / `instanced` zorlar). LOD hazırlığı başarısız
  parça aynı batch'te instanced kalır. `ctx.triangles` / `ctx.staticPath` host'tan;
  `?staticPath=` yalnız dev. LOD çizim kökü level çerçevelemesinin dışında (`framing: false`;
  çizimleri şablon uzayında, çerçeveleme onları başlangıç noktasında görüp kamerayı yanlış
  yere koyuyordu: spline-test-range / physics-interaction smoke'ları). Foliage culling ve
  puddle smoke'ları statikleri instanced açar (sayaçları foliage'ın / yansımanın kalsın).
  Doğrulama: odaklı Vitest 176, tip / katman / dosya bütçesi; `auto` ile render smoke 28 / 29,
  editör smoke WebGL2 80 / 81 ve gerçek WebGPU 80 / 81; üç kırık tek başına geçti (gpuCulling
  bundle çekim farkı, content.spec 404, assets.spec tıklama zaman aşımı; kararsız).
- [x] **R9.0 ölçümü** (`npm run measure:static-path`,
  `render-refs/runs/2026-11-17T19-36-13-561Z-static-path.json`, gerçek WebGPU, 1080p high):

  | Level / poz | Yol | Gönderim ms | Kare CPU ms | GPU ms | GPU batch / örnek |
  |---|---|---|---|---|---|
  | Derekavak P2 | instanced | 0,41 | 0,81 | 1,80 | – |
  | | gpu | 1,21 | 1,66 | 2,30 | 15 / 96 |
  | | auto | 0,77 | 1,19 | 1,93 | 7 / 88 |
  | WbPilotValley P1 | instanced | 0,45 | 0,85 | 3,52 | – |
  | | gpu | 1,11 | 1,52 | 3,46 | 11 / 43 |
  | Island P1 | instanced | 0,33 | 0,66 | 2,27 | – |
  | | gpu / auto | 0,42 | 0,76 | 2,24–2,31 | 1 / 447 |
  | OpenWorldTest P1 | hepsi | 0,29 | 0,58 | 1,35 | statik batch yok |

  GPU yolu hiçbir level'da kazandırmadı: batch × görünüm başına üç dispatch, batch başına ~50 µs
  gönderim; GPU süresi düşmedi (447 örnekli Island batch'inde bile). LOD önbelleği Derekavak'ta
  117 isabet / 1 üretim (R9.2 kapısı). Kaydın draw sütunu güvenilmez (instanced'da 1–9; R8.6'daki
  sayaç sorunu), değerlendirmeye alınmadı. **Host varsayılanı `instanced`** (R9 öncesiyle aynı
  çizim); karar kullanıcıda.
- [x] **R9 kararı ve kapanışı** (kullanıcı, 2026-11-17; v1.62): statikler `instanced` kalır,
  GPU güdümlü yol foliage'da sürer; R9 altyapı olarak kapanır. Ağır mesh'li / çok örnekli
  içerik geldiğinde `measure:static-path` ile yeniden ölçülür; dispatch birleştirme (görünüm
  başına bütün batch'ler tek dispatch) ayrı karar. R9.5 bu kararla düşer (R9.0 kaydı yeterli).
  İkincil kamera görünümleri R9a'nın ilk adımı (aşağıda R9a notları).

**R7 önceki uygulama taslağı (v1.54, tarihsel; yukarıdaki güncel kapsam geçerli):**
1. r187 hattını sürümü ve MIT kaynağı belgelenmiş render kopyasında tut;
   ters derinlikte yalnız occlusion kapalı yolu aç. Uygunluğu gerekçeleriyle
   açıkla: yoğun FrontSide statik, desteklenen geometri / materyal / dönüşüm.
2. Three'siz deterministik meshlet + ayrık LOD türevi üret; Node önbelleği
   `.forge-cache/triangles`, build çıktısı ve runtime aynı veri sözleşmesini
   kullansın. Küçük primitive ve kazançsız sadeleştirme ek LOD oluşturmasın.
3. Seçilebilir üretim bağını kur; mevcut statik / foliage / terrain bağlarını
   topluca değiştirme (R9). CPU picking kaynağı, detay fade / culling sırası,
   async hazırlık / iptal / kaynak ömrü ve HLOD hazır olma sözleşmesi korunsun.
4. Odaklı regresyonlar, typecheck, gerçek WebGPU MRT / ters derinlik / üç
   kaskat / bundle ve WebGL2 fallback smoke'u; sayaçlar CPU referansıyla.
   Ölçümün her adımından önce ayrı RAF, render / compute süreleri ayrı.
   Kod ve belgeler ayrı yol sınırlı commit; R8–R10 ve G6 kabulü açık kalır.

**R1 uygulandı (2026-11-17, C).** `engine/procgen/shapePrimitives.ts`: three'siz
cube / sphere / cylinder / cone / plane (three r187 üreticilerinin köşe sırası,
normal ve indeksleri; 0,5 m katı, 1 m düzlem, 32 radyal / 16 yükseklik parçası);
`render/resources/shapes.test.ts` beş primitive'de konum / normal (≤ 1e-6) ve
indeksin three geometrisiyle aynı olduğunu denetler. `hlodPlacementsOf` şekli
`{ shape, color, matrix }` yerleşimi olarak verir; `sourceHash` girdisi
`shape:<primitive>` + renk + matris (model girdileri eski biçimde, şekilsiz level'ların
hash'i değişmedi); tazelik damgası yerleşimleri zaten içerir, ayrıca
`HLOD_SHAPE_GENERATOR` sürümü (üretici değişince damga bayatlar). Üretici şekli
köşe rengine (sRGB → doğrusal, render'ın örnek rengiyle aynı) pişirir, detay
culling dahil etme kuralı şeklin sınır yarıçapıyla; düzlem çift yüzlü çizildiği için
iki yüzüyle pişirilir. Bayatlık (`verify:assets`, editör) şekli de sayar. Geçici
kopyada `forge hlod`: Derekavak **22 hücre / 21.360 üçgen**, 83 şekil / 25 mesh,
OUT-001'in hücresi `-1_-2` proxy'de. Doğrulama: odaklı Vitest 64 / 64, typecheck,
katman, dosya bütçesi, `verify:assets`; `hlod.spec.ts` + `streaming.spec.ts` başsız
**5 / 5** ve gerçek WebGPU **5 / 5**. Kullanıcı Derekavak kabulünü (HLOD denetim listesi + şekiller) 2026-11-17 tarihinde onayladı.

**R2 (5.2) uygulandı (2026-11-17, C).** Batch görünüm başına sayaç, görünür liste,
indirect argümanları, compute düğümleri ve mesh'ler tutar: görünüm 0 ana kamera,
1.. gölge görünümleri (en çok 8). `gpuDriven` gölge görünümlerini three'nin son
karedeki ışık düğümünden bulur: kaskatlı güneşin her kaskatı (CSM düğümü kaskatları
render'dan önce aynı kamerayla yerleştirir; render aynı hesabı tekrarlar), diğer her
yönlü gölge haritası bir görünüm; spot / nokta gölgeleri GPU güdümlü batch'i görmez.
Gölge görünümü k'nın mesh'leri yalnız k katmanında; gölge kamerasına o katman
eklenir (three'nin gölge geçişi korur), ana kamera ve öteki kameralar görmez.
Gölge geçişi ortak `scene.overrideMaterial`'la çizdiği için `contextNode` taşınmaz:
örnek dönüşümü `castShadowPositionNode`'da, solma `maskShadowNode`'da. Mesafe /
LOD / solma ana kameradan ölçülür (ana görünümün ayıkladığı gölge düşürmez).
`castShadow: false` batch'i gölge görünümü kurmaz. WebGL2 ikizi aynı görünümleri
örnekli mesh'le kurar; three boş örnekli mesh'i çizmediği için sayaç yalnız örneği
olanları sayar. Smoke `gpuCulling.smoke.ts` iki arka uçta: P2'de 3 kaskat, her
kaskatta GPU sayısı CPU'nun kesin–olası aralığında (P2 / P1 / gökyüzü ana görünüm
177 / 32 / 0 değişmedi); `?debug` 398 → **458** (15 çizim × 4 görünüm; WebGL2 454);
gölgeli / gölgesiz görüntü farkı 0,21 (0–255). Kayıt
`render-refs/runs/2026-11-17T11-23-41-036Z-gpu-culling.json` (+ `-webgl`), çekimler
`candidates/derekavak-p2-gpu-foliage{,-shadowless}.png` (göz için). Odaklı Vitest,
typecheck, katman. Bundle 5.3'te; gölge görünümleri de aynı bundle'a girer.

**R3 (5.3) ölçüldü (2026-11-17, C): bundle kazanç vermiyor, varsayılan kapalı
(kullanıcı kararı bekliyor).** `bundle: true` batch'i bütün görünümlerin opak
mesh'lerini kendi `BundleGroup`'una koyar; three kamera başına (ana + her gölge
kamerası) kaydeder. Yeniden kayıt yalnız mesh kümesi (görünüm kurma / büyüme) ya da
görünüm sayısı değişince işaretlenir (`bundleUpdates`); örnek sayısı indirect
argümanında olduğundan culling yeniden kaydettirmez. Saydam materyaller bundle'a
girmez: three bundle'ları geçişin **sonunda** (`finishRender`) yürütür, doğrudan
çizilen saydamlardan sonra. `npm run measure:gpu-driven` (yeni; Derekavak P2, 1080p
`high`, DPR 1, gerçek WebGPU, 60 Hz adımlı, 60 ısınma + 300 kare; kayıt
`render-refs/runs/2026-11-17T11-43-06-711Z-gpu-driven.json`, üç koşu tutarlı):

| Senaryo | Draw (4 görünüm) | Gönderim ort. / p95 | Kare CPU | GPU |
|---|---|---|---|---|
| Batch yok | 0 | 0,94 / 3,7 ms | 1,38 | 2,39 |
| Foliage, doğrudan | 60 | 1,54 / 4,7 | 1,96 | 2,75 |
| Foliage, bundle | 60 | 1,49 / 4,7 | 1,89 | 2,62 |
| Stres ×20 (120 batch), doğrudan | 1.200 | 20,2 / 23,5 | 20,7 | 11,1 |
| Stres ×20, bundle | 1.200 | 21,7 / 26,7 | 22,3 | 11,1 |

Sabit pencerede yeniden kayıt 0 (`backend.beginBundle` sayacı). **Neden:** three
r187 düğüm özelliği taşıyan her materyalin render nesnesini her karede tam yeniler
(`NodeMaterialObserver.needsRefresh`: `hasNode` → FULL; bundle replay'i de aynı
güncellemeyi yapar). CPU profili (stres, 60 kare): `Bindings._update` %10,7,
`UniformsGroup.update` %9,1, `updateForRender` / `needsRenderUpdate` / öznitelik
denetimleri; kodlama (`setPipeline` / `setBindGroup` / `setVertexBuffer` / `draw*`)
yaklaşık %10, bundle'ın kurtarabileceği pay bu. Dolaylı çizim başına ~17 µs; sahnenin
olağan nesneleri ~2,7 µs. Ayrıca 120 batch × 4 görünüm × 3 = 1.440 compute dispatch'i.
Faz 1 spike'ındaki statik bundle kazancı (2,9 → 1,98 ms) bu yolda tekrarlanmadı.
Smoke: bundle'lı kurulum doğrudanla aynı görüntüyü verir (WebGPU, fark ≤ gürültü +
0,05). **Öneri (R10 öncesi):** çizim başına CPU'yu düşürmek için render nesnesi
sayısı ve nesne başına bağlama: tek compute geçişinde bütün batch'ler, görünümler
arası paylaşılan materyal / bağlama, gölge görünümünde ayrı küçük materyal; bundle
ancak bunlardan sonra yeniden ölçülür.

**R4 (5.4) uygulandı (2026-11-17, C).** Adım 6 (halka) ve 7 (boyanmış hücreler) R10'dan
sonra geldiği için R4 onların bağlanacağı katmandır: `render/foliage/foliageBatches.ts`,
`forge.foliageType` başına bir GPU güdümlü batch: LOD 0 modeli + `lods` modelleri
(slot materyalleriyle), LOD 0'ın sınır küresi, Forge'un köken uzaklıklı solması
(`cullStart` → `cullEnd` × kalitenin `foliageCullDistanceScale`'i), LOD başlangıçları
`screenSize`'lardan şablonun kendi boyunda, `castShadow`. Örnekler sahip anahtarıyla
gelir (boyanmış hücre, halka karosu): `set` değiştirir, boş liste ya da `remove` siler;
model yüklenirken gelenler batch kurulunca eklenir; tür değişirse (model, LOD, gölge,
bant) yeni batch kurulur ve sahipler taşınır; kalite değişimi yalnız mesafeleri
ayarlar. WebGL2 ikizi batch'le birlikte gelir. Dev kancası ve smoke foliage'ı bu
katmandan kurar: `gpuCulling.smoke.ts` iki arka uçta geçti (P2 / P1 / gökyüzü 177 /
32 / 0, her kaskatta GPU = CPU). Birim testi 2 (sahip değiştir / sil, yüklenirken
gelen, tür değişimi, kalite, `castShadow: false`). Halkanın ve hücrelerin bu API'ye
bağlanması adım 6 / 7'de.

**R5 uygulandı (2026-11-17, C): sahne maliyet raporu.** `npm run forge -- stats
--project <yol> --level <klasör> [--json] [--top <n>]` (`tools/stats/`; salt okur,
motor / paket level'ı da): aktör (uzamsal / kalıcı, hücre), bileşen türleri, statik
mesh yerleşimi, benzersiz model ve model + materyal birleşimi, kaynak üçgen (her
yerleşim tam detayda), şekiller, benzersiz materyal (saydam / çift yüzlü / ikisi),
renderer'ın kurduğu statik batch'ler (`staticMeshBatchKey`) ve şekil batch'leri,
görünüm başına draw ve gölge kaskadı başına draw, foliage kuralları / boyanmış örnek,
HLOD; yerleşmiş üçgene göre ilk n model (üçgen, primitive, slot, saydam / çift yüzlü,
yarıçap). Editör Stats (`?debug`) çizilen üçgene GPU güdümlü batch'lerin üçgenlerini
ekler (sayaçlar en çok saniyede iki kez eşzamansız okunur; WebGL2'de three sayar);
draw call'a dolaylı çizimler 5.1'den beri ekleniyor. Görüntüleyicinin bütçe sinyalleri
de aynı üçgeni okur. Smoke iki arka uçta: P2'de üçgen 1.845.942 → 2.132.334 (WebGPU)
/ 2.146.928 (WebGL2). Raporlar:

| | Derekavak (referans projesi) | Sentetik StreamingBench (ölçüm kopyası) |
|---|---|---|
| Aktör | 117 (109 uzamsal, 8 kalıcı), 22 hücre | 50.000 (49.999 / 1), 1.024 hücre |
| Statik mesh | 25 yerleşim, 2 model, 2 birleşim, 20.364 üçgen | 44.999, 27 model, 27 birleşim, 40.376.037 üçgen |
| Şekil | 83 küp, 996 üçgen | 5.001 (5.000 küp + 1 düzlem), 60.002 üçgen |
| Materyal | 14 benzersiz, 0 saydam, 14 çift yüzlü | 34, 0 saydam, 28 çift yüzlü |
| Draw / görünüm | 118 (2 statik + 1 şekil batch'i; dk-house 68, dk-depot 49 primitive) | 182 (27 + 2 batch) |
| Gölge kaskadı başına | 118 draw (3 batch) | 181 draw (28 batch) |
| Kaynak üçgen | 21.360 | 40.436.039 (SM_DentPanel 1.666 × 19.200 = 32,0 M) |
| Foliage / HLOD | 0 kural (referans yeniden alınmadı) / yok | 0 / 1.024 hücre, 3.366.912 üçgen |

Okuma: Derekavak'ta draw'ın kaynağı primitive sayısı (iki bina modeli 117 primitive,
bütün materyaller çift yüzlü); sentetik level'da üçgen tek modelde yoğun. İki level da
R6'nın ölçü dili: üçgen ağırlığı model başına, draw ağırlığı primitive başına. Not: HLOD
üretimi Derekavak'ta 21.360 üçgen yazdı, kaynakla aynı (sadeleştirme bu modellerde
üçgen düşürmüyor); R8'de bakılır.

**R6 ölçüm kaydı (2026-11-17): ilk seçim v1.54'te onaylandı; güncel v1.55 kararı meshlet'i erteler. R7 otomatik LOD ile devam eder.** Scratchpad
`.forge-cache/r6/` (kod commit'lenmedi), ayrı Vite cache / dev kancası yalnız
5284'te; 5183 / 5283'e dokunulmadı. Kayıt
`ForgeReference/render-refs/runs/2026-11-17-r6-triangles.json`; yanında
`2026-11-17-r6/` ham kayıtlar, çalıştırıcı / uyarlama ve görüntüler var.
Kod tabanı `be4ce93`, görsel kabul kaydı `fa683e8`; three 0.187.0,
three-virtual-geometry 0.1.3 (npm shasum 51a07fd2eec18c81149b1a10f9ad3cde1bbbfc43).

**Yöntem:** NVIDIA Ampere gerçek WebGPU, Chrome 157, 1920 × 1080, DPR 1,
high, adaptif kalite kapalı. P2'de 60 ısınma + 180 örnek; her 60 Hz engine
adımı öncesi ayrı `requestAnimationFrame` beklendi. Aralıksız elle adımlama
three PassNode'un aynı tarayıcı karesinde scene pass'ini yeniden kullanmasına
neden oldu; bu ilk denemelerin süreleri kullanılmadı. Draw sayacı native
pass / bundle komutlarını (bundle replay dahil) sayar. GPU render ve compute
zamanları ayrı; toplamları tam kare duvar süresi veya G6 kabulü değildir.
Bellek `renderer.info` tahmini GPU ayırımıdır (önceden yüklenmiş kaynaklar dahil),
sürücü VRAM'i / tepe ön işleme belleği değildir. Ön işleme duvar süresi modül
hazırlığını içerir; shader ısınması ayrıca 60 karede dışarıda tutulur.

P2'nin akışla yüklenen statik alt kümesi 117 primitive / 661 primitive örneği,
8.004 kaynak üçgendir; R5'in bütün level 21.360 sayısıyla karıştırılmaz.
Stres, bu sahneye kamera önünde 1.600 adet 16.128 üçgenli küre ekler:
25.812.804 kaynak üçgen. Terrain, şekiller, gökyüzü ve MRT yerinde kaldı.
Karşılaştırma statik kopyalar üzerinde; materyalin detay fade context'i kaldırıldı.
Bu nedenle picking / fade / akış ve hareketli kamera üretim kabulü değildir.

**Derekavak P2, stres yok (ortalama):** 5.1 tam detay 496 draw / 10,75 ms
gönderim / 11,40 ms CPU / 5,23 ms GPU render; üç LOD'u küçük parçalara da
kuran naif ayrık LOD 1.432 draw / 20,02 / 20,77 / 5,39 ms. VG 964 draw /
9,52 / 10,22 / 5,14 ms; ana görünüm 1.420, gölge kesimi 1.172 üçgen.
Meshlet 398 draw / 4,31 / 4,93 / 5,10 ms; **0 meshlet**: bütün bina
materyalleri DoubleSide olduğundan normal çizimde kaldı. Bu bir üçgen kazancı
olarak yorumlanmaz. Bu level'da draw / primitive işi R8'e aittir.

**Yoğun sahne:** bütün sahnenin draw / zaman / bellek ölçümü aşağıda. Ayrık
LOD için küçük parçalarda gereksiz LOD kopyaları kaldırıldı (≤ 500 üçgen tek
LOD); yalnız büyük model üç LOD (1 / 0,5 / 0,15; mesafe 40 / 90 m).

| Aday | Draw | Gönderim ort. / p95 ms | CPU ms | GPU render ms | GPU compute ms | Bellek MiB | Ön işlem ms |
|---|---|---|---|---|---|---|---|
| 5.1 + ayrık LOD | 508 | 10.29 / 13.50 | 10.98 | 8.12 | 3.80 | 303.1 | 21 |
| 5.1 + ayrık LOD + R3 bundle | 508 | 9.40 / 13.00 | 10.11 | 8.26 | 3.81 | 303.1 | 23 |
| VG doğrudan | 972 | 9.73 / 11.20 | 10.46 | 6.22 | 1.84 | 521.5 | 1870 |
| VG bundle (gölge kabulü yok) | 972 | 7.01 / 7.90 | 7.64 | 5.78 | 1.31 | 412.2 | 2187 |
| r187 meshlet doğrudan | 402 | 4.83 / 6.40 | 5.42 | 6.35 | 0.22 | 320.3 | 152 |
| r187 meshlet bundle | 500 | 3.03 / 3.90 | 3.61 | 6.37 | 0.22 | 320.3 | 141 |

Tam detay 5.1 karşılığı: 500 draw, 10,42 ms gönderim, 11,09 ms CPU,
14,73 ms GPU render; ana + gölge 49.504.812 statik üçgen. Ayrık LOD bunu
12.847.134'e indirdi; ana görünüm örnekleri 36 / 144 / 1.036 (LOD 0 / 1 / 2).
WebGPU ana görünüm sayaçları CPU kesin–olası aralığında; WebGL2 CPU ikizi aynı
36 / 144 / 1.036 sayısını ve üç kaskadı verdi, shader / sayfa hatası yok.
WebGL2 GPU timestamp / native WebGPU draw sayacı yoktur; kayıttaki sıfırlar
çizim yapılmadığı anlamına gelmez. Görüntü kaydedildi; görsel eşitlik kabulü değil.

VG: ana 1.652.584 + gölge 868.036 üçgen, overflow yok, thresholdScale 1;
ters derinlikte occlusion kapalı. `BundleGroup.needsUpdate` dönüşümden sonra
zorunlu (aksi halde orijinal kaynaklar çizilir); düzeltince ana kesim çizildi,
fakat ayrı gölge kesimi sayacı **0**: bundle + kaskat yolu kabul edilmedi.

r187 kopyası: reversed-depth engeli kaldırıldı, occlusion / HZB kapalı; three
çekirdeği değişmedi. İlk tüm-sahne denemesi terrain `vTerrainLocal` WGSL
hatası verdi; yalnız aday statik materyaller kabul edilince geçti. Ağır kürede
ana görünüm 21.669 küme × 64 = **1.386.816** (degenerate padding dahil), üç
kaskat 839 / 6.830 / 17.210 küme = **1.592.256** üçgen; bina fallback'leri
bu sayaçlara dahil değil. Doğrudan ve bundle sayaçları aynı. DoubleSide,
saydam, custom context / maskShadowNode vb. native destek dışı; kaynak
materyal sessizce FrontSide'a çevrilmedi. MRT ve ters derinlikle bu sınırlı
statik örnekte hata yok; genel malzeme / normal-motion kabulü ayrıca gerekir.

**İç API bağı / maliyet:** VG node materyal, storage / indirect, pool ve
onBeforeRender / onBeforeShadow yaşam döngüsüne; r187 kopyası DrawingPipeline,
renderer render list / context / node builder, geometri havuzu ve gölge
geçişine bağlıdır. Kopya 5.500+ satırdır; sürüm yükseltme bakım yükü yüksektir.
5.1 + meshoptimizer var olan batch / WebGL2 ikiziyle en dar sözleşmedir, fakat
LOD × parça × görünüm draw ve yüzlerce compute dispatch CPU / GPU maliyetidir.

**İlk karar (kullanıcı, 2026-11-17; v1.54, v1.55 ile değişti):** R7'de r187 meshlet kopyasını yalnız
uygun, yoğun, FrontSide statik geometri için üretimleştirmek; DoubleSide /
saydam / özel düğümlü statikler ve WebGL2 için 5.1 + otomatik ayrık LOD
fallback'i korumak. Foliage mevcut 5.1 yolunda kalır. Terrain meshlet'e girmez,
occlusion ilk sürümde kapalı kalır; picking / fade / HLOD hazır olma / build
ön işlemesi tasarımı R7’de netleştirilir; yeni mimari soru varsa kullanıcıya sorulur. VG bu ölçümde varsayılan
öneri değil (bellek ve bundle-gölge açığı). Küçük bina parçalarındaki draw
sorunu bu seçimle kapanmaz; R8 / R9 ve son G6 hâlâ açık. **R7'ye başlanmadı.**

5c ile paralel yürürse ortak dosyalar: `render/sync/instanceBatches.ts` (adım 8; foliage
kendi batch'ini kurar), kalite profilleri, `?debug` satırları. Çakışmada adım 8 5c'nin
GPU güdümlü yolunu bekler.

- [x] **5a Terrain:** Faz 3'ün terrain salt çizimi (spike S2'nin TSL CDLOD'u,
      Faz 3 karar 1) üretim kalitesine çıkar: morph,
      tile seam, 8 boya katmanı, su birikintisi (kıyı ıslaklığı ve kostik
      Faz 7'de, 5a karar 1); tile
      akışı (editör ve runtime), global harita; authored paint / yükseklik /
      fizik materyaline yazmayan WES kar / ıslaklık örtüsü. *Kapı:* referans
      terrain level'ı §2.10 ölçümüyle sınırın içinde; görsel yükseklik collider ile
      eşleşiyor; WES örtüsü bağımsız önizleniyor ve kayda sızmıyor, saat
      atlaması birikim süresi sayılmıyor; ertelenen 4 A yeşil (su birikintisi 3,
      öksüz tile 1). Bitki kataloğu bu terrain diliminin önkoşulu değildir.
- [x] **5b Akış + HLOD:** World Partition hücre akışı (A11 modeli; editör de
      akışla çalışır), HLOD, view distance (Faz 3'ün "Işık ve gölge" kutusundan
      taşındı, kullanıcı kararı 2026-11-13), küçük nesne culling. *Kapı:* hücre
      yükle / boşalt döngüsünde sızıntı yok (bellek ve GPU kaynağı ölçümü);
      akış sırasında kare süresi sıçraması sınırın içinde; ertelenen 25 A yeşil
      (asset residency 18, dünya haritası 5, ayrıntı culling 2; görüş mesafesi
      9 + sis 1 Faz 3'te, eşzamansız hücre yükleyici 17 ve `terrainRuntimeStreaming`
      2 5a adım 2'de taşındı); sentetik büyük level'da `measure:streaming` ölçütleri
      (5b karar 9); HLOD `forge hlod` ile üretilip editörde ve oyunda geçiş yapıyor.
      Mesafe LOD 5b'de yok (karar 10, meshlet hattı tartışması).
      **2026-11-17:** teknik kapı ve streaming ölçümü geçti; kullanıcı HLOD /
      detay fade görsel kabulünü onayladı. Hücre batch bölmesi kullanıcı onayıyla
      5c öncesi G6 / meshlet spike'ına bırakıldı.
- [ ] **5c Foliage:** instancing + compute culling + indirect draw; impostor /
      billboard, rüzgâr, fade; foliage hücreleri; PG0–PG3 ile ortak bitki
      ailesi ve WES tepkisi: tekil aktör / foliage eşitliği, kademeli renk /
      yapraklılık, kar / ıslaklık ve güncel mevsimle hücre yükleme. GPU güdümlü
      yol bütün foliage türlerinde ve gölge kaskatlarında zorunlu
      (Faz 1 GO koşulu; S4: kip (b)'de
      Derekavak P2'nin 327 draw call'unun 260'ı foliage). *Kapı:* referans
      level'ın gerçek foliage sayılarıyla S4 ölçümünün üretim karşılığı; G6
      Derekavak P2'de 60 Hz'de render gönderimi ≤ 3 ms, ana iş parçacığı ≤ 6 ms;
      ertelenen 8 A yeşil (foliage halkası). Ek kabul: prosedürel üretilmiş
      iki ağaç türüyle PV-WES-01–08; LOD / impostor, kullanılan HLOD ve gölgede
      kış / ara mevsim tutarlılığı; üretilmiş ormanda da G6; çevre geçişinde
      yeniden derleme / kaynak sızıntısı yok, en uzun kare, GPU süresi ve
      toplam / tepe bellek raporlanmış. Tam üretici paneli beklenmez.
- [ ] **5d Editör araçları + World Builder:** sculpt, paint, foliage paint,
      landscape spline; World Builder penceresi + `/__world-random` endpoint'i
      + önizleme worker'ı; PG5 tam tarif paneli, `generated` model kaynağı ve
      bitki ailesi yerleşimi. *Kapı:* araç başına editör smoke'u (düzenle → kaydet
      → yeniden aç); üretilen dünya Content Browser'da görünüyor; ertelenen
      4 A yeşil (`worldTerrainMove`, su tipleri Faz 7'yle); üretilen bitki
      yerleşimleri aileyi kullanıyor, aile / mevsim önizlemesi çalışıyor.
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
- [ ] Göl ve nehir (TSL), sualtı, su–terrain bağlantıları; terrain kıyı
      ıslaklığı ve kostiği (INV-G14'ün su kısmı, 5a'dan; kullanıcı kararı
      2026-11-15).
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
| 2026-11-13 | v1.4 | Faz 3 adım 2 (`620cb3e`, `dff1176`): `engine/perf/{qualityProfiles,adaptiveQuality,hardwareHints}` ve `engine/persistence/userSettingsStore` taşındı, 17 ertelenmiş A yeşil (`port:forge tests --deferred`), GPU timer kontrolü D (payda 1.021); `src/runtime/quality` kalite sürücüsü (Forge `RuntimeSceneApp`'in kuralları), renderer piksel oranı ve perf witness profili; WebGPU izin alanları (`traaAllowed`, `ssrAllowed`, `ssgiAllowed`, `aoResolutionScale`), eşleme Balanced / GTAO'suz Balanced / Compatibility, merdiven dışı `cinematic`. Smoke `high` profiliyle yeşil. 1.564 test, kapı yeşil. **A 902 / 1.021**. Mimari v1.8 |
| 2026-11-13 | v1.5 | Faz 3 adım 3 (`c14e11f`, `4b9a640`): `engine/world/{sunCascades,followShadow}` taşındı (18 A); `forge.light` (`forge.directionalLight` / `pointLight` / `spotLight`, güneş `atmosphereSun`), kaskatlı güneş `CSMShadowNode` (Forge bölmeleri), öteki gölgeli yönlü ışıklar takipli harita, ana gölge anahtarı host'ta; içe aktarıcı `lights[]` çevirir (güneş Forge kuralıyla), rapor / `--compare` sayar. Kullanıcı kararı: statik gölge varsayılanları bileşen başına (`castShadow`, adım 4). Smoke gerçek ve scratch referansta yeşil; referans projesinin `--force` ile yeniden alınması kullanıcı onayında. 1.595 test, kapı yeşil. **A 920 / 1.021**. Mimari v1.9 |
| 2026-11-13 | v1.5 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla ışık çevirisiyle yeniden alındı: 7 level'da `--compare` ışık 1 / 1 ve aktör sayımları eşit, `check:projects` ve smoke (L03, kaskatlı güneş) yeşil |
| 2026-11-13 | v1.6 | Faz 3 adım 4 (`f6aa509`, `203714e`, `04409af`, `6f02c42`): asset perf raporu taşındı (3 A; taşıma araçları `tools/`'u da tarar); çekirdek şemalı JSON asset türü + isteğe bağlı renk, SDK 0.1.2; `forge.material` ve sürüm 2 `forge.texture` / `model` / `staticMesh` / `shape` / `terrain`; Forge materyal normalize'ı içe aktarıcı okuyucusu, materyal / model yan dosyası / yerleşim renk-gölge-materyal / landscape materyali çeviricileri; starter paketine 10 materyal ve uyarlanan A kontrolü; TSL materyal (slot düğümleri, katman karışımı, normal hareketi), katkı sırası + world mask, doku / materyal önbellek anahtarları, model hazırlığı (normal, anizotropi, UVW, slotlar), static mesh slot / tint / `castShadow`. Kullanıcı kararları: boş tint, `enabled` grupları, `name` / preset, `materialSlot` her slota. Referans projesi kullanıcı onayıyla yeniden alındı; smoke gerçek WebGPU'da, L03 zemini slot materyaliyle. 1.643 test, kapı yeşil. **A 924 / 1.021**, Faz 3'te ertelenmiş A kalmadı. Mimari v1.10 |
| 2026-11-13 | v1.7 | Faz 3 adım 5, çevre (`69a9be7`, `c3c4d07`, `f092bc5`): `engine/world/viewDistance` 5b'den öne alındı (10 A, sisin CPU ikizi R'si yeniden yazıldı); `forge.skyAtmosphere` / `forge.skyLight` / `forge.cloudLayer` / `forge.worldEnvironment` (sabit saat, WES servisi); içe aktarıcı çeviricileri (rapor ve `--compare` sayar), World Builder greybox görünümü; TSL gökyüzü + ay + yıldız, PMREM Sky Light, bulut kubbesi, WES yorumu kare başına, gökyüzü varken ACES × 0,2. Kullanıcı kararları: arka plan / ortam ışığı Sky Light'ta, ton eşleme Forge kuralıyla şimdi, `viewDistance` öne. Smoke yeniden alınmış kopyada gerçek WebGPU'da yeşil; referans projesinin yeniden alınması kullanıcı onayında. 1.683 test, kapı yeşil. **A 934 / 1.021**. Mimari v1.11 |
| 2026-11-13 | v1.7 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla çevre çeviricileriyle yeniden alındı: 7 level'da gökyüzü / Sky Light / bulut / WES sayımları `--compare`'de eşit, `check:projects` ve smoke (L03) gerçek WebGPU'da yeşil; ForgeReference README'si ve içe aktarma raporları güncellendi |
| 2026-11-13 | v1.8 | Faz 3 adım 6 (`5d8c8cc`, `7e202d4`): `forge.postProcess` (+ TRAA, SSR seçimi) ve içe aktarıcı çeviricisi, `applyQualityToPostProcess` bileşen verisine; TSL `RenderPipeline` (MRT'li sahne pass'i, GTAO / SSGI / SSR / TRAA / SMAA / DoF / bloom / renk düzeltme / renk sapması / vignette / gren, ton eşleme), MRT 30 bayt + profil başına test + cihaz sondası, çıktı dönüşümü bağlamalardan önce. Kullanıcı kararları: gökyüzü kubbesi Post Process altında kendi pozlamasıyla, SSGI AO'nun yerine, pipeline'sız çizimde MSAA. 9 R yeniden yazıldı, 1 düştü; A 934 / 1.021 |
| 2026-11-13 | v1.8 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla Post Process çeviricisiyle yeniden alındı: 7 level `--compare`'de eşit (L03 ve Derekavak'ta `forge.postProcess`), `check:projects` ve smoke (L03 pipeline'la, gerçek WebGPU) yeşil; ForgeReference README'si ve içe aktarma raporları güncellendi |
| 2026-11-13 | v1.9 | Faz 3 adım 7, olay bazlı gün saati (`1930135`, `3e87850`, `66d34a6`, `dac9605`): `timeTransition` (saf, testli), `WorldEnvironmentService.transitionTo` (`Promise<boolean>`, hep ileri; kullanıcı kararları) alt sistemin tick'inde; Sky Light yakalaması aynı PMREM'e (materyal yeniden kurulumu kalktı), yakalama hızı ölçümle (kullanıcı kararı: Forge açı politikası + 0,1 sn sınır + güneş durunca son yakalama); `npm run measure:sky-capture` (NVIDIA Ampere: yakalama ~3,3–3,5 ms GPU, 5 sn geçişte 69 → 38 yakalama, ardışık en çok 1). A 934 / 1.021 değişmedi; render smoke yeşil |
| 2026-11-13 | v1.10 | Faz 3 adım 8, görüntüleyici (`992560a` instancing, `5897915` katman materyali GUID + veri belgesi başvuruları + paket `requires` (SDK 0.1.3, starter'a 2 materyal), `615cfdd` terrain salt çizimi, `1f28c22` varsayılan kamera, `e887fca` `?debug` paneli, `432c7c3` smoke level'ları); kullanıcı kararları (katman materyali GUID, paket `requires`, `?debug` kapsamı); 6 + 8 Forge kontrolü M'den etiketle taşındı, A 934 / 1.021 değişmedi; smoke 7 level + kamera + `?debug` gerçek WebGPU'da yeşil |
| 2026-11-13 | v1.10 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla yeniden alındı: terrain belgelerinde katman materyalleri GUID (Derekavak, Island, OpenWorldTest, WbPilotValley); 7 level `--compare`'de eşit, `check:projects` yeşil; ForgeReference README'si güncellendi |
| 2026-11-13 | v1.11 | Faz 3 adım 9 (`38dcc56`, `5a71a75`): render smoke tam seti (4 terrain level × Faz 0 P1–P3, L03, 2 çerçeveli level; 15 çekim, 1920 × 1080 DPR 1, pozlar `baseline/poses.json`'dan), `npm run smoke:grid` (Faz 0 WebGL | WebGPU yerel sayfası); ızgarada bulunan hata düzeltildi: güneş dönük aktörün altındayken `CSMShadowNode` kaskatları görüşü ıskalıyordu, terrain level'larında statik gölge yoktu (yönlü ışıklar dünya çerçevesinde, yeni test). Farklar kullanıcıya listelendi (foliage 5c, su 7, araçlar 6 / 8, gölge kenarı, orta mesafe tonu) |
| 2026-11-13 | v1.11 | Faz 3 kapandı: kullanıcının görsel kabulü; referanslar `--update-snapshots` ile yazıldı, ikinci koşu 15 / 15 karşılaştırmada; kapı A 934 / 1.021, Faz 3'e ertelenmiş A yok; "Işık ve gölge" kutusu işaretlendi, view distance 5b'ye (kullanıcı kararı, seçenek a). Ayrıntı `docs/archive/PHASE_3.md`'ye taşındı, planda özet; mimari v1.15. Sıradaki: Faz 4 (editör çekirdeği) |
| 2026-11-13 | v1.12 | Faz 4 başladı: döküm (36 INV satırı; Faz 4'e ertelenmiş A yok; editör alanında 11 R, 27 M niyeti kabul ölçütü) ve tasarım kullanıcı onayıyla ("önerileri kabul ediyorum"; mimari v1.16): editörün 3B kodu `src/render/editor/` + rol `features/*/editorRender.ts`, Forge'un gizmo'su, World `actorsChanged`, ajan komutları kayıt servisi modülüyle + editörün canlı tazelenmesi + `find` / `show`, motor içeriği kipi `--engine-content`, asset editörleri genel veri editörü + önizleme, Play oturum katmanı, küçük resim önbelleği, grup = boş aktör, editörde bütün hücreler, editör smoke'ları CI'da `forceWebGL`. Adım sırası 1–10 |
| 2026-11-13 | v1.13 | Faz 4 adım 1, UI kiti (`210ed40`): `src/editor/ui` — core form tanımından Details satırları (her alan türü, Forge'un parametre kuralları saf fonksiyonla, Türkçe sınır uyarısı, dönüş derece ↔ kuaterniyon `engine/math/euler.ts`), Forge'un ikonları ve CSS token'ları; `?editor-kit` geliştirme sayfası; `npm run smoke:editor` (başsız Chrome) gate'te ve CI'da. A 934 / 1.021 |
| 2026-11-13 | v1.14 | Faz 4 adım 2 dilimi (`ba97b6f`, `9119c42`, `a67220d`, `f3ee39b`, `d67845d`): **kullanıcı kararı** editör World'ü yalnız `inEditor` alt sistemleri kurar (render, World Environment, Height Fog); `World.updateActors` + `actorsChanged` (SDK 0.1.4); `editor-render-is-editor-only`; editör oturumu (oturum → World yansıması, çocuğu kalan aktör silinmez); `?editor` kabuğu (Outliner, Details transform'u, undo / redo / kaydet); editör smoke'u geçici proje kopyasında, `forceWebGL`, gate'te ve CI'da; `verify:dist`. Kalan 2b: üretim build'i (içerik dist'te, salt okunur istemci), `base`, `--strict`. A 934 / 1.021 |
| 2026-11-13 | v1.15 | Faz 4 adım 2 tamam, 2b (`eea148b`; **kullanıcı kararı:** üretim build'i Faz 4'te): `npm run build` projeyi derler, `tools/build-content.ts` içeriği ve dizinleri `dist/forge/`'a yazar, oyun salt okunur statik istemciyle `BASE_URL` altından okur; kapıda `verify:dist --strict` ve `npm run smoke:dist` (alt dizinde açılış, bütün istekler alt dizinde). Dist kutusu işaretli. A 934 / 1.021 |
| 2026-11-14 | v1.17 | Faz 4 adım 4 tamam, gizmo / snap / pivot (`d26ab2f`, `3721d11`, `1d79c16`, `63cc3b6`): **kullanıcı kararı** pivot aktör belgesinde (`pivot`, yalnız editör); sürükleme matematiği three'siz `engine/gizmo` (ışın-eksen en yakın noktası, kuaterniyon dönüş, çoklu seçim, ebeveyn uzayı), 11 R yeniden yazıldı; zemin / duvar snap'i picker ışınlarıyla; instancing transform hızlı yolu; gizmo çizim katmanında, araçlar ve snap widget'ları, Details'te pivot ve yerleştirme; editör smoke'u gizmo'yla. A 934 / 1.021 |
| 2026-11-14 | v1.16 | Faz 4 adım 3 tamam, editör viewport'u (`af6b334`, `1bfeffe`, `2cbed7f`, `1cf02e4`): editör kamerası (Forge'un denetleyicisi ve kipleri, ortografik kamera 1.000 m geride), çizim katmanı (sahne derinliğine karşı; pipeline'sız karede derinlik ön geçişi), ızgara, picking etiketleri ve CPU picker (instance → aktör, terrain yükseklik alanı), seçim çerçevesi, F / Esc / Ctrl+tıkla, View Mode / Quality / Show menüleri, `editorRender` bağlamaları + ışığın yardımcıları. Çizim katmanı kutusu işaretli. A 934 / 1.021 |
| 2026-11-14 | v1.18 | Faz 4 adım 5 tamam, paneller (`aa3726d`, `1a36338`, `e3f44f6`, `c887976`, `15a704b`, `1963a77`, `cd55e12`): **kullanıcı kararları** (hepsi öneri) Outliner ölçümü ayrı bench, override satırda, Add Actor girişleri + sınıflar, World Settings = level ayarı + tekil ortam aktörleri, `locked` belgede / gizleme görünüm, Add / Remove Component, Ground Mist + World Environment önizlemesi, pano JSON; sanallaştırılmış Outliner (50.000: ilk kurma 47,8 ms, seçim p95 3,5 ms, kaydırma 0,9 ms, arama 23,1 ms), şemadan Details ve çoklu seçim, düzenleme işlemleri ve gruplama, Add Actor + sürükle-bırak, World Settings, kısayol tablosu, Outliner sağ tık menüsü; `defineFeatureEditor` (SDK 0.1.5–0.1.7); editör smoke'u 28 test. A 934 / 1.021 |
| 2026-11-14 | v1.19 | Faz 4 adım 6 tamam (6a–g): Content Browser, küçük resim, referans güvenli dosya işlemleri, yeni asset / klasör, import / reimport, viewport’a sürükle-bırak, Open Level ve Browse To; `397e8d2` motor içeriği kipi, kökler arası kopyalama reddi, sınıf tazeleme, motor level kayıt / 409. DOM panelleri kutusu kapandı; SDK 0.1.9 değişmedi. Kapı yeşil: 1.946 test, 39 editör ve 1 dist smoke. Mimari v1.22; asset editörleri adım 7’de |
| 2026-11-14 | v1.20 | Faz 4 adım 7 tamam (`3545277`): ortak asset oturumu / pencere; şemadan form ve sanal tablo (A13); materyal küresi, static mesh slot / UVW gizmosu / vertex doldur-sil, aktör sınıfı bileşen ağacı ve varsayılanları; tek canvas / GPU üzerinde taslak önizlemesi; sınıf kaydında görünür level / hücre override koruması, kirli level verisi korunarak sahne tazeleme. SDK 0.1.10 (API `bb3bd9b259905ae0`), HTTP / asset şemaları aynı. Tam gate: 1.957 test, 47 editör + 1 dist smoke; başlıklı gerçek WebGPU asset 8/8 ve son sınıf döngü kontrolü, render smoke 17/17; referanslar değişmedi. Mimari v1.23. Sıradaki adım 8: Play + gelişmiş 409 akışı |
| 2026-11-14 | v1.21 | Kullanıcı kararı: WES ile prosedürel bitki tasarımı birleştirildi (bitki planı v0.6, mimari v1.24). Kalıcı bitki ailesi, tekil aktör / foliage ortak tepki sistemi, mevsimsel yapraklılık / renk, rüzgâr ve görsel kar / ıslaklık; olay bazlı saatten ayrı birikim süresi; PG0–PG3 küçük üretim 5c ile, tam araçlar PG5 / 5d ile. 5a / 5c / 5d kapsamı ve PV-WES kabul koşulları güncellendi. Yalnız belge değişikliği; kod / bağımlılık değişmedi, uygulama başlamadı ve kutu kapanmadı. Forge WES belgesi salt okunur tarihsel referans |
| 2026-11-15 | v1.22 | Faz 4 adım 8 tamam (`0494b0c`, `b424fcf`, `35cc624`, `327013c`, `3375fe8`): **kullanıcı kararları** (hepsi öneri) birleştirme alan düzeyinde, Reload / birleştirme undo geçmişini temizler, Play yalnız açık level'ın kirli dosyaları, salt okunur projede Play çalışır. Play oturum katmanı (`POST/GET /__forge/play`, `read?play=`, `.forge-session/<id>/`, en fazla 8, sunucu açılışında silinir), editörde Play düğmesi ve P, oyun `?play=<id>` (editör kamerasından, yeniden yüklemede de); `core/edit/merge.ts`, `LevelSession` tabanı / `compare` / `rebase`; level 409 şeridi ve Compare penceresi, asset penceresinde Compare. "Kaydet / aç, Open Level, Play" kutusu kapandı. Tam gate: 1.985 test, 53 editör + 1 dist smoke; adımın 14 tarayıcı testi gerçek WebGPU'da, render smoke 17/17, referanslar değişmedi. SDK yüzeyi değişmedi. A 934 / 1.021. Mimari v1.25. Sıradaki adım 9: ajan komutları + canlı tazeleme |
| 2026-11-15 | v1.23 | Faz 4 adım 9 tamam (`293f9a1`, `549a916`, `23fe6bb`, `2cd6854`, `b6fc44a`, `d53e1c9`, `592839b`): **kullanıcı kararları** (hepsi öneri) süreçler arası kayıt kilidi, olay kanalı Vite HMR'ı (`forge:files`), ortak işlemler `src/engine/edit`, `add` sınıf / bileşen türüyle, toplu kip, asset penceresi de tazelenir, motor içeriği ve paketler yalnız okunur. `.forge-journal/save.lock`; `tools/server/authoring.ts` (dev server ve komutların ortak modülü), dev server'sız `SaveClient`; `npm run forge -- edit` (`add` / `move` / `delete` / `set` / `reset`, `find` / `show`, `--json`, stdin); içerik kökleri klasör klasör izlenir (Vite'ın izleyicisi ve özyinelemeli `fs.watch` smoke'ta olay kaçırdı); temiz level kendiliğinden tazelenir, kirliyse 409 şeridi. Bulunan iki hata: şema yükleyicinin kısa ömürlü Vite'ı açık dev server'ın `node_modules/.vite`'ını siliyordu (kendi geçici önbelleği), oluşturulmuş `.forge/tsconfig.json`'suz projede oyun modülü yüklenmiyordu. "Ajan düzenleme komutları" kutusu kapandı. Tam gate: 2.021 test, 57 editör + 1 dist smoke (`forceWebGL`; gerçek WebGPU koşusu yapılmadı). SDK yüzeyi değişmedi. A 934 / 1.021. Mimari v1.26. Sıradaki adım 10: editör smoke tam seti → kapı → kapanış |
| 2026-11-15 | v1.24 | Faz 4 kapandı, adım 10 (`90ee6be`, `1c0fbbc`, `69516ed`, `e673c7d`): **kullanıcı kararları** (hepsi öneri) oyunun editör tarafı bu adımda en küçük haliyle, `npm run smoke:editor:webgpu`, testler `console.error` ve 4xx / 5xx yanıtları da hata sayar. Forge'un `editor-authoring` karşılığı ve kapsamdaki editör smoke adımları (Rotate / Scale gizmo, Top picking, boyut değişimi, Play'de Quality ve Make Default, Outliner aralıkları, dar menü); ortak `tests/editor/support.ts`; oyunun `editor.ts`'leri `virtual:forge/game-editors` ile editörde (INV-A32). Bulunan hatalar: kayıt sürerken Save yeniden açılıyordu; dispose'dan sonra dosya olayı paketi gidebiliyordu; adım 9'un iki testi Windows'ta koşmuyordu. Kapı: tam gate (2.026 test, 66 editör + 1 dist smoke, `verify:dist --strict`), gerçek WebGPU 66 / 66, `bench:outliner` (50,1 / 4,8 / 1,2 / 25 ms, 23 satır), A12. Bütün kutular işaretli; bölüm `docs/archive/PHASE_4.md`'ye taşındı. SDK yüzeyi değişmedi. A 934 / 1.021. Mimari v1.27. Sıradaki: Faz 5 (5a önce) |
| 2026-11-15 | v1.25 | Faz 5 başladı: Faz 5 dökümü (29 INV satırı, ertelenen 60 A; 5b'nin sayısı 44'e düzeltildi, view distance Faz 3'te taşınmıştı) ve 5a tasarımı kullanıcı onayıyla (kararlar 1–7, adım sırası 1–8; mimari v1.28): kıyı ıslaklığı ve kostik Faz 7'ye, `forge.puddle` bileşeni + planar yansıma, tile akışı worker'da ve editörde, G8 collider eşleşmesi testle (World bağı Faz 6), WES `surface` örtüsü simülasyon süresiyle, `?debug` terrain haritası, öksüz tile `verify:assets`'te. Faz 6 bekler (kullanıcı kararı). Sıradaki: 5a adım 2 |
| 2026-11-15 | v1.26 | Faz 5a adım 2 tamam: terrain tile akışı — `engine/world/worldStreamingSubsystem` (5b'den öne), `engine/terrain/terrainRuntimeStreaming`, terrain worker'ı ve `render/resources/terrainWorkerPool`; global harita parçasıyla akış kararı (`render/resources/terrains`), `render/sync/terrainView` (Forge'un slot / yerleşim / kesim / etek kuralları, gölge ışıkları dahil), önbelleğin `track` / `busy`'si ile hazır olma. 19 A taşındı → **A 953 / 1.021** (5b'de ertelenmiş 25). Gerçek WebGPU render smoke'u 17 / 17; OpenWorldTest 26 / 256, Derekavak 29 / 64 tile okuyor. Mimari v1.29. Sıradaki: 5a adım 3 |
| 2026-11-15 | v1.27 | Faz 5a adım 3 tamam: terrain katmanları üretim kalitesinde — `render/materials/terrainLayerArray` (Forge'dan; katman başına açık çevirme, pürüzlülük paketleme), `render/materials/terrainDetail` (statik detay TSL), materyal: albedo + normal dizileri, alfa pürüzlülük, teğet uzayında katman normali, delik `maskNode`, half-float normaller, kalite kancaları. 10 R yeniden yazıldı; A 953 / 1.021 değişmedi. Render smoke'u gerçek WebGPU'da 17 / 17. Mimari v1.30. Sıradaki: 5a adım 4 (global harita ve `?debug` terrain haritası) |
| 2026-11-15 | v1.28 | Faz 5a adım 4 tamam (`af96fc2`): `?debug` terrain haritası (Forge'un `debugTerrainMap`'i, `render/viewer/debug`) ve okumada akış satırları; akışlar sahnedeki debug etiketinden (`render/sync/debugTags.ts`), anlık görüntü saf (`engine/terrain/terrainStreamingDebug.ts`). Global harita, kaplama ve ışın eşdeğerliği testleri: 8 R yeniden yazıldı. Hata: pick yüzeyi yüklenmemiş tile'da far map'i datum kadar aşağıda okuyordu, Forge gibi yerel çerçeveye alındı. A 953 / 1.021 değişmedi. Render smoke'u gerçek WebGPU'da 17 / 17. Mimari v1.31. Sıradaki: 5a adım 5 (collider eşleşmesi, G8) |
| 2026-11-15 | v1.29 | Faz 5a adım 5 tamam (`523f0fb`): G8 collider eşleşmesi. CPU ikizi `engine/terrain/terrainVisualHeight` (vertex gölgelendiricisinin karşılığı); Node testi ikizi Rapier heightfield'ıyla (tam çözünürlükte ≤ 0,05 mm). GPU: terrain materyalinin yükseklik sondası, `render/sync/terrainHeightProbe`, ölçüm `render/viewer/debug/terrainColliderMatch` (yalnız dev, `__forgeDev.terrainColliderMatch`), render smoke'u `terrainCollider.smoke.ts`: Derekavak / OpenWorldTest / Island tam çözünürlükte ≤ 2,9 mm, GPU = CPU ikizi ≤ 0,8 mm. Rapier Vite `optimizeDeps`'inde. World bağı Faz 6. A 953 / 1.021 değişmedi. Render smoke'u 20 / 20. Mimari v1.32. Sıradaki: 5a adım 6 (su birikintisi + içe aktarıcı) |
| 2026-11-15 | v1.30 | Faz 5a adım 6 tamam (`1e8fe09`): su birikintisi. **Kullanıcı kararları:** bileşenin dünya konumu = tohum + su seviyesi, bileşende `size`; yatak tohumun altındaki terrain (otomatik); rüzgâr WES `wind`'den adım 7'de; smoke dev kancasıyla, referans projesine dokunulmaz. `forge.puddle@1` (Forge'un alanları), saf modüller taşındı (havza doldurma, rüzgâr hareketi, dalgacık sektörleri: 3 A), render bağlaması (otomatik terrain, dilimli doldurma, önceki yüzeyi koruma, `PuddleStatusKey`), TSL su + `reflector()` seçimi (en çok 2, kalite tavanı), Details'te durum (SDK 0.1.11 `target()`), Add Actor, içe aktarıcı `puddleWaters` çeviricisi. **A 956 / 1.021.** Render smoke'u 21 / 21 (birikinti smoke'u: 117 m², çizim çağrısı 349 → 681), editör gerçek GPU'da 67 / 67. Mimari v1.33. Sıradaki: 5a adım 7 (WES kar / ıslaklık örtüsü + `wind`) |
| 2026-11-15 | v1.31 | Faz 5a adım 7 tamam (`ad024bd`): WES v2 migration, bağımsız örtü hedefleri ve simülasyon oranları, A7 ortak state, terrain kar / ıslaklık katkısı, geçici editör önizlemesi, level / WES rüzgârı ve Forge'un birikinti rüzgâr bloğu TSL'de, içe aktarıcı + değerleri denetleyen --compare. Kullanıcı kararları uygulandı; SDK 0.1.12. Kapı 2.101 test, 68 editör + 1 dist; gerçek WebGPU render 22 / 22, editör 68 / 68. A 956 / 1.021 değişmedi. Mimari v1.34. Sıradaki: adım 8 (öksüz tile ve 5a kapısı); 5a kutusu açık |
| 2026-11-16 | v1.32 | Faz 5a adım 8 teknik tamam: öksüz terrain parça denetimi `verify:assets` / `check:projects`, kalan 1 A taşındı (A 957 / 1.021); §2.10 ölçümü 25 / 25, en yüksek 1440p ortalama / p95 9,83 / 11,20 ms, yeni sekme Play 3,48 sn; kapı 2.106 test + 68 editör + 1 dist, gerçek WebGPU render 22 / 22 ve editör 68 / 68, G8 ≤ 2,93 mm. Görsel adaylar `smoke:grid#terrain-effects` içinde. Kullanıcı görsel kabulü bekleniyor; 5a kutusu açık ve arşivlenmedi. Mimari v1.35, SDK değişmedi (0.1.12). Sıradaki: görsel kabul, sonra 5b / 5c dökümü |
| 2026-11-16 | v1.33 | Kullanıcı Derekavak canlı görünümünü kabul etti; Island'da kamerayı izleyen koyu dörtgen: r187 takip gölgesinin ters derinlikte alt Z sınırı eksikti. `BoundedShadowNode` + CSM / takip kaynak geçişi; GPU'da boş harita farkı 36 → 0, gerçek kutu gölgesi korundu. Kapı 2.107 test + 68 editör + 1 dist (4 Vitest worker); render mevcut 22 + yeni 2 GPU regresyonu ve gerçek WebGPU editör viewport / ortam / Play 10 / 10. Island gerçek sahnede aynı pozun önce / sonra çekimi doğrulandı. SDK / A değişmedi; mimari v1.36. Island son canlı kabulü bekleniyor, 5a açık |
| 2026-11-16 | v1.34 | Kullanıcı kararıyla yalnız sistem: World Settings → Shadows genel anahtarı (`forge.light` içinde tekil `forge.shadowSettings@1`, yoksa açık), nesne tercihlerini koruyan render kapısı + kalite sınırı; ayrı Enable / Disable on Objects tek Undo, sınıf örneklerine override, yüklenmemiş hücrede atomik ret. Yeni şekil / model gölge varsayılanı açık kaldı. Sistem kurulumu Island verisine yazmadı; son karşılaştırmada düzenlenebilir kopyada 15:58'de kaydedilmiş 8 dosya güncellemesi görüldü (581 şeklin gölgesi açık), eşzamanlı kayıtlar korundu; asıl referans değişmedi. Kapı ikinci tam koşuda 2.113 test + 72 editör + 1 dist geçti; ilk koşudaki Content Browser silme / thumbnail 404'ü bağımsız ve tam tekrarda görülmedi, bu kapsamda kaynak / test beklentisi değiştirilmedi. Gerçek WebGPU yeni gölge testleri 4 / 4 (görüntü aç / kapa / geri dönüş, kalite, Undo, kayıt ve Play), tam render 24 / 24. SDK / A değişmedi; mimari v1.37. 5a son canlı kabulü açık |
| 2026-11-16 | v1.35 | Kullanıcı Faz 5a görsel kabulünü onayladı; Island son canlı kabulü dahil bekleyiş kapandı ve 5a Terrain kutusu işaretlendi. Mevcut teknik kapı / ölçüm kayıtları korundu; yeni test koşusu veya referans görüntü yenilemesi yapılmadı. A 957 / 1.021, SDK 0.1.12 değişmedi; mimari v1.38. 5b–5d ve Faz 5 toplu kapısı açık; Faz 5 bölümü arşivlenmedi. Sıradaki: 5b / 5c dökümü ve kararları |
| 2026-11-16 | v1.36 | Faz 5b dökümü ve kararları (kullanıcı): menziller level ayarında (`viewDistance`, `loadRange` 384 m), HLOD level klasöründe + `forge hlod` komutu, mesafe LOD 5b'den çıktı (meshlet hattı konuşulacak), kapı sentetik büyük level'da `measure:streaming`; runtime / editör hücre akışı, residency, detay culling (hücreye bölünmüş batch), World Partition paneli A11'in uygulaması. 11 adım, Codex adımları işaretli (2, 7, 9, 10 ve test dilimleri). Ertelenen 25 A; kod yok; mimari v1.39 |
| 2026-11-16 | v1.37 | Faz 5b ilerlemesi HEAD `63815f9`'a kadar doğrulandı: adım 1 `65b5efd`; 2 saf modüller + HLOD `4cef956` (25 A, A 982 / 1.021); 3 ayarlar / UI / kamera / içe aktarıcı `89b6a87`, `de8654d`; 4 runtime hücre akışı `c7a5174`, 32 aktör / 3 ms / 16 MiB `63815f9`; 5 kaynakların 30 sn sonra atılması `045964c`; 9 HLOD build `d8676b4`, runtime çizimi `dddd81b`, Mesh dispose olayı `63815f9` (editör adım 6'yı bekler); 10 üretici `f202569`, ölçüm düzeneği `63815f9`. Mevcut son JSON: ilk uçuş p99 / max 9,4 / 57,7 ms (20 / 50 ms; max aşıyor), sıcak dönüş 10 / 31,1 ms; kararlı döngü sayaçları eşit, harness heap artışı %0,91. Ölçüm kabulü AÇIK; pipeline derlemesi hipotez, compileAsync ön ısıtma yalnız öneri. Adım 6, 7, 8, 11 ve 5b kutusu açık; arşiv yok. Yeni test / gate / ölçüm yok; mimari v1.40 |
| 2026-11-17 | v1.38 | Faz 5b adım 6–7 ve editör HLOD uygulandı: kısmi oturum / atomik ret / kirli hücre tutma / canlı tazeleme, Outliner WP sekmesi ve harita; Codex çekirdek ve panel diff'leri incelendi. TSL detay fade geometri ve gölgede; hücre bölmesi 398 → 713 draw call nedeniyle kullanıcı onayıyla geri alındı ve 5c öncesi G6 / meshlet spike'ına bırakıldı. Kullanıcı onaylı compileAsync batch hazırlığı ve HLOD hazır olma bağı; async GPU nesne ömrü, render target / MRT geri yükleme, statik isteğe bağlı HLOD ve kısmi Compare regresyonları düzeltildi. Tam gate'in Vitest 2.215 / başsız editör 76 adımları geçti; dist düzeltme sonrası 1 / 1; son değişiklikler odaklı test / tip kontrolüyle. Gerçek WebGPU editör 76 / 76, render 23 + odaklı 2 / 2 (25 kontrol); referans görüntüler yenilenmedi. A 982 / 1.021, SDK 0.1.12 değişmedi. Nihai streaming ölçümü ve kullanıcı HLOD / fade görsel kabulü açık; 5b kapatılmadı, arşiv yok. Mimari v1.41 |
| 2026-11-17 | v1.39 | Faz 5b adım 10 ölçümü geçti: temiz a6f3521 (kod 1e1c987), 50.000 aktör / 1.024 hücre, gerçek WebGPU 1080p high DPR 1 uncapped. 2026-11-17T07-06-57-259Z-streaming.json: ilk uçuş p99 / max 13,3 / 35,1 ms, dönüş 13,8 / 36 ms; 10 döngü ve 32 sn bekleyiş sonrası aktör / önbellek 2.583 / 63, kararlı GPU 216 / 30, heap artışı %0,34 (sınır %5). API derleme sayaçları kaydedildi; saf derleyici / nedensel kanıt değil. Kaynak atma sayacı 0 sınırı korunur. Teknik kontroller ve ölçüm geçti; kullanıcı HLOD / detay fade görsel kabulü bekliyor, 5b kutusu açık ve arşiv yok. Hücre bölmesi 5c öncesi G6 / meshlet spike'ında; push yapılmadı. Mimari v1.42 |
| 2026-11-17 | v1.40 | Faz 5c dökümü ve kararları (kullanıcı, "hepsi öneri gibi"): önce G6 / meshlet spike'ı (kod commit'lenmez), `forge.foliageType` asset'i, terrain aktöründe `forge.landscapeFoliage`, boyanmış foliage level parçası `foliage/<x>_<z>.bin`, bütün türlerde ve kaskatlarda compute culling + indirect, önce çalışma anı billboard'u, `forge.plantFamily` + `forge.plant`, içe aktarıcı çeviricileri, `measure:foliage`. 11 adım, Codex adımları işaretli. Adım 3 (Codex, Claude inceledi): `foliageRing` 8 A → **A 990 / 1.021**, prosedürel üretim saf modülleri, 25 odaklı test geçti; tam gate yok. Adım 2 spike'ı (kod commit'lenmedi): G6 gönderim sınırı foliage'sız statiklerle aşılıyor (2,9–3,1 ms); meshlet r187'de ters derinlikle devreye girmiyor; statikler + foliage `BundleGroup`'ta 1,81 ms gönderim / 2,31 ms ana iş parçacığı. Karar (kullanıcı): GPU culling + indirect + render bundle, statiklere de; meshlet ve hücre bölmesi reddedildi. Adım 3 ve 8'in kodu `c03f40d`. Adım 8'in saf çekirdeği ve kaya üreticisi (Codex) 24 testle. Mimari v1.43 |
| 2026-11-17 | v1.41 | Faz 5c adım 4: `forge.foliageType@1`, `forge.landscapeFoliage@1`, eşleyici (şema varsayılanı = Forge varsayılan türü), boyanmış foliage level parçası `foliage.json` + `FFOL` v1 hücre dosyaları ve asset dizini denetimleri (`3706bc4`); 518 core + 5 feature testi, tip / katman / `verify:assets` geçti, SDK değişmedi. Kalan: içe aktarıcı çeviricileri (Codex kotası bitti, Claude yapacak). Adım 5 tasarımı: görünüm başına compute culling, kaskatlar `layers` ile ayrı dolaylı mesh, tek `BundleGroup`, kendi draw call sayacı; alt adımlar 5.1–5.6. Mimari v1.43 |
| 2026-11-17 | v1.42 | Faz 5b: editörde otomatik HLOD üretimi (`0c16852`): WP panelinde Auto Generate HLOD + Generate / Rebuild / Save and Generate, beş durum ve son rapor; dev server'da proje başına kuyruk (`/__forge/hlod`), ayrı Node worker, `.forge-cache/hlod` tazelik önbelleği, kilitli atomik yayımlama / geri alma, canlı proxy yenileme. Claude incelemesinde foliage parçaları izlemeden çıkarıldı, durum mesajları İngilizce, okunmuş yayımlama proxy'leri yeniden düşürmez. Odaklı Vitest 96 / 96, başsız editör 78 / 78, gerçek WebGPU alt küme 11 / 11; tam gate yok. Kullanıcı Derekavak kabulü ve 5b görsel kabulü açık. Mimari v1.44 |
| 2026-11-17 | v1.43 | Faz 5c adım 4 kalanı: içe aktarıcı foliage çeviricileri (`cbad9d5`): `forge.foliageType` asset'leri (modelini getirir), terrain'de `forge.landscapeFoliage`, boyanmış gruplar (bölünmüş hücreler dahil) `foliage.json` + `.bin`; kayıt servisi `forge.levelFoliage/1`. Odaklı Vitest 78 + içe aktarıcı 11, tip / katman / dosya bütçesi / `verify:assets` geçti; geçici kopyada `--dry-run` Derekavak 7 kural / 6 tür. Referans projesi yeniden alınmadı. Sıradaki: adım 5.1 |
| 2026-11-17 | v1.44 | Faz 5c adım 5.1 (`9deff0c`): GPU güdümlü çizimin temeli `render/gpu/` (örnek storage buffer'ı ve kararlı tutamaçlar, reset / cull / args compute, LOD × parça × materyal grubu başına `drawIndexedIndirect`, `overrideNodes` ile örnek matrisi, dither fade), host ana görünümü kareden önce ayıklar, `?debug` dolaylı çizimleri sayar; CPU referansı `engine/world/instanceCulling.ts` + Node testi. Gerçek WebGPU smoke'u: Derekavak P2 foliage 370 hücre / 1.640 örnek, P2 / P1 / gökyüzü 177 / 32 / 0 görünür, GPU = CPU birebir, +9 draw. Açık soru: WebGL2 test arka ucu geri dönüşü (5.5 öncesi). Sıradaki: 5.2 kaskat görünümleri |
| 2026-11-17 | v1.45 | Faz 5c adım 5: WebGL2 test arka ucu için GPU güdümlü batch'in CPU ikizi (kullanıcı kararı, `2544bdb`): CPU referansı ayıklar, örnekli mesh çizer, aynı arayüz; sayaç saydam çift yüzlü materyalin iki geçişini sayar (P2 15 çizim). Smoke iki arka uçta geçti; mimari v1.45. 5.2 başka oturumda planlanıyor, bu oturumda başlanmadı |
| 2026-11-17 | v1.46 | Faz 5c yeni sıra (kullanıcı): 5.2 durduruldu; draw call ve üçgen ayrı. R1 HLOD'a `forge.shape` (kullanıcı kararı), R2–R4 = 5.2 kaskatlar / 5.3 bundle / 5.4 foliage, R5 sahne maliyet raporu (ajan komutu + editör Stats), R6 üçgen spike'ı (three-virtual-geometry, r187 meshlet hattının ters derinlik kopyası, 5.1 + ayrık LOD; kod commit'lenmez), R7 seçilen yolun üretimi, R8 hiyerarşik HLOD + siluet katmanı, R9 = 5.5, R10 = 5.6. three-nanite elendi. Kod yok; mimari v1.46 |
| 2026-11-17 | v1.47 | Faz 5c R1: HLOD'a `forge.shape`: three'siz primitive üreticisi `engine/procgen/shapePrimitives.ts` + three geometrisiyle eşitlik testi, yerleşim / `sourceHash` / tazelik damgası primitive + renk içerir, düzlem iki yüzlü; Derekavak 22 hücre, OUT-001 proxy'de. Odaklı Vitest 64, hlod + streaming smoke başsız ve gerçek WebGPU 5 / 5. Kullanıcı Derekavak kabulü açık; sıradaki R2 |
| 2026-11-17 | v1.48 | Faz 5c R2 (5.2): GPU güdümlü batch'ler gölge kaskatlarına çizer: görünüm başına kaynak, gölge görünümü kendi katmanında, örnek dönüşümü `castShadowPositionNode`, solma `maskShadowNode`, mesafe ana kameradan; WebGL2 ikizi aynı. Smoke iki arka uçta: her kaskatta GPU = CPU, `?debug` +60 (15 × 4 görünüm), gölge görüntüyü değiştirir. Sıradaki R3 bundle |
| 2026-11-17 | v1.49 | Faz 5c R3 (5.3): isteğe bağlı bundle (`bundle: true`, kamera başına kayıt, yeniden kayıt yalnız mesh / görünüm değişince, saydamlar dışarıda) + `npm run measure:gpu-driven`. Kazanç yok (foliage 1,54 → 1,49 ms, 1.200 draw'lık stres 20,2 → 21,7 ms): three r187 düğüm materyalli render nesnelerini her karede tam yeniler; varsayılan kapalı, kullanıcı kararı bekliyor. Sıradaki R4 |
| 2026-11-17 | v1.50 | Faz 5c R4 (5.4): `render/foliage/foliageBatches.ts`: foliage türü başına GPU güdümlü batch (LOD zinciri, kalite ölçekli solma, ekran boyundan LOD, gölge), sahip anahtarlı örnek API'si (halka adım 6, boyanmış hücreler adım 7 buna bağlanır); smoke iki arka uçta bu katmandan. Sıradaki R5 |
| 2026-11-17 | v1.51 | Faz 5c R5: `npm run forge -- stats` sahne maliyet raporu (aktör, model / materyal birleşimi, kaynak üçgen, saydam / çift yüzlü, batch ve görünüm / kaskat başına draw, foliage, HLOD); editör Stats üçgenine GPU güdümlü batch'ler (eşzamansız geri okuma). Derekavak 118 draw / görünüm, 21.360 üçgen; sentetik 182 draw, 40,4 M üçgen. Sıradaki R6 |
| 2026-11-17 | v1.52 | Kullanıcı görsel kabulleri onayladı: 5b HLOD / detay fade + otomatik HLOD, 5c R1 Derekavak şekil proxy. 5b kutusu kapandı; Faz 5 bütünü açık, arşiv yok. Referanslar yenilenmedi, yeni test / gate yok. R6 başladı; R7 karar bekler. |
| 2026-11-17 | v1.53 | R6: gerçek WebGPU P2 ve 25,8 M üçgen stres; VG / ters derinlikli r187 meshlet / 5.1 + meshoptimizer LOD, bundle ve WebGL2 ikizi. Ayrı RAF ile PassNode ölçüm sorunu giderildi; geçersiz ilk koşular dışarıda. Yoğun FrontSide statik meshlet + diğerlerinde ayrık LOD fallback önerisi karar bekliyor. Spike kodu commit edilmedi; kayıt render-refs/runs/2026-11-17-r6-triangles.json. R7 başlamadı. |
| 2026-11-17 | v1.54 | Kullanıcı R6 önerisini onayladı: yoğun uygun tek yüzlü statiklerde ters derinliğe uyarlanmış r187 meshlet; diğer materyallerde / WebGL2’de otomatik ayrık LOD; foliage mevcut 5.1 yolunda. Terrain meshlet dışında, occlusion ilk sürümde kapalı. Önceki genel meshlet reddi bu kapsamda geçersiz; R7 yeni oturumda başlayacak, üretim kodu yok. |
| 2026-11-17 | v1.55 | Kullanıcı meshlet'i şimdilik üretimden çıkardı; v1.54 hibrit seçimi tarihsel kaldı. Devam eden R7 otomatik LOD / cache / build / runtime kapsamına daraltıldı; meshlet'e özel kod ayrımı geliştiren oturumun işi, bu belge değişikliği kod temizliği yapmadı. R6 kanıtları korundu. Bağımsız konservatif GPU occlusion culling R9a olarak R9 sonrası / R10 öncesi tasarım + ölçüm / yararlıysa üretim işi şeklinde eklendi. Occlusion uygulanmadı; yanlış gizleme, gölge, ters derinlik ve net maliyet kapıları yazıldı. |
| 2026-11-17 | v1.56 | R7 otomatik LOD üretim altyapısı tamamlandı: deterministik Node cache / build, tarayıcı worker, ekran hatasıyla seçim, seçilebilir 5.1 GPU / WebGL2 CPU bağı; genel statikler R9'a kadar değişmedi. Meshlet'e özel üretim dosyaları ve pipeline bağı kaldırıldı; R6 dört kaynak hash'i kayıtla eşit. Küçük / kazançsız LOD, materyal grupları, CPU picking, fade / yerel transform, kaynak ömrü, iptal / compileAsync / HLOD hazır olma korundu. 21 odaklı test, typecheck, katman; ilgili render alt kümesi 7 / 7. Odaklı production build ve ayrı worker paketi geçti; dist tarayıcı smoke'u çalıştırılmadı. Dar P2 ek nesne ölçümünde native = Stats 438 draw, 40 dolaylı; bundle 16 replay / 0 yeniden kayıt; render / compute ayrı. G6 açık, son R6 3,03 ms. v1.55'in R9a kararı korundu; R8 / R9 / R9a / R10 başlamadı. Kod 134b2aa; docs ayrı commit, push ve tam gate yok. |
| 2026-11-17 | v1.57 | R8 kararları (kullanıcı): bundle kapalı kalır, R10 öncesi yeniden ölçülür; HLOD proxy'leri GPU güdümlü yola girmez (tek örnekli, indirect kazanç yok); slot düzeyinde kayıpsız primitive birleştirme (atlas sonra); 4 × 4 ikinci katman, geçiş `max(2 × loadRange, 6 × hücre)`; bileşen landmark işareti ve far genişlemesi. Uygulama sırası R8.0–R8.6. Kod yok |
| 2026-11-17 | v1.58 | R8.0 (`af30c37`): proxy normalleri `weld`'i engelliyordu; konum + renk, düz gölgeleme, çift yüzlüler ayrı; Derekavak HLOD 21.360 → 5.366 üçgen. R8.1 (`018c559`): şablon başına slot birleştirme (çalışma anında; cache / build türevi gerekmedi), Derekavak 118 → 15 draw / görünüm, P2 gönderim 0,711 → 0,53 ms, render smoke 29 / 29. R8.2 / R8.3 (`82c0150`): `forge.levelHlod/2` küme katmanı (`hlod/l1_<x>_<z>.glb`), çalışma anı geçişi + histerezis; Derekavak 4 küme / 1.372 üçgen; editör HLOD / akış 5 / 5 gerçek WebGPU. R8.4–R8.6 açık |
| 2026-11-17 | v1.59 | R8.4 landmark (`landmark` bileşen alanı, `landmarkDistance` level ayarı; far genişlemesi yerine köşeler far'ın içine çekilir, kaskat / culling değişmez), R8.5 rapor (`forge stats`, editör HLOD satırı), R8.6 ölçüm: Derekavak P2 sahne draw 398 → 68, gönderim 0,711 → 0,455 ms; StreamingBench HLOD 3,37 M → 1,64 M üçgen, uçuş p99 / max 8,5 / 43,6 ms. Kullanıcı görsel kabulü açık; R9 sırada |
| 2026-11-17 | v1.60 | R8 kapandı (kullanıcı görsel kabulü). R9 bulguları (R7 bağı açılmamış; yapısal değişim batch'i yeniden kurar; birleşmiş slot LOD önbelleğini ıskalar; uygun olmayan parça hata verir), kararlar (batch başına yol seçimi, ölçümle eşik; birleşmiş slot LOD'u parça zincirlerinden) ve sıra R9.0–R9.5. Kod yok |
| 2026-11-17 | v1.61 | R9.1 / R9.2 (`7724d18`; `mergeTriangleLods` Codex), R9.3 / R9.4 (batch başına yol, uygun olmayan parça instanced, LOD kökü çerçevelemenin dışında), R9.0 ölçümü (`measure:static-path`): GPU yolu dört level'da da kazandırmadı (Derekavak gönderim 0,41 → 1,21 ms), LOD önbelleği 117 / 1. Host varsayılanı `instanced`; yol kararı ve ikincil kamera culling'i açık |
| 2026-11-17 | v1.62 | R9 kapandı (kullanıcı): statikler `instanced`, GPU güdümlü yol foliage'da; yeniden ölçüm ağır / çok örnekli içerikte, dispatch birleştirme ayrı karar; R9.5 düştü. İkincil kamera görünümleri (yansıma kendi culling listesi + sayaç) R9a'nın ilk adımı. Mimari v1.59 |
| 2026-11-17 | v1.63 | R9a adım 1 (`ef12079`): kamera görünümleri (`gpuDriven.add`), görünüm rolü / katmanı (ana görünüm katman 9), yansıma = ana görünümün aynası (`mirrorCullView`); render smoke 29 / 29, yansıma görünümü iki arka uçta CPU referansıyla. Mimari v1.60 |
| 2026-11-17 | v1.64 | R9a occlusion çalışması (`5058c7b`): CPU Hi-Z referansı (`engine/world/hiZ.ts`, Codex), dev çalışma ölçümü `measure:occlusion`; Derekavak foliage üçgeninin en çok %0–21'i örtülü (iyimser sınır). Öneri: üretime alınmaz, R10'a geçilir; kullanıcı kararı bekliyor. Mimari v1.61 |
