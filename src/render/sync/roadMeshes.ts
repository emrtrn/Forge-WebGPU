// A terrain's spline meshes (plan 5d step 5, INV-G21; 5d decision 5 and the
// user decision of 2026-11-25): made from the terrain's definition when it is
// drawn, in the editor and the game alike, never stored, so they are never
// stale. The geometry is bent on the CPU (engine/terrain/roadMesh.ts, Forge
// WebGL's deformSplineMeshGeometry without three) and drawn as static batches.
//
// - A bent chain becomes chunks per model part and grid cell
//   (`ROAD_CHUNK_CELL` metres, around the terrain's centre so a far terrain
//   keeps its precision), each an `InstanceBatch` with one placement. The
//   rigid mode (`mesh.deform` off) is one batch per model, one placement per
//   resolved piece, as a static mesh is drawn (detail culling included).
// - Parts and materials are the model's own: the template's slot parts, its
//   default slot materials, textures shared with every other use.
// - The terrain's actor is in the persistent layer, so its roads are always
//   loaded and need no HLOD proxy (hlodInput.ts's rule for persistent actors).
// - A change (splines edited, the ground under an aligned road sculpted)
//   builds a new set; the drawn one stays until the new one is ready.
// - Not picked: a click goes through a road to its terrain (Forge).
// - The collider comes with the terrain's in phase 6, from the same generator.

import { BufferAttribute, BufferGeometry, Group, Matrix4, Quaternion, Sphere, Box3, Vector3, type Camera, type Material } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import { landscapeSplineMeshAssetIds } from "../../engine/terrain/landscape.ts";
import { buildRoadMeshes, type RoadMeshAttribute, type RoadMeshModel, type RoadMeshPart } from "../../engine/terrain/roadMesh.ts";
import { prepareTerrainSplineMeshSource, terrainSplineMeshTileKeys } from "../../engine/terrain/terrainSplineMeshes.ts";
import type { TerrainTileData, WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import { worldTerrainActorPosition } from "../../engine/terrain/worldTerrainActor.ts";
import { modelParts } from "../resources/modelParts.ts";
import { slotMaterialIds } from "../resources/modelSlots.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { ModelTemplate } from "../resources/worldResources.ts";
import { createInstanceBatch, type InstanceBatch, type InstancePart } from "./instanceBatches.ts";
import type { RenderBindingContext } from "./renderBinding.ts";

/** Side of a road chunk's cell, metres. */
export const ROAD_CHUNK_CELL = 128;
/** A sculpted ground settles this long before aligned roads follow it, milliseconds. */
const GROUND_DELAY = 400;

export interface RoadMeshInput {
  readonly def: WorldTerrainDef;
  readonly tiles: ReadonlyMap<string, TerrainTileData>;
  /** A tile that is not resident (an aligned road reads its normals); never made resident. */
  load(key: string): Promise<TerrainTileData>;
}

export interface RoadMeshStats {
  readonly chunks: number;
  /** Rigid pieces. */
  readonly pieces: number;
  readonly triangles: number;
  readonly problems: readonly string[];
  readonly building: boolean;
}

export interface RoadMeshes {
  /** The definition's splines changed: a new set is built. */
  rebuild(): void;
  /** Tiles changed: aligned roads over them follow once the edits settle. */
  groundChanged(keys: Iterable<string>): void;
  /** Shifts the drawn set (the gizmo drags the terrain). */
  setOffset(x: number, y: number, z: number): void;
  stats(): RoadMeshStats;
  sync(camera: Camera | null): void;
  dispose(): void;
}

export interface RoadMeshesOptions {
  readonly ctx: RenderBindingContext;
  readonly actor: ActorId;
  readonly name: string;
  readonly input: () => RoadMeshInput;
}

interface RoadSet {
  readonly batches: InstanceBatch[];
  readonly geometries: BufferGeometry[];
  readonly keys: string[];
  readonly stats: Omit<RoadMeshStats, "building">;
}

const NO_STATS: Omit<RoadMeshStats, "building"> = { chunks: 0, pieces: 0, triangles: 0, problems: [] };

/** A template part in model root space, as the generator reads it. */
export function roadMeshPart(part: Pick<InstancePart, "geometry" | "local">): RoadMeshPart {
  const { geometry, local } = part;
  const attributes: Record<string, RoadMeshAttribute> = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const { itemSize, count } = attribute;
    const values = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i += 1) for (let axis = 0; axis < itemSize; axis += 1) values[i * itemSize + axis] = attribute.getComponent(i, axis);
    attributes[name] = { size: itemSize, values };
  }
  const position = attributes.position!.values;
  const point = new Vector3();
  for (let i = 0; i < position.length; i += 3) point.fromArray(position, i).applyMatrix4(local).toArray(position, i);
  const count = geometry.index ? geometry.index.count : position.length / 3;
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) indices[i] = geometry.index ? geometry.index.getX(i) : i;
  if (local.determinant() < 0) for (let i = 0; i + 2 < count; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  return { attributes, indices };
}

