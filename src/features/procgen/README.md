# Procgen

Prosedürel üretim tarifleri (bitki ve prop planı PG0 / PG1; kullanıcı kararları
2026-11-11 ve 2026-11-18: üretici başına bir asset türü).

- `schema.ts`:
  - `forge.rockRecipe@1` (`*.rockrecipe.json`): kaya üreticisinin parametreleri
    (`src/engine/procgen/rock/rockParams.ts` ile aynı aralık ve varsayılanlar),
    tohum listesi (`variants`, her tohum bir prototip), LOD başına alt bölünme
    düzeyi, materyal ve çarpışma. Genel veri editörüyle (A13) düzenlenir.
  - `forge.surfaceTextureRecipe@1` (`*.surfacetexturerecipe.json`, PG1): gürültü
    yığını doku üreticisi (`src/engine/procgen/texture/surfaceTexture.ts`):
    döşenebilir renk, normal ve ORM dokuları. Onları bir `forge.material`
    kullanır; karma yolun gölgelendirici payı materyalin `variation` grubunda,
    triplanar izdüşüm `projection` grubunda.
  - Dallanan üreticinin `forge.treeRecipe`'si PG2'de gelir.
- `feature.ts`: asset türünü kurar.
- Çıktı kalıcı asset'lerdir, tarifin yanındaki klasöre üretim aracı yazar
  (plan §5.2); oyun üreticiyi çalıştırmaz:
  `npm run forge -- generate (--project <yol> | --pack <id>) --recipe <dosya> [--force] [--dry-run] [--json]`
  (`tools/procgen/`). `<klasör>/<ad>.rockrecipe.json` → `<klasör>/<ad>/`:
  tohum başına LOD GLB'leri (`<ad>_<tohum>_lod<i>.glb`, köşe rengi R oyukluk /
  G üst yüz / B yükseklik, UV yok), LOD0 meta'sında dışbükey collider
  (`forge.model` `collision.convex`), prototip başına foliage türü (LOD zinciri);
  yüzey tarifi `<ad>_basecolor|normal|orm.png`. Meta: köken `generated`,
  `LicenseRef-forge-project`, `generated` kaydı (tarif, üretici, sürüm,
  SHA-256). GUID'ler tarif GUID'i + rolden türer; yeniden üretim aynı
  baytları ve GUID'leri yazar. Var olan çıktı yalnız `--force` ile yenilenir;
  tarifin artık yazmadığı kendi dosyaları silinir, başkasının dosyasına
  dokunulmaz.
- Başlangıç ön ayarları starter paketinde (PK6, kullanıcı 2026-11-18).
