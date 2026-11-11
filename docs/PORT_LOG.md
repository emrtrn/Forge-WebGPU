# Taşıma günlüğü

Forge WebGL'den (`C:\Users\emret\Desktop\Forge`, yalnız okunur) bu depoya ne
geldiğinin kaydı (plan §7). Üç bölüm:

1. **Özellik envanteri:** Forge'un kullanıcıya görünen özellikleri; her satırda
   hedef faz ya da "taşınmayacak" + gerekçe. Kapsama matrisinin paydasıdır.
   Faz 0'da doldurulur.
2. **Taşıma günlüğü:** taşınan her modül. Cut-over'da (`forge-webgl-final`,
   Faz 2b başı) başlar.
3. **Port bekleyenler:** cut-over'dan sonra Forge WebGL'de taşınmış bir modüle
   gelen hata düzeltmeleri.

## 1. Özellik envanteri

Kaynak: Forge `main` @ `b3fa0c1a` (2026-11-11). Cut-over'da
(`forge-webgl-final`) aradaki fark yeniden taranır.

Satır birimi kullanıcıya görünen bir özelliktir (panel, mod, editör, aktör /
bileşen / asset türü, runtime alt sistemi, araç); modül düzeyindeki kayıt
§2'dedir. Bölümler: A editör kabuğu ve paneller · B editör modları · C asset
editörleri · D aktör ve bileşen türleri · E asset türleri ve sidecar'lar ·
F runtime ve oyun çatısı · G render · H araçlar ve kapılar.

Sütunlar:

- **ID:** kalıcı; kapsama matrisinin anahtarı. Satır silinmez, "taşınmayacak"
  olur.
- **Faz:** hedef faz. `2a ✓` bu depoda kuruldu; `—` taşınmayacak (Not'ta
  gerekçe). `†` planda adı geçmeyen satır için önerilen fazdır, kullanıcı
  onayı bekler (bölüm sonundaki liste).
- **İşlem:** taşı (olduğu gibi) · uyarla (renderer / servis sınırı değişir) ·
  yeniden yaz (GLSL / WebGL → TSL / WebGPU) · yeniden tasarla (mimari rapora
  göre yeni model; algoritma korunur).
- **Forge testleri:** smoke spec adları (`tests/smoke/<ad>.spec.ts`) ve
  `e:` önekli engine test dosyaları. Kontrol bazında sayım 2b'deki test
  sınıflamasında yapılır.
- **WebGPU:** kapsama matrisi; Faz 3–8 boyunca dolar (boş = henüz yok).

### A. Editör kabuğu ve paneller

