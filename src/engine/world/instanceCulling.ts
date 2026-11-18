/**
 * Per-instance culling of the GPU-driven path (phase 5c step 5.1; plan 5c
 * decision 5): the CPU reference of the compute pass, and the shared rules
 * both sides read. Pure; the render layer writes the same numbers into its
 * uniforms, so a GPU count is checked against this one (as Phase 1 G7 did).
 *
 * An instance is a column-major 4 × 4 world matrix (the batch template's
 * placement). Against one view it is:
 * - inside the view when its bounding sphere (the template's sphere, centre
 *   moved by the matrix, radius × the matrix's largest axis scale) is on the
 *   inner side of all six planes (`dot(n, c) + d >= -r`);
 * - near enough when its measured distance is below the batch's cull end
 *   (the end of its fade band; the dither fade itself is the material's).
 *   The distance is from the view origin to the instance origin (Forge's
 *   foliage fade), or that ÷ the largest axis scale (Forge's static detail
 *   culling: a bigger copy fades farther);
 * - drawn with LOD k, k the number of `lodStarts` at or below the distance.
 *
 * The GPU computes in f32, this in f64: `cullInstanceCounts` also returns,
 * per LOD, how many instances are certainly there and how many could be
 * within a small relative margin of a plane, the cull end or a LOD start.
 * A GPU count outside that range is a bug, not rounding.
 */
import { casterFadeEnd, maxCasterCascade, type ShadowCasterProfile } from "./shadowCasters.ts";
import type { Vec3 } from "../../core/schema/fields.ts";

/** Most LODs a batch draws (the uniform holds one start per LOD past the first). */
export const MAX_INSTANCE_LODS = 4;
/** "Never": the largest distance the GPU's f32 uniforms carry without an infinity. */
export const NO_CULL_DISTANCE = 3e38;
/** Relative margin of the f32 / f64 comparison range. */
const MARGIN = 1e-4;

export type InstanceDistanceMode = "origin" | "scaled";

export interface InstanceCullBatch {
  /** The template's bounding sphere, in template space. */
  readonly center: Readonly<Vec3>;
  readonly radius: number;
  readonly distanceMode: InstanceDistanceMode;
  /** Instances measured farther than this are culled; {@link NO_CULL_DISTANCE} never. */
  readonly cullEnd: number;
  /** Measured distances where LOD 1, 2, … start, ascending; at most MAX_INSTANCE_LODS - 1. */
  readonly lodStarts: readonly number[];
}

export interface InstanceCullView {
  /** Six planes (nx, ny, nz, d), unit normals pointing inside. */
  readonly planes: ArrayLike<number>;
  /** Where distances are measured from (the camera). */
  readonly origin: Readonly<Vec3>;
  readonly minCasterRadius?: number;
  readonly casterProfile?: ShadowCasterProfile;
}

/**
 * The six planes of a view-projection matrix (column-major) whose clip depth
 * is 0..w (WebGPU; reversed depth too: only near and far swap), or -w..w
 * (`minusOneToOne`: WebGL, the CPU twin on the WebGL2 test backend). A plane
 * whose normal vanishes (an infinite far plane) becomes (0, 0, 0, 1): always
 * inside.
 */
export function frustumPlanesOf(viewProjection: ArrayLike<number>, clipDepth: "zeroToOne" | "minusOneToOne" = "zeroToOne"): Float32Array {
  const m = (row: number, column: number): number => viewProjection[column * 4 + row]!;
  const row = (index: number): [number, number, number, number] => [m(index, 0), m(index, 1), m(index, 2), m(index, 3)];
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
  const planes = [
    r3.map((value, i) => value + r0[i]!),
    r3.map((value, i) => value - r0[i]!),
    r3.map((value, i) => value + r1[i]!),
    r3.map((value, i) => value - r1[i]!),
    clipDepth === "zeroToOne" ? r2 : r3.map((value, i) => value + r2[i]!),
    r3.map((value, i) => value - r2[i]!),
  ];
  const out = new Float32Array(24);
  planes.forEach((plane, index) => {
    const length = Math.hypot(plane[0]!, plane[1]!, plane[2]!);
    const unit = length > 1e-12 ? plane.map((value) => value / length) : [0, 0, 0, 1];
    out.set(unit, index * 4);
  });
  return out;
}

