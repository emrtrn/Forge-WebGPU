# Static Mesh

Yerleştirilmiş model. Her yerleşim bir aktördür (mimari §4.4); instancing veri
türü değil, render katmanının toplu çizimidir.

- `schema.ts`: `forge.staticMesh@1` bileşeni. Uzamsal (`parent`, `local`):
  aktör sınıfında başka bir bileşene bağlanabilir. Alanlar: `mesh`
  (`forge.model` asset'i), `collision`.
- `feature.ts`: yalnız bileşeni kurar.
- Şimdilik yalnız şema (plan 2b, kullanıcı kararı 2026-11-12): World Builder
  ve Forge WebGL içe aktarıcısı yazar. Çizim Faz 3'te (`render.ts`), collider
  Faz 6'da gelir.
