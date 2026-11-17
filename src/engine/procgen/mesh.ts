import { cross, pointAt, sub, unit } from "./vector.ts";
import type { Vec3 } from "./vector.ts";

export interface ProcMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** Optional linear RGBA, four components per vertex. */
  colors?: Float32Array;
  indices: Uint32Array;
}
export interface MeshBounds { min: Vec3; max: Vec3 }

/** Indexed builder. Missing normals are computed on build; missing colors become white. */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private hasNormals = true;
  private hasColors = false;

  addVertex(position: Vec3, normal?: Vec3, color?: readonly [number, number, number, number]): number {
    const index = this.positions.length / 3;
    this.positions.push(...position);
    this.normals.push(...(normal ?? [0, 0, 0]));
    this.colors.push(...(color ?? [1, 1, 1, 1]));
    this.hasNormals &&= normal !== undefined;
    this.hasColors ||= color !== undefined;
    return index;
  }
  addTriangle(a: number, b: number, c: number): void { this.indices.push(a, b, c); }
  build(): ProcMesh {
    const mesh: ProcMesh = {
      positions: new Float32Array(this.positions), normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
    };
    if (this.hasColors) mesh.colors = new Float32Array(this.colors);
    if (!this.hasNormals) computeVertexNormals(mesh);
    return mesh;
  }
}

/** Mutates mesh.normals and returns it. Cross products accumulate triangle area weights. */
export function computeVertexNormals(mesh: ProcMesh): Float32Array {
  const sums = new Float64Array(mesh.positions.length);
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!, b = mesh.indices[i + 1]!, c = mesh.indices[i + 2]!;
    const n = cross(sub(pointAt(mesh.positions, b), pointAt(mesh.positions, a)),
      sub(pointAt(mesh.positions, c), pointAt(mesh.positions, a)));
    for (const index of [a, b, c]) for (let axis = 0; axis < 3; axis++) {
      sums[index * 3 + axis] = sums[index * 3 + axis]! + n[axis]!;
    }
  }
  mesh.normals = new Float32Array(mesh.positions.length);
  for (let i = 0; i < sums.length / 3; i++) mesh.normals.set(unit(pointAt(sums, i)), i * 3);
  return mesh.normals;
}

/** Empty meshes have a zero-sized bound at the origin. */
export function meshBounds(mesh: Pick<ProcMesh, "positions">): MeshBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  if (mesh.positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  for (let i = 0; i < mesh.positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis]!, mesh.positions[i]!);
    max[axis] = Math.max(max[axis]!, mesh.positions[i]!);
  }
  return { min, max };
}

/** First matching vertex wins (including its color). Euclidean epsilon, not quantization.
 * Collapsed triangles are removed; normals are recomputed after welding.
 */
export function weldVertices(mesh: ProcMesh, epsilon: number): ProcMesh {
  const tolerance = Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 0;
  const cells = new Map<string, number[]>(), positions: number[] = [], colors: number[] = [];
  const remap: number[] = [];
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const p = pointAt(mesh.positions, i);
    const cell = tolerance > 0 ? p.map(v => Math.floor(v / tolerance)) : p;
    let match: number | undefined;
    const radius = tolerance > 0 ? 1 : 0;
    for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const candidates = cells.get(`${cell[0]! + x},${cell[1]! + y},${cell[2]! + z}`) ?? [];
        for (const index of candidates) {
          if (Math.hypot(...sub(p, pointAt(positions, index))) <= tolerance && (match === undefined || index < match)) match = index;
        }
      }
    }
    if (match === undefined) {
      match = positions.length / 3;
      positions.push(...p);
      if (mesh.colors) colors.push(...mesh.colors.slice(i * 4, i * 4 + 4));
      const key = cell.join(",");
      const bucket = cells.get(key) ?? [];
      bucket.push(match); cells.set(key, bucket);
    }
    remap.push(match);
  }
  const indices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]!]!, b = remap[mesh.indices[i + 1]!]!, c = remap[mesh.indices[i + 2]!]!;
    if (a !== b && b !== c && c !== a) indices.push(a, b, c);
  }
  const result: ProcMesh = { positions: new Float32Array(positions), normals: new Float32Array(positions.length), indices: new Uint32Array(indices) };
  if (mesh.colors) result.colors = new Float32Array(colors);
  computeVertexNormals(result);
  return result;
}

export function validateMesh(mesh: ProcMesh): string[] {
  const problems: string[] = [], vertices = mesh.positions.length / 3;
  if (!Number.isInteger(vertices)) problems.push("positions length is not a multiple of 3");
  if (mesh.normals.length !== mesh.positions.length) problems.push("normal count differs from vertex count");
  if (mesh.colors && mesh.colors.length !== vertices * 4) problems.push("color count differs from vertex count");
  if (mesh.indices.length % 3) problems.push("indices length is not a multiple of 3");
  for (const [name, values] of [["positions", mesh.positions], ["normals", mesh.normals], ["colors", mesh.colors]] as const) {
    if (values?.some(value => !Number.isFinite(value))) problems.push(`${name} contains NaN or Infinity`);
  }
  const badIndex = mesh.indices.some(index => index >= vertices);
  if (badIndex) problems.push("index out of range");
  let degenerate = 0, nonUnit = 0;
  for (let i = 0; i < mesh.normals.length / 3; i++) {
    if (Math.abs(Math.hypot(...pointAt(mesh.normals, i)) - 1) > 1e-3) nonUnit++;
  }
  if (!badIndex) for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    const a = pointAt(mesh.positions, mesh.indices[i]!);
    const b = pointAt(mesh.positions, mesh.indices[i + 1]!);
    const c = pointAt(mesh.positions, mesh.indices[i + 2]!);
    const ab = sub(b, a), ac = sub(c, a);
    const lengthProduct = Math.hypot(...ab) * Math.hypot(...ac);
    if (lengthProduct === 0 || Math.hypot(...cross(ab, ac)) <= lengthProduct * 1e-10) degenerate++;
  }
  if (degenerate) problems.push(`degenerate triangles: ${degenerate}`);
  if (nonUnit) problems.push(`non-unit normals: ${nonUnit}`);
  return problems;
}
