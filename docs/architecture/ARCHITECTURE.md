# Forge WebGPU — Mimari

Kısa harita. Kararlar, gerekçeleri ve uygulama ayrıntıları
[mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md) (A1–A11 ve "2a
kararları" bölümleri); burada tekrar yazılmaz. Çelişkide rapor geçerlidir. Faz
sırası [yeniden inşa planında](../planned/FORGE_WEBGPU_REBUILD_PLAN.md).

**Ürün tezi (rapor §0.0):** AI ajanıyla büyük oyun yapmak için motor. İnsan
istem yazmadan editörden düzenler (level, aktör, Details, genel veri editörü
A13); ajan az token harcayan hazır sistemle çalışır (kanonik küçük dosyalar,
şemalar, düzenleme komutları A12). Bir özellik ancak bu iki yüzeyden birine
hizmet ediyorsa girer; kapsam kararları plan K12'de.

## Katmanlar

`src/` altında, aşağıdan yukarı. Kuralların tek kaynağı
`.dependency-cruiser.cjs`; `npm run verify:layers` kasıtlı ihlal fixture'ıyla
kendini de sınar (rapor §4.2, A3).

| Katman | İçerik | three |
|---|---|---|
| `core` | aktör / bileşen modeli, şema DSL'i ve kaydı, kimlik, level ve hücre modeli, asset modeli, düzenleme modeli, alt sistem sözleşmesi, proje manifesti | yok; DOM ve `import.meta.env` de yok |
| `engine` | three'siz alt sistemler (fizik, terrain verisi, nav, hareket, ses…; 2b'de taşınır, kapsam K12) editörün gizmo matematiği (`engine/gizmo`: sürükleme, snap, pivot) ve düzenleme işlemleri (`engine/edit`: çoğalt / sil / grupla, hiyerarşi, Details'in alan ve override düzenlemesi, Add Actor'ün yeni aktörü; editör ve ajan komutları ortak); DOM ve Web Audio yok, düz Node'da yüklenir | yok |
| `render` | renderer host, GUID anahtarlı kaynak önbelleği, render bağlamaları, materyaller, pipeline, görüntüleyici (Faz 3; rapor §4.9); editörün 3B kodu `render/editor/` (viewport, editör kamerası, çizim katmanı, ızgara, picking, seçim çerçevesi, yardımcı bağlamalar, gizmo çizimi; yalnız editör yükler, Faz 4) | tek sahip (`three/webgpu`, `three/tsl`) |
| `runtime` | World, sahne kurucu, oyun modülü host'u, boot; kamera çevresindeki hücre dosyalarını getirip aktörleri kuran / boşaltan `runtime/streaming/cellStreaming` (A11); tarayıcı API'si gereken alt sistem kodu (`runtime/audio`) | dolaylı |
| `gameplay` | yeniden kullanılabilir oyun çatısı (Faz 6) | yok |
| `editor` | editör: DOM ve servisler; yalnız dinamik import, oyun bundle'ına girmez (Faz 4) | yok; 3B kodu `render/editor/`'da |
| `sdk`, `editor-sdk` | oyun projelerinin import edebildiği tek yüzey | — |
| `tools/` (Node) | dev server, kayıt servisi, asset kapısı, başlatıcı ve ajan komutları (`forge edit`, `forge hlod`), World Builder CLI, Forge WebGL içe aktarıcısı, ölçümler | yok |

`src/core` ve `features/*/schema.ts` düz Node'da yüklenir (`verify:node-load`);
`src/**` Node modülü import etmez.

R7 otomatik LOD: three'siz türev veri / üretici `engine/geometry`, Node cache ve
build `tools/triangles`, seçilebilir GPU / WebGL2 bağı ve worker `render/triangles`.
Kararlar ve kabul sınırları [rapor §4.4](../planned/FORGE_WEBGPU_ARCHITECTURE.md);
genel statik geçiş R9 (varsayılan `auto`, ağır parçalar GPU yolunda; R9b S1); occlusion
culling iptal (R9b Z0), iç mekân görünürlüğü R9b bölge sistemi: çekirdek `engine/world/zones.ts`
ve `zoneGeneration.ts` / `zoneLevel.ts`, çizim `render/sync/zoneDrawing.ts` (instanced bölme,
GPU yolunda örnek başına bölge maskesi), şemalar ve editör `features/zone`, araç `tools/zones`.

