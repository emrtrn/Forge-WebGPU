# Faz 5 — Açık dünya (arşiv)

**Kapandı:** 2026-11-25. [Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
kapanışta olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır.
Kararların kendisi [mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
(§4.4, §4.6, §4.9; v1.28–v1.82). Taşınan ve yeniden yazılan her modül
[taşıma günlüğünde](../PORT_LOG.md) (§2). Bölüm numaraları (§2.2…) plana,
"mimari §…" rapora göndermedir.

Dört alt faz; her birinin kendi kapısı var, görsel kabul sonda toplu istenir.
5a önce gelir; 5b ve 5c onun üstünde paralel yürüyebilir; 5d, 5a–5c'nin
çıktısını kullanır.

**WES + prosedürel bitki bağı (kullanıcı kararı, 2026-11-14; yalnız plan):**
[prosedürel bitki planı](../planned/PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md) v0.6 ile
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
6. *Uzak temsil:* ~~önce Forge'un çalışma anı billboard'u TSL'de, içe aktarılan
   GLB türleri için~~ (kullanıcı, 2026-11-19, F3): bütün uzak billboard'lar PG3'ün
   yarım küre octahedral impostor'u; üretilen bitki offline atlasını, içe aktarılan
   GLB türü çalışma anında model başına bir kez CPU rasterleyiciyle (worker) bake
   edilen tek katmanlı atlasını kullanır. PK7 PG3'te ölçümle kapandı (2026-11-19): odun / yaprak ayrımı.
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
   yok. Referans projesi yeniden alınmadı (kullanıcıya sorulacak; karar 2026-11-18:
   Derekavak, Island, WbPilotValley yeniden alınır, F0).
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
   Alt adımlar F1–F3 aşağıda (foliage sırası, v1.73).
7. Boyanmış hücreler ↔ WP akışı, residency, `?debug` satırları — C. Alt adım F4.
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
   **PG0 şemaları `c0937cd`; PG1 kalanı uygulandı (2026-11-18, `eea639f`; GLB yazıcısı ve doku
   pişirici Codex `gpt-6.2-sol` high, Claude inceledi).** Kullanıcı kararları (2026-11-18): collider
   modelin meta'sında (`forge.model` `collision.convex`, Faz 6 genişletir); materyal öneri gibi:
   `forge.surfaceTextureRecipe@1` + `forge.material` `projection` (uv / triplanar) ve `variation`
   (karma yolun gölgelendirici payı), A yalnız ölçüm. Ayrıntı bitki planı §10 PG1. Ölçüm
   `npm run measure:rock-material` (L03, 196 kaya, 1080p `high`, 60 Hz adımlı, GPU ms, yakın / tarla):
   M_White 1,48 / 0,76, **C 1,55 / 1,11**, C `variation` kapalı 1,44 / 0,91, **A 2,85 / 1,93**;
   kayıt `render-refs/runs/2026-11-18T17-28-28-708Z-rock-material.json`, kontrol çekimi
   `render-refs/candidates/pg1-rocks.png` (görsel kabul kullanıcıda).
9. PG2 iki ağaç: aile, bileşen, WES tepkisi — X üretici / C TSL ve tepki.
   **Kullanıcı kararı (2026-11-18):** bitki planının 2026-11-14 sırası korunur, PG2–PG3 5c içinde.
   **Uygulandı (2026-11-18), ayrıntı bitki planı §10 PG2:** foliage rüzgârı `fa11eb2` (batch'e örnek
   başına shading kancası, GPU yolu + gölge görünümleri + WebGL2 ikizi; Forge'un yükseklik formülü ve
   köşe ağırlıkları), ortak tepki çözümleyicisi + WES `transitionSeason` `b9608c8`, dallanan üretici
   (Codex) + yaprak dokusu + `forge.treeRecipe@1` + `forge generate` ağaç çıktısı + starter `Broadleaf` /
   `Conifer` `bc05121`, bitki çizimi (`render/plant/`, `forge.plant` bağlaması, aileli foliage türü)
   `3a8dd57`. Smoke: `foliageWind.smoke.ts`, `plants.smoke.ts` (iki arka uç); adaylar
   `render-refs/candidates/pg2-plants-{summer,winter,snow}.png` (görsel kabul kullanıcıda).
10. PG3 LOD / kart / impostor bake, PK7 — X rasterleyici / C.
   **Uygulandı (2026-11-19; ayrıntı ve ölçüm tabloları bitki planı §8, §10 PG3):** CPU bake, kartlar, impostor
   (`3253c3a`, `a9d75fc`), uzak billboard'lar PG3 biçiminde (F3, `0ffdcf5`). **Kullanıcı kararları (2026-11-19):**
   `forge generate` atlasları doğrudan KTX2 yazar (UASTC + Zstd, mip'li; `ktx2-encoder` 0.6.0 yalnız araçta), PK7
   commit'siz spike'la ölçülür. KTX2 (`e603b87`): tür başına GPU doku belleği 69,3 → 17,3 MiB, indirme 10,5 → 8,4 MB
   (Broadleaf); bağımsız `.ktx2` asset'i için `KTX2Loader`'a istek başlığı; impostor yuvasına `color` (uzak ton,
   sıkıştırılmış atlas okunamaz). PK7: sınırlı mevsim atlası bellekte eşit, GPU'da gürültü içinde, ara mevsim ve
   odun / yaprak tonu kaybı: odun / yaprak ayrımı kalır. Üretilmiş aile türünün uzak blokları smoke'ta (`bd09bdf`):
   yerleşim %99,1 / %98,6, ton %8,1 / %6,7, kışın billboard'lar çıplak, iki arka uç.
11. `measure:foliage`, PV-WES, kapı, belgeler, görsel kabul — C.
   **Teknik kapı geçti (2026-11-19), görsel kabul kullanıcıda.** `npm run measure:forest` (`bd09bdf`, `078dcfd`;
   kayıt `render-refs/runs/2026-11-19T10-24-02-112Z-forest.json`): Derekavak'ın kuralları, ağaç / çalı türleri
   starter Broadleaf / Conifer ailesiyle (dev kancası), 1080p `high`, 60 Hz adımlı, gerçek WebGPU (NVIDIA Ampere);
   GPU belleği WebGPU API sınırında sayıldı (three sıkıştırılmış dokuyu 1 bayt sayar). `measure:foliage` güncel
   kodla yeniden (`2026-11-19T10-25-27-516Z-foliage.json`). Ort. / p95 ms:

   | Senaryo | Gönderim | Ana iş parçacığı | GPU |
   |---|---|---|---|
   | Derekavak P2, kendi foliage'ı (1.640 örnek, S4'ün üretim karşılığı) | 0,99 / 2,8 | 1,49 / 3,4 | 2,41 |
   | Aynısı, foliage yok | 0,64 / 2,0 | 1,13 / 2,6 | 2,20 |
   | Üretilmiş orman, yaz | 1,16 / 3,3 | 1,67 / 3,9 | 2,69 |
   | Üretilmiş orman, kış / kış + kar | 1,17 / 3,4 · 1,12 / 3,3 | 1,66 / 3,9 · 1,60 / 3,9 | 2,67 · 2,62 |
   | Üretilmiş orman, 15 m/s yürüyüş | 1,82 / 4,0 | 3,09 / 5,2 (en çok 9,3) | 3,73 |
   | Island P1, kendi foliage'ı | 0,79 / 1,1 | 1,18 / 1,7 | 2,38 |

   S4: WebGL'de P2'nin 327 draw call'unun 260'ı foliage, gönderim 3,9 ms; üretimde aynı 1.640 örnek 6 GPU güdümlü
   batch'te, gönderim 0,99 ms. Dört zamanlı mevsim geçişi (2 s, kare kare): **pipeline +0, shader modülü +0**, en
   uzun kare 9,0 ms, GPU en çok 9,6 ms, GPU belleği 454,3 MiB (tepe = canlı; kendi foliage'ıyla 414,1), JS yığını
   tepe ≈ 56 MiB. Kışta beş hücre döngüsü (6 km öteye, geri): halka 1.380 hücre / 1.640 örnek, three 129 geometri /
   60 doku, GPU 438,9 MiB, canlı buffer 701–714, mevsim hemen kış. **Bulunan hata (`6a8a612`):** ilk koşularda döngü
   başına +1 GPU buffer'ı (1 KiB, foliage'sız da): `instanceBatches`'in detay / gölge fade attribute'u dispose
   edilmiyordu (WebGL2 ikizinde de); düzeltildi, döngüler sabit. Ertelenen 8 A (`foliageRing`) yeşil, A 990 / 1.021
   (5c'ye ertelenmiş A yok). PV-WES-01–08 kanıtları bitki planı §10. Adaylar `render-refs/candidates/pg3-wes03-*`,
   `pk7-*`, `derekavak-p2-far-*-family*`, `pg2-plants-*` (görsel kabul kullanıcıda). `gpuCulling.smoke.ts`'in bundle
   karşılaştırması (WebGPU) kararsızdı: çekimler `?debug` okuma metnini de içeriyordu, "gürültü" çoğunlukla metindi ve test şansla geçiyordu. Çekimlerde sayfa katmanları gizlenince gürültü 0,000, bundle farkı 0,020 (saydam parçaların bundle dışında kalmasının belgelenmiş sıra maliyeti; eşik 0,05), 5 / 5 kararlı.

**Foliage sırası (kullanıcı kararları, 2026-11-18; v1.73).** R9b bittikten sonra
(R10 başlamadı) sıra: F0 → adım 6 (F1–F3) → adım 7 (F4) → Foliage paneli (F5–F6, 5d'den
öne alındı) → R10 (F7, G6 gerçek foliage'la bir kez ölçülür) → adım 8–10 (PG1 kalanı,
PG2, PG3) → adım 11. Panelin ilk sürümü tür listesi / düzenleme ve kural düzenlemedir;
boya / silme fırçası (`engine/scene/foliagePaint.ts`) 5d'de kalır. Forge karşılıkları:
`src/scene/proceduralFoliageRing.ts`, `foliageCellGenerator.ts`, `foliageCellStreaming.ts`,
`foliageImpostorCache.ts`, `src/editor/panels/foliage/foliagePanel.ts`.

| # | İş | Kapsam | Kapı |
|---|---|---|---|
| F0 | Referans projesine foliage | Derekavak, Island, WbPilotValley `npm run import:forge --force` (kullanıcı onayı bu karar); `--compare` kural / tür / örnek sayıları; foliage henüz çizilmediği için görüntü değişmez | `--compare` eşit, `verify:assets`, render smoke referansla geçer |
| F1 | Halka, aynı iş parçacığı | `features/foliage/render.ts`: `forge.landscapeFoliage` bağlaması (oyunda ve editörde), tür asset'lerini yükler ve değişince tazeler; yüzey terrain görünümünün yerleşik tile'larından (`worldTerrainFoliageSurface`, datum çevirisi adım 3 notu); `planFoliageRing` + kare başına kurma bütçesi, hücreler R4 batch'lerine sahip anahtarıyla (`ring:<kural>:<x>_<z>`). Halka ana bilgisayarının saf kısmı (planı, bütçeyi, sırayı ve kaldırılacakları birleştiren adım) X | Saf testler; render smoke'ta Derekavak P2 foliage'ı halkadan (dev kancası yerine), iki arka uçta |
| F2 | Worker | Hücre üretimi worker'da (`FoliageTerrainStore` aynası, sıralı tek worker, hata olursa aynı iş parçacığına düşer: Forge `foliageCellGenerator`); mesajlaşma X, havuz `render/resources` | Worker ve yedek yol aynı baytlar; ana iş parçacığı süresi ölçülür |
| F3 | Uzak billboard ve ton | `far` alanından çalışma anı billboard'u (karar 6), bloklar global haritadan, hand-off'ta tile'dan yeniden kurulur; uzak ton terrain'e (`foliageFarTintMap`); atlas model başına bir kez (Forge `foliageImpostorCache`) | Hand-off'ta model ve billboard aynı yerde (test), çekim adayları |
| F4 | Boyanmış hücreler (adım 7) | `foliage.json` + `FFOL` hücreleri WP akışıyla yüklenir / boşalır (önyükleme 1,5×, boşaltma 1,25× histerezis), okunamayan hücre boş + uyarı; residency; `?debug` satırları (halka hücre / kuyruk / örnek, boyanmış hücre durumu). Residency planının saf kısmı X | Saf testler; yükle / boşalt döngüsünde sızıntı yok; `?debug` smoke |
| F5 | Foliage sekmesi: türler | Editörde Details'in yanında **Foliage** sekmesi; tür listesi (proje yazılır, motor / paket salt okunur), yeni tür (model seçerek), seçili tür şemadan form (editör parametre UI kuralları), kayıt asset kayıt servisinden; açık level'da halka canlı tazelenir | Editör smoke: sekme, tür ekle / düzenle → kaydet → yeniden aç |
| F6 | Foliage sekmesi: kurallar | Seçili terrain'in `forge.landscapeFoliage` kuralları: ekle / sil / sırala / düzenle (tür, yoğunluk, bantlar; yükseklik kaydırıcıları terrain'in kendi aralığında), tek Undo; liste işlemleri saf X | Editör smoke: kural düzenle → undo / redo → kaydet → yeniden aç; halka değişikliği çiziyor |
| F7 | R10 (G6) | Derekavak P2 60 Hz, gerçek foliage (halka + varsa boyanmış), R5 raporuyla; ağır içerikte de (Island, ×20 stres) | G6 sınırları; kayıt `render-refs/runs/` |

**Foliage ilerleme kaydı (2026-11-18; v1.75):**
- [x] **F0** (referans projesi, depo dışı): Derekavak (Ridgebound kopyası), Island, WbPilotValley
  `--force` ile yeniden alındı (önce level klasörleri yedeklendi); her biri 7 kural, Derekavak 6 tür, boyanmış
  örnek yok; `--compare` her satırda eşit, fark yalnız foliage + yeni şema alanları (`landmark: false`) ve
  `cells.json`. `check:projects` geçti; `ForgeReference/README.md`'ye kayıt.
- [x] **F1** (`b53e4db`; halka çekirdeği Codex `gpt-6.2-sol`, Claude inceledi): `engine/foliage/foliageRingHost.ts`
  (Forge `ProceduralFoliageRing`'in model halkası, sahip anahtarlı sink) + `foliageCellGenerator.ts` (aynı iş
  parçacığı), 11 test; `features/foliage/render.ts`; `render/sync/terrainSurfaces.ts`; `WorldResources.json`
  (`json:<guid>`, editör `assetChanged`'de boşaltır); bağlama bağlamına `gpuDriven`. Hazırlık: türler + batch
  modelleri + terrain akışı oturdu + bekleyen hücre yok; ilk dolumda bütün hazır hücreler, sonra karede 2.
  `foliageRing.smoke.ts`: Derekavak P2'de halka 1.380 hücre (boşlar dahil), **1.640 örnek = Node referansı**,
  177 görünür, her batch GPU = CPU, görüntü farkı WebGPU 3,08 / WebGL2 0,88. `gpuCulling.smoke.ts` dev
  kurulumundan önce level foliage'ını sahneden çıkarır. Tam render smoke 29 / 33; Island P1 ve WbPilotValley P3
  referansla uyuşmuyor (foliage artık çiziliyor; adaylar `render-refs/candidates/`, görsel kabul kullanıcıda),
  `physics-interaction` ve `triangles (webgpu)` yükte oynadı, tek başına geçti.
- [x] **F2** (`51d4788`, C; Forge'un worker üreticisi küçük olduğu için Codex'e verilmedi):
  `engine/world/workers/foliageWorker.ts` + `render/resources/foliageWorkerGenerator.ts` (dünya başına tek sıralı
  worker, aynı iş parçacığı üreticisi aynalı yedek, ilk hatada tek uyarı). Halka smoke'u yedeğe düşmeyi hata sayar;
  Derekavak P2 iki arka uçta yine 1.640 örnek. Ana iş parçacığı ölçümü F7'de (G6: ana iş parçacığı ≤ 6 ms).
- [x] **F3** (`0ffdcf5`, C; 2026-11-18'de PG3'e ertelenmişti): `engine/foliage/foliageFarHost.ts` (Forge'un
  `planFar` / `computeTint` / `sendTints`'i sink'le: 512 m bloklar, en dış bandın yoğunluğu, global harita dünya
  yüksekliğine çevrilir, hand-off'ta tile'dan yeniden kurulur), `render/foliage/farBillboards.ts` (tür başına GPU
  güdümlü batch, tek LOD PG3 impostor'u; modellerin fade dither'ının tümleyeni, pencerenin önünde dörtgen çöker, son
  %15'te söner, gölge yok), `render/plant/modelImpostor.ts` + `engine/world/workers/impostorBakeWorker.ts` (GLB
  parçaları bake yüzeyine, `forge.material` dokusu `surfaceBakeSource` ile; tek katmanlı atlas, ortalama renk,
  taç yarıçapı), terrain'de ton (`setFarTint`, global normal dokusunun alfası). Kullanıcı kararı (2026-11-19): biçim
  PG3 (karar 6). Kapı: hand-off testi (tile'dan kurulan bloğun her billboard'u halkanın modeliyle aynı yerde, 3 test);
  `foliageFar.smoke.ts` Derekavak P2, iğne yapraklılara dev kancasıyla `far` (`__forgeDev.foliageType`):
  billboard bloklarının %99,1 (WebGPU) / %99,4 (WebGL2)'ü modellerin üstünde, GPU sayıları CPU referansında, ton uzak
  zemini değiştirir; GLB bake'i hazır ~5 sn. Adaylar `render-refs/candidates/derekavak-p2-far-{billboards,models,tint,placement}.png`
  (görsel kabul kullanıcıda). Halka ve PG3 impostor smoke'ları iki arka uçta yine geçti. Akan tile'ların ötesinde
  billboard'lar global haritadan büyür, halka orada model üretmez (smoke'un ölçütü bu yüzden 700 m'de). Üretilmiş
  aile türünün uzak bloğu aynı impostor yolundan; smoke'ta yalnız GLB türü sınandı.
- [x] **F4** (`1b63507`; akış çekirdeği Codex `gpt-6.2-sol` medium, 6 test): `engine/foliage/paintedFoliageStreaming.ts`
  (Forge `FoliageCellStreaming`: önyükleme 1,5×, karede iki etkinleştirme, histerezis, okunamayan hücre boş + uyarı,
  `prepare`), servis `engine/foliage/levelFoliageSource.ts` (`LevelFoliageSourceKey`; çalışma anı
  `runtime/projectLevel.ts` + `boot.ts`, editör `foliage.json` / `foliage/` diskte değişince sürüm artırır),
  `render/foliage/paintedFoliageView.ts` (hücre başına sahip `painted:<x>_<z>`, Matrix4.compose matrisleri, ilk karede
  `prepare`, hazırlık okuma bitene kadar), `?debug` foliage satırları (halka hücre / örnek / bekleyen, boyanmış hücre
  durumu, batch). Menzil level'ın `loadRange`'i (tek ızgara, A11). `foliage.json`'u olmayan level'da isteğe bağlı
  404 smoke izin listelerine `hlod.json` gibi eklendi. Referans level'larda boyanmış örnek yok: bağ birim testiyle
  (gerçek FFOL hücreleri, eksik hücre uyarısı) kanıtlandı. Odaklı Vitest 106, typecheck, katman, Node yükleme,
  halka smoke'u 2 / 2, editör smoke'u 83 / 83, `smoke:dist` 1 / 1.
- [x] **F5** (`22c50c2`, C): kabukta `attachDetailsTab` (Details başlığı sekmelere döner), `src/editor/foliage/foliagePanel.ts`:
  projenin `forge.foliageType` asset'leri (motor / paket salt okunur), New Type model seçip Content Browser'ın `create`'iyle
  oluşturur, seçili tür şemadan form (kaydırıcı + kutu, TR ipucu) bir asset oturumunda (Undo / Redo / Save / Reload,
  sekmede Ctrl+S); Save asset editörünün `saved` yolunu izler (önbellek `json:<guid>` boşalır, türü kullanan terrain
  yeniden yüklenir). Editör smoke'u `tests/editor/foliage.spec.ts`: yeni tür, düzenle, geri al / yinele, kaydet, yeniden aç.
- [x] **F6** (`50fc01a`; liste işlemleri Codex `gpt-6.2-sol` medium, `engine/foliage/landscapeRuleEdit.ts`, 8 test):
  `src/editor/foliage/foliageRules.ts`: terrain (seçili terrain ya da ilk; birden çoksa liste), Add Landscape Foliage,
  Add Rule (Types listesinde seçili tür, mevcut bir kuralın katmanı), Duplicate, Up / Down, Remove ve seçili kuralın şema
  formu; her biri level düzenlemesi, tek Undo, sürükleme tek adım. Sınıftan gelen terrain Details'te kalır. **Bulunan
  hata (`44f4602`):** bağlamalarda `actorsChanged` yoktu; kural düzenlemesi terrain aktörünü çıkarıp ekliyor, terrain
  görünümü ve akışı baştan kuruluyordu. Terrain ve foliage bağlamaları artık yalnız kendi bileşenleri değişince yeniden
  kurar. Kontrol (Derekavak, editör, gerçek WebGPU, kaydetmeden): bütün kurallarda yoğunluk 0 halkayı boşaltır, geri
  alma geri getirir. Editör smoke'u 85 / 85. Açık: sürükleme sırasında halka her girdide yeniden kurulur (kısa boşluk),
  görsel kabul kullanıcıda.
- [x] **F7 = R10** (`184f00f`, `48536fe`, C): `npm run measure:foliage` (`tests/smoke/foliage.measure.ts`; başlıklı gerçek
  WebGPU, 1080p `high`, 60 Hz adımlı, 60 ısınma + 300 kare; `FORGE_PROFILE=<senaryo>` CPU profili). Taban için foliage
  sahneden çıkar ve bağlaması durur (dev `levelActive`). İlk koşu (paralel oturum yükü altında) P2'de 4,27 / 7,23 ms
  gösterdi; temiz koşuda 1,58 / 3,22 ms ve profilde `plan` + `planFoliageRing` örneklerin %22'si (Forge her karede
  planlıyordu). **Karar (Claude, sonuç değişmez):** bağlama halkayı kamera 1 m oynayınca, bekleyen hücre varken, kalite
  değişince ve en geç 30 karede bir planlar. Son kayıt `render-refs/runs/2026-11-18T13-53-24-872Z-foliage.json`
  (ort / p95 ms):

  | Senaryo | Gönderim | Ana iş parçacığı | GPU |
  |---|---|---|---|
  | Derekavak P2, foliage yok | 0,59 / 2,1 | 1,09 / 2,9 | 2,12 |
  | Derekavak P2, foliage (1.640 örnek, 6 batch) | **1,01 / 2,8** | **1,56 / 3,5** | 2,50 |
  | + ×20 stres (120 ek batch) | 20,2 / 23,6 | 20,9 / 24,3 | 11,4 |
  | P2'den 15 m/s yürüyüş | 1,48 / 3,2 (en çok 7,8) | 2,94 / 4,9 (en çok 9,7) | 3,55 |
  | Island P1, foliage (1.408 örnek) | 0,89 / 1,4 | 1,29 / 2,0 | 2,31 |

  G6 (P2'de gönderim ≤ 3 ms, ana iş parçacığı ≤ 6 ms) ortalamada ve p95'te sağlandı. ×20 stres foliage'ın değil,
  batch başına dispatch'in maliyeti (R3 / R9 notu: dispatch birleştirme ayrı karar). Draw sütunu bu düzenekte güvenilir
  değil: duraklatılmış döngüde three'nin sayacı aynı kare için bazı koşularda 1 okunuyor (süreleri etkilemiyor; `?debug`
  okuması ayrı). Kapının S4 karşılığı: Derekavak'ın gerçek foliage'ı 1.640 örnek, S4 sayımıyla aynı.

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
| R9a | GPU occlusion culling (**iptal**, kullanıcı 2026-11-18; adım 1 kamera görünümleri kalır, occlusion kodu R9b Z0'da kaldırılır) | İlk adım (tamamlandı 2026-11-17): ikincil kameralar (yansıma) kendi GPU culling görünümü ve sayacı. Sonra R10 öncesinde meshlet'ten bağımsız nesne / instance düzeyinde konservatif Hi-Z adayı: önce tasarım + açık alan / örtülü alan A/B ölçümü, sonra yararlıysa üretim. Ters derinlik, MRT, MSAA, kamera hareketi ve gölge doğruluğu | Yanlış gizleme yok; culling kapalı referansla doğruluk; CPU / GPU render + compute / bellek / görünür nesne / üçgen karşılaştırması; WebGL2 mevcut culling ile çalışır |
| R9b | Bölge sistemi (yerelde tamamlandı, kullanıcı 2026-11-18) | Otomatik bölge + portal üretimi, editörde elle düzenleme, çalışma anında portal üzerinden görünür bölgeler. Z0–Z10 aşağıda | Yeni Z6 görsel kabulü, şehir ve ağır iç mekân ölçümleri, iki arka uçta odaklı smoke |
| R9c | Katmanlı çizim bütçesi (kapalı, [ayrı plan](../planned/LAYERED_DRAW_BUDGET_PLAN.md)) | 1 sentetik şehir ve ölçüm, 2 kaskat texel boyuna göre gölge culling, 3 bölge ataması, dış düğüm, çok katlı üretim ve HLOD filtresi, 4 bina akışı, 5 küçük statiklerde örnek başına cull, 6 kalan adayların ölçümü ve atlas A/B deneyi | Şehir sahnesi `measure:city` önce–sonra; referans level'larda gerileme denetimi; smoke iki arka uçta; uygulanan adımlarda kullanıcı görsel kabulü; Adım 6 ölçümle kapandı |
| R10 | 5.6 G6 ölçümü | Derekavak P2 60 Hz, R5 raporuyla. **v1.73:** adım 6–7 ve Foliage panelinden sonra, gerçek foliage'la (F7, foliage sırası adım 11'in altında) | G6 sınırları |

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
  gizler. P2'de GPU süresi zaten 1,8 ms. (Bu sonuca dayanan "üretime alınmaz" önerisi kullanıcı
  itirazıyla geri çekildi: motor yalnız açık dünya için değil; iç mekân ölçüldü, aşağıda.)
- **İç mekân çalışması (2026-11-17, `a017c66`; kullanıcı: FPS tarzı oyunda duvar arkası):**
  `tools/scenes/indoorScene.ts` (Codex `gpt-6.1-sol` medium, Claude inceledi; 8 × 8 oda, 8 m, kapı
  boşlukları, 768 eşya, şekiller) L03'e çalışma anında yerleştirilir; çalışma instanced statikleri
  de sayar: nesne draw'ı (her parça ayrı), bugünkü batch (model başına; ancak görüşteki bütün
  örnekleri örtülüyse gizlenir) ve 16 m hücreye bölünmüş batch. Kayıt
  `2026-11-17T20-27-50-153Z-occlusion-indoor.json`:

  | Poz | Görüşteki nesne | Örtülü nesne | Örtülü üçgen | Bugünkü batch | 16 m hücre batch'i |
  |---|---|---|---|---|---|
  | Oda | 487 | %63 | %89 | 4 / 0 | 47 / 22 (%47) |
  | Koridor | 758 | %68 | %88 | 4 / 0 | 64 / 29 (%45) |
  | Çapraz | 797 | %69 | %94 | 4 / 0 | 63 / 40 (%64) |
  | Üstten | 291 | %0 | %0 | 4 / 0 | 26 / 0 |

  Sonuç: iç mekânda occlusion büyük kazanç; ama draw call kazancı mekânsal gruplama ister (model
  başına level çapında batch hiçbir draw'ı gizlemez). GPU Hi-Z yalnız GPU işini (üçgen / piksel)
  azaltır; dolaylı draw örnek sayısı 0 olsa da gönderilir. **Üretim tasarımı kullanıcı kararı
  bekliyor** (seçenekler sohbette: hücre başına batch + önceki kare occlusion query'leri, GPU Hi-Z,
  portal / oda).
- **Hücre batch'i ölçümü (adım a, `fab7066`, varsayılan kapalı):** iç mekânda statik draw 4 → 63
  (16 m) / 35 (32 m), gönderim 0,36 → 1,33 / 0,44 ms. Statikler instanced olduğundan bütün iç mekân
  zaten 4 draw; query yolu grup başına bir kutu draw'ı ekler, gizlenen draw'lar artışı karşılamaz.
  İç mekânda kazanç draw'da değil GPU işinde (örtülü üçgen %88–94).
- **Üretim kararı (kullanıcı, 2026-11-18): örnek başına GPU occlusion**, draw sayısı değişmez:

  | # | İş | Kapı |
  |---|---|---|
  | O1 | Level ayarı `occlusionCulling` (varsayılan kapalı; iç mekân / kent için). Açıkken level'ın statikleri GPU yolunda (az batch: dispatch maliyeti küçük); açık arazi bugünkü gibi | Şema / kanonik biçim / SDK kapısı; odaklı test |
  | O2 | Engelleyiciler otomatik: opak, dünya sınır küresi yarıçapı ≥ 2 m statik örnekler (duvar, bina kabuğu; eşya değil). Batch başına yalnız onları taşıyan derinlik ikizi `InstancedMesh`, kendi katmanında; her kare ana kamerayla yalnız derinliğe çizilir (çizim tamponu boyutunda) | Odaklı test; ön geçiş draw / süre ölçümü |
  | O3 | GPU Hi-Z (compute, paketli storage buffer, en uzak küçültme); CPU ikizi `engine/world/hiZ.ts` + paket düzeni (Codex `gpt-6.2-sol`) | GPU piramidi CPU'nunkiyle eşit |
  | O4 | GPU yolunun ana görünüm cull'ü örnek küresini Hi-Z'ye karşı da test eder (yalnız `main` rol; gölge / yansıma etkilenmez); WebGL2 ikizi occlusion'sız | GPU görünür sayısı CPU referansı aralığında (yanlış gizleme yok); render / editör smoke iki arka uçta |
  | O5 | İç mekân ve açık dünya A/B: gönderim, GPU, görünür örnek, üçgen, ön geçiş maliyeti | Kayıt `render-refs/runs/`; net kazanç yoksa ayar kapalı kalır |

  **İlerleme (2026-11-18):**
  - [x] **O1** (`5f1ab63`): `occlusionCulling` level ayarı (varsayılan kapalı); açıkken level'ın
    statikleri GPU yolunda. İçe aktarıcı / dünya kurucu alanı yazar; SDK yüzeyi değişmedi.
  - [x] **O2–O4** (`6510965`): `render/sync/occluders.ts` (yarıçap ≥ 2 m opak örneklerin derinlik
    ikizleri, ışıksız ayrı engelleyici sahnesinde: ön geçiş gölge / yansıma güncellemez),
    `render/gpu/occlusionPass.ts` (çizim tamponu boyutunda derinlik + compute ile paketli Hi-Z;
    düzen `engine/world/hiZ.ts` `hiZLayout` / `packHiZ` / `sphereOccludedPacked`, Codex
    `gpt-6.2-sol` high), `render/gpu/hiZTest.ts` (paketli testin TSL'i), GPU batch'in yalnız `main`
    rol cull'ü kullanır; WebGL2 ikizi yok sayar. Dev `__forgeDev.levelSettings(patch)`,
    `gpuDriven.occlusionCheck()`.
  - [x] **Doğrulama** (`measure:occlusion` "gpu occlusion", gerçek WebGPU, 1080p): GPU piramidi
    CPU'nun aynı 0. seviyeden kurduğuyla bit bit eşit (12 seviye, 0 fark); her batch'in görünür
    sayısı CPU referansının aralığında (yanlış gizleme yok); odada / koridorda / çaprazda
    örneklerin %50 / %68 / %65'i (oda başına 120 eşyada %75 / %87 / %90) gizli, üstten %0.
    Odaklı Vitest 570, render smoke alt kümesi 6 / 6 (varsayılan kapalı yol değişmedi).
  - [x] **O5 A/B (çapraz poz):** 12 eşya: GPU 0,70 (instanced) / 0,86 (GPU yolu) / 0,96 ms
    (occlusion); gönderim 0,36 / 0,66 / 0,85 ms. 120 eşya: GPU 1,27 / 1,28 / 1,25 ms. Örtülü
    örnekler gölge kaskatlarına yine çizilir (ana görünüm sonucu gölgeye uygulanmaz), örtülü
    pikseller zaten derinlikle elenir, kazanç köşe işinde; şekiller ucuz.
  - [x] **O5 ağır mesh** (`994c3b1`, dev `__forgeDev.heavyProps`: motorun statik batch'iyle yüksek
    çözünürlüklü küreler; kayıt `2026-11-17T21-36-37-404Z-heavy-occlusion.json`): iç mekânın 768
    eşyası 36.480 üçgenlik küre (duvarlar şekil, engelleyici). GPU süresi (oda / koridor / çapraz /
    üstten): instanced 18,9 / 20,5 / 20,5 / 19,5 ms; GPU yolu + otomatik LOD 1,75 / 1,80 / 1,93 /
    2,08 ms; + occlusion 1,74 / 1,85 / 1,73 / 1,77 ms. Gönderim 0,9 / 0,6 / 0,7–0,8 ms. Kazancın
    neredeyse tamamı otomatik LOD'dan; duvar arkasındakiler uzak ve zaten kaba LOD'da, occlusion
    farkı gürültü içinde. **Sonuç:** R9.0'ın "statikler instanced" kararı yalnız hafif içerikle
    ölçülmüştü; ağır içerikte GPU yolu 10 kat hızlı. Varsayılan yol (ör. `auto`, üçgen eşiği
    yükseltilmiş) ve iç mekân için bölge / PVS sistemi kullanıcı kararında.
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

**R9b bölge sistemi (kullanıcı kararı, 2026-11-18; v1.69):** R9a'nın ölçümleri iç mekânda asıl
yükün gizlenen içeriğin draw'ı, gölgesi ve köşe işi olduğunu gösterdi; GPU occlusion gölgeyi ve
draw'ı düşüremedi (ana görünüm sonucu gölgeye uygulanamaz), PVS düzenlemede canlı akışla çelişir.
Kullanıcı: occlusion iptal, PVS yok; yalnız **bölge sistemi**, otomatik kurulur, sonra Blocking Volume
gibi sahneye sürüklenen ve gizmoyla boyutlanan hacimlerle elle düzeltilir.

Tasarım:
- **Bölge (`forge.zone`):** kutu hacim (boyut, ad). Bir statik yerleşim sınır küresinin merkezinin
  düştüğü en küçük bölgeye aittir; hiçbir bölgeye düşmeyen içerik bölgesizdir ve **hep görünür**
  (açık dünya, dış cephe, gökyüzü etkilenmez). Kamera bir bölgede değilse bütün bölgeler görünür.
- **Portal (`forge.portal`):** dikdörtgen açıklık (kapı, pencere, koridor ağzı); kenarına değdiği /
  kestiği iki bölgeyi bağlar (otomatik, elle de seçilebilir). İleride kapı açık / kapalı durumu
  portalı açıp kapatır (oyun kodu); şimdilik hep açık.
- **Çalışma anı (CPU, iki arka uç):** kamera bölgesinden başlayıp portal grafını gezer; bir portal
  ancak o ana kadar daralmış görüş alanının içindeyse geçilir, görüş alanı portalın dikdörtgenine
  daraltılır (klasik portal görünürlüğü; derinlik sınırı ve kare başına bütçe). Sonuç kare başına
  görünür bölge kümesidir; önceden hesap yok, düzenleme anında geçerli.
- **Çizim:** statik batch'ler bölgeye göre ayrılır (batch anahtarına bölge eki; R9a adım a'nın
  `batchCells.ts`'i bölge bölmesine genelleşir). Görünmeyen bölgenin batch'leri çizilmez ve **gölge
  düşürmez** (öneri; bölge başına "gölgesi hep düşsün" seçeneği). Instanced ve GPU yolu ikisi de.
  HLOD, foliage halkası ve bölgesiz içerik değişmez. Önce yalnız görünürlük; bellekten boşaltma
  (bölgeye göre akış) sonra ayrı karar.
- **Otomatik üretim:** `npm run forge -- zones --project <yol> --level <klasör> [--json]` ve editörde
  "Generate Zones": level'ın büyük opak statiklerinden (duvar, döşeme, tavan; dünya yarıçapı eşiği)
  bir voksel ızgarası kurulur, göz yüksekliğinde boş hücreler taşkın doldurmayla odalara ayrılır,
  dar boğazlar portal olur; her oda bir kutu bölgeye, her boğaz bir portala yazılır. Kayıt servisi
  üzerinden, tek Undo; elle düzeltilmiş bölgeler korunur (`generated` işareti olanlar yeniden
  üretilir). Dünya kurucu ve sentetik üreteçler bölgeleri doğrudan yazabilir.
- **Editör:** Place panelinde "Zone Volume" ve "Portal"; sahneye sürükle-bırak, gizmo ile taşı /
  döndür / ölçekle (kutu kenarı ölçekten), Details'ta ad / portal bağlantıları; yalnız editörde
  çizilen yarı saydam kutu + kenar (`editorRender.ts`, ışık yardımcıları gibi), seçili bölgenin
  portalları vurgulu. `?debug`: aktif bölge, görünür bölge sayısı, gizlenen batch / draw.

| # | İş | Kapı |
|---|---|---|
| Z0 | Occlusion kodunun kaldırılması: `occlusionCulling` level ayarı, engelleyici ikizleri, GPU Hi-Z geçişi, batch'in occlusion testi, dev kancaları (`levelSettings` hariç), CPU Hi-Z + çalışma ölçümleri. Kalır: kamera görünümleri (R9a adım 1), `tools/scenes/indoorScene.ts`, `heavyPropsDev`, `batchCells` (Z3'te bölgeye genelleşir) | Tip / katman / odaklı test; render smoke GPU alt kümesi |
| Z1 | Şemalar `forge.zone@1` (boyut, ad, `generated`, gölge seçeneği) ve `forge.portal@1` (boyut, `generated`, isteğe bağlı bağlı bölgeler); SDK yüzeyi değişirse snapshot + changelog | Node yükleme, kanonik biçim, odaklı test |
| Z2 | Saf çekirdek `engine/world/zones.ts`: yerleşim → bölge ataması, portal → bölge bağlantıları, kamera bölgesi, portal görüş alanı daralmasıyla görünür bölge kümesi (X, Codex) | Odaklı test (iç içe / komşu / kapalı portal / bölge dışı kamera) |
| Z3 | Çizim: batch'lerin bölgeye göre bölünmesi, kare başına görünürlük (ana görünüm + gölge), bölge değiştiren düzenleme; instanced + GPU yolu | Odaklı test; render smoke iki arka uçta |
| Z4 | Otomatik üretim: voksel + taşkın doldurma + boğaz tespiti (saf çekirdek X, Codex), `forge zones` komutu, kayıt servisiyle yazım, `generated` kuralı | Sentetik iç mekânda 64 oda / 112 kapı birebir; tekrar koşu aynı baytlar |
| Z5 | Editör: Place girdileri, sürükle-bırak, gizmo ölçeği, Details, yardımcı çizim, "Generate Zones" düğmesi, `?debug` satırları | Editör smoke iki arka uçta |
| Z6 | Ölçüm: ağır eşyalı sentetik iç mekânda bölgesiz / bölgeli draw, gölge, GPU, gönderim; açık dünyada fark yok | Kayıt `render-refs/runs/`; kullanıcı görsel kabulü |
| Z7 | Belgeler: mimari rapor, harita, CLAUDE.md komut satırı | — |

**Kararlar (kullanıcı, 2026-11-18; v1.70, önerilerle):**
1. Görünmeyen bölgenin içeriği gölge düşürmez; bölge başına "gölgesi hep düşsün" seçeneği (pencere
   / avlu gibi durumlar için).
2. İlk aşama yalnız görünürlük; bölgeye göre bellekten boşaltma sonra ayrı karar.
3. **S1, statiklerin varsayılan yolu `auto`:** R9a O5 ağır mesh ölçümünde GPU yolu + otomatik LOD
   instanced'a göre ~10 kat hızlı (19–20,5 → 1,75–2,1 ms); R9.0'da hafif içerikte GPU yolu
   kaybettirmişti. `staticPath.ts`'in `auto` kuralı parça üçgen eşiği yükseltilerek (öneri
   ~5.000, ölçümle) host varsayılanı olur: hafif batch'ler (Derekavak'ın 824 üçgenlik evi,
   şekiller) instanced kalır, ağır modeller GPU yoluna gider. Kapı: `measure:static-path` (hafif
   referans level'lar gerilemez) + `measure:occlusion` "heavy props" (ağır eşyada kazanç korunur);
   render / editör smoke iki arka uçta. Sıra: S1, sonra Z0–Z7.

**R9b ilerleme kaydı (2026-11-18; v1.71):**
- [x] **S1** (`ed3ad1b`): `auto` kuralı yalnız parça üçgen eşiğine bakar (`GPU_STATIC_MIN_TRIANGLES`
  5.000; yerleşim sayısı kuralı kalktı, çok yerleşimli hafif şekilleri GPU yoluna gönderiyordu), host
  varsayılanı `auto`. Eşik taraması (768 eşya, tek batch): 2,2 bin üçgen gönderimde kaybettirir, ~4 bin başa
  baş, 9 bin GPU'da net kazanç (3,0–4,0 → 1,2–1,3 ms). Ağır eşya (36,5 bin): instanced GPU 18,8–20,2 ms,
  `auto` 2,3–3,0. Referans level'larda en ağır parça 824 üçgen: `auto` hiç GPU batch'i açmaz, `instanced`
  ile gürültü içinde aynı (ilk koşudaki Derekavak farkı `gpu` koşusundan sonraki sıra etkisiydi). Render 29 /
  29, editör 81 / 81 iki arka uçta.
- [x] **Z0** (`30483f8`): occlusion kodu kaldırıldı (level ayarı, engelleyici ikizleri, GPU Hi-Z, batch
  testi, CPU Hi-Z, çalışma ölçümleri ve dev kancaları). Ağır eşya testi `npm run measure:heavy-props`.
- [x] **Z1** (`0cb8139`): `forge.zone@1` (`size`, `zoneName`, `alwaysCastShadows`, `generated`) ve
  `forge.portal@1` (`size` genişlik × yükseklik, `zoneA` / `zoneB`, `generated`), uzamsal; kutu ve açıklık
  ölçekle büyür. SDK yüzeyi değişmedi.
- [x] **Z2** (`d6bb043`, çekirdek Codex): `engine/world/zones.ts`: hacme göre sıralı yönlü kutular (bir
  noktayı tutan en küçüğü), portal normali boyunca sondayla ya da elle bağlantı, portal grafı üzerinde
  daralan ekran dikdörtgeniyle görünür bölgeler (yakın düzlem kırpması, kapı eşiği kuralı, kapalı portal,
  derinlik sınırı, bütçe aşılınca hepsi görünür).
- [x] **Z3** (`319404f`): `render/sync/zoneDrawing.ts`; bölge kümesi bağlamalardan önce tazelenir; statik
  mesh / şekil yerleşimi bölgesine göre batch anahtarı alır, bölge kümesi değişince taşınır. Kare başına
  kip: görünür / yalnız gölge / gizli. Instanced mesh katmanla (yalnız gölge kameraları bölge gölge
  katmanını taşır), GPU yolu ve WebGL2 ikizi ana ve kamera görünümlerini gizler, gizli batch cull'u atlar.
  Render smoke `zones.smoke.ts` iki arka uçta. **Sapma:** atama yerleşimin noktasıyla (sınır küresinin
  merkezi değil: model sınırları sonra yüklenir; bölgesiz içerik hep görünür, hata görünür tarafta kalır).
  Asset önizleme bellek testine ısınma penceresi eklendi (tek başına bu işten önce de kırıktı).
- [x] **Z4** (`24fce8e`, çekirdek Codex): `engine/world/zoneGeneration.ts` (göz hizası dilimi, dış taşkın,
  tam Öklid uzaklık dönüşümü, kapı yarı genişliğinden uzak çekirdekler, havza büyütme, sınır koşularından
  portal, lento yüksekliği), `engine/world/zoneLevel.ts` (üretilen değiştirilir, kullanıcınınki korunur,
  kararlı GUID, hep yüklü), `npm run forge -- zones` (`forge edit` koşucusuyla tek kayıt; `--dry-run`,
  `--floor`, `--json`). Sentetik iç mekânda 64 bölge / 112 portal birebir, ikinci koşu aynı baytlar.
  **Sapma:** engelleyici seçimi en uzun dünya kenarı ≥ 1,5 m (yarıçap değil: lentolar girer, mobilya girmez).
- [x] **Z5** (`07d863b`): Add Actor > Volumes (Zone Volume, Portal), editör çizimi (soluk mavi kutu,
  turuncu açıklık, tık ikonda; seçili bölge ve portalları vurgulu), World Settings > Zones > Generate Zones
  (tek Undo, bütün hücreler yüklü), `?debug` bölge satırları. Editör smoke 83 / 83 iki arka uçta.
- [x] **Z6** ölçüm (`4d1df67`, `measure:heavy-props -g zones`, kayıt `2026-11-18T08-08-22-403Z-zones.json`;
  8 × 8 oda, 768 × 36,5 bin üçgen, `auto`):

  | Poz | Bölgesiz gönderim / GPU / draw | Bölgeli gönderim / GPU / draw | Gizli batch |
  |---|---|---|---|
  | oda | 0,63 / 1,78 ms / 13 | 1,70 / 1,35 ms / 123 | 110 / 121 |
  | koridor | 0,64 / 1,91 / 13 | 1,87 / 1,45 / 97 | 106 |
  | çapraz | 0,58 / 1,89 / 13 | 1,42 / 1,44 / 37 | 116 |
  | yukarı (bölge dışı) | 0,56 / 1,77 / 13 | 13,58 / 4,74 / 769 | 0 |

  Bulgu: gizleme GPU'yu ~%25 düşürür, ama GPU güdümlü ağır eşya tek batch yerine bölge başına batch olur
  (64 × görünüm başına dispatch + draw): gönderim içeride 3 kat, bütün bölgeler görünürken 24 kat.
  **Kullanıcı kararı (2026-11-18):** GPU yolunda örnek başına bölge maskesi; instanced bölmeyle kalır.
- [x] **Z3b** (`acb8e7f`): GPU güdümlü batch bölünmez; örnek bölge yuvasını taşır (`extras.z`, değer;
  `triangleDrawing` bölge kümesi ya da matris değişince yazar), compute cull host'un iki maskesini okur
  (`gpuDriven.setZoneMasks`: ana / kamera görünümleri görünür bölgeler, gölge görünümleri + `alwaysCastShadows`;
  `ZONE_MASK_WORDS` 64, en çok 2.047 bölge, ötesi yuva 0 = hep görünür), WebGL2 ikizi aynı maskeyi CPU'da.
  Statik mesh modeli yüklenince GPU yoluna gidiyorsa bölme dışına çıkar. Yeniden ölçüm
  (`2026-11-18T08-50-56-823Z-zones.json`):

  | Poz | Bölgesiz gönderim / GPU / draw | Bölgeli gönderim / GPU / draw |
  |---|---|---|
  | oda | 0,91 / 2,16 ms / 13 | 0,75 / 1,10 ms / 13 |
  | koridor | 0,85 / 2,40 / 36 | 0,69 / 0,96 / 13 |
  | çapraz | 0,69 / 2,11 / 13 | 0,58 / 0,83 / 13 |
  | yukarı (bölge dışı) | 0,59 / 1,73 / 36 | 0,79 / 1,96 / 208 |

  Bölge dışından kalan fark hafif şekil batch'lerinin (duvar / döşeme) bölünmesinden. Açık dünya: referans
  level'larda bölge yok, yol değişmez (`zones.update` erken döner, maske hepsi açık). Render smoke 30 / 31
  (bir çerçeveli çekim kararsız, tek başına geçer), editör 83 / 83 iki arka uçta. Kullanıcı Z6 görsel
  kabulünü Z8–Z10 sonrası [Adım 3 görselleriyle](../planned/LAYERED_DRAW_BUDGET_PLAN.md#53-adım-3--bölge-düzeltmeleri-a-b-d) verdi.
- [x] **Z7** belgeler: mimari rapor v1.62 §4.4 (bölge sistemi, R9 varsayılanı), harita, CLAUDE.md komut
  satırları.
- [x] **Z8** dünya kutusunun 2 cm toleransla bölgeye tamamen sığması. Model sınırı gelince yerleşim yeniden atanır.
- [x] **Z9** dış düğüm ve mesafe bütçesi. Dış kapı, pencere ve açık tavan portalları katlar için tek koşuda üretilir.
- [x] **Z10** bölgeye sığan yerleşimler HLOD hücre ve landmark proxy’lerinden çıkarılır. Bölge ve portal düzenlemeleri kaynak hash’ini günceller.

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

**5d başlangıç dökümü (2026-11-19).** INV-B01 / B02 (World Terrain oluşturma ve
genişletme diyalogları), B03 (sculpt), B04 (katman boyama), B05 (Auto Paint), B06
(landscape spline), B08 (heightmap içe / dışa aktarma), B09 (Foliage Mode fırçası),
B10 + E26 (Mesh Paint), B13 (World Builder penceresi), G21 (spline mesh
deformasyonu, yol mesh'leri). Ertelenen **4 A** (`worldTerrainMove`). Bitki
tarafı (PG5) [bitki planı §9.1](../planned/PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md#91-vegetation-20-denetimi-ve-ilk-editör-dilimi)'in
A–F sırasıyla yürür; ağaç tarifi editörü (`ff7ce85`) ve sürümlü büyüme
(`31006ca`) commit'li.

| Var (2b / 5a / 5c) | Eksik (5d) |
|---|---|
| Sculpt / erosion / terrace / auto paint algoritmaları (`engine/terrain/{terrainSculpt,landscapeBrush,terrainEdit,terrainErosion,terrainAutoPaint}`, `engine/worldbuilder/terraces`) | Editörde landscape kipi: fırça imleci, sculpt / paint araçları, darbe → slot tazeleme, pick ışınının güncellenmesi (5a adım 4'ten), undo, kayıt. Forge'da bu bağ `SceneApp`'e dağılmıştı; yeniden yazılır |
| World Terrain oluşturma / genişletme / kayıt (`worldTerrain{Create,Expand,Save,Actor}`), heightmap PNG ve içe aktarma | Oluşturma / genişletme diyalogları, terrain taşıma (`worldTerrainMove`, 4 A), heightmap dosya akışı editörde |
| Düzenlenen tile'ı akışta tutma (`terrainEditorStreaming`, B12'nin saf kısmı) | Akışa bağlanması (5a adım 2'de 5d'ye bırakıldı) |
| Spline verisi ve düzenleme (`engine/spline/{spline,splineCurve}`, `engine/terrain/terrainSpline*`) | Spline aktörü / editör aracı, yol mesh üreticisi (Forge `splineGenerator` 792 + `splineDeformMesh` 304 satır), yol süslemeleri |
| Foliage hücreleri, boyanmış örnek biçimi, Foliage sekmesinin tür / kural düzenlemesi (5c, F5–F6) | Boya / silme fırçası (Forge `foliagePaint` 200 satır): paint, erase, single, fill, lasso, remove, yüzey filtreleri |
| World Builder çekirdeği, `groundCover`, önizleme worker'ı (`runtime/worldbuilder/randomWorldPreviewWorker.ts`), `/__world-random` istek izin listesi ve CLI kipi | Pencere (Forge `randomWorldPanel` 721 + `worldBuilderWindow` 263 satır), dev server uç noktası, üretilen level'ın Content Browser'da açılması |
| Terrain katman dizisi (5a adım 3) | Katman görünümü / hata ayıklama görünümleri (5a adım 3'ten) |

**5d kararları (kullanıcı, 2026-11-19, "önerilerin hepsini onaylıyorum"; ayrıntı mimari v1.72 §4.4):**

1. *Ajan yüzeyi:* sculpt, paint, spline ve foliage fırçası yalnız editörde; fırça
   darbesi için CLI komutu yok. Ajan terrain'e veri yüzeyleriyle erişir: World
   Builder brief'i (`world:random` / `world:brief`), auto paint ve landscape
   foliage kuralları (`forge edit set`).
2. *Sculpt CPU'da:* `engine`'in taşınmış algoritmalarıyla; yalnız değişen bölge
   tile slotunun GPU dokusuna yüklenir. GPU compute ile sculpt kapsam dışı.
3. *Undo ve kayıt:* fırça darbesi tek undo adımı; adım değişen tile bölgelerinin
   önceki / sonraki kopyasını tutar. Kayıt `worldTerrainSave` ile kayıt
   servisinden; düzenlenen tile akışta tutulur (B12).
4. *Mesh Paint (B10, E26) 5d'den çıkar:* yalnız insan yüzeyine hizmet eder, Faz 4
   adım 6'da da kapsam dışıydı; gerekirse ileride ayrı karar (K12 ölçütü).
5. *Yol mesh'leri:* spline boyunca CPU'da bükülüp bake edilen statik geometri;
   statik batch ve HLOD yolunu olduğu gibi kullanır. TSL'de köşe bükme yok.
6. *Bitki tarafı:* PG5 ve §9.1'in F aşaması (`generated` model kaynağı, aile
   yerleşimi, aile / mevsim önizlemesi) adım 9'da, bitki akışının C–E
   aşamalarından sonra. Adım 2–8 o akışın dosyalarına dokunmaz.

**5d adım sırası** (C: Claude, X: Codex; X'in diff'ini Claude inceler, kapıları
çalıştırır, commit'i atar):

1. Döküm ve kararlar — C (bu docs güncellemesi).
2. Landscape kipinin iskeleti (kip geçişi, fırça imleci, düzenlenen tile'ı tutma,
   bölge yüklemesi, pick ışını, undo, kayıt) ve sculpt araçları (raise / lower /
   smooth / flatten / noise / ramp / terrace / erosion) — C. B03, B12.
3. Katman boyama / silme / ağırlık yumuşatma, Auto Paint, katman görünümü — C. B04, B05.
4. World Terrain oluşturma / genişletme diyalogları, taşıma, heightmap içe / dışa
   aktarma — C; `worldTerrainMove` ve 4 A — X. B01, B02, B08.
5. Landscape spline aracı ve yol mesh'leri — saf üretici X, editör ve render C. B06, G21.
6. Foliage fırçası — saf kısım X, editör C. B09.
7. ~~Mesh Paint~~ (karar 4: çıkarıldı).
8. World Builder penceresi, `/__world-random` uç noktası, önizleme worker'ının
   bağlanması; üretilen level Content Browser'da — C. B13.
9. Bitki tarafı (karar 6) — bitki planının akışıyla (PG5; 2026-11-25, görsel kabul bekleniyor). Ağaç kalitesi PG5b'de (bitki planı §9.8; kullanıcı, 2026-11-25).
10. Kapı: araç başına editör smoke'u (düzenle → kaydet → yeniden aç), ertelenen
    5d A'ları yeşil (`worldTerrainMove`'un 1 A'sı adım 4'te; su kullanan 3 A Faz 7'de), Faz 5 toplu görsel + performans kabulü (kullanıcı), ardından Faz 5
    bölümünün arşivi.

*Adım 2 (2026-11-19, `3074f3a`):* Landscape sculpt. Terrain seçilince Details'te
Landscape bölümü (`editor/landscape/landscapePanel.ts`): Forge'un 8 aracı, araç
başına alanları ve sınırları (kit formu), tile bilgisi (bellekte / kaydedilmemiş).
Fırça (`landscapeTool.ts`, three'siz): seçili terrain'e basış (önünde başka çizim
yoksa; gizmo tutamacı önce) darbe başlatır, Forge'un değiştiricileri darbe başına
(Alt Flatten, Ctrl Smooth, Shift Raise / Lower, Ctrl+Alt tıklanan yükseklik), Ramp
sürüklenip bırakılır (yol çerçevesi önizlenir). Halka araziye oturur
(`render/editor/brushCursor.ts`). **Veri:** editör World'üne `TerrainEditingKey`
(`engine/terrain/terrainEditing.ts`); terrain bağlaması onu bulunca asset başına
`TerrainEditSession`'dan çizer (Forge'un `WorldTerrainEditSession`'ı, IO'suz:
okunan biçim / revizyon, tile başına düzenleme sayacı, onay). Akış sürer;
editör okuyucusu dosyayı revizyonuyla okur, oturumun tanımıyla doğrular,
düzenlenmiş tile'ı diskten değil oturumdan verir; düzenlenen ve fırçanın beklediği
tile'lar `kept`. Okunamayıp düz yer tutucuyla gelen tile oyulmaz / yazılmaz.
`TerrainView.updateTile` Forge'un kuralı (dikdörtgen CPU yazımı, komşu dikiş
normalleri, global harita + delik doldurma, düğüm sınırları; yükleme katman başına).
**Undo:** editör oturumunda level dışı adım (`pushStep`): level adımlarıyla tek
sıra (adım kendinden önceki level adımını kimliğiyle tutar); yeni adım iki redo
yığınını da düşürür (çekirdeğe `History.clearRedo`). **Kayıt:** oturum katılımcısı
(`landscapeSave.ts`): level'dan sonra kirli tile'lar (kendi biçimiyle), aralık
genişlerse diskteki tile'ların yeniden kodlanması, global harita ve tanım tek kayıt
işleminde okunan revizyonlarla; 409'da hiçbir şey yazılmaz, düzenlemeler kalır;
motor içeriği / paket salt okunur. Başka yazarın değişikliği temiz oturumu düşürür,
terrain diskten yeniden okunur; kendi kaydı bir şey değiştirmez. **Kanıt:** birim
testleri (birleşik undo sırası, katılımcı, kayıt isteği / revizyonlar / çakışma /
yer tutucu / disk olayı); editör smoke'u `tests/editor/landscape.spec.ts` (2 × 2
akan terrain: yükselt → kaydet → diskte tepe 1,25 m; ikinci darbe + undo + kaydet →
ilk darbenin yükseklikleri; yeniden aç) `forceWebGL`'de ve gerçek WebGPU'da geçti;
terrain'e dokunan editör spec'leri (foliage, addActor, streaming, world) 16 / 16.
Sonraya: Ctrl + tekerlekle fırça boyutu, Play'e kaydedilmemiş terrain düzenlemesi
(Play oturumu yalnız level dosyalarını taşır), foliage halkasının düzenlenen
alanda yeniden büyümesi. Kullanıcı görsel kabulü 2026-11-19'da verildi.

*Adım 3 kararları (kullanıcı, 2026-11-19, öneriler gibi):* katman ekleme / silme ve
katmana materyal atama B04'e dahil (fiziksel materyal Faz 8'e); Auto Paint
kuralları terrain aktöründe şemalı `forge.landscapeAutoPaint` bileşeni (level'la
kaydedilir, ajan `forge edit set` ile yazar; Forge'da yalnız oturumdaydı);
uygulama şimdilik yalnız editörde (CLI gerekirse ayrı küçük adım); görünüm kipi
Landscape ayarlarında (`LandscapeSettings.viewMode`, sayfanın), level'a ve
Play'e geçmez.

*Adım 3 (2026-11-19, `30fe244`):* Landscape Paint. Details'teki Landscape
bölümünde Mode (Sculpt / Paint) ve View (Lit / Height / Slope / Layer). Paint:
Forge'un üç aracı (Paint, Erase, Weights) ve fırçası; terrain'in katmanları
(etkin katman seçimi, katman başına materyal alanı, Remove), + Add Layer ve Fill
Layer. Fırça (`landscapeTool.ts`) aynı darbe / akış / undo yolunu kullanır;
vuruş `TerrainPaintAccumulator` ile nicemlenmemiş ağırlık biriktirir.
**İşlemler** (`editor/landscape/landscapeLayers.ts`, editör World'ünde
`LandscapeLayersKey`): Fill Layer, Auto Paint, Add / Remove Layer önce bütün
tile'ları yükler (akan terrain her tile'ı ister ve bekler; okunamayan tile işi
durdurur), her biri tek undo adımı (`pushStep`; yama adımları ortak
`landscapeSteps.ts`). Add / Remove tanımı ve her tile'ın ağırlık bloklarını
değiştirir (`engine/terrain/terrainLayers.ts`), tanım + bütün tile'lar kirli;
materyal yalnız tanımı. **Çizim:** oturumun katmanları önbelleğinkinden farklıysa
bağlama `TerrainData.layersFor(def)` ile çözer; `EditableTerrain.layersChanged`
global haritayı tile'lardan yeniden kurar ve görünümü yeni katmanlarla yeniden
kurar. Görünüm kipi terrain materyalinde yalnız `editorViews` ile derlenir (oyun
materyalinde dal ve uniform yok); renkler Forge'unki. **Auto Paint:** terrain
aktöründe `forge.landscapeAutoPaint@1` (baseLayer, seed, kurallar: katman,
açık, güç, yükseklik / eğim bandı ve geçişi, gürültü); bileşenin Details'inde
katman kimlikleri ve Apply Auto Paint; Landscape bölümünde bileşen yoksa
+ Auto Paint Rules. **Kanıt:** `landscapeLayers.test.ts` (Add / Fill / materyal /
Remove, undo ve kirli kayıt); editör smoke'u `tests/editor/landscapePaint.spec.ts`
(2 × 2 akan terrain: dirt boya → kaydet; Auto Paint → 4 tile, kar her yerde;
Add Layer + Fill + undo / redo → kaydet, tanımda 5 katman; görünüm kipleri
level'a yazılmaz; yeniden aç) `forceWebGL`'de ve gerçek WebGPU'da geçti; editör
seti forceWebGL'de 90 / 90. Sonraya: Auto Paint'in ajan komutu (karar gereği
ayrı adım), katman adı / rengi düzenleme, fiziksel materyal (Faz 8), Play'e
kaydedilmemiş boya (adım 2'deki gibi). Kullanıcı görsel kabulü 2026-11-19'da verildi.

*Adım 4 kararları (kullanıcı, 2026-11-19, öneriler gibi):* yeni World Terrain asset
olarak hemen yazılır (Content Browser'daki yeni asset gibi, undo'suz), aktörün
eklenmesi tek undo; taşıma yalnız terrain'i taşır (birikinti, boyalı foliage ve öteki
aktörler kendiliğinden gelmez), döndürme / ölçek uygulanmaz; `worldTerrainMove`'un
su kısmı ve onu kullanan 3 A Faz 7'ye; heightmap içe / dışa aktarma yalnız editörde
(CLI gerekirse sonra).

*Adım 4 (2026-11-20, `4651b3b`):* World Terrain. **Oluşturma:** Add Actor > Terrain >
World Terrain… (editöre özel menü eylemi; SDK değişmedi) diyaloğu: ad, tile ızgarası,
çözünürlük, aralık, taban yüksekliği, çok tile'da kodlama aralığı, isteğe bağlı
16-bit PNG / RAW heightmap (ızgara ona oturtulur), boyut / maliyet özeti ve sorunlar.
Forge'un Open World bölümü yok (level ayarları World Settings'te). Asset
`content/terrain/<ad>.terrain.json` + tile'lar (çok tile u16, tek tile f32) + global
harita tek kayıt isteğiyle yeni dosya olarak; aktör level'a tek undo ile eklenir ve
seçilir. **Expand** (Landscape > Tiles, yalnız tek tile): Forge'un
`expandSingleTileWorldTerrain`'i, oturumda `replaceTerrain` ile tek undo adımı; yeni
tile'lar `created` (Save `base: null` ile yazar), tanımın artık listelemediği diskteki
tile'lar (geri alınan Expand) Save'de silinir. **Taşıma:** gizmo sürüklerken terrain
görünümü aktörün kaymasıyla izler; level'daki konum değişince (gizmo, Details, undo /
redo) tanımın origin'i ve dünya çerçeveli spline'ları aynı farkla kayar
(`engine/terrain/worldTerrainMove.ts`), tanım kirli, terrain yeniden çizilir; tile'lar
değişmez. **Heightmap:** Import Heightmap… (ızgaranın tam boyunda PNG / RAW, 0 /
65535'in yüksekliği; bütün tile'lar yüklenir, tek undo) ve Export PNG / RAW (bütün
ızgara indirilir; durum satırı yeniden alma aralığını söyler). **Kayıt düzeltmeleri:**
global haritasını hiç okumamış (tek tile) terrain'in kaydı haritanın disk revizyonunu
okur; editörün önceki kaydının geç gelen dosya olayı temiz oturumu düşürmez (kendi
yazdığı yol / revizyonlar tutulur). **Kanıt:** `worldTerrainMove.test.ts` (Forge'un
1. kontrolü birebir, origin / spline kısımları bu deponun), `landscapeSave.test.ts`
(Expand'in yeni tile'ı / silmesi, geç olay); editör smoke'u
`tests/editor/landscapeWorld.spec.ts` (oluştur → Expand + undo / redo → heightmap
içe → dışa → Details'ten taşı → kaydet → yeniden aç) `forceWebGL`'de ve gerçek
WebGPU'da (üç kez) geçti; landscape, addActor, foliage, streaming, world spec'leri
WebGL'de 19 / 19. Sonraya: çok tile'lı terrain'in genişletilmesi (Forge'da da yok),
terrain silinince asset'in temizlenmesi, ajanın `forge edit move`'unun tanımı
taşıması (komut yalnız level'ı yazar). Kullanıcı görsel kabulü 2026-11-25'te verildi.

*Terrain Details düzeni (2026-11-20, `775da8b`; kullanıcı kararları, öneriler gibi):*
Forge'daki gibi Name ve hemen Landscape Mode; Class satırı, Transform, Edit Pivot /
Snap / Movement, Remove, Advanced ve Add Component yok (konum tanımdan gelir,
taşıma gizmo ile); terrain bileşeninin Data / Material alanları en altta kapalı
bölümde. Araç seçimi dört sütunlu düğme ızgarası (seçili vurgulu), View fırçanın
altında. Genel yol: bileşen sunumunda `details: "tool"` (SDK 0.1.14). Yolda bulunan
hata: seçili terrain'in üstünde fırça halkası fare hareketini aldığı için gizmo
sürüklemesi ilerlemiyordu (adım 2'den beri); sürükleme sürerken hareket gizmonun.
Smoke'lar düğmelere ve gizmo ile taşımaya güncellendi; editör seti WebGL'de 91 / 91
(`content.spec`'in geçici dosya yarışı tek başına yeniden koşuda geçti), landscape +
authoring + addActor gerçek WebGPU'da 9 / 9. Kullanıcı görsel kabulü 2026-11-25'te verildi.

*Paint düzeni ve panel adları (2026-11-20, `2a6ef5e`; kullanıcı isteği):* Paint
kipinde Forge'un Brush / Auto Paint sekmeleri (`LandscapeSettings.paintPanel`;
Auto Paint sekmesinde viewport fırçası yok). İkisinde de Layer listesi (katman
materyalinin adıyla, etkin olan vurgulu), Add Layer (n/8), Remove Layer (etkin
katman), etkin katmanın Material seçimi; Brush'ta araçlar, Fill Layer ve fırça;
Auto Paint'te aktörün `forge.landscapeAutoPaint` kuralları yerinde: Base Layer, kural
başına kart (Rule n, katman, bantlar, Remove), Add Rule (etkin katmanla bütün
zemini kapsar), Seed, Apply Auto Paint. Kural düzenlemesi level düzenlemesi (ilk
düzenleme bileşeni ekler); değişiklik tamamlanınca yazılır. Kuralların ayrı
bileşen bölümü yok (`details: "embedded"`, SDK 0.1.14 girdisi güncellendi). Tool
aktörünün Details'i Name'siz, doğrudan Landscape Mode ile başlar. Kabuk: Forge'un
sekme adları ve alt çizgili sekme biçimi (Scene Outliner / World Partition,
Details / Foliage; Mesh Paint kapsam dışı, 5d karar 4). Fiziksel materyal satırı
Faz 8'de (adım 3 kararı). Editör seti WebGL'de 91 / 91, landscape + authoring +
streaming gerçek WebGPU'da 7 / 7. Kullanıcı görsel kabulü 2026-11-25'te verildi.

*Adım 5 kararları (kullanıcı, 2026-11-25, öneriler gibi):* yol mesh'i terrain
tanımından çalışma anında üretilir ve önbelleğe alınır (saklanan asset ya da level
parçası yok; terrain aktörü kalıcı katmanda olduğu için HLOD proxy'si gerekmez);
yol süslemeleri (`splineRoadDecorations`) Faz 6'da D27 ile; Apply Deform ve Apply
Paint mesh'ten ayrı iki eylem (Forge gibi); spline seçimi sayfanın Landscape
ayarlarında; ajan için ek komut yok (spline'lar `.terrain.json`'da düz JSON).

*Adım 5 (2026-11-25, `49d6c09`):* Landscape Splines. Forge'un `splineGenerator` /
`splineDeformMesh`'i spline aktörünündür (INV-D27); landscape yolu
`SceneRuntimeCore`'un zincir bükmesidir ve taşınan odur.
**Yol mesh'i (INV-G21):** saf üretici `engine/terrain/roadMesh.ts` (Codex;
`deformSplineMeshGeometry` + kaynak: eğri, banka, araziye hizalama, süren UV,
1e-5 kaynak, kaynak sonrası normal; parçalar 128 m hücrelere dikişsiz bölünür;
model uzunluğu bütün modelden ölçülür, Forge primitive başına ölçüyordu).
Çizim `render/sync/roadMeshes.ts`: terrain bağlaması tanımdan kurar (editör ve
oyun), bükülen zincir hücre parçası, düz parçalar model başına statik batch;
modelin slot materyalleri; yeni set hazır olana dek eskisi çizilir; seçilmez
(tıklama terrain'e geçer). Spline düzenlemesi terrain'i yeniden kurmaz
(`EditableTerrain.splinesChanged`); hizalı yolun altı oyulunca yol izler.
Tanımdaki `splines[].segments[].mesh.assetId` asset dizinine başvuru olarak girer
(asılı başvuru kapıda hata); içe aktarıcı onu GUID'e çevirir. **Editör (INV-B06):**
`engine/terrain/landscapeSplineEdit.ts` (saf işlemler), `landscapeSplines.ts`
(her işlem tek undo; kayıt tanımla, `markDefinitionDirty`), `landscapeSplineTool.ts`
(Draw, işaretçi seçimi, noktanın gizmosu terrain'inkinin yerine), `landscapeSplinePanel.ts`
(Forge düzeni; Ctrl / Shift çoklu seçim, "Multiple Values"), `render/editor/splineOverlay.ts`.
Forge'dan farklar: Split noktayı yolun sırasına koyar ve Close açık uçları bağlar
(Forge'da Split'ten sonra Close Loop yanlış noktaları bağlıyordu); çizilen nokta yolun
genişliğini ve etkilerini sürdürür; mesh seçmek onu bükülü ve hizalı açar.
**Kanıt:** `roadMesh.test.ts` (Forge'un 7 R kontrolü three'siz uyarlanmış, 18 test),
`landscapeSplineEdit.test.ts`, `landscapeSplines.test.ts`, `roadMeshes.test.ts`;
editör smoke'u `tests/editor/landscapeSpline.spec.ts` (çiz → eğri → gizmo ile taşı →
mesh → Deform / Paint + undo / redo → Split → Close → kaydet → yeniden aç → oyunda çiz)
`forceWebGL`'de ve gerçek WebGPU'da; landscape, authoring, gizmo, selection, foliage
spec'leri WebGL'de 11 / 11, landscape + gizmo gerçek WebGPU'da 6 / 6. Render smoke'u 44 / 45: `impostors (webgl, broadleaf)` bir kez eşiğin altında kaldı (IoU 0,65; 0,75),
tek başına ve bütün dosya olarak yeniden koşuda geçti; HEAD'de yalnız impostor dosyası koşuldu
(4 / 4), düşüş orada yeniden üretilmedi: aralıklı, nedeni kanıtlanmadı.
Sonraya: yol collider'ı (Faz 6, aynı üreticiden; tanımın `collision` alanı duruyor),
yeniden içe aktarılan modelin yollarda tazelenmesi (terrain yeniden yüklenince gelir).
Forge'daki gibi bükülen model segment başına bir kez uzatılır: boyunca halkası
olmayan model eğriyi yalnız segment uçlarında izler. Kullanıcı görsel kabulü 2026-11-25'te verildi.

*Yol mesh'i tekrarı (2026-11-25, `ec45418`; kullanıcı kararı):* bükülen model segment
boyunca kendi uzunluğuna en yakın tam sayıda tekrarlanır (en çok 256); Forge bir kez
uzatıyordu. Yol, segmentin noktaları arasında da eğriyi izler, modelin ayrıntısı uzamaz.

*Adım 6 kararları (kullanıcı, 2026-11-25, öneriler gibi):* sol tık yalnız Foliage
sekmesinde bir araç seçiliyken fırçanındır (aynı düğme, Esc ya da sekmeden çıkmak
kapatır); boyanmış örnek hedef yüzeyini saklamaz (hücre biçimi değişmez, filtreler
yalnız boyarken); kapsam 7 araç + seçim eylemleri (Resource Usage hariç); Fill'de
Forge'un 20.000 aday sınırı, terrain'in bütün tile'ları yüklenir.

*Adım 6 (2026-11-25, `c3f7f0e`):* Foliage fırçası (B09). Saf kısım Codex'e ayrılmıştı;
kullanım sınırı dolduğu için Claude yazdı. **Saf kısım:** `engine/foliage/foliagePaint.ts`
(örnekleme, aralık ızgarası, yerleştirme, reattach / reapply / invalid; dönüş kuaterniyon,
sayılar Float32'ye tam) ve `foliagePaintSession.ts` (hücre / tür listeleri, yamalar, diskle
karşılaştırılan kirlilik; boyanan tür kümesi değişince bütün hücre dosyaları yeniden yazılır).
**Editör:** `editor/foliage/foliageEdits.ts` (level parçasını okur, düzenlemeyi tutar,
revizyonlarla tek kayıt işlemi; 409'da düzenleme kalır, temizse diski izler),
`foliageTool.ts` (araçlar; darbeler sırayla, altındaki hücre ve terrain tile'ını bekler),
`foliagePaintPanel.ts` (Foliage sekmesinde Tools bölümü; tür satırında boyanmış sayı).
Esc önce seçimi, sonra aracı bırakır; Delete seçili foliage'ı siler. **Çizim:**
`LevelFoliageSource.edits`: düzenlenen hücre oturumdan, her değişiklikte hemen çizilir.
Yüzey: `render/editor/surfaceProbe.ts` (alanın parçaları bir kez toplanır, sonra aşağı ışınlar),
`PickSurface.normal` (terrain'de yüklü tile'ın normali). Forge'dan farklar: darbe deseni
darbe numarasıyla değişir, statik mesh'te Fill tıklanan aktörü doldurur, etkisiz Erase
Density yok. **Düzeltme (5c'den):** oyun boyanmış foliage kaynağını yalnız aktör hücresi
olan level'da veriyordu; hücresiz level'da (yalnız terrain) foliage çizilmiyordu
(`runtime/boot.ts`). **Kanıt:** `foliagePaint.test.ts`, `foliagePaintSession.test.ts`,
`foliageTool.test.ts`, `surfaceProbe.test.ts`, `paintedFoliageView.test.ts`; editör smoke'u
`tests/editor/foliagePaint.spec.ts` (boya + undo / redo → kaydet → sil + undo → lasso, sil →
Esc → aktör seçimi → Fill → kaydet → yeniden aç → oyunda akış) `forceWebGL`'de ve gerçek
WebGPU'da; ilgili editör spec'leri WebGL'de 37 / 37 (daha önceki geniş koşuda `details`'in bir testi
ve `landscapeWorld` birer kez kırıldı, tek başına ve bu koşuda geçti), foliage + landscape +
gizmo gerçek WebGPU'da 9 / 9; `smoke:render`'ın foliageRing, gpuCulling, render, puddle ve
terrainCollider dosyaları 23 / 23. Sonraya: Play'e kaydedilmemiş foliage (adım 2'deki gibi),
boyanmış foliage'ın collider'ı (Faz 6). Yol mesh'leri seçilmediği için fırça yolun altındaki
araziye boyar (Forge gibi). Kullanıcı görsel kabulü 2026-11-25'te verildi (yol tekrarıyla birlikte).

*Adım 8 kararları (kullanıcı, 2026-11-25, öneriler gibi):* Create yeni level klasörüne
kurar (Forge açık level'ın içine kurardı), var olan adda önce sorar; nehir / göl / ada /
kıyı notla görünür (yatak ve kıyı işlenir, su Faz 7), varsayılan nehir 0; örtünün ağaçları
ve kayalar starter paketine bağlanır, karşılığı olmayan çalı ve ot raporda kalır; asset
başvuruları GUID, World Builder girdileri (brief → örtü / profil) dosya etiketiyle;
`worldbuilder` paketi eksikse Add Pack manifesti yazar.

*Adım 8 (2026-11-25, `54161a3`):* World Builder penceresi (B13). **Saf kısım:**
`engine/worldbuilder/randomWorldChoices.ts` (seçimler ve aralarındaki kurallar, klasör adı
kuralı, kurulum olayları, açılış kamerası). **Sunucu:** `tools/server/worldBuilder.ts`:
`GET /__forge/world-builder`, `POST /__forge/world-builder/pack` (manifesti kayıt servisiyle
yazar, dev server yeniden başlar: içerik kökleri açılışta okunur), `POST /__forge/world-random`
(`tools/world-random.ts --request` çocuk süreçte, tek kurulum, NDJSON olaylar; var olan level
`force` ister; salt okunur proje reddedilir). **Editör:** `editor/worldBuilder/` (kit formu,
önizleme worker'ı ve çizimi, kurulum, ilerleme) ve `editor/ui/forgeWindow.ts` (Forge'un
sürüklenen / boyutlanan penceresi, sekmesiz). Level adı: açık level üretilmişse onun adı,
yoksa boş olan `World_<n>`. Kurulum bitince level kuş bakışı pozla açılır; özet ve kurulmayanlar
durum satırında. **Üretim:** örtü belgelerinin `plants[].foliageType`'ı ve brief'in
`models[].file`'ı GUID (asset kapısı asılıyı görür); geniş yapraklı kuralları üç prototipe
bölündü; terrain aktörüne `forge.landscapeFoliage`; değiştirilen level'da eski arazinin
boyanmış foliage'ı silinir. CLI (`world:random` / `world:brief`) aynı üretimi kullanır.
**Kanıt:** `randomWorldChoices.test.ts`, `tools/server/worldBuilder.test.ts`, `worldBuild` /
`worldLevel` / `world` / `dataDocument` testleri (ilgili vitest 438 / 438); editör smoke'u
`tests/editor/worldBuilder.spec.ts` (paket ekle + sunucu yeniden başlar → önizleme → kur ve
aç → diskte ve Content Browser'da → sorarak yeniden kur) `forceWebGL`'de ve gerçek WebGPU'da;
ilgili editör spec'leri WebGL'de 29 / 29, WebGPU'da 7 / 7. Sonraya: su aktörleri (Faz 7),
çalı / ot türleri (bitki akışı), World Builder girdilerinin GUID başvurusu (yapılmadı, karar).
Starter Conifer'ın seyrek iğne yaprağı üretilen ormanda görünür (bitki planı). Kullanıcı
görsel kabulü bekleniyor.

*Adım 8 düzeltmesi (kullanıcı kararı, 2026-11-25, `5b8f6fa`; Forge'un 2026-11-08 kararı `1a471eda` taşınırken
değiştirilmişti):* Create açık level'a kurar; Name alanı ve yeni level seçeneği yok. Level'ın ayarları ve sahne
ayarı aktörleri (tekil ortam bileşenleri, yönlü ışık, içinde durdukları grup; `build/sceneSettings.ts`) kalır,
gerisi (arazi, nesneler, boyanmış foliage, HLOD) silinip yeniden kurulur. Gökyüzü / Sky Light / güneşi olan
level'a greybox görünüm eklenmez. Kaydedilmemiş değişiklik kurulumdan önce kaydedilir; pencere yalnız level'da
silinecek bir şey varsa sorar. `world:random --force` / `world:brief --force` aynı kuralı izler. **Outliner
klasörleri (Unreal gibi):** aktörün `folder`'ı (editör verisi, mimari §4.4); üretilenler `World/Buildings`,
`Structures`, `Fences`, `Furniture`, `Rocks`, `Vegetation` altında. Ebeveyn kullanılmadı: alt aktör kökünün
hücresinde yaşar, dünya tek hücreye toplanırdı. Klasör satırı: aç / kapat, göz, kilit, sürükle-bırak, New Folder,
Rename, Remove Folder (aktörler kalır), Select Contents; her düzenleme tek undo. **Kanıt:** ilgili vitest 389 / 389,
`outliner` + `worldBuilder` spec'leri 7 / 7, `agent` / `edit` / `hlod` / `selection` / `streaming` 14 / 14 (`forceWebGL`).
`bench:outliner` değişiklikten önce de sonra da seçim ve arama eşiğini aşıyor (26,8 → 21,7 ms; 62,7 → 63,3 ms;
eşik 16 / 50): gerileme yok, aşım açık. **Sınırlar:** klasör adı değişikliği yalnız yüklü aktörlere ulaşır (durum
satırı söyler); boş klasör sayfayla sınırlı, kaydedilmez.

*Adım 9 kararları (kullanıcı, 2026-11-25, öneriler gibi):* sıra E, sonra F; onay projede ayrı
`*.familysheet.json` asset'inde (durum, not, onaylanan çıktının özeti); starter'a Hazel ve
MeadowGrass çıktısı girer (≈ 1 MB), Oak / Poplar C kabulünü bekler; onay bekleyen ya da değişen
aile kullanılır ve raporlanır, reddedilen kurulmaz; `generated` satır ve örtü bitkisi tarif GUID'i
gösterir; çıktısı olmayan proje tarifi kurulumda üretilir, paket tarifi raporlanır; tekil bitki
brief satırlarından ve yerleşim başına bir ağaçtan; `linked` alanı PG6'ya, editörde Related bölümü.

*Adım 9 (2026-11-25):* bitki tarafı; ayrıntı [bitki planı §9.7](../planned/PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md#97-pg5--editör-ve-world-builder-bağlantısı).
**E:** tarif önizlemesi (Source / LOD / impostor yan yana, tohum galerisi, bellek, hava), kaya
tarifinin editörden üretimi, Related bölümü (`88913ec`); aile ve mevsim önizlemesi, tekil bitki
foliage'ın yanında (`3ce003b`); `forge.familySheet` onay sayfası, SDK 0.1.15 (`e4982df`).
**F:** starter çıktıları (`62d153f`); `generated` kaynağı, `engine/worldbuilder/generatedModels.ts`,
örtünün `plants[].recipe`'i, `forge.plant` yerleşimi, `build/settlementTrees.ts`, eksik proje
çıktısının üretilmesi (`6ef8a9b`). **Kanıt:** ilgili vitest 337 / 337; `tools` 350 / 351, tek düşen
SDK sürümü beklentisi `b7f2981` ile düzeltildi; `tools/world/generatedModels.test.ts` (üretilen dünya,
onay sayfası, proje tarifini üretme); `worldBuilder.spec.ts` (kur → tekil bitki / foliage aileleri →
düzenle → kaydet → yeniden aç → onay sayfası Content Browser'da, `f838402`) forceWebGL ve gerçek
WebGPU'da; `assets` / `content` / `engineContent` / `foliage` spec'leri WebGL'de 30 / 30; E2'nin render
değişikliği için plants / impostors / foliageWind / foliageRing render smoke'u 10 / 10. **Sınırlar:**
`desert-shrub`'ın tarifi yok; binalar ve çitler yer tutucu; kayalar yalnız vadi profilli arazide
serpilir (Forge gibi); ot yoğunluğu Forge'un değerleri, tek öbek için seyrek; `forge.plant`
viewport'ta tıklanıp seçilmez ve Focus (F) aktörün noktasını alır (GPU toplu yolu, PG2'den).
Kullanıcı görsel kabulü bekleniyor.

*Adım 10, teknik kapı (2026-11-25):* **Kapı** (`ded16da`): 2.733 / 2.733 test, editör
`forceWebGL` 99 / 99, dist 1 / 1, proje denetimi 3 / 3. Gerçek WebGPU editör seti **99 / 99**.
Render smoke'u 44 / 45; düşen `impostors (webgl, broadleaf)` tek başına geçti (ilk bakış IoU
0,718 → 0,904; bilinen kararsız test). **Araç başına düzenle → kaydet → yeniden aç:** `landscape`,
`landscapePaint`, `landscapeWorld`, `landscapeSpline`, `foliagePaint`, `foliage`, `worldBuilder`,
`assets` spec'leri. **Ertelenen A:** Faz 5'e ertelenmiş A kalmadı; A 991 / 1.021, kalan 30 Faz 6
(5), 7 (23) ve 8'de (2). **Collider:** G8 tam çözünürlükte azami 2,93 mm
(`2026-11-25T09-50-59-981Z-g8.json`).

Ölçümler (RTX 3060, gerçek WebGPU, `high`, DPR 1, commit `ded16da` temiz ağaç):

| Ölçüm | Önceki kayıt | Bugün | Sınır |
|---|---|---|---|
| Terrain Derekavak 1440p ort. / p95 | 9,83 / 11,20 | 10,43 / 11,00 ms | 16,6 / 20 |
| Terrain WbPilotValley 1440p | 4,54 / 5,30 | 4,99 / 5,60 ms | aynı |
| Terrain Island 1440p | 4,01 / 4,60 | 4,18 / 4,50 ms | aynı |
| Terrain OpenWorldTest 1440p | 2,04 / 2,50 | 2,08 / 2,40 ms | aynı |
| Akış ilk uçuş p99 / en uzun kare | 8,5 / 43,6 | 6,0 / 45,3 ms | 20 / 50 |
| G6 Derekavak P2 gönderim / ana iş parçacığı | 0,99 / 1,49 | 0,86 / 1,30 ms | 3 / 6 |
| Üretilmiş orman yaz gönderim / ana | 1,16 / 1,67 | 1,47 / 2,01 ms | 3 / 6 |
| Üretilmiş orman 15 m/s yürüyüş | 1,82 / 3,09 | 1,66 / 2,92 ms | 3 / 6 |

Terrain 25 / 25 bütçede (kayıt `2026-11-25T09-52-39-560Z-terrain-measure.json`; önceki
`2026-11-16T11-06-51-509Z`). Sahneler o günden beri foliage'ı da çizer; Derekavak'ın soğuk açılışı
3,27 → 4,93 sn, tekil en uzun kare 58,6 ms. Orman: mevsim geçişinde pipeline +0, shader modülü +0, en uzun
kare 9,0 ms; GPU belleği 451,3 MiB (tepe = canlı); hücre döngüsünde 2. döngüden sonra sabit (129
geometri / 60 doku; ilk dönüşte 133 / 67, kayıt `2026-11-25T10-19-28-829Z-forest.json`). Foliage
`2026-11-25T10-16-28-180Z-foliage.json`.

**Akış ölçümü iki kez koştu.** İlk koşu (`2026-11-25T10-15-39-756Z-streaming.json`) üç ölçütte düştü:
en uzun kare 50,5 ms (sınır 50) ve GPU geometri sayısı iki karşılaştırmada birebir değil (döngülerde
264–266, artış yok; önbellek 128 sabit, heap +%1,1). Neden: `bench:streaming-level` projedeki bütün
modelleri serper, 2026-11-17'den sonra starter'a giren 51 üretilmiş GLB (her LOD ayrı) de rastgele
static mesh oldu (HLOD 1.643.744 → 18.921.584 üçgen). Üretilmiş modeller varsayılan olarak dışarıda
bırakıldı (`--generated` geri alır); level birebir eski HLOD üçgenine (1.643.744) döndü ve ölçüm geçti
(`2026-11-25T10-30-34-485Z-streaming.json`, araç değişikliği commit'lenmeden koştu): geometri / doku on
döngüde 121 / 30. Ağır level'ın sonucu bilgi olarak kalır.

**Bulunup düzeltilenler:** (1) HLOD üreticisi KTX2 dokuyu okuyamıyordu (sharp): 2026-11-19'dan beri
üretilmiş kaya, kabuk ve yaprak proxy'leri materyal çarpanına düşüyordu, kayalar beyazdı. `decodeKtx2Rgba`
(`ktx2-encoder`'ın kendi transcoder'ı, yeni bağımlılık yok), HLOD önbellek sürümü 2: önceden üretilmiş
HLOD editörde bayat görünür (`eab26b4`). (2) Vite izleyicisi motorun `.forge-cache`'ini (4,3 GB) tarıyordu:
dev server açılışı 20–31 sn → 2,3 sn; `devProject.test.ts` yük altında 60 sn'yi bu yüzden aşıyordu
(`ded16da`).

**Kullanıcı kabulü (2026-11-25):** adım 8 (World Builder penceresi), adım 9 (PG5) ve Faz 5 toplu
kabulü verildi; 5d ve faz kapısı kutuları işaretlendi, bölüm arşivlendi. Ağaç türleri (bitki planı
PG5b adım 5–6) bitki planında sürer, Faz 5 kapısının parçası değildir.

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
- [x] **5c Foliage:** instancing + compute culling + indirect draw; impostor /
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
      **2026-11-19:** teknik kapı geçti (5c adım 11 kaydı; bitki planı v0.10 PG3); kullanıcı görsel kabulü
      verdi (aynı gün). Kabuk ve kaya dokuları da KTX2 (kullanıcı kararı). 5c tamamlandı; Faz 5 bölümü
      5d açık olduğu için arşive taşınmaz.
- [x] **5d Editör araçları + World Builder:** sculpt, paint, foliage paint
      (boya / silme fırçası; Foliage sekmesinin tür ve kural düzenlemesi 5c F5–F6'ya
      alındı, v1.73), landscape spline; World Builder penceresi + `/__world-random` endpoint'i
      + önizleme worker'ı; PG5 tam tarif paneli, `generated` model kaynağı ve
      bitki ailesi yerleşimi. *Kapı:* araç başına editör smoke'u (düzenle → kaydet
      → yeniden aç); üretilen dünya Content Browser'da görünüyor; `worldTerrainMove`'un
      origin / spline A'sı yeşil (su kullanan 3 A Faz 7'de, kullanıcı kararı 2026-11-19); üretilen bitki
      yerleşimleri aileyi kullanıyor, aile / mevsim önizlemesi çalışıyor.
      **19 Kasım 2026:** Ağaç tarifinde canlı worker önizlemesi, seed / mesh LOD
      seçimi ve aile üretimi için ilk editör dilimi. Görsel bulgular, uyumluluk
      önerisi ve A–F sırası [bitki planı §9.1](../planned/PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md#91-vegetation-20-denetimi-ve-ilk-editör-dilimi).
      **19 Kasım 2026 (v1.89):** döküm, kararlar 1–6 ve adım sırası yukarıda
      (5d başlangıç dökümü); Mesh Paint (B10, E26) kapsamdan çıktı.
- [x] Faz kapısı: referans açık dünya sahnelerinde görsel + performans kabulü;
      terrain collider ile eşleşiyor. **2026-11-25:** kullanıcı Faz 5 kabulünü verdi
      (adım 8 ve 9 dahil); teknik kapı aynı gün geçmişti (adım 10).
