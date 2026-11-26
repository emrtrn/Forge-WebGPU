# Precipitation

Yağmur ve kar (plan Faz W, W1). Bileşeni yoktur: World Environment'ın canlı
havasını ve `precipitation` ayarlarını okur; WES yoksa hiçbir şey çizmez.

- `render.ts`: kameranın çevresindeki yakın ve uzak hacimler, hacim başına tek
  çizim (`src/render/materials/precipitation.ts`). Taneler dünyada sabit durur,
  hacim içinde sarılır; rüzgâr, hamle, şiddet ve kalite (`particleDensity`)
  ölçekler, pause durdurur. Hareketin saf yarısı
  `src/engine/environment/precipitationMotion.ts`.
- Geç katmanda çizilir (`src/render/pipeline/lateLayer.ts`): kenar yumuşatmadan
  sonra, alan derinliği ve bloom'dan önce. Planar yansımaya, Sky Light'a ve
  gölgeye girmez.
- Çatı altında ve odada yağmaz (W3): tanenin konumu yağış siperinde
  (`src/render/sync/precipitationCover.ts`) bir yüzeyin altında kalıyorsa söner;
  tamamen örtülüyse çizilmez. Siper statik mesh, şekil, yol ve HLOD'dan yukarıdan
  derinlik haritasıdır; terrain örtüsü (kar, ıslaklık) de onu okur.
