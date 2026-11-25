// A stand (vegetation plan PG5b step 6): several Landscape foliage rules that
// share one grid, so a mixed forest's trees keep their distance from each other
// whatever their species. Rules with the same seed and density walk the same
// hexagonal slots; each rule takes the slots whose pick falls in its share.
//
// - A slot's place and rolls hash from its grid index: a ring cell only asks
//   which slots end inside it, so the layout does not depend on the cell size
//   or the cull distance, and cells meet without a seam.
// - The step follows from the density: counts and shares are exact.
// - `patch` groups species: a slot's pick leans on its patch's (a torn square
//   of that size), so neighbours in the list of shares grow together. Over the
//   world the shares stay.

import { foliageCellSeed } from "./foliageHash.ts";
import { makeFoliageRng } from "./foliageRoll.ts";

export interface FoliageStandParams {
  /** The rule's slots: those whose pick is in [from, to), 0..1. */
  from: number;
  to: number;
  /** Size of a species patch, metres (0: no patches). */
  patch: number;
}

/** How far a slot moves off its grid point, in steps: stems under 2.5 m apart stay rare at forest densities. */
const JITTER = 0.8;
/** How much of the list of shares one patch mixes. */
const PATCH_SPREAD = 0.5;
/** How far a patch's edge is torn, in patches. */
const PATCH_TEAR = 0.6;
const PATCH_SALT = 0x5bd1e995;

export interface StandSlot {
  x: number;
  z: number;
  /** The fixed value a keep fraction is compared with. */
  r: number;
  scaleT: number;
  yawT: number;
  offsetT: number;
}

/** The rule's slots that end inside [minX, maxX) × [minZ, maxZ), in row order; `visit` gets one reused object and stops the walk with false. */
export function forEachStandSlot(
  seed: number, density: number, stand: FoliageStandParams,
  minX: number, minZ: number, maxX: number, maxZ: number,
  visit: (slot: StandSlot) => boolean,
): void {
  const step = Math.sqrt(2 / (Math.sqrt(3) * density)), rowStep = step * Math.sqrt(3) / 2;
  const reach = JITTER / 2;
  const slot: StandSlot = { x: 0, z: 0, r: 0, scaleT: 0, yawT: 0, offsetT: 0 };
  for (let j = Math.floor(minZ / rowStep - reach - 1); j <= Math.ceil(maxZ / rowStep + reach); j += 1) {
    const shift = (j & 1) * 0.5;
    for (let i = Math.floor(minX / step - reach - 1.5); i <= Math.ceil(maxX / step + reach); i += 1) {
      const rng = makeFoliageRng(foliageCellSeed(seed, i, j));
      slot.x = (i + shift + 0.5 + (rng() - 0.5) * JITTER) * step;
      slot.z = (j + 0.5 + (rng() - 0.5) * JITTER) * rowStep;
      if (slot.x < minX || slot.x >= maxX || slot.z < minZ || slot.z >= maxZ) continue;
      let pick = rng();
      if (stand.patch > 0) {
        const px = Math.floor(slot.x / stand.patch + (rng() - 0.5) * PATCH_TEAR), pz = Math.floor(slot.z / stand.patch + (rng() - 0.5) * PATCH_TEAR);
        pick = makeFoliageRng(foliageCellSeed(seed ^ PATCH_SALT, px, pz))() + (pick - 0.5) * PATCH_SPREAD;
        pick -= Math.floor(pick);
      }
      if (pick < stand.from || pick >= stand.to) continue;
      slot.r = rng();
      slot.scaleT = rng();
      slot.yawT = rng();
      slot.offsetT = rng();
      if (!visit(slot)) return;
    }
  }
}
