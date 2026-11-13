# Height Fog

Mesafeye ve yüksekliğe bağlı atmosfer sisi. İskeletin örnek özelliği: bir
özelliğin tek klasörde nasıl durduğunu gösterir (mimari §4.3).

- `schema.ts`: `forge.heightFog@1` bileşeni. Tekil (level başına bir tane),
  uzamsal değil. Alanlar ve aralıklar Forge WebGL'den taşındı.
- `runtime.ts`: `forge.heightFog` alt sistemi. World'deki sis bileşenini izler,
  `HeightFogStateKey` servisini yayınlar (canlı bileşen; yoksa `null`).
- `feature.ts`: `defineFeature({ id, components, subsystems })`. Kabuk bu
  dosyayı kurar.
- `render.ts`: render bağlaması (`defineRenderBinding`). Servisi her karede
  okur; Forge WebGL'in analitik yükseklik sisini TSL ile sahnenin sis düğümü
  olarak kurar (değerler uniform; yalnız sisin gelip gitmesi shader'ı
  değiştirir). `feature.ts` onu anmaz, `main.ts` toplar.
- Henüz yok: `editor.ts` (gerekirse; Details formu şemadan otomatik üretilir).
