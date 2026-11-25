# World Environment

Günün saati, mevsim ve hava (Forge WebGL'in WES'i). Level'daki güneşi,
gökyüzünü, sisi ve bulutları kendi değerlerini değiştirmeden yeniden yorumlar.

- `schema.ts`: `forge.worldEnvironment@3`: sabit `hour`, `season`,
  `weather`, `sunPath`, `night` (Forge'un alan biçimi ve aralıkları). Sürekli
  gün döngüsü yok (karar 8); saat ve mevsim zamanlı geçer. Kar / ıslaklık
  örtüsü, rüzgâr, canlı durum (su birikimi ve kar yüksekliği plan Faz W).
- `runtime.ts`: tekili taşınmış `WorldEnvironmentController`'a yükler ve
  `WorldEnvironmentKey` servisiyle verir (`src/engine/environment`); oyun
  kodu aynı denetleyiciyi SDK'nın `WorldEnvironmentServiceKey`'iyle alır (saat,
  mevsim, hava, yağış, yüzey).
- `render.ts`: gece dolgu ışığı. Yorumun kendisi (`resolveEnvironment`)
  render katmanında her karede bir kez hesaplanır (`src/render/sync/
  environment.ts`), bağlamalar `ctx.environment.override`'ı okur.
- `feature.ts`: bileşeni ve alt sistemi kurar; `render.ts`'i anmaz.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner ikonu ve tür grubu.
