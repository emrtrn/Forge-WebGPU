# Shape

Geometrik katı (küp, küre, silindir, koni, düzlem). World Builder'ın rol
renkli placeholder'ları ve Add Actor primitifleri bununla durur.

- `schema.ts`: `forge.shape@2` bileşeni. Uzamsal. Alanlar: `primitive`,
  `color`, `castShadow` (sürüm 2, varsayılan açık; gölge almak hep açık),
  `collision`. Ölçek 1'de kenar 0,5 m (`SHAPE_BASE_SIZE`, Forge'un
  `SHAPE_PRIMITIVE_SIZE`'ı); boyutu aktörün ölçeği verir.
- `feature.ts`: yalnız bileşeni kurar.
- Forge WebGL'de bunlar `shape:<tür>` sahte asset'inin yerleşimleriydi.
- `render.ts`: bileşen başına bir mesh; geometri prosedürel
  (`shape:<tür>`, Forge'un ölçüleri), renge göre lit materyal; ikisi de render
  host'unun kaynak önbelleğinden; gölge düşürmeyi `castShadow` belirler.
  Instancing Faz 3 adım 8'de, collider Faz 6'da.
