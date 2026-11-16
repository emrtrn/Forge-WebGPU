# Forge WebGPU

Açık dünya oyunları için WebGPU tabanlı oyun motoru + editörü. Forge'un (WebGL,
`C:\Users\emret\Desktop\Forge`) yerini alır. Bu depo yalnız motordur: oyunlar
ayrı depolarda yaşar; GDD, oyun fikri ve türe özgü taksonomi buraya girmez.

**Ürün tezi** ([mimari §0.0](docs/planned/FORGE_WEBGPU_ARCHITECTURE.md)): AI
ajanıyla büyük oyun yapmak için. İnsan istem yazmadan editörden düzenler; ajan
az token harcayan hazır sistemle çalışır. Bir özellik yalnız bu iki yüzeyden
birine hizmet ediyorsa girer; eski oyunların kullanımı ölçüt değil. Kapsam
kararları plan K12'de; taşınmayan Forge kodu `forge-webgl-final` etiketinde.

## Belgeler

- [Yeniden inşa planı](docs/planned/FORGE_WEBGPU_REBUILD_PLAN.md): faz sırası,
  kutular, K kararları, ilerleme kaydı. Kutular bayatlayabilir; durumu kodla
  doğrula.
- [Mimari rapor](docs/planned/FORGE_WEBGPU_ARCHITECTURE.md): katmanlar, veri
  modeli, şema kaydı, kayıt servisi, SDK, A kararları. Çelişkide rapor geçerli.
- [Mimari harita](docs/architecture/ARCHITECTURE.md): rapordan kısa özet;
  kararları tekrar yazmaz, haritadaki bir şey değişirse aynı commit'te güncellenir.
- [Taşıma günlüğü](docs/PORT_LOG.md): Forge özellik envanteri, taşınan
  modüller, port bekleyen düzeltmeler (plan §7).
- [Arşiv](docs/archive/INDEX.md): biten fazların ayrıntısı.
- Kararların hepsi kapalı. Yeni bir mimari soru çıkarsa varsayma, sor.

### Plan belgesi düzeni

- Tek ana plan. Faz başına ayrı yaşayan plan belgesi açılmaz.
- Kutu kapanınca plan kutusu, mimari rapor ve plan §11 ayrı bir docs
  commit'inde güncellenir.
- Faz kapanınca (kapısı geçti, bütün kutuları işaretli) o fazın plan bölümü
  kapanış docs commit'inde olduğu gibi `docs/archive/PHASE_<faz>.md`'ye taşınır;
  planda kısa özet + bağlantı kalır, §11 planda kalır, `docs/archive/INDEX.md`'ye
  satır eklenir. Kararlar raporda kalır, arşive gitmez.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Dev server, port **5183** (`strictPort`) |
