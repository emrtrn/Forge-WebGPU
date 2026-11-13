# Faz 3 — Render çekirdeği ve level görüntüleyici (arşiv)

**Kapandı:** 2026-11-13. [Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
kapanışta olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır.
Kararların kendisi [mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
(§4.3, §4.6–§4.10; v1.6–v1.15). Taşınan ve yeniden yazılan her modül
[taşıma günlüğünde](../PORT_LOG.md) (§2, sayım §2.1). Bölüm numaraları (§2.9, §2.10…)
plana, "mimari §…" rapora göndermedir.

**Başladı 2026-11-12.** Tasarım kullanıcı onayıyla (2026-11-12, "hepsi öneri
gibi"); kararlar mimari raporda (v1.6: §4.3, §4.6, §4.7, §4.9, §4.10), bu
bölüm kutuları, dökümü ve sırayı tutar. Görsel ayar kullanıcıda (§2.9): sistem
kurulur, parametreler şemaya açılır; sahne doğrulaması işlevsel, tek kontrol
çekimi.

**Döküm (2026-11-12).** Fazı 3 olan 36 envanter satırı (`PORT_LOG` §1) aşağıdaki
kutulara dağılır; Forge kaynakları yalnız okunur (`render-three` TSL ile yeniden
yazılır, spike `spikes/webgpu/` referans).

| Kutu | INV | Forge kaynağı | Ertelenen A | R kontrolleri (öneri, kesin sayım kutuda `PORT_LOG` §2'ye) |
|---|---|---|---|---|
| Kaynak önbelleği | G03, E06, E08 | `render-three/{gltfLoader,gltfModelLoader,models}`; spike `shared/{content,contentRender}` | — | 2 yeniden yaz (GUID'le model sınırları, GLB slot sırası) |
| Renderer host | G01, H18, H19 | `render-three/renderer`; spike `shared/spike` | GPU timer 1 → D (karar 6) | — |
| Materyal | E09–E12, G02, G26, C08 (motor), H20 (asset raporu) | `engine/assets/material`; `render-three/{materials,textureConfig,aoSurfaceMaterials,worldMaskPatch}`; `tools/assetPerfReport` | starter materyal 1, asset perf 3 | 5 yeniden yaz; 6 düşer (world mask yaması 3, AO yüzey materyali 3) |
| Işık ve gölge | D04, D46, G04, G05 | `render-three/{lights,sunCascadeShadow,sunFollowShadow,depthMode}`; `engine/world/{sunCascades,followShadow}`; spike `shared/environment` | güneş kaskatları 9, takipli gölge 9 | 19 yeniden yaz; 3 düşer (GLSL yaması 2, eski indeks etiketi 1) |
| Çevre | D08–D11, D16, D17 (render alanları), G06–G09 | `render-three/{skyAtmosphere,moonDisc,starField,heightFog,cloudLayer,reflection,authoredEnvironment}`; alanlar `engine/scene/*`; taşınmış `engine/environment` | — | 18 yeniden yaz; 6 düşer (`resolve*` 3 → şema normalize'ı, sis yaması 2, varsayılan level 1); sphere capture 10 D (INV-D12) |
| Gün saati | D16, F26 | taşınmış `worldClock`, `worldEnvironmentController`, `recapturePolicy` | — | — |
| Pipeline + kalite | D15, G11, G29, A10 (motor) | `render-three/postProcess`; `engine/perf/{qualityProfiles,adaptiveQuality,hardwareHints}`, `engine/persistence/userSettingsStore`; spike `shared/pipeline` | kalite / uyarlama / ipuçları 13, kullanıcı ayarları 4 | 10 yeniden yaz; 1 düşer (`resolvePostProcess`) |
| Level görüntüleyici | D01, D05, D40 (+ G13 salt çizim, karar 1) | `src/scene` runtime (referans); spike kip (b), `shared/terrain` | — | 4 yeniden yaz; 2 düşer (World yaşam döngüsü yerini aldı) |
| Render smoke'u | H18 / H19 (ölçüm biçimi) | `ForgeReference/baseline/tools`, spike `run.mjs` | — | — |

three'nin GLSL chunk çapalarını sınayan 6 R da düşer. Faz 3'e düşen R: 92
(58 yeniden yaz, 34 düşer); kalan 526 R fazlarında (4 editör, 5a terrain
render, 5b HLOD / culling / LOD, 5c foliage, 5d / 6 spline mesh, 6 animasyon /
VFX / oyun kamerası, 7 su, 8 deformable / kırılma).

**İçe aktarıcının Faz 3 çeviricileri** (her biri kendi kutusunda; sonra
`--pack starter` ve `webgpu-scenes`'in 7 level'ı `--force` ile yeniden alınır,
GUID'ler aynı; `--compare` yeni aktör sayımlarını açıklar; World Builder
level'ları `world:brief` ile, greybox ışık / gökyüzü `worldBuild`'in
`deferred`'ından çıkar):

| Forge alanı | Hedef |
|---|---|
| `lights[]` | aktör başına `forge.directionalLight` / `forge.pointLight` / `forge.spotLight`; güneş `atmosphereSun` işaretli tek directional (Forge'un güneş seçme kuralı çeviride) |
| `skyAtmosphere` | tekil `forge.skyAtmosphere` (pozlama ölçeği Forge'daki gibi, 1 → 0,2) |
| `reflection` + sky light yakalama | tekil `forge.skyLight` (PMREM) |
| `cloudLayer` / `postProcess` / `worldEnvironment` | tekil `forge.cloudLayer` / `forge.postProcess` (+ `reflection: off \| ssr`, `antialias: none \| traa \| smaa`) / `forge.worldEnvironment` (sürekli gün döngüsü yok, karar 8) |
| `worldSettings` | render alanları (arka plan, ortam ışığı) Faz 3'ün tekillerine (karar 7); statik gölge varsayılanları yerleşimlerin `castShadow`'una çözülür (kullanıcı kararı 2026-11-13, adım 4); view distance 5b, rüzgâr 5c, yerçekimi / kill Z / game mode 6 |
| `instances[].{color, castShadow, materialSlot}` | `forge.staticMesh` sürüm 2 (`color`, `castShadow`, `materials`), `forge.shape`'e `castShadow` |
| `landscapes[].material` | `forge.terrain.material` |
| `*.material.json` | `forge.material` (doku başvuruları GUID) |
| `*.materials.json`, `*.uvw.json`, `*.vertexcolors.json` | `forge.model` içe aktarma ayarları sürüm 2: `materials`, `uvw`, `vertexColors` (boş `meshes` yazılmaz) |

**Kararlar (kullanıcı, 2026-11-12; ayrıntı mimari v1.6):**

1. *Terrain:* spike S2'nin TSL CDLOD'u Faz 3'e salt çizim olarak gelir
   (yükseklik, 8 katman, normal, gölge; su birikintisi / kıyı / kostik / tile
   akışı yok); 5a üretim kalitesine çıkarır. Referans sahneler kapıda terrain'le.
2. *`render.ts` kaydı:* editör deseni. Render host `features/*/render.ts`'i
   kendisi toplar; `feature.ts` render'ı anmaz (statik ya da dinamik). Yeni
   katman kuralı + kasıtlı ihlal fixture'ı. Başsız açılışta (`check:projects`)
   render yok.
3. *Kalite modeli:* Forge'un merdiveni (ultra / high / medium / low / custom),
   uyarlamalı kalite ve donanım ipuçları olduğu gibi taşınır; ayrı adımda
   WebGPU izin alanları (`traaAllowed`, `ssrAllowed: off | half | full`,
   `ssgiAllowed`, `aoResolutionScale`) ve eşleme: ultra / high → Balanced,
   medium → GTAO'suz Balanced, low → Compatibility; Cinematic merdiven dışı
   ayrı seçim, uyarlamalı kalite ona çıkmaz. Profil izin verir, açmaz.
4. *MRT:* biçim sıkıştırma, `requiredLimits` yok: output RGBA16F 8 + normal
   RGBA8 8 + velocity RG16F 4 + metalrough RG8 2 + diffuse RGBA8 8 = 30 bayt
   ≤ 32. Bayt maliyetleri ilk pipeline adımında gerçek cihazda doğrulanır; bir
   test her profilin toplamını sınar.
5. *Materyal:* `forge.material` şemalı JSON asset türü (çekirdeğe yeni yetenek,
   A13'ün de temeli: başvurular dizinde yürünür, form şemadan). Forge'un
   `normalizeForgeMaterialDef`'i içe aktarıcının okuyucusu olarak olduğu gibi
   taşınır. Starter materyal A kontrolü paketteki çevrilmiş materyalleri aynı
   iddialarla sınar (yol ve normalize çağrısı değişir; `PORT_LOG`'da
   "uyarlandı").
6. *GPU timer A kontrolü* (WebGL `EXT_disjoint_timer_query`): D, payda 1.021.
   three WebGPU'da ve WebGL2 backend'inde kendi timestamp sorgusunu kullanıyor.
   Araçta (`DROPPED_CHECKS`) kalite adımında uygulanır.
7. *worldSettings:* her alan sahibi özelliğin tekil bileşenine; World Settings
   paneli (Faz 4) bu tekilleri tek yerde gösterir. Tek `forge.worldSettings`
   bileşeni yok.
8. *Sürekli gün döngüsü yok:* şemada yalnız sabit saat + zamanlı geçiş; Forge'da
   `dayLength > 0` olan level raporda "çevrilmedi (kullanıcı kararı)".
9. *HLOD 5b'de* (akışla; hücre boşaltılmadan anlamı yok).
10. *Cihaz kaybı v1:* render durur, renderer'sız ekran + "yeniden yükle";
    otomatik yeniden kurulum sonra.
11. Shape mesh'leri prosedürel geometri (asset yok); referans görüntüler depo
    dışında (`Games/ForgeReference/render-refs/`, içerik lisansı doğrulanmadı).

**Sıra** (her adım yeşilse ayrı commit + push; adımdan sonra `PORT_LOG` §2 /
§2.1, bu bölüm + §11, `npm run port:forge-tests`, gerekirse mimari rapor ve
harita, hafıza):

1. ~~**Dikey dilim:** `@playwright/test` (Forge'daki sürüm, tam sabit);
   `src/render` iskeleti; renderer host (backend kanıtı + rozet, DPR, resize,
   cihaz kaybı, `data-forge-perf` + timestamp); boot'un `render` aşaması;
   render bağlaması sözleşmesi + host toplaması (karar 2); GUID anahtarlı
   kaynak önbelleği + iki World testi; `forge.shape` + `forge.staticMesh`
   (GLB kendi materyalleriyle) + Height Fog `render.ts` + ışıksız level'a
   varsayılan güneş / ortam ışığı; terrain'siz level (PhysicsInteractionTest /
   L03); smoke iskeleti (1 level × 1 poz, boş görüntü, backend kanıtı).~~ —
   **tamam** (2026-11-13, `093a77c`). `render.ts`'leri `main.ts` Vite glob'uyla
   toplayıp host'a verir (`render` katmanı `features/`'ı import edemez; yeni
   kural `feature-does-not-name-render`). GUID → URL için dev server'a
   `GET /__forge/asset-files`. Height Fog Forge formülüyle TSL sis düğümü.
   Varsayılan güneş Forge'un; ortam ışığı Forge world settings varsayılanıyla
   0 (Forge gibi eklenmez), gölge adım 3'te. Smoke: L03 × 1 poz, gerçek WebGPU
   (NVIDIA Ampere), kaynak hatası yok; referans yok, aday
   `render-refs/candidates/l03/p1.png` (kabul adım 9'da). A 885 / 1.022
   değişmedi; adıma düşen R: 1 yeniden yazıldı, 5 düştü, 4 adım 4 / 5 / 8'e
   (`PORT_LOG` §2).
2. ~~Kalite profilleri / uyarlamalı kalite / donanım ipuçları / kullanıcı ayarları
   taşınır (17 A), GPU timer D; WebGPU izin alanları ayrı commit.~~ — **tamam**
   (2026-11-13, `620cb3e` taşıma + sürücü, `dff1176` izin alanları). Forge
   modülleri olduğu gibi; `applyQualityToPostProcess` adım 6'ya (eski
   `ResolvedPostProcess`'e bağlı). Kalite sürücüsü `src/runtime/quality`
   (Forge `RuntimeSceneApp`'in kalite kuralları); renderer piksel oranını
   `effectiveDevicePixelRatio`'dan alır, `data-forge-perf` profili ve uyarlama
   derinliğini yazar. Cinematic merdiven dışı `cinematic` seviyesi. Smoke
   profili sabit (`high`, uyarlama ve kalibrasyon kapalı). **A 902 / 1.021**;
   Faz 3'te kalan ertelenmiş A 22 (gölge 18, asset perf 3, starter materyal 1).
3. ~~Işık ve gölge: ışık bileşenleri + çevirici, `sunCascades` / `followShadow`
   taşınır (18 A), `CSMShadowNode` (Forge bölmeleri, kamerayı düğüm kendi alır),
   takipli gölge, reversed-Z.~~ — **tamam** (2026-11-13, `c14e11f`, `4b9a640`).
   `forge.light` (üç bileşen, güneş `atmosphereSun`); kaskatlı güneş
   `CSMShadowNode`, öteki gölgeli yönlü ışıklar takipli harita (bias −0,0005;
   Forge'un 2 cm'si sivilce verdi). **Kullanıcı kararı:** Forge'un level
   düzeyindeki statik gölge varsayılanları taşınmaz; `forge.staticMesh` /
   `forge.shape`'in `castShadow`'u (adım 4, varsayılan açık) ve içe aktarıcı
   Forge'un `staticObjectsCastShadow`'unu yerleşimlere çözer; gölge almak hep
   açık. O zamana kadar bütün şekil / mesh'ler gölge atıp alır. İçe aktarıcı
   ışıkları çevirir; referans projesi kullanıcı onayıyla `--force` ile yeniden
   alındı (7 level'da ışık ve aktör sayımları `--compare`'de eşit, smoke
   çevrilmiş ışıkla yeşil). Starter paketinde level yok, değişmez.
   **A 920 / 1.021**; Faz 3'te kalan ertelenmiş A 4.
4. ~~Materyal: şemalı JSON asset türü, `forge.material`, `forge.model` / `texture`
   / `staticMesh` sürüm 2 + geçiş, node material + katkı sırası, çeviriciler,
   starter'a 10 materyal (1 A), asset perf raporu (3 A).~~ — **tamam**
   (2026-11-13, `f6aa509` asset perf, `203714e` çekirdek, `04409af` şemalar +
   çeviriciler + starter, `6f02c42` render). Çekirdek `defineJsonAssetType`
   (dosya `{ schema: "<tür>/<sürüm>", id, …alanlar }`, sürüm geçişi, dizin
   başvuruları yürür, kayıt servisi tanır; SDK 0.1.2) ve isteğe bağlı renk
   (`color({ default: null })`). **Kullanıcı kararları (2026-11-13):** boş
   tint isteğe bağlı renk; Forge'da null olabilen materyal grupları `enabled`
   anahtarıyla; materyalde `name` yok, preset'ler editör şablonu; yerleşimin
   tek `materialSlot`'u modelin her GLB slotuna yazılır. Render: slot
   düğümleriyle node material (tiling ve flipY UV düğümünde, doku paylaşılır),
   katman karışımı ve normal hareketi TSL'de, katkı sırası iskeleti + world
   mask (`maskNode`); static mesh slot önceliği yerleşim → model → GLB,
   renkli yerleşim kendi kopyası, `castShadow` bileşenden. İçe aktarıcı
   materyalleri, model yan dosyalarını, yerleşim renk / gölge / materyalini
   (gölge yoksa Forge'un `staticObjectsCastShadow`'u, varsayılanı kapalı) ve
   landscape materyalini çevirir; `worldSettings` alanları tek tek raporlanır.
   Starter paketine 10 materyal; referans projesi kullanıcı onayıyla yeniden
   alındı (7 level `--compare`'de açıklanmayan fark yok), L03 zemini modelin
   slot materyaliyle çiziliyor (smoke, gerçek WebGPU). **A 924 / 1.021**;
   Faz 3'te ertelenmiş A kalmadı. Adıma düşen R: 6 yeniden yazıldı, 6 düştü
   (`PORT_LOG` §2).
5. ~~Çevre: gökyüzü, sky light / IBL, bulut, WES bağlaması (ay, yıldız, gece),
   world settings alanları + çeviriciler.~~ — **tamam** (2026-11-13, `69a9be7`
   görüş mesafesi + sis CPU ikizi, `c3c4d07` tekiller + çeviriciler, `f092bc5`
   render). **Kullanıcı kararları (2026-11-13):** Forge'un
   `worldSettings.backgroundColor / ambientColor / ambientIntensity`'si
   `forge.skyLight`'ta (IBL şiddeti + düz ortam ışığı + gökyüzü yokken arka
   plan; Sky Light'sız level Forge varsayılanları); gökyüzü varken çıktı Forge
   kuralıyla ACES + pozlama × 0,2 (adım 6'da pipeline'ın ton eşlemesine);
   `engine/world/viewDistance.ts` sisin CPU ikizi için 5b'den öne alındı.
   Tekiller `forge.skyAtmosphere` + `forge.skyLight` (özellik `forge.sky`),
   `forge.cloudLayer`, `forge.worldEnvironment` (sabit `hour`, `sunPath`,
   `night`, mevsim, hava; `surface` 5a, `wind` 5c); WES alt sistemi taşınmış
   denetleyiciyi `WorldEnvironmentKey` ile verir. Render: three'nin TSL
   `SkyMesh`'i + Forge'un ayı ve yıldızları, Sky Light PMREM yakalaması
   (Forge'un yeniden yakalama politikası ve telafisi), fBm bulut kubbesi; WES
   yorumu kare başına bir kez (`ctx.environment.override`), bağlamalar kendi
   parçasını çizer, bileşenler yazılmaz; varsayılan güneş de yorumu alır.
   İçe aktarıcı dört tekili çevirir (`dayLengthMinutes > 0` "çevrilmedi
   (kullanıcı kararı)"); World Builder Forge'un greybox gökyüzü / Sky Light /
   güneşini yazar. Referans projesi kullanıcı onayıyla yeniden alındı (7 level
   `--compare`'de eşit; `check:projects` ve smoke, L03, gerçek WebGPU'da yeşil).
   **A 934 / 1.021**.
   Adıma düşen R: 19 yeniden yazıldı (sis ikizi dahil), 6 düştü (`PORT_LOG` §2).
6. ~~`RenderPipeline` + Post Process + kalite eşlemesi + MRT.~~ — **tamam**
   (2026-11-13, `5d8c8cc` şema + kalite kapısı + çevirici, `7e202d4` render).
   `forge.postProcess` Forge'un alanları ve aralıklarıyla + `antialias: none | traa |
   smaa`, `reflection: off | ssr`; `applyQualityToPostProcess` bileşen verisine
   uyarlandı (+ TRAA, SSR). Pipeline planı (pass sırası, MRT, yeniden kurma anahtarı)
   + tek three `RenderPipeline`: MRT'li sahne pass'i → GTAO / SSGI → SSR → TRAA / SMAA →
   DoF → bloom → renk düzeltme → renk sapması → vignette → gren → ton eşleme;
   pass'sız plan doğrudan. MRT biçim sıkıştırması 30 bayt, profil başına test
   (ultra / high / medium 22, low 8, cinematic 30), açılışta cihazda tam set sondası
   (NVIDIA Ampere: 30 / 32 kabul). **Kullanıcı kararları (2026-11-13):** Post Process
   varken çıktı onun ton eşleyicisi ve pozlamasıyla, gökyüzü kubbesi kendi pozlamasıyla
   (× 0,2'siz) sahneye göre; SSGI, profil izin verirse AO'nun yerine (yeni alan yok);
   renderer `antialias: true`, MSAA yalnız pipeline'sız çizimde (Forge gibi). Post
   Process'siz level Forge'daki gibi (gökyüzü varken ACES, yokken ton eşlemesiz).
   Referans projesi kullanıcı onayıyla yeniden alındı (7 level `--compare`'de eşit; L03
   smoke'ta `scene,gtao,smaa,bloom,output`, GPU 0,6 ms). **A 934 / 1.021**; adıma düşen
   R: 9 yeniden yazıldı, 1 düştü (`PORT_LOG` §2).
7. ~~Olay bazlı gün saati (`timeTransition`, ayrı commit) + yakalama sıklığı ölçümü.~~ —
   **tamam** (2026-11-13, `1930135` saf modül, `3e87850` servis, `66d34a6` yakalama
   hızı, `dac9605` render + ölçüm). `engine/environment/timeTransition.ts`: saat
   simülasyon saniyesiyle smoothstep'le ileri yürür, sonra durur; yeni geçiş ulaştığı
   saatten başlar. `WorldEnvironmentService.transitionTo({ hour, seconds })` taşınmış
   controller'da, `forge.worldEnvironment` alt sisteminin `prePhysics` tick'inde
   yürür. **Kullanıcı kararları (2026-11-13):** controller'a eklenir; bitiş
   `Promise<boolean>` (vardı: true; yeni geçiş, `setHour`, level boşalması: false);
   yön hep ileri (20 → 6 gece yarısını geçer, aynı saat geçiş değil); yakalama hızı
   aşağıdaki ölçümden "açı + 0,1 sn sınır". **Ölçüm düzeneği:** `npm run
   measure:sky-capture` (`tests/smoke/skyCapture.measure.ts`, smoke sunucusu ve
   profili `high`, L03, 1280×720): dev'e özel `window.__forgeDev` kare döngüsünü
   duraklatıp 60 Hz adımlar; önce yakalama tezgâhı (aynı PMREM'e 1 ve 20 ardışık
   yakalama, timestamp sorgusu), sonra beş geçiş (10 → 22 ve 22 → 10 5 sn, 10 → 22
   2 / 10 sn, 10 → 14 5 sn) kare kare: yakalama sayısı, en uzun ardışık yakalama,
   kare ve yakalama CPU'su; kayıt `render-refs/runs/*-sky-capture.json`.
   **Sonuç (NVIDIA Ampere, Chrome 157):** 256'lık PMREM yakalaması tek başına
   ~3,3–3,5 ms GPU, ~1,3–2,2 ms CPU. Forge'un açı politikası 5 sn gündüz → gece
   60 Hz'de 69 yakalama, ufukta 21 kare üst üste. Yakalama her seferinde yeni doku
   üretiyordu, onu örnekleyen materyaller yeniden kuruluyordu (yakalayan kare ~11 ms
   CPU): artık aynı hedefe yazılır (~2 ms). Seçilen kural (`recaptureRate.ts`):
   Forge açı politikası + güneş hareket ederken yakalamalar arası en az 0,1 sn
   (simülasyon zamanı) + güneş durunca son konumda bir yakalama (Forge'un politikası
   durağan saati 3°'ye kadar eski bırakıyordu); hava / mevsim değişimi anında. Aynı
   geçişte 38 yakalama, ardışık en çok 1; renk en çok ~6° geride, parlaklık telafiyle
   köprülenir. Adımlı karenin GPU zamanı yakalamaya atanamıyor (yakalayan kare
   ~0,1 ms okur); GPU maliyeti tezgâhtan. Render smoke yeşil. **A 934 / 1.021**
   (kutunun ertelenmiş A'sı ve R'si yok).
8. ~~Görüntüleyiciyi tamamla: instancing (kip b), terrain salt çizimi, bütün
   referans level'lar, kamera, `?debug`.~~ — **tamam** (2026-11-13, `992560a`
   instancing, `5897915` katman materyali GUID + paket gereksinimi, `615cfdd` terrain,
   `1f28c22` kamera, `e887fca` `?debug`, `432c7c3` smoke level'ları). *Instancing:* canlı batch
   (`render/sync/instanceBatches.ts`, Forge'un `createInstancedModelGroup`'u):
   static mesh model + slot override'ları + gölge başına, shape primitif + gölge
   başına (beyaz materyal), yerleşim rengi instance rengi (Forge'un bölen kuralı),
   batch'in bütün instance'larının sınırıyla kesim. *Terrain:* spike S2'nin TSL
   CDLOD'u (`render/materials/terrain.ts`), belge + bütün tile'lar + katman
   materyalleri `terrain:<guid>` önbelleğinde, kamera 0,1 m kıpırdayınca yeniden
   seçim, frustum kesimi yok (Forge'un görüş + gölge kesimi 5a), landscape
   materyali çizilmez (Forge runtime'ı gibi). **Kullanıcı kararları
   (2026-11-13):** terrain ve zemin örtüsü katman materyali belgede GUID (içe
   aktarıcı çevirir, World Builder ve örtüler starter materyallerini GUID'le
   anar, starter'a `lt-snow` / `M_Sand_Dry`), veri belgesi tipi başvuru yollarını
   adlandırır (`layers[].material`, asılı olan kapıda düşer; SDK 0.1.3); paket
   manifesti `forge.pack.json` `requires` (worldbuilder → starter; `forge check`
   ve asset kapısı uygular); `?debug` Faz 3'te okuma + tablolar. *Kamera:* Forge'un
   `cameraControl.ts`'i olduğu gibi (6 kontrol), görüntüleyicide varsayılan kamera
   kontrolleri (WASD / oklar, E / Q, sağ sürükleme, 6 m/s), çerçeve yerleşimlerin
   oda sınırından (terrain hariç). *`?debug`:* Forge'un saf okuma biçimlendiricileri
   ve sahne maliyeti taraması (8 kontrol), panel kabuğu, tablo modalı ve CSS;
   0,5 sn'de bir okuma, "Scene cost" tablosu; dinamik import. *Smoke:* 4 terrain
   level'ı Faz 0 P2 pozunda, PhysicsInteractionTest ve spline-test-range
   görüntüleyicinin çerçevelemesiyle (Faz 0 pozu yok), `main` boş (check:projects
   açar); kamera ve `?debug` smoke'ları. Referans projesi kullanıcı onayıyla
   yeniden alındı (7 level `--compare`'de eşit). **A 934 / 1.021**; A dışından
   etiketiyle taşınan 14. Adıma düşen R: 4 yeniden yazıldı, 2 düştü (`PORT_LOG` §2).
9. ~~Smoke tam set + Faz 0 görüntüleriyle yan yana ızgara → kullanıcı kabulü → kapı.~~ —
   **tamam** (2026-11-13, `38dcc56` gölge düzeltmesi, `5a71a75` smoke tam seti + ızgara).
   *Smoke:* 4 terrain level'ı Faz 0 pozlarında (P1–P3; konum + kuaterniyon
   `baseline/poses.json`'dan, yeniden türetilmeden), L03 p1, PhysicsInteractionTest ve
   spline-test-range görüntüleyicinin çerçevelemesiyle: 15 çekim, Faz 0 boyutunda
   (1920 × 1080, DPR 1; kamera / `?debug` smoke'ları ve ölçümler 1280 × 720). *Izgara:*
   `npm run smoke:grid` → `render-refs/grid.html`, her poz Faz 0 WebGL | WebGPU;
   eşleşmeyenler başta: L03 ve iki çerçeveli level'ın Faz 0 çekimi yok; Faz 0'ın temiz
   çekimlerinde profil sabitlenmemişti (Forge'un açılış varsayılanı), `high` profilli
   WebGL çekimleri `?debug` panelli (bağlantı sayfada). *Bulunan hata:* terrain
   level'larında hiçbir statik mesh gölge atmıyordu: `CSMShadowNode` ışığın yerel
   konumunu dünya sayar ve kaskat ışıklarını ebeveynine ekler, güneş ise dönük /
   taşınmış aktörün holder'ındaydı (L03 orijine yakın, görünmüyordu); yönlü ışıklar artık
   dünya çerçevesinde (yeni test). *Farklar (ayar yok, kullanıcıya listelendi):* foliage
   (5c), su (Faz 7), araçlar (6 / 8) çizilmiyor; gölge kenarı WebGPU'da daha yumuşak;
   orta mesafe çimen bir ton koyu (Derekavak / WbPilot P2); rozet sol altta.
   **Kullanıcı kabulü (2026-11-13):** görsel kabul verildi; referanslar `npm run
   smoke:render -- --update-snapshots` ile yazıldı, ikinci koşu 15 / 15 karşılaştırmada
   (`maxDiffPixelRatio` 0,01) geçti. "Işık ve gölge" kutusu kullanıcı kararıyla (a):
   işaretlendi, view distance 5b'ye taşındı. **A 934 / 1.021**; adıma düşen R yok.

- [x] Render kaynak önbelleği (geometri, doku, materyal; pipeline three'nin)
      asset GUID'iyle anahtarlı ve renderer'a ait, World'den ayrı (mimari A6,
      §4.9). *Adım 1:* önbellek, World başına sayaç, iki World testi, model ve
      şekil anahtarları. *Adım 4:* `texture:<guid>:<srgb|linear>` ve
      `material:<guid>:<katkı imzası>` (materyalin dokuları host düzeyindeki
      sahipte). *Adım 8:* `terrain:<guid>` (belge, tile'lar, katman girdileri).
- [x] Renderer host: init, resize, DPR, cihaz kaybı (karar 10), gerçek backend
      rozeti; `?debug` overlay (`engine/perf` zaten three'siz) + GPU timestamp.
      *Adım 1:* `?debug` overlay dışında hepsi; overlay adım 8'de, DPR'nin
      kalite bağı adım 2'de. *Adım 8:* `?debug` paneli (okuma + Scene cost
      tablosu, dinamik import); GPU sweep, kare yakalama, terrain haritası, hız
      kontrolü 5a / 6 (kullanıcı kararı).
- [x] Materyal sistemi: `forge.material` (karar 5) → node material (§2.3);
      katman / anizotropi / ORM; GLB + KTX2 (three'nin `examples/jsm/libs`'i,
      yeni npm bağımlılığı ve vendor kopyası yok). *Adım 4 (2026-11-13):*
      şemalı JSON asset türü, `forge.material`, sürüm 2 türler, TSL slot
      düğümleri + katkı sırası (world mask), çeviriciler, starter 10 materyal,
      asset perf raporu. `sway` 5c'de, `terrainDetail` 5a'da çizilir; editör
      (INV-C08) Faz 4'te.
- [x] Işık ve gölge: `CSMShadowNode`, reversed-Z (`reversedDepthBuffer` yapıcı
      seçeneği; WebGL'deki `EXT_clip_control` hilesi gerekmez), view distance.
      *Adım 3:* ışık bileşenleri, CSM, takipli gölge, reversed-Z, çevirici hazır;
      view distance 5b'de (mimari); referans projesi yeniden alındı. *Adım 9:*
      yönlü ışıklar dünya çerçevesinde (kaskatlar görüşü kaplıyor). **View distance
      5b'ye taşındı** (kullanıcı kararı 2026-11-13, seçenek a; 5b kutusunda).
- [x] Çevre: sky atmosphere, height fog, cloud layer, WES bağlantısı
      (`engine/environment` three'siz), sky light / IBL (PMREM). Sphere
      reflection capture taşınmaz (kullanıcı kararı 2026-11-11): genel yansıma
      SSR, düz yüzeyler planar (Faz 7). *Adım 5 (2026-11-13):* dört tekil +
      çeviriciler, TSL gökyüzü / ay / yıldız / bulut, PMREM Sky Light, WES
      yorumu, arka plan ve ortam ışığı Sky Light'ta. Görsel kabul kapıda.
- [x] Olay bazlı gün saati: level'da saat varsayılan olarak durur; gün / gece
      değişimi zamanlı bir geçiştir (süre parametreli), sonra saat yine durur
      (karar 8). Geçiş sırasında sky light / IBL yeniden yakalama sıklığı
      ölçülerek seçilir. (Forge'da `setHour` anlık atlıyordu.) *Adım 5:* sabit
      saat (`forge.worldEnvironment.hour`, gün uzunluğu yok). *Adım 7
      (2026-11-13):* `transitionTo` (`Promise<boolean>`, hep ileri), yakalama aynı
      PMREM'e, açı + 0,1 sn + durunca son yakalama; ölçüm `npm run
      measure:sky-capture`. Görsel kabul kapıda.
- [x] `RenderPipeline` + kalite profilleri (§2.4, karar 3). Profil tanımı S3'te
      (Faz 1). Post Process'te yansıma seçeneği `reflection: off | ssr`
      (kullanıcı kararı 2026-11-11); profil izin verir, zorla açmaz. MRT sınırı
      biçim sıkıştırmayla (karar 4). *Adım 2:* kalite merdiveni, uyarlamalı
      kalite, donanım ipuçları, kullanıcı ayarları ve WebGPU izin alanları
      (Cinematic dahil) hazır; `RenderPipeline`, MRT ve profil başına bayt testi
      adım 6'da. *Adım 6 (2026-11-13):* `forge.postProcess`, kalite kapısı, TSL
      pipeline, MRT testi ve cihaz sondası, çıktı dönüşümü; görsel kabul kapıda.
- [x] Level görüntüleyici: level.json → statik mesh'ler, şekiller, instancing,
      terrain salt çizimi (karar 1); runtime route'unda salt görüntüleme. HLOD
      5b'de (karar 9). *Adım 8 (2026-11-13):* otomatik instancing, TSL CDLOD
      terrain, varsayılan kamera, `?debug`, bütün çizen referans level'lar
      smoke'ta. Görsel kabul kapıda.
- [x] **Render regresyon smoke'u** (`npm run smoke:render`, Playwright, başlıklı
      Chrome, port 5283): kabul edilen referans pozlar yerelde, gerçek WebGPU
      backend'inde yeniden çekilip referans görüntüyle karşılaştırılır.
      *Adım 1:* iskele (`tests/smoke`, L03 × 1 poz); tam set adım 9'da.
      Kurallar: görüntü `page.screenshot({ clip })` ile alınır, hazır sinyali
      `data-forge-ready` (gizli doğan katmana bakılmaz), boş / siyah görüntü
      kontrolü zorunlu, `isWebGPUBackend` false ise koşu başarısız, backend
      kanıtı ve §2.10 alanları kayda yazılır. `render/**` ve
      `features/*/render.ts` dokunan push'lardan önce çalışır; gate'e ve CI'a
      girmez (GPU yok). Referans görüntüler depo dışında, kullanıcının
      kabulünden sonra güncellenir. *Adım 9 (2026-11-13):* tam set (15 çekim,
      Faz 0 pozu ve boyutu), `npm run smoke:grid`; referanslar kullanıcı
      kabulüyle yazıldı, karşılaştırma 15 / 15.
- [x] Kapı: referans sahnelerin statik içeriği, terrain'i ve çevresi, Faz 0
      görüntüleriyle yan yana; kullanıcının ilk görsel kabulü. Ertelenen Forge A
      kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred` `3`, 39:
      kalite profilleri / uyarlamalı kalite 13, asset perf 3, starter
      materyal 1, güneş kaskatları 9, takipli gölge 9, kullanıcı ayarları 4;
      GPU timer 1 D, karar 6). *Adım 4'ten sonra:* 39'un hepsi taşındı; kalan
      görsel kabul. **Geçti (2026-11-13):** `port:forge-tests` A 934 / 1.021,
      Faz 3'e ertelenmiş A yok; kullanıcının ilk görsel kabulü verildi (adım 9).
