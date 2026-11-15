// Puddle: render binding (plan phase 5a step 6; Forge WebGL's
// PuddleWaterController, src/scene/puddleWaterController.ts @ forge-webgl-final).
//
// - Placement (user decisions 2026-11-15): the component's world position is
//   the seed (X / Z) and the water level (Y); the bed is the terrain whose tile
//   grid holds the seed (the first, in actor order); the working area is
//   Forge's square around the seed on that terrain's grid, its size clamped to
//   the terrain's limit (2..128 cells, 128 m).
// - The tiles under the area (at most 16, Forge's budget) are read through the
//   terrain's reader (a terrain loaded at once lends its own); the fill is
//   Forge's terrainPuddleSteps over the terrain's own surface, run in slices of
//   2 ms a frame. Editor and game fill alike; a move or an edit starts again.
// - A failed fill (open boundary, missing terrain, error) keeps the previous
//   surface, as Forge did; a dry seed clears it.
// - The water is materials/puddle.ts; its planar reflection is chosen by
//   sync/puddleReflections.ts under the quality profile's terrain water tier.
// - The outcome of each fill is published as `PuddleStatusKey` (the editor's
//   Details shows it). Readiness waits for every puddle's first outcome.
//
// Wind uses the common WES/level resolver and simulation time (step 7).
// Wheel ripples arrive with vehicles (phase 6 / 8), the deformed bed with 8.

