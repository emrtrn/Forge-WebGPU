# Cloud Layer

Statik, prosedürel bulut kubbesi (Forge WebGL'in Cloud Layer'ı; hacimsel değil).

- `schema.ts`: `forge.cloudLayer@1` (renk, kaplama, yoğunluk, yumuşaklık,
  ölçek, sürüklenme hızı `Wind`). Forge'un varsayılan ve aralıkları. Tekil.
- `render.ts`: kamerayı izleyen kubbe, fBm gürültüsü TSL'de; uzak düzlemin
  hemen içinde, opak geometri onu örter. World Environment etkinse onun
  bulut yorumunu (hava kaplaması, gece / alacakaranlık rengi) çizer.
- `feature.ts`: bileşeni kurar; `render.ts`'i anmaz.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner ikonu ve tür grubu.
