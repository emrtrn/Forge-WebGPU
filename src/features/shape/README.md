# Shape

Geometrik katı (küp, küre, silindir, koni, düzlem). World Builder'ın rol
renkli placeholder'ları ve Add Actor primitifleri bununla durur.

- `schema.ts`: `forge.shape@1` bileşeni. Uzamsal. Alanlar: `primitive`,
  `color`, `collision`. Ölçek 1'de kenar 0,5 m (`SHAPE_BASE_SIZE`, Forge'un
  `SHAPE_PRIMITIVE_SIZE`'ı); boyutu aktörün ölçeği verir.
- `feature.ts`: yalnız bileşeni kurar.
- Forge WebGL'de bunlar `shape:<tür>` sahte asset'inin yerleşimleriydi.
- Şimdilik yalnız şema (plan 2b, kullanıcı kararı 2026-11-12). Çizim Faz 3'te,
  collider Faz 6'da gelir.