import * as THREE from "three/webgpu";
import { parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { tagSceneSource } from "../../engine/perf/sceneCost.ts";
import { puddleBedHeight, puddleBedTileKeys, puddleMaxSize, puddleRegionAroundSeed, terrainContainsSeed } from "../../engine/terrain/puddleBed.ts";
import { terrainPuddleSteps, type TerrainPuddleGeometry } from "../../engine/terrain/terrainPuddle.ts";
import type { TerrainTileData } from "../../engine/terrain/terrainTypes.ts";
import { createPuddleMaterial, type PuddleAppearance, type PuddleMaterial } from "../../render/materials/puddle.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { TerrainData } from "../../render/resources/terrains.ts";
import { PuddleReflections, type PuddleReflectionCeiling } from "../../render/sync/puddleReflections.ts";
import { defineRenderBinding, type RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { tagActorObject } from "../../render/sync/pickTags.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { createPuddleWindNormal } from "../../render/sync/puddleWindNormal.ts";
import { resolveWorldWind } from "../../engine/environment/worldWind.ts";
import { Puddle, PuddleStatusKey, type PuddleData, type PuddleResult } from "./schema.ts";

/** Fill work per frame, as Forge's cooperative jobs. */
const SLICE_MS = 2;

const MESSAGES = {
  loading: "Su hazırlanıyor…",
  dry: "Tohum noktası kuru; su seviyesini yükseltin veya başka bir çukur seçin.",
  "open-boundary": "Su çalışma alanının sınırına ulaştı. Alanı genişletin veya seviyeyi düşürün; önceki geçerli yüzey korundu.",
  "missing-terrain": "Bağlı su alanında terrain eksik. Önceki geçerli yüzey korundu; boşluklar suyla doldurulmadı.",
  "no-terrain": "Tohum noktasının altında terrain yok.",
} as const;

interface Placed {
  readonly windNormal: ReturnType<typeof createPuddleWindNormal>;
  readonly id: string;
  actor: WorldActor;
  readonly key: string;
  data: PuddleData;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalNodeMaterial>;
  readonly material: PuddleMaterial;
  result: PuddleResult;
  /** Bumped by every change: a stale fill drops its outcome. */
  revision: number;
  job: { revision: number; level: number; steps: Generator<void, TerrainPuddleGeometry> } | null;
  /** The terrain resource it holds, released on the next fill or removal. */
  terrainKey: string | null;
  busy: (() => void) | null;
  removed: boolean;
}

function appearanceOf(data: PuddleData): PuddleAppearance {
  return {
    color: data.color, opacity: data.opacity, roughness: data.roughness, reflectionStrength: data.reflectionStrength,
    planarReflectionStrength: data.planarReflectionStrength, mudDensity: data.mudDensity, mudColor: data.mudColor,
  };
}

/** The seed and level: the component's world position. */
function placement(ctx: RenderBindingContext, actor: WorldActor, key: string): { seed: [number, number]; level: number } {
  const position = new THREE.Vector3().setFromMatrixPosition(componentWorldMatrix(ctx.world, actor, key));
  return { seed: [position.x, position.z], level: position.y };
}

function ceilingOf(tier: "low" | "medium" | "high"): PuddleReflectionCeiling {
  return tier === "low" ? "off" : tier;
}

export default defineRenderBinding({
  feature: "forge.puddle",
  create(ctx) {
    let simulationSeconds = 0;
    const placed = new Map<string, Placed>();
    const reflections = new PuddleReflections(ctx.root);
    ctx.world.services.provide(PuddleStatusKey, {
      result: (actor: ActorId, key: string) => placed.get(`${actor}/${key}`)?.result,
    });
    const puddlesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === Puddle.name);

    const settle = (entry: Placed, result: PuddleResult): void => {
      entry.result = result;
      entry.busy?.();
      entry.busy = null;
    };

    /** The first terrain whose grid holds the seed; the others it loaded are given back. */
    const findTerrain = async (seed: readonly [number, number]): Promise<{ terrain: TerrainData; key: string } | null> => {
      for (const { component } of ctx.world.componentsOf("forge.terrain")) {
        const guid = (component as { data?: string | null }).data;
        if (!guid) continue;
        let terrain: TerrainData;
        try {
          terrain = await ctx.resources.terrain(guid);
        } catch {
          continue;
        }
        if (terrainContainsSeed(terrain.def, seed)) return { terrain, key: resourceKey.terrain(guid) };
        ctx.resources.release(resourceKey.terrain(guid));
      }
      return null;
    };

    const readTiles = async (terrain: TerrainData, keys: readonly string[]): Promise<Map<string, TerrainTileData>> => {
      const tiles = new Map<string, TerrainTileData>();
      if (terrain.tiles) {
        for (const key of keys) {
          const tile = terrain.tiles.get(key);
          if (tile) tiles.set(key, tile);
        }
        return tiles;
      }
      const reader = terrain.openTiles();
      const abort = new AbortController();
      try {
        await Promise.all(keys.map(async (key) => tiles.set(key, await ctx.resources.track(reader.read(key, abort.signal)))));
      } finally {
        abort.abort();
        reader.dispose();
      }
      return tiles;
    };

    /** Starts a fill for the entry as it is now. */
    const fill = (entry: Placed): void => {
      entry.revision += 1;
      const revision = entry.revision;
      entry.job = null;
      entry.busy ??= ctx.resources.busy();
      entry.result = { status: "loading", area: entry.result.area, message: MESSAGES.loading };
      const { seed, level } = placement(ctx, entry.actor, entry.key);
      const previousTerrain = entry.terrainKey;
      entry.terrainKey = null;
      void (async () => {
        const found = await findTerrain(seed);
        if (entry.removed || revision !== entry.revision) {
          if (found) ctx.resources.release(found.key);
          return;
        }
        if (previousTerrain) ctx.resources.release(previousTerrain);
        if (!found) {
          settle(entry, { status: "no-terrain", area: 0, message: MESSAGES["no-terrain"] });
          return;
        }
        entry.terrainKey = found.key;
        const { def } = found.terrain;
        const size = Math.min(Math.max(entry.data.size, 2 * def.spacing), puddleMaxSize(def));
        const region = puddleRegionAroundSeed(def, seed, size, level);
        const tiles = await readTiles(found.terrain, puddleBedTileKeys(def, region));
        if (entry.removed || revision !== entry.revision) return;
        entry.job = { revision, level, steps: terrainPuddleSteps(region, puddleBedHeight(def, tiles)) };
      })().catch((error: unknown) => {
        if (entry.removed || revision !== entry.revision) return;
        settle(entry, { status: "error", area: 0, message: error instanceof Error ? error.message : String(error) });
      });
    };

    /** Takes a finished fill: a new surface, a cleared one, or the old one kept. */
    const publish = (entry: Placed, level: number, data: TerrainPuddleGeometry): void => {
      if (data.status === "ready" || data.status === "dry") {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
        geometry.setAttribute("puddleDepth", new THREE.Float32BufferAttribute(data.depths, 1));
        if (data.positions.length) {
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          geometry.computeBoundingBox();
        }
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = geometry;
        entry.mesh.visible = data.positions.length > 0;
      }
      const message = data.status === "ready" ? `${data.area.toFixed(2)} m² · Hazır.` : MESSAGES[data.status];
      reflections.set(entry.mesh, entry.material, {
        level, mode: entry.data.reflectionMode, quality: entry.data.reflectionQuality, planarStrength: entry.data.planarReflectionStrength,
      });
      settle(entry, { status: data.status, area: data.area, message });
    };

    const add = (actor: WorldActor, key: string, data: PuddleData): void => {
      const material = createPuddleMaterial(appearanceOf(data));
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material.material);
      mesh.name = `${actor.name}/${key}`;
      mesh.visible = false;
      mesh.renderOrder = 1;
      mesh.userData.framing = false;
      tagSceneSource(mesh, "water");
      tagActorObject(mesh, actor.id);
      ctx.root.add(mesh);
      const entry: Placed = {
        windNormal: createPuddleWindNormal(ctx.resources, (texture) => material.setWindNormal(texture)),
        id: `${actor.id}/${key}`, actor, key, data, mesh, material,
        result: { status: "loading", area: 0, message: MESSAGES.loading },
        revision: 0, job: null, terrainKey: null, busy: null, removed: false,
      };
      placed.set(entry.id, entry);
      entry.windNormal.update(data.windNormal);
      fill(entry);
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.job = null;
      reflections.remove(entry.mesh);
      entry.mesh.removeFromParent();
      entry.mesh.geometry.dispose();
      entry.windNormal.dispose();
      entry.material.dispose();
      if (entry.terrainKey) ctx.resources.release(entry.terrainKey);
      entry.busy?.();
      entry.busy = null;
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) for (const [key, component] of puddlesOf(actor)) add(actor, key, component as unknown as PuddleData);
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of puddlesOf(actor)) remove(`${actor.id}/${key}`);
      },
      actorsChanged(changes) {
        for (const { actor, previous } of changes) {
          const keys = new Set(puddlesOf(actor).map(([key]) => key));
          for (const [key] of puddlesOf(previous)) if (!keys.has(key)) remove(`${actor.id}/${key}`);
          for (const [key, component] of puddlesOf(actor)) {
            const entry = placed.get(`${actor.id}/${key}`);
            const data = component as unknown as PuddleData;
            if (!entry) {
              add(actor, key, data);
              continue;
            }
            const before = placement(ctx, entry.actor, key);
            entry.actor = actor;
            const after = placement(ctx, actor, key);
            const moved = before.seed[0] !== after.seed[0] || before.seed[1] !== after.seed[1] || before.level !== after.level;
            const resized = data.size !== entry.data.size;
            entry.data = data;
            entry.material.setAppearance(appearanceOf(data));
            entry.windNormal.update(data.windNormal);
            if (moved || resized) {
              fill(entry);
            } else if (entry.result.status === "ready") {
              reflections.set(entry.mesh, entry.material, {
                level: after.level, mode: data.reflectionMode, quality: data.reflectionQuality, planarStrength: data.planarReflectionStrength,
              });
            }
          }
        }
      },
      sync(frame) {
        if (Number.isFinite(frame.dt) && frame.dt > 0) simulationSeconds += frame.dt;
        const wind = resolveWorldWind(ctx.world);
        for (const entry of placed.values()) {
          const { seed } = placement(ctx, entry.actor, entry.key);
          entry.material.updateWind(wind, simulationSeconds, entry.data, seed[0], seed[1]);
        }
        // Fills in slices: SLICE_MS a frame over every pending puddle.
        const started = performance.now();
        for (const entry of placed.values()) {
          const job = entry.job;
          if (!job) continue;
          try {
            let step = job.steps.next();
            while (!step.done && performance.now() - started < SLICE_MS) step = job.steps.next();
            if (step.done) {
              entry.job = null;
              if (job.revision === entry.revision) publish(entry, job.level, step.value);
            }
          } catch (error) {
            entry.job = null;
            settle(entry, { status: "error", area: entry.result.area, message: error instanceof Error ? error.message : String(error) });
          }
          if (performance.now() - started >= SLICE_MS) break;
        }
        reflections.setCeiling(ceilingOf(ctx.quality().terrainWaterQuality));
        if (frame.camera) reflections.update(frame.camera);
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
        reflections.dispose();
      },
    };
  },
});
