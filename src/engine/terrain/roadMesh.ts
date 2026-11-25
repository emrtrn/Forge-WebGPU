// Ported from Forge WebGL src/scene/SceneRuntimeCore.ts. The local frame is the terrain centre.
// Unlike Forge, a bent model repeats along a segment at about its own length (user decision
// 2026-11-25) instead of being stretched over it once: the road follows the curve between a
// segment's points and the model's details keep their length.
import type { Vec3 } from "../legacy/layout.ts";
import {
  computeLandscapeSplineMeshInstances,
  resolveLandscapeSplineMeshChains,
  type LandscapeSplineMeshChain,
  type LandscapeSplineMeshInstance,
} from "./landscape.ts";
import type { TerrainSplineMeshSource } from "./terrainSplineMeshes.ts";

export interface RoadMeshAttribute {
  readonly size: number;
  readonly values: Float32Array;
}

/** One drawable piece in model root space. Position has size 3. UV is optional. */
export interface RoadMeshPart {
  readonly attributes: Readonly<Record<string, RoadMeshAttribute>>;
  readonly indices: Uint32Array | null;
}

export interface RoadMeshModel {
  readonly parts: readonly RoadMeshPart[];
}

export interface RoadMeshDeformPath {
  readonly points: readonly Vec3[];
  readonly scale: Vec3;
  readonly offset: Vec3;
  readonly yawOffset: number;
  readonly bank: number;
  readonly alignToTerrain: boolean;
  readonly distanceStart?: number;
  readonly pathDistanceStart?: number;
  readonly pathDistanceEnd?: number;
}

export interface RoadMeshChunk {
  readonly assetId: string;
  /** Index in the model's parts. */
  readonly part: number;
  /** `x_z` of the local grid cell. */
  readonly cell: string;
  readonly attributes: Readonly<Record<string, RoadMeshAttribute>>;
  readonly indices: Uint32Array;
}

export interface RoadMeshBuild {
  readonly chunks: readonly RoadMeshChunk[];
  readonly instances: readonly LandscapeSplineMeshInstance[];
  readonly problems: readonly string[];
}

const MIN_LENGTH = 1e-6;
const END_RING_TOLERANCE = 1e-5;
const WELD_TOLERANCE = 1e-5;
/** Copies of the model along one segment at most (a tiny model on a long segment). */
const MAX_COPIES = 256;
const WORLD_UP: Vec3 = [0, 1, 0];
const WORLD_FORWARD: Vec3 = [0, 0, 1];

type Extent = { readonly min: number; readonly max: number };
type NormalAt = TerrainSplineMeshSource["normalAt"];
type Rotation = { cosine: number; sine: number };

function rotation(degrees: number): Rotation {
  const radians = (degrees * Math.PI) / 180;
  return { cosine: Math.cos(radians), sine: Math.sin(radians) };
}

function forwardExtent(parts: readonly RoadMeshPart[], yaw?: Rotation): Extent {
  let min = Infinity;
  let max = -Infinity;
  for (const { attributes } of parts) {
    const values = attributes.position!.values;
    for (let i = 0; i < values.length; i += 3) {
      const z = yaw ? Math.fround(values[i + 2]! * yaw.cosine - values[i]! * yaw.sine) : values[i + 2]!;
      min = Math.min(min, z);
      max = Math.max(max, z);
    }
  }
  return { min, max };
}

/** Z extent of the whole model, or zero when it has no vertices. */
export function roadModelForwardLength(model: RoadMeshModel): number {
  const { min, max } = forwardExtent(model.parts);
  return Math.max(0, max - min);
}

function vectorAt(values: ArrayLike<number>, offset: number): Vec3 {
  return [values[offset]!, values[offset + 1]!, values[offset + 2]!];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(vector: Vec3): Vec3 {
  const inverseLength = 1 / (Math.sqrt(dot(vector, vector)) || 1);
  return [vector[0] * inverseLength, vector[1] * inverseLength, vector[2] * inverseLength];
}

interface PathPiece {
  start: Vec3;
  delta: Vec3;
  length: number;
  endDistance: number;
}

interface SampledPath {
  pieces: PathPiece[];
  total: number;
}

function pathSegmentLengths(points: readonly Vec3[]): SampledPath {
  const pieces: PathPiece[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1]!;
    const delta = subtract(points[i]!, start);
    const length = Math.hypot(...delta);
    total += length;
    pieces.push({ start, delta, length, endDistance: total });
  }
  return { pieces, total };
}

