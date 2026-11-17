import { createStream, streamSeed } from "../random.ts";
import { fbm3 } from "../noise.ts";
import { computeVertexNormals, meshBounds } from "../mesh.ts";
import type { ProcMesh } from "../mesh.ts";
import { meshStats } from "../stats.ts";
import type { MeshStats } from "../stats.ts";
import { dot, pointAt, sub } from "../vector.ts";
import type { Vec3 } from "../vector.ts";
import { normalizeRockParams } from "./rockParams.ts";
import type { RockParams } from "./rockParams.ts";
import { icosphere } from "./icosphere.ts";
import { rockCollider } from "./rockCollider.ts";
import type { RockCollider } from "./rockCollider.ts";

export interface RockOptions { vertexCap?: number }
export interface RockReport {
  code: "vertex-budget" | "collider-failed";
  message: string;
  lod?: number;
  requestedVertices?: number;
  vertexCap?: number;
}
export type RockResult = {
  ok: true;
  lods: ProcMesh[];
  collider: RockCollider;
  stats: MeshStats[];
} | { ok: false; report: RockReport };

interface Cut { normal: Vec3; distance: number }

/** A fixed sphere/half-space intersection plus normal noise. Every resolution
 * evaluates this closure; creating/sampling an LOD consumes no random stream.
 * The unscaled bottom plane is -0.65; a fully flattened bottom sits at
 * -embedDepth metres. Size denotes approximate unflattened full diameters.
 */
function surface(params: RockParams): (direction: Vec3) => Vec3 {
  const cuts: Cut[] = [];
  if (params.shape === "angular") for (let i = 0; i < params.cuts; i++) {
    const random = createStream(params.seed, "shape/cuts").fork(String(i));
    cuts.push({ normal: random.unitVector(), distance: random.range(0.72, 0.92) });
  }
  const seed = streamSeed(params.seed, "shape/displacement");
  return direction => {
    let radius = 1, normal = direction;
    for (const cut of cuts) {
      const projection = dot(cut.normal, direction);
      if (projection > 0 && cut.distance / projection < radius) {
        radius = cut.distance / projection; normal = cut.normal;
      }
    }
    const p: Vec3 = direction.map(v => v * radius) as Vec3;
    const displacement = params.noiseAmplitude * fbm3(
      p[0] * params.noiseScale + 19.1, p[1] * params.noiseScale + 7.7, p[2] * params.noiseScale - 3.4,
      { seed, octaves: params.noiseOctaves, lacunarity: 2, gain: 0.5 },
    );
    for (let axis = 0; axis < 3; axis++) p[axis] = p[axis]! + normal[axis]! * displacement;
    p[1] += (Math.max(-0.65, p[1]) - p[1]) * params.flattenBottom;
    return [p[0] * params.size[0] / 2, (p[1] + 0.65) * params.size[1] / 2 - params.embedDepth, p[2] * params.size[2] / 2];
  };
}

/** RGBA (linear data, not sRGB): R local concavity, G max(normal.y, 0),
 * B normalized height within this mesh, A 1. Concavity measures signed
 * neighbour Laplacian projected onto the area-weighted vertex normal;
 * convex regions are zero, inward dents are positive.
 */
function colorize(mesh: ProcMesh): void {
  const vertices = mesh.positions.length / 3;
  const neighbours = Array.from({ length: vertices }, () => new Set<number>());
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!, b = mesh.indices[i + 1]!, c = mesh.indices[i + 2]!;
    neighbours[a]!.add(b).add(c); neighbours[b]!.add(a).add(c); neighbours[c]!.add(a).add(b);
  }
  const bounds = meshBounds(mesh), height = bounds.max[1] - bounds.min[1];
  mesh.colors = new Float32Array(vertices * 4);
  for (let i = 0; i < vertices; i++) {
    const p = pointAt(mesh.positions, i), n = pointAt(mesh.normals, i);
    let bend = 0, length = 0;
    for (const other of neighbours[i]!) {
      const delta = sub(pointAt(mesh.positions, other), p);
      bend += dot(delta, n); length += Math.hypot(...delta);
    }
    mesh.colors.set([
      Math.max(0, Math.min(1, length > 0 ? bend / length * 4 : 0)),
      Math.max(0, Math.min(1, n[1])), height > 0 ? (p[1] - bounds.min[1]) / height : 0, 1,
    ], i * 4);
  }
}

/** Pure, synchronous, no clocks or global randomness. All LODs are preflighted
 * before allocation. Default cap 20,000 vertices per LOD; explicit overrides
 * have a hard ceiling of 200,000 to keep memory/termination bounded.
 */
export function generateRock(input: Readonly<Partial<RockParams>> | Readonly<Record<string, unknown>> = {}, options: RockOptions = {}): RockResult {
  const params = normalizeRockParams({ ...input });
  const vertexCap = Number.isFinite(options.vertexCap)
    ? Math.max(0, Math.min(200000, Math.floor(options.vertexCap!))) : 20000;
  for (let lod = 0; lod < params.lods.length; lod++) {
    const vertices = 10 * 4 ** params.lods[lod]! + 2;
    if (vertices > vertexCap) return { ok: false, report: {
      code: "vertex-budget", message: `LOD${lod} requests ${vertices} vertices; cap is ${vertexCap}`,
      lod, requestedVertices: vertices, vertexCap,
    } };
  }
  const sample = surface(params);
  const lods = params.lods.map(level => {
    const sphere = icosphere(level);
    const mesh: ProcMesh = {
      positions: Float32Array.from(sphere.directions.flatMap(sample)),
      normals: new Float32Array(sphere.directions.length * 3), indices: sphere.indices,
    };
    computeVertexNormals(mesh);
    colorize(mesh);
    return mesh;
  });
  const collider = rockCollider(lods[0]!.positions);
  if (!collider) return { ok: false, report: { code: "collider-failed", message: "Could not construct a volumetric collider" } };
  return { ok: true, lods, collider, stats: lods.map(meshStats) };
}