export function createRoadMeshes(options: RoadMeshesOptions): RoadMeshes {
  const { ctx, actor, name } = options;
  const group = new Group();
  group.name = `${name}/roads`;
  let drawn: RoadSet | null = null;
  /** Built, waiting for its batches to be ready. */
  let next: RoadSet | null = null;
  let generation = 0;
  let building = 0;
  let rebuildAt: number | null = null;
  let disposed = false;

  const disposeSet = (set: RoadSet | null): void => {
    if (!set) return;
    for (const batch of set.batches) batch.dispose();
    for (const geometry of set.geometries) geometry.dispose();
    for (const key of set.keys) ctx.resources.release(key);
  };

  const batch = (label: string): InstanceBatch => createInstanceBatch({
    name: `${name}/${label}`, source: "road", parent: group, castShadow: true, pick: false,
    ...(ctx.prepare ? { prepare: ctx.prepare } : {}),
    ...(ctx.gpuDriven?.instancedCasters ? { shadowCasters: ctx.gpuDriven.instancedCasters } : {}),
    ...(ctx.triangles ? { triangles: ctx.triangles, ...(ctx.staticPath ? { staticPath: ctx.staticPath } : {}) } : {}),
    // Plan phase W3: a road (a bridge) blocks rain and snow.
    ...(ctx.precipitationCover ? { precipitationCover: true, coverChanged: () => ctx.precipitationCover!.invalidate() } : {}),
    // Plan phase W4: a road gets wet and snowy.
    ...(ctx.surfaceWeather ? { weather: ctx.surfaceWeather } : {}),
  });

  /** The template's slot materials; their cache uses join `keys`. */
  const materialsOf = (template: ModelTemplate, keys: string[]): Promise<Material[]> =>
    Promise.all(slotMaterialIds(template, []).map((guid, index) => {
      if (guid === null) return Promise.resolve(template.slots[index]!);
      keys.push(ctx.resources.materialKey(guid));
      return ctx.resources.material(guid).catch(() => template.slots[index]!); // counted by the cache
    }));

  const build = async (): Promise<RoadSet> => {
    const input = options.input();
    const keys: string[] = [];
    const problems: string[] = [];
    const templates = new Map<string, { parts: InstancePart[]; box: Box3 }>();
    const models = new Map<string, RoadMeshModel>();
    const batches: InstanceBatch[] = [];
    const geometries: BufferGeometry[] = [];
    try {
      const visible = { splines: (input.def.splines ?? []).filter((spline) => !spline.hidden) };
      await Promise.all(landscapeSplineMeshAssetIds(visible).map(async (id) => {
        keys.push(resourceKey.model(id));
        try {
          const template = await ctx.resources.model(id);
          const parts = modelParts(template, await materialsOf(template, keys));
          templates.set(id, { parts, box: new Box3().setFromObject(template.scene) });
          models.set(id, { parts: parts.map(roadMeshPart) });
        } catch (error) {
          problems.push(`Model ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }));
      const source = await prepareTerrainSplineMeshSource(
        { def: input.def, tiles: new Map(input.tiles) }, (key) => ctx.resources.track(input.load(key)),
      );
      const built = buildRoadMeshes(source, models, { cellSize: ROAD_CHUNK_CELL });
      problems.push(...built.problems);
      const [x, y, z] = worldTerrainActorPosition(input.def);
      const centre = new Matrix4().makeTranslation(x, y, z);
      let triangles = 0;

      // Chunks: one batch per model and cell, one placement.
      const chunks = new Map<string, InstancePart[]>();
      for (const chunk of built.chunks) {
        const part = templates.get(chunk.assetId)!.parts[chunk.part]!;
        const geometry = new BufferGeometry();
        for (const [attribute, { size, values }] of Object.entries(chunk.attributes)) geometry.setAttribute(attribute, new BufferAttribute(values, size));
        geometry.setIndex(new BufferAttribute(chunk.indices, 1));
        geometry.name = `road ${chunk.assetId} ${chunk.cell}`;
        geometries.push(geometry);
        triangles += chunk.indices.length / 3;
        const key = `${chunk.assetId}|${chunk.cell}`;
        const list = chunks.get(key);
        const entry: InstancePart = { geometry, material: part.material, local: new Matrix4(), name: part.name, ...(part.slots ? { slots: part.slots } : {}) };
        if (list) list.push(entry);
        else chunks.set(key, [entry]);
      }
      for (const [key, parts] of chunks) {
        const road = batch(key);
        road.set("road", centre, null, actor);
        road.setParts(parts);
        batches.push(road);
      }

      // Rigid pieces: one batch per model.
      const rigid = new Map<string, InstanceBatch>();
      const matrix = new Matrix4();
      built.instances.forEach((piece, index) => {
        const { parts, box } = templates.get(piece.assetId)!;
        let pieces = rigid.get(piece.assetId);
        if (!pieces) {
          rigid.set(piece.assetId, (pieces = batch(piece.assetId)));
          batches.push(pieces);
          pieces.setParts(parts, box.getBoundingSphere(new Sphere()).radius, undefined, box);
        }
        matrix.compose(new Vector3(...piece.position), new Quaternion(...piece.orientation), new Vector3(...piece.scale)).premultiply(centre);
        pieces.set(String(index), matrix, null, actor);
        for (const part of parts) triangles += (part.geometry.index?.count ?? part.geometry.attributes.position!.count) / 3;
      });
      return { batches, geometries, keys, stats: { chunks: chunks.size, pieces: built.instances.length, triangles, problems } };
    } catch (error) {
      for (const one of batches) one.dispose();
      for (const geometry of geometries) geometry.dispose();
      return { batches: [], geometries: [], keys, stats: { ...NO_STATS, problems: [...problems, error instanceof Error ? error.message : String(error)] } };
    }
  };

  const rebuild = (): void => {
    if (disposed) return;
    rebuildAt = null;
    const ticket = ++generation;
    if (!drawn && !next && landscapeSplineMeshAssetIds(options.input().def).length === 0) return;
    const free = ctx.resources.busy();
    building += 1;
    void build().then((set) => {
      building -= 1;
      free();
      if (disposed || ticket !== generation) {
        disposeSet(set);
        return;
      }
      for (const problem of set.stats.problems) console.warn(`forge render: ${name} spline mesh: ${problem}`);
      disposeSet(next);
      next = set;
      if (set.batches.length > 0 && !group.parent) ctx.root.add(group);
    });
  };

  rebuild();

  return {
    rebuild,
    groundChanged(keys) {
      const { def } = options.input();
      const aligned = new Set(terrainSplineMeshTileKeys(def));
      if (aligned.size === 0) return;
      for (const key of keys) {
        if (!aligned.has(key)) continue;
        rebuildAt = performance.now() + GROUND_DELAY;
        return;
      }
    },
    setOffset(x, y, z) {
      group.position.set(x, y, z);
    },
    stats: () => ({ ...(drawn?.stats ?? next?.stats ?? NO_STATS), building: building > 0 || next !== null || rebuildAt !== null }),
    sync(camera) {
      if (rebuildAt !== null && performance.now() >= rebuildAt) rebuild();
      const scale = ctx.quality().foliageCullDistanceScale;
      for (const set of [drawn, next]) {
        for (const one of set?.batches ?? []) {
          one.flush();
          one.updateCulling(camera, scale);
        }
      }
      if (next && next.batches.every((one) => one.ready)) {
        disposeSet(drawn);
        drawn = next;
        next = null;
        if (drawn.batches.length === 0) group.removeFromParent();
      }
    },
    dispose() {
      disposed = true;
      generation += 1;
      disposeSet(drawn);
      disposeSet(next);
      drawn = next = null;
      group.removeFromParent();
    },
  };
}
