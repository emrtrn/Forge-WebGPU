# Height Fog

Mesafeye ve yüksekliğe bağlı atmosfer sisi. İskeletin örnek özelliği: bir
özelliğin tek klasörde nasıl durduğunu gösterir (mimari §4.3).

- `schema.ts`: `forge.heightFog@1` bileşeni. Tekil (level başına bir tane),
  uzamsal değil. Alanlar ve aralıklar Forge WebGL'den taşındı.
- `feature.ts`: `defineFeature({ id, components })`. Kabuk bu dosyayı kurar.
- Henüz yok: `runtime.ts` (alt sistem, uygulama kabuğuyla), `render.ts` (Faz 3),
  `editor.ts` (gerekirse; Details formu şemadan otomatik üretilir).
