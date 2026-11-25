# Forge WebGPU — Mimari Analiz ve Başlangıç Kararları

**Güncelleme:** v1.78 · 2026-11-25 — §4.4 5d adım 5: spline mesh'leri terrain tanımından çalışma anında üretilir (saklanmaz, statik batch, HLOD proxy'si yok); spline düzenleme ve seçimi; `EditableTerrain.splinesChanged`.

**Önceki güncelleme:** v1.77 · 2026-11-20 — §4.4 5d: `details: "embedded"` (tool aktöründe bileşenin kendi bölümü yok, tool'un eki düzenler); Auto Paint kuralları Landscape Mode > Paint > Auto Paint'te; tool aktörünün Details'i Name'siz.

**Önceki güncelleme:** v1.76 · 2026-11-20 — §4.4 5d: bileşen sunumunda `details: "tool"` (SDK 0.1.14): aktörün Details'i ad, bileşenin eki, öteki bileşenler, en altta kapalı bileşen alanları; yerleşim denetimleri yok. World Terrain bunu kullanır (kullanıcı kararı).

**Önceki güncelleme:** v1.75 · 2026-11-20 — §4.4 5d adım 4: World Terrain asset olarak hemen yazılır, Expand oturumda tek undo (yeni / silinecek tile), taşıma tanımın origin'ini aktörle kaydırır (su Faz 7), heightmap içe / dışa yalnız editörde (kullanıcı kararları).

**Önceki güncelleme:** v1.74 · 2026-11-19 — §4.4 5d adım 3: katman boyama ve katman işlemleri (tek undo), `forge.landscapeAutoPaint` bileşeni (kullanıcı kararı), editöre özel terrain görünüm kipleri.

**Önceki güncelleme:** v1.73 · 2026-11-19 — §4.4 5d uygulaması (adım 2): `TerrainEditingKey` + asset başına `TerrainEditSession`, editör oturumunda level dışı undo adımı ve kayıt katılımcısı.

**Önceki güncelleme:** v1.72 · 2026-11-19 — §4.4 5d kararları: fırça araçları yalnız editörde (ajan veri yüzeyleriyle), sculpt / paint CPU'da + bölge yüklemesi, darbe başına undo, Mesh Paint kapsam dışı, yol mesh'leri CPU'da bake, PG5 son araç adımı.

**Önceki güncelleme:** v1.71 · 2026-11-19 — §4.7 Faz 6 kararları: alt fazlar 6a–6e, iskele / legacy faz kapısında silinir, birinci şahıs genel parçalarla (motorda FPS kipi yok), Player Start kalıcı katmanda, UI widget editörü şemalı JSON + HUD yerleşimi (K12 kapandı), karakter pilotu FPS Sandbox.

**Önceki güncelleme:** v1.70 · 2026-11-19 — §4.4 PG3: yüzey dokusu tarifi (kabuk, kaya) de KTX2; impostor bake'i üretilmiş yüzey dokusunu tarifinden yeniden bake eder.

**Önceki güncelleme:** v1.69 · 2026-11-19 — §4.4 / §4.9 PG3: üretilmiş atlaslar KTX2 (`forge generate`), impostor yuvasında `color`, mevsimsel uzak temsil odun / yaprak ayrımı (PK7 ölçümü); §4.5 bağımsız `.ktx2` doku asset'i; kapı ölçümü `measure:forest`.

**Önceki güncelleme:** v1.68 · 2026-11-19 — §4.4 uzak foliage (5c F3): blok host'u, tür başına PG3 impostor batch'i, GLB türü için çalışma anı CPU bake'i, terrain'e uzak ton; uzak temsil kararı PG3 biçimine güncellendi (kullanıcı).

**Önceki güncelleme:** v1.67 · 2026-11-18 — §4.4 bitki dilimi (PG2): GPU güdümlü batch'e örnek başına shading kancası (rüzgâr, bitki tepkisi), dünya başına ortak bitki çizimi, tekil `forge.plant` foliage yolunda; WES zamanlı mevsim geçişi.

**Önceki güncelleme:** v1.66 · 2026-11-18 — §4.6 asset modeli (PG1): meta `generated` kaydı, `forge.model` `collision`, `forge.material` `projection` / `variation`; prosedürel çıktı `forge generate` ile kalıcı asset.

**Önceki güncelleme:** v1.63 · 2026-11-18 — §4.4 foliage halkası (5c F1): `forge.foliage` render bağlaması, terrain yüzey kaydı, bağlamaya GPU güdümlü batch'ler, JSON asset belgesi.

**Önceki güncelleme:** v1.62 · 2026-11-18 — §4.4 R9b: statiklerin varsayılan yolu `auto` (ağır parça GPU yolunda); occlusion culling iptal, yerine bölge sistemi (bölge / portal, portal görünürlüğü, instanced batch bölge bölmesi, GPU yolunda örnek başına bölge maskesi, otomatik üretim, editör).

**Önceki güncelleme:** v1.61 · 2026-11-17 — §4.4 R9a occlusion çalışması: CPU Hi-Z referansı ve üst sınır ölçümü; kazanç düşük, üretim önerilmiyor.

**Önceki güncelleme:** v1.60 · 2026-11-17 — §4.4 R9a adım 1 uygulandı: kamera görünümleri, görünüm rolü / katmanı, yansıma aynalanmış görünüm.

**Önceki güncelleme:** v1.59 · 2026-11-17 — §4.4 R9 kararı: statik batch'ler varsayılan instanced (GPU yolu ölçümde kazandırmadı); ikincil kamera görünümleri R9a'nın ilk adımı.

**Önceki güncelleme:** v1.58 · 2026-11-17 — §4.4 R8.0–R8.3 uygulandı: normalsiz proxy, çalışma anı slot birleştirme, `forge.levelHlod/2` küme katmanı.

**Önceki güncelleme:** v1.57 · 2026-11-17 — §4.4 R8 draw call kararları.

**Önceki güncelleme:** v1.56 · 2026-11-17 — §4.4 R7 seçilebilir otomatik LOD / worker / cache / build bağı uygulandı. Meshlet'e özel üretim kodu kaldırıldı, R6 araştırması korundu. v1.55 R9a occlusion kararı değişmedi; uygulanmadı.

**Önceki güncelleme:** v1.45 · 2026-11-17 — §4.4 5c: WebGL2 test arka ucunda GPU güdümlü batch'in CPU ikizi (kullanıcı kararı). Plan v1.45.

**Sürüm:** v1.37 · 2026-11-16 (v1.36’dan fark: World Settings sahne gölge anahtarı, `forge.shadowSettings@1`, nesne tercihlerini koruyan render kapısı ve tek Undo ile toplu nesne gölgesi işlemleri; Island içeriği değiştirilmez). v1.36 · 2026-11-16: §4.9 Island takip gölgesi — ters derinlikte eksik alt Z sınırı, `BoundedShadowNode`, CSM / takip haritası kaynak geçişi ve gerçek GPU regresyonu. v1.35 · 2026-11-16: §4.9 öksüz terrain parça denetimi, §4.10 terrain performans ölçümü ve görsel kabul adayları (Faz 5a adım 8).

**Önceki sürümler:** v1.34 · 2026-11-15 (v1.33’ten fark: §4.9 Faz 5a adım 7 — WES v2 örtü / rüzgâr ve A7 state, terrain katkısı, birikinti rüzgârı TSL; §4.4 settings.wind; kullanıcı kararları; SDK 0.1.12). v1.33 · 2026-11-15 (v1.32’den fark: §4.9 Faz 5a adım 6 — su birikintisinin uygulaması ve kullanıcı kararları; §4.3 Details eklentisine `target()`, SDK 0.1.11). v1.32 · 2026-11-15 (v1.31’den fark: §4.9 Faz 5a adım 5 — G8: görsel yüksekliğin CPU ikizi, terrain materyalinin yükseklik sondası ve yalnız dev’deki GPU ölçümü). v1.31 · 2026-11-15 (v1.30’dan fark: §4.9 Faz 5a adım 4 — `?debug` terrain haritası, panelin sahnedeki debug etiketleri, pick yüzeyi terrain’in yerel çerçevesinde). v1.30 · 2026-11-15 (v1.29’dan fark: §4.9 Faz 5a adım 3 — terrain katman dizileri, alfa pürüzlülük, katman normali, statik detay, delik maskesi, kalite kancaları). v1.29 · 2026-11-15 (v1.28’den fark: §4.9 Faz 5a adım 2’nin uygulaması — terrain akışının sahibi şimdilik render bağlaması (Faz 6’da fizikle paylaşılan alt sisteme), worker havuzu render katmanında, akış çekirdeği 5b’den öne alındı, hazır olma `track` / `busy`). v1.28 · 2026-11-15 (v1.27’den fark: §4.9 Faz 5a kararları, kullanıcı onayı — kıyı ıslaklığı ve kostik Faz 7’ye, `forge.puddle` bileşeni + `reflector()` yansıması, terrain tile akışı (worker, editör, frustum), G8 collider eşleşmesi testle, WES `surface` örtüsü simülasyon süresiyle, `?debug` terrain haritası, öksüz tile `verify:assets`’te). v1.27 · 2026-11-15 (v1.26’dan fark: §4.3 oyunun editör tarafı uygulandı (INV-A32): dev server projenin `editor.ts`’lerini `virtual:forge/game-editors` ile editöre verir, hatalı olan editörü dosya adıyla durdurur; §4.10 editör smoke tam seti (Faz 4 kapısı) ve gerçek GPU’daki koşusu `npm run smoke:editor:webgpu`). v1.26 · 2026-11-15 (v1.25’ten fark: §4.6 süreçler arası kayıt kilidi, ortak authoring modülü, dosya olayları (`forge:files`); §4.11 A12 uygulaması — `forge edit` komutları, ortak işlemler `src/engine/edit`, editörün canlı tazelenmesi; kullanıcı kararları 2026-11-15). v1.25 · 2026-11-15 (v1.24’ten fark: §4.6 Play uçları ve 409 akışının uygulaması — alan düzeyinde üç yönlü birleştirme, oturum tabanı, `compare` / `rebase`, Reload ve birleştirme undo geçmişini temizler (kullanıcı kararları); §4.7 Play oturum katmanının uygulaması). v1.24 · 2026-11-14 (kullanıcı kararı: WES + prosedürel bitki ortak sözleşmesi; bitki ailesi, tekil aktör / foliage eşitliği, zaman / mevsim / örtü sahipliği ve 5c bağı; yalnız plan, uygulama yok). v1.23 · 2026-11-14 (v1.22’den fark: §4.3 assetEditors / assetPreviews sözleşmeleri (SDK 0.1.10); §4.11 A13 uygulaması — ortak asset oturumu ve sanal tablo, tek canvas / GPU önizlemesi, sınıf uyumluluk koruması ve kaynak nesli yönetimi). v1.22 · 2026-11-14 (v1.21’den fark: §4.8 motor içeriği kipinin uygulaması — kayıtlı kökler için ayrı kayıt politikası, Content Browser ve level kayıt yönlendirmesi, etiketli 409 / hücre dizini yolları, sınıf tazeleme ve geçici içerikle kabul). v1.21 · 2026-11-14 (v1.20'den fark: §4.3 bir özelliğin editör tarafı `defineFeatureEditor` (Outliner görünüşü, Add Actor girişleri, Details eklentileri; SDK 0.1.5–0.1.7); §4.4 aktörün editöre özgü `locked`'u (kullanıcı kararı); §4.7 paneller: gizleme yalnız görünüm, Details'in şemadan formu ve override'ları, düzenleme işlemleri, gruplama ve pano (kullanıcı kararları 2026-11-14).
v1.20 · 2026-11-14 (v1.19'dan fark: §4.4 aktörün editöre özgü `pivot`'u (kullanıcı kararı); §4.7 gizmo'nun uygulaması (three'siz sürükleme, tek transaction, instancing hızlı yolu); §4.9 gizmo katmanın son pass'i.
v1.19 · 2026-11-14 (v1.18'den fark: §4.2 editör yardımcı bağlamaları (`defineEditorRenderBinding`, `forge.editorHelpers`); §4.9 çizim katmanının uygulaması (sahne derinliği, derinlik ön geçişi, ton eşlemesiz bileşim) ve picking etiketleri.
v1.18 · 2026-11-13 (v1.17'den fark: §4.8 build'in uygulaması (kullanıcı kararı: Faz 4): statik içerik, `ContentClient`, alt dizin.
v1.17 · 2026-11-13 (v1.16'dan fark: §4.7 editör World'ü (`inEditor`, kullanıcı kararı) ve `actorsChanged`'ın kesin biçimi, çocuk silme kuralı.
v1.16 · 2026-11-13 (v1.15'ten fark: Faz 4 tasarımı (kullanıcı kararları) — §4.2 editörün 3B kodu `src/render/editor/` ve rol `features/*/editorRender.ts`; §4.7 editör oturumu: `actorsChanged`, Forge'un gizmo'su, Play oturum katmanı, grup, hücreler; §4.8 motor içeriği kipi; §4.9 çizim katmanı ve küçük resimler; §4.10 editör smoke'ları; §4.11 ajan komutlarının yolu, okuyan komutlar, canlı tazeleme, asset editörleri.
v1.15 · 2026-11-13 (v1.14'ten fark: Faz 3 adım 9 ve kapanış — §4.9 yönlü
ışıklar dünya çerçevesinde (`CSMShadowNode`'un koşulu); §4.10 smoke tam seti Faz 0
pozları ve çözünürlüğüyle, yan yana ızgara, kabul edilen referanslar.
v1.14 · 2026-11-13 (v1.13'ten fark: Faz 3 adım 8 — §4.9 görüntüleyicinin
uygulaması (instancing, terrain salt çizimi, kamera, `?debug`); §4.6 veri belgesi
başvuru yolları ve katman materyali GUID; §4.8 paket manifesti `requires`
(kullanıcı kararları).
v1.13 · 2026-11-13 (v1.12'den fark: Faz 3 adım 7 — §4.9 olay
bazlı gün saatinin uygulaması: `transitionTo` (`Promise<boolean>`, hep ileri;
kullanıcı kararları), Sky Light yakalaması aynı PMREM'e, ölçülen yakalama hızı
(açı + 0,1 sn + durunca son yakalama; kullanıcı kararı).
v1.12 · 2026-11-13 (v1.11'den fark: Faz 3 adım 6 — §4.9 pipeline
uygulaması: plan + tek `RenderPipeline`, MRT sondası, çıktı dönüşümü bağlamalardan
önce (`ctx.output` salt okunur), renderer `antialias: true` (MSAA yalnız
pipeline'sız çizimde), kullanıcı kararları: gökyüzü kubbesi Post Process altında,
SSGI AO'nun yerine.
v1.11 · 2026-11-13 (v1.10'dan fark: Faz 3 adım 5 — §4.9 çevrenin
uygulaması: arka plan / ortam ışığı `forge.skyLight`'ta (kullanıcı kararı),
gökyüzü varken ACES (kullanıcı kararı), WES yorumu ve bağlama `ctx`'inin
`environment` / `output` / `capture` alanları, `WorldEnvironmentKey`.
v1.10 · 2026-11-13 (v1.9'dan fark: Faz 3 adım 4 — §4.5 isteğe
bağlı renk; §4.6 şemalı JSON asset türünün ve `forge.material` / sürüm 2
türlerin uygulaması, kullanıcı kararları (boş tint, `enabled` grupları,
`name` / preset, `materialSlot` her slota); §4.9 materyalin uygulaması (slot
düğümleri, katkı sırası, doku / materyal anahtarları).
v1.9 · 2026-11-13 (v1.8'den fark: §4.6 statik gölge varsayılanları
bileşen başına (kullanıcı kararı); §4.9 ışık ve gölgenin uygulaması.
v1.8 · 2026-11-13 (v1.7'den fark: §4.9 kalitenin uygulaması —
Cinematic merdiven dışı `cinematic` seviyesi, runtime kalite sürücüsü,
`applyQualityToPostProcess` adım 6'da.
v1.7 · 2026-11-13 (v1.6'dan fark: Faz 3 adım 1'in uygulama
notları — §4.3 / §4.9 `render.ts`'leri uygulama girişi toplayıp render host'a
verir (`render` katmanı `features/`'ı import edemez), kural
`feature-does-not-name-render`; §4.9 bağlama bağlamı, kaynak anahtarları, GUID
→ URL ucu, hazır sinyali, varsayılan ışık; §4.10 smoke'un aday / kayıt düzeni.
v1.6 · 2026-11-12 (v1.5'ten fark: Faz 3 render tasarımı, kullanıcı
onayı — §4.3 `render.ts`'i render host toplar, `feature.ts` render'ı anmaz;
§4.6 şemalı JSON asset türü ve `forge.material`, `forge.model` / `texture` /
`staticMesh` sürüm 2; §4.7 boot'un `render` aşaması ve render senkronu; §4.9
renderer host, GUID anahtarlı kaynak önbelleği, render bağlaması sözleşmesi,
kalite merdiveni ve pipeline profilleri, MRT bütçesi, ışık / çevre bileşenleri,
olay bazlı gün saati, cihaz kaybı; §4.10 render regresyon smoke'u.
v1.5: 2b kayıt oyunu ve World
Partition kararları, kullanıcı onayı — §4.4 tek dünya ızgarası ve 2b / 5b
ayrımı, §4.6 `forge.saveGame/1`, §4.8 A7'nin uygulaması: `persist` alanları,
bileşenin `state` bölümü, `defineSaveState`, yüklenmemiş hücrelerin durum
defteri.
v1.4: 2b içe aktarıcı kararları,
kullanıcı onayı — §4.4 yerleşim → aktör çevirisi World Builder ve içe
aktarıcıda ortak, §4.6 üç yalnız-şema ikili asset türü ve içe aktarılan
asset'lerin köken eşlemesi, `LicenseRef-forge-unverified`.
v1.3: 2b `tools/world` kararları — §4.4 World Builder çıktısının dört
bileşeni ve kökenin nesnelere taşınması, §4.6 veri belgeleri ve terrain'in
metasız parçaları. v1.2: ürün tezi ve kapsam ölçütü
(§0.0, kullanıcı kararı); A12 ajan düzenleme komutları, A13 genel veri editörü;
§4.11 ajan ve insan yüzeyi. v1.1: §4.10 belge düzeni —
`docs/architecture/ARCHITECTURE.md` bu rapordan kısa harita, rapor karar kaynağı
kalır; Faz 2a kapandı, plan ayrıntısı arşivde. v1.0: 2a depo düzeni kararları —
§4.8 `contentPacks`, etiketli içerik kökleri, motor içeriği ve paketlerin
proje dizininde salt okunur yeri, paket bağımlılık yönü. v0.9: 2a oyun projesi
sözleşmesi kararları — §4.8 manifest, SDK yüzeyi ve sürüm kuralı, API anlık görüntüsü
aracı, başlatıcı, dev server'da proje seçimi, `create-project`,
`check:projects`. v0.8: 2a uygulama kabuğu kararları —
§4.3 `defineFeature.subsystems`, §4.7 alt sistem sözleşmesi çekirdekte, World
yaşam döngüsü, tick grupları, sahne kurucu, oyun modülü, boot ekranı.
v0.7: 2a kayıt servisi kararları — §4.6
günlüklü atomik kayıt, sunucunun yazdığı dizin, dosya başına temel revizyon,
sunucuda şema doğrulaması, ikili sahneleme, yazma yalıtımı ve localhost
koruması, düzenleme modeli ve sürümlü kirli takibi; 50.000 aktör ölçümü.
v0.6: 2a hücre veri modeli kararları —
§4.4 level klasörü, ızgara ayarı, `spatiallyLoaded`, atama kuralı, dizin ve
revizyon, dosyalar arası bütünlük; §4.6 asset dizininde level klasörleri.
v0.5: 2a asset modeli kararları — §4.4
override sürüm etiketi ve kısmi veri geçiş sözleşmesi, §4.5 metin alan türü,
§4.6 meta dosyası, asset türü kaydı, dizin ve önbellek, §4.2 Node modülü kuralı.
v0.4: A10 ve A11 karara bağlandı; §4.4
hücre kuralları ve §4.6 asset kimliği yazıldı. v0.3: belge incelemesi — açık
kararlar A10 asset modeli ve A11 hücre / akış modeli eklendi; A4 satırı A3'e göre
düzeltildi; §4.6'da bileşen kimliği A1'e göre düzeltildi. v0.2: A1–A9
kararlaştırıldı; A3 katman zorlaması TS proje referansları yerine
dependency-cruiser + öz-test oldu; bileşen hiyerarşisi, `defineSaveState`, SDK
API snapshot'ı, içerik paketleri ve PIE'ye hazır kurallar eklendi)
**Durum:** §8'deki A1–A11 kararları 2026-11-10'da, A12–A13 2026-11-11'de
verildi. Belge Forge-WebGPU deposunda; Forge'daki kopya donduruldu.
**İlişkili:** [FORGE_WEBGPU_REBUILD_PLAN.md](FORGE_WEBGPU_REBUILD_PLAN.md) (faz
sırası), [FORGE_GAME_PROJECT_WORKFLOW.md](file:///C:/Users/emret/Desktop/Forge/docs/planned/FORGE_GAME_PROJECT_WORKFLOW.md)
(Model 2; Forge deposunda: `C:\Users\emret\Desktop\Forge\docs\planned\FORGE_GAME_PROJECT_WORKFLOW.md`).
**Amaç:** Forge WebGL'de sonradan fark edilip düzeltilen kararları kanıtlarıyla
çıkarmak ve yeni motorun başlangıcını bunları baştan doğru yapacak şekilde
tanımlamak. Kısa harita [`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
bu rapordan türetildi (2026-11-11).

---

## 0.0 Ürün tezi ve kapsam ölçütü (kullanıcı kararı, 2026-11-11)

Forge WebGPU, bir AI ajanıyla **büyük** oyun yapmak için kurulan bir motordur.
Tek istemle üretilen oyunlar devam ettirilemez: sahne değiştirilemez, bağlam
büyür, token tükenir. Bu motor iki şeyi birlikte sağlar:

1. **İnsan, istem yazmadan müdahale eder.** Level editörü, aktör / prefab
   editörü, Details, Content Browser, terrain / foliage / boya araçları, ortam
   ve görünüm ayarları; oyunun kendi verisi (ekonomi, denge, tablolar) için
   genel veri editörü (A13). Oyuna özel düzenleme arayüzü yazdırılmaz.
2. **Ajana hazır sistem verilir, daha az token harcar.** Kanonik ve küçük
   dosyalar, şemadan JSON Schema, alan yolu gösteren hatalar, `forge check`, SDK
   yüzeyi ve özellik README'leri; yapılandırılmış düzenleme komutları (A12).
   İnsanın editörde yaptığı değişiklik kanonik dosyada küçük bir diff olarak
   görünür; ajan bütün sahneyi değil diff'i okur.

**Kapsam ölçütü.** Bir özellik motora yalnız şu durumda girer:

- insanın istemsiz, görsel olarak düzenleyeceği bir şeyse (ayak 1), ya da
- hedef türdeki (açık dünya) oyunların çoğunun ihtiyaç duyduğu, ajanın her
  oyunda sıfırdan yazmasının pahalı ya da hataya açık olduğu bir runtime
  sistemiyse (ayak 2);
- ve her durumda ayarları şemalıysa (insan formdan, ajan JSON'dan değiştirir).

Girmeyenler: yalnız Unreal'de olduğu için var olan, insan tasarımcının grafik
üzerinde yazdığı araçlar (ajan için doğru ortam kod, insan için ayar formu);
tek bir oyuna özgü sistemler (oyun deposunda kalır); "ileride lazım olur" diye
taşınan kod (Forge `forge-webgl-final` etiketinde durur, bir oyun isteyince
dikey özellik modülü olarak gelir). Eski oyunların (ThreeAges vb.) kullanımı
ölçüt değildir. Bu ölçütle verilen kapsam kararları plan §8 K12'de.

## 0. Özet — on doğru düğme

1. **Tek tip aktör + bileşen veri modeli.** Level'da türe özel diziler yok; her
   şey kimlikli bir aktör ve şemalı bileşenleri.
2. **Şema kaydı tek doğru kaynak.** Bir bileşen ya da asset türü şemasını bir
   kez tanımlar. Yükleme, kayıt doğrulaması, varsayılanlar, Details formu,
   undo ve sürüm geçişi bu şemadan türer.
3. **Her şeyin baştan kalıcı kimliği (GUID) var;** referanslar kimlikle kurulur.
4. **Dikey özellik modülleri.** Bir özellik tek klasördür (şema / runtime /
   render / editör) ve çekirdeğe kayıt noktalarından bağlanır. Kabuk dosyası
   büyümez.
5. **Tek sahne kurma yolu.** Editör viewport'u, editör Play'i ve bağımsız oyun
   aynı kurucuyu kullanır.
6. **Katman sınırları gerçek AST ve TypeScript çözücüsüyle zorlanır**
   (dependency-cruiser + kasıtlı ihlal fixture'ıyla öz-test), regex taramasıyla
   değil.
7. **İşlemsel kayıt servisi:** sürümlü kirli takibi, sıralı ve atomik çok dosyalı
   kayıt, temel sürüm çakışma kontrolü.
8. **Genel SDK.** Oyun projeleri motorun yalnız `@forge/sdk` yüzeyini import
   eder; oyun çatısı (game mode, kamera, araç girişi…) motorun parçasıdır.
9. **Motor deposunda "kendi oyunu" yok.** Örnekler dış proje biçimindedir;
   testler değişmez fixture projeleri kullanır.
10. **Açık dünya ve akış baştan temel model.** Level = kalıcı katman + hücreler;
    editör de akışla çalışır.

---

## 1. Yöntem ve kanıt kaynakları

- Forge `main` @ `b2efc208` kod ölçümleri (satır sayıları, import grafiği,
  özellik başına dosya dağılımı).
- Git geçmişi: 1.302 commit, mesaj temalarına göre kaba sınıflandırma.
- `Forge-Archive`'deki düzeltici planlar: `FORGE_RUNTIME_EDITOR_PARITY_PLAN`,
  `CHARACTER_CAPSULE_SOURCE_OF_TRUTH_PLAN`, `STATIC_SKELETAL_MESH_COMPONENT_SPLIT_PLAN`,
  `EDITOR_UI_SLICING_PLAN`, `ENGINE_TESTS_SPLIT_PLAN`, `FORGE_RELIABILITY_ACTIVE_PLAN`.
- [Kapsamlı inceleme, 2026-10-21](file:///C:/Users/emret/Desktop/Forge/docs/reports/FORGE_KAPSAMLI_INCELEME_2026-10-21.md)
  (F01–F15; Forge deposunda: `C:\Users\emret\Desktop\Forge\docs\reports\FORGE_KAPSAMLI_INCELEME_2026-10-21.md`).
- Ridgebound deposu (salt okunur): `tools/forge.mjs`, `tsconfig.json`,
  `src/game`, `docs/FORGE_INTEGRATION.md`.
- `CLAUDE.md`'deki kayıt / allowlist tuzakları ve oturum hafızasındaki tuzak
  notları.

Commit teması sayıları anahtar kelime eşleşmesidir; kesin değil, eğilim
göstergesidir.

---

## 2. Forge'da sonradan düzeltilen düğmeler

| # | Ne oldu | Kanıt | Kök neden |
|---|---|---|---|
| D1 | **Tanrı nesneleri** | `SceneApp` 16.379, `RuntimeSceneApp` 7.184, `EditorUi` 5.402, `tools/engine-tests.ts` 29.975 satır (~870 kontrol tek dosyada), `saveValidator.ts` 4.640, `specialActorDetails.ts` 2.397. Dilimleme planları (EDITOR_UI_SLICING, ENGINE_TESTS_SPLIT) sonradan açıldı. "split/slice/extract" geçen 110, "refactor" geçen 71 commit | Özelliklerin bağlanacağı kayıt noktası yoktu; her özellik kabuk sınıfına eklendi |
| D2 | **Özellik yatay dağılıyor** | Height Fog 8 alanda 16 dosya; Puddle Water 19, Blocking Volume 15, Cloud Layer 14 dosya (`engine/scene`, `render-three`, `world`, `src/scene`, `src/editor`, `panels`, `tools`) | Katmanlar var, özellik modülü yok |
| D3 | **Türe özel level dizileri** | `RoomLayout`'ta 23 türe özel alan: 6 tekil (sky, fog, cloud, reflection, post, WES) + 17 dizi (lights, reflectionPlanes, blockingVolumes, splines, landscapes, riverWaters, oceanWaters, characters, actors…). Bileşenli `actors[]` bunların yanında ikinci bir varlık dünyası | Unreal'ın "her şey aktör" modeli yerine her yeni tür için yeni dizi |
| D4 | **Doğrulayıcı ≠ yükleyici** | 8 ayrı kayıt allowlist yüzeyi; 20'den fazla ayrı `/__save-*` ucu; `spatiallyLoaded` 7 ayrı doğrulayıcıda elle kopyalanıyor; `validateAssetSkeletonDef` yükleyiciyi elle taklit ediyor; düşen alan ağı (`droppedFields`, Faz G) sonradan eklendi. "allowlist/validator" geçen 80 commit | Alan tanımı tek yerde değil; her katman kendi kopyasını tutuyor |
| D5 | **Kimlik sonradan** | Runtime kimliği `actor:<index>` düzenlemede yeniden numaralanıyor → `saveEntityKeys` çeviri katmanı; placement `id` / `role` sonradan; `ensureActorIds` yüklemede kimlik basıyor. Kimlik temalı 165 commit | Kalıcı GUID ilk günden yoktu |
| D6 | **Sürüm geçişi yok** | Eski `*.landscape.json` → "not supported" hatası, geçiş yolu yok; eski `MeshRenderer` geriye dönük yaşıyor; 1×1 köprü K1–K5 ile söküldü. "legacy/bridge/remove" geçen 135 commit | Şema sürümü + geçiş zinciri yoktu |
| D7 | **Editör ≠ oyun** | `FORGE_RUNTIME_EDITOR_PARITY_PLAN`: landscape RTS Play'de görünmedi, materyal değişikliği oyuna yansımadı, VFX için ayrı entegrasyon gerekti; çözüm her seferinde oyun uygulamasına ek kod | Sahne iki ayrı yoldan kuruluyordu |
| D8 | **Çift doğru kaynak** | Kapsül ölçüsü hem `Collider` hem `CharacterMovement` içinde authored (CHARACTER_CAPSULE_SOURCE_OF_TRUTH_PLAN) | Türetilen değer ikinci kez yazılıyordu |
| D9 | **Kayıt yarışları, çok dosyalı tutarlılık** | F01: kayıt yanıtı daha yeni değişikliğin dirty işaretini siliyordu; çakışan kayıtlarda terrain özeti bayatlıyor (`terrain:repair`); hücre kaydı sıralama kuralları; JSON gövde sınırı iki kez yükseltildi | Kayıt bir işlem (transaction) olarak tasarlanmadı |
| D10 | **Açık dünya sonradan** | World Partition sonradan eklendi; editör bütün hücreleri yüklüyor; runtime'da yalnız Actor Script aktörleri akıyor, gerisi hevesle (eager) kuruluyor | Akış temel model değil, ek katmandı |
| D11 | **Bileşen taksonomisi sonradan** | `MeshRenderer` → Static / Skeletal Mesh Component ayrımı (STATIC_SKELETAL_MESH_COMPONENT_SPLIT_PLAN) | Bileşen türleri baştan Unreal'a göre ayrılmadı |
| D12 | **Shader yaması yığılması** | `onBeforeCompile` 16 dosyada; aynı materyale world mask, foliage fade, rüzgâr, AO, dent wear yamaları sırayla ekleniyor | Materyal birleştirme sözleşmesi yoktu |
| D13 | **Sınır denetimi regex'le** | F02: çok satırlı import'lar kaçtı, gerçek bir `engine → src` ihlali gizli kaldı | Denetim derleyiciye değil metin aramasına dayanıyordu |
| D14 | **Testler düzenlenebilir içeriğe bağlı** | F03: browser fixture'ları varsayılan sahneye bağlı; dev server demo layout'u kendiliğinden yazıyor; fork'un dev sunucusu aynı portta Forge rotalarına cevap verdi (smoke artık 5273'te) | Motor deposu aynı zamanda bir oyun projesiydi |
| D15 | **Motor içeriği ile proje verisi karışık** | `public/` hem motorun başlangıç içeriği hem örnek projenin verisi; kökte boş `game/` ve `project/` yer tutucuları, oyun kodu `src/game`'de | Sahiplik klasör düzeninde ifade edilmedi |
| D16 | **Asset kökeni** | F04: 876 asset'in 810'unda lisans `Unknown`; `assetType: "effect"` sonradan, eski manifestlerde ek adına göre tahmin | İçe aktarmada köken ve tür zorunlu değildi |
| D17 | **Teşhis ve dağıtım sözleşmeleri** | F06 kök URL'leri alt dizine yayını bozuyor; F09/F10 bozuk veri ve erken boot hataları kullanıcıya ulaşmıyor; takılı "loading level" ekranı aslında görünmeyen bir yükleme hatasıydı | Hata yüzeyi ve dağıtım tabanı baştan tanımlanmadı |
| D18 | **Belge ve kod ayrışıyor** | F13; `CLAUDE.md`'nin yarısı tuzak ansiklopedisi (8 allowlist yüzeyi paragrafı) | Tuzaklar tasarımla kaldırılmak yerine belgelendi |

Ortak desen: kayıt noktası, şema ve kimlik baştan tanımlanmadığı için her yeni
özellik var olan büyük dosyalara eklendi; sonra sözleşme ihtiyacı fark edilince
geriye dönük köprü, çeviri katmanı ve tuzak notu üretildi.

---

## 3. Model 2 (oyun projesi) — durum ve boşluklar

### 3.1 Belge güncel mi?

**Mekanik olarak evet.** `FORGE_GAME_PROJECT_WORKFLOW.md` P2 kapanışını
(2026-11-01) doğru anlatıyor. Anlattığı araçlar yerinde: `tools/run-game-project.mjs`,
`tools/projectPaths.ts`, `builder/web/game-project-build.mjs`,
`game-project-reproduce.mjs`, `sync-forge-to-games`. Ridgebound bu düzenle M0
oyun kurallarını ve Derekavak greybox sahnesini geliştirdi (son commit
2026-11-07).

Eskimiş küçük kısımlar:
- §2.2–2.3 yerleşim örneği hâlâ `Games/Offroad` diyor; proje Ridgebound oldu.
- §2.5 "bilinen sınırlar" (2026-10-25) tarihsel; P1-A/B/C ile kapandı.
- `tools/create-project.mjs` hâlâ yok (belge bunu doğru söylüyor).

### 3.2 İşleyişteki yapısal boşluklar

1. **Genel API yok.** Ridgebound'un 926 satırlık oyun kodu Forge'dan 19 ayrı iç
   modül import ediyor: `@/scene/capabilities/runtimeServiceKeys`,
   `RuntimeContext`, `ForgeGameModule`, `@engine/scene/entity`,
   `@engine/persistence/saveGameState`… Forge'da yapılan bir yeniden
   düzenleme, Forge'un kapılarından geçip oyunu kırabilir.
2. **Oyun çatısı yanlış yerde.** Forge'un `src/game` klasörü (29 dosya, 5.189
   satır) aslında yeniden kullanılabilir oyun çatısı: TPS karakter modu, araç
   modu, araç girişi, RTS kamerası, oyuncu kamera yöneticisi, spring arm,
   ragdoll, player controller. Ridgebound bunlardan 7'sini kütüphane gibi
   import ediyor. "Fork başına oyun kodu" diye ayrılan yer fiilen motor kodu.
3. **Uyumluluk kapısı yok.** `build:verify` ve CI Ridgebound'u derlemiyor.
   Kırılma ancak oyun açıldığında görülüyor.
4. **Kaynak haritası ihtiyacı.** Ridgebound'un `FORGE_INTEGRATION.md`'si ajan
   için Forge'un iç dosya yollarını listeliyor. Tanımlı bir SDK olmadığı için
   gerekli; ama her Forge yeniden düzenlemesinde bayatlıyor.
5. **Sabit bağlantı yolu.** Başlatıcı `FORGE_ROOT` / `forge.local.json`
   destekliyor, ama Ridgebound'un `tsconfig.json`'u `../../Forge/tsconfig.json`
   yolunu sabit kodluyor.
6. **Oyun kendi tipli verisini tanımlayamıyor.** Görev kaydı gibi oyuna özel
   durum, şemalı bir bileşen olarak değil genel `ScriptState.persist` →
   `flags` alanında taşınıyor; kayıt doğrulayıcısı Forge'un `tools/` klasöründe
   ve oyun şemasını bilmiyor.

Model 2'nin özü doğru: tek canlı motor kaynağı, oyunda motor kopyası yok, motor
değişikliği motor deposunda. Yeni projede eksik olan, bu özün **sözleşmeye
bağlanması**: SDK, oyun çatısının motora alınması, oyunun kendi şemalarını
kaydedebilmesi ve uyumluluk kapısı (§4.8).

---

## 4. Önerilen mimari

### 4.1 Üç eksen

- **Katmanlar (yatay):** kim kimi import edebilir (§4.2).
- **Özellik modülleri (dikey):** bir özelliğin bütün parçaları tek klasörde
  (§4.3).
- **Sözleşmeler:** veri modeli (§4.4), şema kaydı (§4.5), kayıt servisi (§4.6),
  SDK (§4.8).

### 4.2 Katmanlar ve bağımlılık kuralı

| Katman | İçerik | Import edebileceği | three |
|---|---|---|---|
| `core` | aktör/bileşen modeli, şema kaydı, serileştirme, kimlik, olaylar, özellik kayıt noktaları | — | yok |
| `engine` | fizik (Rapier), terrain verisi, World Partition, nav, hareket, ses, kalıcılık, World Builder algoritmaları; DOM ve Web Audio yok, düz Node'da yüklenir (2b kararı 2026-11-11) | core | yok |
| `render` | WebGPU renderer, render bağlamaları, materyaller, pipeline, teşhis | core, engine | **tek sahip** (`three/webgpu`, `three/tsl`) |
| `runtime` | World, sahne kurucu, alt sistem ana makinesi, oyun modülü ana makinesi, boot; tarayıcı API'si gereken alt sistem kodu (ör. Web Audio, DOM UI) | core, engine, render | dolaylı |
| `gameplay` | oyun çatısı: game mode tabanları, player controller, kamera yöneticisi, araç girişi, ragdoll (bugünkü `src/game`'in çoğu) | core, engine, runtime | yok |
| `editor` | editör uygulaması; yalnız dinamik import; oyun bundle'ına girmez | hepsi | dolaylı |
| `sdk`, `editor-sdk` | oyun projelerinin import edebildiği tek yüzey (yeniden dışa aktarım) | ilgili katmanlar | — |
| `tools` (Node) | dev server, kayıt uçları, build, World Builder CLI, içe aktarıcı | core, engine | yok |

**Zorlama (A3 kararı, 2026-11-10):** katman kurallarının tek kaynağı
dependency-cruiser'dır; AST ve gerçek TypeScript çözücüsüyle çalışır, regex
taraması yok (D13). Kurallar yola ve dosya rolüne göre yazılır (ör. `core/**` ve
`features/*/schema.ts` three, render ve editör import edemez; `three/webgpu` /
`three/tsl` yalnız `render/**` ve `features/*/render.ts`'te). Tip kontrolü iki
tsconfig'le yapılır: uygulama (tarayıcı) ve Node araçları (`tools/`).

- **Neden katman başına TS projesi değil:** dikey özellik klasörü (§4.3) dört
  katmana yayılır; katman başına composite proje, her rolü glob'la projelere
  dağıtmayı, projeler arası `.d.ts` çözümünü ve declaration çıktısını gerektirir.
  Yeni bir dosya rolü eklemek tsconfig düzenlemeye dönüşür; kabuk dosyasının yerini
  tsconfig'ler alır.
- **Öz-test:** kapı, kasıtlı ihlaller içeren bir fixture'a karşı da çalışır (çok
  satırlı import, `export * from`, dinamik `import()`, `import type`) ve hepsinin
  yakalanmasını bekler. F02'nin dersi: denetleyici sessizce geçerse kimse fark
  etmez.
- İhlal IDE'de değil push öncesi kapıda ve CI'da görünür.
- `src/**` Node modülü (`node:fs` vb.) import edemez (`src-no-node-builtins`,
  2a): çekirdek tarayıcıda da yüklenir; diski okuyan iş `tools/`'tadır.

Tek npm paketi, katmanlar klasör. npm workspaces / ayrı paket yayını yok
(Model 2'nin "motor paket release sistemi kapsam dışı" kararıyla uyumlu).
**A4 kararı (2026-11-10):** kökte tek `package.json` ve tek `node_modules`;
iki tsconfig (uygulama + Node araçları; katman sınırı A3'e göre dependency-cruiser'da);
`@forge/sdk` takma adı tsconfig `paths` ve Vite alias'ıyla. Tek `node_modules`, A8'deki "her şey motorun bağımlılıklarından
çözülür, ikinci three kopyası yok" kuralını doğal olarak sağlar. İleride paketleme
gerekirse paketlenecek sınır katmanlar değil, SDK yüzeyidir (A8 API snapshot'ı).

- **Editörün 3B kodu (Faz 4 kararı, 2026-11-13):** three'yi yalnız render katmanı
  görür kuralı editörde de geçerli. Çizim katmanı, gizmo çizimi, picking, ızgara,
  seçim çerçevesi, küçük resim ve önizlemeler `src/render/editor/`'da; onu yalnız
  editör (dinamik import) yükler, oyun build'ine girmediğini dist kapısı denetler.
  `src/editor` DOM ve servistir, three'siz. Özelliğe özgü yardımcı çizim (ışık
  ikonu, hacim, kamera) yeni rol `features/*/editorRender.ts`: three ve editör
  görür, `feature.ts` ve `render.ts` onu anmaz, editör host'u toplar. Kural ve
  kasıtlı ihlal fixture'ı dikey dilimde (Faz 4 adım 2). *Uygulama (adım 3,
  2026-11-14):* `editorRender.ts` `defineEditorRenderBinding({ feature, create })`
  döner (`render/editor/editorBinding.ts`); editör onları glob'la toplar, viewport
  editör World'ünde tek `forge.editorHelpers` alt sistemiyle (`inEditor`) çalıştırır,
  render bağlamaları gibi (`actorsAdded` / `actorsRemoved` / `actorsChanged` / `sync`).
  Bağlam: dünya görünümü, çizim katmanındaki kök, seçim, `sceneVisibility`, Forge'un
  billboard ikonları. Bir yardımcının çizdiği aktörünü taşır; picking'de yardımcılar
  önce gelir (sahnenin üstünde çizilirler).

### 4.3 Dikey özellik modülü

```text
features/height-fog/
  schema.ts     # bileşen şeması — three'siz, Node'da da yüklenir
  runtime.ts    # alt sistem / capability — three'siz
  render.ts     # render bağlaması — three/webgpu yalnız burada
  editor.ts     # özel araç veya Details (yoksa şemadan otomatik)
  feature.ts    # defineFeature({ id, components, assetTypes, saveStates, subsystems })
  height-fog.test.ts
  README.md     # 5–10 satır: amaç, şema, kayıt noktaları
```

Çekirdek kabuk yalnız kayıt noktaları sunar: `registerComponent`,
`registerSubsystem`, `registerRenderBinding`, `registerAssetType`,
`registerEditorMode`, `registerDetails`, `registerAddActorEntry`.

- **Bir özelliğin editör tarafı (Faz 4 adım 5, kullanıcı kararları 2026-11-14):**
  `features/<ad>/editor.ts` `defineFeatureEditor({ feature, components, addActor,
  details })` döner (`@forge/editor-sdk`; oyunlar da aynısını kullanır). `components`:
  bileşenin Outliner'daki Forge ikonu ve tür grubu (aktör, editörün tanıdığı ilk
  bileşeniyle görünür). `addActor` (`registerAddActorEntry`'nin karşılığı): Add Actor
  girişleri — kategori, ikon, yeni aktörün bileşenleri (saklanan biçim, varsayılanları
  normalize doldurur) ve Forge'un yerleştirme kuralı (dönüş, yüzeyden yükseklik, taban
  yüzeye oturur); tekil bileşenli giriş yalnız tıklanır. `details`
  (`registerDetails`'in karşılığı): bileşenin şemadan formunun altına gelen DOM (ör.
  Ground Mist Setup, World Environment önizlemesi); düzenlemesi `edit` ile (seçili her
  aktöre tek undo adımı), önizlemesi editör World'ünün servisleriyle, level'a hiç
  yazmadan. Editör host'u `features/*/editor.ts`'leri Vite glob'uyla toplar.
  *Oyunun editör tarafı (Faz 4 adım 10, INV-A32):* oyun da `defineFeatureEditor`'ü
  `editor.ts` dosyasından döndürür (projenin kökünde ya da `src/` altında; `forge
  check` `@forge/editor-sdk`'yı yalnız bunlarda ve `src/editor/`'da kabul eder). Oyun
  onları anmaz: dev server bulur ve editöre `virtual:forge/game-editors` ile verir
  (yalnız `npm run dev`; build'de boş liste, oyun paketine girmez); sunucu açıkken
  eklenen ya da silinen dosya sonraki açılışta görünür. Editör onları motorunkilerle
  aynı listeye katar (Outliner, Add Actor, Details, New, sürükle-bırak, asset
  pencereleri); özellik editörü olmayan ya da editörün çalıştırmadığı özelliği anan
  dosya editörü dosya adıyla durdurur. Oyunun kendi Add Actor kategorisi Forge'unkilerden
  sonra gelir.
  *Faz 5a adım 6 (SDK 0.1.11):* Details eklenti bağlamına `target()`: birincil
  seçili aktörün kimliği ve bileşenin anahtarı; eklenti bir dünya servisine o
  bileşeni sorabilir (birikintinin doldurma sonucu).
  *Adım 7 (SDK 0.1.10):* `assetEditors` asset türüne göre ortak pencere
  sunumu, önizleme anahtarı, form yerine araçların ele aldığı alan yolları
  (`handledFields`) ve DOM araç eklentisi kaydeder. Eklenti bağlamı taslak,
  şema / katalog, yazma izni, `edit` ve three'siz `AssetPreviewController`
  verir. `editorRender.ts` isteğe bağlı `assetPreviews` fabrikaları yayımlar;
  mevcut varsayılan helper kaydı korunur. Materyal / model önizlemesini kendi
  özelliği, çekirdek aktör sınıfını yerleşik adaptör kaydeder.

- **`feature.ts` editörü anmaz (2a kararı, 2026-11-10):** `editor.ts` kendi
  kayıt birimidir; editör katmanındaki `defineFeatureEditor(...)` ile kendini
  tanımlar ve editör host'u `features/*/editor.ts` dosyalarını kendisi toplar.
  Oyunun import grafiğinde `editor.ts` hiç geçmediği için üretim çıktısı yapı
  gereği editörsüzdür ve çekirdek editör tiplerini bilmek zorunda kalmaz.
  `feature.ts` içinde `editor: () => import("./editor.ts")` katman kuralından
  geçse de Rollup her `import()` için oyun build'ine parça dosyası yazdığı için
  reddedildi. Statik import `editor-only-dynamic`, statik ve dinamik her
  gönderme `feature-does-not-name-editor` kuralıyla yakalanır; ikisinin de
  fixture'da ihlali vardır (`features/fog/feature.ts`, `features/rain/feature.ts`).
- `defineFeature` çekirdekte yaşar ve yalnız çekirdeğin tipleyebildiği alanları
  taşır: `id`, `components`, `assetTypes`, `saveStates`, `subsystems` (alt
  sistem sözleşmesi çekirdekte, onu çalıştıran World `src/runtime`'da).
- **`feature.ts` render'ı da anmaz (Faz 3 kararı, 2026-11-12):** `render.ts`
  editör deseniyle kendi kayıt birimidir: `defineRenderBinding({ feature, create })`
  ile kendini tanımlar; `features/*/render.ts` dosyalarını uygulama girişi
  (`main.ts`, Vite glob) toplayıp render host'a verir, çünkü `render` katmanı
  `features/`'ı import edemez (Faz 3 adım 1; oyun projesi: aynı desen, ilk
  ihtiyaçta Faz 6'da). Kural `feature-does-not-name-render`, kasıtlı
  ihlalleri `features/snow` (statik) ve `features/hail` (dinamik). Gerekçe: `check:projects` ve araçlar `feature.ts`'i Node'da
  yükler, başsız açılışta World render'sız çalışır; `feature.ts` render.ts'i
  anarsa three/webgpu Node'a ve başsız açılışa girer. Statik ve dinamik her
  gönderme bir katman kuralıyla yakalanır (kasıtlı ihlal fixture'ında).
- **Node'da yükleme (2a kararı, 2026-11-10):** depo genelinde göreli import'lar
  `.ts` uzantılı yazılır (`allowImportingTsExtensions` taban tsconfig'te);
  `src/core` ve `features/*/schema.ts` Node'da yükleyici ya da bundle adımı
  olmadan çalışır. `npm run verify:node-load` bunu gerçek Node yüklemesiyle
  kanıtlar. Çekirdek `import.meta.env` okumaz; ortam ayrımını çağıran verir.

- **Hedef:** yeni bir özellik = bir klasör, 4–6 dosya, kabukta sıfır değişiklik.
  Bugün Height Fog: 8 alanda 16 dosya (D2).
- Dosya boyutu bütçesi: 800 satırda uyarı, 1.500'de kapı (üretilmiş dosyalar
  hariç). Tanrı nesnesinin geri büyümesini erken yakalar (D1).
- Oyunlar aynı API ile kendi özelliklerini oyun deposunda tanımlar (§4.8).

### 4.4 Veri modeli: tek tip aktör + bileşen

```jsonc
{
  "schema": "forge.level/1",
  "id": "lvl_7f3c…",
  "actors": [
    {
      "id": "act_91ab…",            // kalıcı GUID
      "name": "Exponential Height Fog",
      "class": null,                 // ya da bir aktör sınıfı asset'inin GUID'i
      "parent": null,
      "transform": { "p": [0, 0, 0], "r": [0, 0, 0, 1], "s": [1, 1, 1] },
      "components": {
        "fog": { "type": "forge.heightFog@1", "density": 0.02, "falloff": 0.2 }
      }
    },
    {
      "id": "act_c204…",
      "name": "Reference Car",
      "class": "ast_5e1d…",           // aktör sınıfı (prefab) GUID'i
      "parent": null,
      "transform": { "p": [12, 0, 4], "r": [0, 0, 0, 1], "s": [1, 1, 1] },
      "overrides": { "driver": { "targetSpeed": 18 } }  // yalnız farklar
    }
  ]
}
```

```jsonc
// aktör sınıfı içinde bileşen hiyerarşisi (Unreal SceneComponent karşılığı)
"components": {
  "chassis": { "type": "forge.collider@1", "parent": null,
               "local": { "p": [0, 1, -0.04] }, "shape": "box", "size": [2.08, 1.52, 4.08] },
  "body":    { "type": "forge.staticMesh@1", "parent": "chassis",
               "local": { "s": [1.6, 1.6, 1.6] }, "mesh": "ast_…" },
  "driver":  { "type": "forge.vehicleAiDriver@1", "targetSpeed": 14 }
}
```

- **Bileşen hiyerarşisi (A1 kararı):** bileşenler aktör içinde yerel kimlikle
  (haritanın anahtarı) tutulur. Uzamsal bileşenler `parent` (aynı aktördeki
  başka bir bileşenin yerel kimliği; `null` = aktör kökü) ve yerel transform
  (`local`) taşır; uzamsal olmayan bileşenlerde bu alanlar yoktur. Forge'un
  `*.actor.json` sınıflarındaki `root → chassis → body` zinciri böylece alt aktör
  gerektirmeden taşınır.
- Override yolu `bileşen kimliği + alan`dır; kimlik yerel olduğu için sınıfa
  bileşen eklemek / sıralamak override'ları kaydırmaz.
- Işık, su, landscape, spline, blocking volume, ortam tekilleri: hepsi aktör.
  Tekillik (level başına bir WES gibi) şemada bir bayrakla ifade edilir.
- Aktör sınıfları (bugünkü `*.actor.json`) prefab'dır: level'daki aktör sınıfa
  GUID ile bağlanır ve yalnız farkları (override) taşır; override kuralı şemada
  tanımlıdır.
- **Override kuralı v1 (2a kararı, 2026-11-10):**
  - Aktör sınıfı belgesi `forge.actorClass/1`'dir: `id` (asset GUID'i), `name`,
    `components`. Level normalize sınıfı bir çözücü fonksiyonla alır; çözücüyü
    asset dizini (A10) sağlar.
  - Sınıflı aktör `components` taşımaz, yalnız `overrides`; sınıfsız aktör
    tersine. Sınıflı aktör bileşen ekleyip çıkaramaz.
  - Sınıf bileşeninin her alanı ve uzamsal bileşenin `local`'ı override
    edilebilir; `type` ve `parent` edilemez. Override alanın tam değerini taşır.
  - Sınıf değerine eşit override yazılmaz; boş bileşen girdisi yazılmaz.
  - Sınıf bulunamazsa asılı referanstır (geliştirmede hata, üretimde rapor);
    override'lar denetlenmeden korunur.
  - **Override sürüm etiketi (2a kararı, 2026-11-10):** her override girdisi
    sınıf bileşeninin tür etiketini taşır:
    `"overrides": { "driver": { "type": "forge.vehicleAiDriver@1", "targetSpeed": 18 } }`.
    `type` override değil damgadır; kayıt her zaman güncel etiketi yazar,
    etiketsiz girdi güncel sürüm sayılır. Eski sürümlü girdi bileşenin geçiş
    zincirinden kısmi veriyle geçer; etiketteki ad sınıf bileşeninin türünden
    farklıysa (sınıf aynı yerel kimliğe başka bileşen koymuş) girdi raporlanıp
    düşer; daha yeni sürüm desteklenmez. Zarf (`local`, `parent`) geçişe girmez.
  - **Kısmi veri sözleşmesi:** bir geçiş adımı alanların herhangi bir alt
    kümesini alabilir; yalnız elindeki anahtarları dönüştürür, olmayan bir
    anahtardan yeni anahtar üretmez (yeni alan varsayılanını normalize'da
    alır). `defineComponent` (ve asset türlerinde `defineAssetType`) her adımı
    `{}` ile çalıştırır; fırlatan ya da tanımlı değer döndüren adım tanımda
    reddedilir. Sınır: iki alanı birleştiren adım, override'ın taşımadığı
    alanın sınıf değerini göremez.
  - Reddedilenler: bildirimsel yeniden adlandırma listesi (yalnız ad
    değişikliğini kapsar; değer dönüşümü eski override'a sessizce yanlış
    uygulanır) ve sınıf sürüm atlayınca override'ları Node aracıyla toplu
    yeniden yazmak (yine eski sürümü bilmeyi gerektirir, oyun deposundaki
    level'ları kaçırır).
- Statik mesh yerleşimi de bir aktördür. Instancing veri türü değil, render
  katmanının otomatik toplu çizimidir. Toplu yerleşim için instanced static mesh
  bileşeni vardır; foliage kompakt örnek dizileri olarak hücre dosyalarında
  kalır.
- **Bitki temsili (plan, kullanıcı kararı 2026-11-14):** tekil ağaç şemalı
  bitki bileşeni taşıyan aktördür; orman kompakt foliage örnekleridir. İkisi
  aynı üretilmiş bitki ailesine referans verir ve aynı WES tepki çözümünü
  kullanır (§4.9). Bitki ailesi geometri, LOD / atlas, materyal, collider ve
  çevre tepki profilini birleştirir; GLB geometrinin taşıyıcısı olabilir.
  Sırf çevre tepkisi için her foliage örneği aktör / script yapılmaz. Bu
  sözleşme henüz uygulanmadı; asset / bileşen şemaları kendi uygulama adımında
  kaydedilecek. Ayrıntı [prosedürel bitki planı](PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md) §5.4.
- **World Builder çıktısının bileşenleri (plan 2b `tools/world`, kullanıcı
  kararı 2026-11-12):** dört bileşen 2b'de yalnız şema olarak tanımlıdır
  (World Builder ve içe aktarıcı yazar; çizim Faz 3 / 5a, collider Faz 6):
  `forge.staticMesh@1` (`mesh`: `forge.model` asset'i, `collision`; uzamsal), `forge.shape@1`
  (placeholder ve Add Actor primitifi: `primitive`, `color`, `collision`; ölçek
  1'de 0,5 m, boyutu aktörün ölçeği verir; uzamsal), `forge.worldRole@1`
  (`role`: noktalı anlamsal ad, placeholder → model geçişi için; `stage`: onu
  koyan World Builder aşaması, elle konanda boş), `forge.terrain@1` (`data`:
  `forge.terrain` veri belgesi; arazi hücreden büyük, aktörü kalıcı katmanda).
  World Builder kökeni (`recipe.generatedBy`) nesnelerin üstüne,
  `forge.worldRole.stage`'e taşındı; diske yazılan recipe onu taşımaz, defter
  yalnız kurulum sırasında bellekte yaşar (Stage Runner taşınmadı, okuyanı
  yok). Yerleşimin aktör kimliği level kimliği + yerleşim kimliğinden
  deterministik türetilir: `--force` ile yeniden üretimde GUID'ler değişmez.
- **Forge WebGL içe aktarıcısı (plan 2b, kullanıcı kararı 2026-11-12):**
  yerleşim → aktör çevirisi World Builder ile ortak saf koddur
  (`src/engine/forgeImport/`): `instances` → `forge.staticMesh` /
  `forge.shape` + `forge.worldRole`, `marker:playerStart` → "Player Start"
  adlı bileşensiz aktör, `landscapes` → `forge.terrain` aktörü + veri belgesi
  (tile'lar olduğu gibi), `heightFog` → `forge.heightFog`; hücre ataması
  konumdan (A11). Karşılığı henüz olmayan alan yazılmaz, level başına raporda
  hedef fazıyla listelenir; çevirici o fazda eklenir. Aktör ve asset GUID'leri
  kaynak yol + kaynak kimlikten deterministik türer: içe aktarıcı yeniden
  çalıştırıldığında aynı GUID'leri yazar, eklenen çevirici var olan
  başvuruları kırmaz. *Uygulandı (2026-11-12):* `npm run import:forge`
  (`tools/import-forge-webgl`); `--compare` kaynak / hedef sayımı, `--pack` motor
  içerik paketine yalnız asset. Gözlem: Forge level dosyasının kendi yerleşimleri
  (Player Start) kalıcı level'daydı; yeni modelde aktör durduğu hücrededir
  (Player Start kalıcı katmanda: kullanıcı kararı 2026-11-19, §4.7 Faz 6
  kararları; kural 6b'de özelliğiyle, içe aktarıcı ve World Builder kalıcı
  katmana yazar).
- Büyük ikili veri (terrain tile, global harita, foliage örnekleri) GUID'li
  asset sidecar'larında, ikili kanalla taşınır.
- Level = kalıcı katman + hücreler. Hücre ataması aktörün konumundan türetilir;
  "akışa katılmaz" bayrağı temel aktör şemasında **bir kez** tanımlanır (D10,
  D4).
- **Hücre / akış kuralları (A11 kararı, 2026-11-10):**
  - Level başına sabit 2B ızgara; hücre boyutu level ayarındadır.
  - Dosyalar: kalıcı katman (`level.json`) + hücre başına bir aktör dosyası +
    hücreleri ve revizyonlarını listeleyen dizin. Dizin, atomik kayıtta en son
    değişen dosyadır (§4.6).
  - Aktör, kök konumunun düştüğü hücreye aittir; alt aktör ebeveyninin
    hücresinde durur. Sınırları hücreden büyük aktör kalıcı katmana alınır
    (editör önerir).
  - Hücreler arası referans GUID'dir ve "henüz yüklü değil" geçerli bir durumdur;
    runtime kodu çözülmemiş referansı ele almak zorundadır.
  - Editör kamera çevresini akışla yükler; kirli hücre kaydedilene kadar
    boşaltılmaz.
  - Dünya çapı işlemler (World Builder üretimi, GUID ile arama, toplu şema
    geçişi) yüklü World üzerinden değil, Node araçlarıyla dosyalar üzerinden
    çalışır.
  - Çok kademeli ızgara v1'de yok; gerekirse sonradan eklenir.
- **Hücre modeli uygulaması (2a kararları, 2026-11-10):**
  - *Izgara:* her level'da var, kapatılamaz. `settings.cellSize` (16–4096 m,
    varsayılan 128) level ayarıdır; X/Z düzleminde, orijin dünya orijini.
    Hücre anahtarı `"<x>_<z>"` (negatif olabilir, `-0` ve baştaki sıfır yok);
    kenardaki nokta, min kenarı olduğu hücreye düşer. Hücre sırası önce z,
    sonra x. `cellSize` değişikliği bütün hücreleri yeniden yazan dünya çapı
    işlemdir (Node aracı). `loadRange` akışla (5b) gelir.
  - *Rüzgâr (5a adım 7, kullanıcı kararı 2026-11-15):* `settings.wind` taban yön / güç / hamledir (45°, 0,3, 0,3; Forge varsayılanları). `LevelSettingsKey` World başına güncel ayarları taşır; assembler ve editör aynı kaydı günceller. WES yokluğu / gizlenmesi level rüzgârını kullanır. WES `wind.useLevelWind` (varsayılan true) ya da açık override seçer; ortak `resolveWorldWind` Forge'un `resolveLevelWind`'ini, sonra hava / mevsim ölçeklerini kullanır. İçe aktarıcı eski sparse alan önceliğini kayıttan önce çözer.
  - *Disk düzeni:* level bir klasördür, adlar sabit: `level.json`
    (`forge.level/1`: kimlik, `settings`, kalıcı katman aktörleri),
    `cells.json` (`forge.levelCells/1`: level kimliği, `level.json`'un ve her
    hücrenin revizyonu), `cells/<x>_<z>.json` (`forge.levelCell/1`: level
    kimliği, hücre anahtarı, aktörler). Bir klasörde tek level; yalnız dolu
    hücrelerin dosyası vardır, boşalan hücrenin dosyası silinir. Hücre ve
    dizin asset değildir, level'ın parçasıdır.
  - *Akış bayrağı:* `spatiallyLoaded` (varsayılan `true`, her zaman yazılır)
    temel aktör şemasında bir kez tanımlıdır (`ActorStreamingFields`).
  - *Kilit (kullanıcı kararı 2026-11-14):* aktörün isteğe bağlı `locked`'u (Forge'un
    Lock Movement'ı, `ActorLockField`): editör kilitli aktörü taşımaz, döndürmez,
    ölçeklemez, yapıştırmaz; World ve oyun okumaz; yalnız `true` yazılır. Gizleme ise
    belgeye girmez (§4.7).
  - *Pivot (kullanıcı kararı 2026-11-14):* aktörün isteğe bağlı `pivot`'u (vec3,
    aktörün yerel uzayı; `ActorPivotField`) editörün döndürme ve ölçeğinin etrafında
    yapıldığı noktadır (Forge'un yerleşim pivot'u). Editör verisidir: World ve oyun
    okumaz; orijindeki pivot kanonik belgeye yazılmaz.
  - *Atama:* kök aktörün `transform.p` X/Z'si hücresini belirler. Alt aktör
    kökünü izler, kendi bayrağına bakılmaz; bu yüzden `parent` her zaman
    aynı dosyadadır ve dosya başına normalize'da denetlenir (dosyada olmayan
    ya da döngü kuran ebeveyn kayıptır, aktör level köküne bağlanır).
    `spatiallyLoaded: false` kök ağacıyla kalıcı katmandadır. Singleton
    bileşen taşıyan ağaç kalıcı katmandadır; "level başına bir" denetimi böylece
    tek dosyada kalır. Hücreden büyük aktör kuralı saf bir yüklemdir
    (`exceedsCell`); sınırları editör verir ve taşımayı önerir.
  - *Revizyon:* dosya baytlarının SHA-256'sının ilk 16 hex hanesi. Baytları
    gören taraf hesaplar (`tools/assets`, kayıt servisi); çekirdek opak taşır,
    yalnız karşılaştırır. Kanonik metin `stringifyDocument`: iki boşluk girinti,
    düz değer dizileri tek satırda, sonda satır sonu; aynı belge her zaman aynı
    baytlar. Depoda `eol=lf` bu baytları korur.
  - *Bellekte level:* bir `LevelDoc` (kalıcı katman + şimdiye kadar okunan
    hücreler) ve her aktörün okunduğu dosya. `mergeLevelParts` dosyalardan,
    `splitLevel` bütün level'dan parçalara; `partsToWrite` bir düzenlemenin
    dokunduğu parçaları verir (hücre sınırını geçen aktör iki hücreyi
    kirletir), `planLevelFiles` yeni kanonik metni ve silinecek boş hücreleri;
    yüklü olmayan bir hücreye yazılacaksa plan `notLoaded` döner ve hiçbir şey
    yazılmaz. `nextCellIndex` son yazılan dizindir. Yarım kalan kaydın
    kurtarılması kayıt servisi kutusundadır. Okunduğu dosya ile ait olduğu
    parça farklı olan aktör (yanlış hücrede ya da kökü taşınmış) iki parçayı
    birbirine bağlar: biri yazılırsa öteki de yazılır, yoksa aktör ya hiçbir
    dosyada ya da iki dosyada kalır. Birleştirme ve bölme aktör nesnelerini
    kopyalamaz (50.000 aktörde kopya, yükleme ve kayıt süresine egemendi);
    parçalar birleştirmeden sonra değiştirilmez, bölmenin çıktısı yazmak
    içindir.
  - *Bütünlük (bütün dosyaları gören geçiş, asset dizini):* hata — iki dosyada
    aynı aktör kimliği, iki dosyada aynı singleton, dizinde olmayan hücre
    dosyası (yarım kalan kayıt ya da kopya; okunmaz), dizinde olup dosyası
    olmayan hücre, adı ile anahtarı uyuşmayan hücre, başka level'ın hücresi ya
    da dizini, klasörü olmayan parça, `level.json` adı taşımayan level,
    revizyonu dizinle uyuşmayan dosya (okunur, raporlanır), level'ın hiçbir
    dosyasında olmayan aktöre `actorRef`. Uyarı — yanlış hücredeki aktör
    (yüklemede yerinde kalır, sonraki kayıt taşır). Runtime'da "henüz yüklü
    değil" geçerli durumdur; asılı aktör referansı yalnız bu geçişte aranır.
- **World Partition, 2b / 5b ayrımı (kullanıcı kararı 2026-11-12):** tek
  dünya ızgarası `src/core/grid/worldGrid.ts`'tir (Forge'un, gövdeler aynı;
  orijinli): terrain tile ızgarası, akış politikası ve level hücreleri onu
  kullanır, level ızgarası orijini dünya orijini olan ızgaradır
  (`core/level/cells`'in `cellAt` / `cellBounds` / `exceedsCell`'i; anahtar
  yazımı core'da). 2b'de saf olanlar var: akış politikası, hücre yerleşim
  planlayıcısı (`WorldPartitionStreaming<Id>`: etkin / önceden getirilen
  hücreler, kare bütçesi; yeni modelde aktör GUID'leriyle), hareket etmiş
  aktörün durum belleği (`streamedActorState`). Hücre dosyası getirme, aktör
  ekleme / çıkarma, eşzamansız yükleyici, asset residency, `loadRange` level
  ayarı, HLOD, görüş mesafesi ve culling 5b'de; kaskat ve takipli gölge
  Faz 3'te, foliage halkası 5c'de. Yüklenmemiş bir hücrenin aktörlerinin
  oyun durumu kayıt oyununun durum defterinde durur (§4.8).
- **5b kararları (kullanıcı, 2026-11-16; ayrıntı plan Faz 5b):**
  - *Menziller:* `settings.viewDistance` (isteğe bağlı; kamera far, Fit to View
    Distance, HLOD menzili) ve `settings.loadRange` (varsayılan 384 m) level
    ayarıdır; kalite profilinin `viewDistanceMultiplier`'ı ikisini ölçekler.
    Akışın sahibi motordur, tekil bileşen yoktur.
  - *Akış:* hücreler kalıcı katmandan sonra kaynak çevresinde getirilir,
    `assembleActors` / `removeActors` ile World'e girer / çıkar, oyun durumu
    defterde; getirme `src/runtime`'da (dev uçları, dist statik içerik, Play
    oturumu). Editör aynı politikayla akar; kirli hücre kaydedilene kadar kalır,
    yüklenmemiş hücreye yazan işlem önce hücreyi yükler, olmazsa atomik reddedilir.
    Asset residency'nin sahibi hücredir; kaynak önbelleği son sahipten sonra
    gecikmeyle atar.
  - *HLOD:* level klasöründe `hlod.json` (`cellSize`, hücre başına üçgen sayısı ve
    `sourceHash`) + `hlod/<x>_<z>.glb`; hücre gibi level parçasıdır, asset değildir,
    commit'lenir. `forge hlod` Node komutu üretir; bayat `sourceHash` uyarıdır
    (editör, `verify:assets`, build). Proxy rengi köşe niteliğinden `colorNode`
    ile okunur (`vertexColors` bayrağı yok; three'nin meshlet hattıyla uyum).
    *Şekiller (5c R1, 2026-11-17):* `forge.shape` da pişirilir; geometri three'siz
    `engine/procgen/shapePrimitives.ts`'ten (render'ın three geometrisiyle eşitlik
    testi), renk köşe rengine; `sourceHash` ve tazelik damgası primitive + rengi
    içerir, düzlem iki yüzlü pişer.
    *Editör üretimi (2026-11-17, `0c16852`):* dev server proje başına tek
    `hlodJobs` kuyruğu tutar (`GET` / `POST /__forge/hlod`; yalnız yazılabilir
    proje level'ı, motor / paket level'ı reddedilir); iş `tools/world/hlodWorker.ts`
    ile ayrı Node sürecinde `runHlodJob`'ı çalıştırır, aynı level'a gelen
    istekler birleşir. Tazelik damgası etkin yerleşimler, `cellSize` /
    `loadRange`, GUID çözümü ve üreticinin okuduğu dosya baytlarıdır; damga,
    girdi / çıktı revizyonları ve son rapor `.forge-cache/hlod/<hash>.json`'da
    (commit'lenmez). Üretim kilitsiz, yayımlama proje kaydı kilidinde: kaynak
    ya da çıktı değiştiyse sonuç atılır ve iş yeniden sıraya girer; yazım
    hatası önceki proxy setini geri yükler (`hlodPublish.ts`). `forge hlod`
    aynı servisi kullanır. Editörde `hlodController` (taşıma bağımsız) açılışta
    ve başarılı kayıt / bağımlılık dosyası değişiminde tazelik ister, Auto
    açıksa üretir; kirli düzenlemeyi kendiliğinden kaydetmez, kendi çıktılarını
    ve boyanmış foliage'ı izlemez. Yeni yayımlama `HlodSource` revizyonunu
    artırarak sayfa yenilenmeden çizilir; editörün zaten okuduğu yayımlama
    proxy'leri yeniden düşürmez.
  - *Mesafe LOD:* 5b'de yok; three'nin meshlet hattı ayrıca konuşulacak (§4.9'un
    Faz 9 notu).
- **Önceki 5b uygulama notu (2026-11-16, HEAD `63815f9`; tarihsel durum):**
  - *Saf kısım / ayarlar:* `engine/world/{assetResidency,detailCulling,worldMapView}`
    ve HLOD'un yeni modele uyarlanmış saf kısmı `4cef956` ile var; 25 A taşındı,
    **A 982 / 1.021**, 5b'ye ertelenmiş A kalmadı. `89b6a87`, `de8654d`:
    level menzilleri (`viewDistance: 0`: kameranın far'ı; `loadRange: 384`),
    işlemsel ayar düzenleme, World Settings Streaming alanları, Height Fog Fit
    to View Distance, oyun kamerası kalite çarpanı ve içe aktarıcı bağı uygulandı.
  - *Runtime akışı:* `runtime/streaming/cellStreaming.ts`, `projectLevel.ts`
    ve boot bağı (`c7a5174`) kalıcı katmanla açılır; dev / Play / dist aynı
    içerik istemcisiyle hücre okur. Getirme 1,5 × yükleme menziline, etkinleştirme
    yükleme menziline göre; ikisi kalite çarpanıyla. `63815f9`: ebeveyn önce,
    32 aktörlük parçalar, kare başına 3 ms aktör ekleme bütçesi (en az bir
    parça); hücre etkinleştirme kuyruğu ayrıca 4 ms. Etkin olmayan hücre
    verisinin önbellek bütçesi 16 MiB'dir; toplam JS / GPU bellek sınırı değildir.
    `SaveLedger` boşalan aktörün durumunu tutar, dönüşte uygular; hazır olma
    yükleme / katılma işlerini bekler. Başsız açılış bütün hücreleri kurar.
  - *Kaynak yaşamı:* `045964c`: host'un `resourceCache` sahipleri
    `AssetResidency`'ye bağlıdır; son kullanım bırakılınca 30 sn gecikmeyle
    host karesinde atılır, `render/resources/disposeResource.ts` modelin
    geometri / materyal / dokularını, bağımsız materyal / geometri / dokuyu
    bırakır; terrain slotları kendi sahibinde kalır (§4.9). Sayaçlar ölçüm
    kancasında hücre / World ve renderer sayaçlarıyla birlikte okunur.
  - *HLOD:* `tools/world/hlod{Cli,Build,Input,Assets,Stale,Math}.ts`
    (`d8676b4`): `forge hlod`, hücre başına level parçası GLB, bayatlık
    uyarısı (`verify:assets`, `check:projects`, build) ve build kopyası var.
    Runtime `HlodSourceKey` sağlar; `render/sync/hlodProxies.ts` (`dddd81b`)
    menzil içindeki etkin olmayan hücreyi proxy ile çizer (aynı anda 4 okuma,
    1,25 × menzil ötesinde bırakma, ortak materyal / `colorNode`). Hücrenin
    bütün aktörleri katılınca proxy gizlenir; `63815f9` geometriyle birlikte
    Mesh `dispose` olayını gönderir, renderer render nesnelerini de bırakır.
    **Editörde gösterim adım 6'yı bekler.**
  - *Ölçüm / kalanlar:* üretici `tools/bench/streamingLevel.ts`, CLI
    `tools/bench-streaming-level.ts` (`f202569`); `measure:streaming`
    (`63815f9`) referans projesinin geçici kopyasında çalışır. Mevcut son
    [`2026-11-16T17-41-23-820Z-streaming.json`](../../../Games/ForgeReference/render-refs/runs/2026-11-16T17-41-23-820Z-streaming.json)
    metadata'sı `dddd81b`, `dirty: true`; ilk uçuş p99 / max **9,4 / 57,7 ms**
    (eşikler 20 / 50 ms; max aşıyor), sıcak dönüş **10 / 31,1 ms**. İlk tam
    döngü, 10. döngü ve 32 sn bekleme sonrası sayaçlar kararlı: hücre aktörü
    2.583, önbellek 63, GPU geometri / doku 214 / 30. Harness ilk tam döngüyü
    esas alır (ilk varış GPU 216 / 30); GC sonrası heap ilk döngü
    37.349.980 B → bekleme sonrası 37.689.828 B (**%0,91**, sınır %5).
    Kaynak atma sayacı bu koşuda 0; tüm kaynak türlerinin atılma kabulü
    çıkarılmaz. Ham kayıt listesi ve yöntem plan 5b ilerleme notunda.
    Pipeline derlemesi **hipotez**, `compileAsync` ön ısıtması **önerilen
    sonraki incelemedir**, uygulanmadı. **Ölçüm kabulü AÇIK**; editör akışı
    (6), panel / harita (7), TSL detay fade / hücre batch'leri / draw call
    ölçümü (8) ve toplu kapı / görsel kabul (11) bekler. 5b kutusu açık;
    bu belge işinde test, tam kapı veya yeni ölçüm çalıştırılmadı.
- **5b editör / fade / ön ısıtma uygulaması (2026-11-17):** editör kısmi
  oturuma bağlıdır (`editor/session/cellStreaming`); yüklü aktörleri gösterir,
  kirli kaynak / hedef hücreyi tutar, yüklenmemiş hedefte edit / undo / redo
  atomik reddedilir. `worldPartitionPanel` kamera / menzil, hücre / terrain
  durumları, tıkla odak, sürükle tut, Load / Unload / Release ve HLOD bayatlık
  durumunu sunar. `KeptRegionsKey` dikdörtgenleri level ve terrain akışında
  ortaktır. Editör HLOD kaynağının `revision`'ı proxy dosyaları yenilenince
  çizimi yeniden kurar; kaynak hash'i yalnız okunmuş hücrelerde doğrulanır,
  okunmamış / proxy'siz hücreler kontrol edilmemiş olarak gösterilir.
  `detailFade` yerleşim kökeni / ölçeğiyle TSL maskelerini geometri ve gölgeye
  uygular; template'in kendi ölçeği bu hesapta yoktur. CPU bütün batch uzaktaysa
  onu atlar. **Karar 6 geri dönüşü uygulandı:** hücre bölmesi Derekavak P2'de
  draw call'u 398'den 713'e çıkardı; kullanıcı bölmeyi 5c öncesi G6 / meshlet
  spike'ına bıraktı. Ortak batch'ler 5b'de korunur; bu uncapped karşılaştırma
    G6'nın 60 Hz kabulü sayılmaz.
    Async derleme sonrasında ve her görünür kare başında render target / MRT
    durumu yeniden kurulur; hazırlanan batch'in GPU nesneleri iptal edilse de
    derleme tamamlanana kadar bırakılmaz. Teknik doğrulama ve ölçüm sınırları
    planın 5b ilerleme kaydındadır; kullanıcı görsel kabulü ayrıdır.
  Host, batch parçalarını görünür sahnenin dışında `compileAsync` ile hazırlar;
  gerçek sahnenin ışıkları ve çizim pass'inin MRT / depth / sample biçimleri
  kullanılır. `RenderReadinessKey` runtime ve editörün HLOD geçişini derleme
  tamamlanana kadar bekletir. Kuyruk seri ilerler; iptal edilen batch dönmez,
  derleme sürerken GPU nesneleri silinmez, derleme sonrasında bırakılır.
  Editör yerleştirmesi hazırlanan CPU geometrisini ölçebilir; özel asset
  önizlemesinin kendi çizim döngüsü ön ısıtmayı kullanmaz. Temiz `a6f3521`
  streaming koşusu (`2026-11-17T07-06-57-259Z-streaming.json`): ilk uçuş
  p99 / max 13,3 / 35,1 ms, dönüş 13,8 / 36 ms; heap artışı %0,34,
  kararlı GPU geometri / doku 216 / 30. Adım 10 ölçütleri geçti. Kaynak atma
  sayacı 0 olduğundan genel atılma / sızıntısızlık iddiası yok. Teknik kapı
  ve yöntem planın 5b ilerleme kaydı / §11'inde; kullanıcı HLOD geçişi ve
  detay fade görsel kabulünü 2026-11-17 tarihinde onayladı; otomatik HLOD ve
  R1 Derekavak şekil proxy kabulü de onaylandı. 5b kutusu kapandı.
- **5c kararları (kullanıcı, 2026-11-17; "hepsi öneri gibi"; ayrıntı plan Faz 5c):**
  - *Önce spike:* 5b'den bırakılan hücreye bölünmüş batch ve meshlet sorusu
    üretim yolundan önce Derekavak P2'de 60 Hz G6 ölçümüyle karşılaştırılır
    (ortak batch / hücre bölmesi / foliage compute culling + indirect / meshlet).
    Spike kodu commit'lenmez; kayıt `render-refs/runs/`'a, sonuç plana.
  - *Foliage Type (INV-E21):* şemalı JSON asset `forge.foliageType` (A13 genel
    veri editörü): model GUID'i (bitki ailesi gelince aile GUID'i), Forge'un
    yerleşim alanları, cull / far alanları, rüzgâr kaynağı, LOD zinciri ve
    impostor yuvası (bitki planı PG0 sözleşmesi 1). Saf üretim
    `engine/foliage`'ın `FoliageTypeParams`'ını okur; şema ona eşlenir.
  - *Landscape kuralları (INV-D30):* terrain aktöründe şemalı
    `forge.landscapeFoliage` bileşeni (kural başına katman, tür GUID'i,
    yoğunluk, `minWeight`, `seed`); ajan `forge edit set` ile düzenler.
    Prosedürel halka terrain tile'ı gibi kameraya bağlı, WP hücrelerinden
    bağımsız akar; uzak bloklar global haritadan (dünya uzayı yüksekliği;
    dosyadan çözülen harita datum'a göreli, çeviri çağıranda).
  - *Boyanmış örnekler (INV-D29):* HLOD gibi level parçası, asset değil:
    `foliage.json` dizini + hücre başına ikili `foliage/<x>_<z>.bin` (tür
    başına konum / dönüş / ölçek / seed dizileri); WP hücre akışıyla gelir,
    residency sahibi hücredir. §4.4'teki "büyük ikili veri sidecar'da"
    kuralının foliage için biçimi budur.
  - *GPU güdümlü çizim (Faz 1 GO koşulu):* bütün türlerde ve gölge
    kaskatlarında; tür başına storage buffer'da örnekler, compute geçişi
    (görüş alanı, mesafe, fade, LOD seçimi) atomik sayaçla indirect
    argümanlarını yazar, çizim `drawIndexedIndirect`. Fade 5b'nin dither'ı;
    rüzgâr WES'ten, köşe niteliği varsa ondan, yoksa Forge'un yükseklik
    formülüyle (PG0 sözleşmesi 2). Çevre değişimi uniform'la, yeniden
    derleme yok.
  - *Uzak temsil (kullanıcı, 2026-11-19):* bütün uzak billboard'lar PG3'ün
    yarım küre octahedral impostor'u: üretilen bitki offline atlasıyla, içe
    aktarılan GLB türü çalışma anında model başına bir kez CPU rasterleyiciyle
    (worker) bake edilen tek katmanlı atlasla. Forge'un 8 açılı billboard'u
    taşınmadı. Mevsim impostor'un iki katmanında (odun / yaprak, yaprakta dökülme
    eşiği); sınırlı mevsim atlası ölçümde kazanç göstermedi (PK7, 2026-11-19).
  - *Bitki dilimi:* `forge.plantFamily` asset'i + `forge.plant` bileşeni;
    tepki çözücü `engine`'de saf, tekil aktör ve foliage aynı uniform'larla
    (§4.9 ortak sözleşme). PG1 kayası saf çekirdeğin ince dilimi olarak kalır.
    **Uygulama (PG2, 2026-11-18):** GPU güdümlü batch'in örnek başına shading kancası
    (`render/gpu/instanceShading.ts`) iki yolda ve gölge görünümlerinde aynı düğümleri verir
    (köken, ölçek, 24 bit tohum, şablon konumu) ve dünya ofsetini yolun uzayına çevirir;
    rüzgâr (`render/foliage/foliageWind.ts`) ve bitki tepkisi (`render/plant/plantDrawing.ts`)
    bu kancadır. Dünya başına tek bitki çizimi: rüzgâr / saat ve aile başına görünüm
    uniform'ları kare başına bir kez `engine/plant/plantResponse.ts`'ten. Tekil `forge.plant`
    ailenin prototipini foliage batch'inde tek örnek olarak çizer; `family`'li foliage türü
    aynısını: iki temsil arasında ayrı yol yok. WES canlı durumunda zamanlı mevsim geçişi
    (`seasonFrom` / `seasonProgress`, kayıt durumunda).
    **PG3 (2026-11-19):** `forge generate` yaprak / kart atlasını ve impostor atlaslarını KTX2 yazar
    (UASTC + Zstd, kodlayıcının mip zinciri; `tools/procgen/ktx2.ts`, yalnız araçta devDependency
    `ktx2-encoder`; kullanıcı kararı); yaprak atlası materyalin V çevirmesine göre saklanır, impostor atlası
    olduğu gibi. Impostor yuvası (`forge.plantFamily` prototipi, `forge.foliageType`) `color` taşır: yaprak
    katmanının ortalaması, uzak ton bundan okunur (sıkıştırılmış atlas çalışma anında okunamaz; yalnız
    sıkıştırılmamış atlas geri okunur). Çalışma anında bake edilen GLB atlası RGBA8 kalır.
    `forge.surfaceTextureRecipe` çıktısı da KTX2, bake edildiği gibi (triplanar ve çevirmeyen UV
    materyali aynı görür); ağaç impostor bake'i bir materyalin üretilmiş temel renk dokusunu tarifinden
    yeniden bake eder (Node'da KTX2 çözülmez), elle konmuş PNG'yi çözer.
  - *İçe aktarıcı:* foliage type, landscape kuralları ve boyanmış gruplar
    çevrilir; referans projesi yeniden alınmadan önce kullanıcıya sorulur.
  - *Kapı ölçümü:* `npm run measure:foliage` (başlıklı gerçek WebGPU):
    Derekavak P2 60 Hz G6, S4'ün üretim karşılığı. `npm run measure:forest`:
    üretilmiş ormanda G6, çevre geçişinde en uzun kare / pipeline sayısı / tepe
    bellek, hücre döngüsü, LOD çekimleri (PV-WES-01–08); GPU belleği WebGPU API
    sınırında sayılır (`tests/smoke/gpuMemory.ts`).
  - *Spike sonucu ve karar (2026-11-17, kullanıcı; ayrıntı plan 5c adım 2):*
    statikler ve foliage ortak GPU güdümlü yolda: batch başına storage buffer,
    görünüm başına (ana kamera + kaskatlar) compute culling, indirect çizim,
    çizimler `BundleGroup`'ta; meshlet ve hücre bölmesi 5c'de reddedildi.
    G6 gönderim sınırı foliage'sız statiklerle aşılıyor; CPU draw call başına.
    r187 meshlet hattı `reversedDepthBuffer` ile devreye girmiyor (motor ters
    derinlikte), çift yüzlü / `transparent` / `maskShadowNode`'lu materyali de
    reddediyor. `BundleGroup` (render bundle) statik + foliage gönderimini
    1,81 ms'ye indiriyor; bundle içinde frustum culling yok, GPU culling +
    indirect onu tamamlar. `renderer.info` bundle çizimlerini saymaz.
  - *WebGL2 test arka ucu (kullanıcı, 2026-11-17):* compute atomikleri ve dolaylı
    çizim olmadığı için GPU güdümlü batch'in CPU ikizi kurulur: görünür liste CPU
    referansıyla (aynı düzlemler, sınırlar, uzaklık ve LOD kuralları) yazılır, LOD'un
    parçaları örnekli mesh'le aynı dither solmasıyla çizilir; arayüz aynı, sahibi
    hangi yolu aldığını bilmez. WebGPU kabulü sayılmaz.
  - *Gölge görünümleri (5.2, 2026-11-17):* görünüm 0 ana kamera, 1.. her kaskat ve
    öteki yönlü gölge haritaları (three'nin ışık düğümünden; CSM kaskatları render'dan
    önce aynı kamerayla yerleştirilir). Her görünümün kendi culling tamponları ve
    mesh'leri; gölge görünümü k'nın mesh'leri yalnız k katmanında, gölge kamerasına o
    katman eklenir. Ortak gölge materyali `contextNode`'u taşımadığı için örnek
    dönüşümü `castShadowPositionNode`, solma `maskShadowNode`; mesafe ana kameradan.
    Spot / nokta gölgeleri GPU güdümlü batch'i görmez. WebGL2 ikizi aynı görünümleri
    örnekli mesh'le kurar.
    R9c Adım 2’de CSM kaskadı, dünya yarıçapı kaskadın dünya texel boyu ×
    `shadowCasterMinTexels` eşiğine ulaşan nesneleri alır. GPU yolu örnek başına,
    instanced yol batch’in en büyük ölçeğiyle karar verir. Son izinli kaskadın
    bölmesine yaklaşırken son %15’te dither solması uygulanır.
  - *Render bundle (5.3, 2026-11-17):* isteğe bağlı (`bundle: true`, varsayılan
    kapalı): opak mesh'ler batch'in `BundleGroup`'unda, kamera başına kayıt, yeniden
    kayıt yalnız mesh kümesi / görünüm sayısı değişince; saydamlar dışarıda (three
    bundle'ları geçiş sonunda yürütür). Ölçümde kazanç yok: three r187 düğüm
    materyalli render nesnelerini her karede tam yeniler; çizim başına CPU'nun
    kaynağı nesne başına bağlama güncellemesi (plan 5c R3).
  - *Foliage batch'leri (5.4, 2026-11-17):* `render/foliage/foliageBatches.ts`
    foliage türü başına bir GPU güdümlü batch (LOD zinciri, köken uzaklıklı solma ×
    kalite ölçeği, ekran boyundan LOD, `castShadow`); örnekler sahip anahtarıyla
    (boyanmış hücre, halka karosu) eklenir / değiştirilir / silinir. Halka ve
    boyanmış hücre akışı bu API'yi kullanır (5c adım 6 / 7).
  - *Prosedürel halka (5c F1, 2026-11-18):* `features/foliage/render.ts` terrain
    aktörünün `forge.landscapeFoliage` kurallarını Forge'un oyun tarafı halkasıyla
    (`engine/foliage/foliageRingHost.ts`, three'siz; üretici
    `foliageCellGenerator.ts`, şimdilik aynı iş parçacığı) kameranın çevresinde
    büyütür, editörde ve oyunda aynı. Terrain'in yerleşik tile'ları terrain
    bağlamasından `render/sync/terrainSurfaces.ts` kaydıyla gelir (sahne başına,
    aktörle; yeniden gösterim `version` artırır, halka yeniden kurulur; `settled`
    akışın hazır olmasıdır, foliage hazırlığı onu da bekler). Bağlama bağlamı
    `gpuDriven` (`createBatch` / `removeBatch`) taşır. Foliage Type asset'i belge
    olarak okunur (`WorldResources.json`, anahtar `json:<guid>`; editör kaydedince
    boşaltır ve kullanan aktörleri yeniden yükler). `?debug` / dev ölçümü
    `tagFoliage` etiketinden okur. Hücreler dünya başına tek worker'da üretilir
    (`render/resources/foliageWorkerGenerator.ts`, F2; aynı iş parçacığı üreticisi
    yedek).
  - *Uzak foliage (5c F3, 2026-11-19):* uzak mesafesi `cullEnd`'i aşan türün
    kuralı modellerin fade penceresinden uzak mesafeye kadar 512 m bloklarda da
    büyür (`engine/foliage/foliageFarHost.ts`, three'siz; global harita dünya
    yüksekliğine çevrilir, hand-off'a yaklaşan blok tile'lar gelince yeniden
    kurulur). Çizim `render/foliage/farBillboards.ts`: tür başına GPU güdümlü
    batch, tek LOD PG3 impostor'u (`impostorMaterial.ts`, GLB için `layers: 1`);
    billboard modellerin fade dither'ının bıraktığı pikselleri alır, pencerenin
    önünde dörtgen çöker, son %15'te söner, gölge yok. GLB atlası
    `render/plant/modelImpostor.ts` (`forge.material`'ın temel renk dokusu
    `surfaceBakeSource` ile) + `engine/world/workers/impostorBakeWorker.ts`.
    Uzak ton terrain'in global normal dokusunun alfasında, başlangıç / bitiş /
    renk uniform'la (`TerrainView.setFarTint`, yüzey kaydından).
  - *Boyanmış hücreler (5c F4, 2026-11-18):* level parçası (`foliage.json` + FFOL)
    world servisi `LevelFoliageSourceKey` (`engine/foliage/levelFoliageSource.ts`)
    olarak gelir: çalışma anı level yükleyicisi ve editör sağlar (editör dosyalar
    değişince `revision` artırır). Bağlama hücreleri Forge'un boyanmış hücre
    akışıyla (`engine/foliage/paintedFoliageStreaming.ts`, level `loadRange`'i,
    1,5× önyükleme) aynı tür batch'lerine hücre başına sahip olarak verir
    (`render/foliage/paintedFoliageView.ts`).
  - *Foliage sekmesi (5c F5–F6, 2026-11-18; 5d'den öne):* kabuğun `attachDetailsTab`'ı
    Details'in yanına sekme ekler. `src/editor/foliage/foliagePanel.ts` Foliage Type
    asset'lerini listeler, oluşturur ve şemadan formla bir asset oturumunda düzenler
    (kayıt asset editörünün yoluyla); `foliageRules.ts` terrain'in
    `forge.landscapeFoliage` kurallarını level düzenlemesi olarak (tek Undo) yönetir,
    liste işlemleri saf `engine/foliage/landscapeRuleEdit.ts`. Terrain ve foliage render
    bağlamaları `actorsChanged`'de yalnız kendi bileşenleri değiştiyse yeniden kurar.
    Boya / silme fırçası 5d'de.
  - *Sahne maliyet raporu (R5, 2026-11-17):* `forge stats` (`tools/stats/`, salt
    okur) level'ın dosyalarından ajan için maliyet dili verir: aktör, model + materyal
    birleşimi, kaynak üçgen, saydam / çift yüzlü materyal, statik / şekil batch'leri,
    görünüm ve gölge kaskadı başına draw, foliage, HLOD. Çalışma anı karşılığı editör
    Stats'ı: draw call ve üçgene GPU güdümlü batch'ler eklenir (üçgen, görünür
    sayaçların eşzamansız geri okumasıyla).
  - *Güncel seçim (kullanıcı, 2026-11-17; v1.55):* meshlet şimdilik üretim
    kapsamından çıkarıldı; v1.54 hibrit seçimi tarihsel kaldı. R7 otomatik ayrık
    LOD üretimi, deterministik cache / build ve WebGPU / WebGL2 runtime bağına
    odaklanır. Foliage 5.1'de, terrain kendi hattında kalır. Devam eden R7'nin
    ortak LOD altyapısı korunur; meshlet'e özel bağları geliştiren oturum ayırır.
    R6 araştırması silinmez. Meshlet yeniden değerlendirmesi ancak optimize
    otomatik LOD sonrası gerçek içerikte kalan geometri darboğazının, eşit
    görsel hata ve aynı LOD verisiyle ölçülmesi ve yeni kullanıcı kararıyla olur.
  - *R7 uygulaması (2026-11-17; v1.56):* `engine/geometry` deterministik ayrık
    LOD verisini üretir; küçük (≤500 üçgen) ve kazançsız (%15'ten az azaltma)
    seviyeler çoğaltılmaz, materyal grubu / slot / köşe niteliği korunur.
    `tools/triangles` Node önbelleği ve build'in `forge/triangles` çıktısı;
    aynı sürüm / girdi imzası, cache kaçırmasında tarayıcı worker'ı. `host.triangles`
    ve `InstanceBatchOptions.triangles` seçilebilir 5.1 GPU / WebGL2 CPU bağıdır;
    genel statik çağrılar R9'a kadar açılmadı. Foliage / terrain aynı yoldadır.
    Kaydedilmiş mutlak hata, projeksiyon / fiziksel çizim yüksekliği ve örnek
    ölçeğiyle varsayılan 1 piksel geometrik hata bütçesine dönüştürülür;
    perspektifte sınır küresine konservatif uzaklık, ortografikte en büyük
    örnek ölçeği. Gölge LOD'u / fade ana kamerayı izler (5.1); uzak detay culling
    korunur. Kaynak mesh CPU picking / slot tablosunu taşır, türev çizimler seri
    MRT `compileAsync` hazırlığından sonra etkinleşir; HLOD hazır olma bunu
    bekler. İptal edilen GPU nesneleri derleme bitene kadar bırakılmaz.
    Meshlet kopyası / seçicisi / küme ön işlemesi / pipeline bağlantısı yoktur;
    R6 dosyaları değişmedi. Doğrulama ve dar ölçüm plan R7 / §11'de; G6 ve
    genel asset görsel kabulü açık, occlusion R9a'da.
  - *R9 (kullanıcı kararı, 2026-11-17; v1.59; R9b S1 ile değişti):* statik batch'ler (`forge.staticMesh`,
    `forge.shape`) GPU güdümlü LOD yoluna bağlıdır; host varsayılanı **`auto`** (R9b S1,
    2026-11-18): uygun bir parçası 5.000 üçgeni aşan batch GPU yolunda, gerisi instanced
    (`render/triangles/staticPath.ts`; `instanced` / `gpu` yalnız dev `?staticPath=`). Ağır eşyada
    (36,5 bin üçgen) GPU + otomatik LOD instanced'a göre ~8–10 kat hızlı; hafif referans içerik
    hiç GPU batch'i açmaz.
    R9.0 ölçümünde dört referans level'da yol kazandırmadı: batch × görünüm başına üç
    dispatch, batch başına ~50 µs gönderim, GPU süresi düşmedi. Ağır mesh'li / çok
    örnekli içerik geldiğinde `measure:static-path` ile yeniden ölçülür; dispatch
    birleştirme ayrı karardır. Bağın kalıcı parçaları: düzenlemede LOD bağı yerinde
    güncellenir, birleşmiş slotun LOD'u ham primitive zincirlerinden (önbellek isabeti),
    uygun olmayan parça aynı batch'te instanced, LOD çizim kökü level çerçevelemesinin
    dışında. Foliage GPU güdümlü yolda kalır.
  - *İkincil kamera görünümleri (R9a'nın ilk adımı, kullanıcı kararı 2026-11-17):*
    GPU güdümlü culling yalnız kayıtlı görünümler için yapılır (ana kamera + gölge
    kaskatları); sahneyi çizen başka bir kamera (su birikintisi `reflector()`'ı, ileride
    diğerleri) ana görünümün görünür listesini çizer ve `?debug` o geçişin dolaylı
    çizimlerini saymaz. Her kamera kendi görünümü olarak kaydedilir (kaskatlardaki gibi
    kendi katmanı, dispatch'i ve listesi), sayaca eklenir. Occlusion bunun üstüne kurulur:
    ana kameranın occlusion sonucu ne gölgeye ne yansımaya uygulanır. *Uygulandı
    (2026-11-17, `ef12079`):* `gpuDriven.add(CameraViewSource)`; görünüm rol + katman taşır
    (gölge 1–8, ana 9, kamera 10–13); düzlemsel yansıma ana görünümün aynası (`mirrorCullView`,
    mesafe aynalanmış gözden, eğik yakın düzlem yok sayılır). WebGL2 ikizi aynı.
  - *Bölge sistemi (R9b, kullanıcı kararları 2026-11-18; occlusion ve PVS yerine):*
    `forge.zone@1` (kutu: `size` × ölçek, `alwaysCastShadows`, `generated`) ve `forge.portal@1`
    (dikdörtgen açıklık, isteğe bağlı `zoneA` / `zoneB`), `features/zone`. Çekirdek
    `engine/world/zones.ts`: kamera konumunu tutan en küçük bölge seçilir.
    R9c S1 kararıyla yerleşim, dünya sınır kutusu 2 cm toleransla tamamen
    sığdığı en küçük bölgeye aittir. Model sınırı yüklenene kadar bölgesiz kalır.
    Bölgesiz içerik hep görünür. Kamera dışarıdaysa portal yürüyüşü `OUTSIDE` düğümünden
    başlar. Yakın ve ekrandaki dış açıklıklar daralan ekran dikdörtgeniyle geçilir.
    Dış kapı, pencere ve açık tavan portalları katlar için birlikte üretilir. Çizim
    (`render/sync/zoneDrawing.ts`, bölge kümesi bağlamalardan önce tazelenir): hafif (instanced)
    statik batch'ler bölgeye göre bölünür ve kare başına kip alır (görünür / yalnız gölge / gizli;
    katmanla, yalnız gölge kameraları bölge gölge katmanını taşır); GPU yoluna giden batch'ler
    **bölünmez**: örnek bölge yuvasını taşır (`extras.z`), compute cull host'un iki maskesini okur
    (ana ve kamera görünümleri görünür bölgeleri, gölge görünümleri bunlara `alwaysCastShadows`
    olanları ekler); WebGL2 ikizi aynı maskeyi CPU'da uygular. Bölme GPU yolunda gönderimi bölge
    sayısıyla büyüttüğü için (Z6 ölçümü, bina dışından 0,56 → 13,6 ms) maske kararı verildi; iç
    mekânda GPU %50–60 düşer, gönderim artmaz. Görünmeyen bölge gölge düşürmez (bölge başına
    seçenek). R9c Adım 4'te Play, dış portallarıyla bağlı bina içlerini yaklaşırken hazırlar ve
    uzaklaşınca çizim yerleşimlerini ve kaynak referanslarını bırakır. Aktör ve fizik yaşam
    döngüsü World Partition'a bağlıdır. Otomatik HLOD üretimi bölgeye tamamen sığan
    içerikleri hücre ve landmark proxy’lerinden çıkarır.
    Bölge veya portal düzenlemesi proxy kaynak hash’ini değiştirir.
    Otomatik üretim `engine/world/zoneGeneration.ts` (göz hizası dilimi, Öklid uzaklık dönüşümü, kapı
    yarı genişliğinden uzak çekirdekler, havza büyütme, sınırlardan portal) + `zoneLevel.ts`
    (`generated` olanlar değişir, kullanıcınınkiler kalır, kararlı GUID): `npm run forge -- zones`
    ve editörde World Settings > Generate Zones (tek Undo). Editör: Add Actor > Volumes, gizmo,
    yalnız editörde çizilen kutu / açıklık (`features/zone/editorRender.ts`), `?debug` satırları.
  - *Occlusion (R9a; R9b'de iptal, kod Z0'da kaldırıldı — kullanıcı kararı 2026-11-18):* meshlet'ten bağımsız nesne /
    instance düzeyinde konservatif GPU Hi-Z adayı; R8 ve R9'dan sonra, R10'dan
    önce tasarım + A/B ölçüm, yararlıysa üretim. Frustum / mesafe culling veya
    ambient occlusion bunun karşılığı değildir. Ters derinlik, MSAA / MRT depth
    yolu, güvenilir opak engelleyiciler, kamera değişimi ve zamansal görünürlük
    doğrulanmalı; ana kameranın occlusion sonucu gölge caster'larını kesmemeli.
    Yanlış gizleme kabul edilmez; maliyeti kazancı aşarsa varsayılan kapalıdır.
    WebGL2 mevcut culling / LOD ile devam eder. Ayrıntılı kapı plan R9a'dadır.
    *Çalışma (2026-11-17):* `engine/world/hiZ.ts` CPU Hi-Z referansı (konservatif küre testi) ve
    dev `occlusionStudy` (katman 0 derinliği, üst sınır); Derekavak'ta GPU foliage üçgeninin en
    çok %0–21'i örtülü. Üretim yolu kurulmadı (plan R9a; kullanıcı kararı).
  - *R6 ölçümü ve ilk seçim (kullanıcı, 2026-11-17; tarihsel v1.54):* gerçek WebGPU P2 / yoğun küre stresi,
    üç aday ve bundle; ayrıntı plan R6, kayıt `2026-11-17-r6-triangles.json`.
    Ayrı tarayıcı karesi beklenmeyen ilk ölçümler PassNode cache'i nedeniyle
    geçersiz sayıldı. r187 meshlet kopyası yalnız uygun FrontSide statiklerde,
    ters derinlik + MRT + üç gölge kaskadında çalıştı; bundle gönderimi yaklaşık
    3,0 ms. DoubleSide binalar normal çizimde kaldı. Terrain context'li materyal
    WGSL hatası verdiği için adaydan çıkarıldı; occlusion kapalı. VG daha yüksek
    bellek ve bundle altında ayrı gölge kesimi açığı taşıyor. 5.1 + ayrık LOD
    WebGL2 ikizini koruyor, küçük parçalarda gereksiz LOD'lar kaldırılmalı.
    Karar: yoğun uygun statiklerde meshlet; destek dışı materyaller / WebGL2'de
    otomatik ayrık LOD fallback, foliage 5.1'de. Bu seçim **kullanıcı tarafından
    onaylandı**; önceki genel meshlet reddinin bu kapsamdaki yerini alır. Terrain
    meshlet dışında, occlusion ilk sürümde kapalı. Üretim kodu henüz yok; R7 yeni
    oturumda başlayacak. Picking / fade /
    HLOD hazır olma ve genel asset kabulü sonraki kapsamdır.
  - *Üçgen ve draw call ayrımı (kullanıcı, 2026-11-17; sıra plan 5c "yeni sıra"):*
    üçgen azaltma meshlet / sanal geometriyle (otomatik, elle LOD yok); r187'nin
    `MeshletDrawingPipeline`'ı ters derinlikte kapandığı için aday three-virtual-geometry
    ya da hattın ters derinlik kopyası, seçim spike ölçümüyle (5.5'ten önce). Foliage
    5.1 yolunda kalır. Draw call: HLOD'a `forge.shape` girer (kullanıcı kararı; karar
    5'in "yalnız static mesh" kuralı kalkar), hiyerarşik HLOD + uzak siluet katmanı
    ve sahne maliyet raporu. three-nanite elendi (WebGPU'da küme başına çizim).
  - *R8 draw call kararları (kullanıcı, 2026-11-17; plan v1.57):* bundle varsayılan
    kapalı kalır. HLOD proxy'leri düz mesh kalır (tek örnekli; GPU güdümlü yol ve
    indirect draw düşürmez). Modelin aynı materyal slotundaki primitive'ler
    türetilmiş veride tek geometriye birleşir (kayıpsız; R7 hattı gibi cache / build,
    commit'lenmez); doku atlası ayrı karar. `forge.levelHlod/2` katmanlı: katman 0
    hücre, katman 1 4 × 4 küme, geçiş `max(2 × loadRange, 6 × hücre)`; v1 yeniden
    üretilir. Bileşen landmark işareti tek level proxy'sine pişer, görüş ötesinde
    çizilir; kamera far'ı landmark menziline genişler, diğer içerik görüş
    mesafesinde culling'le kalır.
    *Uygulama (v1.58):* slot birleştirme çalışma anında, model şablonu başına bir kez
    (`render/resources/modelParts.ts`; cache / build türevi gerekmedi, geometriler
    şablonun). Proxy'ler normalsiz (konum + renk), ortak materyal düz gölgeler.
    Küme proxy'leri `hlod/l1_<x>_<z>.glb` (hücrelerle aynı klasör); `HlodSource.load`
    level'a göreli dosya alır.
  - *Uygulama başı (2026-11-17):* `engine/world/foliageRing` (8 A, A 990 /
    1.021) ve `engine/foliage/{foliageTypeParams,foliageRoll,proceduralFoliage}`
    Forge algoritmalarıyla taşındı; boya / silme fırçası 5d'de.
- **5d kararları (kullanıcı, 2026-11-19; hepsi öneri gibi; ayrıntı plan Faz 5d dökümü):**
  - *Ajan yüzeyi:* sculpt, katman boyama, landscape spline ve foliage fırçası
    yalnız editör araçlarıdır; fırça darbesi için CLI yok. Ajan terrain'i veri
    yüzeyleriyle yönetir: World Builder brief'i, auto paint ve
    `forge.landscapeFoliage` kuralları (`forge edit set`).
  - *Sculpt / paint CPU'da:* `engine/terrain`'in taşınmış algoritmaları tile
    verisini değiştirir; render bağlaması yalnız değişen bölgeyi slotun GPU
    dokusuna yükler. GPU compute ile düzenleme yok.
  - *Undo ve kayıt:* fırça darbesi tek undo adımı; adım değişen tile
    bölgelerinin önceki / sonraki kopyasını tutar. Kayıt `worldTerrainSave` ile
    kayıt servisinden; düzenlenen tile akışta tutulur (INV-B12).
  - *Mesh Paint (INV-B10, E26) kapsam dışı:* yalnız insan yüzeyine hizmet eder
    (§0.0 ölçütü); gerekirse ayrı karar.
  - *Yol mesh'leri (INV-G21):* spline boyunca CPU'da bükülüp bake edilen statik
    geometri; statik batch ve HLOD yolunu kullanır, TSL köşe bükmesi yok.
  - *Bitki tarafı:* `generated` model kaynağı ve aile yerleşimi (§4.9 bitki
    sözleşmesi, bitki planı PG5) 5d'nin son araç adımıdır, bitki akışının
    tür / editör aşamalarından sonra.
  - *Uygulama (adım 2, `3074f3a`):* editör World'üne `TerrainEditingKey`
    (`engine/terrain/terrainEditing.ts`: asset başına düzenleme oturumu, çizilen
    terrain'lerin kaydı, sayfanın Landscape ayarları); oyun bu servisi vermez,
    terrain bağlaması eskisi gibi çizer. Oturum (`terrainEditSession.ts`) bağlamadan
    uzun yaşar: tile haritası görünüm ve akışla ortak, okunan biçim / revizyon,
    düzenlenen tile'ın verisi. Level dışı undo adımı ve kayıt katılımcısı editör
    oturumunun genel yüzeyidir (`pushStep`, `addParticipant`); sonraki boyama /
    spline / foliage fırçası adımları aynı yolu kullanır.
  - *Adım 3 kararları (kullanıcı, 2026-11-19, öneriler gibi):* katman ekleme /
    silme ve materyal ataması boyamaya dahil, tek undo, bütün tile'lar yüklenir;
    Auto Paint kuralları terrain aktöründe şemalı `forge.landscapeAutoPaint`
    bileşeni (level'la kaydedilir, ajan yüzeyi `forge edit set`), uygulama
    editörde tek seferlik (ajan komutu gerekirse ayrı karar); görünüm kipi
    (lit / height / slope / layer) `LandscapeSettings`'te, yalnız editör
    önizlemesi.
  - *Uygulama (adım 3, `30fe244`):* katman işlemleri editör World'ünde
    `LandscapeLayersKey` (`editor/landscape/landscapeLayers.ts`), Details eki
    yalnız World servislerini gördüğü için SDK yüzeyi değişmez. Tanımın
    katmanları değişince `EditableTerrain.layersChanged` global haritayı
    tile'lardan yeniden kurar, bağlama görünümü `TerrainData.layersFor(def)`'in
    girdileriyle yeniden kurar (oturum ve akış tile'ları korunur). Görünüm
    kipleri terrain materyaline yalnız `editorViews` ile derlenir; oyunun
    materyali değişmez.
  - *Adım 4 kararları (kullanıcı, 2026-11-19, öneriler gibi):* yeni World Terrain
    bir asset olarak hemen yazılır (undo'suz), aktörün eklenmesi tek undo; terrain
    aktörü taşınınca yalnız tanımın origin'i ve dünya çerçeveli spline'ları kayar
    (tile'lar değişmez; döndürme / ölçek yok; birikinti ve öteki aktörler gelmez);
    `worldTerrainMove`'un su kısmı Faz 7'de su tipleriyle; heightmap içe / dışa
    aktarma yalnız editörde.
  - *Uygulama (adım 4, `4651b3b`):* `editor/landscape/landscapeTerrain.ts`
    (`LandscapeTerrainKey`); `EditableTerrain.layersChanged` →
    `definitionChanged` (katman, taşıma, ızgara). Oturumun dosya defteri ızgara
    değişimini bilir: `replaceTerrain`, `created` tile (yeni dosya), tanımın
    listelemediği okunmuş dosya (Save'de silinir). Taşıma level'daki konum
    farkını izler (sürüklerken yalnız görünüm kayar), böylece undo / redo simetrik.
    Add Actor menüsüne editöre özel eylem (`AddActorAction`); SDK yüzeyi değişmez.
  - *Adım 5 kararları (kullanıcı, 2026-11-25, öneriler gibi):* yol mesh'i saklanmaz;
    terrain çizilirken tanımın `splines`'ından CPU'da üretilir (editör ve oyun aynı
    üretici), statik batch yoluyla çizilir. Terrain aktörü kalıcı katmanda olduğu
    için yollar hep yüklüdür ve HLOD proxy'si gerekmez (karar 5'in HLOD kısmı bu
    kuralla karşılanır). Apply Deform / Apply Paint mesh'ten ayrı eylemler; süsleme
    Faz 6'da (D27); spline seçimi `LandscapeSettings`'te (undo adımı değil, kayda
    girmez); ajan için ek komut yok.
  - *Uygulama (adım 5, `49d6c09`):* saf üretici `engine/terrain/roadMesh.ts`, çizim
    `render/sync/roadMeshes.ts` (Faz 6'nın yol collider'ı aynı üreticiyi kullanır).
    `EditableTerrain.splinesChanged` yalnız mesh'leri yeniden kurar;
    `definitionChanged` terrain'i. `TerrainAssetType` başvuruları spline mesh'lerini
    de sayar. Yol seçilmez (`InstanceBatchOptions.pick: false`). Spline noktasının
    gizmosu görünürken seçimin gizmosu görünmez ve sürüklenmez.
  - *Terrain Details düzeni (kullanıcı kararı 2026-11-20):* `ComponentPresentation.details:
    "tool"` (SDK 0.1.14): ad, bileşenin Details eki, öteki bileşenler, bileşenin
    kendi alanları en altta kapalı; Class, transform, pivot / yerleşim, Remove,
    Advanced ve Add Component yok. Konumu verisinden gelen aktörler içindir.
    Name de gösterilmez (2026-11-20); `details: "embedded"` bir bileşenin tool
    aktöründeki kendi bölümünü kaldırır (`forge.landscapeAutoPaint`: kuralları
    Paint > Auto Paint sekmesi düzenler, ajan yüzeyi `forge edit set` aynı).
- **Ölçek ölçümü (2a, 2026-11-10):** 50.000 aktörlük level R1'de eşik içinde
  (bütün level yükleme ~0,9 s, hücre yükleme p95 ~1,5 ms, tek aktör kaydı
  ~40 ms, tam kayıt ~2,2 s, heap ~58 MB; [Faz 2a arşivi](../archive/PHASE_2A.md)). Aşağıdaki çarelere
  gerek görülmedi.
- **Ölçek yedeği:** 2a'daki 50.000 aktörlük yükleme / kayıt ölçümü kötü çıkarsa
  önce veri modeline dokunmayan çareler denenir: hücre dosyalarında transform'ların
  sütunlu (ikili) yazımı ve runtime'da aktör nesnesi yerine yoğun depolama (2a iç
  kararı). Statik mesh yerleşimlerini ayrı bir diziye almak (D3'ün geri dönüşü)
  bir çare sayılmaz.

### 4.5 Şema kaydı — tek doğru kaynak

Her bileşen ve asset türü şemasını bir kez tanımlar:

```ts
export const HeightFog = defineComponent("forge.heightFog", 1, {
  density: num({ min: 0, max: 1, default: 0.02, ui: "slider" }),
  falloff: num({ min: 0, max: 5, default: 0.2 }),
  color:   color({ default: "#b8c4d6" }),
});
```

Bu tek tanımdan türeyenler:
- TypeScript tipi,
- yüklemede normalize (bilinmeyen alan raporlanır),
- kayıtta doğrulama (aynı fonksiyon; ayrı allowlist yok — D4),
- varsayılanlar,
- sürüm geçiş zinciri (`v1 → v2` fonksiyonları; D6),
- Details formu (parametre UI kuralları: kaydırıcı + kutu, min/max, TR ipucu /
  EN ad),
- undo farkı ve serileştirme turu testleri (otomatik).

Dev server (Node) aynı şemaları yükler; bu yüzden şema dosyaları three'siz
olmak zorundadır. Oyun projesinin kaydettiği şemalar da yüklenir. Geliştirmede
düşen alan uyarı değil, **hatadır**.

**A2 kararı (2026-11-10) — kendi DSL'imiz, tanımlar veri olarak:**

- Alan tanımları düz, gezilebilir nesnelerdir (kapalı fonksiyon değil); editör,
  Node dev server'ı, araçlar ve oyun projeleri aynı tanımı okur. Doğrulama
  kütüphanesi (Zod / Valibot) kullanılmaz; böylece `@forge/sdk`'nın şema yüzeyi
  dış bir kütüphanenin sürüm döngüsüne bağlanmaz.
- 2a alan türleri: sayı, bool, enum, renk, vektör, transform, asset ref, aktör
  ref, dizi, nesne, metin. Yenisi ihtiyaç olunca eklenir (§7). *Faz 3 adım 4
  (kullanıcı kararı 2026-11-13):* renk isteğe bağlı olabilir —
  `color({ default: null })`, değer `#rrggbb` ya da null ("yok"; form temizle
  düğmesi, JSON Schema `["string", "null"]`). İlk kullanan static mesh tint'i.
- **Metin alanı (2a kararı, 2026-11-10):** `text({ default, required, pattern,
  multiline })`; ilk ihtiyaç asset meta'sındaki lisans ve kaynak. Eksik ya da
  boş zorunlu metin `missing-required` kaybıdır (geliştirmede hata); desen
  uymazsa geçersiz değer, varsayılan kullanılır; boş isteğe bağlı metin desene
  bakılmadan geçer. Bileşen varsayılanlarıyla kaydedilebilmeli: bu yüzden
  varsayılanı boş zorunlu metin bileşende tanım anında reddedilir. JSON
  Schema'da zorunlu metin (ve onu içeren grup) `required` listesindedir.
- **Normalize kuralları tek fonksiyon:** yükleme ve kayıt aynı fonksiyonu çağırır.
  Eksik alan → varsayılan; sınır dışı sayı → sınıra çekilir (editör parametre UI
  kuralıyla aynı); bilinmeyen / düşen alan → geliştirmede hata, üretim build'inde
  rapor (oyun açılmaya devam eder).
- **Normalize ayrıntıları (2a kararı, 2026-11-10):**
  - *Tam yazım:* kayıt varsayılana eşit alanı da yazar; çıktı kanoniktir (her
    alan var, anahtarlar tanım sırasında). Şemadaki varsayılan değişince mevcut
    level'lar sessizce değişmez. Dosya büyürse seyrek yazıma veri geçişi
    olmadan dönülebilir; tersi, varsayılanlar değiştiyse kayıpsız değildir.
    Prefab `overrides` tanım gereği yalnız farkları taşır.
  - *Yanlış tipte değer* bilinmeyen alanla aynı kuraldır: varsayılan kullanılır;
    geliştirmede hata, üretimde rapor.
  - *"Hata" ne demek:* normalize veri yüzünden fırlatmaz; değer + sorun listesi
    döner. Hata varsa `ok` yanlıştır ve çağıran yüklemeyi / kaydı reddeder.
    Sınıra çekme her ortamda yalnız uyarıdır.
  - Ortam ayrımını çağıran verir (`strict`); çekirdek ortamı bilmez.
- **JSON Schema dışa aktarımı:** DSL'den üretilir; level ve asset dosyaları VS
  Code'da ve ajan araçlarında motor kodu çalışmadan doğrulanır. Draft-07 (VS
  Code'un tam desteklediği taslak). Şema, normalize'ın sorunsuz kabul ettiğini
  kabul eder: alan eksik olabilir, ama bilinmeyen anahtar, yanlış tip ve sınır
  dışı sayı reddedilir; `type` güncel sürüm olmalıdır. Override'lar sınıfa
  bağlı olduğu için statik şemada denetlenmez. Şemaların dosyaya yazılması ve
  VS Code'a bağlanması dev server işidir (henüz yok).
- Öncül: Forge'un `engine/scene/metadataSchema.ts` dosyası (93 satır), veri olarak
  tutulan alan tanımlarından Details formunu zaten üretiyor; yeni DSL bu fikrin
  bütün bileşen ve asset türlerine genişletilmesidir.

### 4.6 Kimlik, referans ve kayıt servisi

- Her aktör ve asset için kalıcı GUID; runtime'da doğan aktörler de GUID alır.
  Bileşenler GUID taşımaz: aktör içinde yerel kimlikle tutulur (A1) ve
  `aktör GUID + bileşen kimliği` ile adreslenir. Kayıt oyunu (save-game)
  anahtarları bu adreslerdir; indeks çevirisi yok (D5).
- **Kayıt belgesi `forge.saveGame/1` (2b, kullanıcı kararı 2026-11-12):**
  `level` (GUID), `actors` (aktör GUID → isteğe bağlı `transform` +
  `components`: bileşen kimliği → `{ type: "<ad>@<sürüm>", alan: değer }`),
  `removed` (oyunda yok edilen level aktörleri), `spawned` (oyunda doğan
  aktörlerin tam belgesi, GUID'leriyle; durumları da `actors`'ta), `states`
  (`defineSaveState` adı → damgalı değerler). Bileşen girdisi override
  kurallarını izler: sürüm damgası, kısmi veriyle geçiş zinciri, yalnız
  farklar; yalnız `persist` alanları ve `state` anahtarları kalır. Normalize
  level'a bakmaz; uygulanırken aktörü ya da bileşeni artık olmayan girdi
  raporlanıp düşer. Kayıt yalnız kendi level'ına uygulanır, başka level
  yüklüyken bekler. Depolama (slot, zarf, şema geçişi) Forge'un
  `SaveGameStore`'u, `src/engine/persistence`; tarayıcı bağdaştırıcısı
  `src/runtime/persistence`. Kod `src/core/save/`.
- **Asset kimliği (A10 kararı, 2026-11-10):** kimlik asset'in yanında durur,
  merkezî manifest doğru kaynak değildir.
  - JSON asset'ler (level, materyal, aktör sınıfı) `id`'yi kendi içinde taşır.
  - İkili asset'ler (GLB, doku, ses) yanlarında `*.meta.json`
    taşır: GUID, tür, lisans, kaynak, içe aktarma ayarları. Tür + lisans +
    kaynak zorunludur (D16). Terrain tile'ı ve global haritası 2026-11-12'den
    beri terrain belgesinin metasız parçasıdır (aşağıda "veri belgeleri").
  - GUID → yol dizini dev server'ın ve build'in **ürettiği** bir önbellektir;
    commit'lenmez, silinirse yeniden üretilir.
  - Referanslar yalnız GUID'dir; taşıma / yeniden adlandırma referans kırmaz.
  - Silmede ters referans dizinine bakılır; kullanılan asset uyarısız silinmez.
    Asılı referans geliştirmede hatadır, üretim build'inde rapordur (düşen alan
    kuralıyla aynı, §4.5).
- **Asset modeli uygulaması (2a kararları, 2026-11-10):**
  - *Meta dosyası:* `<dosya>.meta.json` (tam ad korunur: `car.glb.meta.json`),
    `forge.assetMeta/1`: `schema`, `id`, `type` (`<asset türü>@<içe aktarma
    ayarları sürümü>`), `license`, `source` (`origin` zorunlu; `author`, `url`),
    `import`; isteğe bağlı `generated` (üretim aracının yazdığı asset: tarifin GUID'i,
    üretici, üretici sürümü, dosyanın SHA-256'sı; `GeneratedAssetFields`, PG1,
    kullanıcı kararı 2026-11-18). Lisans tek bir SPDX kimliği ya da `LicenseRef-<ad>`; `Unknown` ve
    `NOASSERTION` reddedilir (D16). Lisans ve kaynak DSL alan haritasıdır
    (`AssetMetaFields`); normalize, form ve JSON Schema ondan türer. Lisans ve
    kaynak yalnız ikili asset'te zorunlu; JSON asset'ler motorda üretilir.
  - *Asset türleri:* `registerAssetType` mevcut şema kaydındadır (ikinci kayıt
    yok); `defineFeature` `assetTypes` alır. İkili tür: iddia ettiği uzantılar
    (birden çok tür aynı uzantıyı iddia edebilir; meta'daki tür dosyanın
    uzantısını iddia etmeli) + sürümlü içe aktarma ayarları alan haritası +
    geçiş zinciri. Belge türleri yerleşiktir (`forge.level`,
    `forge.actorClass`), her kayıt onlarla başlar ve dosyanın `schema`
    etiketinden tanınır. Oyunların DSL'le tanımlayacağı JSON asset türleri
    SDK'yla gelir. Level kimliği `lvl_` önekini korur; dizin iki öneki de tutar,
    `assetRef` level'ı gösteremez.
  - *İlk ikili türler (plan 2b içe aktarıcı, kullanıcı kararı 2026-11-12):*
    `forge.model` (`glb`, `gltf`), `forge.texture` (`png`, `jpg`, `webp`,
    `ktx2`), `forge.sound` (`wav`, `ogg`, `mp3`); her biri kendi özellik
    klasöründe `defineAssetType` + `defineFeature({ assetTypes })` ile, sürüm
    1'de içe aktarma ayarı yok (`import: {}`). Ayarlar (sıkıştırma, mipmap,
    renk uzayı, ses akışı) Faz 3'te sürüm 2 ve geçiş zinciriyle gelir.
    Materyal, efekt, araç, foliage türü ve UI asset türleri kendi fazlarında.
  - *Materyal ve sürüm 2 türleri (Faz 3, kullanıcı kararı 2026-11-12):*
    çekirdek şemalı **JSON asset türü** kazanır: DSL'le tanımlanan, dosyası
    `{ "schema": "<tür>/<sürüm>", "id": "ast_…", … }` olan, alanları şema
    normalize'ından geçen, başvuruları asset dizininde yürünen (asılı
    referans, `planDelete`, ters dizin) ve Details formu şemadan gelen asset.
    Kayıt servisi onu `schema` etiketinden tanır. Aynı yetenek A13'ün (oyunun
    veri asset'leri) temelidir. Veri belgesi zarfı (`data`) yalnız içeriği
    başka katmanın normalize ettiği belgeler için kalır. İlk kullanan
    `forge.material` (`*.material.json`): Forge'un `ForgeMaterialDef` alanları
    birim ve aralıklarıyla (preset, baseColor, doku slotları `assetRef(forge.texture)`,
    ORM, UV tiling, flipY, roughness / metalness / AO / opacity, alpha kipi,
    side, emissive, normal motion, katman karışımı; `sway` 5c'de ve
    `terrainDetail` 5a'da çizilir ama alanları şimdi gelir). Forge'un
    `normalizeForgeMaterialDef`'i içe aktarıcının okuyucusu olarak olduğu gibi
    taşınır. `forge.model` sürüm 2: `materials` (GLB materyal sırasına göre
    slot varsayılanları, Forge `*.materials.json`), `uvw` (`*.uvw.json`),
    `vertexColors` (`*.vertexcolors.json`); `forge.texture` sürüm 2:
    `anisotropy` (varsayılan 8), `mipmaps`; renk uzayını dokuyu kullanan slot
    belirler (Forge'daki gibi). `forge.staticMesh` sürüm 2: `materials` (slot
    override'ı, boş = modelin), `color` (tint, boş = materyal), `castShadow`;
    `forge.shape`'e `castShadow`. Her biri sürüm 1'den geçiş zinciriyle.
    **Statik gölge varsayılanları (kullanıcı kararı 2026-11-13):** Forge'un
    level düzeyindeki `worldSettings.staticObjectsCastShadow` /
    `staticObjectsReceiveShadow`'u taşınmaz; `castShadow` bileşenin alanıdır
    (varsayılan açık, Unreal gibi), içe aktarıcı Forge level'ının ayarını her
    yerleşime çözer (Forge'da kapalıysa `false` yazar); gölge almak hep açık.
    **Sahne gölge yönetimi (kullanıcı kararı 2026-11-16):** nesne başına
    `castShadow` varsayılan açık kalır. World Settings → Shadows ayrı genel
    kapıdır: light özelliğinin uzamsal olmayan tekil `forge.shadowSettings@1`
    bileşenindeki `enabled` (varsayılan açık, bileşen yoksa açık). İlk açık
    durumdan ayrılmada standart aktör işlemiyle oluşturulur; yükleme içerik
    yazmaz. Render host'u ve varsayılan / yerleştirilmiş ışıklar bu kapıyı
    kalite profiliyle AND uygular; anahtar nesne ve ışık alanlarını değiştirmez.
    Yeniden açmak önceki tercihleri geri kullanır; Low gölgeyi yine sınırlar.
    Ayrı Enable / Disable on Objects işlemleri yalnız `forge.staticMesh` ve
    `forge.shape` alanlarını (gizli nesneler dahil) tek Undo ile değiştirir;
    sınıf örneğine override, sınıf asset'ine yazma yok. `LevelSession.unloadedCells`
    boş değilse toplu işlem reddedilir; yalnız yüklü kısma sessiz uygulama yok.
    Genel ayar normal kayıt / geri alma / Play yolunu kullanır. Mevcut Island
    verisi ve içe aktarıcının eski ayarları çözme davranışı değiştirilmez.
  - *Uygulama (Faz 3 adım 4, 2026-11-13):* `defineJsonAssetType(ad, sürüm,
    { suffix, fields }, { migrations })` (`src/core/assets/jsonAsset.ts`),
    tanım `DocumentAssetTypeDef` + `json` (sürüm, sonek, alanlar, geçişler);
    kayıt defteri `<ad>/1` … `<ad>/<sürüm>` etiketlerinin hepsini tanır, kayıt
    son sürümü yazar. Asset dizini normalize edilmiş JSON asset'leri
    (`jsonAssets`) ve meta'ları (`metas`) tutar; `assetRef` alanları level'larla
    aynı kurala göre yürünür. `defineFeature({ assetTypes })` ikili ve JSON
    türleri alır (`FeatureAssetTypeDef`); SDK 0.1.2 `defineJsonAssetType`'ı
    oyunlara açar. Dev server `/__forge/asset-files` ikililerin içe aktarma
    ayarlarını ve JSON asset'leri de verir (renderer onlarla yükler).
    **Kullanıcı kararları (2026-11-13):** Forge'da null olabilen materyal
    grupları (`normalMotion`, `layerBlend`, `sway`) `enabled` anahtarıyla,
    `terrainDetail` normal haritası yoksa kapalı; materyalde `name` yok (asset
    adı dosya adı), preset'ler saklanmaz (editörün yeni materyal şablonu,
    `MATERIAL_PRESET_VALUES`); Forge yerleşiminin tek `materialSlot`'u modelin
    her GLB slotuna yazılır (slot sayısı içe aktarıcıda GLB JSON'undan).
    `forge.model@2` slot sırası: yüklenen modelde karşılaşılan benzersiz
    materyaller (Forge'un `collectAssetMaterialElements`'i). `forge.terrain@2`
    `material` (Forge Landscape materyali). Modelin `vertexColors`'u Mesh
    Paint varsayılanıdır, render uygulamaz (Forge runtime'ı da uygulamıyordu).
    Modelin `collision` grubu (PG1, kullanıcı kararı 2026-11-18): Forge'un
    `*.collision.json`'unun yeri; şimdilik model uzayında dışbükey kabuklar
    (`convex[].points`), Faz 6 genişletir ve collider'ı kurar. Materyalde
    `projection` (`uv` / `triplanar`: model uzayında üç eksen, normal haritası
    izdüşüm başına türev çerçevesiyle, her çizim yolunda doğru) ve `variation`
    (karma doku yolunun gölgelendirici payı, bitki planı §6.6).
  - *Prosedürel çıktı (bitki planı §5.2, PG1):* tarif şemalı JSON asset'tir
    (üretici başına tür); `npm run forge -- generate` çıktıyı tarifin yanına
    kalıcı asset olarak kayıt servisinden yazar; GUID tarif GUID'i + rolden
    türer, yeniden üretim aynı baytları yazar, var olan çıktı `--force` ister.
    Ağaç tarifinin editör önizlemesi ortak canvas'ta tarayıcı worker'ının ürettiği
    geometriyi ve tarif materyallerini kullanır. `Save` yalnız tarif belgesini yazar.
    `Generate & Save Family` geliştirme sunucusunda kayıt revizyonunu taşıyan taslağı
    ve aile çıktısını aynı işlemde yayımlar. Bu işlemi editör SDK'sındaki isteğe
    bağlı `AssetEditorPresentation.publish` sağlar (0.1.13).
  - *İçe aktarılan asset'lerin kökeni (kullanıcı kararı 2026-11-12):* lisans
    sorumluluğu kullanıcıdadır; lisansı bilinmeyen Forge asset'i de alınır,
    oyun projesine girmez (kullanıcı kendi varlıklarını üretene kadar durur;
    motor bunu zorlamaz). Meta deseni `Unknown`'ı reddettiği için içe aktarıcı
    lisans ve kaynağı yol önekine göre bir köken tablosundan yazar:
    bilinmeyen → `LicenseRef-forge-unverified` (kaynak `origin` Forge
    manifestinin `source` / `license` metni); kullanıcının kendi projesi
    (ThreeAges), Forge'un proje içi placeholder / pilot / materyal içeriği →
    `LicenseRef-forge-project` (`authored`); AI ile üretilen →
    `LicenseRef-forge-project` (`ai-generated`); Poly Haven → `CC0-1.0`;
    lisansı belli üçüncü taraf kendi SPDX kimliği ve atfıyla (Gaz-52:
    `CC-BY-4.0`, Sketchfab, yazar Vebis_V_stolb_GT). Kenney / Quaternius
    alınmaz. Asset GUID'i Forge manifest kimliğinden türer; level'lardaki
    başvurular bu eşlemeyle yazılır.
  - *Veri belgeleri (plan 2b `tools/world`, kullanıcı kararı 2026-11-12):*
    içeriğini başka katmanın tanımladığı yerleşik belge türleri:
    `forge.terrain`, `forge.worldBrief`, `forge.worldRecipe`,
    `forge.regionProfile`, `forge.groundCover` (`src/core/assets/dataDocument.ts`).
    Çekirdek yalnız zarfı bilir: `{ "schema": "<tür>/1", "id": "ast_…", "data":
    {…} }`; `data` taşınan engine normalize fonksiyonlarının okuduğu içeriktir,
    onlar değişmez. Dosya adı türün sonekini taşır (`valley.terrain.json`,
    `*.worldbrief.json`, `*.worldrecipe.json`, `*.regionprofile.json`,
    `*.cover.json`). Belge, yanında metasız ikili parçalar sahiplenebilir
    (level'ın hücreleri gibi; asset değildir): terrain'in
    `<ad>.tiles/<x>_<z>.tile.bin` ve `<ad>.global.bin`'i (tile başına meta dosyası
    reddedildi: 64 tile'lık dünyada 65 meta). Sahibi olmayan parça yine
    meta'sız ikilidir. **Başvuru yolları (Faz 3 adım 8, kullanıcı kararı
    2026-11-13):** tür, `data` içinde asset başvurularının durduğu yolları
    bildirir (`layers[].material`: terrain ve zemin örtüsünün katman
    materyalleri, GUID); dizin onları toplar, asılı olan kapıda düşer. Çekirdek
    içeriği yine okumaz. Asset dizini ve kayıt servisi zarfı denetler. World
    Builder girdileri birbirine dosya yoluyla başvurur (asset dizininin dosya
    etiketi: `content/levels/…`, `engine:content/packs/worldbuilder/…`):
    Forge'un normalize fonksiyonları ve kontrolleri yol kuralını sınıyor;
    GUID'li başvuru World Builder penceresiyle (5d) gelir.
  - *Dizin:* `src/core/assets` saftır: içerik köklerinin dosya listesini (JSON
    içerikleri ayrıştırılmış) alır, diski `tools/assets` okur. Kurulum: kimlik
    (meta'sız ikili, ikilisiz meta, aynı GUID iki dosyada → yol sırasında ilki
    kalır, asset olmayan JSON; level hücresi ve dizini ayrılır) → aktör
    sınıfları normalize edilir ve dizin level'ların `ClassResolver`'ı olur →
    her level klasörüyle (dizin + hücreler) normalize edilip birleştirilir ve
    dosyalar arası kurallar denetlenir (§4.4 hücre modeli uygulaması) →
    referanslar şemadan yürünerek toplanır, hücredeki referansın dosyası hücre
    dosyasıdır (level bileşenleri, sınıf
    override'ları sınıf bileşeninin şemasına göre, `actor.class`, sınıf
    bileşenleri, meta `import`'u) → ters dizin → bütünlük (asılı referans,
    `assetRef.assetType` kısıtı). Eksik sınıf bir kez, level normalize'ında
    raporlanır. `planDelete` başka asset'in referansı varken izin vermez.
  - *Önbellek:* `<proje>/.forge-cache/asset-index.json`
    (`forge.assetIndexCache/1`: kökler, GUID → konum, ters dizin); git'e girmez,
    okunamazsa `null` döner ve yeniden üretilir (`npm run assets:index`). Dosya
    damgası ve artımlı tarama 50.000 ölçümünden sonra.
  - *Kapı:* `npm run verify:assets` `content/` ve `samples/*/content/`
    köklerini sıkı kipte tarar; tür / lisans / kaynak eksikliği, meta'sız ikili,
    çift GUID, asılı referans ve level dosyası bütünlüğü (revizyon dahil)
    kapıyı kırar. Gate'te, dolayısıyla CI'da. Taramada `.` ile başlayan adlar
    atlanır; iç içe kök reddedilir. Tarayıcı her JSON dosyasına bayt
    revizyonunu koyar.
- **İşlem (transaction):** editördeki her düzenleme bir işlem; undo birimi ve
  kirli dosya kümesi bundan türer.
- **Sıralı, atomik kayıt:** yeni içerik geçici dosyalara yazılır → doğrulanır →
  dizin dosyası en son ve atomik yeniden adlandırmayla değişir. Kısmi hatada eski
  dizin geçerli kalır (D9).
- **İyimser eşzamanlılık:** her dosyanın bir revizyonu (hash) var; kayıt temel
  revizyonu gönderir, uyuşmazlıkta 409 ve editörde yeniden yükle / karşılaştır.
- **Genel uçlar:** tür başına uç yerine şemaya göre çalışan tek uç ailesi
  (`/__forge/save`, `/__forge/save-binary`); boyut sınırı ikili kanalda sorun
  olmaz.
- Yükleme her zaman geçiş zincirini çalıştırır; kayıt her zaman son şemayı yazar.
- **Kayıt servisi uygulaması (2a kararları, 2026-11-10):**
  - *Atomiklik (günlük + ileri sarma):* yeni içerik hedefin yanına `.` ile
    başlayan geçici dosyalara yazılır. Günlük (`<proje>/.forge-journal/`)
    önce `prepared` (geçici dosya listesi), geçici dosyalar tamamlanınca
    `committed` (yeniden adlandırma ve silme adımları, dizinler en sonda)
    durumuna yazıp-yeniden-adlandırmayla geçer. Kesintide `prepared` geri
    sarılır (geçici dosyalar silinir, eski dosyalar yerinde), `committed`
    ileri sarılır; kurtarma sunucu açılışında ve her kayıttan önce çalışır.
    Dosya adları sabittir (git dostu). Windows'ta kilitli dosyaya yeniden
    adlandırma kısa aralıklarla yeniden denenir.
  - *Dizin sunucunundur:* istemci `cells.json` yazamaz; sunucu dokunulan her
    level klasörünün dizinini yazdığı baytların revizyonundan kurar. Hücre,
    klasöründe `level.json` olmadan kaydedilmez; `level.json` silmek bütün
    hücreleri aynı kayıtta silmeyi ister ve dizini siler.
  - *Eşzamanlılık:* her yazma ve silme okunan revizyonu taşır (yeni dosya
    `null`); tek uyuşmazlık bütün işlemi reddeder (409, diskteki revizyonlarla).
    Bir servisin kayıtları sırayla çalışır.
  - *Doğrulama:* sunucu her JSON'u yolundan ve `schema` etiketinden tanır
    (meta, `level.json`, hücre, aktör sınıfı; başka JSON reddedilir), sıkı
    normalize eder ve kanonik metni yazar. Kayıp → 422, sınıra çekme yazılır
    ve uyarı olarak döner. Sınıflı aktör sınıfına göre denetlenir: aynı
    kayıttaki sınıf önce, sonra açılıştaki asset dizininden kurulan ve her
    kayıttan sonra tazelenen sınıf deposu.
  - *Uçlar:* `POST /__forge/save` (JSON), `POST /__forge/stage-binary` (ham
    gövde → `.forge-staging/<id>`, sunucu yeniden başlayınca silinir; kayıt
    yalnız kimliği verir, yolu değil), `GET /__forge/read` (dosya +
    `X-Forge-Revision`). Gövde sınırı 64 MB. Durumlar: 200, 409, 403 yol,
    400 istek, 413 boyut, 422 belge. *Play (Faz 4 adım 8):* `POST /__forge/play`
    (level'ın kirli dosyaları, kayıtla aynı belge denetimi, kanonik metin; yalnız o
    level'ın `level.json` ve hücreleri), `GET /__forge/play?id=` (level, kamera),
    `GET /__forge/read?…&play=<id>` (önce katman; bilinmeyen oturum 410).
  - *Yalıtım:* yazma yalnız yazılabilir köklerde (varsayılan `content/`);
    `tests/fixtures/` ve `samples/` yapılandırmadan bağımsız salt okunur (A9);
    `.` ile başlayan adlar yazılmaz; proje kökünden kaçış, mutlak yol ve
    link (symlink, junction) reddedilir. `/__forge/` istekleri: soket adresi
    yerel, `Host` localhost, `Origin` varsa localhost ve `X-Forge-Request: 1`
    başlığı (CSRF ve DNS rebinding'e karşı; Forge'un yalnız soket kuralı
    tarayıcıdaki başka bir sayfayı durdurmuyordu).
  - *Düzenleme modeli (`src/core/edit`, saf):* işlem = aktör anlık
    görüntüleri (önce / sonra) + etiket; aynı birleştirme anahtarlı ardışık
    işlemler tek undo adımıdır; yığın 200. Sürümlü kirli takibi: her değişiklik
    aktörün sürümünü artırır, kayıt gönderdiği sürümleri yakalar, yanıt
    yalnız onları temiz işaretler (F01). Level oturumu yüklü hücreleri,
    her aktörün okunduğu dosyayı ve dosya revizyonlarını tutar; yüklü olmayan
    bir hücreye yazılacaksa plan `needs-load` döner; kirli hücre
    boşaltılmaz. Editör servisleri (`TransactionService`, `SaveService`) ve
    "yeniden yükle / karşılaştır" arayüzü Faz 4'te bu modelin üstüne gelir.
  - *409 akışı (Faz 4 adım 8, kullanıcı kararları 2026-11-15):* oturum her aktörün
    tabanını (okunan ya da son kaydedilen belge) tutar. `compare` diskteki level'ı tabana
    karşı okur, `rebase` onu alır: Reload oturumun değişikliklerini atar, birleştirme
    (`core/edit/merge.ts`) onları diskin level'ının üstünde kaydedilmemiş tutar. Birleştirme
    alan düzeyindedir: nesneler anahtar anahtar, diziler ve yapraklar bütün; bileşenler ve
    override'lar yerel kimlikli map olduğundan bileşen bazında eşleşir. Yalnız bir tarafın
    değiştirdiği yer o taraftan gelir; iki taraf aynı yeri farklı değiştirdiyse (silme dahil)
    çakışmadır, aktör başına Mine / Theirs seçilir. Sıra diskin, oturumun yeni aktörleri
    sonra. Ebeveyni kaybolan birleşme reddedilir. Reload ve birleştirme undo geçmişini
    temizler (adımların "önce"si artık diske uymaz). Asset editörü aynı birleştirmeyi
    belgesine uygular (alan başına seçim). Editörde 409 şerit açar (Compare… / Reload);
    adım 9'un canlı tazelenmesi aynı yolu kullanır.
  - *Süreçler arası kilit (Faz 4 adım 9a, kullanıcı kararı 2026-11-15):* bir servisin kayıtları
    yalnız kendi sürecinde sıralıydı; dev server, `forge edit`, `world:random` ve içe aktarıcı aynı
    projeye ayrı servislerle yazar. Kurtarma + kayıt `<proje>/.forge-journal/save.lock` altında
    çalışır (`wx` ile oluşturulur; sahibin pid'i, makinesi, zamanı). Sahibi ölmüş kilit (aynı makine,
    pid yok) ya da uzun süre okunamayan kilit devralınır; başka makinenin kilidi alınmaz, bekleme
    sonunda hata silinecek dosyayı söyler. Böylece kurtarma başka sürecin süren kaydını geri sarmaz
    ve iki kayıt aynı dosyanın revizyon denetimini birlikte geçemez.
  - *Ortak authoring modülü (adım 9b):* `tools/server/authoring.ts` uçların okuyup yazdığı her şeydir
    (yazma politikası, salt okunur kökler, asset dizini, sınıf deposu, belge denetimi, kayıt
    servisleri ve motor içeriği kipinde motorunki, JSON kaydının yanıtı ve HTTP durumu).
    `forgeServer.ts` HTTP'yi, staging'i ve Play katmanını ekler; `forge edit` modülü dev server'sız
    açar (`projectAuthoring.ts`: `npm run dev`'in seçenekleri). Oyun modülünün şemaları
    `tools/project/gameSchemas.ts`'ten (kendi geçici Vite önbelleği, bağımlılık taraması yok: yanında
    çalışan dev server'ın `node_modules/.vite`'ı değişmez).
  - *Dosya olayları (adım 9e, kullanıcı kararı 2026-11-15: Vite'ın HMR kanalı):* içerik kökleri
    klasör klasör Node `fs.watch` ile izlenir (Vite'ın izleyicisi silinip yeniden kurulan klasörü,
    özyinelemeli `fs.watch` üzerine yeniden adlandırılan dosyayı kaybetti; klasörün olayları girdiyi
    inode'dan bağımsız adlandırır; yeni klasör hemen izlenir, içindeki dosyalar bildirilir); dev
    server dışında yazılan dosyalar (ajanın komutu, başka araç, elle düzenleme) disk
    sessizleşene kadar toplanır (bir kayıt = bir paket; `.` ile başlayan adlar sayılmaz), sunucunun
    dizinini ve sınıf deposunu tazeler (level dosyaları sınıf diye okunmaz) ve editöre HMR kanalında
    `forge:files` olayıyla `{ files: [{ path, revision }] }` gider (`core/edit/saveProtocol.ts`). Yeni
    HTTP ucu yok. Sunucu dosyayı kimin yazdığını söylemez; editör revizyondan ayırt eder (§4.11).

### 4.7 Uygulama kabuğu (SceneApp / RuntimeSceneApp yerine)

- **World:** runtime durumu (aktörler + alt sistemler). Unreal'daki `UWorld`
  karşılığı.
- **Sahne kurucu (LevelAssembler):** level verisi → World. Editör viewport'u,
  editör Play'i ve bağımsız oyun **aynı** kurucuyu kullanır; editör yalnız üstüne
  araç katmanı ekler (D7).
- **Alt sistemler:** açık yaşam döngüsü (init → beginPlay → tick grupları:
  fizik öncesi / fizik / fizik sonrası / render senkronu → endPlay → dispose).
  Authored ve runtime'da doğan aktörler aynı yaşam döngüsünden geçer (F11).
  Bugünkü capability modülleri ve tipli servis anahtarları bu yapının temelidir.
- **Render senkronu:** oynanış kodu three nesnelerine dokunmaz; render katmanı
  bileşenleri render bağlamalarıyla izler. "engine three'siz" kuralı böylece
  kalıcı olur.
- **Editör oturumu:** küçük servislerin bileşimi: SelectionService,
  TransactionService (undo), ViewportService (kamera, picking, gizmo),
  AssetService, SaveService, ModeManager (landscape / foliage / paint modları
  birer özellik), PanelHost (Outliner / Details / Content). Her servis dosya
  bütçesine tabi.
- **Editör oturumu, Faz 4 kararları (2026-11-13):**
  - *Düzenleme → World:* `World.updateActors(docs)` ve alt sistem / render bağlaması
    kancası `actorsChanged(changes)`, `WorldActorChange { actor, previous, transformOnly }`
    (`previous` gerekir: varsayılan çıkarma eski bileşen anahtarlarını bilmeli); kancası
    olmayan çıkar (previous) + ekle (actor) duyar. Yalnız transform değişen aktör yerinde
    güncellenir, başka düzenleme aktör nesnesini yerinde değiştirir ve dizini yeniler;
    torunlar transform değişikliği olarak gelir. Instancing batch'inde transform hızlı
    yolu (adım 4). Oturumdaki (`src/core/edit`) işlem önce oturuma, `onApplied` ile
    World'e gider: eklenenler (ebeveyn önce), güncellenenler, silinenler. Çekirdek
    kuralı: çocuğu kalan aktör silinmez (aynı işlemde çocuk da silinir ya da taşınır).
  - *Editör World'ü (kullanıcı kararı 2026-11-13):* alt sistem `defineSubsystem({
    inEditor: true })` ile bildirir (varsayılan false); `createWorld({ mode: "editor" })`
    yalnız onları kurar: render, World Environment, Height Fog. Fizik, davranış,
    hareket ve oyun modülü editörde hiç kurulmaz (SDK 0.1.4).
  - *Gizmo:* Forge'un kendi gizmo'su (move / rotate / scale, world / local, snap,
    pivot, zemin / duvar yapıştırma); sürükleme matematiği three'siz saf modül, çizimi
    çizim katmanında (§4.9). Three `TransformControls` kullanılmaz. *Uygulama (adım 4,
    2026-11-14):* `src/engine/gizmo` (eksen tutamağı işaretçi ışınının eksen doğrusuna en
    yakın noktası, serbest tutamak kameraya bakan düzlemde, dönüş kuaterniyon; çoklu seçimin
    kökleri birlikte, sonuç her aktörün ebeveyn uzayında; zemin / duvar snap'i viewport
    picker'ının ışınlarıyla). `src/editor/transformTools.ts` sürüklemeyi World'e
    `updateActors` ile canlı gösterir (oturuma girmez; instancing batch'i yalnız matrisi
    yazar), bırakınca tek transaction, Esc ya da araya giren bir düzenleme World'ü oturumdaki
    hâline döndürür. Snap ayarı sayfanındır (localStorage), projenin değil.
  - *Gruplama:* grup bileşensiz boş aktördür, çocuklar `parent` ile bağlanır; çözme
    çocukları grubun ebeveynine bağlar ve grubu siler. Çoğaltma yeni GUID verir (A1).
    *Uygulama (adım 5, 2026-11-14):* grup köklerin ortasında, ortak ebeveynlerinin
    altında; ebeveyn değiştiren her işlem (grupla, çöz, Outliner'da sürükle-bırak, Parent
    to active, Unparent) dünya yerini korur (`editor/edit/hierarchy.ts`); oturum ebeveyn
    döngüsünü reddeder. Viewport'ta grubun içine tıklamak en dıştaki grubu seçer.
    Çoğaltma köklerin alt ağacını yerinde kopyalar, tekil bileşenli aktörü kopyalamaz;
    Alt + gizmo sürüklemesi çoğaltma ile taşımayı tek undo adımında birleştirir.
  - *Panellerin kuralları (kullanıcı kararları 2026-11-14):* gizleme (göz, H) yalnız
    editör görünümüdür: level'a yazılmaz, undo'ya girmez, sayfa level başına hatırlar;
    gizli aktör ve altı World'den çıkar. Details bileşenin şemadan formunu çizer; çoklu
    seçimde ortak bileşenler, farklı değer "Multiple Values", düzenleme yalnız o yaprağı
    her aktöre yazar (tek adım); kaydırıcı / renk sürüklemesi tek adım (birleşme +
    mühür). Sınıflı aktör etkin değeri gösterir, düzenleme alanın tam değerini override
    yazar (sınıfa eşitse düşer), override'lı alanda sıfırlama oku, bileşende Reset All;
    sınıfsız aktöre bileşen eklenir / çıkarılır. Pano sistem panosudur (`forge.actors/1`
    JSON, kökler dünya uzayında; izin yoksa sayfanın belleği); yapıştırma yeni GUID verir.
    World Settings level ayarlarını (Cell Size salt okunur) ve tekil ortam aktörlerini
    listeler (seç / ekle); ortamın değerleri bileşenlerdedir. Outliner sanallaştırılmıştır
    (`npm run bench:outliner`, 50.000 aktör).
  - *Hücreler (5b):* `editor/session/cellStreaming` yalnız kamera / tutulan
    bölgelerdeki hücreleri kısmi oturuma alır; kirli hücreler kayda kadar kalır.
    Hücre yaşamı `stream` olayıdır, dirty / undo değildir. Yüklenmemiş hücreyi
    gerektiren edit / undo / redo atomik reddedilir (Load sonrası tekrarlanır).
    Compare / Reload tutulan aktörlerin parçalarını okur; bir ajanın eski
    `level.json` aktörlerini hücrelere taşıması da buna dahildir. Outliner'ın
    World Partition sekmesi `worldMapView` üzerinden haritayı, hücre / terrain
    durumlarını, Load / Unload ve tutulan alanları gösterir (`KeptRegionsKey`).
  - *Play (A6'nın yolu):* dev server'da geçici oturum katmanı `.forge-session/<id>/`;
    editör yalnız kirli dosyaları oraya yazar, oyun sekmesi `?play=<id>` ile level'ı
    diskten bu katmanla okur. Play proje dosyalarına yazmaz; sekme yeniden yüklenince
    de çalışır. *Uygulama (adım 8, 2026-11-15; kullanıcı kararları: yalnız açık level'ın
    kirli dosyaları, salt okunur projede de çalışır):* katman `tools/server/playSessions.ts`
    (kayıt denetimi, katman + diskten hücre dizini, oturum sunucu açılışında silinir, en
    fazla 8), editör sekmesi başına tek oturum (her Play onu değiştirir, yeni sekme
    `noopener` ile açılır: kendi süreci ve GPU cihazı), oyun `?play=<id>` ile level'ı ve
    editörün perspektif kamera pozunu oturumdan alır. Asset taslakları Play'e girmez
    (asset penceresi modal; kapanış kaydeder ya da atar).
- **Oyun uygulaması:** boot + World + GameModuleHost + UI; boot hataları
  renderer kurulmadan önce de gösterilir (F10).
- **Editör Play:** v1'de bugünkü gibi yeni sekme (karar A6). Tek kurucu, editör
  ile oyun eşdeğerliğini zaten garanti ediyor.
- **A6 kararı (2026-11-10) — yeni sekme, PIE'ye hazır kurallarla:**
  - **Kayıtsız Play:** editör kaydedilmemiş level anlık görüntüsünü oyun sekmesine
    verir (dev server'da geçici oturum dosyası ya da `BroadcastChannel`); Play diske
    yazmaz. Forge'da `playTest()` önce `saveLayout()` çağırıyor, yani Play = Kaydet.
  - **World yalıtımı:** runtime durumu yalnız `World` örneğinde tutulur; modül
    düzeyinde değişebilir tekil yoktur. Bir sayfada iki World kurulup yok
    edilebildiğini bir test doğrular.
  - **Render kaynak önbelleği World'den ayrı:** geometri, doku ve pipeline
    önbelleği asset GUID'iyle anahtarlanır ve renderer'a aittir. İleride PIE'de iki
    World aynı önbelleği paylaşır.
  - Gerekçe: yeni sekme ayrı bir `GPUDevice` açar; açık dünyada VRAM iki katına
    çıkar ve her Play soğuk başlar (level yükleme + pipeline derleme). PIE kararı
    sonraya kalır, ama onu mümkün kılan kurallar 2a'da konur.

- **Uygulama kabuğu uygulaması (2a kararları, 2026-11-10):**
  - *Sözleşme çekirdekte:* `defineSubsystem({ id, tickGroups, create })`,
    tick grupları (`prePhysics` → `physics` → `postPhysics` → `renderSync`),
    tipli servis anahtarları (`createServiceKey<T>`, kimlikle karşılaştırılır)
    ve alt sistemin World'ü gördüğü `SubsystemContext` (aktörler, türe göre
    bileşenler, servisler, `spawnActors` / `destroyActors`). Bir özelliğin
    `runtime.ts`'i yalnız çekirdeği tanır; ikinci bir "runtime özelliği"
    tanımı yok.
  - *World (`src/runtime/world.ts`):* durumlar oluşturuldu → başlatıldı →
    oynuyor → bitti → yok edildi; sıra dışı çağrı hatadır. Kancalar `create`
    (init), `actorsAdded`, `actorsRemoved`, `beginPlay`, `tick`, `endPlay`,
    `dispose`; toplu çalışır (level, hücre, spawn aynı yol, F11); aktör başına
    geri çağırma yok. `beginPlay` kurulum sırasıyla, `endPlay` / `dispose` ters
    sırayla. `dt` [0, 0,1 s]'ye kırpılır. Aktör etkin bileşenleri (sınıf +
    override) kopya olarak tutar; türe göre bileşen dizini. Alt aktör ebeveyniyle
    silinir. Kancalar senkron; bir kancadan spawn, öteki alt sistemlere çağrı
    dönmeden ulaşır; kanca hatası yutulmaz. Modül düzeyinde değişebilir durum
    yok; iki World yalıtım testi (A6).
  - *Sahne kurucu (`assembleLevel` / `assembleActors`):* editör, Play ve oyun
    aynı fonksiyon (D7); eksik sınıf geliştirmede hata, üretimde aktör alt
    aktörleriyle atlanır ve bir kez raporlanır.
  - *Oyun modülü:* `defineGameModule({ id, features, onBeginPlay, onEndPlay })`;
    host modülün özelliklerini motorunkilerden sonra kurar, kancalarını en son
    kurulan bir alt sistem olarak çalıştırır. Modülün proje yolundan
    yüklenmesi oyun projesi sözleşmesinde (§4.8).
  - *Boot (`bootGame`):* özellikler → kayıt → level → normalize → World →
    döngü. Her aşamanın hatası renderer'sız boot ekranında aşama adı, sorun
    satırları ve yığınla gösterilir (F10); karede hata döngüyü durdurur,
    `endPlay("error")` çalışır, aynı ekran açılır. Ekran yalnız `textContent`
    kullanır. Zamanlayıcı ve ekran dışarıdan verilir (Node'da test edilir).
    `main.ts` motor özelliklerini `features/*/feature.ts`'ten toplar (yeni
    özellik kabuğa dokunmaz); proje yokken "Nothing to open" bilgi ekranı
    (A9: motor deposunda varsayılan sahne yok).
  - *Render aşaması ve senkronu (Faz 3 kararı, 2026-11-12):* boot'a `render`
    aşaması girer (renderer host init); hatası ve cihaz kaybı renderer'sız
    ekranda görünür. Host World'e tek bir `forge.render` alt sistemi
    (`renderSync` grubu) kurar; o, toplanan render bağlamalarını toplu
    `actorsAdded` / `actorsRemoved` ve kare başına `sync` ile çalıştırır.
    Başsız açılışta (Node, `check:projects`) host yoktur, World render'sız
    koşar. Ayrıntı §4.9.
  - *Faz 6 kararları (kullanıcı, 2026-11-19; plan Faz 6 dökümü):* alt fazlar
    6a runtime temeli → 6b oyuncu → 6c sunum ∥ 6d araçlar, 6e AI ortamı ve
    dağıtım. Taşınan alt sistemler World'e `defineSubsystem` ile bağlanırken
    legacy okuyucuları şemalı bileşenlere geçer; `src/engine/testing/` ve
    `src/engine/legacy/` faz kapısında silinir. Birinci şahıs için motor genel
    parçalar verir (kapsül hareket sorgusu, birinci şahıs kamera kipi, view
    model); türe özgü hareket / silah kuralları oyunda, motorda "FPS kipi" yok.
    Player Start kalıcı katmandadır (hücre akışına girmez, doğuş hücreler
    yüklenmeden çözülür). Oyun UI'ı `engine/ui` widget'ları; widget şemalı
    JSON, genel veri editöründe önizleme + HUD yerleşimi (anchor / konum
    sürükleme), tam görsel tasarımcı yok (K12'nin açık maddesi kapandı). Karakter
    pilotu FPS Sandbox, araç pilotu Ridgebound (K8).

### 4.8 Oyun projesi modeli (Model 2, ikinci sürüm)

- **Motor ev sahibi kalır.** Oyun projesi = manifest + içerik + oyun modülü +
  isteğe bağlı oyun özellikleri. Oyunda motor kopyası yok; motor değişikliği
  motor deposunda (Model 2'nin özü korunur).
- **SDK:** oyun yalnız `@forge/sdk` (runtime, oyun çatısı, şema tanımlama,
  kayıt oyunu, input, UI bağlama) ve editör uzantıları için `@forge/editor-sdk`
  import eder. Başlatıcının `check` komutu bu sınırı oyun deposunda da zorlar
  (§3.2-1).
- **Oyun çatısı motorda:** bugünkü `src/game` içeriğinin yeniden kullanılabilir
  kısmı `gameplay` katmanına taşınır; oyun bunları genişletir (§3.2-2).
- **Oyun özellikleri:** oyun, motorla aynı `defineFeature` / `defineComponent`
  API'siyle kendi bileşenlerini tanımlar; dev server bunları yükleyip doğrular.
  Görev ve kargo gibi veriler tipli ve doğrulanmış olur (§3.2-6).
- **Oyuna özel verinin üç tipli yeri (A7 kararı, 2026-11-10); tipsiz torba yok:**
  1. **Authored veri** → oyunun bileşenleri ve asset türleri
     (ör. `ridgebound.contract` asset'i, `ridgebound.depotPoint` bileşeni).
  2. **Aktör durumu** → şemada `persist` işaretli bileşen alanları; kayıt oyunu
     bunları `aktör GUID + bileşen kimliği + alan` anahtarıyla saklar. Actor Script
     sınıf değişkenleri de bu yoldan tipli saklanır (değişken listesi bir şemadır).
  3. **Oyun geneli durum** → `defineSaveState("ridgebound.transport", 1, {...})`:
     tipli, sürümlü, geçiş zincirli, hiçbir aktöre bağlı değil (Unreal SaveGame /
     GameInstance subsystem karşılığı). Aynı DSL ve normalize fonksiyonu (A2).

  SDK'da Forge'daki `ScriptState.persist` → `flags` gibi tipsiz bir anahtar–değer
  torbası yoktur.
  *Uygulama (2b, kullanıcı kararları 2026-11-12):* alanın `persist: true`
  bayrağı yalnız bileşenin üst düzey alanlarında (level'da yazılan, oyunda
  değişen değer: kapının `open`'ı; kayıt level değerinden farklıysa tutar);
  yalnız runtime'da var olan değerler (vites, göçük) bileşenin **`state`
  bölümünde**: level'a hiç yazılmaz, Details'te yok, varsayılandan farklıysa
  her zaman kayda girer, bileşenle aynı sürüm ve geçiş zincirini kullanır.
  `persistTransform` bileşen seçeneği yerinden oynamış aktörün transform'unu
  kayda alır. `defineSaveState(ad, sürüm, alanlar, { migrations })` özelliğin
  `saveStates`'iyle kayda girer. Yakalama / uygulama saftır; **durum defteri**
  (`SaveLedger`) hücresi boşalan aktörlerin girdisini, yok edilenleri,
  doğanları ve oyun geneli durumu tutar, hücre yüklenirken girdiyi aktör
  World'e girmeden uygular; kayıt = defter + yüklü aktörlerin o anki durumu
  (kayıt ile hücre akışı tek mekanizma). Taşınmış davranış alt sisteminin
  `ScriptState.persist`'i Faz 6'ya kadar Forge biçiminde kalır; orada gizli /
  çarpışma kapalı / yok edildi tipli alanlara, `persist(key)` davranış
  tanımının `state` şemasına çevrilir. Runtime kayıt özelliği (hızlı kayıt,
  slot arayüzü, oyuncu ve araç durumu) Faz 6. Kanıt: Ridgebound m0 kodu bugün durumu
  `as unknown as SceneJsonValue` ile `flags`'e yazıyor, elle `schema: 1` ve elle
  doğrulama tutuyor, konumsal kimliğe karşı kendi korumasını yazıyor ve oyun geneli
  bakiyeyi görev panosu aktörüne bağlıyor.
- **Uyumluluk kapısı:** motor deposunda `npm run check:projects`: yerelde kayıtlı
  oyun projelerini (git dışı `forge.projects.local.json`) mevcut motora karşı
  derler ve başsız açar; motor push'undan önce çalışır. CI'da `samples/`
  sözleşme testi görevi görür (§3.2-3).
- **SDK sürümü:** `sdk/CHANGELOG.md` + manifestte `sdkVersion`; kırıcı
  değişiklik changelog'a yazılır, mümkünse bir tur kullanımdan kaldırma
  (deprecate) ile geçilir. v0 süresince `0.x` minor artışı kırıcı sayılır;
  başlatıcı uyumsuz `sdkVersion`'lı oyunu açmaz ve ilgili changelog girdisini
  gösterir (A8).
- **Bağlantı:** başlatıcı oyunun TypeScript ayarlarını çözülmüş motor kökünden
  üretir; sabit `../../Forge` yolu yok (§3.2-5).
- **Yapı gereği sınır (A8):** üretilen tsconfig yalnız `@forge/sdk` ve
  `@forge/editor-sdk` takma adlarını tanır; `@engine/*` gibi iç takma adlar hiç
  yoktur, derin import derlenmez. Oyun kökünden dışarı çıkan göreli import'u
  `check` AST denetimi yakalar. Her şey motorun `node_modules`'undan çözülür; oyunda
  ikinci bir three kopyası oluşmaz.
- **SDK API anlık görüntüsü (A8):** SDK'nın dışa aktardığı tip yüzeyi bir dosyaya
  üretilir ve CI'da farkı denetlenir; yüzey değişirse aynı commit'te snapshot ve
  `CHANGELOG` güncellenmek zorundadır. Yerel `check:projects` CI'da çalışamadığı
  için kırıcı değişikliği motorun kendi commit'inde görünür kılan kapı budur.
  Araç (api-extractor ya da `tsc --declaration` özeti) 2a'da seçilir.
- **Motor deposunda oyun yok:** `samples/` altında dış proje biçiminde örnekler
  (starter, test-range, open-world); motorun kendi içeriği `content/engine/`;
  testler `tests/fixtures/projects/` altındaki değişmez projelerle (D14, D15).
- **Depo düzeni netleştirmeleri (A9 kararı, 2026-11-10):**
  - **İçerik paketleri:** `content/engine/` yalnız motorun açılması ve editör için
    zorunlu olanı içerir (varsayılan materyal, gizmo, editör ikonları, gökyüzü
    varsayılanları). Starter Content `content/packs/starter/` altında bir pakettir;
    proje manifestinde `contentPacks: ["starter"]` ile seçilir, oyuna kopyalanmaz.
    Üçüncü taraf kütüphaneler (Kenney vb.) motor deposuna girmez.
  - **Ağır referans içerik depo dışında:** içe aktarılmış referans sahneler
    (çok tile'lı terrain, Island, Ridgebound kopyası) ayrı bir yerel içerik
    projesinde durur ve `forge.projects.local.json` ile kaydedilir
    (`check:projects` ile aynı mekanizma). `samples/` küçük ve CI'da çalışabilir
    kalır; render kabulü zaten yerelde, gerçek GPU'da.
  - **Yazma yalıtımı kodla:** testler fixture'ı geçici bir klasöre kopyalayıp
    onun üstünde çalışır; dev server fixture ve `samples/` köklerine yazma isteğini
    reddeder. "Değişmez" kuralı belgeyle değil kodla zorlanır (D14, D18).
  - Proje verilmeden `npm run dev` `samples/starter`'ı açar; motor deposunda
    "varsayılan sahne" yoktur.
- **Dev server kimliği:** her proje kendi portunda; sunucu `/__forge/identity`
  ile hangi projeyi sunduğunu söyler, smoke testleri bunu doğrular (D14).
- **Proje oluşturma:** `create-project` aracı `samples/starter`'dan yeni oyun
  deposu üretir (Model 2'nin açık kalan boşluğu).
- **Oyun projesi sözleşmesi uygulaması (2a kararları, 2026-11-10):**
  - *Manifest:* oyun deposunun kökünde `forge.project.json`
    (`forge.project/1`): `id` (küçük harf + rakam; bileşen ad alanı), `name`,
    `sdkVersion` (`<ana>.<ara>`), `contentRoots` (varsayılan `["content"]`),
    `startLevel`, `game.module`, `devPort` (varsayılan 5190). Yollar projeye
    göreli, `..` ve sürücü yok. Normalize çekirdek DSL'iyle.
  - *SDK:* `@forge/sdk` adları tek tek dışa aktarır (toptan yeniden dışa aktarım
    yok): kimlikler, şema DSL'i, ikili asset türleri, özellik / alt sistem /
    servis, World tipleri, `defineGameModule`. Asset ve kayıt iç işleri, araçlar,
    editör dışarıda. `@forge/editor-sdk` Faz 4'e kadar iskelet. `SDK_VERSION`
    çekirdekte (araçlar da okur), SDK onu yeniden dışa aktarır.
  - *Sürüm kuralı:* v0'da ana + ara sürüm eşit olmalı; 1.0'dan sonra ana eşit,
    projenin ara sürümü motorunkinden büyük olamaz. Uyumsuz proje açılmaz,
    aradaki changelog girdileri gösterilir.
  - *API anlık görüntüsü:* TypeScript derleyici API'siyle (ek bağımlılık yok)
    dışa aktarımlar ve onların ulaştığı, `src/` içinde tanımlı her tip
    (sözdizimsel yürüyüş; denetleyicinin örneklenmiş tipleri DSL'in eşlemeli
    generic'lerinde bitmiyor) sıralı metne yazılır. `verify:sdk-api` kapıda:
    üretilen metin commit'lenene eşit ve changelog'un en üst girdisi
    `API: <hash>` taşıyor; yüzey changelog'suz değişemez.
  - *Başlatıcı (`npm run forge`):* `check` → manifest, sürüm,
    `.forge/tsconfig.json` (motorun taban derleyici ayarları + yalnız iki SDK
    takma adı, motor kökü çözülerek), tsc, AST import sınırı (proje içi göreli,
    `@forge/sdk`, `@forge/editor-sdk` yalnız `editor.ts` / `src/editor/`;
    `three`, motor yolları, Node modülleri, başka paketler reddedilir;
    `samples/` motorun `node_modules`'unu bulabildiği için çözümleme tek başına
    yetmez). `dev` → projenin `devPort`'unda motorun dev server'ı.
  - *Dev server:* proje `FORGE_PROJECT_ROOT`'tan, yoksa `samples/starter`.
    Motor deposundaki `samples/` ve `tests/fixtures/` projeleri salt okunur
    (kayıt / yükleme 403). Yazılabilir ve taranan kökler manifestin
    `contentRoots`'u. Oyun modülü `ssrLoadModule` ile yüklenir, şemaları
    kayda girer (oyun bileşenleri kayıtta doğrulanır). `/__forge/identity`
    (motor SDK sürümü, proje kimliği, başlangıç level'ı, salt okunurluk,
    açılmama nedenleri), `/__forge/classes`. Oyun modülü tarayıcıya
    `virtual:forge/game-module` ile gelir (build'de ve projesiz `null`);
    katman denetimi `virtual:forge/*`'ı çözülemez saymaz.
  - *`create-project`:* starter'ı depo dışında boş bir hedefe kopyalar,
    manifesti ve oyun modülünü yeni kimlikle yazar, level GUID'ini yeniler
    (kanonik metin + revizyon + dizin), `--register` ile
    `forge.projects.local.json`'a (git dışı) ekler.
  - *`check:projects`:* `samples/*` + yerel kayıtlı projeler; her biri için
    `forge check`, proje kaydıyla asset kapısı ve başsız açılış (motor
    özellikleri ve oyun modülü Vite üzerinden, level diskten, `bootGame` elle
    sürülen zamanlayıcıyla 3 kare). Gate'te; CI'da `samples/` sözleşme testi.
    Araç `src/runtime`'ı import etmez (katman kuralı), Vite'la yükler.
- **Depo düzeni uygulaması (2a kararları, 2026-11-10):**
  - *Manifest:* `contentPacks` (varsayılan `[]`), paket kimlikleri küçük harf,
    rakam ve tire; tekrar eden kimlik bir kez tutulur. Şema `forge.project/1`
    kalır. Paket kimliği `content/packs/` altındaki klasörün adıdır. **Paket
    manifesti (Faz 3 adım 8, kullanıcı kararı 2026-11-13):** isteğe bağlı
    `content/packs/<id>/forge.pack.json` (`{ "schema": "forge.pack/1",
    "requires": [...] }`): paketin başvurduğu paketler. Onu seçen proje
    gerekenleri de seçer (`forge check`), asset kapısı paketi gerekenleriyle
    birlikte denetler, tarama manifesti asset saymaz. worldbuilder starter'ı
    gerektirir (katman materyalleri ve dokuları).
  - *Etiketli kökler:* tarama `{ etiket, klasör }` çiftleriyle çalışır. Projenin
    kendi kökleri projeye göreli yollarıyla (`content`), motor içeriği ve
    paketler `engine:content/engine` ve `engine:content/packs/<id>` etiketiyle
    gelir; `:` proje yolunda geçersiz olduğu için çakışmaz. Referanslar GUID
    olduğundan etiket yalnız konumdur. İç içe ve tekrar eden kökler klasör
    düzeyinde reddedilir. `*.md` dosyaları asset sayılmaz.
  - *Proje dizini:* dev server, `forge check` / `check:projects` ve
    `create-project` aynı kökleri görür: proje kökleri + motor içeriği +
    seçili paketler. Seçilmemiş bir paketin asset'ine verilen referans asılı
    referans hatasıdır; seçim böyle zorlanır. Bilinmeyen paket manifest
    sorunu olur (`content-pack`), proje açılmaz.
  - *Yazma:* motor içeriği ve paketler bir projenin dev server'ından salt
    okunurdur; `/__forge/read?path=engine:...` okur (kökten kaçış, bağlantı ve
    `.` ile başlayan ad 403), `engine:` yolu proje yolu olmadığı için kayıt onu
    reddeder. *Düzenleme (Faz 4 kararı, 2026-11-13):* proje dev server'ında salt
    okunur kalır; motor deposunda `npm run dev -- --engine-content` kipinde motor
    içeriği ve paketler aynı editörden yazılır, `verify:assets` (bağımlılık yönü,
    asılı referans) korur.
    *Uygulama (Faz 4 adım 6g, 2026-11-14):* `tools/dev.ts` seçeneği Vite'tan
    önce ayırır; sunucu bütün paketleri listeler. `server/engineContentMode.ts`
    yalnız kayıtlı motor / paket köklerine ayrı yazma politikası kurar;
    `POST /__forge/content` ve `/save` mevcut işlemli kayıt servisini kullanır.
    Motor tarafına taşıma / kopyalamada kaynak ve hedef aynı kökte kalır;
    motor / paketten projeye kopyalama korunur. Kayıt yanıtında üretilen hücre
    dizinleri, hatalar ve 409 yolları `engine:` etiketlidir. Kayıttan sonra
    sınıf deposu ve editörün sınıf listesi tazelenir. Editör Save iznini açılan
    level'ın içerik kökünden alır; örnek projelerin salt okunurluğu açılmaz.
    `forge dev` motor yazma kipini devralmaz. Entegrasyon ve tarayıcı testleri
    geçici motor içeriğiyle çalışır; gerçek motor asset'lerine yazmaz.
  - *Bağımlılık yönü:* motor içeriği hiçbir pakete, bir paket başka bir pakete
    referans veremez; paket motor içeriğine verebilir. `verify:assets` motor
    içeriğini tek başına ve her paketi motor içeriğiyle birlikte dizinleyip
    asılı referansı hata sayar.
  - *Build:* üretim build'i motor içeriğini ve seçili paketleri dist'e alır;
    uygulaması dist doğrulamasıyla (editör gelince). *Uygulama (Faz 4 adım 2b,
    kullanıcı kararı 2026-11-13):* `npm run build` bir projeyi derler
    (`FORGE_PROJECT_ROOT`, yoksa `samples/starter`; eklenti oyun modülünü build'de de
    çözer), `tools/build-content.ts` dev server'ın okuyabildiği her dosyayı (proje
    içeriği, motor içeriği, seçili paketler) `dist/forge/files/` altına (`project/<yol>`,
    `engine:` etiketi `engine/`) ve kimlik (salt okunur, makine yolu boş), sınıf, asset
    dizinlerini `dist/forge/`'a yazar; sorunlu proje derlenmez. Oyunun okuduğu yüzey
    çekirdekte `ContentClient` (`read`, `identity`, `classes`); `SaveClient` onu yazma
    uçlarıyla genişletir ve yalnız dev'de kurulur (build-time sabit dal: oyun paketinde
    yazma ucu yok, `verify:dist --strict`). Üretimde `createStaticContentClient`
    `import.meta.env.BASE_URL` altından okur; alt dizin yayınını `npm run smoke:dist`
    sınar (F06).
- Model 1 oyunları Forge WebGL'de kalır.

### 4.9 Render mimarisi (özet)

Ayrıntı yeniden inşa planında (§2.3–2.6); burada yalnız mimari kararlar:

- **Materyal bileşimi:** Forge materyali = temel graf + özelliklerin katkıları
  (rüzgâr, fade, world mask, ıslaklık, göçük) tanımlı sırayla TSL düğüm
  fonksiyonları olarak birleşir. `onBeforeCompile` yaması yığılması yok (D12).
- Işık alan yüzeyler standart node materyal slotlarında (MRT sözleşmesi), tek
  `RenderPipeline`, kalite profilleri, gerçek backend doğrulaması, GPU
  timestamp, addon'lar kendi sarmalayıcılarımızın arkasında.

**Faz 3 kararları (kullanıcı onayı 2026-11-12, "hepsi öneri gibi"):**

- *Klasörler:* `src/render/{host,resources,materials,pipeline,sync,viewer}`.
  three (`three/webgpu`, `three/tsl`) yalnız burada ve `features/*/render.ts`'te.
- *Renderer host:* `WebGPURenderer` (`trackTimestamp`, `reversedDepthBuffer`,
  `antialias: true`: MSAA yalnız pipeline'sız çizimde, adım 6), `await init()`. Backend kanıtı Faz 1 S1 biçiminde
  (`isWebGPUBackend`, adaptör, özellikler, sınırlar) tutulur ve
  `data-forge-backend` ile `data-forge-perf`'e (Faz 0 düzeneğinin alanları,
  taşınmış `perfWitness`) yazılır. Rozet geliştirmede her zaman, üretimde
  yalnız WebGL2'ye düşüşte görünür ("WebGPU kabulü sayılmaz"). DPR
  `effectiveDevicePixelRatio` (kalite) ile, boyut `ResizeObserver` ile.
  Kamera host'a dışarıdan verilir (görüntüleyici, editör, oyun kamerası).
  **Cihaz kaybı v1:** render durur, renderer'sız ekran + "yeniden yükle";
  otomatik yeniden kurulum sonraki bir karar.
- *Kaynak önbelleği (A6):* host'a, yani GPU cihazına aittir, World'den
  ayrıdır. Anahtarlar `model:<guid>`, `texture:<guid>:<srgb|linear>`,
  `material:<guid>:<katkı imzası>`, `shape:<primitive>` (şekiller prosedürel
  geometri, asset değil). Her World kullandığını sayaçla alır, dispose'da
  bırakır; `045964c` ile son sahipten 30 sn sonra `AssetResidency` üzerinden
  host'un `update()` çağrısında atılır; arada yeniden alınırsa korunur.
  `disposeResource` GPU kaynaklarını bırakır; materyalin bağımsız doku
  kullanımları da bırakılır, terrain havuzu kendi sahibindedir. `pendingEvict`
  / `evicted` sayaçları var. Bu gecikmeli atma, render kaynakları için bir
  bayt bütçesi değildir; 5b'deki 16 MiB bütçe runtime'ın etkin olmayan hücre
  verisine aittir (§4.4). Pipeline
  önbelleği three'nin kendisi; derleme süresi kayda yazılır. GUID → URL
  çözümü asset dizininden (geliştirmede dev server, üretimde build'in dizini).
  glTF: KTX2 ve meshopt three'nin `examples/jsm/libs` dosyalarıyla (yeni npm
  bağımlılığı ve depoda vendor kopyası yok). Bağımsız `.ktx2` doku asset'i aynı
  `KTX2Loader`'la, dev server'ın istek başlığıyla yüklenir; KTX2 kodlaması yalnız
  araçta (`forge generate`). İki World'ün önbelleği
  paylaştığını ve birini kapatmanın ötekine dokunmadığını bir test sınar.
- *Render bağlaması:* `features/<ad>/render.ts` →
  `defineRenderBinding({ feature, create(ctx) })`, dönen nesne
  `actorsAdded` / `actorsRemoved` (toplu, F11) / `sync(frame)` / `dispose`.
  `ctx`: World'ün salt okunur görünümü (`componentsOf`, servisler, ör.
  `HeightFogStateKey`), sahne kökü, kaynak önbelleği, sis / çevre / ışık
  kancaları, etkin kalite ayarları. Oynanış kodu three nesnesine dokunmaz.
  Faz 3'te tekil bileşenler her karede karşılaştırılır, toplu bileşenler
  (static mesh, shape) ekle / çıkar ile kurulur; alan ve transform değişikliği
  bildirimi Faz 4'te editörle World'e girer. Editör ve runtime aynı host'u ve
  bağlamaları kullanır; editör çizim katmanı TRAA'dan sonra (Faz 4).
- *Adım 1'in uygulama notları (2026-11-13):* bağlama `ctx`'i şimdilik
  `world` (`services`, `actor`, `componentsOf`), `scene`, `root`, `resources`
  (World'ün sayaçlı görünümü: `model(guid)`, `shapeGeometry`,
  `shapeMaterial`, `release`) ve `lighting.sunDirection`; kalite ayarları adım
  2'de. Bağlama yalnız özelliği World'de kuruluysa çalışır. Her World'ün kendi
  `Scene`'i var; host son bağlanan World'ü çizer. Şekil anahtarları
  `shape:<primitive>` ve `shapeMaterial:<renk>:<single|double>`. GUID → URL
  geliştirmede `GET /__forge/asset-files` (ikili asset'ler: GUID → tür +
  `<kök etiketi>/<yol>`, `/__forge/read`'le okunur; kayıttan sonra yeniden
  kurulur). Kanvas öznitelikleri: `data-forge-backend` (`webgpu | webgl2`),
  `data-forge-backend-proof` (kanıtın tamamı), `data-forge-perf`,
  `data-forge-ready` (World bağlı, yüklenen kaynak yok ve ardından 3 kare) ve
  `data-forge-resource-errors`. Işıksız level'a Forge'un varsayılan güneşi;
  ortam ışığı ve arka plan Forge world settings varsayılanları (ortam 0, Forge
  gibi eklenmez; `#d7d7c7`) çevre adımına kadar (adım 5'te Sky Light'a
  geçti, aşağıda). Pipeline adım 6'ya kadar doğrudan çizim, ton eşleme yok
  (adım 5'ten beri gökyüzü varken ACES). `?level=` başka level, `?forceWebGL`
  etiketli WebGL2 kipi.
- *Materyal:* `forge.material` (§4.6) → `MeshStandardNodeMaterial`, anizotropi
  / clearcoat gerekirse `MeshPhysicalNodeMaterial`; yalnız slotlar
  (`colorNode`, `normalNode`, `roughnessNode`, `metalnessNode`, `aoNode`,
  `emissiveNode`, `opacityNode`, `positionNode`). Özellik katkıları TSL
  fonksiyonu olarak sabit sırayla: world mask → fade (5b) → rüzgâr (5c) →
  ıslaklık (5a) → göçük (8).
  *Uygulama (adım 4, 2026-11-13):* `src/render/materials/surfaceMaterial.ts`
  standart harita özelliklerini kullanmaz: dokular slot düğümlerinde,
  materyalin UV düğümünde tiling ve flipY ile örneklenir, böylece doku
  `texture:<guid>:<srgb|linear>` anahtarıyla bütün materyallerce paylaşılır
  (sıkıştırılmış doku Forge'daki gibi çevrilmez); temel renk / pürüzlülük /
  metaliklik / opaklık / emissive materyalin kendi özelliklerinden okunur, bu
  yüzden yerleşim rengi `color`'ı değişmiş bir kopyadır. Katman karışımı ve
  normal hareketi TSL'de; köşe rengi sürücüsü geometride `color` yoksa 0 okur
  (öznitelikler program anahtarında). Katkılar `contributions.ts`:
  `contributionSignature` (`none` ya da sıradaki adlar), world mask
  `maskNode` + `maskShadowNode` (henüz süren sistem yok). Materyal belgesi
  GUID'le okunur ve uygulamanın host'a verdiği `forge.material` türüyle
  normalize edilir (render özellik import edemez); dokuları host düzeyindeki
  bir sahipte sayılır (materyale aittir, ilk isteyen World'e değil). Model
  yüklenince eksik normal, GLB dokularına varsayılan anizotropi (8, GPU
  sınırı), UVW izdüşümü ve slot listesi. Static mesh slot önceliği: yerleşimin
  `materials[i]`'si → modelin varsayılanı → GLB'nin materyali.
- *Işık ve çevre bileşenleri:* `forge.directionalLight` / `forge.pointLight` /
  `forge.spotLight` (aktör başına; güneş `atmosphereSun` işaretli tek
  directional; ışıksız level'a varsayılan güneş + ortam ışığı, Forge kuralı);
  tekiller `forge.skyAtmosphere`, `forge.skyLight` (PMREM; sphere capture
  yok), `forge.cloudLayer`, `forge.postProcess`, `forge.worldEnvironment`.
  Alanlar Forge'un `engine/scene/*` normalize'ından ve Details'inden (Height
  Fog örneği gibi; TR ipucu, EN ad, kaydırıcı aralığı). Forge'un World
  Settings alanları sahibi özelliğin tekiline dağılır (render alanları Faz 3'ün
  tekillerine; view distance 5b, rüzgâr 5c, yerçekimi / kill Z / game mode 6);
  tek bir `forge.worldSettings` bileşeni yok, World Settings paneli (Faz 4)
  tekilleri tek yerde gösterir. Gölge: güneşte `CSMShadowNode` (Forge'un
  bölmeleri `customSplitsCallback` ile, kamerayı düğüm kendi alır), öteki
  durumda takipli tek harita; taşınan `engine/world/{sunCascades,followShadow}`.
  *Uygulama (adım 3, 2026-11-13):* özellik `src/features/light` (üç bileşen,
  aktörün -Z'si boyunca parlar), gölge yardımcıları `src/render/sync/sunShadow.ts`.
  Bağlama `ctx`'ine `quality()`, kareye `camera` eklendi; ortak
  `lighting.sunDirection`'ı varsayılan güneş ya da `atmosphereSun` ışığı
  yazar. Gölgeli öteki yönlü ışıklar (Forge'da susturuluyordu) takipli
  haritayla gölge düşürür; Forge'un sınır haritası, kademeli kaskat yenileme
  ve doku birimi bütçesi yok. Gölge bias'ı −0,0005, normal bias 0,02 (takipli
  harita dahil). Ana gölge anahtarı (`shadowsEnabled`) host'ta; çevrilince
  sahnenin lit materyalleri yeniden kurulur. *Adım 9 (2026-11-13):* yönlü
  ışık ve hedefi render kökünde (dünya çerçevesi) durur, her karede bileşenin
  holder'ından yerleşir; nokta / spot ışık holder'ın altında kalır.
  `CSMShadowNode` ışığın yerel konumunu ve hedefini dünya sayar ve kaskat
  ışıklarını ışığın ebeveynine ekler: dönük / taşınmış bir aktörün altında
  kaskatlar görüşü ıskalıyordu (terrain level'larında hiç statik gölge yoktu;
  Faz 0 ızgarasında bulundu).
  *Island düzeltmesi (2026-11-16):* r187 `ShadowNode.setupShadowFilter`
  XY'yi [0,1] ve Z'yi yalnız ≤ 1 denetler. Ters derinlikte far düzleminin
  ötesindeki alıcı Z < 0'dır; kamera yükselince boş takip haritası bile
  zeminde kamerayı izleyen koyu dörtgen oluşturuyordu. Takipli yönlü
  harita `render/sync/boundedShadow.ts`'teki `BoundedShadowNode` ile alt
  Z ≥ 0 kontrolünü de uygular; three'nin filtresi, harita menzili ve bias
  korunur. Düğüm kamera hareketinde yeniden kurulmaz. CSM'ye geçişte
  takip düğümü serbest bırakılır; CSM kapanınca özel düğüm alanı silinir
  (`undefined`, fallback sözleşmesi), takip düğümü sonraki sync'te kurulur.
  CSM kaskatlarının örneklemesi değişmez. GPU regresyonu
  `tests/smoke/followShadow.smoke.ts`: gerçek WebGPU'da normal / ters
  derinlik, boş harita içinde / dışında aydınlık zemin ve gerçek kutu
  gölgesi; fixture authored level'a yazmaz.
- *Editör çizim katmanı (Faz 4 kararı, 2026-11-13):* gizmo, ızgara, seçim çerçevesi
  ve yardımcı çizimler pipeline'ın çıktısından sonra, jitter'sız kamerayla ayrı bir
  pass'te çizilir; derinlik testi sahne pass'inin derinliğine karşı. Picking CPU'da:
  mesh ve instance (instance → aktör tablosu), terrain yükseklik alanından. Küçük
  resimler editörde aynı renderer'la üretilir, `.forge-cache/thumbnails/<guid>-
  <revizyon>.png`'de tutulur (commit'lenmez). *Uygulama (adım 3, 2026-11-14):* host'un
  overlay kancası her karenin sonunda çağrılır (TRAA view offset'ini pipeline'dan sonra
  kaldırır, kamera jitter'sızdır). Katman kendi MSAA hedefine çizer, parçalar sahne
  derinliğiyle shader'da karşılaştırılır (`sceneVisibility`), hedef canvas'a ton
  eşlemesiz, sRGB kodlanarak bindirilir (yardımcı renkleri level'ın pozlamasından
  bağımsız). Sahne derinliği pipeline'ın sahne pass'inden gelir; pipeline'sız çizilen
  kare (MSAA) three'nin çok örnekli çerçeve tamponuna gider ve WebGPU derinliği
  çözemez: o karelerde yalnız editör, derinlik yazan görünür nesneleri tek ışıksız
  materyalle bir kez daha çizer (derinlik ön geçişi; gölge pass'i yok). Picking
  etiketleri render bağlama sözleşmesinin parçası (`render/sync/pickTags.ts`): nesnenin
  aktörü, instance batch'inin instance → aktör tablosu, kendi ışınını yanıtlayan yüzey
  (terrain: `raycastTerrain`; çizilen yama GPU'da yer değiştirdiği için üçgenleri
  denenmez). Seçim çerçevesi katmanın pass'i: seçili parçalar maskeye, maskenin dış
  kenarı katmana (Forge'un rengi; örtülen kenar da görünür). Gizmo katmanın son
  pass'idir (adım 4): derinlik testi kapalı, sahnenin ve öteki yardımcıların üstünde
  (Forge); tutamak seçimi yardımcılardan ve sahneden önce gelir.
- *Çevre, uygulama (adım 5, 2026-11-13):* tekiller `forge.skyAtmosphere` +
  `forge.skyLight` (tek özellik `forge.sky`: Sky Light gökyüzünü yakalar),
  `forge.cloudLayer`, `forge.worldEnvironment`. **Kullanıcı kararları
  (2026-11-13):** Forge'un `worldSettings.backgroundColor / ambientColor /
  ambientIntensity`'si `forge.skyLight`'ın (Sky Light = level'ın ortam
  aydınlatması: yakalanan gökyüzü şiddeti, düz ortam ışığı, gökyüzü yokken
  arka plan; Sky Light'sız level Forge varsayılanları `#d7d7c7` / ortam 0);
  gökyüzü görünürken dünyanın çıktısı ACES + pozlama × 0,2 (Forge'un
  `applySkyToneMapping`'i), adım 6'da pipeline'ın ton eşleme pass'ına geçer.
  WES: sabit `hour` (gün uzunluğu alanı yok, karar 8), `sunPath`, `night`,
  `season`, `weather` Forge biçiminde; `surface` 5a, `wind` 5c. Alt sistem
  taşınmış `WorldEnvironmentController`'ı yükler ve `WorldEnvironmentKey`
  (`engine/environment`, render okuyabilsin diye engine'de) ile verir.
  Render: WES yorumu (`resolveEnvironment`) her karede bağlamalardan önce bir
  kez `ctx.environment.override`'a; güneş ışığı ve varsayılan güneş rengini,
  şiddetini, ay gölgesini ve yönünü (`render/sync/sunOverride.ts`), sis /
  bulut / gökyüzü pusu / ay / yıldız / ortam tabanı / pozlama bağlamalarda
  alınır, gece dolgusu `forge.worldEnvironment`'ın bağlamasında. Bileşenler
  yazılmaz; yorum bitince bileşen yeniden çizilir. Bağlama `ctx`'ine
  `environment`, `output` (ton eşleme, pozlama; host sunarken uygular) ve
  `capture` (host'un PMREM'i) eklendi. Gökyüzü three'nin TSL `SkyMesh`'i
  (iç bulutları kapalı) + Forge'un ayı ve yıldızları renk düğümünde
  (`render/materials/sky.ts`); Sky Light güneş diski / ay / yıldızsız ayrı
  bir gökyüzünü 256'lık PMREM'e yakalar, saçılım ya da güneş değişince,
  WES altında Forge'un açı politikası ve parlaklık telafisiyle; bulut
  kubbesi `render/materials/clouds.ts`. Sisin CPU ikizi için
  `engine/world/viewDistance.ts` 5b'den öne alındı.
- *Kalite:* Forge'un merdiveni (ultra / high / medium / low / custom),
  uyarlamalı kalite ve donanım ipuçları olduğu gibi taşınır (ilke #2: kalite
  yalnız kapatır / küçültür). WebGPU izin alanları ayrı adımda:
  `traaAllowed`, `ssrAllowed: off | half | full`, `ssgiAllowed`,
  `aoResolutionScale`. Eşleme: ultra / high → Balanced (TRAA + GTAO + bloom +
  SSR yarım), medium → GTAO'suz Balanced, low → Compatibility; **Cinematic**
  (SSGI + SSR tam) merdivenin dışında ayrı bir seçim, uyarlamalı kalite ona
  çıkmaz. Profil efekti açmaz, level'ın yazdığına izin verir.
  *Uygulama (adım 2, 2026-11-13):* modüller `src/engine/perf` ve
  `src/engine/persistence/userSettingsStore`; Cinematic `QualityLevel`'da ayrı
  `cinematic` değeri (`CINEMATIC_PROFILE` = Ultra + SSGI + SSR tam), merdiven
  (`QUALITY_LEVELS`), donanım ipucu, ölçüm kalibrasyonu ve adım fonksiyonları
  onu görmez, yalnız oyuncu seçer. Forge `RuntimeSceneApp`'in kalite kuralları
  (açılış ipucu, 12 sn ölçüm, 0,5 sn uyarlama, başka sekmeden seçim)
  `src/runtime/quality/runtimeQuality.ts`'te; renderer'a `setQuality` ile
  gider, piksel oranı `effectiveDevicePixelRatio`. Donanım ipucunun GPU dizesi
  WebGPU adaptöründen. `applyQualityToPostProcess` eski `ResolvedPostProcess`'e
  bağlı olduğu için `forge.postProcess` ile adım 6'da taşınır.
- *Pipeline:* MRT'li sahne pass'i → GTAO / SSGI / SSR → TRAA → bloom / DoF →
  tonemap + pozlama; profil ya da Post Process değişince yeniden kurulur, her
  karede değil. **MRT bütçesi:** biçim sıkıştırma, `requiredLimits` yok:
  output RGBA16F (8) + normal RGBA8 (8) + velocity RG16F (4) + metalrough RG8
  (2) + diffuse RGBA8 (8) = 30 ≤ 32 bayt / örnek; bir test her profilin
  toplamını sınar. Post Process `reflection: off | ssr`, `antialias: none |
  traa | smaa`.
- *Pipeline, uygulama (adım 6, 2026-11-13):* `src/render/pipeline`: `pipelinePlan`
  (üç'süz: geçitlenmiş Post Process + kalite → sıralı pass'lar, MRT hedefleri, bayt,
  yeniden kurma anahtarı), `renderPipeline` (tek three `RenderPipeline`; sahne pass'i
  MSAA'sız, MRT hedefleri yalnız okuyan pass'lar için; sıra sahne → GTAO ya da SSGI
  → SSR → TRAA ya da SMAA → DoF → bloom → renk düzeltme → renk sapması → vignette →
  gren → ton eşleme + pozlama; anahtar, World ya da kamera değişince yeniden kurulur,
  yazılan sayılar uniform), `output` (Forge'un pozlama kuralı), `mrtProbe` (açılışta
  cihazda tam MRT setiyle doğrulama hatası kapsamında bir pipeline; sonuç perf ve
  smoke kaydında). Pass'sız plan doğrudan çizilir; renderer `antialias: true`, MSAA bu
  yolda (Forge her level'ı MSAA ile çiziyordu; kullanıcı kararı 2026-11-13). Post
  Process özelliğinin render bağlaması yok: `render/sync/output.ts` her karede
  bağlamalardan önce `forge.skyAtmosphere` ve `forge.postProcess`'i adıyla okur,
  Post Process'i `applyQualityToPostProcess`'ten geçirir (bileşen verisine
  uyarlandı, + TRAA / SSR) ve `ctx.output`'u (salt okunur: ton eşleme, pozlama,
  `skyRadiance`, geçitlenmiş Post Process) yazar. Kural: Post Process varken onun ton
  eşleyicisi ve pozlama × 0,2, yoksa gökyüzü varken ACES × 0,2, yoksa ton eşlemesiz;
  WES çarpanı hepsine. **Kullanıcı kararları (2026-11-13):** Post Process varken
  gökyüzü kubbesi kendi pozlamasıyla (× 0,2'siz) sahneye göre çizilir; SSGI, profil
  izin verirse (Cinematic) level'ın AO'sunun yerine çalışır (yeni alan yok). Forge
  ölçekleri korunur (bloom ×0,001, RGB shift ×0,01, GTAO yarıçapı ×0,1); DoF three'de
  CoC modeli (tam bulanıklık uzaklığı Forge'un `maxBlur / aperture` oranı). MRT
  toplamları: ultra / high / medium 22, low 8, cinematic 30 bayt.
- *Olay bazlı gün saati:* `forge.worldEnvironment`'ta sabit `hour`; sürekli
  gün döngüsü yok. `WorldEnvironmentService.transitionTo({ hour, seconds })`
  saati yumuşak geçişle ilerletir, sonra durur (saf modül
  `engine/environment/timeTransition.ts`, taşımadan ayrı). Geçişte sky light /
  IBL yeniden yakalama sıklığı ölçülerek seçilir (`recapturePolicy`'nin açı
  eşiği ve PMREM maliyeti).
- *Olay bazlı gün saati, uygulama (adım 7, 2026-11-13):* `timeTransition.ts`
  saf (smoothstep, simülasyon saniyesi, adımların toplamı süreye yuvarlanır);
  taşınmış `WorldEnvironmentController`'a `transitionTo` / `transitioning`
  eklendi, `advance` geçişi yürütür, `forge.worldEnvironment` alt sistemi
  `prePhysics`'te tick'ler. **Kullanıcı kararları (2026-11-13):** dönüş
  `Promise<boolean>` (hedefe vardı: true; yeni geçiş, `setHour`, level boşalması
  ya da WES yokluğu: false); zaman hep ileri (hedef küçükse gece yarısı geçilir,
  aynı saat geçiş değil); süresiz / mesafesiz istek saati anında kurar. Sky Light:
  yakalama aynı PMREM hedefine (`CapturedEnvironment.recapture`; yeni doku her
  yakalamada onu örnekleyen materyalleri yeniden kuruyordu); WES altında karar
  `recaptureRate.ts` (**kullanıcı kararı, ölçümden:** Forge açı politikası +
  güneş hareket ederken en az 0,1 sn + güneş durunca son konumda bir yakalama;
  hava / mevsim anında, kaydırılan saat hiç). Ölçüm: yakalama ~3,3–3,5 ms GPU
  (256, NVIDIA Ampere); düzenek `npm run measure:sky-capture`, dev'e özel
  `window.__forgeDev` (kare döngüsünü duraklatıp adımlar, `runtime/steppableScheduler`).
- **WES ve prosedürel bitkiler — ortak sözleşme (plan, kullanıcı kararı
  2026-11-14; henüz uygulanmadı):**
  - **Sorumluluk:** WES mevsim, hava, rüzgâr, kar / ıslaklık ve çevre
    geçişlerinin tek otoritesidir. Bitki ailesi yaprak döken / herdem yeşil
    ayrımı, mevsimsel yapraklılık / renk hedefleri, rüzgâr esnekliği, odun /
    yaprak kar kabulü ve ıslanma tepkisini tanımlar. Ortak bitki sistemi
    aile + WES durumunu tekil aktör ve foliage için aynı kuralla çözer.
  - **Üretim / çalışma zamanı ayrımı:** geometri ve dokular Node / editör
    araçlarında önceden üretilir, kalıcı dosyadır. Oyun bitki ailesini ve
    ortak tepki sistemini yükler; mevsim değişirken geometri üreticisi
    çalışmaz. Odun ve yapraklar ayrı çizilebilir, aynı dal iskeleti korunur.
    Üretim seed'i sınırlı prototip geometrisini, örnek seed'i renk / rüzgâr
    fazı / dökülme çeşitliliğini belirler; her örnek yeni mesh oluşturmaz.
  - **Veri / katman:** aile asset'i ve tekil bitki bileşeni şemalıdır;
    referanslar GUID, foliage örnekleri mevcut kompakt hücre verisidir.
    Saf tepki çözümü `engine`, WES servis tüketimi özellik alt sistemi,
    TSL / GPU çizimi render bağlaması ve 5c yolundadır. Ortak three kodu
    `src/render/…` içinde kalır; yeni katman kuralı gerekmez. Ağaç başına
    script, CPU tick veya özel materyal üretilmez. Tür hesapları ve GPU
    kaynakları paylaşılır; örnek farklılıkları kompakt veridir. Editör
    aynı davranışı `inEditor` yaşam döngüsünde gösterir.
  - **Mevsim:** ilkbaharda yaprak görünmesi, yazın tam yapraklılık,
    sonbaharda renk / yaprak kaybı, kışın çıplak odun veya herdem yeşil
    profil uygulanır. WES hedef ve geçiş ilerlemesini yönetir; otomatik
    takvim önkoşul değildir. Yaprak / küme kararlı kimliğinden dökülme
    eşiği çıkar; aynı seed / ilerleme aynı görünürlüğü verir. Bu geçiş
    alanları mevcut şemada var sayılmaz, uygulamada eklenir.
  - **Örtü ve ışık:** kış mevsimi ile `snowCoverage` bağımsızdır; kar kabul
    maskeleri odun / yaprak ve yukarı bakan yüzeyle birleşir, `wetness`
    renk / pürüzlülüğü etkiler. İlk kapsam görseldir; collider odunsu
    taban temsiline bağlıdır. Kar yükü fiziği, biyolojik büyüme ve yaprak
    başına fizik yoktur. Gündüz–gece mevcut güneş / ay / ortam ışığından
    gelir; bitkinin ikinci bir aydınlatma saati olmaz.
  - **Zaman politikası:** sabit `hour` ve olay bazlı `transitionTo` kararı
    korunur. Günün saati, geçen simülasyon süresi ve mevsim ilerlemesi
    ayrıdır. WES birikim / erime / kurumayı ölçekli simülasyon süresi ve
    şemada birimleri tanımlı oranlarla yürütür; saat farkını geçen süre
    saymaz. Saat sabitken simülasyonla örtü / rüzgâr ilerleyebilir, pause'da
    durur. Önizleme hedefi doğrudan gösterebilir; tarihsel yaprak efektleri
    mevsim atlamasında veya hücre yüklemesinde yeniden oynatılmaz.
  - **Temsil tutarlılığı:** aynı yapraklılık, kar ve rüzgâr LOD / kart /
    impostor, kullanılan HLOD proxy'si ve gölge geçitlerinde karşılanır.
    Rüzgârın sınır genişlemesi culling'de dikkate alınır. Yaz atlasını
    beyazlatmak kışın çıplak siluetini karşılamaz. PG3 ölçümüyle odun / yaprak
    ayrımı seçildi (PK7, 2026-11-19): mevsim atlası yok. Çevre geçişi shader
    yeniden derlemesi gerektirmez (ölçüldü: pipeline ve shader modülü +0).
  - **Sahiplik / akış:** mevsim aktör GUID'ini, foliage örnek sayısı ve
    transform / seed dizilerini değiştirmez; bitki asset'leri, terrain
    paint / yükseklikleri ve fizik materyalleri yazılmaz. Yeni hücre güncel
    WES'ten kurulur. Save-game WES durumunu ortak otoritede tutar; bitki
    görünümünün türetilebilir değerleri ağaç başına kaydedilmez. Editör
    önizlemesi geçicidir. WES yoksa taban görünüm ve mevcut level /
    varsayılan rüzgâr politikası kullanılır. Oyun etkileşim script'leri
    tekil aktöre ayrıca eklenebilir; foliage ↔ aktör dönüşümü ilk kapsamda yoktur.
  - **Faz bağı:** 5a WES terrain örtüsünü ve ortak rüzgârı (adım 7), 5c bitki
    tüketicilerini bağlar. PG0–PG3 küçük üretici / CLI dilimi 5c ile birlikte
    bir yaprak döken ve bir iğne yapraklı kabul ağacı sağlar; tam araçlar
    PG5 / 5d'dedir. Eski Forge WES K2/K3 maddeleri WebGL'e yama olarak
    taşınmaz; TSL, şema ve servis modeliyle gerçekleştirilir. Eski WES
    belgesi salt okunur tarihsel referanstır; üretilen bitkide tekil ağaç /
    foliage mevsim eşitsizliği ve hazır kış modeli gereksinimi kalkar.
  - **Kabul:** üretici ayrıntıları, açık temsil ölçümü PK7 ve PV-WES-01–08
    matrisi [prosedürel bitki planında](PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md)
    §6.9 / §10 / §11'dedir. Gerçek WebGPU'da üretilmiş ormanla G6, geçişin
    en uzun karesi, GPU süresi, toplam / tepe bellek ve hücre döngüsü ölçülür.
- *Terrain:* Faz 3'te salt çizim (spike S2'nin TSL CDLOD'u: yükseklik, 8
  katman, normal, gölge); su birikintisi, tile akışı ve üretim kalitesi 5a'da;
  kıyı ıslaklığı ve kostik su gövdeleriyle Faz 7'de. HLOD 5b'de.
- *Terrain, Faz 5a kararları (kullanıcı, 2026-11-15; uygulamalar aşağıda):*
  - *Kapsam:* Forge'un `terrainShoreWetness` / `terrainCaustics`'i göl, nehir ve
    okyanus gövdelerinden beslenir; o gövdeler Faz 7'de gelir, iki özellik de
    onlarla. INV-G14 bölünür.
  - *Su birikintisi:* uzamsal `forge.puddle` bileşeni (§4.4: aktör, kök
    konumunun hücresinde). Forge'un çamur, önizleme, yansıma, dalgacık ve rüzgâr
    alanları şemada; Details şemadan, özel panel yok. Yansıma `reflector()` ile
    planar (Faz 7'nin düz yüzey kararının ilk kullanıcısı), kalite profiline
    bağlı. İçe aktarıcı `puddleWaters`'ı çevirir.
    *Uygulama (adım 6, 2026-11-15; kullanıcı kararları):* bileşenin dünya konumu
    tohum noktası (X / Z) ve su seviyesidir (Y); bileşende yalnız çalışma alanı
    `size` (Forge'un `puddleRegionAroundSeed`'i). Yatak, ızgarası tohumu içeren
    ilk terrain'dir (otomatik; `terrainRef` saklanmaz). Doldurma render
    bağlamasında: alanın tile'ları terrain'in okuyucusuyla (en çok 16), Forge'un
    `terrainPuddleSteps`'i karede 2 ms'lik dilimlerle; başarısız doldurma önceki
    yüzeyi korur. Sonuç dünya servisi `PuddleStatusKey` (Details okur). Planar
    yansıma `render/sync/puddleReflections.ts`: Forge'un seçimi `reflector()`
    düğümleriyle (seviye + kalite başına paylaşım, en çok 2, `bounces: false`),
    tavan kalite profilinin `terrainWaterQuality`'si. Malzemede Forge'un
    radyans karışımı ortam yoğunluğu (1 − güç) ve Fresnel'li ek terimle. Rüzgâr
    dalgacığı WES `wind`'iyle (adım 7), tekerlek dalgacığı araçlarla (Faz 6 / 8).
  - *Tile akışı:* terrain aktörü kalıcı katmanda kalır; tile'lar kamera
    çevresinde slot havuzuna (64) akar, uzak alan global haritadan çizilir.
    Tile çözme Web Worker'da (`src/runtime`; `engine` DOM'suz kalır). Editör
    aynı akışı kullanır, düzenlenen tile bellekte sabittir (`keptTerrainTiles`).
    Frustum kesimi açıktır. 5b'nin hücre akışından bağımsızdır.
    *Uygulama (adım 2, 2026-11-15):* Forge'un `TerrainRuntimeStreaming`'i ve
    altındaki akış çekirdeği (`engine/world/worldStreamingSubsystem.ts`, 5b'den
    öne alındı) olduğu gibi; akışın sahibi şimdilik terrain'in render
    bağlamasıdır (World başına, collider'sız). Faz 6'da collider gelince akış
    fizikle paylaşılacağı yere, bir alt sisteme taşınır. Worker havuzu render
    katmanında, terrain kaynağının yanında (`render/resources/terrainWorkerPool.ts`;
    worker giriş modülü `engine/world/workers/terrainWorker.ts`, three'siz).
    Kaynak, global harita parçası geçerli çok tile'lı terrain'i akıtır; tek tile
    ya da haritası olmayan / uymayan terrain bütün tile'larını bir kerede okur.
    Görünüm (`render/sync/terrainView.ts`) Forge'un `TerrainRenderer` kurallarıyla:
    64 slot, karede en çok 4 yükleme (katman başına `addLayerUpdate`), görüş ve
    gölge ışıklarının (CSM kaskatları dahil) yan düzlemleriyle kesim, delik
    doldurma. Hazır olma: tile okumaları önbelleğin `track`'iyle yükleme sayılır,
    yerleşim akışı ve slotları oturana kadar `busy` tutar (`data-forge-ready`).
    Düzenlenen tile'ın sabitlenmesi düzenleme araçlarıyla (5d) gelir.
    *Katmanlar (adım 3, 2026-11-15):* Forge'un aydınlatılmış katman gölgelendiricisi
    TSL'de. Katman albedoları tek dizi dokusunda (`render/materials/terrainLayerArray.ts`,
    CPU'da paketlenir; dokular çevrilmeden yüklendiği için katmanın çevirmesi açık
    verilir; sıkıştırılmış doku okunamaz, katman renkle çizilir — Forge gibi),
    pürüzlülük haritası albedo alfa'sına, normal haritaları ve detay atlası (2x2 →
    dört dilim) ikinci, doğrusal dizide: katman sayısı ne olursa olsun iki bağlama
    (WebGPU'nun evre başına 16 dokusu gölge kaskatlarıyla paylaşılıyor). Katman
    normali terrain normalinin teğet uzayında; statik detay damgaları
    `render/materials/terrainDetail.ts` (dallanmasız seçim, türevler tek tip akışta).
    Global haritadaki delik `maskNode` ile her geçişte kesilir. Normaller half-float
    (float32 süzme özelliği gerekmez). Kalite: `terrainSelfShadow` gölgeyi ve gölge
    kesimini, `terrainFarTiling` materyalin yeniden kurulmasını sürer.
  - *Collider eşleşmesi (Faz 1 G8):* `engine/physics/terrainCollider` (Rapier
    heightfield) 5a'da kurulur; Node testi görsel yüksekliğin CPU ikizini
    collider'la, render smoke'u GPU'dan okunan yüksekliği aynı noktalarda
    karşılaştırır. Collider'ın World'e bağlanması Faz 6.
    *Uygulama (adım 5, 2026-11-15):* CPU ikizi `engine/terrain/terrainVisualHeight.ts`
    (terrain vertex gölgelendiricisinin karşılığı: düğüm, morph, tile'da b–c
    köşegeni, global haritada bilinear; nokta rasterlenen üçgende). Gölgelendirici
    değişirse ikiz aynı commit'te değişir; render smoke'u ikisini karşılaştırır.
    GPU tarafı: terrain materyali isteğe bağlı bir yükseklik sondası verir (aynı
    vertex aşaması ve delik kesimi, piksel başına dünya XYZ + 8192 ofset),
    `render/sync/terrainHeightProbe.ts` görünümün yamasını ana kameranın LOD'u ve
    morph'uyla üstten float hedefe çizer. Ölçüm (`render/viewer/debug/terrainColliderMatch.ts`)
    yalnız dev'de, `window.__forgeDev` üzerinden dinamik import'la; terrain görünümünü
    sahnedeki debug etiketinden bulur (`tagTerrainView`). Rapier Vite'ın
    `optimizeDeps`'inde.
  - *WES örtüsü:* `forge.worldEnvironment` sürüm artışıyla `surface`: kar /
    ıslaklık hedefi ve birimi tanımlı birikim / erime / kuruma oranları. Birikim
    simülasyon süresiyle ilerler, `transitionTo`'nun saat atlaması geçen süre
    sayılmaz; durum WES servisinde ve kayıt oyununda. Terrain materyalinde
    ıslaklık katkısı (sıra yukarıda: world mask → fade → rüzgâr → ıslaklık →
    göçük). Authored paint, yükseklik ve fizik materyali yazılmaz; editör
    önizlemesi geçicidir, level'a yazılmaz.
    *Uygulama (adım 7, 2026-11-15; kullanıcı kararları):* `forge.worldEnvironment@2` v1'i partial-safe identity migration ile okur; yeni alanların nötr varsayılanları normalizasyonda gelir. `surface.snowCoverage / wetness` açılıştaki örtü ve hedeflerdir; mevsim / hava hedefleri değiştirmez. `snowAccumulationRate / snowMeltRate / wettingRate / dryingRate`: 0–1 örtü / simülasyon saniyesi; varsayılan 0,01 / 0,005 / 0,1 / 0,01, sıfır tutar. Saf `engine/environment/surfaceAccumulation`; controller `advance(dt)` saatin farkını kullanmaz, sabit saatte de ilerler, pause'da durur. `setSurfaceTarget` hedef, `setSurface` anlık atama / önizleme; mevsim ve örtü bağımsızdır. Ortak WES state'i (geçerli saat / mevsim / hava, örtü ve hedefler) bileşenin A7 `liveEnvironment` runtime state'ine yansır; level belgesine yazılmaz. Save/load aynı durumdan devam eder, ağaç başına kayıt yoktur. Editör sürgüleri doğrudan gösterir, yalnız Make Default authored hedefleri tek undo adımıyla değiştirir; dosya baytları ve Play izolasyonu testlidir. Terrain `materials/surfaceCover` katkısını sabit sırada (wetness) kullanır: ıslaklık renk / pürüzlülük, kar renk / pürüzlülük + yukarı bakan geometrik normal / dünya yüksekliği maskeleri; yalnız uniform güncellenir, paint / yükseklik / fizik materyali, vertex / G8 ve shader grafiği değişmez. Birikinti `materials/puddleWind`: Forge'un iki normal katmanı, eğrisel tepeler, paket / esinti pencereleri, türev süzme / pürüzlülük genişlemesi TSL'de; yansıma kamerasının projeksiyonu eğimi planar okumaya taşır. `PuddleWindMotion` simülasyon süresiyle beslenir, boş normal dalgacık üretmez. Normal World cache'inden ödünç, generation koruması geç yüklemenin silineni diriltmesini engeller; World'ün kaynaklarına host'un texture kaynağı da verilir. İçe aktarıcı surface / wind'i v2'ye çevirir, `--compare` yazılmış değerleri de karşılaştırır. Bitki tüketimi / PG0–PG3 5c'de.
  - *Teşhis ve bakım:* `?debug` terrain haritası 5a'da; öksüz tile modülü
    taşınır, ayrı araç yerine `verify:assets` raporlar.
    *Öksüz parçalar (adım 8, 2026-11-16):* `tools/terrainOrphans.ts`, Forge'un
    `collectJsonStrings` algoritması ve kalan 1 A testi; sahiplik yeni modele
    uyarlanır. Kayıtlı `forge.terrain` tanımı aynı içerik kökünde olmalıdır;
    tile ayrıca tanımın `data.tiles[].key` listesinde olmalıdır. Global harita
    aynı kökteki tanıma aittir. Level'a yerleştirilmemiş terrain normal bir
    asset'tir, öksüz sayılmaz. `verify:assets` ve `check:projects`
    `orphan-terrain-part` hatasını dosya / tanım yoluyla raporlar; dosya
    silmez. Okunamayan tile listesi boş liste kabul edilmez.
    *Uygulama (adım 4, 2026-11-15):* harita Forge'un `debugTerrainMap`'i
    (`render/viewer/debug/debugTerrainMap.ts`), okumada Forge'un akış satırları.
    Akışın sahibi render bağlaması olduğu için panel bağlamayı tanımaz: bağlama
    akan terrain'in mesh'ini akışı ve son kaynaklarıyla etiketler
    (`render/sync/debugTags.ts`, `pickTags` gibi), panel sahneyi tarayıp anlık
    görüntüyü saf fonksiyonla kurar (`engine/terrain/terrainStreamingDebug.ts`).
    Akış Faz 6'da alt sisteme taşınınca etiket yerine o alt sistemden okunur.
    Pick yüzeyi (`terrainPickSurface`) ışını Forge'un renderer'ı gibi terrain'in
    yerel çerçevesinde atar: tile'lar ve far map yükseklikleri datum'a göreli.
- *Görüntüleyici, uygulama (adım 8, 2026-11-13):* **Instancing** canlı batch
  (`render/sync/instanceBatches.ts`): parça başına `InstancedMesh`, yerleşim rengi
  instance rengi (Forge'un bölen kuralı), batch anahtarı static mesh'te model + slot
  override'ları + gölge, shape'te primitif + gölge (beyaz materyal); batch önbellek
  kullanımlarını tutar, son yerleşimiyle gider. **Terrain** `render/materials/terrain.ts`
  (spike'ın TSL CDLOD'u, untyped TSL yalnız bu modülde) + `render/resources/terrains.ts`
  (`terrain:<guid>`: belge, bütün tile'lar, katman girdileri `SurfaceMaterials.terrainLayer`);
  dev server veri belgelerini GUID tablosuna koyar, parçalar `AssetUrls.part` ile
  belgenin yanından; kamera 0,1 m kıpırdayınca LOD yeniden seçilir, frustum kesimi
  yok (5a), landscape materyali çizilmez. **Kamera** Forge'un varsayılan kamera
  kontrolleri (`engine/camera/cameraControl.ts` olduğu gibi,
  `render/viewer/flyCamera.ts`); çerçeve yerleşimlerin oda sınırından, terrain
  hariç (`userData.framing = false`). **`?debug`** (`render/viewer/debug`, dinamik
  import): Forge'un saf biçimlendiricileri `engine/perf/perfReadout.ts`, sahne
  maliyeti `engine/perf/sceneCost.ts` (kaynak etiketi `staticMesh` / `shape` /
  `terrain`), 0,5 sn'de bir okuma, "Scene cost" tablosu; GPU sweep, kare
  yakalama, terrain haritası, hız kontrolü 5a / 6 (kullanıcı kararı).

### 4.10 Kalite altyapısı

- **Test koşucusu:** Vitest; testler modülün yanında, merkezi kayıt dosyası yok
  (D1: `engine-tests.ts` 29.975 satır). Yavaş testler dosya adıyla
  (`*.slow.test.ts`) ayrılır; bugünkü `--filter` / `--slow` alışkanlığı korunur.
  **A5 kararı (2026-11-10):** Vitest yalnız birim ve entegrasyon testleri için;
  editör / runtime uçtan uca smoke'ları Playwright'ta kalır. Vitest uygulamayla
  aynı Vite çözümünü kullanır (`@forge/sdk` takma adı testte de geçerli, A4).
  Test dosyası test ettiği dosyanın katman kuralına uyar (A3; ör. `schema.test.ts`
  three import edemez). Forge karşılıkları: `--filter` → dosya / `-t` filtresi,
  `--slow` → `slow` Vitest projesi, `--timing` → Vitest süre raporu. Forge'un 873
  `check()` çağrısı + 174 test dosyası 2b'de `test()`'e mekanik olarak çevrilir.
  Vitest browser mode 2a'da yok; Faz 3'te ihtiyaç ölçülürse ayrı karar.
- **Fixture'lar değişmez**; smoke testleri örnek projelere yazmaz (D14).
- **CI:** tip kontrolü (iki tsconfig), katman denetimi + öz-testi (A3), birim testleri, build, dist doğrulaması (editör sızıntısı),
  boyut / performans bütçeleri kapı olarak (F07). CI'da GPU yok: UI ve veri akışı
  smoke'ları açıkça etiketli `forceWebGL` test kipiyle çalışır (TSL WebGL2
  backend'inde de çalışır); render kabulü yerelde, gerçek GPU'da. Bu kip hiçbir
  zaman "WebGPU çalışıyor" sayılmaz. *Editör smoke'ları (Faz 4 kararı,
  2026-11-13):* CI'da bu kipte, her koşuda geçici bir proje kopyasında (D14);
  Playwright Chromium CI'a girer. Yerelde gerçek WebGPU'da da koşar. *Tam set
  (Faz 4 adım 10):* Forge'un `editor-authoring` testinin tam karşılığı (yerleştir,
  araçlar, gizmo, Details'te X, undo / redo, kayıt sürerken meşgul Save, diskte dosya,
  yeniden aç, Play) ve Forge'un editör smoke'larının kapsamdaki adımları; ortak
  yardımcı `tests/editor/support.ts` sayfa hatasını, her `console.error`'ı ve 400 üstü
  her yanıtı (`409 POST /__forge/save` biçiminde) hata sayar; tasarım gereği eksik
  yanıtlar (hücresiz level'ın `cells.json`'u, önbellekte olmayan küçük resim) ve testin
  bilerek ürettiği 409 açıkça izinlidir. `npm run smoke:editor:webgpu` aynı seti
  başlıklı Chrome'da `forceWebGL`'siz koşar; her açılan editör ve Play sekmesi
  `data-forge-backend` = `webgpu` kanıtlar.
- **Render regresyon smoke'u (Faz 3 kararı, 2026-11-12):** `npm run
  smoke:render`, Playwright (`@playwright/test`, Forge'daki sürüm, tam sabit),
  başlıklı Chrome (`channel: "chrome"`, gerçek GPU), port 5283, referans
  projesi. Sahne × poz başına: poz `forge.play.cameraPose`'a, hazır sinyali
  `data-forge-ready` (yükleme bitti + kaynaklar çözüldü + N kare; gizli doğan
  katmana bakılmaz), `isWebGPUBackend` false ise koşu başarısız, görüntü
  `page.screenshot({ clip })`, boş görüntü kontrolü (parlaklık standart
  sapması eşiği), eşikli karşılaştırma (`toHaveScreenshot`). Kayıt: commit,
  three, backend kanıtı, tarayıcı, GPU / sürücü, poz, çözünürlük / DPR,
  profil. Referans görüntüler depo dışında (`Games/ForgeReference/render-refs/`;
  içerik lisansı doğrulanmadı), kullanıcı kabulünden sonra güncellenir.
  Uygulama (adım 1): `tests/smoke/`; referans yoksa çekim
  `render-refs/candidates/`'e yazılır ve koşu geçer, referans yalnız
  `-- --update-snapshots` ile yazılır; kayıt ve çekim `render-refs/runs/`'a;
  sunucu her koşuda yeniden başlatılır, var olan sunucu kullanılmaz. Gate'e
  ve CI'a girmez; `render/**` ya da `features/*/render.ts` dokunan push'tan
  önce elle çalışır. *Tam set (adım 9, 2026-11-13):* terrain level'ları Faz 0
  pozlarında (P1–P3, konum + kuaterniyon `baseline/poses.json`'dan), L03 p1,
  Faz 0 pozu olmayan iki level görüntüleyicinin çerçevelemesiyle (15 çekim);
  render smoke'u Faz 0 çekimlerinin boyutunda (1920 × 1080, DPR 1), kamera /
  `?debug` smoke'ları ve ölçümler 1280 × 720. `npm run smoke:grid` her pozun
  Faz 0 WebGL çekimini smoke'un son WebGPU çekimiyle yan yana koyan yerel
  sayfayı (`render-refs/grid.html`) yazar; eşleşmeyenleri başta listeler.
  Referanslar kullanıcı kabulüyle yazıldı (2026-11-13); karşılaştırma
  `maxDiffPixelRatio` 0,01 (GTAO / gren gürültüsü bu eşiğin içinde, ikinci
  koşu 15 / 15).
- **Terrain performans ölçümü (5a adım 8, 2026-11-16):** `npm run
  measure:terrain`, `tests/smoke/terrainMeasure.config.ts`: smoke sunucusu /
  gerçek WebGPU, uncapped Chrome; dört terrain sahnesinin Faz 0 P1–P3 pozları,
  1920 × 1080 ve 2560 × 1440, DPR 1, sabit `high`, adaptive kapalı. 10 sn
  ısınma, 15 sn ham rAF örneği (ortalama / medyan / p95 / en uzun kare).
  GPU timestamp-query'nin 120 örneklik hareketli ortalaması 500 ms'lik perf
  kaydından alınır; ham kare süreleriyle karıştırılmaz. Soğuk: yeni context +
  temiz HTTP cache; sıcak: aynı sekmenin reload'u. OS / sürücü shader cache'i
  temizlenmez. `measurementPage.ts` yalnız testte, navigasyondan önce WebGPU
  shader / pipeline API gecikmesini ve hazır canvas zamanını ölçer; async
  gecikmeler örtüşebilir, toplamları yükleme / saf derleyici süresi değildir.
  Ayrıca Derekavak editöründen Play, yeni sekme / cihaz / modül grafiğiyle
  ölçülür (editörün ısıttığı HTTP cache ayrıca belirtilir). Commit, dirty,
  three, tarayıcı, backend, GPU / sürücü, poz, profil ve ham örnekler
  `render-refs/runs/*-terrain-measure.json`'a; GPU bellek baytı erişilemiyorsa
  null ve gerekçesi. 1080p ortalama ≤ 14 / p95 ≤ 16,6 ms; 1440p ≤ 16,6 /
  p95 ≤ 20 ms terrain diliminin bütçeleridir. Foliage / su gövdeleri / oyun
  henüz yok; G1 içerik eşdeğerliği ve tam dünya G2 / G3 / G6 kabulü sayılmaz.
  WES'in kuru / ıslak / karlı çekimleri ve debug paneli olmadan birikinti
  `render-refs/candidates/`'e yazılır; `smoke:grid` bunları ayrıca
  `#terrain-effects` altında gösterir. Aday dosyaları kabul edilmiş referans
  dosyalarının yerini almaz. **Kullanıcı kabulü (2026-11-16):** Faz 5a görsel
  kabulü, Island son canlı incelemesi dahil onaylandı; plandaki 5a Terrain
  kutusu kapandı. Bu belge güncellemesinde referans görüntüler yenilenmedi
  ve testler yeniden çalıştırılmadı. 5b–5d ile Faz 5 toplu kapısı açık.
- **Dağıtım tabanı:** bütün URL'ler `base`'e göre; alt dizin yayını ilk günden
  test edilir (F06).
- **Asset kökeni:** içe aktarmada tür + lisans + kaynak zorunlu; CI'da kapı
  (D16).
- **Hata yüzeyi:** şema / yükleme hataları editörde görünür; boot hata ekranı
  renderer'dan bağımsız (D17).
- **Belgeler:** bu rapor mimari sözleşmedir; mimariyi değiştiren karar rapora
  kodla aynı ya da hemen sonraki docs commit'inde yazılır.
  `docs/architecture/ARCHITECTURE.md` rapordan kısa haritadır, kararları
  tekrar yazmaz; haritadaki bir şey değişirse aynı commit'te güncellenir
  (2a kararı, 2026-11-11). Yeniden inşa planı tek ana plandır; biten fazın
  ayrıntısı faz kapanınca `docs/archive/`'e taşınır (`INDEX.md`).
  `CLAUDE.md` kısa kurallar içerir; bir tuzak not edilecek hâle geldiyse önce
  tasarımla kaldırılması düşünülür (D18).

### 4.11 Ajanlarla çalışma düzeni

- **İki yüzey (§0.0):** insan editörden, ajan dosya ve komutlardan aynı
  kanonik veriye yazar. İkisi de aynı düzenleme modelinden (`src/core/edit`) ve
  kayıt servisinden geçer; doğrulama, undo ve çakışma kuralı tektir.
- **Ajan düzenleme komutları (A12):** ajan büyük bir level ya da hücre
  dosyasını okuyup yeniden yazmak yerine yapılandırılmış komutla değiştirir
  (aktör ekle / taşı / sil, bileşen alanı yaz, sınıf override'ı). Komutlar
  editörün kullandığı işlemlerdir, CLI'den çağrılır; çıktı kısa (yeni kimlik,
  değişen dosyalar, doğrulama hataları). Faz 4. *Faz 4 kararları (2026-11-13):*
  `npm run forge -- edit --project … --level … <komut>`; yazanlar ekle / taşı /
  sil / alan yaz / sınıf override'ı, okuyanlar `find` (ad, bileşen, yakınlık) ve
  `show <id>`; kısa metin, `--json`. CLI kayıt servisinin modülünü doğrudan
  çağırır (dev server gerekmez; aynı doğrulama, günlük, revizyon). Editör açıksa
  dev server dosya değişikliğini bildirir: kirli olmayan dosyalar kendiliğinden
  tazelenir, kirli dosyada "yeniden yükle / karşılaştır" şeridi.
  *Uygulama (Faz 4 adım 9, 2026-11-15; kullanıcı kararları: `add` sınıf ya da bileşen
  türüyle, toplu kip, motor içeriği ve paketler yalnız okunur, asset penceresi de tazelenir):*
  `npm run forge -- edit --project … --level … [--json] <komut>`; `-` stdin'den satır başına
  bir komut okur, hepsi tek kayıt. Yazanlar `add` (`--class` ya da `--component <yerel>=<tür>`,
  `--at` / `--rot` / `--scale` / `--parent` / `--set`), `move` (`--to` / `--by` / `--rot` /
  `--scale` aktörün kendi dönüşümü, ebeveyn uzayında, Details gibi; `--parent` dünya yerini
  korur, Outliner gibi), `delete` (altındakilerle), `set <yol>=<değer>` (yol bileşenin yerel
  kimliğinden ya da `actor.`'dan; değer JSON, ayrıştırılamazsa metin; sınıflı aktörde alanın
  bütün değeri override), `reset` (override'ı kaldırır); okuyanlar `find` (`--name`,
  `--component`, `--class`, `--near` + `--radius`, `--limit`) ve `show <id> [--effective]`.
  Kimlik GUID ya da benzersiz öneki. Her yazma editörün işlemidir (`src/engine/edit`:
  actorOps, hierarchy, actorFields, newActor; adım 9c'de editörden taşındı), çekirdek level
  oturumunda bir düzenleme; level bütün hücreleriyle yerel istemciden okunur ve editörün
  kaydedicisiyle (`saveLevelSession`) bir kez kaydedilir. Çalışamayan komut hiçbir şey
  kaydetmez; 409'da level yeniden okunup komutlar bir kez daha koşar, ikinci 409 çıkış 2.
  Çıktı satır başına bir aktör (GUID, ad, tür / sınıf, dünya konumu), kaydedilen dosyalar ve
  uyarılar (sınıra çekme); `--json` aynısını tek nesnede verir. Editör tarafında
  `editor/session/liveRefresh.ts`: oturumun (`LevelSession.fileRevision`) tutmadığı revizyonda
  level dosyası değişiklik sayılır; paket süren kaydı bekler (`EditorSession.idle`), kendi
  kaydı böylece ayırt edilir. Temiz level Reload'la izler (undo geçmişi temizlenir), kirliyse
  409 şeridi; Content Browser, renderer'ın dosya tablosu, sınıflar, sahnenin kullandığı
  asset'ler ve asset penceresi (temiz taslak yeniden okunur) da izler. *Kabul:* gate 2.021 test, 57 editör ve 1 dist smoke; editör ↔ komut level dosyaları bayt bayt aynı (`agent.spec`, `forceWebGL`; gerçek WebGPU koşusu yapılmadı).
- **Genel veri editörü (A13):** oyun kendi veri türünü şemayla tanımlar
  (`registerAssetType`, A7); Content Browser'dan açılan asset, Details ile aynı
  form kitiyle şemadan üretilen bir formla düzenlenir (tablo görünümü dahil).
  Oyuna özel düzenleme arayüzü yazılmaz. Faz 4. *Faz 4 kararı (2026-11-13):*
  motorun asset editörleri de bunun üstüne kurulur, özelliğin kaydettiği
  önizlemeyle: materyal (küre), static mesh (`forge.model` içe aktarma ayarları +
  model; çarpışma Faz 6), aktör sınıfı (bileşen ağacı, Add Component, sınıf
  varsayılanları). Elle yazılmış ayrı asset editörü yok.
  *Uygulama (Faz 4 adım 7, 2026-11-14):* `editor/assets` ortak belge
  adaptörleri (JSON asset / model meta / aktör sınıfı), revizyonlu oturum,
  bağımsız undo / redo ve tek pencere. Content Browser çift tık / Open,
  yerleştirilmiş kaynağa Ctrl+E; Save / Discard / Cancel geçişi korur.
  Formlar mevcut UI kitinden, dizilerin sanallaştırılmış tablosu aynı taslağı
  düzenler (bileşik değer seçili satır ayrıntısında). Kayıt mevcut `/save`:
  kanonik belge tekrar okunur, 409 taslağı korur; Reload onaylıdır.
  `render/editor/assetPreview` host'un tek canvas / GPU'sunu geçici sunum
  yüzeyine alır; level / thumbnail döngüsü durur, kapanınca geri döner.
  Taslak geometri ve materyaller özeldir; orbit / pan / zoom / Focus ortak.
  Materyal küresi, model slot / UVW gizmosu / vertex doldur-sil, izole editör
  World'ünde sınıf bileşen ağacı / varsayılanları bu oturumun üstündedir.
  Sınıf önizlemesi kadrajı renderSync sonrası gerçek geometriyle hesaplanır.
  Başarılı kayıt asset kaynaklarını, sınıfları, sahne kullanıcılarını ve küçük
  resmi tazeler; kirli level ve override'lar yazılmaz / değiştirilmez.
  Sunucu görünür level / hücrelerin override'ını geçersiz kılan sınıf
  değişikliğini reddeder (dosya ve aktör mesajda); otomatik level göçü yoktur.
  Cache sahibi yüklediği kaynak neslini bırakır: eski kullanımın bırakılması
  kayıttan sonra edinilen yeni kaynağın sayacını azaltmaz. Model yükleyici
  vertex varsayılanlarını primitive kimliği / topolojiyle uygular; uyuşmazlık
  kayıtlı renk verisini değiştirmez. HTTP / asset şemaları aynı kalır.
  *Kabul:* gate 1.957 test, 47 editör ve 1 dist smoke; asset akışları
  başlıklı gerçek WebGPU'da 8/8, render smoke 17/17. Referanslar değişmedi.
  Çarpışma Faz 6'da; Mesh Paint, otomatik topoloji onarımı ve gelişmiş 409
  karşılaştırması bu adımın dışında kalır.
- **Özellik "bitti" tanımı:** şema + runtime + render bağlaması + editör yüzeyi
  (otomatik ya da özel) + kayıt turu testi + özellik README'si.
- Özellik README'leri, Ridgebound'daki `FORGE_INTEGRATION.md` gibi elle tutulan
  kaynak haritalarının yerini alır; SDK yüzeyi + README'ler ajanın girişidir.
- Paralel oturum kuralı sürer: yol sınırlı commit (`git commit -- <yollar>`).

---

## 5. Korunacak iyi tasarımlar

- three'siz motor sınırı (`engine/` ~70.000 satır bunu kanıtladı).
- `ForgeGameModule` yaşam döngüsü ve hatalı modülü karantinaya alma.
- Capability modülleri (22) ve tipli servis anahtarları (40).
- Düşen alan güvenlik ağı fikri (artık şemanın doğal parçası).
- World Builder'ın deterministik üretimi, CLI'ı ve istek allowlist'i.
- Model 2 başlatıcısı, proje kökü izolasyonu (SP-05/06), yeniden üretilebilir
  build kaydı (`build-record.json`, `verify:build`).
- Undo / redo komut modeli (artık şema farklarından otomatik).
- `verify:dist` editör sızıntı kapısı, `?debug` performans araçları, spike
  düzeni.

---

## 6. Yeniden inşa planına etkisi

Bu rapor [yeniden inşa planının](FORGE_WEBGPU_REBUILD_PLAN.md) iki önerisini
değiştirir:

1. **Veri formatı aynı kalmaz (eski K3).** Yeni tek tip format (§4.4) + Forge
   WebGL level'larını ve sidecar'larını bir kez çeviren tek yönlü içe aktarıcı
   (`tools/import-forge-webgl`). Referans level'lar, World Builder dünyaları ve
   Ridgebound içeriği bununla gelir. Forge WebGL'in normalizer'ları iyi
   tanımlandığı için çeviri izlenebilir bir iştir. Geriye uyumluluk (iki formatı
   birlikte yaşatmak) hedeflenmez.
2. **"Önce taşı, sonra iyileştir" daralır.** Algoritmalar olduğu gibi taşınır
   (fizik, terrain verisi, AI, nav, hareket, ses, diyalog, World Builder
   algoritmaları). Veri modeli, serileştirme, kayıt, uygulama kabuğu ve editör
   bu rapora göre yeniden tasarlanır. Cut-over fazı ikiye bölünür: **2a mimari
   iskelet**, **2b alt sistemlerin taşınması + içe aktarıcı**.

---

## 7. Riskler

| Risk | Önlem |
|---|---|
| Şema DSL'i gereğinden büyür | 2a'da yalnız bugün kullanılan alan türleri (sayı, bool, enum, renk, vektör, transform, asset ref, aktör ref, dizi, nesne, metin; §4.5); yenisi ihtiyaç olunca |
| Tek tip modelde performans (binlerce aktör) | Instancing render katmanında otomatik; foliage kompakt dizi; Faz 1 S4 ölçümü + 2a'da 50.000 aktörlük yükleme / kayıt ölçümü |
| SDK'yı erken dondurmak | v0 süresince SDK değişebilir; changelog zorunlu, uyumluluk kapısı kırılmayı hemen gösterir |
| İçe aktarıcı her eski alanı taşıyamaz | Taşınamayan alan sessiz düşmez, rapor edilir; Ridgebound içeriği kopya üzerinde denenir |
| Mimari iskelet uzar, görsel değer gecikir | Faz 1 spike'ı iskeletten bağımsız ve 2a ile paralel (plan kararı 2026-11-10); 2a dar kapsamlı, ilk özellik (Height Fog) iskeletin kabul testi |

---

## 8. Kararlar

| ID | Konu | Öneri | Durum |
|---|---|---|---|
| A1 | Level veri modeli | Tek tip aktör + bileşen (§4.4) + tek yönlü içe aktarıcı | **Karar 2026-11-10:** tek tip aktör + şemalı bileşen, GUID'ler; bileşenler aktör içinde yerel kimlikli ve uzamsal olanlar `parent` + yerel transform taşır (Forge sınıflarındaki bileşen hiyerarşisi alt aktörsüz taşınsın); prefab farkı `bileşen kimliği + alan`; statik mesh yerleşimi de aktör, toplu yerleşim instanced static mesh bileşeni, foliage kompakt; tek yönlü içe aktarıcı. Hibrit (ayrı yerleşim dizisi) D3'ü geri getirdiği için reddedildi. K3'ü kapatır |
| A2 | Şema tanımı | Kendi ince DSL'imiz (UI metadata, geçiş zinciri ve Node yüklemesi için); doğrulama kütüphanesi (Zod / Valibot) yok | **Karar 2026-11-10:** kendi DSL'imiz; tanımlar gezilebilir veri; yükleme ve kayıt tek normalize fonksiyonu (eksik → varsayılan, sınır dışı → sınıra çek, bilinmeyen → geliştirmede hata / üretimde rapor); DSL'den JSON Schema dışa aktarımı. Zod / Valibot SDK yüzeyini dış sürüm döngüsüne bağladığı, JSON Schema kaynağı codegen ve kötü geliştirici deneyimi getirdiği için reddedildi (§4.5) |
| A3 | Katman zorlaması | TypeScript proje referansları + dependency-cruiser | **Karar 2026-11-10:** dependency-cruiser tek kural kaynağı (AST + gerçek TS çözücüsü, yol ve dosya rolüne göre kurallar) + kasıtlı ihlal fixture'ıyla öz-test; iki tsconfig (uygulama + Node araçları). Katman başına TS projesi, dört katmana yayılan dikey özellik klasörüyle (§4.3) sürtüştüğü için reddedildi; A4'teki "katman başına tsconfig" buna göre düzeltildi (§4.2) |
| A4 | Depo yapısı | Tek npm paketi, katmanlar klasör; workspaces yok | **Karar 2026-11-10:** öneri olduğu gibi — tek `package.json` / `node_modules`, iki tsconfig (uygulama + Node araçları; katman sınırı A3'e göre dependency-cruiser'da, katman başına tsconfig yok), SDK takma adı `paths` + Vite alias. Katman başına workspace paketi A3'ü tekrarladığı ve ikinci three kopyası riski taşıdığı, "workspaces'a hazır" giriş dosyası kuralı belirsiz kazanç için sürtünme getirdiği için reddedildi (§4.2) |
| A5 | Test koşucusu | Vitest, testler modülün yanında | **Karar 2026-11-10:** Vitest (birim + entegrasyon), testler modülün yanında, merkezi kayıt yok; uçtan uca smoke Playwright'ta; test dosyaları A3 katman kurallarına tabi; browser mode Faz 3'te ayrı karar. `node:test` takma adlar için yükleyici / bundle adımını geri getirdiği için reddedildi (§4.10) |
| A6 | Editör Play | v1'de yeni sekme; aynı sayfada Play (PIE) sonra ayrı karar | **Karar 2026-11-10:** v1 yeni sekme + PIE'ye hazır kurallar — kayıtsız Play (anlık görüntü sekmeye verilir, Play diske yazmaz), World yalıtımı (modül düzeyinde değişebilir tekil yok; iki World testi), World'den ayrı GUID anahtarlı render kaynak önbelleği. PIE ayrı karar olarak kalır; v1'den PIE Faz 4'ü büyüttüğü ve durum sızıntısı riski taşıdığı için reddedildi (§4.7) |
| A7 | Oyuna özel veri | Oyunun kendi şemalı bileşenleri; `flags` yalnız serbest durum için | **Karar 2026-11-10:** üç tipli yer, tipsiz torba yok — authored veri oyunun bileşen / asset türlerinde; aktör durumu `persist` işaretli bileşen alanlarında (GUID + bileşen kimliği + alan anahtarı); oyun geneli durum `defineSaveState` ile tipli, sürümlü, aktörsüz. `flags` torbası, aktöre bağlı olmayan durumu yine tipsiz bıraktığı için reddedildi (§4.8) |
| A8 | Oyun–motor sözleşmesi | `@forge/sdk` + `@forge/editor-sdk`, `sdkVersion` + changelog, yerel `check:projects` kapısı | **Karar 2026-11-10:** öneri + iki sıkılaştırma — üretilen tsconfig yalnız SDK takma adlarını tanır (derin import yapı gereği derlenmez, göreli kaçış AST ile yakalanır); SDK API anlık görüntüsü CI'da fark kapısı (snapshot + changelog aynı commit'te). v0'da `0.x` minor kırıcı; uyumsuz `sdkVersion` açılmaz. `exports` + `file:` paket sınırı A4 ile çakıştığı ve ikinci three kopyası riski taşıdığı için reddedildi (§4.8) |
| A9 | Depo düzeni | `samples/` dış proje biçiminde, `content/engine/`, `tests/fixtures/projects/`; motor deposunda oyun yok | **Karar 2026-11-10:** öneri + üç netleştirme — `content/engine/` yalnız zorunlu içerik, Starter Content manifestte seçilen `content/packs/starter/` paketi, üçüncü taraf kütüphane depoya girmez; ağır referans sahneler depo dışı yerel içerik projesinde (`forge.projects.local.json`); fixture / `samples/` yazma yalıtımı kodla (testler geçici kopyada, dev server yazmayı reddeder). Ayrı örnek deposu CI sözleşme testini kaybettirdiği için reddedildi (§4.8) |
| A10 | Asset modeli: kimlik, manifest, referans bütünlüğü | Kimlik asset'in yanında durur, merkezî manifest doğru kaynak değildir. JSON asset'ler (level, materyal, aktör sınıfı) `id`'yi kendi içinde taşır; ikili asset'ler (GLB, doku, ses, terrain tile) yanlarında `*.meta.json` taşır (GUID, tür, lisans, kaynak, içe aktarma ayarları). GUID → yol dizini dev server'ın ve build'in **ürettiği** bir önbellektir, commit'lenmez. Referanslar yalnız GUID'dir; taşıma / yeniden adlandırma referans kırmaz. Silmede ters referans dizini bakılır, kullanılan asset uyarısız silinmez; asılı referans geliştirmede hatadır (düşen alan kuralıyla aynı) | **Karar 2026-11-10:** öneri olduğu gibi — kimlik asset'in yanında (JSON'da `id`, ikilide `*.meta.json`), GUID → yol dizini üretilen önbellek, referans yalnız GUID, silmede ters referans kontrolü, asılı referans geliştirmede hata. Commit'li merkezî manifest tek dosyada paralel oturum çakışması ve taşımada elle güncelleme getirdiği, yol tabanlı referans taşımada kırıldığı (D5'in asset tarafındaki tekrarı) için reddedildi (§4.6) |
| A11 | Hücre / akış veri modeli | Level başına sabit 2B ızgara; hücre boyutu level ayarında. Dosyalar: kalıcı katman (`level.json`) + hücre başına bir aktör dosyası + hücreleri ve revizyonlarını listeleyen dizin (atomik kayıtta en son değişen dosya, §4.6). Aktör, kök konumunun düştüğü hücreye aittir; alt aktör ebeveyninin hücresinde durur. Sınırları hücreden büyük aktör kalıcı katmana alınır (editör önerir). Hücreler arası referans GUID'dir ve "henüz yüklü değil" geçerli bir durumdur; runtime kodu çözülmemiş referansı ele almak zorundadır. Editör kamera çevresini akışla yükler; kirli hücre kaydedilene kadar boşaltılmaz; dünya çapı işlemler (World Builder üretimi, GUID ile arama, toplu geçiş) yüklü World üzerinden değil, Node araçlarıyla dosyalar üzerinden çalışır | **Karar 2026-11-10:** öneri olduğu gibi — tek ızgara + kalıcı katman, hücre başına dosya + dizin, editör de akışla çalışır, dünya çapı işlemler Node araçlarında. Çok kademeli ızgara v1 için fazla karmaşık olduğu (sonradan eklenebilir), editörün bütün hücreleri yüklemesi D10'u geri getirdiği için reddedildi (§4.4) |
| A12 | Ajan düzenleme komutları | Editörün düzenleme modeli (`src/core/edit`) üzerinden CLI komutları: aktör ekle / taşı / sil, bileşen alanı yaz, sınıf override'ı; kısa çıktı | **Karar 2026-11-11 (kullanıcı):** öneri olduğu gibi, Faz 4. Gerekçe §0.0: ajan büyük JSON'u okuyup yeniden yazmaz, token harcamaz; insan ile ajan aynı işlemlerden ve doğrulamadan geçer |
| A13 | Genel veri editörü | Oyunun şemalı veri asset'leri (ekonomi, denge, tablolar) şemadan üretilen formla, Details ile aynı kitle düzenlenir; tablo görünümü | **Karar 2026-11-11 (kullanıcı):** öneri olduğu gibi, Faz 4. Forge'daki Data Table editörünün (INV-C12) yerini alır; oyuna özel düzenleme arayüzü yazılmaz (§0.0) |
