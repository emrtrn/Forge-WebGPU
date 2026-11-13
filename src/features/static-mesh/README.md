# Static Mesh

Yerleştirilmiş model. Her yerleşim bir aktördür (mimari §4.4); instancing veri
türü değil, render katmanının toplu çizimidir.

- `schema.ts`: `forge.staticMesh@1` bileşeni. Uzamsal (`parent`, `local`):
  aktör sınıfında başka bir bileşene bağlanabilir. Alanlar: `mesh`
  (`forge.model` asset'i), `collision`.
- `feature.ts`: yalnız bileşeni kurar.
- `render.ts`: modelin GLB'si kendi materyalleriyle, kaynak önbelleğinden
  (`model:<guid>`); yerleşimler yüklenen sahnenin klonudur (geometri ve
  materyal ortak). Renk / gölge / materyal slotu sürüm 2'yle (Faz 3 adım 4),
  instancing adım 8'de, collider Faz 6'da.
