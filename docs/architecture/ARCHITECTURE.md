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
| `engine` | three'siz alt sistemler (fizik, terrain verisi, nav, hareket, ses…; 2b'de taşınır, kapsam K12) ve editörün gizmo matematiği (`engine/gizmo`: sürükleme, snap, pivot); DOM ve Web Audio yok, düz Node'da yüklenir | yok |
| `render` | renderer host, GUID anahtarlı kaynak önbelleği, render bağlamaları, materyaller, pipeline, görüntüleyici (Faz 3; rapor §4.9); editörün 3B kodu `render/editor/` (viewport, editör kamerası, çizim katmanı, ızgara, picking, seçim çerçevesi, yardımcı bağlamalar, gizmo çizimi; yalnız editör yükler, Faz 4) | tek sahip (`three/webgpu`, `three/tsl`) |
| `runtime` | World, sahne kurucu, oyun modülü host'u, boot; tarayıcı API'si gereken alt sistem kodu (`runtime/audio`) | dolaylı |
| `gameplay` | yeniden kullanılabilir oyun çatısı (Faz 6) | yok |
| `editor` | editör: DOM ve servisler; yalnız dinamik import, oyun bundle'ına girmez (Faz 4) | yok; 3B kodu `render/editor/`'da |
| `sdk`, `editor-sdk` | oyun projelerinin import edebildiği tek yüzey | — |
| `tools/` (Node) | dev server, kayıt servisi, asset kapısı, başlatıcı, World Builder CLI, Forge WebGL içe aktarıcısı, ölçümler | yok |

`src/core` ve `features/*/schema.ts` düz Node'da yüklenir (`verify:node-load`);
`src/**` Node modülü import etmez.

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

## Veri modeli

- Level'da her şey bir aktördür: kalıcı GUID, transform, `parent`, şemalı
  bileşenler (aktör içinde yerel kimlikli, uzamsal olanlar hiyerarşili). Aktör
  sınıfı (`forge.actorClass/1`) prefab'dır; level'daki örnek yalnız sürüm
  etiketli override taşır (rapor §4.4, A1).
- Level bir klasördür: `level.json` (kalıcı katman + `settings.cellSize`),
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
  planlayıcısı `src/engine/world`, runtime akışı 5b'de (rapor §4.4).
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
level oturumu (rapor §4.6).

## Uygulama kabuğu

World (yaşam döngüsü, tick grupları, bileşen dizini; modül düzeyinde
değişebilir durum yok), editör / Play / oyunun ortak sahne kurucusu
(`assembleLevel`), oyun modülü host'u ve renderer'dan bağımsız boot hata ekranı
(rapor §4.7, A6). Boot'un `render` aşaması renderer host'u kurar; host World'e
`renderSync` grubunda tek bir `forge.render` alt sistemi ekler ve render
bağlamalarını çalıştırır. Kaynak önbelleği host'undur, World'ün değil (A6;
rapor §4.7, §4.9): `model:`, `texture:<guid>:<srgb|linear>`,
`material:<guid>:<katkı imzası>`. Materyaller TSL slot düğümleriyle, özellik
katkıları sabit sırayla (world mask → fade → rüzgâr → ıslaklık → göçük;
rapor §4.9). Çevre tekillerdir (`forge.skyAtmosphere`, `forge.skyLight`:
IBL + ortam ışığı + arka plan, `forge.cloudLayer`, `forge.worldEnvironment`:
sabit saat, oyun `transitionTo` ile zamanlı geçirir); World Environment'ın
yorumu kare başına bir kez `ctx.environment.override`'a, bağlamalar kendi
parçasını çizer; Sky Light aynı PMREM'e, ölçülmüş hızla yeniden yakalanır
(rapor §4.9). Static mesh ve şekiller otomatik instanced batch'lerle, terrain
spike S2'nin TSL CDLOD'uyla salt çizilir; görüntüleyicinin varsayılan kamerası
ve `?debug` paneli (dinamik import) var (rapor §4.9).

## Oyun projesi sözleşmesi

Oyun ayrı bir depodur: `forge.project.json` (`forge.project/1`: kimlik,
`sdkVersion`, `contentRoots`, `contentPacks`, `startLevel`, oyun modülü,
`devPort`). Oyun yalnız `@forge/sdk` ve `@forge/editor-sdk` import eder;
`npm run forge -- check` sürümü, derlemeyi ve import sınırını denetler. SDK
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

## Kapı

`npm run gate`: dört tsconfig'le (uygulama, `src` testleri, Node araçları,
render smoke'u) tip kontrolü, katman denetimi + öz-testi, dosya
boyutu bütçesi, Node yükleme, asset kapısı, SDK API kapısı, `check:projects`,
Vitest, build, editörün tarayıcı denetimleri (`npm run smoke:editor`, başsız
Chrome; çizen sayfalar `forceWebGL`). Aynı kapı CI'da. Render kabulü yerelde, gerçek WebGPU
backend'inde: `npm run smoke:render` (Playwright, başlıklı Chrome, port 5283;
gate'te ve CI'da değil, `render/**` ya da `features/*/render.ts` dokunan
push'tan önce; `tests/smoke/`, referans görüntüler ve koşu kayıtları depo
dışında `Games/ForgeReference/render-refs/`; Faz 0 ile yan yana sayfa
`npm run smoke:grid`; rapor §4.10).
