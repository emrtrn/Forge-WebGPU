# Forge WebGPU — Mimari Analiz ve Başlangıç Kararları

**Sürüm:** v1.4 · 2026-11-12 (v1.3'ten fark: 2b içe aktarıcı kararları,
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

### 4.3 Dikey özellik modülü

```text
features/height-fog/
  schema.ts     # bileşen şeması — three'siz, Node'da da yüklenir
  runtime.ts    # alt sistem / capability — three'siz
  render.ts     # render bağlaması — three/webgpu yalnız burada
  editor.ts     # özel araç veya Details (yoksa şemadan otomatik)
  feature.ts    # defineFeature({ id, components, subsystems, render, addActor })
  height-fog.test.ts
  README.md     # 5–10 satır: amaç, şema, kayıt noktaları
```

Çekirdek kabuk yalnız kayıt noktaları sunar: `registerComponent`,
`registerSubsystem`, `registerRenderBinding`, `registerAssetType`,
`registerEditorMode`, `registerDetails`, `registerAddActorEntry`.

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
  taşır: `id`, `components`, `assetTypes`, `subsystems` (alt sistem sözleşmesi
  çekirdekte, onu çalıştıran World `src/runtime`'da); `render` Faz 3'te eklenir.
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
  başvuruları kırmaz.
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
  - *Disk düzeni:* level bir klasördür, adlar sabit: `level.json`
    (`forge.level/1`: kimlik, `settings`, kalıcı katman aktörleri),
    `cells.json` (`forge.levelCells/1`: level kimliği, `level.json`'un ve her
    hücrenin revizyonu), `cells/<x>_<z>.json` (`forge.levelCell/1`: level
    kimliği, hücre anahtarı, aktörler). Bir klasörde tek level; yalnız dolu
    hücrelerin dosyası vardır, boşalan hücrenin dosyası silinir. Hücre ve
    dizin asset değildir, level'ın parçasıdır.
  - *Akış bayrağı:* `spatiallyLoaded` (varsayılan `true`, her zaman yazılır)
    temel aktör şemasında bir kez tanımlıdır (`ActorStreamingFields`).
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
  ref, dizi, nesne, metin. Yenisi ihtiyaç olunca eklenir (§7).
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
    `import`. Lisans tek bir SPDX kimliği ya da `LicenseRef-<ad>`; `Unknown` ve
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
    meta'sız ikilidir. Asset dizini ve kayıt servisi zarfı denetler. World
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
    400 istek, 413 boyut, 422 belge.
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
  torbası yoktur. Kanıt: Ridgebound m0 kodu bugün durumu
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
    kalır. Paket kimliği `content/packs/` altındaki klasörün adıdır; paketin
    kendi manifesti yok.
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
    reddeder. Bunları düzenleyen editör modu Faz 4'te karara bağlanır.
  - *Bağımlılık yönü:* motor içeriği hiçbir pakete, bir paket başka bir pakete
    referans veremez; paket motor içeriğine verebilir. `verify:assets` motor
    içeriğini tek başına ve her paketi motor içeriğiyle birlikte dizinleyip
    asılı referansı hata sayar.
  - *Build:* üretim build'i motor içeriğini ve seçili paketleri dist'e alır;
    uygulaması dist doğrulamasıyla (editör gelince).
- Model 1 oyunları Forge WebGL'de kalır.

### 4.9 Render mimarisi (özet)

Ayrıntı yeniden inşa planında (§2.3–2.6); burada yalnız mimari kararlar:

- **Materyal bileşimi:** Forge materyali = temel graf + özelliklerin katkıları
  (rüzgâr, fade, world mask, ıslaklık, göçük) tanımlı sırayla TSL düğüm
  fonksiyonları olarak birleşir. `onBeforeCompile` yaması yığılması yok (D12).
- Işık alan yüzeyler standart node materyal slotlarında (MRT sözleşmesi), tek
  `RenderPipeline`, kalite profilleri, gerçek backend doğrulaması, GPU
  timestamp, addon'lar kendi sarmalayıcılarımızın arkasında.

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
  zaman "WebGPU çalışıyor" sayılmaz.
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
  değişen dosyalar, doğrulama hataları). Faz 4.
- **Genel veri editörü (A13):** oyun kendi veri türünü şemayla tanımlar
  (`registerAssetType`, A7); Content Browser'dan açılan asset, Details ile aynı
  form kitiyle şemadan üretilen bir formla düzenlenir (tablo görünümü dahil).
  Oyuna özel düzenleme arayüzü yazılmaz. Faz 4.
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
