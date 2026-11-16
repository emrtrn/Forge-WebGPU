// Deterministic streaming fixture. Files are relative to the level folder;
// the project manifest and assets are never changed.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  componentTypeTag, createSchemaRegistry, normalizeLevel, splitLevel, stringifyDocument,
  type ActorId, type AssetId, type JsonObject, type LevelDoc, type LevelId,
} from "../../src/core/index.ts";
import { StaticMesh } from "../../src/features/static-mesh/schema.ts";
import { Shape, SHAPE_BASE_SIZE } from "../../src/features/shape/schema.ts";
import { fileRevision } from "../assets/revision.ts";
import type { GeneratedFile } from "./levelScale.ts";

export const STREAMING_LEVEL_DEFAULTS = {
  seed: 1, size: 4096, actors: 50_000, cellSize: 128, loadRange: 384, viewDistance: 2000,
} as const;

export interface StreamingLevelOptions {
  readonly seed?: number;
  readonly size?: number;
  /** Total count, including children and the persistent ground. */
  readonly actors?: number;
  readonly cellSize?: number;
  readonly loadRange?: number;
  readonly viewDistance?: number;
  readonly models: readonly AssetId[];
  readonly levelId?: LevelId;
}

export interface StreamingLevel {
  readonly level: LevelDoc;
  readonly levelId: LevelId;
  readonly actorCount: number;
  readonly files: readonly GeneratedFile[];
  readonly cells: readonly string[];
  readonly cellCounts: { readonly min: number; readonly median: number; readonly max: number };
}