| `npm run dev -- --engine-content` | Aynı editörde motor içeriği ve bütün paketler yazılabilir; örnek proje salt okunur kalır |
| `npm run gate` | Push öncesi kapı: aşağıdakilerin hepsi |
| `npm run typecheck` | `tsconfig.json` (tarayıcı, `src/`, testler hariç) + `tsconfig.tests.json` (`src` testleri, Node tipleriyle) + `tsconfig.tools.json` (Node, `tools/`, `src/engine` ve import ettiği `src` modülleri; DOM yok) + `tsconfig.smoke.json` (`tests/smoke`, Node + DOM) |
| `npm run verify:layers` | Katman denetimi + öz-testi |
| `npm run verify:file-size` | Dosya bütçesi: 800 satırda uyarı, 1.500'de hata |
| `npm run verify:node-load` | `src/core` ve `features/*/schema.ts` düz Node'da yüklenir |
| `npm run verify:assets` | `content/` (motor içeriği + paketler) ve `samples/*/content/` asset kapısı: tür + lisans + kaynak, meta'sız ikili, çift GUID, asılı referans, paket bağımlılık yönü; aynı kökte tanımı olmayan terrain parçaları ve tanımda listelenmeyen tile'lar (`orphan-terrain-part`), yalnız raporlar |
| `npm run assets:index` | `.forge-cache/asset-index.json` önbelleğini yeniden üretir (commit'lenmez) |
| `npm run verify:sdk-api` | SDK yüzeyi `src/sdk/api.snapshot.txt` ile aynı ve `src/sdk/CHANGELOG.md`'nin en üst girdisi `API: <hash>` taşıyor; yüzey değişince `npm run sdk:snapshot` + changelog girdisi aynı commit'te |
| `npm run check:projects` | `samples/*` ve `forge.projects.local.json`'daki oyun projeleri: `forge check` + proje asset kapısı + başsız açılış |
| `npm run forge -- check --project <yol>` | Oyun projesi sözleşme denetimi (sürüm, derleme, import sınırı); `dev` aynı projeyi `devPort`'unda açar |
| `npm run forge -- edit --project <yol> --level <klasör> [--json] <komut>` | Ajan düzenleme komutları (A12): `add`, `move`, `delete`, `set <yol>=<değer>`, `reset`; okuyan `find`, `show <id>`; `-` stdin'den satır başına bir komut, tek kayıt. Editörün işlemleri, kayıt servisi; dev server gerekmez, açık editör kendiliğinden tazelenir. Motor içeriği ve paketler yalnız okunur. Kullanım `tools/edit/args.ts` başında |
| `npm run import:forge -- --forge <Forge public> --project <yol> --level <yol>…` | Forge WebGL level'larını ve kullandıkları asset'leri projeye alır (`--dry-run` yalnız rapor, `--force` var olan level'ı değiştirir); çevrilmeyen alan level raporunda fazıyla. `--pack starter` starter paketini yeniden üretir (`tools/import-forge-webgl/starterSeeds.ts`); `--compare` kaynak / hedef sayımını yazar, açıklanmayan farkta hata |
| `npm run create-project -- <hedef> --id <ad>` | `samples/starter`'dan depo dışında yeni oyun projesi (`--register` yerel listeye ekler) |
| `npm run world:random -- --project <yol> --out <level klasörü>` | Birkaç seçimden greybox dünya: brief + level (`content/levels/<ad>/`), kayıt servisinden; proje `contentPacks`'te `worldbuilder` seçmeli; var olan level `--force` ister |
| `npm run world:brief -- --project <yol> --brief <klasör>/<ad>.worldbrief.json` | Brief'ten level'ı yeniden kurar (aynı GUID'ler, aynı baytlar) |
| `npm run bench:level` | 50.000 aktörlük ölçek ölçümü (kapıda değil) |
| `npm run bench:outliner` | Outliner'ın 50.000 aktördeki ölçümü (Playwright, başlıklı Chrome, gerçek WebGPU, port 5283, editör smoke'unun geçici proje kopyası; `tests/editor/*.bench.ts`): ilk kurma ≤ 150 ms, seçim p95 ≤ 16 ms, kaydırma çizimi p95 ≤ 16 ms, arama tuşu ≤ 50 ms, DOM satırı ≤ 200; rapor `.forge-cache/bench/outliner/report.json`. Kapıda değil |
| `npm run test` | Vitest; testler modülün yanında (`*.test.ts`) |
| `npm run smoke:render` | Render smoke'u (Playwright, başlıklı Chrome, gerçek WebGPU, port 5283, referans projesi `Games/ForgeReference/webgpu-scenes`; `FORGE_REFERENCE_ROOT` değiştirir). Gate'te ve CI'da değil; `render/**` ya da `features/*/render.ts` dokunan push'tan önce. Terrain G8 ölçümü (`terrainCollider.smoke.ts`, kayıt `render-refs/runs/*-g8.json`) ve su birikintisi (`puddle.smoke.ts`, dev kancasıyla eklenir; çekim yalnız göz için `render-refs/candidates/`) de içinde. Referans yoksa çekim `render-refs/candidates/`'e, kayıt `render-refs/runs/`'a; referans yalnız kullanıcı kabulünden sonra `-- --update-snapshots` ile yazılır |
| `npm run smoke:editor` | Editörün tarayıcı denetimleri (Playwright, başsız Chrome, port 5283, `tests/editor`): UI kiti (`?editor-kit`), aç / düzenle / geri al / kaydet, viewport menüleri, tıklayarak seçim; her koşu `samples/starter`'ın geçici kopyasında. Gate'te ve CI'da; çizen sayfalar CI'da `forceWebGL` kipinde (WebGPU kabulü sayılmaz) |
| `npm run smoke:editor:webgpu` | Aynı editör seti gerçek GPU'da: başlıklı Chrome, `forceWebGL` yok, her açılan editör ve Play sekmesi `data-forge-backend` = `webgpu` kanıtlar (`tests/editor/webgpu.config.ts`). Gate'te ve CI'da değil; editörün çizimine dokunan push'tan önce, faz kapısında |
| `npm run smoke:grid` | Her smoke pozunun Faz 0 WebGL çekimiyle smoke'un son WebGPU çekimini yan yana koyan yerel sayfa: `render-refs/grid.html` (Faz 0 çekimi olmayan, boyutu tutmayan, çekilmemiş pozlar başta listelenir). Görsel kabulden önce |
| `npm run measure:sky-capture` | Sky Light (PMREM) yakalama ölçümü: smoke sunucusu ve profili, L03, kare döngüsü duraklatılıp 60 Hz adımlanır (`window.__forgeDev`, yalnız dev); yakalamanın tek başına GPU / CPU süresi ve gün saati geçişlerinde yakalama sayısı, kayıt `render-refs/runs/*-sky-capture.json`. Kapıda değil |
| `npm run measure:terrain` | Faz 5a §2.10 ölçümü: dört terrain sahnesi × üç Faz 0 pozu × 1080p / 1440p, `high`, DPR 1, başlıklı gerçek WebGPU, uncapped; 10 sn ısınma + 15 sn kare örneği, GPU timestamp ortalamaları, soğuk / sıcak açılış ve shader / pipeline API gecikmesi; ayrıca editörden yeni sekme Play'in soğuk cihaz açılışı. HTTP önbelleği temizlenir; OS / sürücü önbelleği temizlenmez. Kayıt `render-refs/runs/*-terrain-measure.json`. Kapıda ve CI'da değil; tam foliage / su / oyun kabulü sayılmaz |
| `npm run port:forge-tests -- --forge <Forge>` | 2b test sınıflaması ve ilerleme (A taşınan / payda); `docs/port/forge-engine-tests.tsv` |
| `npm run port:forge -- <tests\|closure\|subset\|members> … --forge <Forge>` | Taşıma araçları: hazır kontrolleri taşı / neyin beklettiğini söyle (`--deferred <faz>` o faza ertelenmişleri de alır), import kapanışı, eski dosyadan alt küme, bölme planı (ayrıntı `tools/port-forge.ts` başında) |
| `npm run build` | Projenin üretim build'i (`FORGE_PROJECT_ROOT`, yoksa `samples/starter`): Vite + `tools/build-content.ts` (proje içeriği, motor içeriği ve seçili paketler, kimlik / sınıf / asset dizinleri `dist/forge/`'a); oyun dev server'sız, `BASE_URL` altından okur |
| `npm run verify:dist` | Build'den sonra dist taraması: editör işaretleri (kabuk CSS'i, test id'leri, kit) hata, dev server'ın yazma uçları uyarı; gate'te `--strict` (uyarı da hata) |
| `npm run smoke:dist` | Üretim build'i alt dizinde (`--base /forge-base/`, geçici klasör, `vite preview`, port 5283): start level statik içerikten açılır, bütün istekler alt dizinde, `/__forge/` yok, editör yok (başsız Chrome, `forceWebGL`). Gate'te ve CI'da |

`npm run dev` proje verilmezse `samples/starter`'ı salt okunur açar (kayıt 403).
Motor içeriği `content/engine/`, içerik paketleri `content/packs/<id>/`: proje
manifestte `contentPacks` ile seçer, içerik kopyalanmaz, proje dizinine
`engine:` etiketiyle girer ve editörden yazılmaz (mimari §4.8, A9). Bir paket
başka pakete yalnız `forge.pack.json`'daki `requires` ile başvurur (worldbuilder
→ starter); onu seçen proje gerekenleri de seçer.
Motor deposunda `npm run dev -- --engine-content` bu kuralın düzenleme kipidir:
motor içeriği ve bütün paketler mevcut kayıt servisinden yazılır; bir motor
işlemi aynı içerik kökünde kalır. Motor / paketten projeye kopyalama çalışır.
Açılan motor level'ı kaydedilebilir; `samples/starter` ve fixture'lar salt
okunur kalır. Projenin `forge dev` komutu bu kipi açmaz. `verify:assets` paket
bağımlılık yönünü ve asılı referansları kapıda denetler.
Smoke portu **5283**. Forge WebGL 5173 / 5273, Ridgebound 5175 kullanır; başka
projenin sunucusunu yeniden kullanma.

