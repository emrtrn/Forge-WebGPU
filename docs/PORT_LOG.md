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
(`forge-webgl-final` = `04b5fb23`) aradaki fark yeniden tarandı: yalnız
`spikes/webgpu/` (Faz 1 spike'ı) ve bakım modu notu; yeni özellik yok,
envanter değişmedi.

Satır birimi kullanıcıya görünen bir özelliktir (panel, mod, editör, aktör /
bileşen / asset türü, runtime alt sistemi, araç); modül düzeyindeki kayıt
§2'dedir. Bölümler: A editör kabuğu ve paneller · B editör modları · C asset
editörleri · D aktör ve bileşen türleri · E asset türleri ve sidecar'lar ·
F runtime ve oyun çatısı · G render · H araçlar ve kapılar.

Sütunlar:

- **ID:** kalıcı; kapsama matrisinin anahtarı. Satır silinmez, "taşınmayacak"
  olur.
- **Faz:** hedef faz. `2a ✓` bu depoda kuruldu; `—` taşınmayacak (Not'ta
  gerekçe). Planda adı geçmeyen satırların fazı önerildi ve kullanıcı
  onayladı (2026-11-11; bölüm sonundaki liste). Sonradan eklenen satırın
  fazı da onaydan geçer.
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
| INV-A24 | Content Browser işlemleri: yeni asset (Level, Material, Particle, Script, Sound Cue, Dialogue Voice / Line, UI, AI alt menüsü), yeni klasör, yeniden adlandır, kes / yapıştır, yol kopyala, sil | `EditorUi.ts`, `tools/levelContentDelete.ts` | 4 | yeniden tasarla | content-transfer, content-new-ai | GUID referans; taşıma referans kırmaz; silmede ters referans (`planDelete` 2a). Sound Cue, Dialogue ve AI alt menüleri K12 ile düşer | |
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
| INV-B10 | Mesh Paint (yerleştirilmiş örneklere vertex color) | `src/editor/meshPaintStore.ts`, `engine/scene/meshPaint.ts` | 5d | uyarla | — | Inspector'da ayrı sekme | |
| INV-B11 | World Partition paneli: hücre ızgarası, yükle / boşalt, residency | `panels/world/worldPartitionPanel.ts` | 5b | uyarla | world-partition-panel, world-partition-persistence, world-partition-residency | Editör de akışla çalışır (A11) | |
| INV-B12 | Editör terrain akışı (kamera çevresi tile'lar, düzenlenen tile sabit) | `editor/scene/keptTerrainTiles.ts` | 5a | uyarla | terrain-editor-streaming, e:keptTerrainTiles, e:terrainEditorStreaming | | |
| INV-B13 | World Builder penceresi: rastgele dünya, önizleme worker'ı | `panels/world/{randomWorldPanel,worldBuilderWindow}.ts` | 5d | uyarla | world-builder-random, e:randomWorld* | Algoritmalar ve CLI 2b; üretilen level Content Browser'da | |
| INV-B14 | Editörde nav önizlemesi (Recast) | `src/scene/editorRecastPreview.ts` | 6 | uyarla | e:editorRecastPreview | | |

### C. Asset editörleri

Planda asset editörlerinin adı tek tek geçmiyor; fazlar, ilgili alt sistemin
fazına göre verildi (onaylandı 2026-11-11).

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-C01 | Static Mesh editörü: önizleme, çarpışma şekilleri, materyal slotları, UVW, vertex color | `src/editor/StaticMeshEditor.ts`, `asset{Collision,MaterialSlots,Uvw,VertexColors}Store.ts` | 4 | uyarla | — | Çarpışma çalışması Faz 6; sidecar'lar 2b içe aktarıcısında | |
| INV-C02 | Static Mesh editörü: Deformable parçaları | `src/editor/staticMeshDeformable*.ts` | 8 | uyarla | deformable-editor, deformable-parts | | |
| INV-C03 | Static Mesh editörü: Fracture (Voronoi bake, destek grafiği) | `src/editor/staticMeshFracture.ts` | 8 | uyarla | fracture-editor | | |
| INV-C04 | Skeletal Mesh editörü (Persona): iskelet, soketler | `src/editor/SkeletalMeshEditor.ts`, `assetSkeletonStore.ts` | 6 | uyarla | — | Tek kabuk + mod değiştirici | |
| INV-C05 | Skeletal Mesh editörü: animasyon modu | `SkeletalMeshEditor.ts` | 6 | uyarla | — | | |
| INV-C06 | Skeletal Mesh editörü: fizik modu (ragdoll gövdeleri) | `SkeletalMeshEditor.ts` | 6 | uyarla | — | | |
| INV-C07 | Actor Script editörü: bileşen ağacı, Add Component, değişkenler, olay bağlamaları, sınıf varsayılanları, viewport | `src/editor/ActorScript{Editor,Viewport}.ts` | 4 | yeniden tasarla | — | Yalnız prefab: bileşen ağacı, Add Component, sınıf varsayılanları, viewport (`forge.actorClass/1` 2a'da). Değişkenler ve olay bağlamaları taşınmaz (K12) | |
| INV-C08 | Material editörü: önayarlar, katman karışımı, anizotropi, UV tiling, ORM, maske, önizleme | `src/editor/MaterialEditor.ts`, `materialStore.ts` | 3 / 4 | yeniden yaz | — | `ForgeMaterialDef` → node material Faz 3, editör Faz 4 | |
| INV-C09 | Particle Effect editörü: önayarlar, doku, SubUV flipbook, önizleme viewport'u | `src/editor/ParticleEffect{Editor,PreviewViewport}.ts` | 6 | yeniden yaz | — | VFX TSL'de (plan Faz 6) | |
| INV-C10 | Sound Cue editörü | `src/editor/SoundCueEditor.ts` | — | taşınmaz | — | K12: ses ayarları oyunun şemalı verisi, genel veri editöründe (A13) | |
| INV-C11 | Dialogue editörü: voice / line, altyazı | `src/editor/DialogueEditor.ts` | — | taşınmaz | — | K12: diyalog taşınmaz | |
| INV-C12 | Data Table editörü | `src/editor/DataTable{Editor,Layout}.ts` | 4 | yeniden tasarla | — | Genel şema güdümlü veri editörü (mimari A13); oyuna özel düzenleme arayüzü yok | |
| INV-C13 | UI Widget editörü | `src/editor/UiWidgetEditor.ts` | 6 (açık) | uyarla | — | K12: Faz 6 başında kullanıcı kararı; o güne kadar widget'lar şemalı JSON | |
| INV-C14 | Behavior Tree editörü (+ Blackboard) | `src/editor/BehaviorTreeEditor.ts` | — | taşınmaz | behavior-tree-editor | K12: AI mantığı oyun kodunda | |
| INV-C15 | State Tree editörü | `src/editor/StateTreeEditor.ts` | — | taşınmaz | state-tree-editor | K12: AI mantığı oyun kodunda | |
| INV-C16 | Vehicle Asset editörü: tekerlek ekle / çoğalt / aynala, süspansiyon, motor | `src/editor/VehicleAsset{Editor,EditorModel}.ts`, `vehicleComponentFields.ts` | 6 | uyarla | vehicle-asset-editor, e:vehicleEditorFields | | |

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
| INV-D05 | Basit şekiller: küp, küre, silindir, koni, düzlem | `engine/scene/shapes.ts` | 3 | yeniden tasarla | add-actor-menu | Şekil mesh'leri prosedürel geometri, asset değil (Faz 3 kararı 2026-11-12; Forge'un `shape:` kaynağı gibi) | |
| INV-D06 | Blocking Volume: kutu / silindir / koni / küre, oyunda görünür seçeneği | `RoomLayout.blockingVolumes`, `engine/scene/blockingVolume.ts` | 6 | yeniden tasarla | — | | |
| INV-D07 | AI Navigation Volume | `RoomLayout.aiNavigationVolumes` | 6 | yeniden tasarla | ai-navigation-volume, ai-navigation-clearance | | |
| INV-D08 | Sky Atmosphere (tekil) | `RoomLayout.skyAtmosphere` | 3 | yeniden tasarla | world-environment | | |
| INV-D09 | Exponential Height Fog (tekil) | `RoomLayout.heightFog`, `engine/scene/heightFog.ts` | 2a ✓ / 3 | yeniden tasarla | fog-fit-view-distance, e:heightFog | İskeletin kabul özelliği: şema, form, runtime 2a'da; render bağlaması Faz 3 | şema + runtime (2a) |
| INV-D10 | Cloud Layer (tekil) | `RoomLayout.cloudLayer` | 3 | yeniden tasarla | — | | |
| INV-D11 | Reflection Environment / Sky Light yakalama (tekil) | `RoomLayout.reflection` | 3 | yeniden tasarla | sky-light-capture | PMREM; gün saati geçişinde yeniden yakalama (plan Faz 3) | |
| INV-D12 | Sphere Reflection Capture | `RoomLayout.reflectionCaptures` | — | taşınmaz | reflection-capture | Kullanıcı kararı 2026-11-11: genel yansıma SSR (Post Process `reflection: off \| ssr`), düz yüzeyler planar (INV-D13, D14). İçe aktarıcı `reflectionCaptures`'ı raporlayarak düşürür (§2.7) | |
| INV-D13 | Mirror Plane (planar yansıma) | `RoomLayout.reflectionPlanes` | 7 | yeniden tasarla | — | `reflector()` (plan Faz 7) | |
| INV-D14 | Reflective Surface (dokulu parlak düzlem) | `RoomLayout.reflectiveSurfaces` | 7 | yeniden tasarla | — | | |
| INV-D15 | Post Process (tekil) | `RoomLayout.postProcess` | 3 | yeniden tasarla | — | Tek `RenderPipeline` + kalite profilleri (plan §2.4) | |
| INV-D16 | World Environment (WES): mevsim, hava, gün saati, ay, yıldızlar | `RoomLayout.worldEnvironment`, `engine/environment` | 3 | yeniden tasarla | world-environment, world-environment-moon, world-environment-moon-halo, world-environment-night, world-environment-stars, e:worldEnvironment | Olay bazlı gün saati (plan Faz 3) | |
| INV-D17 | World Settings: arka plan, ortam ışığı, gölge varsayılanları, yerçekimi, kill Z, rüzgâr, view distance, game mode, partition | `RoomLayout.worldSettings` | 2a ✓ / 3 / 6 | yeniden tasarla | wind-editor, e:viewDistance | 2a'da yalnız `settings.cellSize`; kalan alanlar sahibi özelliğin tekil bileşenine (Faz 3 kararı 2026-11-12, tek `forge.worldSettings` yok): render alanları Faz 3, view distance 5b, rüzgâr 5c, yerçekimi / kill Z / game mode 6 | |
| INV-D18 | Landscape aktörü (terrain tile'ları) | `RoomLayout.landscapes`, `engine/scene/landscape.ts` | 5a | yeniden tasarla | terrain-renderer, terrain-surface, e:terrain* | | |
| INV-D19 | Nehir | `RoomLayout.riverWaters`, `engine/scene/riverWater.ts` | 7 | yeniden tasarla | river-planar, river-water-optics, river-caustic-flow, e:terrainRiverWater | | |
| INV-D20 | Göl (su kütlesi) | `RoomLayout.waterBodies`, `engine/scene/waterBody.ts` | 7 | yeniden tasarla | lake-underwater, terrain-water-runtime, e:terrainLakeWater | | |
| INV-D21 | Su birikintisi | `RoomLayout.puddleWaters`, `engine/scene/puddleWater.ts` | 5a | yeniden tasarla | terrain-puddle, puddle-deformation, e:terrainPuddle | | |
| INV-D22 | Okyanus | `RoomLayout.oceanWaters`, `engine/scene/oceanWater.ts` | 7 | yeniden tasarla | ocean-atlas, ocean-caustics, ocean-inlets, ocean-planar, ocean-reference, ocean-shallow-profile, e:oceanWater | FFT compute'a (plan Faz 7) | |
| INV-D23 | Ambient Sound | Add Actor → Sounds | — | taşınmaz | — | K12: ses koddan ve şemalı olay tablosundan çalınır | |
| INV-D24 | World Widget (dünyada UI) | `RoomLayout.worldWidgets` | 6 | yeniden tasarla | — | | |
| INV-D25 | Player Start | Add Actor → Gameplay | 6 | yeniden tasarla | runtime-playflow | K12: taşınır. `samples/starter`'da bileşensiz bir "Player Start" aktörü var; bileşeni Faz 6'da | |
| INV-D26 | Target Point | `RoomLayout.targetPoints` | 6 | yeniden tasarla | target-point | | |
| INV-D27 | Spline aktörü (oynanış yolu) | `RoomLayout.splines`, `engine/scene/splineActor.ts` | 6 | yeniden tasarla | — | Landscape spline'ı ayrı (INV-B06) | |
| INV-D28 | Araç aktörleri (Vehicle bileşenli sınıflar) | Add Actor → Vehicles | 6 | yeniden tasarla | vehicle, doruk-k180 | Araç sınıfları proje içeriği | |
| INV-D29 | Foliage örnekleri (hücre başına kompakt diziler) | `*.foliage.json`, `src/scene/foliageCell*.ts` | 5c | yeniden tasarla | foliage-cells, e:foliageCell* | Kompakt dizi, aktör değil (mimari §4.4) | |
| INV-D30 | Prosedürel foliage: halka, ground cover | `engine/scene/proceduralFoliage.ts`, `src/scene/proceduralFoliageRing.ts` | 5c | uyarla | e:proceduralFoliage, e:foliageRing, e:groundCover | | |
| INV-D31 | HLOD proxy'leri | `src/scene/hlodProxies.ts` | 5b | yeniden yaz | hlod, e:hlod | | |
| INV-D32 | Dünya hücreleri | `RoomLayout.worldCells`, `*.cell.json` | 2a ✓ / 5b | yeniden tasarla | world-partition-streaming, world-partition-statics, e:worldPartition* | Hücre veri modeli 2a'da (A11); akış 5b | veri modeli (2a) |
| INV-D33 | Yükleme grupları (`loadGroups`) | `RoomLayout.loadGroups`, `engine/assets/manifest.ts` | — | taşınmaz | — | Asset yükleme gruplarının bayt toplamı; hücre akışıyla yer değiştirir (öneri) | |
| INV-D40 | Static Mesh bileşeni | `StaticMeshComponent` | 3 | yeniden tasarla | — | | |
| INV-D41 | Skeletal Mesh bileşeni | `SkeletalMeshComponent` | 6 | yeniden tasarla | e:skeletalAnimationModule | | |
| INV-D42 | MeshRenderer (eski tek mesh bileşeni) | `MeshRenderer` | — | taşınmaz | — | İçe aktarıcı Static / Skeletal Mesh'e çevirir (D11) | |
| INV-D43 | Collider | `ColliderComponent` | 6 | yeniden tasarla | e:physicsContacts | | |
| INV-D44 | Audio | `AudioComponent` | — | taşınmaz | e:audioModule | K12: ses koddan ve şemalı olay tablosundan çalınır | |
| INV-D45 | Particle Emitter | `ParticleEmitterComponent` | 6 | yeniden tasarla | e:vfxModule | | |
| INV-D46 | Light (sınıf içinde ışık) | `LightComponent` | 3 | yeniden tasarla | actor-lights | | |
| INV-D47 | Interaction | `InteractionComponent` | 6 | yeniden tasarla | — | | |
| INV-D48 | Behavior + olay / mesaj bağlamaları, script arayüzleri, referanslar, dispatcher'lar | `Behavior`, `EventBindings`, `MessageBindings`, `Script*` bileşenleri | 6 | yeniden tasarla | runtime-script-message, e:behaviorSubsystem | Yalnız koddan kayıtlı davranış ve script mesajları; olay / mesaj bağlamaları, arayüz, referans, dispatcher taşınmaz (K12). Tipsiz `flags` torbası yok (A7) | |
| INV-D49 | Character Movement | `CharacterMovementComponent` | 6 | yeniden tasarla | runtime-locomotion, e:characterMovementModule | Kapsül ölçüsünün tek kaynağı (D8) | |
| INV-D50 | Spline Path Follower | `SplinePathFollowerComponent` | — | taşınmaz | — | K12: oyuna özgü | |
| INV-D51 | Moving Platform | `MovingPlatformComponent` | — | taşınmaz | — | K12: oyuna özgü | |
| INV-D52 | Spring Arm | `SpringArmComponent` | 6 | yeniden tasarla | — | | |
| INV-D53 | Camera | `CameraComponent` | 6 | yeniden tasarla | e:cameraFarOverride | | |
| INV-D54 | AI Controller (algı dahil) | `AIControllerComponent` | — | taşınmaz | ai-patrol, e:aiModule | K12: AI controller oyun kodunda; algı INV-F15'te | |
| INV-D55 | Smart Object | `SmartObjectComponent` | — | taşınmaz | — | K12: AI yazım yığını taşınmaz | |
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
| INV-E11 | UVW projeksiyonu | `*.uvw.json` | 3 | yeniden tasarla | — | | |
| INV-E12 | Asset vertex color | `*.vertexcolors.json` | 3 | yeniden tasarla | — | | |
| INV-E13 | Çarpışma şekilleri | `*.collision.json` | 6 | yeniden tasarla | — | | |
| INV-E14 | Ses dosyası | `*.wav`, `*.ogg`, `engine/assets/audio.ts` | 6 | uyarla | — | | |
| INV-E15 | Sound Cue | `*.soundcue.json` | — | taşınmaz | — | K12: ses ayarları oyunun şemalı verisi (A13) | |
| INV-E16 | Diyalog: voice, line, conversation; yerelleştirme tablosu | `*.dialoguevoice.json`, `*.dialogue.json`, `*.conversation.json`, `*.loc.json` | — | taşınmaz | e:dialogueModule | K12: diyalog taşınmaz | |
| INV-E17 | AI: Blackboard, Behavior Tree, EQS sorgusu, State Tree | `*.blackboard.json`, `*.behavior.json`, `*.query.json`, `*.stateTree.json` | — | taşınmaz | behavior-tree-editor, state-tree-editor, content-new-ai | K12: AI yazım yığını taşınmaz | |
| INV-E18 | Animasyon | asset türü `animation` | 6 | uyarla | e:skeletalAnimationModule | | |
| INV-E19 | Efekt (partikül) | `*.effect.json` | 6 | yeniden tasarla | e:vfxModule | | |
| INV-E20 | Araç | `*.vehicle.json` | 6 | yeniden tasarla | vehicle-asset-editor, e:vehicleAssets | | |
| INV-E21 | Foliage Type | `*.foliagetype.json` | 5c | yeniden tasarla | foliage-type-save | | |
| INV-E22 | UI widget; data table | `*.ui.json`, data table JSON (`/__save-gamedata`) | 6 | yeniden tasarla | e:uiFramework | UI widget şemalı JSON; data table genel veri editöründe (A13) | |
| INV-E23 | Fracture | `*.fracture.json` | 8 | yeniden tasarla | e:fractureAsset | | |
| INV-E24 | Deformable | `*.deformable.json` | 8 | yeniden tasarla | e:deformableAsset | | |
| INV-E25 | Terrain: belge, tile'lar, global harita | `*.terrain.json`, `*.tile.bin`, `*.global.bin` | 5a | uyarla | terrain-endpoints, e:terrainDocument, e:terrainGlobalMapFile | İkili tile'lar olduğu gibi (plan §2.7) | |
| INV-E26 | Mesh paint verisi | `<level>.meshpaint.json` | 5d | yeniden tasarla | — | INV-B10 ile | |
| INV-E27 | World Builder girdileri: recipe, world brief, ground cover, referans görsel | `*.worldrecipe.json`, `*.worldbrief.json`, `*.cover.json`, `*.reference.png` | 2b | uyarla | world-brief, e:worldRecipe, e:worldBrief* | Recipe ve referans görsel level'ın yanında (plan 2b) | |
| INV-E28 | Bölge profili | `*.regionprofile.json` | 2b | uyarla | e:regionProfile | Oyun verisi; motor deposuna girmez, türü motorda (plan 2b) | |
| INV-E29 | Eski `model` asset türü | `LegacyAssetType` | — | taşınmaz | — | İçe aktarıcı güncel türe çevirir | |

### F. Runtime ve oyun çatısı

Three'siz `engine/*` alt sistemlerinin kodu 2b'de olduğu gibi taşınır (§2.11);
Faz sütunu özelliğin oyunda çalıştığı fazdır. Oyun çatısı (`src/game`)
`gameplay` katmanına girer (mimari §3.2-2).

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-F01 | Boot ve hata ekranı (renderer'dan bağımsız) | `src/bootError.ts` | 2a ✓ | yeniden tasarla | boot-errors, production/boot-errors | "WebGPU yok" mesajı da burada (K4) | boot ekranı (2a) |
| INV-F02 | Level runtime: capability modülleri, yaşam döngüsü, tipli servis anahtarları | `src/scene/{LevelRuntime,RuntimeSceneApp}.ts`, `src/scene/capabilities/` | 2a ✓ / 6 | yeniden tasarla | runtime-parity, e:levelRuntime, e:capabilityRegistry, e:runtimeCapabilityModules | World + alt sistem sözleşmesi 2a'da; capability modülleri alt sistem olarak Faz 6 | World (2a) |
| INV-F03 | Oyun modülü, hatalı modülün karantinası | `src/scene/ForgeGameModule.ts`, `src/game/gameModule.ts` | 2a ✓ / 6 | yeniden tasarla | e:forgeGameModule | `defineGameModule` 2a'da; karantina davranışı (mimari §5) Faz 6'da doğrulanır | oyun modülü (2a) |
| INV-F04 | Oyun projesi başlatıcısı (Model 2) | `tools/{run-game-project.mjs,projectPaths.ts}`, `src/project/` | 2a ✓ | yeniden tasarla | tests/project | `forge check` / `forge dev`, `create-project`, `check:projects` | sözleşme (2a) |
| INV-F05 | Oyun modları: TPS karakter, araç, RTS kamera, varsayılan kamera, proje game mode kataloğu | `src/game/gameModes/` | 6 | uyarla | game-starter, rts-starter, e:rtsCameraGameMode | `gameplay` katmanı | |
| INV-F06 | Oyuncu kontrolcüsü, kamera yöneticisi, spring arm, takip kamerası, kamera devri | `src/game/{playerController,playerCameraManager,springArmCamera,followCamera}.ts`, `src/play/cameraHandoff.ts` | 6 | uyarla | runtime-locomotion | | |
| INV-F07 | Araca binme / inme | `src/game/gameModes/vehicleEntry.ts` | 6 | uyarla | vehicle, e:vehicleEntry | | |
| INV-F08 | Ragdoll ve kalkma karışımı | `src/game/{ragdollDriver,ragdollSpec,getUpBlender}.ts`, `engine/physics/ragdoll.ts` | — | taşınmaz | — | K12: cila, oyun isterse etiketten. `engine/physics/ragdoll.ts`'e bağ taşımada kesilir | |
| INV-F09 | Oyun kuralları, etkileşim, davranış kataloğu, animasyon notify'ları, montage girişleri | `src/game/{gameRules*,interaction,behaviors,animationNotifies,montageInputBindings,editorCatalog}.ts` | 6 | uyarla | runtime-checkpoint | Montage girişleri taşınmaz (K12) | |
| INV-F10 | Başlangıç şablonları: game-starter, rts-starter | `templates/` | 6 | yeniden tasarla | game-starter, rts-starter | game-starter plan Faz 6'da; rts-starter `samples/` altında ikinci örnek (karar 2026-11-11) | |
| INV-F11 | Girdi: action map, klavye, fare, gamepad, dokunmatik, sanal joystick | `engine/input`, `src/input/` | 6 | taşı | — | | |
| INV-F12 | Fizik (Rapier): sabit adım, statik çarpışma, heightfield, darbe olayları, yüzeyler, hareketli platform | `engine/physics` | 6 | taşı | e:physicsContacts, e:physicsImpacts, e:terrainHeightfieldPhysics | Kod 2b'de | |
| INV-F13 | Karakter hareketi: düzlemsel, eğim, dikey, yokuş yavaşlaması, lokomasyon | `engine/movement` | 6 | taşı | runtime-locomotion, e:characterMovementModule | K12: taşınır (ajanın her oyunda yeniden yazması pahalı, hataya açık); kod 2b'de | |
| INV-F14 | Navigasyon: Recast / Detour, tile worker'ları, yerel kaçınma, ajan profili | `engine/navigation` | 6 | taşı | ai-navigation-volume, ai-navigation-clearance, e:recastNavMesh | K12: taşınır (açık arazide yol bulma); kod 2b'de | |
| INV-F15 | AI: controller, Behavior Tree, State Tree, EQS, blackboard, smart object, algı, AI karakter animasyonu | `engine/ai`, `engine/perception`, `src/game/ai` | 6 | taşı | ai-patrol, e:aiModule, e:aiCharacterAnimationModule | K12: yalnız algı (`engine/perception`) ve AI karakter animasyonu; `engine/ai` (controller, BT, State Tree, EQS, blackboard, smart object) taşınmaz, AI mantığı oyun kodunda | |
| INV-F16 | Davranış host'u ve script mesajları | `engine/behavior` | 6 | taşı | runtime-script-message, e:behaviorSubsystem | | |
| INV-F17 | Ses: bus, olay tablosu, Sound Cue değerlendirme, müzik yöneticisi | `engine/audio` | 6 | taşı | e:audioModule | | |
| INV-F18 | Diyalog: konuşma yöneticisi, altyazı, konuşma overlay'i | `engine/dialogue`, `src/scene/{subtitleOverlay,conversationOverlay}.ts` | — | taşınmaz | e:dialogueModule | K12: diyalog taşınmaz | |
| INV-F19 | Oyun UI'ı: widget, bağlama, tema, geçiş, erişilebilirlik, yerelleştirme, dünya widget'ı | `engine/ui`, `src/ui/` | 6 | taşı | e:uiFramework, e:runtimeUiModule | | |
| INV-F20 | Kayıt oyunu: slotlar, durum, kullanıcı ayarları | `engine/persistence` | 6 | yeniden tasarla | runtime-checkpoint, e:saveGameModule, e:saveEntityKeys | 2b'de yeniden kurulur: GUID anahtarlı, `persist` alanları + `defineSaveState` (A7); `saveEntityKeys` çevirisi düşer (D5) | |
| INV-F21 | Level geçişi ve portallar | `src/scene/{levelTravel,runtimeTravelCoordinator}.ts` | — | taşınmaz | runtime-portal | K12: oyuna özgü | |
| INV-F22 | Yükleme ekranı ve ilerleme | `engine/loading`, `src/scene/loadingOverlay.ts` | 6 | uyarla | content-loading, e:contentLoading | | |
| INV-F23 | Runtime'da aktör doğurma | `src/scene/runtimeActorSpawnCoordinator.ts` | 2a ✓ / 6 | yeniden tasarla | — | `spawnActors` / `destroyActors` 2a'da, authored aktörlerle aynı yaşam döngüsü (F11) | spawn (2a) |
| INV-F24 | World Partition runtime akışı, asset residency, akış politikası | `engine/world`, `capabilities/world{Partition,Streaming}Module.ts` | 5b | taşı | world-partition-streaming, open-world, e:worldPartitionStreaming, e:assetResidency, e:streamingPolicy | | |
| INV-F25 | Terrain runtime akışı ve worker havuzu | `capabilities/terrainWorkerPool.ts`, `engine/terrain` | 5a | taşı | terrain-streaming, e:terrainRuntimeStreaming | | |
| INV-F26 | Ortam runtime'ı: dünya saati, güneş yolu, hava önayarları, rüzgâr | `engine/environment`, `capabilities/worldEnvironmentModule.ts` | 3 | taşı | e:worldEnvironmentModule, e:wind | Olay bazlı gün saati (plan Faz 3) | |
| INV-F27 | Araç runtime'ı: süspansiyon, aktarma, tekerlek yüzey tepkisi, telemetri, araç AI | `engine/physics/vehicle`, `capabilities/vehicle*.ts`, `wheelSurfacePresentation.ts` | 6 | taşı | vehicle, vehicle-soft-ground, water-wheels, e:vehicle*, e:wheel* | | |
| INV-F28 | Terrain deformasyonu runtime'ı: iz, kazma, berm, kalıcılık | `capabilities/terrainDeformationModule.ts`, `engine/scene/deformation*.ts` | 8 | taşı | puddle-deformation, wet-trail-runtime, e:deformationField, e:deformationPersistence | | |
| INV-F29 | Kırılma ve deformable runtime'ı, debris / VFX / ses | `engine/physics/{fracture,deformable}`, `capabilities/{fracture,deformable}Module.ts` | 8 | taşı | fracture-runtime, deformable-runtime, e:fracture*, e:impactDeform | | |
| INV-F30 | VFX runtime'ı | `capabilities/vfxModule.ts`, `engine/vfx` | 6 | taşı | e:vfxModule | | |
| INV-F31 | Zaman kontrolü: yavaşlatma, duraklatma | `engine/core/timeControl.ts`, `src/scene/debugSpeedControl.ts` | 6 | taşı | e:timeControl | | |

### G. Render

`engine/render-three` (WebGL, 42 dosyası WebGL'e özgü) TSL / WebGPU'da yeniden
yazılır ya da uyarlanır (plan §1); Faz 1 GO'suna bağlıdır, NO-GO'da K10.
Forge'da olmayan yeni teknikler (TRAA, SSR, SSGI, LightProbeGrid…) envantere
girmez, plan Faz 3 ve 9'dadır.

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-G01 | Renderer host: init, resize, DPR, backend | `render-three/renderer.ts` | 3 | yeniden yaz | — | Gerçek backend rozeti (plan §2.6) | |
| INV-G02 | Materyaller, dokular, AO yüzey materyalleri | `render-three/{materials,textures,textureConfig,aoSurfaceMaterials}.ts` | 3 | yeniden yaz | ao-surface, ao-water | Node material slotları (plan §2.3) | |
| INV-G03 | GLTF yükleme ve model önbelleği | `render-three/{gltfLoader,gltfModelLoader,models}.ts` | 3 | uyarla | — | GUID anahtarlı render kaynak önbelleği (A6) | |
| INV-G04 | Işıklar ve gölgeler: güneş kaskatları (CSM), takipli gölge | `render-three/{lights,sunCascadeShadow,sunFollowShadow}.ts` | 3 | yeniden yaz | sun-cascaded-shadows, e:sunCascades, e:followShadow | `CSMShadowNode` | |
| INV-G05 | Reversed-Z derinlik | `render-three/depthMode.ts` | 3 | yeniden yaz | — | `reversedDepthBuffer` (plan Faz 3) | |
| INV-G06 | Gökyüzü: atmosfer, ay diski, yıldızlar | `render-three/{skyAtmosphere,moonDisc,starField}.ts` | 3 | yeniden yaz | world-environment-moon, world-environment-stars | | |
| INV-G07 | Height fog (görüş mesafesine uyum) | `render-three/heightFog.ts` | 3 | yeniden yaz | fog-fit-view-distance | | |
| INV-G08 | Cloud layer | `render-three/cloudLayer.ts` | 3 | yeniden yaz | — | | |
| INV-G09 | Reflection environment, sphere reflection capture | `render-three/{reflection,reflectionCapture}.ts` | 3 | yeniden yaz | sky-light-capture | Yalnız reflection environment (sky light / IBL). Sphere capture (`reflectionCapture.ts`) taşınmaz: INV-D12 | |
| INV-G10 | Planar yansıma: mirror, reflective surface | `render-three/{reflectionPlane,reflectiveSurface,planarReflectionSource}.ts` | 7 | yeniden yaz | — | | |
| INV-G11 | Post process | `render-three/postProcess.ts` | 3 | yeniden yaz | — | Tek `RenderPipeline`; yansıma seçeneği `reflection: off \| ssr` (kullanıcı kararı 2026-11-11) | |
| INV-G12 | Mesafe LOD, statik detay culling | `render-three/{distanceLod,staticDetailCulling}.ts` | 5b | yeniden yaz | detail-culling, far-view, e:detailCulling | | |
| INV-G13 | Terrain renderer: CDLOD, katman dizisi, materyal, doku havuzu, statik detay | `render-three/terrain/`, `render-three/landscape.ts` | 3 / 5a | yeniden yaz | terrain-renderer, terrain-static-detail, e:terrainRenderer, e:terrainLayerArray | Faz 1 S2'de spike; S2'nin TSL CDLOD'u Faz 3'te salt çizim (kullanıcı kararı 2026-11-12), üretim kalitesi 5a | |
| INV-G14 | Terrain yüzeyi: su birikintisi (planar yansıma dahil), kıyı ıslaklığı, kostik | `render-three/terrain/{terrainPuddle*,terrainShoreWetness,terrainCaustics}.ts`, `puddlePlanarReflections.ts` | 5a | yeniden yaz | terrain-puddle, wet-mud, e:terrainCaustics | | |
| INV-G15 | Terrain ıslak izi ve deformasyon shader'ı | `render-three/terrain/{terrainWetTrail,terrainDeformation}.ts` | 8 | yeniden yaz | wet-trail-runtime, e:terrainWetTrail | GLSL 556 satır → TSL / compute | |
| INV-G16 | Foliage: instancing, fade, impostor / billboard, rüzgâr salınımı | `render-three/{foliage,foliageFade,foliageImpostor,windSway}.ts` | 5c | yeniden yaz | foliage-fade, foliage-far-billboards, wind-sway, material-wind-sway | Compute culling + indirect draw (S4, 5c) | |
| INV-G17 | Okyanus: FFT, spektrum, ızgara, kostik, kapsama, girintiler, optik, yansıma | `render-three/ocean/` | 7 | yeniden yaz | ocean-* | FFT compute shader'a | |
| INV-G18 | Göl: yüzey, dalga, dalgacık, kırılma, sualtı pass'i ve hacmi, köpük bake | `render-three/lake*.ts` | 7 | yeniden yaz | lake-underwater, e:lake* | | |
| INV-G19 | Nehir: akış, dalga, kırılma, planar yansıma, güneş gölgesi, tekerlek yüzeyi | `render-three/river*.ts` | 7 | yeniden yaz | river-*, e:riverPlanarReflection | | |
| INV-G20 | Ortak su: köpük, tepe köpüğü, tekerlek köpüğü, optik, güneş parıltısı, su ortamı | `render-three/water*.ts` | 7 | yeniden yaz | water-contact-foam, water-crest-foam, e:waterFoam | Forge'da RDR2 su görünümünün görsel kabulü açıktı; kabul WebGPU'da (plan §3.1) | |
| INV-G21 | Spline mesh deformasyonu, yol mesh'leri | `render-three/{spline,splineDeformMesh}.ts` | 5d | yeniden yaz | landscape-spline-bake, e:terrainSplineMeshes | | |
| INV-G22 | Partikül efektleri (sprite, mesh partikül) | `render-three/{particleEffect,meshParticleEffect,vfxSubsystem}.ts` | 6 | yeniden yaz | — | Nokta boyutu yok → `Sprite` + instancing (plan Faz 6) | |
| INV-G23 | Skeletal animasyon çizimi: animatör, katmanlı klip, gövde maskesi, root motion, soket | `render-three/{animationSubsystem,characterAnimator,layered*,bodyMask,rootMotion,skeletalSocket}.ts` | 6 | uyarla | e:skeletalAnimationModule | | |
| INV-G24 | Deformable mesh senkronu, göçük aşınması, parça node'ları | `render-three/{deformableMeshSync,dentWear,deformablePartNodes}.ts` | 8 | yeniden yaz | deformable-runtime, e:deformableMeshSync | `dentWear` GLSL → TSL | |
| INV-G25 | Kırılma geometrisi | `render-three/fractureGeometry.ts` | 8 | uyarla | e:fractureGeometry | | |
| INV-G26 | World mask yaması | `render-three/worldMaskPatch.ts` | 3 | yeniden yaz | e:worldMasks | Materyal bileşimine katkı, `onBeforeCompile` yok (D12) | |
| INV-G27 | Editör yardımcı çizimleri: aktör ikonları, kamera, target point, blocking / nav volume, çarpışma görünümü | `render-three/{actorIcon,camera,targetPoint,blockingVolume,aiNavigationVolume,collisionView,picking,transforms}.ts` | 4 | yeniden yaz | target-point, ai-navigation-volume | Editör çizim katmanı, TRAA'dan sonra (plan Faz 4) | |
| INV-G28 | Navmesh görünümü | `render-three/{aiNavigationView,recastNavMeshView}.ts` | 6 | yeniden yaz | ai-navigation-clearance | | |
| INV-G29 | Kalite profilleri, adaptif kalite | `engine/perf/{qualityProfiles,adaptiveQuality}.ts` | 3 | uyarla | editor-quality | Forge merdiveni olduğu gibi + WebGPU izin alanları; ultra / high → Balanced, medium → GTAO'suz Balanced, low → Compatibility, Cinematic merdiven dışı (Faz 3 kararı 2026-11-12, mimari §4.9) | |

### H. Araçlar, teşhis ve kapılar

| ID | Özellik | Forge yeri | Faz | İşlem | Forge testleri | Not | WebGPU |
|---|---|---|---|---|---|---|---|
| INV-H01 | Dev server kayıt uçları (20'den fazla `/__save-*`, terrain, gamedata) ve kayıt doğrulayıcıları | `vite.config.ts`, `tools/{saveValidator,terrainSaveValidator,lakeFoamSaveValidator}.ts` | 2a ✓ | yeniden tasarla | terrain-endpoints | Şemaya göre genel uçlar 2a'da (mimari §4.6); terrain ikili kanalı 5a, göl köpük bake 7 | kayıt servisi (2a) |
| INV-H02 | Düşen alan ağı | `tools/droppedFields.ts` | 2a ✓ | yeniden tasarla | e:droppedFields | Normalize'ın parçası: geliştirmede hata, üretimde rapor | normalize (2a) |
| INV-H03 | Proje kökü izolasyonu | `tools/projectPaths.ts` | 2a ✓ | taşı | tests/builder/project-roots | | yazma politikası (2a) |
| INV-H04 | Engine test koşucusu (`--filter`, `--slow`, `--timing`) | `tools/{engine-tests.ts,run-engine-tests.mjs}` | 2a ✓ / 2b | yeniden tasarla | — | Vitest 2a'da (A5); 176 test dosyasının çevrilmesi 2b | Vitest (2a) |
| INV-H05 | Playwright smoke'ları: editör, runtime, production, oyun projesi | `tests/smoke/`, `tests/production/`, `playwright*.config.*` | 4 / 6 | uyarla | 114 smoke + 2 production spec | Editör smoke'u Faz 4, runtime smoke'ları Faz 6; smoke portu 5283 | |
| INV-H06 | Katman denetimi | `builder/web/verify-imports.mjs` | 2a ✓ | yeniden tasarla | tests/builder/verify-imports | dependency-cruiser + öz-test (A3, D13) | `verify:layers` (2a) |
| INV-H07 | Dist doğrulaması (editör sızıntısı) | `builder/web/verify-dist.mjs` | 4 | uyarla | — | 2a'dan Faz 4'e taşındı | |
| INV-H08 | Ek tip kapıları: smoke fixture'ları, içerik testleri, UI test tipleri | `tsconfig.{smoke,content-tests,ui-tests}.json` | 4 | uyarla | tests/builder/smoke-project | Playwright gelince | |
| INV-H09 | Asset manifest sağlığı ve baseline | `tools/{asset-manifest-health.ts,run-asset-manifest-health.mjs}`, `tools/baselines/` | 2a ✓ | yeniden tasarla | — | `verify:assets`: tür + lisans + kaynak, asılı referans (D16) | `verify:assets` (2a) |
| INV-H10 | Dünya verisi kapısı | `tools/{worldDataCheck,world-data-check}.ts` | 2a ✓ / 5a | yeniden tasarla | e:worldDataCheck | Level klasörü bütünlüğü 2a'da; terrain verisi denetimi 5a | level bütünlüğü (2a) |
| INV-H11 | Terrain onarımı, öksüz tile temizliği | `tools/world/repair-terrain.mjs`, `tools/terrainOrphans.ts` | 5a | taşı | terrain-orphan-cleanup, e:terrainRepair, e:terrainOrphans | Atomik kayıt (2a) özet bayatlamasını önler; aracın gerekliliği 5a'da yeniden değerlendirilir | |
| INV-H12 | World Builder CLI: rastgele dünya, brief, test dünyaları | `tools/world/{build-random-world,build-world-brief,generate-*}.mjs` | 2b | taşı | e:testWorld, e:wbTestValley, e:wbPilotValley, e:offroadTestWorld | `npm run world:random` 2b'de çalışır (plan 2b) | |
| INV-H13 | HLOD build | `tools/world/{build-hlod.mjs,hlodBuild.ts}` | 5b | taşı | hlod | | |
| INV-H14 | Kıyı ve ada şekli ölçüm araçları | `tools/world/{measure-*,run-*-measurement,compare-island-shapes}.*` | 2b | taşı | — | World Builder algoritmalarıyla | |
| INV-H15 | Üretim build'i ve sürüm: release content, starter content, profiller | `builder/web/{build-release,release-content,starter-content}.mjs`, `builder/web/profiles/` | 6 | uyarla | production/release, tests/builder/release-content | Editörsüz çıktı (plan Faz 6) | |
| INV-H16 | Oyun projesi build'i, yeniden üretme, build kaydı | `builder/web/game-project-{build,reproduce}.mjs` | 6 | uyarla | tests/builder/game-project-build | `build-record.json`, `verify:build` (mimari §5) | |
| INV-H17 | Alt dizin yayını (public URL tabanı) | `src/project/publicUrl.ts` | 4 | yeniden tasarla | tests/builder/public-url | `base` testi 2a'dan Faz 4'e taşındı (F06) | |
| INV-H18 | `?debug` paneli: kare süresi, GPU süresi, istatistik tabloları, terrain haritası, hız kontrolü | `src/scene/{debugPanel,debugStats,debugTableModal,debugTerrainMap}.ts`, `engine/perf` | 3 | uyarla | debug-panel, e:perfReadout | Plan Faz 3 renderer host | |
| INV-H19 | Perf teşhisi: GPU taraması, kare yakalama, kare bölgeleri, darboğaz sınıflandırma, perf bütçesi, alt sistem profiler | `engine/perf`, `engine/core/subsystemProfiler.ts`, `src/scene/gpuSweepSession.ts` | 3 | uyarla | e:gpuSweep, e:gpuSweepSession, e:frameCapture, e:frameRegions, e:perfWitness | §2.10 ölçüm formatı | |
| INV-H20 | Perf raporları: asset, tarayıcı, WES, göl, okyanus bütçesi, kalite matrisi | `tools/*report*.{mjs,ts}`, `tools/perf/` | 3 / 7 | uyarla | tests/builder/wes-acceptance-report | Su raporları Faz 7 | |
| INV-H21 | Ses araçları: manifest senkronu, loudness denetimi, codec yoklaması | `tools/{sync-audio-manifest,audit-audio-loudness,probe-audio-codecs}.mjs` | 6 | taşı | — | Manifest senkronu A10 meta'ya göre yeniden yazılır | |
| INV-H22 | GLB optimizasyonu, gömülü doku ayıklama | `tools/{optimize-mesh-glb,strip-embedded-textures}.mjs` | 4 | taşı | — | İçe aktarma hattıyla (INV-A25) | |
| INV-H23 | Diyalog raporu ve hattı | `tools/{dialogueReport,dialoguePipeline}.ts`, `dialogue-report.mjs` | — | taşınmaz | — | K12: diyalog taşınmaz | |
| INV-H24 | Su köpüğü bake, göl bench'leri | `tools/{bake-water-foam,bench-lake-bed,bench-lake-water}.mjs` | 7 | taşı | — | | |
| INV-H25 | Asset kütüphanesi dizinleri: Kenney, Quaternius | `tools/{asset-library-index,quaternius-library-index}.mjs`, `tools/kenney/` | — | taşınmaz | — | Kullanıcı kararı (2026-11-11): bu projede Kenney / Quaternius yok. Dizin ve üreticiler GameDesign klasörüne taşındı, Forge'dan kaldırıldı (Forge `92a709aa`) | |
| INV-H26 | Model 1 fork senkronu | `tools/sync-forge-to-games.{bat,ps1}` | — | taşınmaz | — | Model 1 oyunları Forge WebGL'de kalır (§3) | |
| INV-H27 | Dev server başlat / durdur betikleri (Windows) | `tools/{open,stop}-dev-server.ps1` | — | taşınmaz | — | Öneri: gerekirse sahipsiz Vite sürecini kapatan küçük bir araç olarak Faz 4'te yeniden yazılır | |
| INV-H28 | Forge spike'ları: cell-activation, far-view, grass-ring | `spikes/` | — | taşınmaz | — | Sonuçları Forge planlarına işlendi; Faz 1 spike'ının yeri ayrı karar | |
| INV-H29 | CI iş akışı | `.github/workflows/` | 2a ✓ | yeniden tasarla | — | `npm run gate` ile aynı | CI (2a) |

### Planda adı geçmeyen satırların fazları

Öneri olduğu gibi kullanıcı tarafından onaylandı (2026-11-11).

| Konu | Satırlar | Karar |
|---|---|---|
| Asset editörleri | INV-C01, C04–C08, C10–C16 | İlgili alt sistemin fazı: Static Mesh 4, Material 3 / 4, Actor Script 4 / 6, geri kalanı 6 |
| Mesh Paint | INV-B10, E26 | 5d (öteki boyama araçlarıyla) |
| Asset UVW ve vertex color | INV-E11, E12 | 3 (materyal sistemiyle) |
| World mask yaması | INV-G26 | 3 (materyal bileşimi) |
| Yükleme grupları | INV-D33 | Taşınmaz; hücre akışıyla yer değiştirir |
| Level geçişi, zaman kontrolü | INV-F21, F31 | 6 |
| rts-starter şablonu | INV-F10 | Faz 6'da game-starter'la birlikte `samples/` altında ikinci örnek |
| Kıyı / ada ölçüm araçları | INV-H14 | 2b (World Builder ile) |
| Perf raporları | INV-H20 | 3, su raporları 7 |
| Ses araçları | INV-H21 | 6 |
| GLB optimizasyonu | INV-H22 | 4 (içe aktarma) |
| Kenney / Quaternius dizinleri | INV-H25 | Taşınmaz; GameDesign'a (kullanıcı kararı 2026-11-11) |
| Dev server betikleri | INV-H27 | Taşınmaz |

## 2. Taşıma günlüğü

Forge SHA: `forge-webgl-final` = `04b5fb23` (cut-over 2026-11-11; etiket
nesnesi `253e01f0`, açıklamalı). Aksi yazılmadıkça her satır bu SHA'dan
taşınır.

| Modül | Kaynak yol | Forge SHA | İşlem | Testler | Durum |
|---|---|---|---|---|---|
| `src/engine/audio/` (`audioBus`, `audioEventTable`, `musicDirector`, `audioClips`, `audioTypes`) | `engine/audio/{audioBus,audioEventTable,musicDirector}.ts`; `engine/assets/audio.ts` → `audioClips`; `audioSubsystem.ts`'in tipleri ve saf yardımcıları → `audioTypes` | `04b5fb23` | uyarlandı: dosya bölündü, import yolları; algoritma aynı | 27 taşındı (`audio.test.ts`) | yeşil (2026-11-11) |
| `src/runtime/audio/audioSubsystem.ts` | `engine/audio/audioSubsystem.ts` (Web Audio ve DOM kısmı) | `04b5fb23` | uyarlandı: `runtime` katmanına (engine DOM'suz); eski `Subsystem` sözleşmesi yerine yerel `AudioUpdateContext`; parametre özelliği açık alan (silinebilir sözdizimi). World'e bağlanması Faz 6'da ses özelliğiyle | 10 taşındı (`audioSubsystem.test.ts`) | yeşil (2026-11-11) |
| Sound Cue | `engine/audio/soundCue{Evaluator,Types}.ts` | `04b5fb23` | taşınmadı (K12, INV-E15) | 13 düştü (D) | — |
| `src/engine/ui/` (`uiWidget`, `uiRenderer`, `uiBinding`, `uiTheme`, `uiLocale`, `uiTransition`, `uiA11y`, `uiViewModel`, `uiWorldWidget`) | `engine/ui/*.ts` | `04b5fb23` | uyarlandı: `uiRenderer` / `uiBinding` / `uiTheme`'in DOM'lu işlevleri ayrıldı; eski modelin `SceneJsonValue` tipi yerine aynı biçimde yerel `UiJsonValue`; import yolları | 50 taşındı (`ui.test.ts`); 5 M bırakıldı (kayıt doğrulayıcı 1, `?debug` biçimlendirici 4) | yeşil (2026-11-11) |
| `src/runtime/ui/uiDom.ts` | `engine/ui/{uiRenderer,uiBinding,uiTheme}.ts`'in DOM kısmı: `mountUiRenderNode`, `renderUiWidget`, `bindUiWidget`, `bindUiLocale`, `applyUiTheme` | `04b5fb23` | uyarlandı: `runtime` katmanına (engine DOM'suz) | Forge'da testi yok | derleniyor; ekran smoke'u Faz 6'da oyun UI'ıyla |
| `src/engine/input/` (`actionMap`, `defaultInputBindings`) | `engine/input/{actionMap,defaultInputBindings}.ts` | `04b5fb23` | taşındı; varsayılan bağlamalardan ragdoll hata ayıklama tuşu (`KeyR`) çıktı (K12). `inputSubsystem.ts` (eski sözleşme kabuğu) Faz 6'da input özelliğiyle | 3 taşındı (`actionMap.test.ts`) | yeşil (2026-11-11) |
| `src/engine/time/timeControl.ts` | `engine/core/timeControl.ts` | `04b5fb23` | taşındı | 5 taşındı (`timeControl.test.ts`, dosyanın tamamı) | yeşil (2026-11-11) |
| `src/engine/work/cooperativeWork.ts` | `engine/core/cooperativeWork.ts` | `04b5fb23` | uyarlandı: parametre özelliği açık alan | 1 taşındı (`lakeScheduling.test.ts`'in yalnız `CooperativeWork` kontrolü; göl kontrolleri Faz 7) | yeşil (2026-11-11) |
| `src/engine/perf/frameMetrics.ts` | `engine/perf/frameMetrics.ts` | `04b5fb23` | taşındı | 4 taşındı (`frameMetrics.test.ts`) | yeşil (2026-11-11) |
| `src/engine/subsystem.ts` | `engine/core/Subsystem.ts` | `04b5fb23` | taşındı (yalnız tipler): Forge alt sistem biçimi; taşınan alt sistemler Faz 6'da World'e bağlanana kadar bunu uygular | — | — |
| `src/engine/perf/` (`subsystemProfiler`, `frameRegions`, `debugTableView`, `bottleneckClassifier`, `perfBudget`) | `engine/core/subsystemProfiler.ts`, `engine/perf/{frameRegions,debugTableView,bottleneckClassifier,perfBudget}.ts` | `04b5fb23` | uyarlandı: profil çıkarıcı `engine/core`'dan `perf`'e; parametre özellikleri açık alan | 16 taşındı (`frameRegions.test.ts` 11, `subsystemProfiler.test.ts` 3, `perfBudget.test.ts` 2) + `bottleneckClassifier.test.ts` 1 (2026-11-12, `tools/engine-tests.ts` içi) | yeşil (2026-11-11) |
| `src/engine/input/inputSubsystem.ts` | `engine/input/inputSubsystem.ts` | `04b5fb23` | uyarlandı: parametre özelliği açık alan | 1 taşındı (`inputSubsystem.test.ts`, iskele döngüsüyle) | yeşil (2026-11-11) |
| `src/engine/testing/` (`EngineApp`, `SubsystemRegistry`) — **test iskelesi** | `engine/core/{EngineApp,SubsystemRegistry}.ts` | `04b5fb23` | iskele (kullanıcı kararı 2026-11-11): yalnız testler import eder (`engine-testing-is-test-only`); Faz 6'da silinir | 1 taşındı (`EngineApp.test.ts`, iskelenin öz-testi) | yeşil (2026-11-11) |
| `src/engine/legacy/` (`entity`, `layout`, `capsule`, `components`) — **geçiş modeli** | `engine/scene/{entity,capsule}.ts`; `layout.ts`'ten `Vec3`, `LayoutPhysicsAxisLocks`, `LayoutLandscape` (terrain ile, `worldTerrainActor` için, 2026-11-12), `LayoutWorldEnvironment` (environment ile, 2026-11-12); `cloudLayer.ts` / `heightFog.ts`'ten çözülmüş ayar tipleri (`ResolvedCloudLayer`, `ResolvedHeightFog`; environment ile); `components.ts`'ten collider / transform okuyucuları ve `VEHICLE_COMPONENT` (120 bildirimden 16'sı), movement ile karakter hareketi okuyucusu (`readCharacterMovementComponent`, +5 bildirim, 2026-11-12), behavior ile `Behavior` / `Interaction` / `ScriptActor` okuyucuları (`ScriptActor` değişkenleri K12 ile çıktı; +9 bildirim, 2026-11-12) | `04b5fb23` | geçiş (kullanıcı kararı 2026-11-11): yalnız `src/engine` import eder (`engine-legacy-stays-in-engine`); Faz 6'da şemalı bileşenlerle değiştirilip silinir | — | — |
| `src/engine/physics/physicsSubsystem.ts` + `staticWorld.ts`, `vehiclePhysics.ts`, `physicsBodies.ts`, `physicsTypes.ts` | `engine/physics/physicsSubsystem.ts` (2.817 satır, tek sınıf) | `04b5fb23` | **yeniden düzenlendi** (kullanıcı onayı 2026-11-11): 1.500 satır bütçesi için beşe bölündü — statik dünya (`StaticWorld`, `collisionDisabled` / `bodiesById` paylaşımlı) ve araçlar (`VehiclePhysics`, Rapier durumunu host'tan okur) ayrı sınıf, saf yardımcılar ve tipler ayrı modül; yöntem gövdeleri aynı, başvurular `this.staticWorld.*` / `this.host.*()`; herkese açık API aynı (delegeler). Ragdoll çıkarıldı (K12) | 30 harness kontrolü (`physicsSubsystem.test.ts`; 28'i gerçek Rapier dünyasıyla) + `staticQueries` 6, `physicsImpacts` 10, `physicsContacts` 1 | yeşil (2026-11-11) |
| `src/engine/physics/` (`collision`, `physicsQuery`, `fixedStep`, `rotatedBox`, `staticSpatialIndex`, `heightfieldStatic`, `staticTriangles`, `navigationGeometry`, `impactEvents`) | `engine/scene/collision.ts` (saf: etkileşim grupları, fiziksel malzemeler); behavior'daki physics sorgu tipleri; `engine/physics/*.ts` | `04b5fb23` | taşındı / uyarlandı: sorgu tipleri physics'e geçti; parametre özellikleri açık alan | `impactEvents` 11, `fixedStep` 3, `rotatedBox` 5, `physicsBodies` 1 | yeşil (2026-11-11) |
| `src/engine/physics/vehicle/`, `src/engine/physics/surface/` | `engine/physics/{vehicle,surface}/*.ts` | `04b5fb23` | taşındı; `SurfaceDeformationSample` tipi `terrainSurface`'ten `surface/surfaceDeformationSample.ts`'e (terrain taşınınca oradan import eder) | `vehicleTypes` 10, `wheelSink` 15, `wheelTracks` 1; 2026-11-12 elle (araç dosya düzeyindeki Forge bağımlılıkları yüzünden atlıyordu), gövdeler aynı: `surfaceResponse` 20 (eski room layout adaptörü, stok GAZ-52 actor script'i ve onu okuyan `resistanceRun` yardımcısı M kontrollerle dışarıda; A kontroller onlara ulaşmıyor; `createVehicleTestWorld` Forge harness senaryosunun aynısı), `vehicleDrivetrain` 13, `vehicleAssets` 1. Stok GAZ-52 tanımı test fixture'ı `tests/engine/fixtures/Gaz52.vehicle.json` (Forge `public/assets/vehicles/gaz52/`): okuma satırı yolu uyarlandı. Forge tip hatası: `drive`'ın varsayılan parametresi `VehicleAsset` çıkarıyor (açıklamalı `@ts-expect-error`). Kayıt doğrulayıcı / manifest / araç yükleyici kontrolleri M; araç asset türü Faz 6 | yeşil (2026-11-11; araç kontrolleri 2026-11-12) |
| `src/engine/physics/fracture/` (`voronoiFracture`, `fractureBake`, `fractureSupport`, `fractureTypes`, `fractureRuntime`, `fractureMask`), `src/engine/physics/deformable/` (`deformableTypes`, `impactDeform`) | `engine/physics/{fracture,deformable}/*.ts` | `04b5fb23` | taşındı (kullanıcı onayı 2026-11-12): three'siz algoritmalar olduğu gibi (Voronoi kırılma ve bake, destek grafiği, eşik / hasar / parça planlama, parça maskesi, göçük yüzeyi). `*.fracture.json` / `*.deformable.json` normalize fonksiyonları Forge'daki biçimiyle; yeni asset türü olmaları (INV-E23 / E24), bileşenler (INV-D58 / D59), mesh senkronu, `dentWear` TSL ve editör **Faz 8**. Kopma (`detach`) kodu motorda (araç hasarı kararı) | 88 taşındı: `fractureAsset` 22, `fractureRuntime` 17, `fracture` 16, `impactDeform` 14, `fractureSupport` 9, `deformableAsset` 8, `fracturePersistence` 2. `fractureRuntime` elle (dosyada three kullanan iki yardımcı ve 4 R kontrol dışarıda); iki yan dosya yolu kontrolü elle (araç yol literallerini içerik sandı). Eski kaydedici (`saveValidator`) ve kayıt oyunu kontrolleri M | yeşil (2026-11-12) |
| `src/engine/movement/slopeSurface.ts`, `src/engine/terrain/deformationField.ts` | `engine/movement/slopeSurface.ts`, `engine/scene/deformationField.ts` | `04b5fb23` | taşındı (saf) | `slopeSurface` 3 | yeşil (2026-11-11) |
| Hareketli platform | `engine/physics/movingPlatform{,Subsystem}.ts` | `04b5fb23` | taşınmadı (K12, INV-D51) | düşen (D) | — |
| `src/engine/terrain/` (34 dosya: tipler, tile codec, düzenleme + geri alma, sculpt, erozyon, auto paint, pad'ler, onarım, yeniden örnekleme, heightmap PNG / içe aktarma, yükseklik sorgusu, LOD, global harita, maske, katmanlar, loader, render verisi / kaynağı, slot havuzu, tile akışı decode'u, spline verisi / mesh'leri, `terrainSurface`, `worldTerrain{Actor,Create,Expand,Save}`, `terrainEditorStreaming`) | `engine/terrain/*.ts` (aşağıdaki ertelenenler hariç) | `04b5fb23` | taşındı: import yolları, parametre özellikleri açık alan; `terrainSurface` `SurfaceDeformationSample`'ı tanımlamaz, `physics/surface/surfaceDeformationSample.ts`'ten import eder; `worldTerrainActor` eski Collider / Transform okuyucularıyla `legacy`'ye bağlı (physics gibi) | 153 taşındı: `terrainEdit` 28, `terrain` 20, `terrainImport` 18, `worldTerrainActor` 11, `terrainLod` 11, `terrainSplines` 10, `terrainEditorStreaming` 8, `terrainSurface` 7, `terrainErosion` 6, `terrainAutoPaint` 5, `worldTerrainExpandSingle` 4, `terrainSplineEditing` 4, `terrainPads` 4, `terrainSplitBake` 3, `terrainResample` 3, `terrainDocument` 3, `terrainHeightfieldPhysics` 2, `terrainSplineData` 1, `terrainRuntimeStreaming` 1, `terrainGlobalMapFile` 1. `heightmapPng` 3 (2026-11-12: `node:zlib` bağımsız referans kodlayıcı olarak `src` testlerine açıldı, kullanıcı kararı) | yeşil (2026-11-12) |
| `src/engine/terrain/{landscape,landscapeBrush,landscapeSplineValidation,landscapeSplineAdapter}.ts` | `engine/scene/{landscapeBrush,landscapeSplineValidation,landscapeSplineAdapter}.ts`; `engine/scene/landscape.ts`'in spline kısmı (`subset`: 42 bildirimin 30'u — spline tipleri, `splineToPolyline`, `SplineCorridorIndex`, spline mesh zincirleri / örnekleri, `LANDSCAPE_DEFAULT_LAYERS`) | `04b5fb23` | uyarlandı (kullanıcı onayı 2026-11-12): scene'deki saf landscape algoritmaları terrain'e; landscape aktörü çözümü (`resolveLandscape`, ad / kimlik, boyut ön ayarları), materyal tanımı ve heightmap yeniden örnekleme alınmadı (aktör 5a'da şemayla, render 5a / 5d) | terrain kontrolleriyle | yeşil (2026-11-12) |
| `src/engine/spline/` (`spline`, `splineCurve`) | `engine/scene/{spline,splineCurve}.ts` | `04b5fb23` | taşındı (kullanıcı onayı 2026-11-12): saf eğri matematiği ve spline verisi normalleştiricisi; landscape spline adapter'ı kullanır, spline aktörü (INV-D27, Faz 6) şemasıyla bunu kullanır ya da yerine geçer | testleri M (scene) | derleniyor |
| `src/engine/persistence/` (`saveGameStore`, `saveGameSlots`), `src/runtime/persistence/localStorageAdapter.ts` | `engine/persistence/{saveGameStore,saveGameSlots}.ts` | `04b5fb23` | taşındı (kayıt oyunu tasarımı, kullanıcı kararı 2026-11-12): slot, zarf, şema geçişi, bozuk veri / kota hatasına dayanıklı depolama ve slot arayüzü sözleşmesi olduğu gibi; tarayıcının `localStorage` bağdaştırıcısı `runtime` katmanına (engine DOM'suz). Yük (`payload`) depoya opak; yeni modelde `forge.saveGame/1` belgesi. `saveGameState` (tipsiz `flags`, level yolu) ve `saveEntityKeys` (sıra çevirisi) taşınmadı (A7, D5); `userSettingsStore` grafik tercihleriyle Faz 3'te | 5 taşındı: kayıt deposu 4, slot arayüzü 1 (elle: level yolu slot etiketi metni, okunan içerik değil) | yeşil (2026-11-12) |
| `src/core/save/` (`saveState`, `saveGame`, `actorState`, `saveLedger`), `src/core/schema/persist.ts` | `engine/persistence/saveGameState.ts`'in yerine (yük sözleşmesi), `engine/world/streamedActorState.ts`'in kayıtla ortak kısmı | — | **yeni** (kayıt oyunu tasarımı, kullanıcı kararları 2026-11-12; mimari A7): `forge.saveGame/1` (level GUID'i; aktör GUID + bileşen kimliği + alan; `removed`, `spawned`, `states`), alan `persist` bayrağı + bileşenin `state` bölümü + `persistTransform`, `defineSaveState` (özellikle kayda girer, SDK 0.1.1). Bileşen girdisi override kurallarıyla (sürüm damgası, kısmi veri geçişi, yalnız farklar); level'dan bağımsız normalize, level'a uygulanırken asılı girdi raporlanıp düşer. Yakalama / uygulama saf; durum defteri (`SaveLedger`) yüklenmemiş hücrelerin aktörlerini, yok edilenleri, doğanları ve oyun geneli durumu tutar, kayıt belgesini yazar (kayıt ile hücre akışı tek mekanizma). Forge'un `consumeRestoreForLoadedLevel`'i GUID'le `consumeSaveForLoadedLevel`. `flags`, sıra çevirisi, level yolu yok; davranış alt sisteminin `ScriptState.persist`'i Faz 6'da tipli alanlara / davranış `state` şemasına | yeni testler (`save.test.ts` 13); Forge'un "eşleşen level'da uygula" kontrolü D, burada yeniden yazıldı | yeşil (2026-11-12) |
| `src/engine/world/` (`worldPartitionStreaming`, `streamedActorState`) | `engine/world/{worldPartitionStreaming,streamedActorState}.ts` | `04b5fb23` | taşındı (World Partition tasarımı, kullanıcı kararı 2026-11-12): hücre yerleşim planlayıcısı (etkin / önceden getirilen hücreler, kare bütçesi, hazır olmayan hücre) ve hareket etmiş aktörün durum belleği olduğu gibi. Uyarlamalar: planlayıcı etkinleştirdiği kimliğe göre genel (`WorldPartitionStreaming<Id = number>`; Forge'da `layout.actors` sırası, yeni modelde aktör GUID'i), Forge'un parametre özelliği açık alan; `WorldPartitionGridSettings` planlayıcının yanında (Forge'un eski `worldPartition.ts`'i taşınmadı); `streamedActorState`'in iki araç kayıt tipi yanında (eski `saveGameState` taşınmadı; araç özelliğinin tipli durumu Faz 6). Runtime'a bağlanması (hücre dosyası getirme, aktör ekleme / çıkarma) 5b | 24 taşındı: `worldPartitionStreaming` 20 (dosya elle: tip import'u planlayıcıya), `streamedActorState` 4 | yeşil (2026-11-12) |
| `src/core/grid/worldGrid.ts`, `src/engine/world/streamingPolicy.ts` | `engine/world/{worldGrid,streamingPolicy}.ts` | `04b5fb23` | taşındı (kullanıcı onayı 2026-11-12): saf ızgara ve akış hedefi matematiği (`terrainLod`, `terrainEditorStreaming` kullanır). **Birleştirme (kayıt oyunu + World Partition tasarımı, kullanıcı kararı 2026-11-12):** ızgara gövdeleri değişmeden `src/core/grid/`'e taşındı; `core/level/cells`'in `cellAt` / `cellBounds` / `exceedsCell`'i onu sıfır orijinle çağırır (level ızgarası orijini dünya orijini olan dünya ızgarasıdır), anahtar yazımı ve ayrıştırması (`-0` ve baştaki sıfır yok) core'da kalır | `streamingPolicy` 16, `terrain` dünya ızgarası 3, `terrainLod` 1 (2026-11-12); core hücre testleri aynı | yeşil (2026-11-12) |
| `src/engine/physics/terrainCollider.ts` | `engine/physics/terrainCollider.ts` | `04b5fb23` | taşındı | — | derleniyor |
| `src/engine/testing/terrainTrimeshReference.ts` — **test yardımcısı** | `tests/engine/terrainTrimeshReference.ts` | `04b5fb23` | taşındı: heightfield kontrollerinin bağımsız referans trimesh'i; iskelede, yalnız testler import eder | `physicsSubsystem.checks` 2 (`tools/engine-tests.ts` içi) ve `terrainHeightfieldPhysics` / `terrainEdit` kontrollerini açar | yeşil (2026-11-12) |
| Terrain'in ertelenen parçaları | Göl / nehir / okyanus: `engine/terrain/{lake*,ocean*,riverSurface,terrainLakeBed,terrainLakeWater,terrainRiverWater,waterWheelInteraction}.ts` + `engine/scene/{waterBody,oceanWater,lakeBed,riverWater}` ve köpük / kostik → **Faz 7**. Su birikintisi: `terrainPuddle{,Preparation}`, `puddleInteraction`, `scene/puddleWater` → **5a** (INV-D21). `terrainRuntimeStreaming` + `world/worldStreamingSubsystem` → **5b** (A11). `worldTerrainMove` (dört eski su tipini de kaydırır) → **5d / 7** | `04b5fb23` | ertelendi (kullanıcı onayı 2026-11-12) | bekleyen A (2026-11-12, TSV `deferred` sütunu): su 20 (Faz 7), su birikintisi 3 + öksüz tile 1 (5a), akış 2 (5b), `worldTerrainMove` 4 (5d); render kaynağı / akış codec'i 8 kontrol taşındı (aşağıda) | — |
| `src/engine/navigation/` (`navigationTypes`, `navAgentProfile`, `localAvoidance`, `recastNavMesh`, `recastTileBuild`, `recastPlanner`, `workers/recastTileWorker`) | `engine/navigation/*.ts` (`navFloorSampler` hariç) | `04b5fb23` | taşındı: import yolları, parametre özellikleri açık alan; `Vec3` legacy'den, `NavigationRole` `physics/collision`'dan. `@recast-navigation/core` `0.43.1` tam sabit (Forge ile aynı, Rapier kuralı gibi). Worker'ın mesaj kısmı `src/runtime`'a ayrıldı (aşağıda); istek işleyicisi ve mesaj tipleri engine'de. `navFloorSampler` taşınmamış `movement/characterCollision`'a bağlı, movement ile gelir | 23 taşındı: `recastNavMesh` 17 (gerçek Recast wasm'ıyla), `navAgentProfile` 2, `navigationTypes` 2, `localAvoidance` 2 | yeşil (2026-11-12) |
| `src/runtime/navigation/recastTileWorker.ts` | `engine/navigation/workers/recastTileWorker.ts` (worker kapsamı) | `04b5fb23` | uyarlandı: worker giriş kodu `runtime` katmanına (tarayıcı worker mesajlaşması; engine'in Node tsconfig'inde `MessageEvent<T>` yok). Worker havuzu Faz 6'da navigation özelliğiyle | Forge'da testi yok (işleyici engine'de test edilir) | derleniyor |
| `src/engine/movement/` (`characterMovementSubsystem`, `characterCollision`, `planarMovement`, `verticalMotion`, `uphillSlowdown`, `locomotionAnimation`, `movementHostTypes`) | `engine/movement/*.ts`; behavior'daki `LaunchOptions` / `TransformSink` → `movementHostTypes` | `04b5fb23` | taşındı / uyarlandı: import yolları, parametre özellikleri açık alan; `PhysicsQuery` `physics/physicsQuery`'den. **Hareketli platform bağı kesildi (K12):** `platforms` seçeneği, alanı, taşıma (carry) hesabı ve `hasGroundProbe`'un platform terimi çıktı; platform bağlamı hep boş (Forge'da platform host'u verilmemiş hâliyle aynı davranış), geri kalan kod aynı | 67 taşındı: `characterCollision` 24, `characterMovementSubsystem` 20 (`tools/engine-tests.ts` içi; araç `input/`'a koymuştu, `movement/`'a taşındı), `locomotionAnimation` 8, `planarMovement` 7, `verticalMotion` 4, `uphillSlowdown` 4 | yeşil (2026-11-12) |
| `src/engine/animation/blendSpace.ts` | `engine/animation/blendSpace.ts` | `04b5fb23` | taşındı (saf; `locomotionAnimation` kullanır) | 2 taşındı | yeşil (2026-11-12) |
| `src/engine/navigation/navFloorSampler.ts` | `engine/navigation/navFloorSampler.ts` | `04b5fb23` | taşındı (movement ile; `PhysicsSurfaceTriangle` `physics/physicsQuery`'den) | `terrainHeightfieldPhysics` +1 | yeşil (2026-11-12) |
| `src/engine/behavior/` (`behaviorSubsystem`, `behaviorTypes`, `scriptMessages`, `behaviorHost`, `actorEvents`) | `engine/behavior/*.ts`; `engine/scene/actorScript.ts`'ten `ACTOR_EVENT_KINDS` / `ActorEventKind` | `04b5fb23` | **uyarlandı / bölündü** (kullanıcı onayı 2026-11-12). Bütçe için tipler `behaviorTypes`'a (1.767 → 1.375 + 343 satır), yöntem gövdeleri aynı. **K12:** veriyle yazılan olay / mesaj bağlamaları (`EventBindings`, `MessageBindings`) yerine kod kaydı: `BehaviorRegistry.get` düz tick fonksiyonu ya da `BehaviorDefinition` (`tick`, `events`, `messages: { tip: { target, handle } }`) döner; aktörün `Behavior` bileşeni (script + parametreler) onu seçer, iç dağıtım aynı (önce olaylar, sonra tick). Kesilenler: `ref(key)` / `ScriptReferences`, `withInterface` / `nearestWithInterface` / `ScriptInterfaces`, `ScriptDispatchers`, `ScriptActor` değişkenleri, `audioComponent` (ses bileşeni; `AudioBus` kalır); `nodeId` dizini yalnız referanslar için vardı, onunla gitti. `PhysicsQuery`, `LaunchOptions`, `TransformSink` physics / movement'tan | 33 taşındı: `behaviorSubsystem.checks` 18 (`tools/engine-tests.ts` içi), `behaviorSubsystem` 6, `scriptMessages` 5, `behaviorTicks` 2 (araç `input/`'a koymuştu), `physicsSubsystem.checks` +2. Bağlama fixture'lı 12 kontrol test köprüsünden geçer (aşağıda), gövde ve assertion'lar aynı. Ses bileşenini sınayan 1 kontrol düştü (D) | yeşil (2026-11-12) |
| `src/engine/math/transform.ts` | `engine/scene/transform.ts` | `04b5fb23` | taşındı (saf Euler yön matematiği; behavior dünya sorguları kullanır) | — | yeşil (2026-11-12) |
| `src/engine/testing/forgeBindings.ts` — **test köprüsü** | — (yeni) | — | test iskelesi (K12, kullanıcı onayı 2026-11-12): Forge fixture'larının `EventBindings` / `MessageBindings` verisini yeni kod kaydına çevirir (Forge okuyucularının süzgeç ve varsayılanlarıyla, bağlama başına parametre ve yazım sırası korunur); `ForgeBindingBehaviorSubsystem` aynı API. Test dosyası yalnız `BehaviorSubsystem` import'unu değiştirir. Faz 6'da iskeleyle silinir | behavior / physics kontrolleri | yeşil (2026-11-12) |
| `src/engine/environment/` (`worldEnvironment`, `sunPath`, `worldClock`, `wind`, `weatherPresets`, `environmentResolve`, `recapturePolicy`, `worldEnvironmentController`) | `engine/environment/*.ts` (`puddleWind` hariç) | `04b5fb23` | taşındı: import yolları, parametre özellikleri açık alan; `LayoutWorldEnvironment` ve çözülmüş bulut / sis tipleri legacy'den | 20 taşındı: `worldEnvironment` 16, `wind` 4 | yeşil (2026-11-12) |
| `src/engine/loading/loadProgress.ts`, `src/engine/perception/perception.ts`, `src/engine/vfx/` (`particleEffectTypes`, `particleEffectParser`, `particleEffectPresets`) | `engine/{loading,perception,vfx}/*.ts` | `04b5fb23` | taşındı (saf; perception `EntityId` / `Vec3` legacy'den) | `loadProgress` 4, `perception` 3, `particleEffectParser` 4 | yeşil (2026-11-12) |
| `src/engine/perf/` (`frameCapture`, `gpuSweep`, `gpuSweepRunner`, `perfWitness`, `distanceUpdateRate`, `gpuFrameStats`) | `engine/perf/*.ts`; `gpuTimer.ts`'ten yalnız `GpuFrameSample` / `GpuFrameStats` tipleri → `gpuFrameStats` | `04b5fb23` | taşındı; WebGL timer query sınıfı (`GpuFrameTimer`) taşınmadı, WebGPU timestamp query Faz 3'te | `gpuSweep` 12, `frameCapture` 10, `perfWitness` 4 | yeşil (2026-11-12) |
| Küçük alanların ertelenenleri | `engine/perf/{qualityProfiles,adaptiveQuality,hardwareHints,gpuTimer}.ts` → **Faz 3** (Forge'un kalite profilleri WebGL renderer ayarları: SMAA, gölge haritası, göl ayrıntıları; profiller Faz 1 kararına göre yeniden kurulur, uyarlamalı kalite denetleyicisi ve donanım ipuçları onlarla gelir). `engine/perf/lakeQuality.ts` → **Faz 7**. `engine/environment/puddleWind.ts` → **5a**. `engine/gameplay/playerSpawn.ts` → **Faz 6** (eski `RoomLayout`'tan doğar; Player Start yeni modelde). `engine/assets` → A10 ile yeniden kurulur (eski merkezî manifest) | `04b5fb23` | ertelendi | bekleyen A (2026-11-12, TSV `deferred` sütunu): kalite / uyarlama / GPU timer 14 + asset perf 3 + starter materyal 1 (Faz 3), Player Start / varsayılan piyon 4 (Faz 6); `perfReadout` 2 ve `windSway` 1 taşındı (aşağıda); eski merkezî manifestin 9 kontrolü D. Faz 3 kararları (kullanıcı, 2026-11-12): WebGL `GpuFrameTimer` kontrolü D'ye (payda 1.021; three WebGPU'da ve WebGL2 backend'inde kendi timestamp'ini kullanıyor; araçta kalite adımında), starter materyal kontrolü paketteki çevrilmiş `forge.material`'leri aynı iddialarla sınar (yol ve normalize çağrısı uyarlanır) | — |
| `src/engine/worldbuilder/` (48 dosya: arazi / ada / makro rölyef / teras, maske, rota, yol sınıfı / profil / spline, kavşak, köprü, sokak, site, çekirdek, program, parsel, arazi kullanımı, bina / çit / donatı yeri, zemin örtüsü, rastgele su, world brief, bölge profili, referans görsel, sahne denetimi, rastgele dünya ve önizleme, `stages/*` üreticileri) | `engine/worldbuilder/**/*.ts` | `04b5fb23` | **uyarlandı** (seçenek B + köken kaydı, kullanıcı kararları 2026-11-12). Recipe'ten aşama / sahiplik / Dry Run yüzeyi çıktı: `ownership` (çıktı hash'leri, foliage kuralı sahipliği, `deletedPlanElements`), `generation.preserveManualOverrides`, `generators` (üretici sürümleri) ve aşamaların `version` alanı. Aşamaların birbirinin çıktısını bulmak için okuduğu köken `recipe.generatedBy` (`placements` / `splines`: `stage`, yol spline'ında `edge`) olarak kaldı; korumalı bölgeler üst düzey `recipe.protectedRegions`'a taşındı. `stage.ts` yalnız aşama sözleşmesi (`planStage` / `applyPlacementGroupChanges` yok); aşamalar level'ın yalnız `instances`'ını okur (`StageLayout`, sınır uyarlaması). `referenceImport`'ta "elle silindi" kuralı çıktı. Algoritma gövdeleri aynı; okuma yolları `ownership.*` → `generatedBy.*` / `protectedRegions` | 132 taşındı: `worldRoute` 8, `briefTerrain` 7, `randomWorld` 11, `worldJunctions` 5, `referenceImport` 5, `macroRelief` 4, `roadProfile` 4, `worldRecipe` 4, `terraces` 3, `sceneCheck` 2; nötr bölge profili fixture'ını (`tests/engine/fixtures/neutral.regionprofile.json`) `node:fs` ile okuyan 9 dosya, 58 kontrol (2026-11-12: `node:fs` ortak fixture okumak için `src` testlerine açıldı, kullanıcı kararı): `worldSettlement` 13, `worldMasks` 10, `worldLandUse` 7, `worldParcels` 6, `worldStreets` 6, `worldFurniture` 5, `regionProfile` 4, `worldBuildings` 4, `worldRoads` 3. `tools/world` ile (2026-11-12) 21 kontrol daha, elle taşındı (araç dosya düzeyindeki Forge bağımlılıkları yüzünden atlıyordu), gövdeler aynı: `randomWorldPreview` 6, `worldBrief` 6 (pilot brief `tests/engine/fixtures/WbPilotValley.worldbrief.json`), `groundCover` 2 ve `randomWorld` +1 (kıyı A1; örtüler paketten etiketle okunur, `data` alınır: okuma satırı not edildi), `randomWorldRequest` 1 (yapım adımları), `wbTestValley` 5 (`testWorlds/` altında). Aynı dosyaların eski level belgesine / Forge araçlarına dayanan M kontrolleri dışarıda; istek / çalıştırma kontrolleri `tools/world/world.test.ts`'te yeni yol kuralıyla yeniden yazıldı. Forge tip hatası: önizlemede `as const` çift yayılımı (açıklamalı `@ts-expect-error`). **D:** Stage Runner / sahiplik yüzeyini sınayan 15 kontrol (`DROPPED_CHECKS`; `worldStage` 7, roads 4, recipe 2, referenceImport 1, settlement 1); bunlardan ana yol spline kontrolü (`world roads: each road edge becomes…`) `build/stageRun.test.ts`'te yeni çalıştırıcıyla yeniden yazıldı (aynı fixture ve spline değerleri; köken `generatedBy`, hash / sürüm yok) | yeşil (2026-11-12) |
| `src/engine/worldbuilder/testWorlds/` (`testWorld`, `wbTestValley`) | `tools/world/testWorld.ts` (`generateTestWorld`, `testWorldValleyX`), `tools/world/wbTestValley.ts` (analitik vadi ve recipe'i) | `04b5fb23` | taşındı (saf); Forge'un eski level belgesini kuran `testWorldLevel` / `generateWbTestValley` ve level yolları alınmadı (editör için test dünyası yazımı gerekirse yeni yazıcıyla) | `testWorld` 2 (+1 yeni: tohum başına deterministik; level yarısı D), `terrainRepair` 4 (`src/engine/terrain`), `wbTestValley` 5 (yukarıda). `tools/world/offroadTestWorld.ts` ve 2 kontrolü **Faz 8** (kullanıcı kararı 2026-11-12) | yeşil (2026-11-12) |
| Dosya düzeyinde ertelenmiş saf kontroller (elle) | `tests/engine/{perfReadout,windSway,wheelSurfaceFx,vehicleRuntime,terrainRender,terrainRenderer,terrainWorldRenderer,worldStreaming}.test.ts`'in A kontrolleri | `04b5fb23` | taşındı (kullanıcı kararı 2026-11-12): dosyaların geri kalanı R / M (render, `src/scene`, runtime modülleri) olduğu için ertelenmişti; gövdeler yalnız taşınmış saf koda iner. Gövdeler ve yardımcıları aynı, yalnız import yolları; modülün yanında aynı adlı test dosyası | 17 taşındı: `wheelSurfaceFx` 4, `terrainWorldRenderer` 3, `perfReadout` 2 (`src/runtime/audio`), `vehicleRuntime` 2, `terrainRenderer` 2, `worldStreaming` 2 (tile akış codec'i), `terrainRender` 1, `windSway` 1 | yeşil (2026-11-12) |
| `src/engine/worldbuilder/build/` (`temporarySteps`, `worldBuild`, `stageRun`, `worldLevel`) | `tools/world/worldBriefTemporarySteps.ts`; `tools/world/worldBriefBuild.ts`'in kurulum kısmı (`buildWorldFromBrief`: arazi, boya, ped, aşamalar, bake, yerleşim) | `04b5fb23` | `temporarySteps` taşındı (saf). `worldBuild` **uyarlandı** (tasarım kullanıcı onayıyla 2026-11-12): sıra ve sayılar aynı; aşamalar Forge'un `planStage`'i yerine `stageRun`'la koşar (taze kurulumda kalan kısmı: doğrulama, kaydın yuvarlaması, var olan kimliğe yazmama, `generation.stages` / `generatedBy` / `generated`); kaydedici doğrulayıcıları, foliage kuralları (5c), Lake / River / Ocean aktörleri (Faz 7) ve greybox ışık / gökyüzü (Faz 3) yok, `deferred`'a yazılır; projede asset'i olmayan model satırı hata yerine rol renkli placeholder (`shape:cube` + `furnitureColor`). `worldLevel` yeni: yerleşim → aktör (`forge.shape` / `forge.staticMesh` + `forge.worldRole`; 2026-11-12'den beri içe aktarıcıyla ortak `src/engine/forgeImport/placements.ts`), terrain aktörü + veri belgesi, Player Start adlı aktör, deterministik kimlikler, diskteki recipe'te boş `generatedBy` | yeni testler (`worldBuild` 4, `worldLevel` 6) | yeşil (2026-11-12) |
| `src/engine/forgeImport/` (`ids`, `placements`, `fields`, `forgeLevel`) | `worldbuilder/build/worldLevel.ts`'in yerleşim → aktör kısmı (bu depoda yazılmıştı); Forge'un `RoomLayout` / `worldCell` / `LayoutLandscape` / `LayoutHeightFog` biçimi okunur | — | **yeni** (içe aktarıcı, kullanıcı kararları 2026-11-12): yerleşim → aktör çevirisi World Builder ile ortak (`placementGroupActors`: `shape:` → `forge.shape`, model → `forge.staticMesh`, `marker:playerStart` → Player Start aktörü, rol / aşama → `forge.worldRole`; çözülemeyen model ve dönüştürücüsü olmayan marker sayılır), terrain aktörü; `worldLevel` onu kullanır, davranışı ve testleri aynı. `importForgeLevel`: level + hücre dosyaları + terrain tanımları → yeni level (hücre boyutu Forge ana ızgarasından, atama konumdan), terrain veri belgesi (tanım olduğu gibi), `forge.heightFog` aktörü; çevrilmeyen her alan faz tablosuyla (`fields.ts`) raporlanır, bilinmeyen alan `?`. Kimlikler kaynak yoldan (`forgeLevelId`, `forgeAssetId`, aktör: yerleşim kimliği ya da dosya + asset + sıra; çift kimlik ayrıştırılır) | `forgeLevel.test.ts` 9 | yeşil (2026-11-12) |
| `tools/import-forge-webgl/` (`forgeSource`, `provenance`, `assetPlan`, `levelRead`, `importRun`, `report`), `tools/import-forge.ts` | Forge'da karşılığı yok (Forge level'ları kendi biçimindeydi) | — | **yeni** (kullanıcı kararları 2026-11-12): `npm run import:forge -- --forge <public> --project <dir> --level <yol>… [--assets id,…] [--dry-run] [--force] [--report <md>]`. Köken tablosu (`provenance.ts`, sıralı kurallar: Kenney / Quaternius dışarıda, Gaz-52 CC-BY-4.0, Poly Haven CC0-1.0, ThreeAges / AI / proje içi `LicenseRef-forge-project`, SPDX olduğu gibi, gerisi `LicenseRef-forge-unverified` + manifest metni); asset planı model → `.materials.json` slotları → materyal → doku zinciriyle (materyal Faz 3'te, dokuları şimdi), diğer türler fazıyla, K12 türleri listelenir; level + hücreler + terrain (tile'lar bayt bayt) + World Builder yan dosyaları (iç yollar yeni dosya etiketlerine, bölge profilinin asset kimlikleri GUID'e; eski recipe defteri nesnelere `forge.worldRole.stage`, korumalı bölgeler üst düzeye: seçenek B); projede o GUID'le başka yerde duran asset (paket) yeniden kopyalanmaz; tek atomik kayıt, var olan level `--force` ister, yeniden çalıştırma aynı baytları yazar. WbPilotValley denemesi: 151 yerleşim, 45 hücre, 41 asset; World Builder içe alınan brief'ten aynı 152 aktörü placeholder'sız kurar. Aynı çalıştırmada iki level'ın paylaştığı yan dosya (Island'ın brief'i pilotun profilini anar) bir kez, ilk yerleştiği yere yazılır. `--compare` (`compare.ts`): yazılan level'ı kaynağıyla bağımsız sayar (ham kaynak dosyaları / diskteki level klasörü), bilinen sebebi olmayan farkta hata | `import.test.ts` 8 | yeşil (2026-11-12) |
| `src/features/{model,texture,sound}/` | Forge `engine/assets/manifest.ts` asset türleri (`model`, `texture`, `sound`) | — | **yeni**: yalnız-şema ikili türler `forge.model` (glb, gltf), `forge.texture` (png, jpg, webp, ktx2), `forge.sound` (wav, ogg, mp3), sürüm 1'de içe aktarma ayarı yok (Faz 3'te sürüm 2). `forge.staticMesh.mesh` artık `forge.model` gösterir | `binary-types.test.ts` 3 | yeşil (2026-11-12) |
| `tools/world/` (`worldProject`, `worldWrite`, `worldBriefRun`, `randomWorldRun`, `randomWorldRequest`, `worldCli`), `tools/world-{random,brief}.ts` | `tools/world/{worldBriefRun,randomWorldRun,randomWorldRequest}.ts`, `build-{random-world,world-brief}.mjs` | `04b5fb23` | **yeniden yazıldı** (yeni level formatı): proje + asset dizini üzerinden okur (girdiler dosya etiketiyle), level'ı kayıt servisinden tek atomik kayıtla yazar (ikililer sahneleme kanalından; eski hücre / terrain dosyaları silinir), `--force` olmadan var olan level'a yazmaz ve level kimliğini korur, başarısız kurulumda önceki brief'i geri koyar. `randomWorldRequest` taşındı; yalnız `out` kuralı level klasörüne uyarlandı. `samples/` ve `tests/fixtures/` hedef olamaz. `npm run world:random` / `world:brief` | `tools/world/world.test.ts` 10 (Forge'un istek kontrolleri yeni yol kuralıyla burada) | yeşil (2026-11-12) |
| `content/packs/starter/` (`starter-content/`, `DevelopmentContent/`) | Forge `public/assets/` @ `92a709aa` (`public/assets` etiketten beri değişmedi) | `92a709aa` | **içe aktarıldı** (kullanıcı kararları 2026-11-12): yalnız motor varsayılanları tohum grubu (`tools/import-forge-webgl/starterSeeds.ts`: taşınan kodun adla başvurduğu 20 kimlik), model → materyal → doku kapanışıyla 28 asset (doku 23, ses 5), 21,8 MB; materyaller 10 Faz 3'te. Lisans: unverified 11, proje 14 (proje içi 8, AI 4, ThreeAges 2), Poly Haven CC0 3. Lisansı bilinmeyenler de pakette (kullanıcı kararı; sorumluluk kullanıcıda). Referans level'ların geri kalan asset'leri ve araç / kırılabilir grupları pakete girmedi. `.gitattributes`'a `wav` / `ogg` / `mp3` ikili | `import.test.ts` (paket kipi) | `verify:assets` yeşil (2026-11-12) |
| `content/packs/worldbuilder/` | `public/assets/world-builder/covers/*.cover.json`; nötr profil `tests/engine/fixtures/neutral.regionprofile.json`'dan | `04b5fb23` | taşındı: altı örtü ön ayarı `forge.groundCover`, nötr profil (`id` / `label` değişti, yol meshAsset'i çıktı) `forge.regionProfile` veri belgesi. `randomWorld.ts`'in `COVERS` ve `DEFAULT_REGION_PROFILE` sabitleri paket etiketlerine döndü (Forge'un varsayılan profili pilot oyunun verisiydi). İçerik Forge'daki gibi: katman materyalleri Faz 3, bitki kuralları 5c | — | — |
| `src/runtime/worldbuilder/randomWorldPreviewWorker.ts` | `engine/worldbuilder/workers/randomWorldPreviewWorker.ts` | `04b5fb23` | uyarlandı: worker giriş kodu `runtime`'a (Recast gibi); World Builder penceresi 5d'de | — | derleniyor |
| `src/engine/legacy/` World Builder sınırı | `layout.ts`'ten `LayoutPlacement` / `LayoutModelInstances` (K12: `audio` ve `movingPlatform` alanları çıktı; `fracture` Faz 8'i bekliyor) ve `RoomLayout`'un yalnız `instances` dilimi; `shapes.ts`'ten placeholder küp kimlikleri; `placementIdentity.ts`'ten kimlik / rol doğrulayıcıları | `04b5fb23` | geçiş: aşamaların bellekteki çıktı tipi. `tools/world` yeni level formatını yazıyor (2026-11-12: `build/worldLevel` yerleşimleri aktöre çevirir), tipler aşamaların iç verisi olarak kaldı; `legacy` Faz 6'da silinmeden önce yalnız adı değişerek `src/engine/worldbuilder`'a taşınır | — | — |
| `src/engine/terrain/lakeBed.ts`, `src/engine/water/oceanBudget.ts` | `engine/scene/lakeBed.ts` (`lakeBedDistance`, `lakeBedTarget`, `BedPoint`), `engine/scene/oceanBudget.ts` | `04b5fb23` | taşındı (saf; `briefTerrain` göl yatağı oyar, rastgele dünya okyanus bütçesini okur). Göl / okyanus modelinin kendisi Faz 7 | — | yeşil (2026-11-12) |
| `src/engine/testing/worldStagePlan.ts` — **test iskelesi** | `engine/worldbuilder/stage.ts` (Stage Runner) | `04b5fb23` | iskele (seçenek B): Forge'un `planStage` / `applyPlacementGroupChanges`'ı, aşama kontrolleri birebir koşsun diye; defter `recipe.generatedBy` (hash yok, elle düzenleme algılanmaz), korumalı bölgeler üst düzeyden, üretici sürümü yok (`SCAFFOLD` notlu satırlar). Ürün kodu değil; çıktıyı level'a `tools/world` yazar | aşama kontrolleri | yeşil (2026-11-12) |
| `src/render/host/` (`renderHost`, `backendProof`, `perfSampler`, `badge`), `src/render/pipeline/directPipeline.ts` | `engine/render-three/renderer.ts`; spike `spikes/webgpu/shared/spike.ts` (`createSpikeRenderer`, `startMeasuredLoop`) | `04b5fb23` | **yeniden yazıldı** (Faz 3 adım 1, 2026-11-13): `WebGLRenderer` → `WebGPURenderer` (`trackTimestamp`, `reversedDepthBuffer`, `antialias: false`), backend kanıtı S1 biçiminde (`data-forge-backend`, tamamı `data-forge-backend-proof`), `data-forge-perf` taşınmış `perfWitness` ile, GPU süresi timestamp sorgusundan; rozet; DPR + `ResizeObserver`; cihaz kaybı v1 (karar 10). Forge'un `info.autoReset = false` / `beginRenderStatsFrame`'i gerekmedi (karede tek `render`; pipeline adımı 6'da yeniden bakılır), PCF gölge ayarı adım 3'te, `maxPixelRatio` kalite profiliyle adım 2'de (şimdilik en çok 2) | Forge'da testi yok; rozet kuralı 2 yeni kontrol (`badge.test.ts`) | yeşil; smoke WebGPU'da (2026-11-13) |
| `src/render/resources/` (`resourceCache`, `worldResources`, `gltfModels`, `assetUrls`, `shapes`), `src/render/materials/shapeMaterial.ts` | `engine/render-three/{gltfLoader,gltfModelLoader}.ts`, `src/scene/shapePrimitives.ts`; spike `shared/content.ts` | `04b5fb23` | **uyarlandı / yeniden yazıldı**: `GltfModelLoader`'ın söz haritası → host'un GUID anahtarlı önbelleği, World başına sayaçlı (A6); başarısız yükleme tutulmaz (Forge kuralı aynı); `meshoptimizer` paketi ve `public/vendor/basis` kopyası yerine three'nin `examples/jsm/libs`'i (`MeshoptDecoder`; basis transcoder Vite `?url` + `LoadingManager` URL değiştiricisi); GUID → URL dev server'ın yeni `GET /__forge/asset-files` ucundan; şekil ölçüleri Forge'unki, `MeshStandardMaterial` → `MeshStandardNodeMaterial` (pürüzlülük 0,7, metallik 0, düzlem çift yüz), renk bileşenin. Doku anizotropisi ve eksik normal hesabı adım 4 / 6'da, `disposeGltfResources` sayaç sıfırlanınca atmayla 5b'de | yeni: `resourceCache` 6, iki World `renderWorlds` 2, `forgeServer` +1 uç. **R:** "scene runtime computes local model bounds keyed by asset id" (`engine-tests` 1996) adım 8'e (instancing / culling sınırları); "static mesh material slots follow unique GLB material order" (19411) adım 4'e | yeşil (2026-11-13) |
| `src/render/sync/` (`renderBinding`, `renderWorld`, `defaultLighting`, `transforms`), `src/render/viewer/` (`levelViewer`, `cameraPose`), `src/runtime/boot.ts` render aşaması | `src/scene/{SceneRuntimeCore,RuntimeSceneApp}.ts` (referans), `src/play/cameraHandoff.ts`, `engine/render-three/camera.ts` | `04b5fb23` | **yeniden yazıldı**: render bağlaması sözleşmesi ve `forge.render` alt sistemi yeni; varsayılan güneş `ensureDefaultSceneLights`'ın değerleri (beyaz, 2, [-55, 35, 0]); ortam ışığı ve arka plan Forge world settings varsayılanları (ortam 0 → Forge gibi eklenmez, arka plan `#d7d7c7`) adım 5'e kadar; kamera 44° / 0,1 / 2.000 m; poz devri aynı anahtar ve biçim; oda sınırı çerçevelemesi `Box3.setFromObject` (asset süzgeci yok) | yeni: `boot.test` render aşaması 3, `transforms` 3, `cameraPose` 3. **R:** "scene runtime inserts one default sun when a layout has no lights" (1661) **yeniden yazıldı** (`renderWorlds.test.ts`); "builds entities in instance -> character -> light order" (2353) ve "startup feeds entities to both sinks, then inits, then starts" (2393) **düştü** (World yaşam döngüsü yerini aldı: `world.test.ts`, `boot.test.ts`); "sceneModelAssetIds … excludes procedural shapes" (1679) **düştü** (şekil asset değil, karar 11; bağlamalar modeli bileşenden ister); "room bounds unions placements and honors asset filters" (1737) adım 8'e (görüntüleyici kamerası) | yeşil (2026-11-13) |
| `src/features/height-fog/render.ts` | `engine/render-three/heightFog.ts` (`HEIGHT_FOG_FRAGMENT`, `updateHeightFog`) | `04b5fb23` | **yeniden yazıldı (TSL)**: GLSL `onBeforeCompile` yaması yerine sahnenin sis düğümü (`scene.fogNode`); analitik yoğunluk integrali, açık mesafe, en yüksek opaklık, linear kip ve güneş lobu aynı formül; değerler uniform, yalnız sisin gelip gitmesi shader'ı değiştirir. Eski `FogExp2` yolu (`applySceneFog`) gerekmedi | **R:** `heightFog.test` "material patch chains existing shader code…" ve "cloned compile hooks bind their own uniforms once" **düştü** (GLSL yaması yok); "clear distance, altitude and opacity cap…" (CPU ikizi `heightFogOpacityAt`) adım 5'e (görüş mesafesiyle) | smoke'ta çiziliyor (2026-11-13) |
| `src/features/{shape,static-mesh}/render.ts` | `engine/render-three/models.ts` (`createInstancedModelGroup`), `src/scene/shapePrimitives.ts` | `04b5fb23` | **yeniden yazıldı**: bileşen başına mesh / model klonu, dünya matrisi aktör + bileşen zincirinden; asset başına `InstancedMesh` adım 8'de, yerleşim rengi / gölge / materyal slotu `forge.staticMesh` sürüm 2'yle adım 4'te | `models.ts` kontrolleri adım 8'de | smoke yeşil (2026-11-13) |
| `tests/smoke/` (`npm run smoke:render`, `tsconfig.smoke.json`) | `ForgeReference/baseline/tools`, spike `run.mjs` | — | **yeni** (mimari §4.10): `@playwright/test` 1.61.1 (Forge'daki, tam sabit), başlıklı Chrome, port 5283, referans projesi; hazır `data-forge-ready`, `page.screenshot({ clip })`, boş görüntü (parlaklık ortalaması / standart sapması), WebGPU olmayan ya da kaynak hatalı koşu başarısız; referans yoksa aday `render-refs/candidates/`'e, kayıt `render-refs/runs/`'a | L03 × p1 | yeşil, aday yazıldı (2026-11-13) |

İşlem: taşındı / uyarlandı / yeniden yazıldı. Testler: taşınan / yeniden yazılan
/ düşen sayısı (2b test sınıflamasına göre).

**Taşıma kalıbı (ses ile kuruldu, 2026-11-11):** kod `src/engine/<alt sistem>/`
(DOM'suz, düz Node'da yüklenir; `tsconfig.tools.json` ve `verify:node-load`
zorlar), tarayıcı API'si gereken kısım `src/runtime/<alt sistem>/`. Forge
kontrolleri gövdeleri değişmeden modülün yanındaki `*.test.ts`'e kopyalanır;
`const check = test` (Vitest), assertion'lar `node:assert` ile aynı kalır
(`src-tests-node-assert-only`). Bir kontrol etiketiyle taşınır;
`npm run port:forge-tests` etiketleri eşleyip ilerlemeyi sayar (§2.1).
Araçlar: `npm run port:forge -- tests <alan> --forge <Forge> [--write]` bütün
import'ları taşınmış kontrolleri taşır ve kalanları neyin beklettiğini sayar;
`closure` bir taşımanın kapsamını, `subset` eski büyük dosyadan gereken
bildirimleri, `members` bütçeyi aşan dosyanın bölme planını çıkarır.
Dönüşümler (import yolu, parametre özelliği, taşıma notu)
`tools/port/portFiles.ts`'te.
Ses alanında kalanlar: 2 A `perfReadout` (perf ile), 1 A çarpışma davranışı
(behavior ile), 8 M (behavior / scene ile yeniden yazılır).

**Test iskelesi (kullanıcı kararı 2026-11-11):** Forge'da physics / behavior /
movement testlerinin çoğu alt sistemleri eski uygulama döngüsüyle
(`EngineApp` + `SubsystemRegistry`) tick'liyor; 2a World bu döngünün yerini
aldı. Kontroller birebir kalsın diye döngü `src/engine/testing/`'e iskele
olarak taşındı; ürün kodu onu import edemez (`engine-testing-is-test-only`,
kasıtlı ihlalli). Taşınan alt sistemler Forge biçimini (`src/engine/subsystem.ts`)
uygular. Faz 6'da her alt sistem özelliğiyle World'e bağlanır, testleri
World'e çevrilir ve iskele silinir.

**Geçiş modeli (kullanıcı kararı 2026-11-11):** physics ve movement varlık
verisini Forge'un eski bileşen modelinden okur (`readColliderComponent(entity)`
vb.). Yalnız gereken okuyucular `src/engine/legacy/`'de; yalnız `src/engine`
import eder (`engine-legacy-stays-in-engine`, kasıtlı ihlalli). Faz 6'da
şemalı bileşenler gelince silinir.

**Taşınan Forge testlerinin tipleri:** Forge testleri esbuild ile koşuyordu,
tip denetiminden hiç geçmemişti. `tsconfig.tests.json` testler için
`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`'ı kapatır
(ürün kodu sıkı kalır). Kalan birkaç Forge tip hatası açıklamalı
`@ts-expect-error` ile işaretli; kontrol kodu değişmez.

**Terrain ile gelen altyapı düzeltmeleri (2026-11-12):**

- Vitest `testTimeout` 30 sn (`vite.config.ts`): Forge kontrollerinin süre
  sınırı yoktu; tohumlu taramalar (terrain LOD, 180 kamera) paralel koşuda
  5 sn'yi aşıyor. Kontrol gövdesi değişmez.
- `spellOutParameterProperties` yalnız varsayılan değerli parametre özelliğini
  (`capacity = 80`) tipsiz alana çevirir; TypeScript tipi kurucudaki atamadan
  çıkarır.
- Kayıt tarzı test dosyalarında `register…(check, checkAsync)` her parametreye
  Vitest `test`'i alır (önce yalnız ilki geçiyordu).
- `port:forge-tests` döngüde üretilen etiketli kontrolleri (şablon) kaynak
  metniyle eşler; taşınan kontrol şablonu birebir taşıdığı için eşleşir. Önce
  hiç sayılmıyor, `tests --write` onları yeniden taşınacak sanıyordu.
- Bir test dosyası yeniden üretilecekse önce silinir ve `port:forge-tests`
  ile TSV tazelenir; yoksa araç TSV'de taşınmış görünen kontrolleri dışarıda
  bırakır. Kontrolleri birden çok alana yayılan dosyalar `tests "."` ile yazılır.
- Async kayıt fonksiyonları (`export async function register…`) üst düzey
  `await` ile çağrılır: Recast kayıt fonksiyonu ilk kontrolden önce wasm'ı
  bekliyor, beklenmeyince Vitest hiç kontrol toplamıyordu. Önceden taşınan
  async kayıtlar da `await`'li yapıldı; koşu sayısı değişmedi (hepsinde ilk
  `await` bir `checkAsync`'ti), yani kayıp kontrol yoktu (navigation ile).
- İsteğe bağlı parametre özelliği (`physics?: PhysicsQuery`) açık alana
  `physics?: PhysicsQuery | undefined` olarak yazılır (`exactOptionalPropertyTypes`;
  movement ile).
- Kontrol düzeyinde D listesi (`DROPPED_CHECKS`, `tools/port/forgeTests.ts`):
  modül sınırında görünmeyen bir K12 kesintisini sınayan kontrol dosya +
  etiketle düşer. İlki ses bileşeni kontrolü (behavior ile); payda 923 → 922.
  World Builder seçenek B'nin Stage Runner / sahiplik kontrolleri (15): payda 907.
  Forge'un eski level belgesini sınayan 2 kontrol (`testWorldLevel`, `worldDataCheck`'in
  `isLevelDocument`'ı; kullanıcı kararı 2026-11-12): payda 905. `testWorld`'ün üretici yarısı
  (tohum başına deterministik) yeni bir testte korundu.
- Çalışma anında kurulan yolla içerik okuyan test dosyası (`RUNTIME_CONTENT`,
  `tools/port/portChecks.ts`): literal taraması görmediği içerik listelenir,
  dosyanın kontrolleri içerik gelene kadar bekler (ilki zemin örtüsü ön ayarları).
- Seçenek B'de yalnız alan yolu değişen 9 kontrol (`ownership.protectedRegions` →
  `protectedRegions`, `ownership.splines|placements` → `generatedBy.*`): dosya
  başında not; doğrulanan değerler aynı.
- Kalan Forge tip hatası kalıpları (hepsi açıklamalı `@ts-expect-error`):
  geri çağırmada atanan `let`'in `never`'a daralması, kısmi `PhysicsQuery`
  taklidi, JSON bileşen verisinden geniş tipli collider, `as const`
  fixture'ın readonly olması, dizi literalinin sabit uzunluklu tuple'a
  geçmesi, birleşim tipinin daraltılmadan okunması, `noUncheckedIndexedAccess`.

### 2.1 Test sınıflaması

2b'nin ilk işi (plan Faz 2b, arşivi [`docs/archive/PHASE_2B.md`](archive/PHASE_2B.md)). Kaynak Forge `forge-webgl-final` (`04b5fb23`).
Araç `npm run port:forge-tests -- --forge <Forge checkout>`. Taranan
ağaçlarda yerel değişiklik olmamalı; etiketten sonraki commit'ler taranan
TypeScript / JSON dosyalarına dokunmamalı (yoksa etiket checkout edilir).
Kontrol başına satırlar
[`docs/port/forge-engine-tests.tsv`](port/forge-engine-tests.tsv)'de.

**Kapsam:** `tests/engine/` altındaki 176 dosya ve `tools/engine-tests.ts`
içindeki satır içi kontroller. Hepsi `test:engine` koşucusuna bağlı; üç dosya
başka bir test dosyası üzerinden. Birim, bir kontrol yeridir: bir `check`,
`checkAsync` ya da `checkSlow` çağrısı. 2.588 yerin 13'ünün etiketi koşuda
üretilir (döngü). Forge koşusunda (`test:engine`, etikette) 2.600 kontrol
geçer, 10 yavaş kontrol atlanır: toplam 2.610 koşu, çünkü döngüdeki 13 yer
birden çok koşu üretir.

**İlerleme:** `npm run port:forge-tests` bu deponun `src/**/*.test.ts`
dosyalarındaki etiketleri Forge kontrolleriyle eşler; TSV'nin `ported`
sütunu kontrolü taşıyan dosyayı gösterir. 2026-11-11: **A 214 / 923** (ses 37, UI 50, input 4, zaman 5, iş bölme 1, perf 20, iskele 1, physics 96). Hareketli platform D'ye geçince payda 927'den 923'e indi.
2026-11-12: **A 370 / 923** (terrain 153, physics 2, perf 1); navigation ile **A 393 / 923**; movement ile **A 469 / 923** (movement 67, animation 2, physics +6, terrain +1); behavior ile **A 502 / 922** (behavior 33; ses bileşeni kontrolü D); küçük alanlarla **A 559 / 922** (environment 20, perf 26, loading 4, perception 3, vfx 4); worldbuilder ile **A 612 / 907** (worldbuilder 53; Stage Runner kontrolleri D); `node:fs` izniyle **A 670 / 907** (worldbuilder +58); `tools/world` ile **A 697 / 907** (worldbuilder +21, test dünyaları 2, terrain onarımı 4). Eski level belgesi kontrolleri D'ye geçince **A 697 / 905**; off-road test level'ının 2 kontrolü **Faz 8'e** ertelendi (terrain deformasyonu / araç yüzeyi smoke fixture'ı, orada yeni formatla üretilir; kullanıcı kararı 2026-11-12). Kırılma + göçük algoritmalarıyla **A 785 / 905** (physics +88). Araç kontrolleriyle (`surfaceResponse` 20, `vehicleDrivetrain` 13, `vehicleAssets` 1; GAZ-52 tanımı test fixture'ı) **A 819 / 905**. Physics'te bekleyen: runtime kabuğu 7 (`wheelSurfaceFx` 4, `vehicleRuntime` 2: Faz 6; off-road 1: Faz 8).
**Kalan A dökümü (kullanıcı kararı 2026-11-12):** taşınmayan 86 A gövde düzeyinde yeniden okundu. Eski merkezî asset manifesti / sağlığı 9 (`contentLoading` 4, `engine-tests` 5; A10 asset dizini ve `verify:assets` yerini aldı), `templates/*/main.ts` import listesi 2 (`forge check` import sınırı) ve Forge klasör düzenini okuyan worldbuilder bağımlılık kontrolü 1 (katman kuralları) **D**; `terrainSplineData`'nın kayıt anlık görüntüsü kontrolü eski `terrainSaveValidator`'a bağlı, araç onu eski model alanı sayar (**M**, 5a terrain kaydıyla yeniden yazılır); `engine-tests`'in `checkSlow` / `checkSlowAsync` sarmalayıcılarındaki iki `check(label, fn)` kontrol yeri değil, araç kendi etiket ve gövde parametresini ileten çağrıyı saymaz (2.586 yer). Payda **890**. Ertelenen A'lar paydada kalır; araç TSV'nin `deferred` sütununa fazını yazar (`DEFERRED_CHECKS`) ve faz başına sayar: Faz 3 18, 5a 4, 5b 2, 5d 4, Faz 6 4, Faz 7 20, Faz 8 2. Her faz kapısı kendi ertelenen A'larını yeşil ister. Dosya düzeyinde ertelenmiş ama gövdesi yalnız taşınmış saf koda inen 17 kontrol elle taşındı (`perfReadout` 2, `windSway` 1, `wheelSurfaceFx` 4, `vehicleRuntime` 2, terrain render kaynağı / codec 8): **A 836 / 890**, fazı yazılmamış taşınmayan A yok; 2b "Taşıma" kutusu bu ölçütle kapandı.
**Kayıt oyunu + World Partition sınıflaması (kullanıcı kararı 2026-11-12):** `engine/world` ve `engine/persistence` toptan değil modül düzeyinde eski model sayılır (`OLD_MODEL_MODULES`: `worldPartition`, `foliageCells`, `hlod`, `openWorldSetup`, `foliageWorker`; `saveGameState`, `saveEntityKeys`); geri kalanı (akış politikası, hücre yerleşim planlayıcısı, eşzamansız yükleyici, residency, görüş mesafesi, culling, kaskat, takipli gölge, foliage halkası, dünya haritası, durum belleği, slot deposu, kullanıcı ayarları) saf hesaptır, 129 kontrol M → A. Slot yükünde ya da etiketinde level yolunu yalnız metin olarak taşıyan 3 kontrol A (`OPAQUE_LEVEL_PATH_CHECKS`). D'ye 40: eski kayıt kimliği çevirisi 5, `flags` / level yolu taşıyan serileştirici 2, yeni belgeyle yeniden yazılan "eşleşen level'da uygula" 1, eski `RoomLayout` bölme / hücre dosyası 17 (`worldPartition`, ışık tepe sayımı 2 hariç: 5b'de M) + 8 (`serializationDrift`) + 5 (`worldCellPersistence`), eski bölümlenmiş pilot level 2 (`wbPilotValley`). Payda **1.022**; ertelenen A: Faz 3 40, 5a 4, 5b 54, 5c 8, 5d 4, Faz 6 5, Faz 7 20, Faz 8 2; bu kutuda taşınacak 49 (yerleşim planlayıcısı 20, akış politikası 16, ızgara 4, durum belleği 4, slot deposu 4, slot arayüzü 1). **A 836 / 1.022.**
**Faz 3 adım 1 (dikey dilim, 2026-11-13):** A değişmedi (**885 / 1.022**; bu adımın ertelenen A'sı yok, GPU timer D'si adım 2'de). Adıma düşen R kontrollerinin akıbeti §2 satırlarında: 1 yeniden yazıldı (varsayılan güneş), 5 düştü (eski varlık sırası / başlatma 2, prosedürel şekil asset listesi 1, sis GLSL yaması 2), 4 sonraki adımlarda (model sınırları ve oda sınırı adım 8, GLB slot sırası adım 4, sisin CPU ikizi adım 5).

**Sınıflar.** Her kontrol, değer düzeyinde ulaştığı Forge modüllerine göre
sınıflanır. Ulaşım sözcüksel kapsamla izlenir: kontrolün gövdesi ve onun
kullandığı yerel yardımcılar. `import type` sayılmaz. Bir kontrol birden çok
sınıfa uyuyorsa öncelik D, R, M, A sırasıyla.

| Sınıf | Ne | Kontrol yeri | Ne olur |
|---|---|---|---|
| **A** algoritma | Yalnız three'siz, eski modele ait olmayan ve taşınan modüllere ulaşır | **927** | 2b'de mekanik çevrilir (`check()` → `test()`). **"Taşınan testler yeşil" kapısının paydası** |
| **M** eski veri modeli | `engine/scene`, `engine/persistence`, `engine/world`, `src`, `editor`, `game`, `project`, `templates`, `tools/saveValidator`, `tools/droppedFields` modüllerine ya da eski biçimli level / layout verisine ulaşır | 935 | Alt sistemi taşınırken yeni modele göre yeniden yazılır ya da düşer; karar alt sistemin §2 satırında |
| **R** render | three'ye render için ulaşır: `engine/render-three`, `src` uygulama katmanı ya da testin kendisinin kurduğu three nesnesi | 618 | 2b'de taşınmaz; render'ı yeniden yazan fazla (3, 5–8) birlikte yeniden yazılır ya da düşer |
| **D** taşınmaz | Plan K12 ile taşınmayan bir modüle doğrudan ulaşır: `engine/dialogue`, `tools/dialogue*`, `engine/ai`, `engine/physics/ragdoll.ts`, `engine/audio/soundCue*` | 108 | Düşer. Kod `forge-webgl-final` etiketinde durur |

- **K12'nin etkisi (2026-11-11):** ilk sınıflamada A 1.010, M 959, R 619
  idi. Taşınmayan modüllere doğrudan ulaşan 95 kontrol D oldu; payda
  1.010'dan 940'a indi. Ses taşınırken Sound Cue'nun (INV-E15) 13 kontrolü de
  D'ye geçti: payda **927**. Taşınmayan bir modülü yalnız daha aşağıda import eden
  kontrol sınıfını korur, çünkü o import taşımada kesilir.
- **A'nın 434'ü sınırda uyarlama ister.** Hepsinde test edilen modül daha
  aşağıda eski modele iniyor. 86'sı ayrıca `engine/physics/ragdoll.ts`'e
  (three'nin `Vector3` / `Quaternion`'ı) iniyor: `physicsSubsystem`,
  `behaviorSubsystem` ve `defaultInputBindings` ona bağlı. Ragdoll K12 ile
  taşınmadığı için bu bağ taşımada kesilir.
- **`engine/scene` yalnız veri modeli değil.** İçinde algoritmik parçalar da
  var: landscape, waterBody, collision, spline doğrulama. Mimari raporda
  `scene` yeniden tasarlandığı için bu parçaların testleri M sayıldı.
  Algoritmalar o tasarımda korunur.
- **Sınır.** Yardımcıya argümanla geçen veri ve sonradan atanan paylaşımlı
  `let` durumu izlenmez. Bu yüzden bir kontrol olduğundan temiz (A) görünebilir.
  Taşımada sınıfı yanlış çıkan kontrol, alt sistemin §2 satırında not edilir.
- **Kapsam dışı:** `tests/builder/*.test.mjs` (8 dosya, `node:test`; build
  hattı Faz 4 dist doğrulaması ve Faz 6 oyun build'iyle gelir) ve Playwright
  smoke spec'leri (§1'de özellik başına) bu paydaya girmez.

Alan başına dağılım (bir kontrol, ulaştığı ilk `engine/*` alanında sayılır;
yoksa ilk alanında):

| Alan | A | M | R | D |
|---|---|---|---|---|
| engine/physics | 210 | 56 | 67 | 3 |
| engine/render-three | 0 | 0 | 300 | 0 |
| engine/scene | 0 | 258 | 31 | 0 |
| engine/terrain | 188 | 40 | 4 | 0 |
| src | 0 | 133 | 88 | 0 |
| engine/world | 0 | 185 | 5 | 0 |
| engine/worldbuilder | 143 | 23 | 0 | 0 |
| engine/core | 57 | 6 | 32 | 0 |
| engine/ai | 0 | 0 | 0 | 69 |
| tools/saveValidator | 0 | 68 | 0 | 0 |
| engine/input | 28 | 6 | 32 | 0 |
| engine/perf | 40 | 11 | 14 | 0 |
| engine/behavior | 33 | 29 | 0 | 0 |
| engine/audio | 39 | 8 | 0 | 13 |
| engine/movement | 53 | 0 | 1 | 0 |
| engine/ui | 50 | 1 | 0 | 0 |
| engine/assets | 11 | 22 | 11 | 3 |
| engine/environment | 23 | 8 | 14 | 0 |
| editor | 0 | 16 | 11 | 0 |
| engine/navigation | 23 | 1 | 2 | 0 |
| engine/persistence | 0 | 20 | 0 | 0 |
| tools/droppedFields | 0 | 19 | 0 | 0 |
| engine/dialogue | 0 | 0 | 0 | 18 |
| engine/vfx | 4 | 8 | 0 | 0 |
| (none) | 6 | 2 | 2 | 0 |
| engine/gameplay | 4 | 4 | 0 | 0 |
| tools/world/randomWorldRequest | 0 | 5 | 0 | 0 |
| tools/worldDataCheck | 1 | 4 | 0 | 0 |
| engine/loading | 4 | 0 | 0 | 0 |
| engine/animation | 2 | 0 | 1 | 0 |
| engine/perception | 3 | 0 | 0 | 0 |
| tools/assetPerfReport | 3 | 0 | 0 | 0 |
| tools/dialoguePipeline | 0 | 0 | 0 | 2 |
| tools/world/hlodBuild | 0 | 0 | 2 | 0 |
| tests | 0 | 0 | 1 | 0 |
| tools/terrainOrphans | 1 | 0 | 0 | 0 |
| tools/world/randomWorldRun | 0 | 1 | 0 | 0 |
| tools/world/testWorld | 1 | 0 | 0 | 0 |
| tools/world/wbTestValley | 0 | 1 | 0 | 0 |

Dosya düzeyinde: yalnız A 42, yalnız M 30, yalnız R 27; karışık A+M 31,
M+R 20, A+M+R 18, A+R 7, D+R 1. `tools/engine-tests.ts` içinde 909 kontrol
var (A 256, M 352, R 195, D 106). Taşımada bunlar modül başına test
dosyalarına dağıtılır.

## 3. Port bekleyenler

| Tarih | Forge commit | Modül | Ne | Durum |
|---|---|---|---|---|