## Özellik klasörü

Bir özellik tek klasördür: `src/features/<ad>/{schema,runtime,render,editor,feature}.ts`
+ test + README. `feature.ts` `defineFeature({ id, components, assetTypes,
saveStates, subsystems })` döner ve ne `editor.ts`'i ne `render.ts`'i anar
(`feature-does-not-name-editor`, `feature-does-not-name-render`); editör host'u
`editor.ts`'leri (`defineFeatureEditor`, `@forge/editor-sdk`: Outliner ikonu ve
tür grubu; Faz 4 adım 5) toplar, `render.ts`'leri (`defineRenderBinding`) uygulama
girişi `main.ts` Vite glob'uyla toplayıp render host'a verir, çünkü `render`
katmanı `features/`'ı import edemez (rapor §4.3, §4.9). Başsız açılışta render
yok. Yeni özellik kabuk dosyasına dokunmaz: `main.ts` özellikleri klasörden
toplar. Örnek ve iskeletin kabul testi: `src/features/height-fog` (rapor §4.3).
Özelliğe özgü editör yardımcı çizimi `editorRender.ts` (three + editör;
`defineEditorRenderBinding`, editör toplar ve editör World'ünde `forge.editorHelpers`
ile çalıştırır; rapor §4.2). Render bağlamaları çizdiklerine aktörünü etiketler
(`render/sync/pickTags.ts`); editörün picking'i ve seçim çerçevesi bunu okur.
Asset sunumu / araçları `defineFeatureEditor({ assetEditors })`, 3B
önizlemeler `editorRender.ts`'nin `assetPreviews` kaydıyla gelir (SDK 0.1.10,
Faz 4 adım 7). `editor/assets` tek pencere, revizyonlu belge oturumu ve
şemadan form / sanallaştırılmış tabloyu sağlar; materyal, model ve sınıf
araçları bunu kullanır. `render/editor/assetPreview` aynı renderer / canvas'ı
geçici alır, özel taslak kaynakları kapanışta bırakır. Başarılı kayıt sahne
kullanıcılarını tazeler; kirli level yazılmaz. Sunucu sınıf / instance
override uyumsuzluğunu kayıtta reddeder (rapor §4.11).

Ağaç tarifinin aynı pencerede seed ve LOD seçilebilen bir görünümü vardır.
`render/editor/treePreview.worker` saf üreticiyi çalıştırır. Kalıcı aile üretimi
geliştirme sunucusunda ayrı bir Node worker'ından aynı CLI üreticisine gider.

## Veri modeli

- **Planlanan WES / bitki birleşimi (2026-11-14):** bitki ailesi ve tekil
  aktör / kompakt foliage'ın ortak çevre tepkisi için [mimari rapor §4.9](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
  ve [üretici planı](../planned/PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md) geçerlidir.
  PG0–PG3 ve iki starter aile 5c'de kabul edildi. Tam araçlar 5d'de sürüyor.
- **Planlanan hava sistemi (Faz W, 2026-11-25; uygulanmadı):** yağış, yağış
  siperi, ıslanma / kuruma, su birikintisi, terrain kar yüksekliği; sözleşme
  rapor §4.9'da.
- Level'da her şey bir aktördür: kalıcı GUID, transform, `parent`, şemalı
  bileşenler (aktör içinde yerel kimlikli, uzamsal olanlar hiyerarşili). Aktör
  sınıfı (`forge.actorClass/1`) prefab'dır; level'daki örnek yalnız sürüm
  etiketli override taşır (rapor §4.4, A1).
- Level bir klasördür: `level.json` (kalıcı katman + `settings.cellSize / wind`),
  `cells.json` (dizin + revizyonlar), `cells/<x>_<z>.json`. Atama kök aktörün
  konumundan; `spatiallyLoaded: false` ve singleton ağaçları kalıcı katmanda.
  Aktörün isteğe bağlı `pivot`'u yalnız editörün (döndürme / ölçek noktası).
  Dosyalar kanonik metinle yazılır (`stringifyDocument`); revizyon bayt
  hash'idir (rapor §4.4, A11).
