# Light

Işıklar: aktör başına bir ışık (Forge WebGL'in `lights[]`'ı gibi). Aktörün
transform'u ışığı yerleştirir ve yönlendirir; yönlü ve spot ışık aktörün -Z
ekseni boyunca parlar.

- `schema.ts`: `forge.directionalLight@1` (renk, şiddet, `castShadow`,
  `cascadedShadows`, `atmosphereSun`), `forge.pointLight@1` (renk, şiddet,
  erim, sönüm, gölge), `forge.spotLight@1` (+ koni açısı, yarı gölge).
  Varsayılanlar ve aralıklar Forge'unki. Uzamsal.
- `render.ts`: bileşen başına three ışığı. Güneş `atmosphereSun` işaretli
  ilk yönlü ışık: gökyüzü / sis / bulut onun yönünü okur, `cascadedShadows`
  açıksa gölgesi `CSMShadowNode` ile (Forge bölmeleri). Öteki gölgeli yönlü
  ışıklar kamerayı izleyen tek harita; harita boyu, mesafe ve aç / kapa
  kalite profilinden (`src/render/sync/sunShadow.ts`).
- `feature.ts`: üç bileşeni kurar; `render.ts`'i anmaz.
- Işık bileşeni olmayan level'a render katmanı Forge'un varsayılan güneşini
  koyar. İçe aktarıcı Forge'un güneşini (`sun` kimliği, yoksa ilk yönlü ışık)
  `atmosphereSun` ile işaretler (`src/engine/forgeImport/lights.ts`).
