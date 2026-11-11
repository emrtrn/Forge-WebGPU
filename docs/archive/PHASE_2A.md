# Faz 2a — Mimari iskelet (arşiv)

**Kapandı:** 2026-11-11. [Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
kapanışta olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır.
Kararların kendisi [mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
(§4.3–4.8, "2a kararları" bölümleri). Bölüm numaraları (§2.10, §7…) plana,
"mimari §…" rapora göndermedir.

Bu fazın her maddesi [mimari raporun](../planned/FORGE_WEBGPU_ARCHITECTURE.md) bir
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
- [x] Depo düzeni: `content/engine/`, `content/packs/starter/` (manifestte
      `contentPacks`), `samples/`, `tests/fixtures/projects/`; testler fixture'ın
      geçici kopyasında çalışır, dev server fixture / `samples/` köklerine yazmaz
      (mimari A9). Manifestte `contentPacks` (paket kimlikleri, tekil); içerik
      kökleri etiketli (`ContentRoot`: etiket + klasör), motor içeriği ve
      paketler proje dizinine `engine:content/engine` ve
      `engine:content/packs/<id>` etiketiyle girer, oyuna kopyalanmaz; dev
      server bunları `/__forge/read?path=engine:...` ile okur, hiç yazmaz;
      bilinmeyen paket `forge check`'i ve açılışı durdurur; `check:projects` ve
      `create-project` sınıfları paketlerden çözer. `verify:assets` motor
      içeriğinin hiçbir pakete, bir paketin başka bir pakete referans
      vermediğini dar dizinlerle sınar; tarama `*.md`'yi atlar.
      `content/engine/` şimdilik boş (README); starter paketinde bir Height Fog
      sınıfı, `samples/starter`'ın sisi onun örneği. Fixture
      `tests/fixtures/projects/missing-pack`. Paket / motor içeriğini düzenleyen
      editör modu Faz 4'te karara bağlanır; build'in paketleri dist'e alması
      dist doğrulamasıyla. (2026-11-10)
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
- [x] Kapılar ve CI: tip kontrolü (iki tsconfig), katman denetimi + öz-testi,
      Vitest, build, dist doğrulaması, SDK API snapshot farkı, boyut bütçesi,
      alt dizin (`base`) yayını testi (mimari §4.10, F06). *Kuruldu
      (2026-11-10):* `npm run gate` = tip kontrolü (iki tsconfig) + katman
      denetimi + öz-test + dosya boyutu bütçesi + Node yükleme kapısı
      (`verify:node-load`) + asset kapısı (`verify:assets`, D16) + SDK API
      kapısı (`verify:sdk-api`) + proje uyumluluğu (`check:projects`) +
      Vitest + build; aynı kapı `.github/workflows/ci.yml`'de. Dist
      doğrulaması ve alt dizin yayını testi editör ve build'le birlikte
      Faz 4'e taşındı (kullanıcı kararı 2026-11-11).
- [x] `CLAUDE.md`, `AGENTS.md`, `docs/architecture/ARCHITECTURE.md` (mimari
      rapordan) yazılır. (Bu plan ve rapor 2026-11-10'da yeni deponun
      `docs/planned/` klasörüne taşındı.) *`CLAUDE.md` ve `AGENTS.md` yazıldı
      (2026-11-10). `ARCHITECTURE.md` (2026-11-11) rapordan kısa harita:
      katmanlar, özellik klasörü, veri modeli, şema kaydı, kayıt servisi,
      uygulama kabuğu, proje sözleşmesi, depo düzeni, kapı; kararları tekrar
      yazmaz, rapora bağlanır.*
- [x] Plan belgesi düzeni: faz başına yaşayan plan belgesi mi, yalnız bu ana
      plan mı; biten planların arşiv yeri ve dizini (Forge'da `Forge-Archive` +
      `COMPLETED_WORK_INDEX.md` idi). `CLAUDE.md`'ye yazılır. *Karar
      (2026-11-11):* tek ana plan, faz başına yaşayan belge yok. Faz
      kapanınca (kapı geçti, bütün kutular işaretli) ayrıntısı kapanış docs
      commit'inde `docs/archive/PHASE_<faz>.md`'ye taşınır; planda kısa özet
      + bağlantı kalır, §11 planda kalır, `docs/archive/INDEX.md` dizindir.
      Kural `CLAUDE.md`'de.
- [x] `docs/PORT_LOG.md`: Faz 0 envanterinin üstüne taşıma günlüğü bölümü
      açılır (§7). *İskelet (2026-11-11):* özellik envanteri, taşıma günlüğü
      ve port bekleyenler bölümleri; envanter Faz 0'da doldurulur.