/**
 * The view a planar mirror sees of `view` (plan 5c R9a, step 1): a point is
 * in the mirrored frustum when its reflection is in `view`'s, so each plane
 * and the origin reflect through `mirror` (unit normal m, offset c: m·p + c =
 * 0). The mirror camera's oblique near plane (only what is in front of the
 * mirror) is left out: the result is a superset, never a false cull.
 */
export function mirrorCullView(view: InstanceCullView, mirror: readonly [number, number, number, number]): InstanceCullView {
  const [mx, my, mz, c] = mirror;
  const planes = new Float32Array(24);
  for (let at = 0; at < 24; at += 4) {
    const nx = view.planes[at]!, ny = view.planes[at + 1]!, nz = view.planes[at + 2]!, d = view.planes[at + 3]!;
    const along = nx * mx + ny * my + nz * mz;
    planes[at] = nx - 2 * along * mx; planes[at + 1] = ny - 2 * along * my; planes[at + 2] = nz - 2 * along * mz;
    planes[at + 3] = d - 2 * c * along;
  }
  const [ox, oy, oz] = view.origin;
  const side = mx * ox + my * oy + mz * oz + c;
  return { planes, origin: [ox - 2 * side * mx, oy - 2 * side * my, oz - 2 * side * mz] };
}

/** The largest axis scale of the matrix at `at` (the length of its longest basis column). */
export function maxAxisScale(matrices: ArrayLike<number>, at: number): number {
  const column = (c: number): number => Math.hypot(matrices[at + c * 4]!, matrices[at + c * 4 + 1]!, matrices[at + c * 4 + 2]!);
  return Math.max(column(0), column(1), column(2));
}

/** The instance's measured distance from `origin` (the matrix at `at`): to its origin, ÷ its largest axis scale when `scaled`. */
export function measuredDistance(matrices: ArrayLike<number>, at: number, mode: InstanceDistanceMode, origin: Readonly<Vec3>): number {
  const raw = Math.hypot(matrices[at + 12]! - origin[0], matrices[at + 13]! - origin[1], matrices[at + 14]! - origin[2]);
  return mode === "scaled" ? raw / Math.max(maxAxisScale(matrices, at), 1e-6) : raw;
}

/** Distance where a surviving caster loses its last eligible cascade. */
export function instanceCasterFadeEnd(matrices: ArrayLike<number>, at: number, radius: number, profile: ShadowCasterProfile): number {
  return casterFadeEnd(maxCasterCascade(radius * maxAxisScale(matrices, at), profile.texels, profile.minTexels), profile);
}

/**
 * How much of an instance the fade band shows at a measured distance: 1 before
 * `fadeStart`, 0 from `cullEnd`, smoothstep between (the dither threshold
 * compares with it, as the GPU path's material does).
 */
export function fadeShown(distance: number, fadeStart: number, cullEnd: number): number {
  if (!(cullEnd > fadeStart)) return distance < cullEnd ? 1 : 0;
  const t = Math.min(1, Math.max(0, (distance - fadeStart) / (cullEnd - fadeStart)));
  return 1 - t * t * (3 - 2 * t);
}

/** -1 certainly below `limit`, 1 certainly at or above it, 0 within the margin. */
function side(value: number, limit: number): -1 | 0 | 1 {
  const margin = MARGIN * Math.max(1, Math.abs(value), Math.abs(limit));
  return value >= limit + margin ? 1 : value < limit - margin ? -1 : 0;
}

export interface InstanceCullResult {
  /** Instances per LOD by the exact (f64) test. */
  readonly counts: readonly number[];
  /** Instances per LOD the f32 test certainly agrees on. */
  readonly certain: readonly number[];
  /** Instances per LOD the f32 test may put there (certain ones included). */
  readonly possible: readonly number[];
  /** Indices per LOD by the exact test, ascending. */
  readonly visible: readonly (readonly number[])[];
}

