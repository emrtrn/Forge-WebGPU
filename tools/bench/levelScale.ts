// The 50.000-actor scale level (plan Faz 2a "Ölçek ölçümü", architecture
// §4.4 "ölçek yedeği"). Deterministic: the same seed gives the same bytes.
// Never committed; `npm run bench:level` writes it under `.forge-cache/bench`.
//
// The level is a real level folder (A11): `level.json`, `cells.json` with the
// true revisions, one file per occupied cell. Alongside it, the actor classes
// and the mesh assets (empty `.glb` + meta file) the actors point at, so the
// asset index sees a clean project.
//
// Mix, by actor count:
// - ~80 % plain static mesh actors, half with a collider (mesh under it);
// - ~15 % instances of a vehicle class with 1–2 overrides; a third of them
//   aim their driver at another actor (actor references across cells);
// - ~5 % child actors of a plain root;
// - a fog (singleton) and a few lights that are not spatially loaded.
//
// `legacy: true` writes every component and override at version 1, so loading
// runs the migration chain (scenario S5).

import {
  createSchemaRegistry,
  defineAssetType,
  defineComponent,
  enumOf,
  num,
  bool,
  color,
  vec3,
  assetRef,
  actorRef,
  normalizeActorClass,
  normalizeLevel,
  splitLevel,
  stringifyDocument,
  isJsonObject,
  type ActorClassDoc,
  type ActorId,
  type AssetId,
  type JsonObject,
  type LevelId,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";

export const BenchStaticMesh = defineComponent(
  "bench.staticMesh",
  2,
  {
    mesh: assetRef({ assetType: "bench.mesh" }),
    castShadow: bool({ default: true }),
    receiveShadow: bool({ default: true }),
    lodBias: num({ min: 0, max: 4, default: 1 }),
  },
  {
    spatial: true,
    migrations: {
      1: ({ shadows, ...rest }) => (shadows === undefined ? rest : { ...rest, castShadow: shadows, receiveShadow: shadows }),
    },
  },
);

export const BenchCollider = defineComponent(
  "bench.collider",
  2,
  {
    shape: enumOf(["box", "sphere", "capsule"], { default: "box" }),
    size: vec3({ default: [1, 1, 1], min: 0 }),
  },
  {
    spatial: true,
    migrations: { 1: ({ extent, ...rest }) => (extent === undefined ? rest : { ...rest, size: extent }) },
  },
);

export const BenchVehicleDriver = defineComponent(
  "bench.vehicleDriver",
  2,
  {
    targetSpeed: num({ min: 0, max: 80, default: 14 }),
    target: actorRef(),
    aggression: num({ min: 0, max: 1, default: 0.5 }),
  },
  { migrations: { 1: ({ speed, ...rest }) => (speed === undefined ? rest : { ...rest, targetSpeed: speed }) } },
);

export const BenchFog = defineComponent(
  "bench.fog",
  1,
  { density: num({ min: 0, max: 1, default: 0.02 }), color: color({ default: "#b8c4d6" }) },
  { singleton: true },
);

export const BenchPointLight = defineComponent(
  "bench.pointLight",
  1,
  {
    color: color({ default: "#ffffff" }),
    intensity: num({ min: 0, max: 1000, default: 10 }),
    range: num({ min: 0, max: 500, default: 20 }),
  },
  { spatial: true },
);

export const BenchMesh = defineAssetType("bench.mesh", 1, { extensions: ["glb"] });

export function createBenchRegistry(): SchemaRegistry {
  const registry = createSchemaRegistry();
  for (const def of [BenchStaticMesh, BenchCollider, BenchVehicleDriver, BenchFog, BenchPointLight]) {
    registry.registerComponent(def);
  }
  registry.registerAssetType(BenchMesh);
  return registry;
}

export interface ScaleOptions {
  readonly seed?: number;
  /** Actors in the level, persistent ones included. */
  readonly actors?: number;
  /** Edge of the square the actors stand in, centred on the origin (m). */
  readonly worldSize?: number;
  readonly cellSize?: number;
  readonly meshes?: number;
  readonly classes?: number;
  /** Write components and overrides at version 1 (migration scenario). */
  readonly legacy?: boolean;
}

export interface GeneratedFile {
  /** Relative to the content root. */
  readonly path: string;
  readonly text: string;
}

export interface ScaleProject {
  readonly files: GeneratedFile[];
  readonly levelId: LevelId;
  /** Content-root-relative folder of the level. */
  readonly levelFolder: string;
  readonly actorCount: number;
  readonly persistentActors: number;
  /** Occupied cells, in cell order. */
  readonly cells: string[];
}

export const SCALE_DEFAULTS = {
  seed: 1,
  actors: 50_000,
  worldSize: 4096,
  cellSize: 128,
  meshes: 200,
  classes: 20,
  legacy: false,
} as const;

/** mulberry32: small, fast, and the same on every machine. */
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

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor + 0;
};

