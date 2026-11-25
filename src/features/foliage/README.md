# Foliage

Foliage türü ve terrain'in boya katmanlarından üretilen foliage (Faz 5c,
kararlar 2–4, kullanıcı 2026-11-17).

- `schema.ts`:
  - `forge.foliageType@1`: şemalı JSON asset'i (`*.foliagetype.json`), Forge
    WebGL'in `ForgeFoliageTypeDef`'i. Model `forge.model` GUID'i; ölçek eşit
    (sayı); Forge'un isteğe bağlı yükseklik sınırı `heightLimit.enabled`;
    gölge almak her zaman açık (`receiveShadow` yok); rüzgârın kaynağı
    (`height` / `vertex`); `lods` ve `impostor` PG0 sözleşmesinin yuvaları
    (PG3 doldurur). Genel veri editörüyle (A13) düzenlenir.
  - `forge.landscapeFoliage@1`: terrain aktöründeki kurallar (Forge'un
    `LandscapeFoliageRule`'u): katman, tür, yoğunluk, `minWeight`, tohum ve
    bantlar. Kuralın terrain'i bileşenin aktörüdür. Örnekler kaydedilmez,
    kamera çevresinde tohumdan yeniden kurulur.
- `feature.ts`: bileşeni ve asset türünü kurar.
- Şema verisi → saf üretim girdisi `src/engine/foliage/foliageAsset.ts`
  (`foliageTypeParamsOf`, `foliageRuleParamsOf`); üretim
  `src/engine/foliage/proceduralFoliage.ts`, halka `src/engine/world/foliageRing.ts`.
- Boyanmış örnekler editörde Foliage sekmesinin araçlarıyla düzenlenir (5d adım 6,
  `src/editor/foliage`, `engine/foliage/foliagePaintSession.ts`); bağlama düzenlenen
  hücreyi `LevelFoliageSource.edits`'ten çizer, hedef yüzey saklanmaz.
- Boyanmış örnekler asset değil, level parçasıdır: `foliage.json` + hücre
  başına `foliage/<x>_<z>.bin` (`src/core/level/foliage*.ts`), hücreyle akar.
- Çizim (GPU culling + indirect + render bundle) 5c adım 5–6'da gelir.
