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
// - `locked` (Forge's Lock Movement, same kind of editor data): written only
//   when true.

import { bool, num, object, vec3, type FieldValues } from "../schema/fields.ts";
import { createServiceKey } from "../world/services.ts";

export const DEFAULT_CELL_SIZE = 128;

/** Forge's wind defaults/ranges; same fields in level settings and WES. */
export const WindFields = {
  directionDeg: num({ min: 0, max: 360, default: 45, step: 1, label: "Direction (°)", hint: "Rüzgârın estiği pusula yönü; 0 = +Z, 90 = +X." }),
  strength: num({ min: 0, max: 1, default: .3, step: .05, hint: "Rüzgârın taban gücü; 0 sakin. Hava ve mevsim etkin gücü ölçekler." }),
  gust: num({ min: 0, max: 1, default: .3, step: .05, hint: "Gücün hamlelerle gelen payı (0–1)." }),
};

export const LevelSettingsFields = {
  cellSize: num({
    min: 16,
    max: 4096,
    step: 1,
    default: DEFAULT_CELL_SIZE,
    label: "Cell Size",
    hint: "Akış ızgarasının hücre kenarı (metre). Aktörler kayıtta bu ızgaraya göre hücre dosyalarına dağılır; değiştirmek bütün hücreleri yeniden yazar.",
  }),
  wind: object(WindFields, { hint: "WES'in level rüzgârını kullanması seçiliyken veya WES yokken kullanılan rüzgâr." }),
  // Phase 5b decision 1 (user, 2026-11-16): the streaming ranges are level
  // settings, scaled by the quality profile's `viewDistanceMultiplier`.
  viewDistance: num({
    min: 0,
    max: 20000,
    step: 10,
    slider: [0, 5000],
    default: 0,
    label: "View Distance",
    hint: "Oyunda kameranın uzak düzlemi (metre); kalite ayarıyla ölçeklenir. 0 ise kamera kendi uzak düzlemini kullanır. 1000 m'nin üstünde Height Fog > Fit to View Distance ile eşleştirin.",
  }),
  loadRange: num({
    min: 16,
    max: 20000,
    step: 1,
    slider: [64, 2048],
    default: 384,
    label: "Load Range",
    hint: "Kameraya bu kadar metre yakın hücreler yüklenir; ötesi boşaltılır. Kalite ayarıyla ölçeklenir.",
  }),
  // Plan 5c R8.4 (user, 2026-11-17): landmark components show past the view distance up to here.
  landmarkDistance: num({
    min: 0,
    max: 100000,
    step: 10,
    slider: [0, 20000],
    default: 0,
    label: "Landmark Distance",
    hint: "Landmark işaretli nesneler görüş mesafesinin ötesinde bu uzaklığa kadar siluet olarak görünür (metre); kalite ayarıyla ölçeklenir. 0 ise görüş mesafesinin 3 katı.",
  }),
};

export type LevelSettings = FieldValues<typeof LevelSettingsFields>;
/** The assembler/editor refresh the holder; consumers read live settings. */
export const LevelSettingsKey = createServiceKey<{ current: LevelSettings }>("forge.levelSettings");

export const ActorStreamingFields = {
  spatiallyLoaded: bool({
    default: true,
    label: "Spatially Loaded",
    hint: "Açıkken aktör konumunun düştüğü hücreyle birlikte yüklenir. Kapalıyken kalıcı katmanda durur ve hep yüklüdür. Alt aktör kökünü izler.",
  }),
};

/**
 * Forge's Lock Movement (user decision 2026-11-14, phase 4 step 5): the editor
 * neither drags nor snaps a locked actor. Editor data like `pivot`: the world
 * and the game never read it; the canonical document writes it only when on.
 */
export const ActorLockField = bool({
  default: false,
  label: "Lock Movement",
  hint: "Açıkken aktör editörde taşınmaz, döndürülmez, ölçeklenmez (gizmo ve yapıştırma onu atlar). Yalnız editör kullanır; oyun okumaz.",
});

export const ActorPivotField = vec3({
  default: [0, 0, 0],
  label: "Pivot",
  hint: "Döndürme ve ölçeğin etrafında yapıldığı nokta, aktörün yerel uzayında (metre). Yalnız editör kullanır; oyun okumaz.",
});
