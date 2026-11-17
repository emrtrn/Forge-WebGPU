# World Role

Nesnenin anlamsal rolü ve onu üreten World Builder aşaması.

Arka plan verisidir; Detaylar panelinde ve bileşen ekleme listesinde gösterilmez.
Nesnede saklanmaya ve araçlar tarafından kullanılmaya devam eder.

- `schema.ts`: `forge.worldRole@1` bileşeni. Uzamsal değil. Alanlar: `role`
  (`building.residential.detached`, `prop.rock`), `stage` (`roads`,
  `buildings`; elle konan nesnede boş).
- `feature.ts`: yalnız bileşeni kurar.
- Rol, placeholder → model geçişini sağlar: bölge profili hangi rolün hangi
  modelle gösterileceğini söyler. Aşama, Forge WebGL'deki
  `recipe.generatedBy` defterinin yerini alır; köken nesnelerin üstüne taşındı
  (plan 2b, kullanıcı kararı 2026-11-12).
