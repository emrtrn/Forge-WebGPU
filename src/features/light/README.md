# Light

Işıklar: aktör başına bir ışık (Forge WebGL'in `lights[]`'ı gibi). Aktörün
transform'u ışığı yerleştirir ve yönlendirir; yönlü ve spot ışık aktörün -Z
ekseni boyunca parlar.

- `schema.ts`: `forge.directionalLight@1` (renk, şiddet, `castShadow`,
  `cascadedShadows`, `atmosphereSun`), `forge.pointLight@1` (renk, şiddet,
  erim, sönüm, gölge), `forge.spotLight@1` (+ koni açısı, yarı gölge).
  Varsayılanlar ve aralıklar Forge'unki. Uzamsal.
- `forge.shadowSettings@1`: uzamsal olmayan tekil sahne ayarı; `enabled`
  varsayılan açık, bileşen yoksa da açık. World Settings → Shadows genel
  anahtarıdır. Render host'u ve ışıklar kalite profiliyle birlikte uygular;
  nesne / ışık `castShadow` tercihlerini değiştirmez. İlk değişiklikte
  oluşturulur; açılışta sahneye otomatik aktör eklenmez.
- `render.ts`: bileşen başına three ışığı. Güneş `atmosphereSun` işaretli
  ilk yönlü ışık: gökyüzü / sis / bulut onun yönünü okur, `cascadedShadows`
  açıksa gölgesi `CSMShadowNode` ile (Forge bölmeleri). Öteki gölgeli yönlü
  ışıklar kamerayı izleyen tek harita; harita boyu, mesafe ve aç / kapa
  kalite profilinden (`src/render/sync/sunShadow.ts`). World Environment
  etkinken güneşin rengi, şiddeti, ay gölgesi ve yönü onun saatinden
  (`src/render/sync/sunOverride.ts`); bileşen değişmez.
- `feature.ts`: ışık ve gölge ayarı bileşenlerini kurar; `render.ts`'i anmaz.
- `editor.ts`: editördeki görünüşü (`defineFeatureEditor`): Forge'un Outliner ikonu ve tür grubu.
- Işık bileşeni olmayan level'a render katmanı Forge'un varsayılan güneşini
  koyar. İçe aktarıcı Forge'un güneşini (`sun` kimliği, yoksa ilk yönlü ışık)
  `atmosphereSun` ile işaretler (`src/engine/forgeImport/lights.ts`).
- World Settings'teki Enable / Disable on Objects modellerin ve temel
  şekillerin `castShadow` alanlarını tek Undo işlemiyle değiştirir. Sınıf
  örneklerine override yazılır; sınıf asset'i değişmez. Gizli nesneler dahil;
  yüklenmemiş hücre varsa kısmi uygulama yapılmaz. Genel anahtar bağımsızdır.
