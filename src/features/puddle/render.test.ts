import { describe, expect, test } from "vitest";
import { Group, PerspectiveCamera, Scene, type Mesh } from "three/webgpu";
import { createServices, type ActorId, type ComponentEntry, type WorldActor } from "../../core/index.ts";
import { resolveQualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { NEW_PUDDLE_APPEARANCE, PUDDLE_WHEEL_RIPPLE_DEFAULTS, PUDDLE_WIND_DEFAULTS } from "../../engine/terrain/puddleWater.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import { createFlatTerrainTile, tileKey, type TerrainTileData, type WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import type { TerrainData, TerrainTileReader } from "../../render/resources/terrains.ts";
import type { WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import binding from "./render.ts";
import { Puddle, PuddleStatusKey, type PuddleData } from "./schema.ts";

const TERRAIN = "ast_00000000000000000000000000000001";

/** A 2 x 2 tile bowl (32 quads, 1 m) centred on the origin, datum 4: height 4 + 0.01 r². */
function bowl(streams: boolean) {
  const q = 32;
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Bowl", tileQuads: q, spacing: 1, tilesX: 2, tilesZ: 2,
    origin: [-32, 4, -32], heightMin: -50, heightMax: 50, collision: true, layers: [], tiles: [],
  };
  const tiles = new Map<string, TerrainTileData>();
  for (let tz = 0; tz < 2; tz += 1) {
    for (let tx = 0; tx < 2; tx += 1) {
      const tile = createFlatTerrainTile(def, tx, tz);
      for (let z = 0; z <= q; z += 1) {
        for (let x = 0; x <= q; x += 1) {
          const wx = -32 + tx * q + x;
          const wz = -32 + tz * q + z;
          tile.heights[z * (q + 1) + x] = 0.01 * (wx * wx + wz * wz);
        }
      }
      tiles.set(tileKey(tx, tz), tile);
      def.tiles.push({ key: tileKey(tx, tz), minHeight: 0, maxHeight: 50 });
    }
  }
  const reads: string[] = [];
  const terrain: TerrainData = {
    def,
    global: buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)),
    tiles: streams ? null : tiles,
    layers: [],
    openTiles(): TerrainTileReader {
      return { read: async (key) => (reads.push(key), tiles.get(key)!), dispose: () => {} };
    },
  };
  return { terrain, reads };
}