export function generateScaleProject(options: ScaleOptions = {}): ScaleProject {
  const o = { ...SCALE_DEFAULTS, ...options };
  const random = prng(o.seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const hex = (): string => {
    let out = "";
    for (let i = 0; i < 4; i += 1) out += Math.floor(random() * 0x100000000).toString(16).padStart(8, "0");
    return out;
  };
  const actorIdOf = (): ActorId => `act_${hex()}`;
  const assetIdOf = (): AssetId => `ast_${hex()}`;
  const half = o.worldSize / 2;
  const position = (): [number, number, number] => [
    round(random() * o.worldSize - half, 2),
    round(random() * 20, 2),
    round(random() * o.worldSize - half, 2),
  ];
  const yaw = (): [number, number, number, number] => {
    const angle = random() * Math.PI;
    return [0, round(Math.sin(angle), 6), 0, round(Math.cos(angle), 6)];
  };
  const files: GeneratedFile[] = [];

  // Mesh assets.
  const meshes: AssetId[] = [];
  for (let i = 0; i < o.meshes; i += 1) {
    const id = assetIdOf();
    meshes.push(id);
    const path = `meshes/m${String(i).padStart(3, "0")}.glb`;
    files.push({ path, text: "" });
    files.push({
      path: `${path}.meta.json`,
      text: stringifyDocument({
        schema: "forge.assetMeta/1",
        id,
        type: "bench.mesh@1",
        license: "CC0-1.0",
        source: { origin: "bench" },
        import: {},
      }),
    });
  }

  // Vehicle classes.
  const registry = createBenchRegistry();
  const classes = new Map<string, ActorClassDoc>();
  const classIds: AssetId[] = [];
  for (let i = 0; i < o.classes; i += 1) {
    const raw = {
      schema: "forge.actorClass/1",
      id: assetIdOf(),
      name: `Vehicle ${i}`,
      components: {
        chassis: { type: "bench.collider@2", parent: null, local: { p: [0, 1, 0] }, size: [2, 1.5, 4.2] },
        body: { type: "bench.staticMesh@2", parent: "chassis", mesh: pick(meshes) },
        driver: { type: "bench.vehicleDriver@2", targetSpeed: round(10 + random() * 20, 1) },
      },
    };
    const result = normalizeActorClass(raw, { strict: true, registry });
    if (!result.ok || !result.value) throw new Error(`bench: class ${i} does not normalise cleanly`);
    classes.set(result.value.id, result.value);
    classIds.push(result.value.id);
  }
  const resolveClass = (id: AssetId) => classes.get(id);

  // Actors.
  const actors: JsonObject[] = [];
  const roots: ActorId[] = [];
  const add = (actor: JsonObject): void => {
    actors.push(actor);
  };
  const levelId: LevelId = `lvl_${hex()}`;
  add({ id: actorIdOf(), name: "Fog", components: { fog: { type: "bench.fog@1", density: 0.01 } } });
  const parked = Math.max(1, Math.round(o.actors * 0.0004));
  for (let i = 0; i < parked; i += 1) {
    add({
      id: actorIdOf(),
      name: `Landmark Light ${i}`,
      spatiallyLoaded: false,
      transform: { p: position() },
      components: { light: { type: "bench.pointLight@1", parent: null, intensity: 200, range: 300 } },
    });
  }
  while (actors.length < o.actors) {
    const roll = random();
    const id = actorIdOf();
    if (roll < 0.05 && roots.length > 0) {
      add({
        id,
        name: "Prop",
        parent: pick(roots),
        transform: { p: [round(random() * 4 - 2, 2), 0, round(random() * 4 - 2, 2)] },
        components: { mesh: { type: "bench.staticMesh@2", parent: null, mesh: pick(meshes), castShadow: false } },
      });
    } else if (roll < 0.2) {
      const overrides: JsonObject = { driver: { targetSpeed: round(5 + random() * 40, 1) } };
      if (random() < 0.5) overrides.body = { mesh: pick(meshes) };
      if (random() < 0.33 && actors.length > 0) {
        (overrides.driver as JsonObject).target = pick(actors).id as string;
      }
      add({ id, name: "Vehicle", class: pick(classIds), transform: { p: position(), r: yaw() }, overrides });
    } else {
      const scale = round(0.8 + random() * 0.4, 3);
      const mesh = { type: "bench.staticMesh@2", parent: null, mesh: pick(meshes), lodBias: round(random() * 2, 2) };
      const components: JsonObject =
        random() < 0.5
          ? { mesh }
          : {
              hull: { type: "bench.collider@2", parent: null, size: [round(1 + random() * 3, 2), 2, round(1 + random() * 3, 2)] },
              mesh: { ...mesh, parent: "hull" },
            };
      add({ id, name: "Static Mesh", transform: { p: position(), r: yaw(), s: [scale, scale, scale] }, components });
      roots.push(id);
    }
  }

  const raw = { schema: "forge.level/1", id: levelId, settings: { cellSize: o.cellSize }, actors };
  const level = normalizeLevel(raw, { strict: true, registry, resolveClass });
  if (!level.ok || !level.value) {
    throw new Error(`bench: the level does not normalise cleanly: ${level.issues[0]?.message ?? "no value"}`);
  }
  const split = splitLevel(level.value, { strict: true, registry, resolveClass });
  if (split.issues.length > 0) throw new Error(`bench: assignment reported ${split.issues[0]!.message}`);

  const write = (path: string, document: unknown): string => {
    const text = stringifyDocument(o.legacy ? toLegacy(document) : document);
    files.push({ path, text });
    return fileRevision(text);
  };
  for (const cls of classes.values()) write(`classes/${cls.id}.json`, cls);
  const levelFolder = "levels/scale";
  const persistentRevision = write(`${levelFolder}/level.json`, split.persistent);
  const cellRevisions: Record<string, string> = {};
  for (const cell of split.cells) {
    cellRevisions[cell.cell] = write(`${levelFolder}/cells/${cell.cell}.json`, cell);
  }
  write(`${levelFolder}/cells.json`, {
    schema: "forge.levelCells/1",
    level: levelId,
    persistent: persistentRevision,
    cells: cellRevisions,
  });

  return {
    files,
    levelId,
    levelFolder,
    actorCount: level.value.actors.length,
    persistentActors: split.persistent.actors.length,
    cells: split.cells.map((cell) => cell.cell),
  };
}

/** Version 1 of the bench components: field names before their migrations. */
const LEGACY_RENAMES: Record<string, Record<string, string>> = {
  "bench.staticMesh": {},
  "bench.collider": { size: "extent" },
  "bench.vehicleDriver": { targetSpeed: "speed" },
};

/**
 * Rewrites a canonical document as version 1 wrote it: components and override
 * stamps at @1, renamed fields back to their old names, `castShadow` +
 * `receiveShadow` folded into `shadows` when they agree.
 */
export function toLegacy(document: unknown): unknown {
  if (Array.isArray(document)) return document.map(toLegacy);
  if (!isJsonObject(document)) return document;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(document)) out[key] = toLegacy(value);
  const tag = typeof out.type === "string" ? /^(bench\.[A-Za-z]+)@2$/.exec(out.type) : null;
  if (!tag) return out;
  const name = tag[1]!;
  const renames = LEGACY_RENAMES[name] ?? {};
  const legacy: JsonObject = {};
  for (const [key, value] of Object.entries(out)) {
    legacy[key === "type" ? key : (renames[key] ?? key)] = key === "type" ? `${name}@1` : value;
  }
  if (name === "bench.staticMesh" && legacy.castShadow !== undefined && legacy.castShadow === legacy.receiveShadow) {
    legacy.shadows = legacy.castShadow;
    delete legacy.castShadow;
    delete legacy.receiveShadow;
  }
  return legacy;
}
