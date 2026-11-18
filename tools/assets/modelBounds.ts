import { open, readFile } from "node:fs/promises";
import type { AssetIndex, Vec3, Vec4 } from "../../src/core/index.ts";
import { composeMat4, IDENTITY_MAT4, multiplyMat4, type Mat4 } from "../../src/engine/math/affine.ts";
import { transformZoneBox, type ZoneBox } from "../../src/engine/world/zones.ts";
import { parseGlb } from "./assetPerfReport.ts";

interface BoundsDocument {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    matrix?: number[];
    translation?: Vec3;
    rotation?: Vec4;
    scale?: Vec3;
    children?: number[];
    mesh?: number;
    skin?: number;
    extensions?: Record<string, unknown>;
  }[];
  meshes?: { primitives?: { attributes?: { POSITION?: number }; targets?: { POSITION?: number }[] }[] }[];
  accessors?: { min?: Vec3; max?: Vec3; normalized?: boolean }[];
}

const vec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/** Matches the default-scene local Box3 used by the static mesh binding. */
export function gltfModelBounds(json: BoundsDocument): ZoneBox | null {
  const roots = json.scenes?.[json.scene ?? 0]?.nodes;
  if (!roots) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const parents = new Set<number>();
  const visit = (id: number, parent: Mat4): boolean => {
    const node = json.nodes?.[id];
    if (!node || parents.has(id) || node.skin !== undefined || node.extensions?.EXT_mesh_gpu_instancing) return false;
    const matrix = node.matrix ?? composeMat4(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
    if (matrix.length !== 16 || !matrix.every(Number.isFinite)) return false;
    const world = multiplyMat4(parent, matrix);
    if (node.mesh !== undefined) {
      const primitives = json.meshes?.[node.mesh]?.primitives;
      if (!primitives) return false;
      for (const primitive of primitives) {
        const position = primitive.attributes?.POSITION;
        if (position === undefined || primitive.targets?.some((target) => target.POSITION !== undefined)) return false;
        const accessor = json.accessors?.[position];
        if (accessor?.normalized || !vec3(accessor?.min) || !vec3(accessor?.max)) return false;
        const { min: localMin, max: localMax } = accessor;
        if (localMin.some((value, axis) => value > localMax[axis]!)) return false;
        const box = transformZoneBox({ min: localMin, max: localMax }, world);
        for (const axis of [0, 1, 2] as const) {
          min[axis] = Math.min(min[axis], box.min[axis]);
          max[axis] = Math.max(max[axis], box.max[axis]);
        }
      }
    }
    parents.add(id);
    const valid = (node.children ?? []).every((child) => visit(child, world));
    parents.delete(id);
    return valid;
  };
  return roots.every((node) => visit(node, IDENTITY_MAT4)) && vec3(min) && vec3(max) ? { min, max } : null;
}

async function readBounds(path: string): Promise<ZoneBox | null> {
  try {
    if (/\.gltf$/i.test(path)) return gltfModelBounds(JSON.parse(await readFile(path, "utf8")) as BoundsDocument);
    if (!/\.glb$/i.test(path)) return null;
    const file = await open(path, "r");
    try {
      const header = Buffer.alloc(20);
      if ((await file.read(header, 0, header.length, 0)).bytesRead !== header.length) return null;
      const length = header.readUInt32LE(12);
      if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(16) !== 0x4e4f534a || length > 64 * 1024 * 1024) return null;
      const metadata = Buffer.alloc(20 + length);
      header.copy(metadata);
      if ((await file.read(metadata, 20, length, 20)).bytesRead !== length) return null;
      const parsed = parseGlb(metadata);
      return parsed ? gltfModelBounds(parsed.json as BoundsDocument) : null;
    } finally {
      await file.close();
    }
  } catch {
    // Missing metadata keeps the placement on the visible side until its actual model loads.
    return null;
  }
}

export function createModelBoundsIndex(resolvePath: (label: string) => string) {
  const cache = new Map<string, { stamp: string; bounds: Promise<ZoneBox | null> }>();
  return async (index: AssetIndex, stamps?: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, ZoneBox>> => {
    const bounds = new Map<string, ZoneBox>();
    const models = [...index.entries.values()].filter((entry) => entry.storage === "binary" && entry.type === "forge.model");
    for (let offset = 0; offset < models.length; offset += 16) {
      await Promise.all(models.slice(offset, offset + 16).map(async ({ id, root, path }) => {
        const label = `${root}/${path}`;
        const stamp = stamps?.get(label);
        const cached = cache.get(label);
        const pending = stamp !== undefined && cached?.stamp === stamp
          ? cached.bounds
          : Promise.resolve().then(() => readBounds(resolvePath(label))).catch(() => null);
        if (stamp !== undefined) cache.set(label, { stamp, bounds: pending });
        const model = await pending;
        if (model) bounds.set(id, model);
      }));
    }
    return bounds;
  };
}
