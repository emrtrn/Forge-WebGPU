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
- `render.ts`: salt çizim (Faz 3 adım 8, spike S2'nin TSL CDLOD'u,
  `src/render/materials/terrain.ts`): belge, bütün tile'lar ve katman
  materyalleri (GUID) host önbelleğinden (`terrain:<guid>`); kamera 0,1 m
  kıpırdayınca LOD yeniden seçilir, frustum kesimi yok; landscape `material`'ı
  çizilmez (Forge runtime'ı gibi).
- Algoritmalar `src/engine/terrain`'de; üretim kalitesi, kesim ve akış 5a'da,
  collider Faz 6'da gelir.