/** mulberry32, matching the scale benchmark's PRNG. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStreamingLevel(options: StreamingLevelOptions): StreamingLevel {
  const o = { ...STREAMING_LEVEL_DEFAULTS, ...options };
  if (!Number.isInteger(o.seed) || o.seed < 0 || o.seed > 0xffffffff) throw new Error("seed must be a uint32.");
  if (!Number.isSafeInteger(o.actors) || o.actors < 1) throw new Error("actors must be a positive integer.");
  for (const key of ["size", "cellSize", "loadRange", "viewDistance"] as const) {
    if (!Number.isFinite(o[key]) || o[key] <= 0) throw new Error(`${key} must be positive and finite.`);
  }
  if (!o.models.length) throw new Error("At least one model GUID is required.");
  const random = prng(o.seed);
  const between = (min: number, max: number): number => min + random() * (max - min);
  const hexId = (n: number): string => `${o.seed.toString(16).padStart(8, "0")}${n.toString(16).padStart(24, "0")}`;
  const levelId: LevelId = o.levelId ?? `lvl_${hexId(0)}`;
  const actors: JsonObject[] = [];
  const half = o.size / 2;
  const uniform = (): number => between(-half, half);
  // A small fixed number of settlements preserves density contrast at 50k.
  const clusters = Array.from({ length: 32 }, () => ({ x: uniform(), z: uniform(), radius: between(20, 80) }));
  const clamp = (value: number): number => Math.max(-half, Math.min(half - o.size * 1e-10, value));
  const blob = (): number => (random() + random() + random() + random() - 2) / 2;
  const position = (clustered: boolean): number[] => {
    if (!clustered) return [uniform(), 0, uniform()];
    const cluster = clusters[Math.floor(random() * clusters.length)]!;
    return [clamp(cluster.x + blob() * cluster.radius), 0, clamp(cluster.z + blob() * cluster.radius)];
  };
  const add = (name: string, data: JsonObject): ActorId => {
    const id: ActorId = `act_${hexId(actors.length + 1)}`;
    actors.push({ id, name: `${name}_${String(actors.length).padStart(6, "0")}`, ...data });
    return id;
  };
  let meshIndex = 0;
  const mesh = (p: number[], parent?: ActorId): ActorId => {
    const scale = between(.7, 1.5);
    const angle = between(0, Math.PI);
    return add("Mesh", {
      ...(parent === undefined ? {} : { parent }),
      transform: { p, r: [0, Math.sin(angle), 0, Math.cos(angle)], s: [scale, scale, scale] },
      components: { mesh: { type: componentTypeTag(StaticMesh), parent: null, mesh: o.models[meshIndex++ % o.models.length]! } },
    });
  };
  const groundScale = o.size / SHAPE_BASE_SIZE;
  add("Ground", {
    spatiallyLoaded: false, transform: { s: [groundScale, 1, groundScale] },
    components: { shape: { type: componentTypeTag(Shape), parent: null, primitive: "plane", color: "#64745a", castShadow: false } },
  });
  const childCount = Math.min(o.actors - 1, Math.round(o.actors * .05));
  const cubeCount = Math.min(o.actors - 1 - childCount, Math.round(o.actors * .1));
  const rootCount = o.actors - 1 - childCount - cubeCount;
  const roots: ActorId[] = [];
  for (let i = 0; i < rootCount; i += 1) roots.push(mesh(position(i < Math.round(rootCount * .6))));
  const palette = ["#9b8066", "#888f98", "#b4aa8e", "#75836b", "#a16e60"];
  for (let i = 0; i < cubeCount; i += 1) {
    const heightScale = between(3, 20);
    const p = position(false);
    p[1] = heightScale * SHAPE_BASE_SIZE / 2;
    add("Block", {
      transform: { p, s: [between(4, 16), heightScale, between(4, 16)] },
      components: { shape: { type: componentTypeTag(Shape), parent: null, primitive: "cube", color: palette[i % palette.length]! } },
    });
  }
  // Consecutive groups of 1-3 children, each attached to a distinct mesh root.
  for (let i = 0, root = 0; i < childCount; root += 1) {
    const count = Math.min(childCount - i, 1 + Math.floor(random() * 3));
    for (let j = 0; j < count; j += 1, i += 1) {
      mesh([between(-2, 2), between(0, 2), between(-2, 2)], roots[root % roots.length]);
    }
  }
  const settings: JsonObject = { cellSize: o.cellSize, loadRange: o.loadRange, viewDistance: o.viewDistance };
  const registry = createSchemaRegistry();
  registry.registerComponent(StaticMesh);
  registry.registerComponent(Shape);
  const context = { strict: true, registry, resolveClass: () => undefined };
  const normalized = normalizeLevel({ schema: "forge.level/1", id: levelId, settings, actors }, context);
  if (!normalized.value || normalized.issues.length) throw new Error(`Streaming level: ${JSON.stringify(normalized.issues)}`);
  const split = splitLevel(normalized.value, context);
  if (split.issues.length) throw new Error(`Streaming cells: ${JSON.stringify(split.issues)}`);
  const files: GeneratedFile[] = [];
  const write = (path: string, document: unknown): string => {
    const text = stringifyDocument(document);
    files.push({ path, text });
    return fileRevision(text);
  };
  const persistent = write("level.json", split.persistent);
  const cells: Record<string, string> = {};
  for (const cell of split.cells) cells[cell.cell] = write(`cells/${cell.cell}.json`, cell);
  write("cells.json", { schema: "forge.levelCells/1", level: levelId, persistent, cells });
  const counts = split.cells.map((cell) => cell.actors.length).sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  const median = counts.length === 0 ? 0 : counts.length % 2 ? counts[middle]! : (counts[middle - 1]! + counts[middle]!) / 2;
  return {
    level: normalized.value, levelId, files, actorCount: actors.length,
    cells: split.cells.map((cell) => cell.cell),
    cellCounts: { min: counts[0] ?? 0, median, max: counts.at(-1) ?? 0 },
  };
}

/** Refuse existing folders by default. Clear old cells before forced replacement. */
export async function writeStreamingLevel(
  projectRoot: string, outFolder: string, level: StreamingLevel, options: { readonly force?: boolean } = {},
): Promise<string> {
  const root = resolve(projectRoot);
  const folder = resolve(root, outFolder);
  const rel = relative(root, folder);
  if (isAbsolute(outFolder) || !rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("--out must be a folder inside the project.");
  }
  await mkdir(dirname(folder), { recursive: true });
  try {
    await mkdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!options.force) throw new Error(`Level folder already exists: ${folder}; use --force to replace it.`);
    // folder is verified above to remain strictly inside the project root.
    await rm(resolve(folder, "cells"), { recursive: true, force: true });
  }
  for (const file of level.files) {
    const target = resolve(folder, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.text);
  }
  return folder;
}
