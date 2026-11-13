# Material

Yüzey materyali: şemalı JSON asset türü (mimari §4.6, §4.9; Faz 3 karar 5).

- `schema.ts`: `forge.material/1` (`*.material.json`). Forge WebGL'in
  `ForgeMaterialDef` alanları birim ve aralıklarıyla; `name` yok (asset adı
  dosya adı), Forge'da null olabilen gruplar (`normalMotion`, `layerBlend`,
  `sway`) `enabled` anahtarıyla, `terrainDetail` normal haritası yoksa kapalı
  (kullanıcı kararı 2026-11-13). Preset'ler saklanmaz: `MATERIAL_PRESET_VALUES`
  editörün yeni materyal şablonu. Doku slotları `forge.texture`; renk uzayını
  slot belirler (`SRGB_TEXTURE_SLOTS`).
- `feature.ts`: yalnız asset türünü kurar.
- Çizim render katmanında (`src/render/materials/`): bir materyal GUID'i ve
  katkı imzasıyla bir node material olur (`material:<guid>:<imza>`).
  `sway` 5c'de, `terrainDetail` 5a'da çizilir.
- Forge level'larının materyalleri içe aktarıcıyla gelir
  (`src/engine/forgeImport/forgeMaterial.ts`: Forge'un normalize'ı okuyucu).