function sampleDeformPathAtDistance(path: SampledPath, requestedDistance: number) {
  const { pieces, total } = path;
  const distance = Math.min(total, Math.max(0, requestedDistance));
  let low = 0;
  let high = pieces.length - 1;
  // Exact joins use the incoming frame so adjacent end rings agree.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (distance > pieces[middle]!.endDistance) low = middle + 1;
    else high = middle;
  }
  let consumed = pieces[low - 1]?.endDistance ?? 0;
  for (let i = low; i < pieces.length; i += 1) {
    const { length, start, delta } = pieces[i]!;
    // Match Forge's scan when the selected piece is too short to give a frame.
    if (distance > consumed + length && i < pieces.length - 1) {
      consumed += length;
      continue;
    }
    if (length <= MIN_LENGTH) continue;
    const local = (distance - consumed) / length;
    const position: Vec3 = [start[0] + delta[0] * local, start[1] + delta[1] * local, start[2] + delta[2] * local];
    return { position, tangent: normalize(delta) };
  }
  return null;
}

function resolveLongitudinalSplineUvComponent(positions: Float32Array, uv: RoadMeshAttribute, extent: Extent): 0 | 1 {
  const count = positions.length / 3;
  if (uv.size < 2 || uv.values.length !== count * uv.size || count === 0) return 1;
  let sumT = 0;
  let sumU = 0;
  let sumV = 0;
  let sumTT = 0;
  let sumTU = 0;
  let sumTV = 0;
  let sumUU = 0;
  let sumVV = 0;
  const length = extent.max - extent.min;
  for (let i = 0; i < count; i += 1) {
    const t = (positions[i * 3 + 2]! - extent.min) / length;
    const u = uv.values[i * uv.size]!;
    const v = uv.values[i * uv.size + 1]!;
    sumT += t;
    sumU += u;
    sumV += v;
    sumTT += t * t;
    sumTU += t * u;
    sumTV += t * v;
    sumUU += u * u;
    sumVV += v * v;
  }
  const covariance = (sumXY: number, sumX: number, sumY: number): number => sumXY - (sumX * sumY) / count;
  const varT = covariance(sumTT, sumT, sumT);
  const varU = covariance(sumUU, sumU, sumU);
  const varV = covariance(sumVV, sumV, sumV);
  const scoreU = varT > 1e-8 && varU > 1e-8 ? Math.abs(covariance(sumTU, sumT, sumU)) / Math.sqrt(varT * varU) : 0;
  const scoreV = varT > 1e-8 && varV > 1e-8 ? Math.abs(covariance(sumTV, sumT, sumV)) / Math.sqrt(varT * varV) : 0;
  return scoreU > scoreV ? 0 : 1;
}

/** Bends one part with a shared or part-local yawed Z extent. Drops stale normals and tangents. */
export function deformRoadPart(part: RoadMeshPart, path: RoadMeshDeformPath, normalAt: NormalAt, extent?: Extent): RoadMeshPart | null {
  const yaw = rotation(path.yawOffset);
  return deformPart(part, path, normalAt, extent ?? forwardExtent([part], yaw), yaw, pathSegmentLengths(path.points));
}

function deformPart(
  part: RoadMeshPart,
  path: RoadMeshDeformPath,
  normalAt: NormalAt,
  extent: Extent,
  yaw: Rotation,
  sampledPath: SampledPath,
): RoadMeshPart | null {
  const sourceLength = extent.max - extent.min;
  const pathStart = path.pathDistanceStart ?? 0;
  const pathEnd = path.pathDistanceEnd ?? sampledPath.total;
  const span = pathEnd - pathStart;
  if (sourceLength <= MIN_LENGTH || sampledPath.total <= MIN_LENGTH || span <= MIN_LENGTH || pathEnd > sampledPath.total + 1e-4) {
    return null;
  }

  const { position, uv, normal: _normal, tangent: _tangent, ...otherAttributes } = part.attributes;
  const values = position!.values.slice();
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i]!;
    const z = values[i + 2]!;
    values[i] = x * yaw.cosine + z * yaw.sine;
    values[i + 2] = z * yaw.cosine - x * yaw.sine;
  }
  const longitudinalUv = uv ? resolveLongitudinalSplineUvComponent(values, uv, extent) : 1;
  const uvValues = uv?.values.slice();
  const distanceStart = path.distanceStart ?? 0;
  const bank = Math.abs(path.bank) > MIN_LENGTH ? rotation(path.bank) : null;

  for (let i = 0; i < values.length; i += 3) {
    const rawT = (values[i + 2]! - extent.min) / sourceLength;
    // Snap near-end rings so floating-point drift cannot give them different frames.
    const t = rawT <= END_RING_TOLERANCE ? 0 : rawT >= 1 - END_RING_TOLERANCE ? 1 : rawT;
    const distance = t * span;
    const sample = sampleDeformPathAtDistance(sampledPath, pathStart + distance);
    if (!sample) continue;
    const { position: centre, tangent } = sample;
    const upHint = path.alignToTerrain ? normalAt(centre[0], centre[2]) : WORLD_UP;
    let right = normalize(cross(upHint, tangent));
    if (dot(right, right) <= 1e-8) right = normalize(cross(WORLD_FORWARD, tangent));
    if (bank) {
      const perpendicular = cross(tangent, right);
      const alongAxis = dot(tangent, right) * (1 - bank.cosine);
      right = [
        right[0] * bank.cosine + perpendicular[0] * bank.sine + tangent[0] * alongAxis,
        right[1] * bank.cosine + perpendicular[1] * bank.sine + tangent[1] * alongAxis,
        right[2] * bank.cosine + perpendicular[2] * bank.sine + tangent[2] * alongAxis,
      ];
    }
    const up = normalize(cross(tangent, right));
    const x = values[i]! * path.scale[0];
    const y = values[i + 1]! * path.scale[1];
    values[i] = centre[0] + right[0] * x + up[0] * y + path.offset[0];
    values[i + 1] = centre[1] + right[1] * x + up[1] * y + path.offset[1];
    values[i + 2] = centre[2] + right[2] * x + up[2] * y + path.offset[2];
    if (uv && uvValues) uvValues[i / 3 * uv.size + longitudinalUv] = (distanceStart + distance) / sourceLength;
  }

  const attributes = { ...otherAttributes, position: { size: 3, values }, ...(uv && uvValues ? { uv: { size: uv.size, values: uvValues } } : {}) };
  return { attributes, indices: part.indices };
}