function harness(options: { streams?: boolean; puddle?: Partial<PuddleData>; at?: [number, number, number]; terrain?: boolean } = {}) {
  const { terrain, reads } = bowl(options.streams ?? false);
  const terrainActor = {
    id: "act_00000000000000000000000000000001" as ActorId, name: "Bowl",
    transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { terrain: { type: "forge.terrain@2", data: TERRAIN, material: null } },
  } as unknown as WorldActor;
  const make = (p: [number, number, number], fields: Partial<PuddleData> = {}) =>
    ({
      id: "act_00000000000000000000000000000002" as ActorId, name: "Puddle",
      transform: { p, r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { puddle: { type: "forge.puddle@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, ...defaults(), ...options.puddle, ...fields } },
    }) as unknown as WorldActor;
  const actors = new Map<string, WorldActor>([[terrainActor.id, terrainActor]]);
  const holds = { open: 0, released: [] as string[], loads: 0 };
  const resources = {
    terrain: async () => (holds.loads += 1, terrain),
    release: (key: string) => holds.released.push(key),
    busy: () => {
      holds.open += 1;
      let open = true;
      return () => {
        if (open) holds.open -= 1;
        open = false;
      };
    },
    track: <T,>(work: Promise<T>) => work,
  } as unknown as WorldResources;
  const services = createServices();
  const root = new Group();
  const quality = { ...resolveQualitySettings("high") };
  const ctx = {
    world: {
      services,
      actor: (id: ActorId) => actors.get(id),
      componentsOf: (type: string): ComponentEntry[] =>
        type === "forge.terrain" && options.terrain !== false ? [{ actor: terrainActor, key: "terrain", component: terrainActor.components.terrain! }] : [],
    },
    scene: new Scene(),
    root,
    resources,
    quality: () => quality,
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  const camera = new PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 12, 14);
  camera.lookAt(0, 4, 0);
  camera.updateMatrixWorld();
  const frame = () => instance.sync?.({ dt: 1 / 60, camera });
  /** Frames until every fill settled (or 200 frames). */
  const settle = async () => {
    for (let i = 0; i < 200; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      frame();
      if (holds.open === 0) return;
    }
  };
  let puddle = make(options.at ?? [0, 4.3, 0]);
  actors.set(puddle.id, puddle);
  instance.actorsAdded?.([puddle]);
  const meshes = () => root.children.filter((child) => (child as Mesh).isMesh && child.name === "Puddle/puddle") as Mesh[];
  const status = () => services.get(PuddleStatusKey)!.result(puddle.id, "puddle");
  const move = (p: [number, number, number], fields: Partial<PuddleData> = {}) => {
    const previous = puddle;
    puddle = make(p, { ...(previous.components.puddle as unknown as PuddleData), ...fields });
    actors.set(puddle.id, puddle);
    instance.actorsChanged?.([{ actor: puddle, previous, transformOnly: Object.keys(fields).length === 0 }]);
  };
  return { instance, holds, reads, meshes, status, settle, move, quality, frame, remove: () => instance.actorsRemoved?.([puddle]) };
}

function defaults(): PuddleData {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(Puddle.fields)) out[key] = (field as { default: unknown }).default;
  return out as unknown as PuddleData;
}

describe("puddle binding", () => {
  test("the schema keeps Forge's defaults and ranges (a new puddle: planar)", () => {
    const d = defaults();
    for (const key of ["color", "opacity", "roughness", "reflectionStrength", "reflectionQuality", "planarReflectionStrength", "mudDensity", "mudColor"] as const) {
      expect(d[key], key).toBe(NEW_PUDDLE_APPEARANCE[key]);
    }
    expect(d.reflectionMode).toBe("planar");
    for (const [key, value] of Object.entries({ ...PUDDLE_WIND_DEFAULTS, ...PUDDLE_WHEEL_RIPPLE_DEFAULTS })) expect(d[key as keyof PuddleData], key).toBe(value);
  });

  test("fills the bowl under its seed to its level, holds readiness until then and publishes the outcome", async () => {
    const { holds, meshes, status, settle } = harness();
    expect(holds.open).toBe(1);
    expect(status()?.status).toBe("loading");
    await settle();
    expect(holds.open).toBe(0);
    const result = status()!;
    expect(result.status).toBe("ready");
    // 0.3 m over the bottom: a disc of radius sqrt(30).
    expect(Math.abs(result.area - Math.PI * 30)).toBeLessThan(3);
    const [mesh] = meshes();
    expect(mesh!.visible).toBe(true);
    const positions = mesh!.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i += 1) expect(positions.getY(i)).toBeCloseTo(4.3, 5);
    expect(mesh!.geometry.getAttribute("puddleDepth").count).toBe(positions.count);
  });

  test("a streamed terrain lends its tiles through its reader: only the area's", async () => {
    const { reads, status, settle } = harness({ streams: true, puddle: { size: 6 }, at: [0, 4.05, 0] });
    await settle();
    expect(status()!.status).toBe("ready");
    expect(reads.sort()).toEqual(["0_0", "0_1", "1_0", "1_1"]);
  });

  test("moving it fills again; a failed fill keeps the previous surface, a dry seed clears it", async () => {
    const { meshes, status, settle, move } = harness();
    await settle();
    const first = meshes()[0]!.geometry;
    // Raised past the working area: open boundary, the old surface stays.
    move([0, 4.5, 0]);
    expect(status()!.status).toBe("loading");
    await settle();
    expect(status()!.status).toBe("open-boundary");
    expect(meshes()[0]!.geometry).toBe(first);
    expect(meshes()[0]!.visible).toBe(true);
    // A larger working area holds it.
    move([0, 4.5, 0], { size: 20 });
    await settle();
    expect(status()!.status).toBe("ready");
    expect(status()!.area).toBeGreaterThan(Math.PI * 45);
    // Below the bottom: dry, nothing drawn.
    move([0, 3.9, 0]);
    await settle();
    expect(status()!.status).toBe("dry");
    expect(meshes()[0]!.visible).toBe(false);
  });

  test("no terrain under the seed, or none at all, is reported; removal gives the terrain back", async () => {
    const off = harness({ at: [60, 4.3, 0] });
    await off.settle();
    expect(off.status()!.status).toBe("no-terrain");
    const none = harness({ terrain: false });
    await none.settle();
    expect(none.status()!.status).toBe("no-terrain");
    const held = harness();
    await held.settle();
    held.remove();
    expect(held.meshes()).toEqual([]);
    expect(held.holds.released).toContain(`terrain:${TERRAIN}`);
  });
});
