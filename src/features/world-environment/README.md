# World Environment

Günün saati, mevsim ve hava (Forge WebGL'in WES'i). Level'daki güneşi,
gökyüzünü, sisi ve bulutları kendi değerlerini değiştirmeden yeniden yorumlar.

- `schema.ts`: `forge.worldEnvironment@1`: sabit `hour`, `season`,
  `weather`, `sunPath`, `night` (Forge'un alan biçimi ve aralıkları). Sürekli
  gün döngüsü yok (karar 8); zamanlı geçiş Faz 3 adım 7'de. Kar / ıslaklık
  örtüsü 5a'da, rüzgâr 5c'de.
- `runtime.ts`: tekili taşınmış `WorldEnvironmentController`'a yükler ve
  `WorldEnvironmentKey` servisiyle verir (`src/engine/environment`); oynanış
  saati / havayı oradan değiştirir.
- `render.ts`: gece dolgu ışığı. Yorumun kendisi (`resolveEnvironment`)
  render katmanında her karede bir kez hesaplanır (`src/render/sync/
  environment.ts`), bağlamalar `ctx.environment.override`'ı okur.
- `feature.ts`: bileşeni ve alt sistemi kurar; `render.ts`'i anmaz.
