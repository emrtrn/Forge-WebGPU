// Level settings and the actor streaming flag (architecture §4.4, decision A11).
//
// Both are ordinary field maps, so normalisation, the Details form and the
// JSON Schema come from the same definition.
//
// - Every level has one fixed 2D grid (X/Z). There is no switch to turn it
//   off: a small level simply has few cells.
// - `spatiallyLoaded` is defined here, once, for every actor (D10, D4). A root
//   actor with `spatiallyLoaded: false` stays in the persistent layer; a child
//   actor follows its root and its own flag is not read.
// - `pivot` (Forge's authoring pivot, user decision 2026-11-14): a point in the
//   actor's local space the editor's rotate and scale act around. Editor data:
//   the world and the game never read it. Absent means the origin; the
//   canonical document leaves an origin pivot out.

import { bool, num, vec3, type FieldValues } from "../schema/fields.ts";

export const DEFAULT_CELL_SIZE = 128;

export const LevelSettingsFields = {
  cellSize: num({
    min: 16,
    max: 4096,
    step: 1,
    default: DEFAULT_CELL_SIZE,
    label: "Cell Size",
    hint: "Akış ızgarasının hücre kenarı (metre). Aktörler kayıtta bu ızgaraya göre hücre dosyalarına dağılır; değiştirmek bütün hücreleri yeniden yazar.",
  }),
};

export type LevelSettings = FieldValues<typeof LevelSettingsFields>;

export const ActorStreamingFields = {
  spatiallyLoaded: bool({
    default: true,
    label: "Spatially Loaded",
    hint: "Açıkken aktör konumunun düştüğü hücreyle birlikte yüklenir. Kapalıyken kalıcı katmanda durur ve hep yüklüdür. Alt aktör kökünü izler.",
  }),
};

export const ActorPivotField = vec3({
  default: [0, 0, 0],
  label: "Pivot",
  hint: "Döndürme ve ölçeğin etrafında yapıldığı nokta, aktörün yerel uzayında (metre). Yalnız editör kullanır; oyun okumaz.",
});
