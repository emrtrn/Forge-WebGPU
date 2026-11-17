// R7 derived geometry contract. No three, Node, DOM, asset GUIDs or timestamps.
// Bump whenever algorithms, meshoptimizer version or serialized layout change.
export const TRIANGLE_VERSION = "r7-lod-meshopt1.3-v1";
export const SMALL_TRIANGLES = 500;
export interface TriangleAttribute { readonly size: number; readonly values: readonly number[] }
export interface TriangleGroup { readonly start: number; readonly count: number; readonly materialIndex: number }
export interface TriangleInput {
  readonly attributes: Readonly<Record<string, TriangleAttribute>>;
  readonly indices: readonly number[];
  readonly groups?: readonly TriangleGroup[];
}
export interface TriangleData {
  readonly version: typeof TRIANGLE_VERSION;
  readonly key: string;
  readonly lods: readonly { readonly indices: readonly number[]; readonly error: number; readonly groups?: readonly TriangleGroup[] }[];
}

/** Canonical cache identity, independent of object IDs / attribute insertion order. */
export function triangleKey(input: TriangleInput): string {
  // Two independent 32-bit lanes; artifacts also carry a full input signature
  // (validated by the cache owner), so a hash collision is never a cache hit.
  const text = triangleSignature(input);
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
export function triangleSignature(input: TriangleInput): string {
  return JSON.stringify([TRIANGLE_VERSION, Object.keys(input.attributes).sort().map((name) => [name, input.attributes[name]!.size, input.attributes[name]!.values]), input.indices, input.groups ?? []]);
}

export function validateTriangleInput(input: TriangleInput): void {
  const position = input.attributes.position;
  if (!position || position.size !== 3 || position.values.length === 0 || position.values.length % 3) throw new Error("triangles: position must contain vec3 vertices");
  const count = position.values.length / 3;
  for (const attribute of Object.values(input.attributes)) {
    if (!Number.isInteger(attribute.size) || attribute.size < 1 || attribute.size > 4 || attribute.values.length !== count * attribute.size || attribute.values.some((x) => !Number.isFinite(x))) throw new Error("triangles: invalid vertex attribute");
  }
  if (!input.indices.length || input.indices.length % 3 || input.indices.some((x) => !Number.isInteger(x) || x < 0 || x >= count)) throw new Error("triangles: invalid triangle indices");
}

/** Projected geometric error budget (physical pixels), with conservative
 * distance to the nearest point of the template bounding sphere. The main
 * camera selects every view's LOD, preserving 5.1 shadow/fade behavior.
 * Orthographic batches conservatively use the largest instance scale.
 */
export function projectedLodStarts(errors: readonly number[], reach: number, pixelScale: number, perspective: boolean, maxScale: number, pixels = 1): number[] {
  return errors.slice(1).map((error) => perspective
    ? Math.min(3e38, reach + error * pixelScale / pixels)
    : error * pixelScale * maxScale <= pixels ? 0 : 3e38);
}
