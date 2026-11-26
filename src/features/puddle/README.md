# Puddle

Terrain çukurunu belirli bir seviyeye dolduran su birikintisi (plan Faz 5a adım 6,
karar 2; Forge WebGL'in kalıcı Puddle'ı).

- `schema.ts`: `forge.puddle@1`, uzamsal bileşen. Bileşenin dünya konumu tohum
  noktası (X / Z) ve su seviyesidir (Y); `size` çalışma alanı. Yatak tohumun
  altındaki terrain'dir (otomatik). Alanlar, varsayılanlar ve aralıklar Forge'un.
  `PuddleStatusKey`: doldurmanın sonucu (hazır, kuru, açık sınır, ...).
- `feature.ts`: `defineFeature({ id, components })`.
- `render.ts`: render bağlaması. Terrain'i bulur, alanın tile'larını okur,
  Forge'un havza doldurmasını karede 2 ms'lik dilimlerle çalıştırır, yüzeyi
  `render/materials/puddle.ts` ile çizer, planar yansımayı
  `render/sync/puddleReflections.ts` seçer. Sonucu servis olarak yayınlar.
  Yağarken suda yağmur halkaları (plan W6, `render/materials/waterRipples.ts`;
  WES'in canlı yağmuru ve `surface.ripple*` ayarları, yağış siperi altında yok).
- `editor.ts`: Outliner simgesi, Add Actor girişi (bırakılan noktanın 5 cm üstü),
  Details'in altında doldurmanın sonucu.
- Sonra: rüzgâr dalgacıkları WES rüzgârıyla (5a adım 7), tekerlek dalgacıkları
  araçlarla (Faz 6 / 8), deforme yatak Faz 8.
