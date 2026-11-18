# Plant

Bitki ailesi ve tekil bitki (bitki ve prop planı PG0, §5.4; kullanıcı kararları
2026-11-14 ve 2026-11-18).

- `schema.ts`:
  - `forge.plantFamily@1` (`*.plantfamily.json`): dallanan tarifin ürettiği aile.
    Prototipler (tarif tohumu başına), her biri LOD zinciri; her LOD bir GLB,
    odun ve yaprak iki materyal slotu (karar 2026-11-18). Impostor yuvası (PG3),
    odun / yaprak materyalleri, çarpışma ve WES tepki profili: yaprak döken /
    herdem yeşil, mevsim başına yaprak oranı ve renk, rüzgâr esnekliği, kar
    kabulü, ıslaklık. Mevsim değişimi aileye, level'a, yerleşimlere yazılmaz.
  - `forge.plant@1`: tekil bitki aktörünün bileşeni (uzamsal): aile, prototip,
    örnek tohumu, gölge. Foliage türü aynı aileye `family` ile başvurur;
    ikisi aynı WES durumunda aynı görünür (PV-WES-02).
- `feature.ts`: bileşeni ve asset türünü kurar.
- Çizim ve tepki çözümleyicisi PG2'de gelir.