VS Code **Terminal → Run Build Task** varsayılan `Open Editor` görevini çalıştırır:
5183'te `?editor&level=content/levels/Derekavak`, referans projenin
`%TEMP%/forge-webgpu-reference-editor/webgpu-scenes` altındaki düzenlenebilir
kopyası. Kopya ilk açılışta oluşturulur; yeniden başlatmak kaydedilen
düzenlemelerin üzerine yazmaz. `Open Editor (Reference)` aynı projede L03'ü
açar. `npm run dev`'in proje seçimi ve `/` oyun görünümü sözleşmesi değişmez.

World Settings → **Shadows**: Scene Shadows genel sahne anahtarıdır
(`forge.shadowSettings@1`, yoksa açık); nesne tercihlerini değiştirmez.
Enable / Disable on Objects şekil ve modellerin `castShadow` alanlarını tek
Undo ile değiştirir; sınıf asset'ine dokunmaz, yüklenmemiş hücre varsa durur.
Yeni nesnelerde gölge varsayılan açık; kalite profili ayrıca sınırlar.

## Katmanlar

`src/` altında, aşağıdan yukarı: `core` → `engine` → `render` → `runtime` →
`gameplay`; `editor` hepsini görür ama yalnız dinamik import'la yüklenir.
`tools/` Node'da çalışır; `core`, `engine` ve özellik şemalarını yükler.

