# Terrain

Yükseklik haritalı arazi (Forge WebGL'deki Landscape aktörü).

- `schema.ts`: `forge.terrain@2` bileşeni. Uzamsal. `material` (sürüm 2):
  Forge Landscape'in materyali (`forge.material`). `data`: bir
  `forge.terrain` veri belgesi (`<ad>.terrain.json`). Tile'lar
  (`<ad>.tiles/<x>_<z>.tile.bin`) ve global harita (`<ad>.global.bin`) belgenin
  metasız parçalarıdır (`src/core/assets/dataDocument.ts`).
- `feature.ts`: yalnız bileşeni kurar.
- Arazi hücreden büyük olduğu için aktörü kalıcı katmandadır
  (`spatiallyLoaded: false`).
- Algoritmalar `src/engine/terrain`'de; salt çizim Faz 3 adım 8'de, üretim
  kalitesi ve akış 5a'da, collider Faz 6'da gelir.
