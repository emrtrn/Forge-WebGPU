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
| INV-D05 | Basit şekiller: küp, küre, silindir, koni, düzlem | `engine/scene/shapes.ts` | 3 | yeniden tasarla | add-actor-menu | Şekil mesh'leri `content/engine/`'e (A9) | |
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
| INV-D17 | World Settings: arka plan, ortam ışığı, gölge varsayılanları, yerçekimi, kill Z, rüzgâr, view distance, game mode, partition | `RoomLayout.worldSettings` | 2a ✓ / 3 / 6 | yeniden tasarla | wind-editor, e:viewDistance | 2a'da yalnız `settings.cellSize`; kalan alanlar ilgili fazda level ayarına ya da tekil bileşene | |
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
| INV-G13 | Terrain renderer: CDLOD, katman dizisi, materyal, doku havuzu, statik detay | `render-three/terrain/`, `render-three/landscape.ts` | 5a | yeniden yaz | terrain-renderer, terrain-static-detail, e:terrainRenderer, e:terrainLayerArray | Faz 1 S2'de spike | |
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
| INV-G29 | Kalite profilleri, adaptif kalite | `engine/perf/{qualityProfiles,adaptiveQuality}.ts` | 3 | uyarla | editor-quality | Compatibility / Balanced / Cinematic (plan §2.4) | |

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
| `src/engine/legacy/` (`entity`, `layout`, `capsule`, `components`) — **geçiş modeli** | `engine/scene/{entity,capsule}.ts`; `layout.ts`'ten `Vec3`, `LayoutPhysicsAxisLocks`, `LayoutLandscape` (terrain ile, `worldTerrainActor` için, 2026-11-12); `components.ts`'ten collider / transform okuyucuları ve `VEHICLE_COMPONENT` (120 bildirimden 16'sı) | `04b5fb23` | geçiş (kullanıcı kararı 2026-11-11): yalnız `src/engine` import eder (`engine-legacy-stays-in-engine`); Faz 6'da şemalı bileşenlerle değiştirilip silinir | — | — |
| `src/engine/physics/physicsSubsystem.ts` + `staticWorld.ts`, `vehiclePhysics.ts`, `physicsBodies.ts`, `physicsTypes.ts` | `engine/physics/physicsSubsystem.ts` (2.817 satır, tek sınıf) | `04b5fb23` | **yeniden düzenlendi** (kullanıcı onayı 2026-11-11): 1.500 satır bütçesi için beşe bölündü — statik dünya (`StaticWorld`, `collisionDisabled` / `bodiesById` paylaşımlı) ve araçlar (`VehiclePhysics`, Rapier durumunu host'tan okur) ayrı sınıf, saf yardımcılar ve tipler ayrı modül; yöntem gövdeleri aynı, başvurular `this.staticWorld.*` / `this.host.*()`; herkese açık API aynı (delegeler). Ragdoll çıkarıldı (K12) | 30 harness kontrolü (`physicsSubsystem.test.ts`; 28'i gerçek Rapier dünyasıyla) + `staticQueries` 6, `physicsImpacts` 10, `physicsContacts` 1 | yeşil (2026-11-11) |
| `src/engine/physics/` (`collision`, `physicsQuery`, `fixedStep`, `rotatedBox`, `staticSpatialIndex`, `heightfieldStatic`, `staticTriangles`, `navigationGeometry`, `impactEvents`) | `engine/scene/collision.ts` (saf: etkileşim grupları, fiziksel malzemeler); behavior'daki physics sorgu tipleri; `engine/physics/*.ts` | `04b5fb23` | taşındı / uyarlandı: sorgu tipleri physics'e geçti; parametre özellikleri açık alan | `impactEvents` 11, `fixedStep` 3, `rotatedBox` 5, `physicsBodies` 1 | yeşil (2026-11-11) |
| `src/engine/physics/vehicle/`, `src/engine/physics/surface/` | `engine/physics/{vehicle,surface}/*.ts` | `04b5fb23` | taşındı; `SurfaceDeformationSample` tipi `terrainSurface`'ten `surface/surfaceDeformationSample.ts`'e (terrain taşınınca oradan import eder) | `vehicleTypes` 10, `wheelSink` 15, `wheelTracks` 1; `vehicleDrivetrain` / `vehicleAssets` Forge başlangıç içeriğini okuduğu için içe aktarıcıyı bekliyor | yeşil (2026-11-11) |
| `src/engine/movement/slopeSurface.ts`, `src/engine/terrain/deformationField.ts` | `engine/movement/slopeSurface.ts`, `engine/scene/deformationField.ts` | `04b5fb23` | taşındı (saf) | `slopeSurface` 3 | yeşil (2026-11-11) |
| Hareketli platform | `engine/physics/movingPlatform{,Subsystem}.ts` | `04b5fb23` | taşınmadı (K12, INV-D51) | düşen (D) | — |
| `src/engine/terrain/` (34 dosya: tipler, tile codec, düzenleme + geri alma, sculpt, erozyon, auto paint, pad'ler, onarım, yeniden örnekleme, heightmap PNG / içe aktarma, yükseklik sorgusu, LOD, global harita, maske, katmanlar, loader, render verisi / kaynağı, slot havuzu, tile akışı decode'u, spline verisi / mesh'leri, `terrainSurface`, `worldTerrain{Actor,Create,Expand,Save}`, `terrainEditorStreaming`) | `engine/terrain/*.ts` (aşağıdaki ertelenenler hariç) | `04b5fb23` | taşındı: import yolları, parametre özellikleri açık alan; `terrainSurface` `SurfaceDeformationSample`'ı tanımlamaz, `physics/surface/surfaceDeformationSample.ts`'ten import eder; `worldTerrainActor` eski Collider / Transform okuyucularıyla `legacy`'ye bağlı (physics gibi) | 153 taşındı: `terrainEdit` 28, `terrain` 20, `terrainImport` 18, `worldTerrainActor` 11, `terrainLod` 11, `terrainSplines` 10, `terrainEditorStreaming` 8, `terrainSurface` 7, `terrainErosion` 6, `terrainAutoPaint` 5, `worldTerrainExpandSingle` 4, `terrainSplineEditing` 4, `terrainPads` 4, `terrainSplitBake` 3, `terrainResample` 3, `terrainDocument` 3, `terrainHeightfieldPhysics` 2, `terrainSplineData` 1, `terrainRuntimeStreaming` 1, `terrainGlobalMapFile` 1. `heightmapPng` 3 (2026-11-12: `node:zlib` bağımsız referans kodlayıcı olarak `src` testlerine açıldı, kullanıcı kararı) | yeşil (2026-11-12) |
| `src/engine/terrain/{landscape,landscapeBrush,landscapeSplineValidation,landscapeSplineAdapter}.ts` | `engine/scene/{landscapeBrush,landscapeSplineValidation,landscapeSplineAdapter}.ts`; `engine/scene/landscape.ts`'in spline kısmı (`subset`: 42 bildirimin 30'u — spline tipleri, `splineToPolyline`, `SplineCorridorIndex`, spline mesh zincirleri / örnekleri, `LANDSCAPE_DEFAULT_LAYERS`) | `04b5fb23` | uyarlandı (kullanıcı onayı 2026-11-12): scene'deki saf landscape algoritmaları terrain'e; landscape aktörü çözümü (`resolveLandscape`, ad / kimlik, boyut ön ayarları), materyal tanımı ve heightmap yeniden örnekleme alınmadı (aktör 5a'da şemayla, render 5a / 5d) | terrain kontrolleriyle | yeşil (2026-11-12) |
| `src/engine/spline/` (`spline`, `splineCurve`) | `engine/scene/{spline,splineCurve}.ts` | `04b5fb23` | taşındı (kullanıcı onayı 2026-11-12): saf eğri matematiği ve spline verisi normalleştiricisi; landscape spline adapter'ı kullanır, spline aktörü (INV-D27, Faz 6) şemasıyla bunu kullanır ya da yerine geçer | testleri M (scene) | derleniyor |
| `src/engine/world/` (`worldGrid`, `streamingPolicy`) | `engine/world/{worldGrid,streamingPolicy}.ts` | `04b5fb23` | taşındı (kullanıcı onayı 2026-11-12): saf ızgara ve akış hedefi matematiği (`terrainLod`, `terrainEditorStreaming` kullanır). `src/core/level/cells.ts` ile hücre anahtarı / konumu / sınırları çakışıyor (Forge'unkinde ızgara `origin`'i var); birleştirme 5b tasarımında | terrain kontrolleriyle | yeşil (2026-11-12) |
| `src/engine/physics/terrainCollider.ts` | `engine/physics/terrainCollider.ts` | `04b5fb23` | taşındı | — | derleniyor |
| `src/engine/testing/terrainTrimeshReference.ts` — **test yardımcısı** | `tests/engine/terrainTrimeshReference.ts` | `04b5fb23` | taşındı: heightfield kontrollerinin bağımsız referans trimesh'i; iskelede, yalnız testler import eder | `physicsSubsystem.checks` 2 (`tools/engine-tests.ts` içi) ve `terrainHeightfieldPhysics` / `terrainEdit` kontrollerini açar | yeşil (2026-11-12) |
| Terrain'in ertelenen parçaları | Göl / nehir / okyanus: `engine/terrain/{lake*,ocean*,riverSurface,terrainLakeBed,terrainLakeWater,terrainRiverWater,waterWheelInteraction}.ts` + `engine/scene/{waterBody,oceanWater,lakeBed,riverWater}` ve köpük / kostik → **Faz 7**. Su birikintisi: `terrainPuddle{,Preparation}`, `puddleInteraction`, `scene/puddleWater` → **5a** (INV-D21). `terrainRuntimeStreaming` + `world/worldStreamingSubsystem` → **5b** (A11). `worldTerrainMove` (dört eski su tipini de kaydırır) → **5d / 7** | `04b5fb23` | ertelendi (kullanıcı onayı 2026-11-12) | bekleyen A: su ~19, su birikintisi 2, akış ~5, `worldTerrainMove` 4; ~8'i worldbuilder'ı da bekliyor | — |

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

### 2.1 Test sınıflaması

2b'nin ilk işi (plan Faz 2b). Kaynak Forge `forge-webgl-final` (`04b5fb23`).
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
2026-11-12: **A 370 / 923** (terrain 153, physics 2, perf 1).

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