- three (`three/webgpu`, `three/tsl`) yalnız `src/render/**`,
  `src/features/*/render.ts` ve `src/features/*/editorRender.ts` içinde.
  `import type` de sayılır. Editörün 3B kodu `src/render/editor/`'da;
  onu ve `editorRender.ts`'i yalnız editör anar (`editor-render-is-editor-only`).
- Bir özellik tek klasördür: `src/features/<ad>/{schema,runtime,render,editor,feature}.ts`.
  `schema.ts` Node'da da yüklenir; yalnız `core` import eder. `feature.ts`
  `editor.ts`'i hiç anmaz (statik de dinamik de); editör host'u onu kendisi toplar.
- Kuralların tek kaynağı `.dependency-cruiser.cjs`. Kural eklerken
  `tests/fixtures/layer-violations/` altına kasıtlı bir ihlal ve
  `expected.json`'a satırını ekle; öz-test eksik ya da fazla ihlalde kırılır.
- Göreli import'lar depo genelinde `.ts` uzantılı yazılır (`./id.ts`); `enum` /
  `namespace` gibi silinemeyen sözdizimi yok. `tools/` betikleri `node dosya.ts`
  ile çalışır; `src/core` ve şemalar da aynı yolla Node'da yüklenir.
- `src/core` DOM'a, three'ye ve `import.meta.env`'e dokunmaz; geliştirme / üretim
  ayrımını çağıran parametreyle verir.