- Asset kimliği asset'in yanında: JSON asset'ler `id` taşır, ikili asset'ler
  `<dosya>.meta.json` (`forge.assetMeta/1`: tür + lisans + kaynak zorunlu).
  GUID → yol dizini üretilen önbellektir (`.forge-cache/`), referanslar yalnız
  GUID (rapor §4.6, A10). Veri belgeleri (terrain, World Builder girdileri)
  zarf içinde engine'in içeriğini taşır; terrain'in tile'ları ve global
  haritası metasız parçalarıdır (rapor §4.6).
- İlk ikili asset türleri `forge.model`, `forge.texture`, `forge.sound`
  (`model@2`: slot materyalleri, UVW, köşe renkleri; `texture@2`: anizotropi,
  mipmap). Şemalı JSON asset türü `defineJsonAssetType` (dosya
  `{ schema: "<tür>/<sürüm>", id, …alanlar }`, sürüm geçişi, başvurular dizinde
  yürünür, form şemadan; SDK'da) ilk `forge.material` ile; A13'ün de temeli
  (rapor §4.6). İçe aktarılan Forge
  asset'lerinin lisans ve kaynağı yol önekli bir köken tablosundan; lisansı
  bilinmeyen `LicenseRef-forge-unverified` (rapor §4.6).
- World Builder çıktısı ve içe aktarıcı için bileşenler: `forge.staticMesh@2`
  (slot materyalleri, isteğe bağlı tint, `castShadow`), `forge.shape@2`
  (`castShadow`), `forge.worldRole` (rol + üreten aşama), `forge.terrain@2`
  (`material`); yerleşim → aktör çevirisi ikisinde ortak
  (`src/engine/forgeImport/`, rapor §4.4).
- Tek dünya ızgarası `src/core/grid/worldGrid.ts`: level hücreleri (sıfır
  orijin), terrain tile'ları ve akış politikası onu kullanır; hücre yerleşim
  planlayıcısı ve saf residency / culling / harita hesapları `src/engine/world`'de;
  runtime hücre akışı `src/runtime/streaming/cellStreaming.ts`'de, durum belleği
  `SaveLedger`'da. Editörün `session/cellStreaming`'i kısmi level oturumuna
  bağlanır; `stream` bildirimi dirty / undo değildir. `worldPartitionPanel`
  Outliner sekmesinde; `KeptRegionsKey` tutulan hücre / terrain alanlarını,
  `RenderReadinessKey` derleme bitene kadar HLOD hazır olmasını bağlar. Menziller
  (`viewDistance`, `loadRange`) level ayarında; HLOD level klasöründe
  (`hlod.json` + `hlod/<x>_<z>.glb`, `tools/world` içindeki `forge hlod` üretir;
  editör dev server'ın `/__forge/hlod` kuyruğuyla ayrı Node worker'da kendiliğinden
  üretir, `editor/world/hlodController.ts`), runtime ve editör proxy çizimi
  `render/sync/hlodProxies.ts`'de (rapor §4.4).
- GPU güdümlü çizim (5c): `render/gpu/` batch başına örnek storage buffer'ı
  (`gpuInstances`), görünüm başına compute culling + `drawIndexedIndirect`
  (`gpuDrivenBatch`); host ana görünümü kareden önce ayıklar (`gpuDriven`),
  dolaylı çizimler `?debug` sayımına eklenir. CPU referansı
  `engine/world/instanceCulling.ts`; WebGL2 test arka ucunda aynı arayüzle CPU
  ikizi (`cpuDrivenBatch`: referans ayıklar, örnekli mesh çizer). Painted foliage level parçası
  (`foliage.json` + `foliage/<x>_<z>.bin`) `core/level/foliage*.ts`'de (rapor §4.4).
  Landscape foliage kuralları `features/foliage/render.ts`'te kameranın çevresinde
  halka olarak büyür (`engine/foliage/foliageRingHost.ts`), uzak billboard blokları ve
  terrain'e uzak ton `engine/foliage/foliageFarHost.ts` + `render/foliage/farBillboards.ts`
  (PG3 impostor'u; GLB türü çalışma anında bake); terrain'in yerleşik
  tile'ları `render/sync/terrainSurfaces.ts`'ten, foliage türü `WorldResources.json`'dan.
- Terrain düzenleme (5d): editör World'üne `TerrainEditingKey` verir
  (`engine/terrain/terrainEditing.ts`); terrain bağlaması onu bulunca asset başına
  `TerrainEditSession`'dan çizer (tile'lar, okunan revizyon / biçim, kirli kayıt;
  bağlamadan uzun yaşar), akış sürer, düzenlenen tile `kept`. Fırça
  `editor/landscape/landscapeTool.ts` (saf `terrainEdit`), görünüm
  `TerrainView.updateTile`; undo editör oturumunun level dışı adımı (`pushStep`),
  kayıt oturum katılımcısı `landscapeSave.ts` (tile'lar + global harita + tanım tek
  kayıt işlemi, okunan revizyonlarla). Boyama ve katman işlemleri (Fill, Add /
  Remove, materyal, Auto Paint) `landscapeLayers.ts` (`LandscapeLayersKey`); Auto
  Paint kuralları aktörde `forge.landscapeAutoPaint`; görünüm kipi yalnız editör
  terrain materyalinde (`editorViews`). Oluşturma (asset hemen), Expand, aktörle
  taşıma (`worldTerrainMove`) ve heightmap dosyaları `landscapeTerrain.ts`
  (`LandscapeTerrainKey`); oturum ızgara değişimini (`replaceTerrain`) ve silinecek
  tile dosyalarını bilir.
- Kayıt oyunu `forge.saveGame/1` (`src/core/save/`): her şey GUID'le, bileşen
  alanının `persist` bayrağı, bileşenin `state` bölümü, `defineSaveState`;
  yüklenmemiş hücrelerin durumu `SaveLedger`'da. Slot deposu
  `src/engine/persistence` (rapor §4.6, §4.8, A7).

## Şema kaydı

Bileşen ve asset türü şemasını bir kez tanımlar (kendi DSL'imiz, tanımlar düz
veri). TypeScript tipi, tek normalize fonksiyonu (yükleme = kayıt doğrulaması),
varsayılanlar, sürüm geçiş zinciri, DOM'suz Details form tanımı ve JSON Schema
bu tanımdan türer. Bilinmeyen / yanlış tipli alan geliştirmede hata, üretimde
rapor; sınır dışı sayı sınıra çekilir (rapor §4.5, A2).

## Kayıt servisi

`tools/save` + `tools/server`: günlüklü atomik çok dosyalı kayıt (kesintide geri
ya da ileri sarar), hücre dizinini sunucu yazar, dosya başına temel revizyon
(uyuşmazlıkta 409), sunucuda sıkı şema doğrulaması ve kanonik yazım (422),
ikili sahneleme. Uçlar `/__forge/save`, `/__forge/stage-binary`,
`/__forge/read`, `/__forge/asset-files` (renderer'ın GUID → dosya tablosu,
ikililerin içe aktarma ayarlarıyla, JSON asset'ler dahil);
yalnız localhost ve `X-Forge-Request: 1`. Yazma yalnız
projenin içerik köklerine; `samples/`, `tests/fixtures/` ve motor içeriği salt
okunur. İstemci tarafı `src/core/edit`: işlem / undo, sürümlü kirli takibi,
level oturumu (rapor §4.6). 409'da editör diskteki level'ı oturumun tabanına karşı
alan düzeyinde birleştirir (`core/edit/merge.ts`, Compare / Reload; asset editörü de).
Editörün Play'i kaydetmez: kirli level dosyaları `/__forge/play` ile
`.forge-session/<id>/` katmanına gider, oyun `?play=<id>` ile katmandan okur
(rapor §4.6, §4.7, A6).

Kurtarma + kayıt projenin kayıt kilidi altında (`.forge-journal/save.lock`):
aynı projeye yazan süreçler (dev server, `forge edit`, `world:random`, içe
aktarıcı) birbirini bekler. Uçların okuyup yazdığı her şey tek modülde
(`tools/server/authoring.ts`); ajanın komutları onu dev server'sız açar. Dev
server dışında değişen dosyalar içerik kökleri klasör klasör izlenerek duyulur:
sunucu önbelleğini tazeler, editöre Vite'ın HMR kanalında `forge:files`
(`{ path, revision }`) gider (rapor §4.6).

## Ajan komutları

`npm run forge -- edit --project … --level … [--json] <komut>` (ya da `-`:
stdin'den satır başına bir komut, tek kayıt): `add`, `move`, `delete`, `set`,
`reset`; okuyan `find`, `show`. Her yazma editörün işlemidir (`engine/edit`),
çekirdek level oturumunda bir düzenleme, editörün kaydedicisiyle kayıt servisinden
geçer: editörle aynı kanonik dosya. Editör açıksa temiz level kendiliğinden
tazelenir, kirliyse 409 şeridi açılır (`editor/session/liveRefresh.ts`; rapor §4.11, A12).

## Uygulama kabuğu

World (yaşam döngüsü, tick grupları, bileşen dizini; modül düzeyinde
değişebilir durum yok), editör / Play / oyunun ortak sahne kurucusu
(`assembleLevel`), oyun modülü host'u ve renderer'dan bağımsız boot hata ekranı
(rapor §4.7, A6). Boot'un `render` aşaması renderer host'u kurar; host World'e
`renderSync` grubunda tek bir `forge.render` alt sistemi ekler ve render
bağlamalarını çalıştırır. Kaynak önbelleği host'undur, World'ün değil (A6;
rapor §4.7, §4.9): `model:`, `texture:<guid>:<srgb|linear>`,
`material:<guid>:<katkı imzası>`. `AssetResidency` son sahip bıraktıktan
30 sn sonra host karesinde atmayı yönetir; GPU kaynaklarını
`render/resources/disposeResource.ts` bırakır. Materyaller TSL slot düğümleriyle, özellik
katkıları sabit sırayla (world mask → fade → rüzgâr → ıslaklık → göçük;
rapor §4.9). Çevre tekillerdir (`forge.skyAtmosphere`, `forge.skyLight`:
IBL + ortam ışığı + arka plan, `forge.cloudLayer`, `forge.worldEnvironment`:
sabit saat, oyun `transitionTo` ile zamanlı geçirir); World Environment'ın
yorumu kare başına bir kez `ctx.environment.override`'a, bağlamalar kendi
parçasını çizer; Sky Light aynı PMREM'e, ölçülmüş hızla yeniden yakalanır
(rapor §4.9). WES v2 görsel örtüyü simülasyon saniyesiyle yürütür ve A7
state'inde saklar; terrain yalnız uniform katkısını okur. Ortak rüzgâr level
ayarlarından ya da WES override'ından (`resolveWorldWind`); birikintinin dokulu
rüzgârı ve yansıma bükülmesi aynı simülasyon zamanıyla (5a adım 7; bitki tüketimi
5c). Static mesh ve şekiller otomatik instanced batch'lerle, terrain
spike S2'nin TSL CDLOD'uyla salt çizilir; çok tile'lı terrain kamera çevresinde
akar (Forge'un akış çekirdeği, worker'da çözme, global haritadan uzak alan, görüş
ve gölge frustum'u kesimi; görsel yükseklik collider'la G8 testleriyle eşleşir; su birikintisi `forge.puddle`, `reflector()` yansımasıyla; rapor §4.9 Faz 5a); görüntüleyicinin varsayılan kamerası
ve `?debug` paneli (dinamik import; akan terrain'in tile haritası) var (rapor §4.9).

Statik detayın `detailFade` TSL maskesi yerleşim ölçeğini ve kaliteyi izler,
gölgeyi de aynı pencerede çözer. Hücre başına batch bölmesi ölçümde draw call'u
artırdığı için kullanıcı kararıyla 5c öncesi G6 / meshlet spike'ına bırakıldı.
Host'un seri `compileAsync` kuyruğu yeni batch'leri görünür sahnenin dışında
hazırlar; `RenderReadinessKey` HLOD'u bu sırada korur. İptal, görünümden hemen
çıkarır; GPU nesneleri devam eden derleme tamamlandıktan sonra bırakılır.

## Oyun projesi sözleşmesi

Oyun ayrı bir depodur: `forge.project.json` (`forge.project/1`: kimlik,
`sdkVersion`, `contentRoots`, `contentPacks`, `startLevel`, oyun modülü,
`devPort`). Oyun yalnız `@forge/sdk` ve `@forge/editor-sdk` import eder;
`npm run forge -- check` sürümü, derlemeyi ve import sınırını denetler. Oyunun
editör tarafı da motorunki gibi `defineFeatureEditor`'dür: projenin `editor.ts`'i
ve `src/**/editor.ts`'leri dev server bulur, editöre `virtual:forge/game-editors`
ile verir (yalnız `npm run dev`; build'de boş liste); oyun onları anmaz, hatalı
olan editörü dosya adıyla durdurur (INV-A32, Faz 4 adım 10). SDK
yüzeyi `src/sdk/api.snapshot.txt`'e bağlıdır, değişiklik changelog girdisi
ister. `check:projects` örnekleri ve yerel kayıtlı projeleri motora karşı
derleyip başsız açar (rapor §4.8, A7, A8).

## Depo düzeni

| Yol | Ne |
|---|---|
| `content/engine/` | motorun açılması için zorunlu içerik; projeye `engine:content/engine` etiketiyle girer |
| `content/packs/<id>/` | içerik paketleri; proje manifestte `contentPacks` ile seçer, kopyalanmaz (`engine:content/packs/<id>`) |
| `samples/` | dış proje biçiminde örnekler (`samples/starter`), CI'da sözleşme testi |
| `tests/fixtures/` | değişmez fixture'lar; testler geçici kopyada çalışır |
| `docs/planned/` | yaşayan plan ve mimari rapor |
| `docs/archive/` | biten fazların ayrıntısı ([dizin](../archive/INDEX.md)) |

Motor içeriği hiçbir pakete, paket başka pakete referans veremez; ikisi de
projeden salt okunur. Ağır referans içerik depo dışında, yerel içerik
projesinde (rapor §4.8, A9).
Motor deposunun `npm run dev -- --engine-content` kipi bütün paketleri aynı
editörden yazılabilir açar (`tools/server/engineContentMode.ts`, Faz 4 / 6g).
Motor işlemi tek kökte, mevcut kayıt servisinden geçer; motor level'ı kendi
kökünün izniyle kaydedilir. Normal projeler ve motor örneklerinin salt
okunurluğu korunur (rapor §4.8).

## Kapı

`npm run gate`: dört tsconfig'le (uygulama, `src` testleri, Node araçları,
render smoke'u) tip kontrolü, katman denetimi + öz-testi, dosya
boyutu bütçesi, Node yükleme, asset kapısı, SDK API kapısı, `check:projects`,
Vitest, build, editörün tarayıcı denetimleri (`npm run smoke:editor`, başsız
Chrome; çizen sayfalar `forceWebGL`). Aynı kapı CI'da. Aynı editör seti yerelde
gerçek GPU'da `npm run smoke:editor:webgpu` (başlıklı Chrome, `forceWebGL`'siz,
her açılan editör ve Play sekmesi WebGPU backend'ini kanıtlar). Render kabulü yerelde, gerçek WebGPU
backend'inde: `npm run smoke:render` (Playwright, başlıklı Chrome, port 5283;
gate'te ve CI'da değil, `render/**` ya da `features/*/render.ts` dokunan
push'tan önce; `tests/smoke/`, referans görüntüler ve koşu kayıtları depo
dışında `Games/ForgeReference/render-refs/`; Faz 0 ile yan yana sayfa
`npm run smoke:grid`; rapor §4.10).

Terrain bakım kapısı `tools/terrainOrphans.ts` ile aynı kökte tanımı olmayan
parçaları ve tanımın tile listesinde olmayan ikilileri raporlar; kayıtlı ama
yerleştirilmemiş terrain korunur, otomatik silme yoktur (`verify:assets` ve
`check:projects`). `npm run measure:terrain`, dört terrain sahnesinin kayıtlı
pozlarında 1080p / 1440p kare ve GPU süreleri, soğuk / sıcak açılış, shader /
pipeline API gecikmesi ve yeni sekme Play açılışını kaydeder; tam açık dünya
kabulü sonraki alt fazlarla tamamlanır (rapor §4.9, §4.10).
Takipli yönlü gölge `render/sync/boundedShadow.ts` ile üç eksende [0,1]
kapsamını korur; ters derinlikte far dışındaki zeminde harita izi oluşmaz.
CSM kendi kaskatlarını kullanır; takip / CSM geçişinde eski düğüm bırakılır
(rapor §4.9, Island düzeltmesi).

World Settings → Shadows genel kapısının sahibi `forge.light` içindeki tekil
`forge.shadowSettings@1` bileşenidir (yoksa açık). `render/sync/sceneShadows`
ve host, kaliteyle birlikte uygular. Nesne tercihleri bağımsız kalır;
`engine/edit/objectShadows` toplu değişikliği planlar, `editor/world/sceneShadows`
tek Undo işlemi uygular ve yüklenmemiş hücrede durdurur (rapor §4.9).
