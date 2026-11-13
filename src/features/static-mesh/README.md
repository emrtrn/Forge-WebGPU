# Static Mesh

Yerleştirilmiş model. Her yerleşim bir aktördür (mimari §4.4); instancing veri
türü değil, render katmanının toplu çizimidir.

- `schema.ts`: `forge.staticMesh@2` bileşeni. Uzamsal (`parent`, `local`):
  aktör sınıfında başka bir bileşene bağlanabilir. Alanlar: `mesh`
  (`forge.model` asset'i), `materials` (slot başına `forge.material`
  değişikliği; boş = modelin), `color` (boş = materyalin rengi; doluysa temel
  rengi değiştirir, dokular kalır), `castShadow` (varsayılan açık; gölge almak
  hep açık), `collision`. Sürüm 1'den geçiş zinciriyle.
- `feature.ts`: yalnız bileşeni kurar.
- `render.ts`: model kaynak önbelleğinden (`model:<guid>`); yerleşimler
  yüklenen sahnenin klonudur (geometri ortak). Slot materyali önceliği:
  yerleşimin `materials`'ı, modelin `materials`'ı, GLB'nin kendisi; materyaller
  `material:<guid>:<katkı imzası>` anahtarıyla ortak, renkli yerleşim kendi
  kopyasını alır. Instancing adım 8'de, collider Faz 6'da.
