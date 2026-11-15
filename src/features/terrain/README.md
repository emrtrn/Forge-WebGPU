# Terrain

Yükseklik haritalı arazi (Forge WebGL'deki Landscape aktörü).

- `schema.ts`: `forge.terrain@2` bileşeni. Uzamsal. `material` (sürüm 2):
  Forge Landscape'in materyali (`forge.material`). `data`: bir
  `forge.terrain` veri belgesi (`<ad>.terrain.json`). Tile'lar
  (`<ad>.tiles/<x>_<z>.tile.bin`) ve global harita (`<ad>.global.bin`) belgenin
  metasız parçalarıdır (`src/core/assets/dataDocument.ts`).
- `feature.ts`: yalnız bileşeni kurar.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner ikonu ve tür grubu.
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
- Algoritmalar `src/engine/terrain`'de; üretim kalitesi 5a'da, collider Faz 6'da
  gelir (akış o zaman fizikle paylaşılan bir alt sisteme taşınır).
