// Zones and portals: component schemas (plan 5c R9b Z1; user decisions
// 2026-11-18, v1.69 / v1.70).
//
// - A zone is a box volume: `size` in the component's local frame, times the
//   world scale, so the gizmo scales it (the box's edges follow the scale) and
//   rotates it. A static placement belongs to the smallest zone that holds its
//   entire world bounds; content in no zone is always visible. Hidden
//   zones draw nothing and cast no shadow unless `alwaysCastShadows`.
// - A portal is a rectangle (`size` = width × height in the local X / Y
//   plane, its normal local Z): a door, window or corridor mouth joining two
//   zones. `zoneA` / `zoneB` pin the zones by hand; empty, the zones its edge
//   touches or crosses are found automatically.
// - `generated` marks what Generate Zones / `forge zones` wrote: a new run
//   replaces those and keeps the ones edited by hand.
//
// Visibility only for now; streaming by zone is a later decision.

import { actorRef, bool, defineComponent, text, vec2, vec3, type ComponentData } from "../../core/index.ts";

export const Zone = defineComponent(
  "forge.zone",
  1,
  {
    size: vec3({ default: [8, 3, 8], min: 0.1, max: 4096, step: 0.1, label: "Size (m)", hint: "Kutunun kenarları, metre; nesnenin ölçeğiyle çarpılır. Merkezi bileşenin konumudur." }),
    zoneName: text({ label: "Zone Name", hint: "Oyun kodunun ve hata ayıklamanın kullandığı ad. Boşsa nesnenin adı." }),
    alwaysCastShadows: bool({ default: false, label: "Always Cast Shadows", hint: "Açıkken bölge görünmese de içeriği gölge düşürür (pencereden ya da avludan giren güneş gibi). Kapalıyken görünmeyen bölge gölge de düşürmez." }),
    generated: bool({ default: false, label: "Generated", hint: "Generate Zones bu bölgeyi yazdı ve yeniden üretince değiştirir. Elle düzeltilen bölgede kapatın, korunur." }),
  },
  {
    label: "Zone Volume",
    hint: "İç mekânı odalara ayıran kutu. Dünya sınır kutusu 2 cm toleransla tamamen sığan yerleşimler bu bölgeye girebilir. Kamera bir bölgedeyken yalnız portallardan görünen bölgeler çizilir; bölgesiz içerik hep görünür.",
    spatial: true,
  },
);

export const Portal = defineComponent(
  "forge.portal",
  1,
  {
    size: vec2({ default: [1.2, 2.2], min: 0.05, max: 1024, step: 0.05, label: "Size (m)", hint: "Açıklığın genişliği ve yüksekliği, metre; nesnenin ölçeğiyle çarpılır. Açıklık yerel X / Y düzleminde, yüzü yerel Z yönünde." }),
    zoneA: actorRef({ label: "Zone A", hint: "Portalın bağladığı bölge. Boşsa açıklığın yanındaki bölge aranır." }),
    zoneB: actorRef({ label: "Zone B", hint: "Portalın öbür tarafındaki bölge. Yalnız bir bölge bulunursa diğer taraf Outside olarak çözülür." }),
    generated: bool({ default: false, label: "Generated", hint: "Generate Zones bu portalı yazdı ve yeniden üretince değiştirir. Elle düzeltilen portalda kapatın, korunur." }),
  },
  {
    label: "Portal",
    hint: "İki bölgeyi bağlayan dikdörtgen açıklık: kapı, pencere, koridor ağzı. Görüş yalnız portallardan geçer.",
    spatial: true,
  },
);

export type ZoneData = ComponentData<typeof Zone>;
export type PortalData = ComponentData<typeof Portal>;