/** The reference cull of `count` matrices (16 floats each, column-major) against one view. */
export function cullInstanceCounts(
  matrices: ArrayLike<number>,
  count: number,
  batch: InstanceCullBatch,
  view: InstanceCullView,
): InstanceCullResult {
  const lods = batch.lodStarts.length + 1;
  if (lods > MAX_INSTANCE_LODS) throw new Error(`instance culling: at most ${MAX_INSTANCE_LODS} LODs`);
  const counts = new Array<number>(lods).fill(0);
  const certain = new Array<number>(lods).fill(0);
  const possible = new Array<number>(lods).fill(0);
  const visible: number[][] = Array.from({ length: lods }, () => []);
  const [cx, cy, cz] = batch.center;
  for (let index = 0; index < count; index += 1) {
    const at = index * 16;
    const e = (i: number): number => matrices[at + i]!;
    const scale = maxAxisScale(matrices, at);
    const wx = e(0) * cx + e(4) * cy + e(8) * cz + e(12);
    const wy = e(1) * cx + e(5) * cy + e(9) * cz + e(13);
    const wz = e(2) * cx + e(6) * cy + e(10) * cz + e(14);
    const radius = batch.radius * scale;
    const minimum = view.minCasterRadius ?? 0;
    const caster = minimum > 0 ? side(radius, minimum) : 1;
    if (caster === -1) continue;
    // Inside: every plane passes; 1 certainly, 0 maybe.
    let inside: -1 | 0 | 1 = 1;
    for (let plane = 0; plane < 6 && inside !== -1; plane += 1) {
      const p = plane * 4;
      const n = view.planes;
      const s = side(n[p]! * wx + n[p + 1]! * wy + n[p + 2]! * wz + n[p + 3]!, -radius);
      if (s < inside) inside = s;
    }
    const distance = measuredDistance(matrices, at, batch.distanceMode, view.origin);
    // Near: below the cull end (strictly, as the shader's `lessThan`).
    const far = side(distance, batch.cullEnd);
    const near: -1 | 0 | 1 = far === 1 ? -1 : far === -1 ? 1 : 0;
    const passes = Math.min(inside, near, caster);
    let lod = 0;
    let lowLod = 0;
    let highLod = 0;
    for (const start of batch.lodStarts) {
      if (distance >= start) lod += 1;
      const s = side(distance, start);
      if (s === 1) lowLod += 1;
      if (s >= 0) highLod += 1;
    }
    if (radius >= minimum && distance < batch.cullEnd && passesExactly(view.planes, wx, wy, wz, radius)) {
      counts[lod] = counts[lod]! + 1;
      visible[lod]!.push(index);
    }
    if (passes === 1 && lowLod === highLod) certain[lod] = certain[lod]! + 1;
    if (passes >= 0) for (let k = lowLod; k <= highLod; k += 1) possible[k] = possible[k]! + 1;
  }
  return { counts, certain, possible, visible };
}

function passesExactly(planes: ArrayLike<number>, x: number, y: number, z: number, radius: number): boolean {
  for (let p = 0; p < 24; p += 4) {
    if (planes[p]! * x + planes[p + 1]! * y + planes[p + 2]! * z + planes[p + 3]! < -radius) return false;
  }
  return true;
}

/**
 * Forge's foliage fade window (render-three/foliageFade.ts `foliageFadeWindow`
 * @ forge-webgl-final): a type's `cullStart` / `cullEnd` × the quality scale,
 * or null when the type never culls (`cullEnd <= 0`). A fade needs
 * `0 < cullStart < cullEnd`; otherwise instances cut off at `cullEnd`.
 */
export function foliageFadeWindow(cullStart: number, cullEnd: number, scale = 1): [number, number] | null {
  const factor = scale > 0 ? scale : 1;
  if (!(cullEnd > 0)) return null;
  const end = cullEnd * factor;
  const start = cullStart > 0 && cullStart < cullEnd ? cullStart * factor : end;
  return [start, end];
}

/**
 * Measured-distance starts of LODs 1… from their screen sizes (the
 * `forge.foliageType` `lods[].screenSize`: the bounding sphere's diameter as
 * a fraction of the view height). For the scaled distance the start is the
 * same for every copy: `radius / (screenSize × tan(fov / 2))`.
 */
export function lodStartsOfScreenSizes(radius: number, screenSizes: readonly number[], verticalFovDeg: number): number[] {
  const tanHalf = Math.tan((verticalFovDeg * Math.PI) / 360);
  return screenSizes.map((size) => (size > 0 && tanHalf > 0 ? Math.min(NO_CULL_DISTANCE, radius / (size * tanHalf)) : NO_CULL_DISTANCE));
}
