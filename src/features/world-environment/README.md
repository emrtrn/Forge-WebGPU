# World Environment

Günün saati, mevsim ve hava (Forge WebGL'in WES'i). Level'daki güneşi,
gökyüzünü, sisi ve bulutları kendi değerlerini değiştirmeden yeniden yorumlar.

- `schema.ts`: `forge.worldEnvironment@3`: sabit `hour`, `season`,
  `weather`, `sunPath`, `night` (Forge'un alan biçimi ve aralıkları). Sürekli
  gün döngüsü yok (karar 8); saat, mevsim ve hava zamanlı geçer (hava: ön
  ayarların payları karışır, `engine/environment/weatherTransition.ts`). Kar / ıslaklık
  örtüsü, rüzgâr, havanın bulut ve gökyüzü tepkisi (`weatherSky`: ön ayar başına
  örtü, opaklık, renk, gölge, gök kapalılığı; plan W2b), canlı durum (su birikimi ve kar yüksekliği plan Faz W).
  Islaklık ve kar bütün statik yüzeylere yüzün normaline göre düşer (plan W4,
  `engine/environment/surfaceResponse.ts`): yukarı bakan tam, dikey
  `surface.verticalWetting` (rüzgârın geldiği yan `windwardWetting` kadar fazla),
  alta bakan kuru; yağış siperinin altı kuru ve karsız. Durgun suyun parlaklığı
  yalnız düz zeminde: `surface.puddleMaxSlopeDeg`'ten (varsayılan 5°, 5° geçiş)
  dik zemin ve duvarlar ıslak film olarak koyulaşır, ayna gibi parlamaz
  (`poolShare`, `WET_FILM_ROUGHNESS`).
  Hava bağı (plan W5): `surface.weatherDrivesSurface` açıkken canlı yağış yüzeyi
  sürer (`engine/environment/surfaceCondition.ts`; yağmur ıslatır, su biriktirir,
  kar örter ve kalınlaşır; kesilince önce ince ıslaklık, sonra birikinti kurur,
  kar önce kalınlığını sonra örtüsünü kaybeder, zemin ıslak kalıp kurur); oranlar
  aynı grupta. Şemada kapalı (eski level'lar 5a'nın hedef + oran yolunda); Add
  Actor ve yeni level açık yazar. Islaklık her yüze eşit bir film olarak düşer ve
  eşit kurur (koyulaşma, hafif parlaklık); yalnız birikinti yamalıdır: gürültü ve
  oyuklar önce tutar (`surfaceResponse.ts` `patchyPuddles`), yalnız düz zeminde.
  Kar aynı desenle oyuklardan başlar ve parça parça erir (`patchySnow`);
  `surface.wetSpread` (Puddle Spread) / `snowSpread` birikinti ve kar yamalarının
  nereye kadar yayılacağını, `patchSize` boylarını belirler (yalnız görünüm, 1'de
  nötr; canlı durum ve model değişmez).
- `runtime.ts`: tekili taşınmış `WorldEnvironmentController`'a yükler ve
  `WorldEnvironmentKey` servisiyle verir (`src/engine/environment`); oyun
  kodu aynı denetleyiciyi SDK'nın `WorldEnvironmentServiceKey`'iyle alır (saat,
  mevsim, hava, yağış, yüzey).
- `render.ts`: gece dolgu ışığı. Yorumun kendisi (`resolveEnvironment`)
  render katmanında her karede bir kez hesaplanır (`src/render/sync/
  environment.ts`), bağlamalar `ctx.environment.override`'ı okur.
- `feature.ts`: bileşeni ve alt sistemi kurar; `render.ts`'i anmaz.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner ikonu ve tür grubu.
  Önizleme şeridinde hava düğmelerinin altında geçiş süresi (`Transition`, saniye;
  0 anında): kaydedilmez, Undo'ya girmez. `Surface` canlı dört büyüklüğü gösterir,
  `Simulate` seçili süreyi (1 / 5 / 20 / 60 dk) dört saniyede oynatır; o da kaydedilmez.