Paneller vanilla DOM olarak uyarlanır, redesign yok (K7); ilk iş UI kiti.

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-A01 | Editör kabuğu: menü, araç çubuğu (Save / Undo / Redo / Play), durum çubuğu, toast | `src/editor/EditorUi.ts` | 4 | uyarla | toolbar-layout, editor-authoring | `EditorUi` 5.402 satır; editör servislerine bölünür (D1, plan §2.2) | |
| INV-A02 | UI kiti: tasarım token'ları, ikonlar, parametre alanları (kaydırıcı + kutu, sınıra çek, TR ipucu) | `src/editor/{paramFields.ts,editorIcons.ts,editorUi.css}` | 4 | taşı | — | K7: Faz 4'ün ilk işi; şemadan üretilen Details de bunu kullanır | |
| INV-A03 | Viewport kamerası: serbest uçuş, Perspective / Top / Left / Front, odaklama | `editor/input/editorCamera*.ts` | 4 | uyarla | editor-viewport-panel | | |
| INV-A04 | Seçim ve picking: tıklama, çoklu seçim, seçim çerçevesi | `editor/core/selection*.ts`, `editor/render-three/scenePicker.ts`, `src/scene/editorSelectionOutline.ts` | 4 | yeniden yaz | editor-authoring | CPU raycast; çerçeve TRAA'dan sonra jitter'sız pass'te (plan Faz 4) | |
| INV-A05 | Transform gizmo: move / rotate / scale, world / local | `editor/gizmos/*` | 4 | uyarla | editor-viewport-panel | Forge'un kendi gizmo'su var; plan `TransformControls` diyor, Faz 4'te seçilir | |
| INV-A06 | Snap: move / rotate / scale adımı, zemine ve duvara yapıştırma | `editor/render-three/{floorSnap,wallSnap}.ts` | 4 | uyarla | editor-authoring | | |
| INV-A07 | Undo / redo, komut etiketleri | `editor/core/{history,commandLabels}.ts` | 2a ✓ / 4 | yeniden tasarla | editor-authoring | Model `src/core/edit`'te (2a); `TransactionService` Faz 4 | |
| INV-A08 | Düzenleme işlemleri: kopyala / kes / yapıştır / çoğalt / sil, grupla / çöz, ebeveyne bağla / çöz | `editor/core/hierarchy.ts`, `EditorUi.ts` | 4 | uyarla | editor-authoring, actor-identity | Çoğaltma yeni GUID verir (A1) | |
| INV-A09 | View mode (Lit / Wireframe), show flags | `editor/core/tools.ts`, `EditorUi.ts` | 4 | yeniden yaz | landscape-wireframe | | |
| INV-A10 | Grafik kalitesi menüsü | `EditorUi.ts` | 3 / 4 | yeniden yaz | editor-quality | Profiller Faz 3 (plan §2.4), menü Faz 4; adaptif kalite planı buraya devredildi (§3.1) | |
| INV-A11 | Add Actor menüsü: kategoriler, arama, sürükle-bırak önizlemesi | `EditorUi.buildAddActorEntries` | 4 | yeniden tasarla | add-actor-menu | Girişler özelliklerden `registerAddActorEntry` ile; giriş listesi D bölümünde | |
| INV-A12 | Outliner: hiyerarşi, filtre, arama, özet, hücre filtresi | `src/editor/panels/outliner/`, `editor/core/worldPartitionOutliner.ts` | 4 | uyarla | outliner | Sanallaştırılmış liste, 50.000 aktör (K7, mimari A1) | |
| INV-A13 | Details: genel bölümler (transform, bileşen ağacı, metadata, `spatiallyLoaded`, instance) | `panels/details/{transformRows,componentDetails,metadataDetails,spatiallyLoadedDetails,instanceDetails}.ts` | 4 | yeniden tasarla | details-panel | Şemadan form; form tanımı 2a'da (`src/core`, DOM'suz) | |
| INV-A14 | Details: özel aktör bölümleri | `panels/details/specialActorDetails.ts` | 4 | yeniden tasarla | details-panel | 2.397 satır; her özellik kendi şemasından, gerekirse kendi `editor.ts`'i (D1, D2) | |
| INV-A15 | Details: ortam (Sky Atmosphere, Height Fog, Cloud Layer, Reflection, Post Process, World Environment) | `panels/details/{environmentDetails,worldEnvironmentDetails}.ts` | 4 | yeniden tasarla | world-environment, wind-editor | Görünüm ayarı burada yapılır (plan Faz 4); render bağlaması Faz 3 | |
| INV-A16 | Details: materyal ataması, materyal önizlemesi | `panels/details/materialDetails.ts` | 4 | uyarla | details-panel | Materyal sistemi Faz 3 | |
| INV-A17 | Details: fizik ve çarpışma | `panels/details/{physicsDetails,collisionDetails}.ts` | 6 | uyarla | — | | |
| INV-A18 | Details: navigasyon | `panels/details/navigationDetails.ts` | 6 | uyarla | ai-navigation-volume | | |
| INV-A19 | Details: aktör değişkenleri | `panels/details/actorVariableDetails.ts` | 6 | yeniden tasarla | — | Değişken listesi şemadır (A7) | |
| INV-A20 | Details: su (göl, göl köpük bake, okyanus, nehir efektleri, temas köpüğü, su sistemi) | `panels/details/{lake*,ocean*,riverEffects*,waterContactFoam*,waterSystem*,waterTooltips}.ts` | 7 | uyarla | ocean-editor, terrain-lake-editor | | |
| INV-A21 | Details: su birikintisi (çamur, önizleme, yansıma, dalgacık, rüzgâr) | `panels/details/puddle*.ts` | 5a | uyarla | terrain-puddle, wet-mud | Plan 5a "su birikintisi" | |
| INV-A22 | Details: kırılma | `panels/details/fractureDetails.ts` | 8 | uyarla | fracture-editor | | |
| INV-A23 | Content Browser (Content Drawer): klasör ağacı, filtre, arama, küçük resim boyutu, geri / ileri, son klasör | `panels/content/contentPanel.ts`, `EditorUi.ts` | 4 | uyarla | content-drawer-redesign, content-drawer-state, content-loading | Motor içeriği ve paketler salt okunur görünür (2a depo düzeni) | |
| INV-A24 | Content Browser işlemleri: yeni asset (Level, Material, Particle, Script, Sound Cue, Dialogue Voice / Line, UI, AI alt menüsü), yeni klasör, yeniden adlandır, kes / yapıştır, yol kopyala, sil | `EditorUi.ts`, `tools/levelContentDelete.ts` | 4 | yeniden tasarla | content-transfer, content-new-ai | GUID referans; taşıma referans kırmaz; silmede ters referans (`planDelete` 2a) | |
| INV-A25 | Asset içe aktarma ve yeniden içe aktarma (GLB, doku, ses) | `EditorUi.ts` Import… / Reimport…, `vite.config.ts` uçları | 4 | yeniden tasarla | — | Tür + lisans + kaynak zorunlu meta (A10, D16) | |
| INV-A26 | Küçük resim üretimi | `src/editor/ThumbnailRenderer.ts` | 4 | yeniden yaz | content-drawer-redesign | | |
| INV-A27 | Level aç (Open Level…), varsayılan level | `EditorUi.ts` | 4 | uyarla | editor-authoring | Varsayılan level manifestte `startLevel` (2a) | |
| INV-A28 | Kaydet | `src/editor/{editorSaveCoordinator,layoutSaver}.ts` | 2a ✓ / 4 | yeniden tasarla | editor-authoring, e:editorSaveCoordinator | Kayıt servisi 2a'da; editör `SaveService` + yeniden yükle / karşılaştır Faz 4 | |
| INV-A29 | Play (runtime'ı yeni sekmede açar) | `EditorUi.ts` | 4 | yeniden tasarla | runtime-playflow | Kayıtsız Play: anlık görüntü, diske yazmaz (A6) | |
| INV-A30 | World Settings paneli | `panels/world/worldSettingsPanel.ts` | 4 | uyarla | wind-editor | | |
| INV-A31 | Klavye kısayolları | `editor/input/{bindings,keyboard}.ts` | 4 | taşı | — | | |
| INV-A32 | Oyunun editöre panel / editör eklemesi | `src/editor/gameEditorRegistry.ts` | 4 | yeniden tasarla | — | `@forge/editor-sdk` + `defineFeatureEditor` (mimari §4.3) | |

### B. Editör modları ve araçları

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-B01 | Landscape / World Terrain oluşturma (çok tile'lı dünya diyaloğu) | `EditorUi.addLandscape`, `src/editor/worldTerrainDialog.ts` | 5d | uyarla | terrain-create, terrain-world, terrain-multitile | Terrain verisi 5a | |
| INV-B02 | Terrain genişletme (tile ekleme) | `src/editor/worldTerrainExpandDialog.ts` | 5d | uyarla | terrain-expand, e:worldTerrainExpandSingle | | |
| INV-B03 | Sculpt: raise, lower, smooth, flatten (tıklanan yükseklik), noise, ramp, terrace, erosion | `engine/terrain/terrainSculpt.ts`, `engine/scene/landscapeBrush.ts`, `SceneApp` | 5d | uyarla | landscape-sculpt, landscape-sculpt-tools, landscape-sculpt-shift, landscape-erosion-visual, e:terrainEdit, e:terrainErosion, e:terraces | Algoritmalar 2b'de taşınır | |
| INV-B04 | Paint: katman boyama, silme, ağırlık yumuşatma, katman görüntüleme | `SceneApp`, `engine/scene/landscapeBrush.ts` | 5d | uyarla | landscape-paint, landscape-material-refresh | | |
| INV-B05 | Auto Paint (kurallı tek seferlik boyama) | `panels/details/landscapeAutoPaintDetails.ts`, `engine/terrain` | 5d | uyarla | landscape-auto-paint, e:terrainAutoPaint | | |
| INV-B06 | Landscape spline: çiz / düzenle, birleştir / kapat / dal, yumuşak eğri, bake, yol süslemeleri | `engine/scene/spline*.ts`, `panels/details/landscapeSplineSelection.ts` | 5d | uyarla | landscape-spline-bake, landscape-spline-chain, spline-point-edit, terrain-spline-editor, e:terrainSpline* | | |
| INV-B07 | Landscape su modu: nehir / göl yazımı, radyal köpük noktaları | `SceneApp` (`LandscapeEditMode` "water") | 7 | uyarla | terrain-water, terrain-lake-editor | | |
| INV-B08 | Heightmap içe / dışa aktarma | `engine/terrain` (heightmap PNG, import) | 5d | taşı | terrain-heightmap, e:heightmapPng, e:terrainImport | | |
| INV-B09 | Foliage Mode: select, lasso, paint, erase, single, fill, remove; yüzey filtreleri | `panels/foliage/foliagePanel.ts`, `engine/scene/foliagePaint.ts` | 5d | uyarla | foliage-type-save, foliage-cells | | |
| INV-B10 | Mesh Paint (yerleştirilmiş örneklere vertex color) | `src/editor/meshPaintStore.ts`, `engine/scene/meshPaint.ts` | 5d † | uyarla | — | Inspector'da ayrı sekme | |
| INV-B11 | World Partition paneli: hücre ızgarası, yükle / boşalt, residency | `panels/world/worldPartitionPanel.ts` | 5b | uyarla | world-partition-panel, world-partition-persistence, world-partition-residency | Editör de akışla çalışır (A11) | |
| INV-B12 | Editör terrain akışı (kamera çevresi tile'lar, düzenlenen tile sabit) | `editor/scene/keptTerrainTiles.ts` | 5a | uyarla | terrain-editor-streaming, e:keptTerrainTiles, e:terrainEditorStreaming | | |
| INV-B13 | World Builder penceresi: rastgele dünya, önizleme worker'ı | `panels/world/{randomWorldPanel,worldBuilderWindow}.ts` | 5d | uyarla | world-builder-random, e:randomWorld* | Algoritmalar ve CLI 2b; üretilen level Content Browser'da | |
| INV-B14 | Editörde nav önizlemesi (Recast) | `src/scene/editorRecastPreview.ts` | 6 | uyarla | e:editorRecastPreview | | |

### C. Asset editörleri

Planda asset editörlerinin adı tek tek geçmiyor; fazlar, ilgili alt sistemin
fazına göre önerildi (`†`).

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-C01 | Static Mesh editörü: önizleme, çarpışma şekilleri, materyal slotları, UVW, vertex color | `src/editor/StaticMeshEditor.ts`, `asset{Collision,MaterialSlots,Uvw,VertexColors}Store.ts` | 4 † | uyarla | — | Çarpışma çalışması Faz 6; sidecar'lar 2b içe aktarıcısında | |
| INV-C02 | Static Mesh editörü: Deformable parçaları | `src/editor/staticMeshDeformable*.ts` | 8 | uyarla | deformable-editor, deformable-parts | | |
| INV-C03 | Static Mesh editörü: Fracture (Voronoi bake, destek grafiği) | `src/editor/staticMeshFracture.ts` | 8 | uyarla | fracture-editor | | |
| INV-C04 | Skeletal Mesh editörü (Persona): iskelet, soketler | `src/editor/SkeletalMeshEditor.ts`, `assetSkeletonStore.ts` | 6 † | uyarla | — | Tek kabuk + mod değiştirici | |
| INV-C05 | Skeletal Mesh editörü: animasyon modu | `SkeletalMeshEditor.ts` | 6 † | uyarla | — | | |
| INV-C06 | Skeletal Mesh editörü: fizik modu (ragdoll gövdeleri) | `SkeletalMeshEditor.ts` | 6 † | uyarla | — | | |
| INV-C07 | Actor Script editörü: bileşen ağacı, Add Component, değişkenler, olay bağlamaları, sınıf varsayılanları, viewport | `src/editor/ActorScript{Editor,Viewport}.ts` | 4 / 6 † | yeniden tasarla | — | Prefab düzenleme Faz 4 (`forge.actorClass/1` 2a'da), script / olay Faz 6 | |
| INV-C08 | Material editörü: önayarlar, katman karışımı, anizotropi, UV tiling, ORM, maske, önizleme | `src/editor/MaterialEditor.ts`, `materialStore.ts` | 3 / 4 † | yeniden yaz | — | `ForgeMaterialDef` → node material Faz 3, editör Faz 4 | |
| INV-C09 | Particle Effect editörü: önayarlar, doku, SubUV flipbook, önizleme viewport'u | `src/editor/ParticleEffect{Editor,PreviewViewport}.ts` | 6 | yeniden yaz | — | VFX TSL'de (plan Faz 6) | |
| INV-C10 | Sound Cue editörü | `src/editor/SoundCueEditor.ts` | 6 † | uyarla | — | | |
| INV-C11 | Dialogue editörü: voice / line, altyazı | `src/editor/DialogueEditor.ts` | 6 † | uyarla | — | | |
| INV-C12 | Data Table editörü | `src/editor/DataTable{Editor,Layout}.ts` | 6 † | uyarla | — | | |
| INV-C13 | UI Widget editörü | `src/editor/UiWidgetEditor.ts` | 6 † | uyarla | — | Oyun UI'ı Faz 6 | |
| INV-C14 | Behavior Tree editörü (+ Blackboard) | `src/editor/BehaviorTreeEditor.ts` | 6 † | uyarla | behavior-tree-editor | | |
| INV-C15 | State Tree editörü | `src/editor/StateTreeEditor.ts` | 6 † | uyarla | state-tree-editor | | |
| INV-C16 | Vehicle Asset editörü: tekerlek ekle / çoğalt / aynala, süspansiyon, motor | `src/editor/VehicleAsset{Editor,EditorModel}.ts`, `vehicleComponentFields.ts` | 6 † | uyarla | vehicle-asset-editor, e:vehicleEditorFields | | |

### D. Aktör ve bileşen türleri

Forge level'ının türe özel dizileri (`RoomLayout`, D3) burada tek tip aktör +
şemalı bileşen modeline (A1) eşlenir: her satır bir özellik klasörü ve
bileşen türü olur. Eski level'lar 2b içe aktarıcısıyla çevrilir; Faz sütunu
türün çalışır hâle geldiği fazdır.

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-D01 | Statik mesh yerleşimi (asset + yerleşimler; gizli, kilitli, grup) | `RoomLayout.instances`, `engine/scene/placementIdentity.ts` | 3 | yeniden tasarla | actor-identity, e:placementIdentity | Her yerleşim bir aktör; instancing render katmanının işi (mimari §4.4) | |
| INV-D02 | Karakter yerleşimi | `RoomLayout.characters` | 6 | yeniden tasarla | runtime-locomotion | | |
| INV-D03 | Actor Script aktörü (sınıf örneği + override) | `RoomLayout.actors`, `engine/scene/actorInstance.ts` | 2a ✓ / 6 | yeniden tasarla | e:streamedActorState | Prefab + override modeli 2a'da; script çalışması Faz 6 | veri modeli (2a) |
| INV-D04 | Işıklar: directional, point, spot | `RoomLayout.lights`, `engine/scene/lights.ts` | 3 | yeniden tasarla | actor-lights, sun-cascaded-shadows, e:sunCascade* | | |
| INV-D05 | Basit şekiller: küp, küre, silindir, koni, düzlem | `engine/scene/shapes.ts` | 3 | yeniden tasarla | add-actor-menu | Şekil mesh'leri `content/engine/`'e (A9) | |
| INV-D06 | Blocking Volume: kutu / silindir / koni / küre, oyunda görünür seçeneği | `RoomLayout.blockingVolumes`, `engine/scene/blockingVolume.ts` | 6 | yeniden tasarla | — | | |
| INV-D07 | AI Navigation Volume | `RoomLayout.aiNavigationVolumes` | 6 | yeniden tasarla | ai-navigation-volume, ai-navigation-clearance | | |
| INV-D08 | Sky Atmosphere (tekil) | `RoomLayout.skyAtmosphere` | 3 | yeniden tasarla | world-environment | | |
| INV-D09 | Exponential Height Fog (tekil) | `RoomLayout.heightFog`, `engine/scene/heightFog.ts` | 2a ✓ / 3 | yeniden tasarla | fog-fit-view-distance, e:heightFog | İskeletin kabul özelliği: şema, form, runtime 2a'da; render bağlaması Faz 3 | şema + runtime (2a) |
| INV-D10 | Cloud Layer (tekil) | `RoomLayout.cloudLayer` | 3 | yeniden tasarla | — | | |
| INV-D11 | Reflection Environment / Sky Light yakalama (tekil) | `RoomLayout.reflection` | 3 | yeniden tasarla | sky-light-capture | PMREM; gün saati geçişinde yeniden yakalama (plan Faz 3) | |
| INV-D12 | Sphere Reflection Capture | `RoomLayout.reflectionCaptures` | 3 | yeniden tasarla | reflection-capture | | |
| INV-D13 | Mirror Plane (planar yansıma) | `RoomLayout.reflectionPlanes` | 7 | yeniden tasarla | — | `reflector()` (plan Faz 7) | |
| INV-D14 | Reflective Surface (dokulu parlak düzlem) | `RoomLayout.reflectiveSurfaces` | 7 | yeniden tasarla | — | | |
| INV-D15 | Post Process (tekil) | `RoomLayout.postProcess` | 3 | yeniden tasarla | — | Tek `RenderPipeline` + kalite profilleri (plan §2.4) | |
| INV-D16 | World Environment (WES): mevsim, hava, gün saati, ay, yıldızlar | `RoomLayout.worldEnvironment`, `engine/environment` | 3 | yeniden tasarla | world-environment, world-environment-moon, world-environment-moon-halo, world-environment-night, world-environment-stars, e:worldEnvironment | Olay bazlı gün saati (plan Faz 3) | |
| INV-D17 | World Settings: arka plan, ortam ışığı, gölge varsayılanları, yerçekimi, kill Z, rüzgâr, view distance, game mode, partition | `RoomLayout.worldSettings` | 2a ✓ / 3 / 6 | yeniden tasarla | wind-editor, e:viewDistance | 2a'da yalnız `settings.cellSize`; kalan alanlar ilgili fazda level ayarına ya da tekil bileşene | |
| INV-D18 | Landscape aktörü (terrain tile'ları) | `RoomLayout.landscapes`, `engine/scene/landscape.ts` | 5a | yeniden tasarla | terrain-renderer, terrain-surface, e:terrain* | | |
| INV-D19 | Nehir | `RoomLayout.riverWaters`, `engine/scene/riverWater.ts` | 7 | yeniden tasarla | river-planar, river-water-optics, river-caustic-flow, e:terrainRiverWater | | |
| INV-D20 | Göl (su kütlesi) | `RoomLayout.waterBodies`, `engine/scene/waterBody.ts` | 7 | yeniden tasarla | lake-underwater, terrain-water-runtime, e:terrainLakeWater | | |
| INV-D21 | Su birikintisi | `RoomLayout.puddleWaters`, `engine/scene/puddleWater.ts` | 5a | yeniden tasarla | terrain-puddle, puddle-deformation, e:terrainPuddle | | |
| INV-D22 | Okyanus | `RoomLayout.oceanWaters`, `engine/scene/oceanWater.ts` | 7 | yeniden tasarla | ocean-atlas, ocean-caustics, ocean-inlets, ocean-planar, ocean-reference, ocean-shallow-profile, e:oceanWater | FFT compute'a (plan Faz 7) | |
| INV-D23 | Ambient Sound | Add Actor → Sounds | 6 | yeniden tasarla | — | | |
| INV-D24 | World Widget (dünyada UI) | `RoomLayout.worldWidgets` | 6 | yeniden tasarla | — | | |
| INV-D25 | Player Start | Add Actor → Gameplay | 6 | yeniden tasarla | runtime-playflow | `samples/starter`'da bileşensiz bir "Player Start" aktörü var; bileşeni Faz 6'da | |
| INV-D26 | Target Point | `RoomLayout.targetPoints` | 6 | yeniden tasarla | target-point | | |
| INV-D27 | Spline aktörü (oynanış yolu) | `RoomLayout.splines`, `engine/scene/splineActor.ts` | 6 | yeniden tasarla | — | Landscape spline'ı ayrı (INV-B06) | |
| INV-D28 | Araç aktörleri (Vehicle bileşenli sınıflar) | Add Actor → Vehicles | 6 | yeniden tasarla | vehicle, doruk-k180 | Araç sınıfları proje içeriği | |
| INV-D29 | Foliage örnekleri (hücre başına kompakt diziler) | `*.foliage.json`, `src/scene/foliageCell*.ts` | 5c | yeniden tasarla | foliage-cells, e:foliageCell* | Kompakt dizi, aktör değil (mimari §4.4) | |
| INV-D30 | Prosedürel foliage: halka, ground cover | `engine/scene/proceduralFoliage.ts`, `src/scene/proceduralFoliageRing.ts` | 5c | uyarla | e:proceduralFoliage, e:foliageRing, e:groundCover | | |
| INV-D31 | HLOD proxy'leri | `src/scene/hlodProxies.ts` | 5b | yeniden yaz | hlod, e:hlod | | |
| INV-D32 | Dünya hücreleri | `RoomLayout.worldCells`, `*.cell.json` | 2a ✓ / 5b | yeniden tasarla | world-partition-streaming, world-partition-statics, e:worldPartition* | Hücre veri modeli 2a'da (A11); akış 5b | veri modeli (2a) |
| INV-D33 | Yükleme grupları (`loadGroups`) | `RoomLayout.loadGroups`, `engine/assets/manifest.ts` | — † | taşınmaz | — | Asset yükleme gruplarının bayt toplamı; hücre akışıyla yer değiştirir (öneri) | |
| INV-D40 | Static Mesh bileşeni | `StaticMeshComponent` | 3 | yeniden tasarla | — | | |
| INV-D41 | Skeletal Mesh bileşeni | `SkeletalMeshComponent` | 6 | yeniden tasarla | e:skeletalAnimationModule | | |
| INV-D42 | MeshRenderer (eski tek mesh bileşeni) | `MeshRenderer` | — | taşınmaz | — | İçe aktarıcı Static / Skeletal Mesh'e çevirir (D11) | |
| INV-D43 | Collider | `ColliderComponent` | 6 | yeniden tasarla | e:physicsContacts | | |
| INV-D44 | Audio | `AudioComponent` | 6 | yeniden tasarla | e:audioModule | | |
| INV-D45 | Particle Emitter | `ParticleEmitterComponent` | 6 | yeniden tasarla | e:vfxModule | | |
| INV-D46 | Light (sınıf içinde ışık) | `LightComponent` | 3 | yeniden tasarla | actor-lights | | |
| INV-D47 | Interaction | `InteractionComponent` | 6 | yeniden tasarla | — | | |
| INV-D48 | Behavior + olay / mesaj bağlamaları, script arayüzleri, referanslar, dispatcher'lar | `Behavior`, `EventBindings`, `MessageBindings`, `Script*` bileşenleri | 6 | yeniden tasarla | runtime-script-message, e:behaviorSubsystem | Tipsiz `flags` torbası yok (A7) | |
| INV-D49 | Character Movement | `CharacterMovementComponent` | 6 | yeniden tasarla | runtime-locomotion, e:characterMovementModule | Kapsül ölçüsünün tek kaynağı (D8) | |
| INV-D50 | Spline Path Follower | `SplinePathFollowerComponent` | 6 | yeniden tasarla | — | | |
| INV-D51 | Moving Platform | `MovingPlatformComponent` | 6 | yeniden tasarla | — | | |
| INV-D52 | Spring Arm | `SpringArmComponent` | 6 | yeniden tasarla | — | | |
| INV-D53 | Camera | `CameraComponent` | 6 | yeniden tasarla | e:cameraFarOverride | | |
| INV-D54 | AI Controller (algı dahil) | `AIControllerComponent` | 6 | yeniden tasarla | ai-patrol, e:aiModule | | |
| INV-D55 | Smart Object | `SmartObjectComponent` | 6 | yeniden tasarla | — | | |
| INV-D56 | Vehicle | `Vehicle` bileşeni | 6 | yeniden tasarla | vehicle, e:vehicleRuntime, e:vehicleDrivetrain | | |
| INV-D57 | Vehicle AI Driver | `VehicleAiDriverComponent` | 6 | yeniden tasarla | e:vehicleAi | | |
| INV-D58 | Fracturable | `FracturableComponent` | 8 | yeniden tasarla | fracture-runtime, e:fracture* | | |
| INV-D59 | Deformable | `DeformableComponent` | 8 | yeniden tasarla | deformable-runtime, e:deformable* | | |
| INV-D60 | Metadata (şemalı özel alanlar) | `MetadataComponent`, `engine/scene/metadataSchema.ts` | 2a ✓ | yeniden tasarla | — | Şema DSL'i bunun genellemesi (mimari §4.5) | şema DSL'i (2a) |

### E. Asset türleri ve sidecar'lar

Her tür 2b içe aktarıcısından geçer (çevrilemeyen alan raporlanır); ikili veri
olduğu gibi kalır, yanına `*.meta.json` gelir (A10). Faz sütunu türün
kaydedildiği / kullanıldığı fazdır.

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-E01 | Level | `*.level.json`, `public/layouts/` | 2a ✓ | yeniden tasarla | e:sceneCheck, e:serializationDrift | `forge.level/1` level klasörü | veri modeli (2a) |
| INV-E02 | Dünya hücresi dosyası | `*.cell.json` | 2a ✓ | yeniden tasarla | world-partition-persistence, e:worldCellPersistence | `cells/<x>_<z>.json` + `cells.json` | veri modeli (2a) |
| INV-E03 | Proje manifesti | `public/project.3dgame.json` | 2a ✓ | yeniden tasarla | — | `forge.project.json` (`forge.project/1`) | manifest (2a) |
| INV-E04 | Asset manifesti: tür, yerleşim kuralları, runtime ayarları (gölge, çarpışma, bayt) | `public/assets/manifest.json`, `engine/assets/manifest.ts` | 2a ✓ / 2b | yeniden tasarla | e:buildManifestParity | Kimlik meta'da, dizin üretilen önbellek (A10); yerleşim kuralları ve runtime ayarlarının yeni yeri içe aktarıcıda belirlenir | kimlik + dizin (2a) |
| INV-E05 | Aktör sınıfı (prefab) | `*.actor.json` | 2a ✓ | yeniden tasarla | — | `forge.actorClass/1` | veri modeli (2a) |
| INV-E06 | Static mesh (GLB) | `*.glb` | 3 | uyarla | — | | |
| INV-E07 | Skeletal mesh (GLB) + iskelet | `*.glb`, `*.skeleton.json` | 6 | uyarla | — | | |
| INV-E08 | Doku | `*.png`, `*.jpg`, `*.webp` | 3 | uyarla | — | KTX2 Faz 3 | |
| INV-E09 | Materyal | `*.material.json`, `engine/assets/material.ts` | 3 | yeniden tasarla | — | `ForgeMaterialDef` → node material | |
| INV-E10 | Materyal slotları | `*.materials.json` | 3 | yeniden tasarla | — | | |
| INV-E11 | UVW projeksiyonu | `*.uvw.json` | 3 † | yeniden tasarla | — | | |
| INV-E12 | Asset vertex color | `*.vertexcolors.json` | 3 † | yeniden tasarla | — | | |
| INV-E13 | Çarpışma şekilleri | `*.collision.json` | 6 | yeniden tasarla | — | | |
| INV-E14 | Ses dosyası | `*.wav`, `*.ogg`, `engine/assets/audio.ts` | 6 | uyarla | — | | |
| INV-E15 | Sound Cue | `*.soundcue.json` | 6 | yeniden tasarla | — | | |
| INV-E16 | Diyalog: voice, line, conversation; yerelleştirme tablosu | `*.dialoguevoice.json`, `*.dialogue.json`, `*.conversation.json`, `*.loc.json` | 6 | yeniden tasarla | e:dialogueModule | | |
| INV-E17 | AI: Blackboard, Behavior Tree, EQS sorgusu, State Tree | `*.blackboard.json`, `*.behavior.json`, `*.query.json`, `*.stateTree.json` | 6 | yeniden tasarla | behavior-tree-editor, state-tree-editor, content-new-ai | | |
| INV-E18 | Animasyon | asset türü `animation` | 6 | uyarla | e:skeletalAnimationModule | | |
| INV-E19 | Efekt (partikül) | `*.effect.json` | 6 | yeniden tasarla | e:vfxModule | | |
| INV-E20 | Araç | `*.vehicle.json` | 6 | yeniden tasarla | vehicle-asset-editor, e:vehicleAssets | | |
| INV-E21 | Foliage Type | `*.foliagetype.json` | 5c | yeniden tasarla | foliage-type-save | | |
| INV-E22 | UI widget; data table | `*.ui.json`, data table JSON (`/__save-gamedata`) | 6 | yeniden tasarla | e:uiFramework | | |
| INV-E23 | Fracture | `*.fracture.json` | 8 | yeniden tasarla | e:fractureAsset | | |
| INV-E24 | Deformable | `*.deformable.json` | 8 | yeniden tasarla | e:deformableAsset | | |
| INV-E25 | Terrain: belge, tile'lar, global harita | `*.terrain.json`, `*.tile.bin`, `*.global.bin` | 5a | uyarla | terrain-endpoints, e:terrainDocument, e:terrainGlobalMapFile | İkili tile'lar olduğu gibi (plan §2.7) | |
| INV-E26 | Mesh paint verisi | `<level>.meshpaint.json` | 5d † | yeniden tasarla | — | INV-B10 ile | |
| INV-E27 | World Builder girdileri: recipe, world brief, ground cover, referans görsel | `*.worldrecipe.json`, `*.worldbrief.json`, `*.cover.json`, `*.reference.png` | 2b | uyarla | world-brief, e:worldRecipe, e:worldBrief* | Recipe ve referans görsel level'ın yanında (plan 2b) | |
| INV-E28 | Bölge profili | `*.regionprofile.json` | 2b | uyarla | e:regionProfile | Oyun verisi; motor deposuna girmez, türü motorda (plan 2b) | |
| INV-E29 | Eski `model` asset türü | `LegacyAssetType` | — | taşınmaz | — | İçe aktarıcı güncel türe çevirir | |

## 2. Taşıma günlüğü

Forge SHA: _(cut-over'da `forge-webgl-final`)_.

| Modül | Kaynak yol | Forge SHA | İşlem | Testler | Durum |
|---|---|---|---|---|---|

İşlem: taşındı / uyarlandı / yeniden yazıldı. Testler: taşınan / yeniden yazılan
/ düşen sayısı (2b test sınıflamasına göre).

## 3. Port bekleyenler

| Tarih | Forge commit | Modül | Ne | Durum |
|---|---|---|---|---|