interface MeshBuffer {
  attributes: { name: string; size: number; values: number[] }[];
  vertexCount: number;
  indices: number[];
}

type IndexedPart = RoadMeshPart & { readonly indices: Uint32Array };

function meshBuffer(source: RoadMeshPart["attributes"]): MeshBuffer {
  return {
    attributes: Object.entries(source).map(([name, { size }]) => ({ name, size, values: [] })),
    vertexCount: 0,
    indices: [],
  };
}

function appendVertex(target: MeshBuffer, source: RoadMeshPart["attributes"], vertex: number): number {
  for (const { name, size, values } of target.attributes) {
    const input = source[name]!.values;
    for (let i = vertex * size; i < (vertex + 1) * size; i += 1) values.push(input[i]!);
  }
  return target.vertexCount++;
}

function finishMesh(buffer: MeshBuffer): IndexedPart {
  return {
    attributes: Object.fromEntries(buffer.attributes.map(({ name, size, values }) => [name, { size, values: Float32Array.from(values) }])),
    indices: Uint32Array.from(buffer.indices),
  };
}

function weldKey(attributes: readonly RoadMeshAttribute[], vertex: number): string {
  let key = "";
  for (const { size, values } of attributes) {
    for (let i = vertex * size; i < (vertex + 1) * size; i += 1) {
      key += `|${Math.round(values[i]! / WELD_TOLERANCE)}`;
    }
  }
  return key;
}

function computeVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3;
    const b = indices[i + 1]! * 3;
    const c = indices[i + 2]! * 3;
    const middle = vectorAt(positions, b);
    // The cross product's magnitude weights each face by its area.
    const face = cross(subtract(vectorAt(positions, c), middle), subtract(vectorAt(positions, a), middle));
    for (const offset of [a, b, c]) {
      normals[offset] = normals[offset]! + face[0];
      normals[offset + 1] = normals[offset + 1]! + face[1];
      normals[offset + 2] = normals[offset + 2]! + face[2];
    }
  }
  for (let i = 0; i < normals.length; i += 3) normals.set(normalize(vectorAt(normals, i)), i);
  return normals;
}

function mergeAndWeld(pieces: Iterable<RoadMeshPart>): IndexedPart | null {
  let welded: MeshBuffer | undefined;
  const verticesByKey = new Map<string, number>();
  for (const piece of pieces) {
    const target = welded ??= meshBuffer(piece.attributes);
    const attributes = target.attributes.map(({ name }) => piece.attributes[name]!);
    const count = piece.indices?.length ?? piece.attributes.position!.values.length / 3;
    function weldVertex(index: number): number {
      const vertex = piece.indices?.[index] ?? index;
      const key = weldKey(attributes, vertex);
      const existing = verticesByKey.get(key);
      if (existing !== undefined) return existing;
      const added = appendVertex(target, piece.attributes, vertex);
      verticesByKey.set(key, added);
      return added;
    }
    for (let i = 0; i + 2 < count; i += 3) {
      const a = weldVertex(i);
      const b = weldVertex(i + 1);
      const c = weldVertex(i + 2);
      if (a !== b && b !== c && c !== a) target.indices.push(a, b, c);
    }
  }
  if (!welded || welded.indices.length === 0) return null;
  const { attributes, indices } = finishMesh(welded);
  const normals = computeVertexNormals(attributes.position!.values, indices);
  return { attributes: { ...attributes, normal: { size: 3, values: normals } }, indices };
}

