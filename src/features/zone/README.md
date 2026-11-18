# Zone

Bölge sistemi (plan 5c R9b): iç mekânı odalara ayıran kutu hacimler ve onları
bağlayan portallar. Kamera bir bölgedeyken yalnız portallardan görünen
bölgelerin içeriği çizilir; hiçbir bölgede olmayan içerik hep görünür.

- `schema.ts`: `forge.zone@1` (Zone Volume: `size`, `zoneName`,
  `alwaysCastShadows`, `generated`) ve `forge.portal@1` (`size` genişlik ×
  yükseklik, `zoneA` / `zoneB`, `generated`). İkisi de uzamsal; kutu ve
  açıklık nesnenin ölçeğiyle büyür, gizmo ölçekler ve döndürür.
- `feature.ts`: yalnız bileşenleri kurar.
- Görünmeyen bölgenin içeriği gölge düşürmez; `alwaysCastShadows` bölge başına
  açar. Şimdilik yalnız görünürlük; bölgeye göre bellekten boşaltma sonra.
- `generated` işaretli bölge ve portallar otomatik üretimle yeniden yazılır;
  işareti kapatılanlar korunur.
