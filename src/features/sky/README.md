# Sky

Gökyüzü ve level'ın ortam aydınlatması. İki tekil, tek özellik: Sky Light
gökyüzünü yakalar.

- `schema.ts`: `forge.skyAtmosphere@1` (Rayleigh, bulanıklık, Mie, Mie
  anizotropisi, pozlama; Forge'un varsayılan ve aralıkları) ve
  `forge.skyLight@1` (gökyüzü yakalamasının şiddeti, düz ortam ışığı rengi /
  şiddeti, gökyüzü yokken arka plan rengi; Forge'un world settings alanları,
  kullanıcı kararı 2026-11-13). Tekil, uzamsal değil.
- `render.ts`: TSL gökyüzü kubbesi (three'nin `SkyMesh`'i + Forge'un ayı ve
  yıldızları), PMREM ile gökyüzü yakalaması (`scene.environment`), ortam
  ışığı ve arka plan; gökyüzü varken çıktı ACES + pozlama × 0,2. World
  Environment etkinse onun güneşini, pusunu, ayını ve yıldızlarını çizer.
- `feature.ts`: iki bileşeni kurar; `render.ts`'i anmaz.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner ikonu ve tür grubu.
- Sky Light'sız level Forge varsayılanlarıyla çizilir (`#d7d7c7`, ortam yok).