function bendChain(chain: LandscapeSplineMeshChain, model: RoadMeshModel, normalAt: NormalAt): (IndexedPart | null)[] {
  const points = chain.closed ? [...chain.points, chain.points[0]!] : chain.points;
  const sampledPath = pathSegmentLengths(points);
  const yaw = rotation(chain.yawOffset);
  const extent = forwardExtent(model.parts, yaw);
  function* bendPieces(part: RoadMeshPart): Iterable<RoadMeshPart> {
    const sourceLength = extent.max - extent.min;
    for (const { distanceStart, distanceEnd } of chain.segments) {
      const span = distanceEnd - distanceStart;
      const copies = sourceLength > MIN_LENGTH ? Math.min(MAX_COPIES, Math.max(1, Math.round(span / sourceLength))) : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        const start = distanceStart + (span * copy) / copies;
        // The last copy ends exactly where the next segment starts.
        const end = copy + 1 === copies ? distanceEnd : distanceStart + (span * (copy + 1)) / copies;
        const piece = deformPart(part, { ...chain, points, distanceStart: start, pathDistanceStart: start, pathDistanceEnd: end }, normalAt, extent, yaw, sampledPath);
        if (piece) yield piece;
      }
    }
  }
  return model.parts.map((part) => mergeAndWeld(bendPieces(part)));
}

interface ChunkBuffer {
  assetId: string;
  part: number;
  cell: string;
  mesh: MeshBuffer;
}

function splitIntoCells(
  source: IndexedPart,
  assetId: string,
  part: number,
  cellSize: number,
  chunks: Map<string, ChunkBuffer>,
): void {
  const { attributes, indices } = source;
  const positions = attributes.position!.values;
  const layout = Object.keys(attributes).sort().map((name) => [name, attributes[name]!.size]);
  const cells = new Map<string, { mesh: MeshBuffer; remap: Map<number, number> }>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    const x = (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3;
    const z = (positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3;
    const cell = `${Math.floor(x / cellSize)}_${Math.floor(z / cellSize)}`;
    let target = cells.get(cell);
    if (!target) {
      const key = JSON.stringify([assetId, part, cell, layout]);
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { assetId, part, cell, mesh: meshBuffer(attributes) };
        chunks.set(key, chunk);
      }
      target = { mesh: chunk.mesh, remap: new Map() };
      cells.set(cell, target);
    }
    for (const vertex of [a, b, c]) {
      let index = target.remap.get(vertex);
      if (index === undefined) {
        index = appendVertex(target.mesh, attributes, vertex);
        target.remap.set(vertex, index);
      }
      target.mesh.indices.push(index);
    }
  }
}

export function buildRoadMeshes(
  source: TerrainSplineMeshSource,
  models: ReadonlyMap<string, RoadMeshModel>,
  options: { readonly cellSize: number },
): RoadMeshBuild {
  const chunks = new Map<string, ChunkBuffer>();
  const instances: LandscapeSplineMeshInstance[] = [];
  const problems: string[] = [];
  const meshForwardLengths = new Map(Array.from(models, ([assetId, model]) => [assetId, roadModelForwardLength(model)]));
  for (const spline of source.splines) {
    if (spline.hidden) continue;
    const recordProblem = (error: unknown): void => {
      problems.push(`${spline.name || spline.id}: ${error instanceof Error ? error.message : String(error)}`);
    };
    try {
      // Preserve curve neighbours while skipping normal queries for unloaded assets.
      const segments = spline.segments.map((segment) => segment.mesh && !models.has(segment.mesh.assetId)
        ? { ...segment, mesh: { ...segment.mesh, enabled: false } }
        : segment);
      const placed = computeLandscapeSplineMeshInstances({ ...spline, segments }, { normalAt: source.normalAt, meshForwardLengths });
      for (const instance of placed) instances.push(instance);
    } catch (error) {
      recordProblem(error);
    }
    for (const chain of resolveLandscapeSplineMeshChains(spline, spline.smooth ? 32 : 1)) {
      const model = models.get(chain.assetId);
      if (!model) continue;
      try {
        // Finish all parts before publishing any triangles from this chain.
        const parts = bendChain(chain, model, source.normalAt);
        for (const [part, mesh] of parts.entries()) {
          if (mesh) splitIntoCells(mesh, chain.assetId, part, options.cellSize, chunks);
        }
      } catch (error) {
        recordProblem(error);
      }
    }
  }
  return {
    chunks: Array.from(chunks.values(), ({ assetId, part, cell, mesh }) => ({ assetId, part, cell, ...finishMesh(mesh) })),
    instances,
    problems,
  };
}
