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
| `engine` | three'siz alt sistemler (fizik, terrain verisi, nav, hareket, ses…; 2b'de taşınır, kapsam K12); DOM ve Web Audio yok, düz Node'da yüklenir | yok |
| `render` | renderer, render bağlamaları, materyaller, pipeline (Faz 3) | tek sahip (`three/webgpu`, `three/tsl`) |
| `runtime` | World, sahne kurucu, oyun modülü host'u, boot; tarayıcı API'si gereken alt sistem kodu (`runtime/audio`) | dolaylı |
| `gameplay` | yeniden kullanılabilir oyun çatısı (Faz 6) | yok |
| `editor` | editör; yalnız dinamik import, oyun bundle'ına girmez (Faz 4) | dolaylı |
| `sdk`, `editor-sdk` | oyun projelerinin import edebildiği tek yüzey | — |
| `tools/` (Node) | dev server, kayıt servisi, asset kapısı, başlatıcı, ölçümler | yok |

`src/core` ve `features/*/schema.ts` düz Node'da yüklenir (`verify:node-load`);
`src/**` Node modülü import etmez.

## Özellik klasörü

Bir özellik tek klasördür: `src/features/<ad>/{schema,runtime,render,editor,feature}.ts`
+ test + README. `feature.ts` `defineFeature({ id, components, assetTypes,
subsystems })` döner ve `editor.ts`'i hiç anmaz; editör host'u onu kendisi
toplar. Yeni özellik kabuk dosyasına dokunmaz: `main.ts` özellikleri klasörden
toplar. Örnek ve iskeletin kabul testi: `src/features/height-fog` (rapor §4.3).

## Veri modeli

- Level'da her şey bir aktördür: kalıcı GUID, transform, `parent`, şemalı
  bileşenler (aktör içinde yerel kimlikli, uzamsal olanlar hiyerarşili). Aktör
  sınıfı (`forge.actorClass/1`) prefab'dır; level'daki örnek yalnız sürüm
  etiketli override taşır (rapor §4.4, A1).
- Level bir klasördür: `level.json` (kalıcı katman + `settings.cellSize`),
  `cells.json` (dizin + revizyonlar), `cells/<x>_<z>.json`. Atama kök aktörün
  konumundan; `spatiallyLoaded: false` ve singleton ağaçları kalıcı katmanda.
  Dosyalar kanonik metinle yazılır (`stringifyDocument`); revizyon bayt
  hash'idir (rapor §4.4, A11).
- Asset kimliği asset'in yanında: JSON asset'ler `id` taşır, ikili asset'ler
  `<dosya>.meta.json` (`forge.assetMeta/1`: tür + lisans + kaynak zorunlu).
  GUID → yol dizini üretilen önbellektir (`.forge-cache/`), referanslar yalnız
  GUID (rapor §4.6, A10). Veri belgeleri (terrain, World Builder girdileri)
  zarf içinde engine'in içeriğini taşır; terrain'in tile'ları ve global
  haritası metasız parçalarıdır (rapor §4.6).
- World Builder çıktısı ve içe aktarıcı için 2b'de yalnız şema olan bileşenler:
  `forge.staticMesh`, `forge.shape`, `forge.worldRole` (rol + üreten aşama),
  `forge.terrain` (rapor §4.4).

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
`/__forge/read`; yalnız localhost ve `X-Forge-Request: 1`. Yazma yalnız
projenin içerik köklerine; `samples/`, `tests/fixtures/` ve motor içeriği salt
okunur. İstemci tarafı `src/core/edit`: işlem / undo, sürümlü kirli takibi,
level oturumu (rapor §4.6).

## Uygulama kabuğu

World (yaşam döngüsü, tick grupları, bileşen dizini; modül düzeyinde
değişebilir durum yok), editör / Play / oyunun ortak sahne kurucusu
(`assembleLevel`), oyun modülü host'u ve renderer'dan bağımsız boot hata ekranı
(rapor §4.7, A6).

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

`npm run gate`: iki tsconfig'le tip kontrolü, katman denetimi + öz-testi, dosya
boyutu bütçesi, Node yükleme, asset kapısı, SDK API kapısı, `check:projects`,
Vitest, build. Aynı kapı CI'da. Render kabulü yerelde, gerçek WebGPU
backend'inde (rapor §4.10).
