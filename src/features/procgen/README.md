# Procgen

Prosedürel üretim tarifleri (bitki ve prop planı PG0 / PG1; kullanıcı kararları
2026-11-11 ve 2026-11-18: üretici başına bir asset türü).

- `schema.ts`:
  - `forge.rockRecipe@1` (`*.rockrecipe.json`): kaya üreticisinin parametreleri
    (`src/engine/procgen/rock/rockParams.ts` ile aynı aralık ve varsayılanlar),
    tohum listesi (`variants`, her tohum bir prototip), LOD başına alt bölünme
    düzeyi, materyal ve çarpışma. Genel veri editörüyle (A13) düzenlenir.
  - Dallanan üreticinin `forge.treeRecipe`'si PG2'de gelir.
- `feature.ts`: asset türünü kurar.
- Çıktı kalıcı asset'lerdir, tarifin yanındaki klasöre üretim aracı yazar
  (plan §5.2); oyun üreticiyi çalıştırmaz.
- Başlangıç ön ayarları starter paketinde (PK6, kullanıcı 2026-11-18).
