# Terrain

Yükseklik haritalı arazi (Forge WebGL'deki Landscape aktörü).

- `schema.ts`: `forge.terrain@2` bileşeni. Uzamsal. `material` (sürüm 2):
  Forge Landscape'in materyali (`forge.material`). `data`: bir
  `forge.terrain` veri belgesi (`<ad>.terrain.json`). Tile'lar
  (`<ad>.tiles/<x>_<z>.tile.bin`) ve global harita (`<ad>.global.bin`) belgenin
  metasız parçalarıdır (`src/core/assets/dataDocument.ts`).
  `forge.landscapeAutoPaint@1` (5d adım 3): terrain aktöründe Auto Paint
  kuralları (yükseklik / eğim / gürültü bandı, `engine/terrain/terrainAutoPaint.ts`);
  level'la kaydedilir, ajan `forge edit set` ile yazar. Kurallar kendiliğinden
  boyamaz; uygulama editörde tek seferlik, tek Undo.
- `feature.ts`: iki bileşeni kurar.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner
  ikonu ve tür grubu; terrain Details'inin altında Landscape bölümü (Sculpt /
  Paint / Splines, görünüm kipi, katmanlar; `src/editor/landscape/`), Auto Paint
  bileşeninin altında Apply Auto Paint.
- Arazi hücreden büyük olduğu için aktörü kalıcı katmandadır
  (`spatiallyLoaded: false`).
- `render.ts`: çizim (Faz 3 adım 8, spike S2'nin TSL CDLOD'u,
  `src/render/materials/terrain.ts`; Faz 5a adım 2 akış ve kesim,
  `src/render/sync/terrainView.ts`): belge, uzak alan haritası ve katman
  materyalleri (GUID) host önbelleğinden (`terrain:<guid>`). Global harita
  parçası geçerli çok tile'lı terrain kamera çevresinde akar (Forge'un
  `TerrainRuntimeStreaming`'i, çözme worker'da); öteki bütün tile'larını bir
  kerede okur. Görüş ve gölge ışıklarının frustum'uyla kesilir; landscape
  `material`'ı çizilmez (Forge runtime'ı gibi).
- Spline mesh'leri (5d adım 5): tanımın `splines`'ından, terrain çizilirken CPU'da
  bükülür (`engine/terrain/roadMesh.ts`), 128 m'lik hücre parçaları ve düz
  parçalar statik batch olarak çizilir (`render/sync/roadMeshes.ts`); saklanmaz,
  editörde ve oyunda aynıdır. Kalıcı katmanda oldukları için HLOD proxy'si yok.
- Algoritmalar `src/engine/terrain`'de; üretim kalitesi 5a'da, collider Faz 6'da
  gelir (akış o zaman fizikle paylaşılan bir alt sisteme taşınır).