- `src/engine` de DOM'suz ve Web Audio'suz, düz Node'da yüklenir; tarayıcı API'si
  gereken kod `src/runtime`'da (ör. `runtime/audio`). `src` altındaki testler
  yalnız `node:assert`, (bağımsız referans kodlayıcı olarak) `node:zlib` ve
  (ortak test fixture'ı okumak için) `node:fs` import edebilir; Forge'dan
  taşınan kontroller birebir
  kalır (`check` = Vitest `test`).
- `src/engine/testing/` test iskelesidir (Forge'un eski döngüsü): yalnız testler
  import eder, ürün koduna girmez; Faz 6'da silinir. Taşınan alt sistemler
  `src/engine/subsystem.ts` biçimini uygular. İlerleme `npm run port:forge-tests`.
- `src/engine/legacy/` geçiş modelidir (Forge'un eski bileşen okuyucuları):
  yalnız `src/engine` import eder; Faz 6'da şemalı bileşenlerle silinir. Yeni
  koda okuyucu ekleme, şemaya git.

## Çalışma kuralları

- Doğrudan `main`. Commit ve push yalnız kullanıcı açıkça istediğinde yapılır;
  bir değişiklik talebi bunları kendiliğinden yetkilendirmez. Commit isteği push
  izni değildir. Kırık ara durum commit'lenmez.
- Doğrulama değişikliğin kapsamıyla orantılı tutulur (kullanıcı kararı,
  2026-11-16):
  - Küçük değer, görünüm, varsayılan ayar ve belge değişikliklerinde diff
    kontrolü ve doğrudan ilgili kısa doğrulama yeterlidir. Otomatik test
    eklenmez; tam test paketi, build, smoke veya `gate` çalıştırılmaz.
  - Davranış değişikliği veya hata düzeltmesinde yalnız etkilenen testler bir
    kez çalıştırılır. Yeni test yalnız anlamlı bir regresyon riskini kapsıyorsa
    eklenir; uygulamanın aynısını tekrar eden test yazılmaz.
  - Yeni değişiklik, başarısızlık veya somut açık risk yoksa geçen kontroller
    tekrarlanmaz ve doğrulama kapsamı genişletilmez. Kullanıcının testleri
    atlama yönündeki açık talimatı önceliklidir.
- Tam `npm run gate`, kullanıcı push istediğinde push öncesinde veya tam
  kapıyı açıkça istediğinde çalıştırılır; sıradan iş tamamlama ya da yalnız
  commit isteği tam kapı gerekçesi değildir. Sonuçta yapılan doğrulama ve
  kalan sınırlar kısaca belirtilir.
- Commit yol sınırlı atılır: `git commit -m "..." -- <yollar>`.
- three `0.187.0` tam sabit (K5). Rapier `0.19.3` Forge ile aynı; TypeScript ve
  Vite ana sürümleri de Forge'la aynı. Yükseltme faz sınırında, ayrı adımdır.
- Forge WebGL deposu buradan yalnız okunur. Algoritmalar olduğu gibi taşınır
  (plan §2.11); `SceneApp` / `RuntimeSceneApp` referans alınır, kopyalanmaz.
  **İstisna (Faz 1, kullanıcı kararı 2026-11-11):** WebGPU spike'ı Forge'da
  `spikes/webgpu/` altına yazılır (plan Faz 1); `spikes/README.md`'deki bölümü
  dahil. Başka Forge dosyasına dokunulmaz. Forge'un kuralları geçerli:
  `main`, push öncesi `npx tsc --noEmit` + `npx tsc -p spikes`, yol sınırlı
  commit. Sonuçlar bu deponun planına yazılır. Referans içerik ve ölçüm
  düzeneği `C:\Users\emret\Desktop\Games\ForgeReference` (README'si).
- Render kabulü yerelde, başlıklı tarayıcıda, gerçek WebGPU backend'inde
  yapılır. CI'da GPU yok; WebGL2'ye düşen koşu WebGPU kabulü sayılmaz.
