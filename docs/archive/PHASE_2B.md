# Faz 2b — Cut-over, alt sistemlerin taşınması ve içe aktarıcı (arşiv)

**Kapandı:** 2026-11-12. [Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
kapanışta olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır.
Kararların kendisi [mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
(§0.0 K12, §4.4, §4.6, §4.8; v1.2–v1.5). Taşınan her modül ve uyarlaması
[taşıma günlüğünde](../PORT_LOG.md) (§2, sayım §2.1). Bölüm numaraları (§2.11, §7…)
plana, "mimari §…" rapora göndermedir.

Ön koşul: Faz 1 GO.

- [x] Forge WebGL'e `forge-webgl-final` etiketi ve bakım modu notu (§3);
      taşıma bu SHA'dan yapılır ve `docs/PORT_LOG.md`'ye yazılır.
      *Yapıldı (2026-11-11, kullanıcı onayı):* etiket Forge `04b5fb23`'te
      (açıklamalı, push'lu); bakım modu notu Forge `CLAUDE.md`, `README.md`,
      `AGENTS.md` başında; Forge hafızası güncellendi (K6'nın yerini "yalnız
      hata düzeltmesi" aldı). Envanter tabanından (`b3fa0c1a`) bu yana fark
      yalnız spike + not; envanter değişmedi.

- [x] **Test sınıflaması (ilk iş):** Forge'un 176 test dosyası iki kümeye
      ayrılır: algoritma testleri (mekanik `check()` → `test()` çevirisi) ve
      eski `scene` / `persistence` / `world` veri modeline dayananlar (yeni
      modele göre yeniden yazılır ya da düşer). Sayılar `PORT_LOG`'a yazılır;
      "taşınan testler yeşil" kapısının paydası budur.
      *Yapıldı (2026-11-11):* kontrol yeri başına, araçla
      (`npm run port:forge-tests`; satırlar `docs/port/forge-engine-tests.tsv`,
      özet `PORT_LOG` §2.1). 2.588 kontrol yeri (176 dosya + `tools/engine-tests.ts`
      içi). Kümeler ikiden üçe çıktı: A algoritma 1.010, M eski veri modeli
      959, R render 619. K12'den sonra (2026-11-11) dördüncü küme D taşınmaz
      95; A 940, M 935, R 618. Ses taşınırken Sound Cue D'ye geçti:
      **A 927 (paydası bu)**, D 108. R kümesi three'ye render için
      ulaşan kontrollerdir (`render-three`, `src` uygulama katmanı); 2b'de
      taşınmaz, render'ı yeniden yazan fazla gelir. A'nın 471'i sınırda
      uyarlama ister; 88'i `engine/physics/ragdoll.ts`'in three matematiği
      yüzünden (bu depoda three yalnız render'da).
- [x] **Taşıma:** `engine/*` three'siz alt sistemleri (physics, terrain
      verisi, navigation, movement, audio, behavior, worldbuilder
      algoritmaları, environment, perf, animation, input, loading, perception,
      ui, vfx, gameplay, core) ve ilgili testleri: kopyala → sınırda yeni
      aktör / şema modeline bağla → testler yeşil. Algoritmalar değiştirilmez
      (§2.11). `engine/assets` A10 modeline göre yeniden kurulur. K12 gereği
      `engine/dialogue`, `engine/ai` ve `engine/physics/ragdoll.ts` taşınmaz;
      `physicsSubsystem`, `behaviorSubsystem` ve `defaultInputBindings`'in
      ragdoll bağı taşımada kesilir (ragdoll'un three matematiği de onunla
      gider). Ses ve UI'da yalnız kod kütüphanesi taşınır; editörleri ve
      Sound Cue / ses bileşeni yüzeyi yok. `src/engine` DOM'suz ve Web
      Audio'suz (kullanıcı kararı 2026-11-11); tarayıcı API'si gereken dosyalar
      `src/runtime/<alt sistem>/`'e. İlerleme `npm run port:forge-tests`
      (A taşınan / 927).
      *Ses taşındı (2026-11-11):* `src/engine/audio` + `src/runtime/audio`,
      37 kontrol yeşil; kalıp ve kayıt `PORT_LOG` §2.
      *UI taşındı (2026-11-11):* `src/engine/ui` + `src/runtime/ui/uiDom.ts`,
      50 kontrol yeşil. *Input, zaman kontrolü, iş bölme, kare ölçümü
      taşındı (2026-11-11):* `src/engine/{input,time,work,perf}`, 13 kontrol.
      *Test iskelesi (kullanıcı kararı 2026-11-11):* Forge'un eski uygulama
      döngüsü (`EngineApp` + `SubsystemRegistry`) yalnız testlerin
      kullanabildiği `src/engine/testing/`'te; onunla tick'lenen kontroller
      birebir taşınır. Taşınan alt sistemler Forge biçimini
      (`src/engine/subsystem.ts`) Faz 6'ya kadar korur. Perf hesabı
      (profil çıkarıcı, kare bölgeleri, darboğaz sınıflayıcı, bütçe) ve
      `inputSubsystem` geldi. İlerleme A 118 / 927.
      *Physics taşındı (2026-11-11):* `PhysicsSubsystem` (2.817 satır) 1.500
      satır bütçesi için beşe bölündü (`StaticWorld`, `VehiclePhysics`, yardımcılar,
      tipler; yöntem gövdeleri aynı), ragdoll çıktı; araçlar ve zemin tepkisi,
      çarpışma, sorgu tipleri geldi. Eski bileşen okuyucuları geçiş olarak
      `src/engine/legacy/`'de (kullanıcı kararı; yalnız engine import eder,
      Faz 6'da silinir). 96 kontrol yeşil (28'i gerçek Rapier). İlerleme
      A 214 / 923.
      *Terrain taşındı (2026-11-12, sınıflandırma kullanıcı onayıyla):*
      `src/engine/terrain` (34 dosya; veri, düzenleme, sorgu, LOD, içe
      aktarma, yüzey, editör tile akışı) + scene'deki saf landscape
      algoritmaları (brush, spline doğrulama, `landscape.ts`'in spline kısmı)
      + genel spline eğri matematiği (`src/engine/spline`) + saf ızgara / akış
      matematiği (`src/engine/world`; `core/level/cells` ile birleştirme 5b'de)
      + `terrainCollider`; `LayoutLandscape` legacy'ye. Ertelenenler: göl /
      nehir / okyanus Faz 7'ye, su birikintisi 5a'ya, terrain runtime akışı
      ve `worldStreamingSubsystem` 5b'ye, `worldTerrainMove` 5d / 7'ye.
      153 terrain kontrolü yeşil (`heightmapPng` için `node:zlib` bağımsız
      referans kodlayıcı olarak `src` testlerine açıldı, kullanıcı kararı).
      İlerleme A 370 / 923.
      *Navigation taşındı (2026-11-12):* `src/engine/navigation` (Recast /
      Detour sarmalayıcısı, döşemeli planlayıcı, ajan profili, yerel kaçınma);
      `@recast-navigation/core` `0.43.1` tam sabit (Forge ile aynı); worker
      mesajlaşması `src/runtime/navigation`'da. `navFloorSampler` movement ile.
      23 kontrol yeşil (17'si gerçek Recast wasm'ıyla). İlerleme A 393 / 923.
      *Movement taşındı (2026-11-12):* `src/engine/movement` (karakter hareketi
      alt sistemi, çarpışma, düzlemsel / dikey hareket, yokuş yavaşlaması,
      lokomosyon) + `animation/blendSpace` + `navFloorSampler`; hareketli
      platform bağı kesildi (K12; platform bağlamı hep boş). Karakter hareketi
      okuyucusu legacy'ye. 76 kontrol yeşil. İlerleme A 469 / 923.
      *Behavior taşındı (2026-11-12, tasarım kullanıcı onayıyla):* koddan
      kayıtlı davranış + script mesajları; olay / mesaj bağlamaları kod
      kaydında (`BehaviorDefinition`), referans / arayüz / dispatcher /
      değişken / ses bileşeni yok (K12). Tipler bütçe için `behaviorTypes`'a.
      Bağlama fixture'lı Forge kontrolleri test köprüsünden geçer
      (`src/engine/testing/forgeBindings.ts`). 33 kontrol yeşil, 1 düştü
      (D, payda 922). İlerleme A 502 / 922.
      *Küçük alanlar taşındı (2026-11-12):* environment, loading, perception,
      vfx parçacık tanımları, perf'in kalanı (frame capture, GPU sweep, perf
      witness). Kalite profilleri / uyarlamalı kalite / donanım ipuçları /
      WebGL GPU timer Faz 3'e (Forge profilleri WebGL ayarı), Player Start
      Faz 6'ya, `lakeQuality` Faz 7'ye, `puddleWind` 5a'ya. 57 kontrol
      yeşil. İlerleme A 559 / 922.
      *Worldbuilder taşındı (2026-11-12, seçenek B):* algoritmalar ve aşama
      üreticileri `src/engine/worldbuilder`'da; Stage Runner taşınmadı, köken
      `recipe.generatedBy`'da. Aşama kontrolleri Forge'un çalıştırıcısının
      iskele kopyasıyla koşar. 53 kontrol yeşil, 15 D (payda 907). İlerleme
      A 612 / 907. Nötr bölge profili fixture'ını okuyan 58 kontrol `node:fs`
      `src` testlerine açılınca (kullanıcı kararı, `src-tests-node-assert-only`
      + kontrol fixture'ı) yeşil. İlerleme A 670 / 907.
      *Kırılma + göçük algoritmaları taşındı (2026-11-12, kullanıcı onayı):*
      `src/engine/physics/{fracture,deformable}` (three'siz, olduğu gibi);
      asset türü, bileşenler, mesh senkronu, `dentWear` TSL ve editör Faz 8.
      88 kontrol yeşil. İlerleme A 785 / 905.
      *Araç kontrolleri (2026-11-12):* `surfaceResponse` 20, `vehicleDrivetrain`
      13, `vehicleAssets` 1 elle (gövdeler aynı); stok GAZ-52 tanımı test
      fixture'ı. İlerleme A 819 / 905.
      *Kapandı (2026-11-12, kullanıcı kararları):* kalan 86 A gövde düzeyinde
      yeniden okundu. Dosya düzeyinde ertelenmiş ama gövdesi taşınmış saf koda
      inen 17 kontrol taşındı (`wheelSurfaceFx` 4, terrain render kaynağı /
      akış codec'i 8, `perfReadout` 2, `vehicleRuntime` 2, `windSway` 1). Eski
      merkezî asset manifesti 9, şablonların `main.ts` import listesi 2,
      worldbuilder klasör düzeni 1 kontrol D; `terrainSplineData`'nın eski
      `terrainSaveValidator`'a bağlı kontrolü M (5a); `checkSlow` sarmalayıcısındaki
      iki çağrı kontrol sayılmaz. Payda 890. **Kapatma kuralı:** her A ya
      taşınmış ya da fazına yazılmıştır (`DEFERRED_CHECKS`, TSV `deferred`
      sütunu); ertelenenler paydada kalır ve her fazın kapısı kendi ertelenen
      A'larını yeşil ister: Faz 3 18, 5a 4, 5b 2, 5d 4, Faz 6 4, Faz 7 20,
      Faz 8 2. **A 836 / 890.**
- [x] Kayıt oyunu (`engine/persistence`) ve World Partition (`engine/world`)
      yeni modele göre yeniden kurulur; GUID anahtarlı. Kayıt oyunu `persist`
      işaretli bileşen alanlarını ve `defineSaveState` bölümlerini saklar;
      tipsiz `flags` torbası yok (mimari A7).
      *Tasarım (kullanıcı onayı 2026-11-12; mimari §4.4, §4.6, §4.8 v1.5):*
      sınıflama `engine/world` ve `engine/persistence`'ı modül düzeyinde eski
      model sayar (129 saf kontrol M → A, 40 D, payda 1.022); bileşen
      alanının `persist` bayrağı + bileşenin `state` bölümü (level'a yazılmaz);
      davranışın `flags`'i Faz 6'da tipliye; tek dünya ızgarası `src/core`'da.
      *Yapıldı (2026-11-12):* sınıflama (`4bdc041`), tek ızgara + akış
      politikası (`e005bc2`), slot deposu + slot arayüzü (`8b8449f`), hücre
      yerleşim planlayıcısı + durum belleği (`38aca39`), `forge.saveGame/1` +
      `persist` / `state` / `defineSaveState` + yakalama / uygulama + durum
      defteri, SDK 0.1.1 (`3f9b423`). Runtime akışı 5b'de, runtime kayıt
      özelliği Faz 6'da. Bu kutunun 49 A'sı taşındı; **A 885 / 1.022**, fazı
      yazılmamış taşınmayan A yok.
- [x] `tools/world` taşınır; World Builder çıktısı yeni level formatını yazar;
      `npm run world:random` çalışır (test dünyaları ilk günden üretilebilir).
      Çıktı kuralları: üretilen level projenin içerik ağacına yazılır, asset
      olarak kayıtlıdır (Content Browser'da görünür) ve var olanın üstüne
      `--force` olmadan yazılmaz; recipe, bölge profili ve referans görseli
      level'ın yanında durur. Her yerleşim GUID + rol bileşeni taşır
      (placeholder → model geçişi için). Bölge profili oyun verisidir, motor
      deposuna girmez.
      *Tasarım (kullanıcı onayı 2026-11-12; mimari §4.4, §4.6 v1.3):*
      aşamalar ve bake bellekte bugünkü tiplerle koşar, sonda saf bir
      dönüştürücü yerleşimleri aktöre çevirir (deterministik GUID; `forge.shape`
      ya da `forge.staticMesh` + `forge.worldRole`), arazi `forge.terrain`
      aktörü ve veri belgesi (tile'lar metasız parça). Saf kurulum
      `src/engine/worldbuilder/build/`, dosya işi `tools/world/` (kayıt
      servisinden, `--force` kuralı). Köken nesnelere (`forge.worldRole.stage`);
      diskteki recipe `generatedBy` taşımaz. Girdiler GUID'li veri belgesi;
      zemin örtüsü ön ayarları + nötr profil `content/packs/worldbuilder/`.
      Su aktörleri Faz 7, foliage kuralları 5c, ışık / gökyüzü Faz 3:
      yazılmaz, raporlanır. Çözülemeyen model satırı rol renkli placeholder
      olur. *Adım 1 (2026-11-12):* veri belgeleri + dört şema (`d1a50f5`).
      *Yapıldı (2026-11-12):* `npm run world:random` / `world:brief`
      (`65285df`): kurulum `src/engine/worldbuilder/build`, yazıcı
      `tools/world` (kayıt servisinden tek atomik kayıt, `--force` kuralı,
      başarısız kurulumda brief geri gelir; yeniden üretim aynı baytları
      yazar), `worldbuilder` paketi. Üretilen dünya projenin asset kapısından
      geçer ve başlangıç level'ı olarak başsız açılır. Bekleyen kontroller
      (`8f29972`): 21 World Builder + test dünyaları 2 + terrain onarımı 4;
      D'ye düşen ana yol spline kontrolü yeni çalıştırıcıyla yeniden yazıldı.
      Açık kalan 4 A: Forge'un eski level belgesi (`testWorldLevel`,
      `worldDataCheck`) ve off-road smoke fixture'ı (2). İlerleme A 697 / 907.
- [x] World Builder taşıma kapsamı envanterde işaretlenir: algoritmalar
      (arazi yazma, rota çözücü, yerleşim, ped, foliage) taşınır; yeniden
      çalıştırılabilir aşama / sahiplik / Dry Run yüzeyi konseptten sahne
      akışında kullanılmadığı için (kullanıcı kararı 2026-11-07) varsayılan
      olarak taşınmaz.
      *Karar (kullanıcı, 2026-11-12, seçenek B):* algoritmalar ve aşama
      üreticileri taşındı; Stage Runner (`planStage`: Dry Run, sahiplik, elle
      düzenleme / silme koruması, çıktı hash'leri), üretici sürümleri ve
      `preserveManualOverrides` taşınmadı. Aşamaların birbirinin çıktısını
      bulduğu köken `recipe.generatedBy` olarak kaldı (çalıştırıcı yazar:
      `tools/world`); korumalı bölgeler üst düzey `recipe.protectedRegions`.
      Kökenin nesnelerin üstüne (aktör bileşeni) taşınıp taşınmayacağı
      `tools/world` yeni level formatını kurarken kararlaştırılır.
      *Karar (kullanıcı, 2026-11-12):* köken nesnelere taşındı
      (`forge.worldRole.stage`); diskteki recipe `generatedBy` taşımaz (mimari §4.4).
- [x] Kenney dizin aracı (`tools/asset-library-index.mjs`, `kenney-assets.tsv`)
      için karar: bu depoya taşınır mı, Forge'da mı kalır. Kütüphanenin kendisi
      depoya girmez (mimari A9).
      *Karar (kullanıcı, 2026-11-11):* bu projede Kenney ya da Quaternius yok
      (asset de araç da). İki dizin üreticisi ve Kenney dizini GameDesign
      klasörüne taşındı (`tools/`, `docs/kenney/`), Forge'dan kaldırıldı
      (Forge `92a709aa`). PORT_LOG INV-H25 "taşınmaz".
- [x] **İçe aktarıcı** `tools/import-forge-webgl`: level, hücreler, foliage,
      sidecar'lar → yeni format; terrain tile'ları olduğu gibi. Çevrilemeyen
      alan raporlanır. Referans level'lar ve starter content bununla gelir;
      referans level'lar depo dışı yerel içerik projesine yazılır, starter
      content `content/packs/starter/`'a (mimari A9).
      *Tasarım (kullanıcı kararları 2026-11-12; mimari §4.4, §4.6 v1.4):*
      - *Şimdi çevrilen:* `instances` → `forge.staticMesh` / `forge.shape` +
        `forge.worldRole` (`marker:playerStart` → "Player Start" adlı
        bileşensiz aktör); `landscapes` → `forge.terrain` aktörü + veri
        belgesi, tile'lar ve global harita olduğu gibi kopyalanır;
        `worldCells` → A11 hücreleri (atama konumdan, kendiliğinden);
        `heightFog` → `forge.heightFog`; World Builder yan dosyaları
        (`*.worldbrief.json`, `*.worldrecipe.json`, `*.regionprofile.json`,
        referans görsel) → veri belgeleri / ikili asset.
      - *Raporlanan:* geri kalan her alan level başına raporda "çevrilmedi:
        alan → faz": ışık / gökyüzü / bulut / post process / WES /
        `worldSettings` Faz 3, foliage 5c, su Faz 7, spline / blocking volume /
        prefab örnekleri (`actors`) / araç Faz 6, yerleşimdeki `fracture` Faz 8.
        Çeviriciler bir kayıtta durur, kendi fazlarında eklenir. İçe aktarıcı
        deterministiktir (GUID kaynak yolu + kimlikten türer); fazlar
        ilerledikçe yeniden çalıştırılır ve aynı GUID'leri yazar.
      - *Ortak çevirici:* yerleşim → aktör çevirisi World Builder'la ortak saf
        kod, `src/engine/forgeImport/`; `worldbuilder/build/worldLevel` onu
        kullanır (davranış ve testleri aynı).
      - *Asset türleri:* üç yalnız-şema ikili tür, içe aktarma ayarı olmadan
        (`forge.model`, `forge.texture`, `forge.sound`; ayarlar Faz 3'te sürüm
        2 + geçiş zinciriyle). Materyal, efekt, araç, foliage türü ve UI kendi
        fazlarında; şimdi raporlanır. K12 türleri (AI, diyalog, Sound Cue)
        atlanır ve listelenir.
      - *Lisans (sorumluluk kullanıcıda):* lisansı bilinmeyen asset de alınır;
        oyun projesine girmez, kullanıcı kendi varlıklarını üretene kadar
        durur. Lisans ve kaynak yol önekine göre bir köken tablosundan
        yazılır (mimari §4.6). Kenney / Quaternius yine yok
        (`assets/kenney-nature-kit` alınmaz).
      - *Hedefler:* starter content'in tamamı (~150 MB) değil, bir tohum
        listesinden (örnek proje, motor testleri, editör varsayılanları,
        referans level'ların kullandıkları) başvurulanlar ve dokuları
        `content/packs/starter/`'a; referans level'lar depo dışı yerel içerik
        projesine (`Games/ForgeReference/webgpu-scenes`, `create-project` ile,
        `forge.projects.local.json`'a kayıtlı), kullandıkları asset'lerle (A9).
      - *CLI:* `npm run import:forge -- --forge <Forge public> --project
        <hedef> …`; level başına rapor (çevrilen / çevrilmeyen alan, asset
        sayıları); yazım kayıt servisinden (`tools/world/worldWrite.ts`
        kalıbı), ikililer sahneleme kanalından meta dosyalarıyla.
      - *Araç kontrolleri:* `vehicleDrivetrain` / `vehicleAssets`'in okuduğu
        Forge araç JSON'ları ve sesleri test fixture'ı olarak
        `tests/engine/fixtures/`'a (içe aktarıcıdan bağımsız); araç asset
        türü Faz 6.
      *Adım 1 (2026-11-12):* araç kontrolleri 34 elle (`1caa990`), A 819 / 905.
      *Adım 2 (2026-11-12):* ortak çevirici `src/engine/forgeImport/`
      (`placements`: World Builder'la ortak, `worldLevel` testleri aynı;
      `importForgeLevel`: level + hücreler + terrain tanımı → yeni level,
      faz tablosuyla rapor `fields.ts`) ve `forge.model` / `forge.texture` /
      `forge.sound` (`forge.staticMesh.mesh` `forge.model` gösterir).
      *Adım 3 (2026-11-12):* `npm run import:forge` (`tools/import-forge-webgl`):
      köken tablosu, model → materyal → doku zinciriyle asset planı, level
      başına rapor (`--dry-run`, `--report`), World Builder yan dosyalarının iç
      yolları yeni etiketlere ve profil asset'leri GUID'e, eski recipe defteri
      nesnelere; tek atomik kayıt, `--force` kuralı, yeniden çalıştırma aynı
      baytlar. WbPilotValley: 151 yerleşim / 45 hücre / 41 asset; World Builder
      içe alınan brief'ten aynı 152 aktörü kurar.
      *Adım 4a, starter paketi (kullanıcı kararları 2026-11-12):* yalnız motor
      varsayılanları tohum grubu (`starterSeeds.ts`), lisansı bilinmeyenler de
      pakette; `npm run import:forge -- --pack starter` → 28 asset (doku 23,
      ses 5), 21,8 MB, `verify:assets` yeşil. Araç / kırılabilir grupları ve
      referans level'ların asset'leri pakete girmez (referans projesine).
      *Adım 4b, referans projesi (2026-11-12):* `Games/ForgeReference/webgpu-scenes`
      (`create-project --register`, starter paketini seçer, `check:projects`'te):
      OpenWorldTest, Island, WbPilotValley, L03, PhysicsInteractionTest,
      spline-test-range (forge-scenes) + Derekavak (Ridgebound kopyası, asset'leri
      `content/ridgebound/`, ortak kimlikler yeniden kullanılır). 7 level, 4 terrain,
      27 model, 44 doku, 188 MB; asset dizini 0 sorun, başsız açılış 2,1 s.
      Yeniden çalıştırma komutları referans klasörünün README'sinde.
- [x] **İçe aktarıcının kabulü:** her eski tür için küçük fixture + beklenen
      çıktı testi; referans level'larda kaynak ve hedef arasında tür başına
      sayım karşılaştırması (aktör, bileşen, foliage örneği, hücre) ve
      çevrilemeyen alan raporu. Fark açıklanmadan kapı geçilmez; görsel
      eşdeğerlik Faz 3 kapısında.
      *Yapıldı (2026-11-12):* fixture testleri `src/engine/forgeImport/forgeLevel.test.ts`
      (level, hücre, landscape / terrain, Height Fog, shape / model / Player Start,
      bilinmeyen alan) ve `tools/import-forge-webgl/import.test.ts` (World Builder
      yan dosyaları, model / doku / ses, materyal zinciri, köken tablosu, K12,
      Kenney, paket kipi, yeniden çalıştırma). `import:forge --compare` yazılan
      level'ı kaynağından bağımsız sayar (`f1851bc`); yedi referans level'da
      yerleşim, terrain, sis, Player Start ve aktör sayıları eşit, foliage örneği
      kaynakta da yok (yalnız 7'şer arazi kuralı → 5c). Tek fark hücrelerde, hepsi
      açıklamalı: bölümlenmemiş kaynak level'lar konumdan atanır (A11);
      WbPilotValley'de 45 → 46, çünkü Forge level dosyasının Player Start'ını
      kalıcı level'da tutuyordu, yeni modelde aktör durduğu hücrede (`-1_2`).
      Player Start'ın kalıcı katmanda olup olmayacağı Player Start özelliğiyle
      (Faz 6) kararlaştırılır. Çevrilmeyen alan raporları referans projesinin
      kökünde (`import-report-*.md`).
