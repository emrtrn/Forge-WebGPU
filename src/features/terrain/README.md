# Terrain

Yükseklik haritalı arazi (Forge WebGL'deki Landscape aktörü).

- `schema.ts`: `forge.terrain@1` bileşeni. Uzamsal. Tek alanı `data`: bir
  `forge.terrain` veri belgesi (`<ad>.terrain.json`). Tile'lar
  (`<ad>.tiles/<x>_<z>.tile.bin`) ve global harita (`<ad>.global.bin`) belgenin
  metasız parçalarıdır (`src/core/assets/dataDocument.ts`).
- `feature.ts`: yalnız bileşeni kurar.
- Arazi hücreden büyük olduğu için aktörü kalıcı katmandadır
  (`spatiallyLoaded: false`).
- Şimdilik yalnız şema (plan 2b, kullanıcı kararı 2026-11-12). Algoritmalar
  `src/engine/terrain`'de; çizim ve akış 5a'da, collider Faz 6'da gelir.
