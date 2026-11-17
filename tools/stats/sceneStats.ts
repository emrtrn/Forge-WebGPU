// Scene cost report (plan 5c R5): what a level asks the renderer for, from
// its files, before anything draws. The agent reads it to judge a level
// (`npm run forge -- stats`), the editor's Stats panel shows what one frame
// actually drew; the triangle and draw call work of 5c (R6–R10) speaks the
// same terms.
//
// - Actors: total, spatially loaded / persistent, cells; components by type.
// - Static meshes: placements, unique models, unique (model, slot materials)
//   combinations, source triangles (the model's triangles × placements),
//   per model its triangles, slots, placements and transparent / double-sided
//   materials (a placement's slot material: its own override, else the
//   model's default `forge.material`, else the GLB's).
// - Shapes: placements by primitive and their triangles (the procedural
//   generator's).
// - Materials: unique materials placed, transparent (blend), double-sided,
//   both (three draws a transparent double-sided material twice).
// - Draws: the static batches the renderer builds (`staticMeshBatchKey`:
//   model + slot overrides + shadow switch; shapes by primitive + shadow) and
//   one view's draws (one per model slot after slot merging, ×2 for transparent
//   double-sided), how many batches cast shadows (each draws again per
//   shadow cascade).
// - Foliage: landscape rules, painted instances; HLOD: cells, 4 × 4 clusters and
//   landmarks with their triangles (plan 5c R8.5).

import { getBounds, type Document, type Material as GltfMaterial } from "@gltf-transform/core";
import { isId, type AssetId } from "../../src/core/id.ts";
import { effectiveComponents } from "../../src/core/level/actorClass.ts";
import type { LevelDoc } from "../../src/core/level/model.ts";
import { parseComponentTypeTag } from "../../src/core/schema/component.ts";
import { shapeMesh, type ShapePrimitiveName } from "../../src/engine/procgen/shapePrimitives.ts";
import type { HlodInput } from "../world/hlodInput.ts";
import { contentPath, resourcePath } from "../world/hlodInput.ts";

export interface MaterialFlags { readonly transparent: boolean; readonly doubleSided: boolean }

export interface ModelStats {
  readonly id: string;
  readonly path: string | null;
  readonly placements: number;
  /** Triangles of one copy (every triangle primitive). */
  readonly triangles: number;
  readonly placedTriangles: number;
  /** GLB material slots. */
  readonly slots: number;
  /** Primitives (one draw each per view, ×2 for a transparent double-sided material). */
  readonly primitives: number;
  readonly transparentSlots: number;
  readonly doubleSidedSlots: number;
  /** Bounding sphere radius, metres. */
  readonly radius: number;
  readonly error?: string;
}

export interface SceneStats {
  readonly level: string;
  readonly id: string;
  readonly actors: { readonly total: number; readonly spatial: number; readonly persistent: number; readonly cells: number };
  readonly components: Readonly<Record<string, number>>;
  readonly staticMeshes: {
    readonly placements: number; readonly uniqueModels: number; readonly uniqueModelMaterials: number; readonly sourceTriangles: number;
  };
  readonly shapes: { readonly placements: number; readonly byPrimitive: Readonly<Record<string, number>>; readonly triangles: number };
  readonly materials: { readonly unique: number; readonly transparent: number; readonly doubleSided: number; readonly transparentDoubleSided: number };
  readonly draws: { readonly staticBatches: number; readonly shapeBatches: number; readonly drawsPerView: number; readonly shadowCastingBatches: number; readonly shadowDrawsPerCascade: number };
  readonly triangles: { readonly source: number };
  readonly foliage: { readonly landscapeRules: number; readonly paintedInstances: number; readonly paintedTypes: number };
  readonly hlod: { readonly cells: number; readonly triangles: number; readonly clusters: number; readonly clusterTriangles: number; readonly landmarkTriangles: number } | null;
  readonly models: readonly ModelStats[];
  readonly warnings: readonly string[];
}

interface ModelInfo {
  readonly path: string | null;
  readonly triangles: number;
  readonly radius: number;
  /** Per primitive: its GLB slot index. */
  readonly primitiveSlots: readonly number[];
  /** Per GLB slot: the GLB material's own flags. */
  readonly slotFlags: readonly MaterialFlags[];
  readonly error?: string;
}

const gltfFlags = (material: GltfMaterial | null): MaterialFlags => ({
  transparent: material?.getAlphaMode() === "BLEND",
  doubleSided: material?.getDoubleSided() ?? false,
});

/** A `forge.material` asset's flags; null when it is not one. */
function materialAssetFlags(input: Pick<HlodInput, "index">, id: string): MaterialFlags | null {
  const doc = input.index.jsonAssets.get(id) as { schema?: string; alphaMode?: string; side?: string } | undefined;
  if (!doc || doc.schema !== "forge.material/1") return null;
  return { transparent: doc.alphaMode === "blend", doubleSided: doc.side === "double" };
}

export async function readModelInfo(read: (path: string) => Promise<Document>, input: Pick<HlodInput, "index">, id: string): Promise<ModelInfo> {
  const entry = input.index.entries.get(id);
  const path = entry ? contentPath(entry) : null;
  try {
    if (!path || entry?.type !== "forge.model" || !/\.(glb|gltf)$/i.test(path)) throw new Error("missing model or unsupported path");
    const doc = await read(resourcePath(path));
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    if (!scene) throw new Error("GLTF has no scene");
    const bounds = getBounds(scene);
    const radius = Math.hypot(...bounds.max.map((value, index) => value - bounds.min[index]!)) / 2;
    const slots = new Map<GltfMaterial | null, number>();
    const slotFlags: MaterialFlags[] = [];
    const primitiveSlots: number[] = [];
    let triangles = 0;
    // Each node instance of a mesh draws (the model template keeps the node tree).
    scene.traverse((node) => {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const material = primitive.getMaterial();
        if (!slots.has(material)) { slots.set(material, slots.size); slotFlags.push(gltfFlags(material)); }
        if (primitive.getMode() !== 4) continue;
        primitiveSlots.push(slots.get(material)!);
        const indices = primitive.getIndices();
        triangles += Math.floor((indices?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0) / 3);
      }
    });
    return { path, triangles, radius, primitiveSlots, slotFlags };
  } catch (error) {
    return { path, triangles: 0, radius: 0, primitiveSlots: [], slotFlags: [], error: String(error) };
  }
}

const shapeTriangles = (primitive: ShapePrimitiveName): number => shapeMesh(primitive).indices.length / 3;

export interface SceneStatsInput {
  readonly folder: string;
  readonly level: LevelDoc;
  readonly cells: number;
  readonly input: Pick<HlodInput, "index">;
  readonly model: (id: string) => Promise<ModelInfo>;
  readonly foliageIndex: { readonly types: readonly unknown[]; readonly cells: readonly { readonly counts: readonly number[] }[] } | null;
  readonly hlodIndex: {
    readonly cells: readonly { readonly triangles: number }[];
    readonly clusters?: readonly { readonly triangles: number }[];
    readonly landmarks?: { readonly triangles: number };
  } | null;
}

export async function sceneStats(source: SceneStatsInput): Promise<SceneStats> {
  const { level, input } = source;
  const warnings: string[] = [];
  const components: Record<string, number> = {};
  const byPrimitive: Record<string, number> = {};
  const modelPlacements = new Map<string, number>();
  const modelMaterialKeys = new Set<string>();
  const staticBatches = new Map<string, { model: string; slots: readonly (string | null)[] }>();
  const shapeBatches = new Set<string>();
  const castingStatic = new Set<string>();
  const placedMaterials = new Map<string, MaterialFlags>();
  let spatial = 0, shapes = 0, shapeTris = 0, landscapeRules = 0, staticPlacements = 0;

  const models = new Map<string, Promise<ModelInfo>>();
  const modelOf = (id: string): Promise<ModelInfo> => {
    let info = models.get(id);
    if (!info) { info = source.model(id); models.set(id, info); }
    return info;
  };
  const defaultSlots = (id: string): readonly (string | null)[] =>
    (input.index.metas.get(id)?.import.materials as readonly (string | null)[] | undefined) ?? [];

  for (const actor of level.actors) {
    if (actor.spatiallyLoaded !== false) spatial += 1;
    const effective = effectiveComponents(actor, actor.class ? input.index.resolveClass(actor.class) : undefined);
    for (const component of Object.values(effective)) {
      const name = parseComponentTypeTag(component.type)?.name ?? component.type;
      components[name] = (components[name] ?? 0) + 1;
      if (name === "forge.shape") {
        const primitive = (component.primitive ?? "cube") as ShapePrimitiveName;
        shapes += 1;
        byPrimitive[primitive] = (byPrimitive[primitive] ?? 0) + 1;
        try { shapeTris += shapeTriangles(primitive); } catch { warnings.push(`shape ${actor.id}: unknown primitive ${String(primitive)}`); }
        shapeBatches.add(`${primitive}|${component.castShadow === false ? "none" : "cast"}`);
      } else if (name === "forge.staticMesh" && isId(component.mesh, "asset")) {
        const model = component.mesh as AssetId;
        const overrides = ((component.materials ?? []) as readonly (string | null)[]);
        staticPlacements += 1;
        modelPlacements.set(model, (modelPlacements.get(model) ?? 0) + 1);
        const key = `${model}|${overrides.map((id) => id ?? "").join(",")}|${component.castShadow === false ? "none" : "cast"}`;
        staticBatches.set(key, { model, slots: overrides });
        if (component.castShadow !== false) castingStatic.add(key);
      } else if (name === "forge.landscapeFoliage") {
        landscapeRules += Array.isArray(component.rules) ? component.rules.length : 0;
      }
    }
  }

  // Per batch: its materials and draws.
  let drawsPerView = 0, shadowDraws = 0;
  for (const [key, batch] of staticBatches) {
    const info = await modelOf(batch.model);
    const defaults = defaultSlots(batch.model);
    const flagsOf = (slot: number): { id: string; flags: MaterialFlags } => {
      const chosen = batch.slots[slot] ?? defaults[slot] ?? null;
      const flags = chosen ? materialAssetFlags(input, chosen) : null;
      if (chosen && flags) return { id: chosen, flags };
      if (chosen && !flags) warnings.push(`material ${chosen}: not a forge.material; the GLB's is drawn`);
      return { id: `${batch.model}#${slot}`, flags: info.slotFlags[slot] ?? { transparent: false, doubleSided: false } };
    };
    modelMaterialKeys.add(`${batch.model}|${info.slotFlags.map((_, slot) => flagsOf(slot).id).join(",")}`);
    for (let slot = 0; slot < info.slotFlags.length; slot += 1) {
      const { id, flags } = flagsOf(slot);
      placedMaterials.set(id, flags);
    }
    let draws = 0;
    // A batch draws one mesh per slot (render/resources/modelParts.ts, plan 5c R8.1);
    // primitives with differing vertex attributes stay apart there, not counted here.
    for (const slot of new Set(info.primitiveSlots)) {
      const { flags } = flagsOf(slot);
      draws += flags.transparent && flags.doubleSided ? 2 : 1;
    }
    drawsPerView += draws;
    if (castingStatic.has(key)) shadowDraws += draws;
  }
  drawsPerView += shapeBatches.size;
  shadowDraws += [...shapeBatches].filter((key) => key.endsWith("|cast")).length;

  const modelStats: ModelStats[] = [];
  let sourceTriangles = 0;
  for (const [id, placements] of modelPlacements) {
    const info = await modelOf(id);
    if (info.error) warnings.push(`model ${id}: ${info.error}`);
    const placed = info.triangles * placements;
    sourceTriangles += placed;
    const defaults = defaultSlots(id);
    const flags = info.slotFlags.map((own, slot) => (defaults[slot] ? materialAssetFlags(input, defaults[slot]!) : null) ?? own);
    modelStats.push({
      id, path: info.path, placements, triangles: info.triangles, placedTriangles: placed, slots: info.slotFlags.length,
      primitives: info.primitiveSlots.length, transparentSlots: flags.filter((f) => f.transparent).length,
      doubleSidedSlots: flags.filter((f) => f.doubleSided).length, radius: Math.round(info.radius * 100) / 100,
      ...(info.error ? { error: info.error } : {}),
    });
  }
  modelStats.sort((a, b) => b.placedTriangles - a.placedTriangles || a.id.localeCompare(b.id));
  const materialFlags = [...placedMaterials.values()];
  const painted = source.foliageIndex?.cells.reduce((sum, cell) => sum + cell.counts.reduce((a, b) => a + b, 0), 0) ?? 0;

  return {
    level: source.folder,
    id: level.id,
    actors: { total: level.actors.length, spatial, persistent: level.actors.length - spatial, cells: source.cells },
    components: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))),
    staticMeshes: { placements: staticPlacements, uniqueModels: modelPlacements.size, uniqueModelMaterials: modelMaterialKeys.size, sourceTriangles },
    shapes: { placements: shapes, byPrimitive, triangles: shapeTris },
    materials: {
      unique: placedMaterials.size,
      transparent: materialFlags.filter((f) => f.transparent).length,
      doubleSided: materialFlags.filter((f) => f.doubleSided).length,
      transparentDoubleSided: materialFlags.filter((f) => f.transparent && f.doubleSided).length,
    },
    draws: {
      staticBatches: staticBatches.size, shapeBatches: shapeBatches.size, drawsPerView,
      shadowCastingBatches: castingStatic.size + [...shapeBatches].filter((key) => key.endsWith("|cast")).length,
      shadowDrawsPerCascade: shadowDraws,
    },
    triangles: { source: sourceTriangles + shapeTris },
    foliage: { landscapeRules, paintedInstances: painted, paintedTypes: source.foliageIndex?.types.length ?? 0 },
    hlod: source.hlodIndex ? {
      cells: source.hlodIndex.cells.length, triangles: source.hlodIndex.cells.reduce((sum, cell) => sum + cell.triangles, 0),
      clusters: source.hlodIndex.clusters?.length ?? 0, clusterTriangles: (source.hlodIndex.clusters ?? []).reduce((sum, cluster) => sum + cluster.triangles, 0),
      landmarkTriangles: source.hlodIndex.landmarks?.triangles ?? 0,
    } : null,
    models: modelStats,
    warnings: [...new Set(warnings)],
  };
}

export function formatSceneStats(stats: SceneStats, top = 10): string {
  const n = (value: number): string => value.toLocaleString("en-US");
  const lines = [
    `forge stats ${stats.level} (${stats.id})`,
    `actors ${n(stats.actors.total)} (${n(stats.actors.spatial)} spatial, ${n(stats.actors.persistent)} persistent), ${n(stats.actors.cells)} cells`,
    `static meshes ${n(stats.staticMeshes.placements)} placements, ${n(stats.staticMeshes.uniqueModels)} models, ${n(stats.staticMeshes.uniqueModelMaterials)} model+material combinations, ${n(stats.staticMeshes.sourceTriangles)} triangles`,
    `shapes ${n(stats.shapes.placements)} (${Object.entries(stats.shapes.byPrimitive).map(([k, v]) => `${k} ${v}`).join(", ") || "-"}), ${n(stats.shapes.triangles)} triangles`,
    `materials ${n(stats.materials.unique)} unique, ${stats.materials.transparent} transparent, ${stats.materials.doubleSided} double-sided, ${stats.materials.transparentDoubleSided} both`,
    `draws ${n(stats.draws.drawsPerView)} per view (${stats.draws.staticBatches} static + ${stats.draws.shapeBatches} shape batches); ${stats.draws.shadowCastingBatches} batches cast, ${n(stats.draws.shadowDrawsPerCascade)} draws per shadow cascade`,
    `triangles ${n(stats.triangles.source)} source (every placement at full detail)`,
    `foliage ${stats.foliage.landscapeRules} landscape rules, ${n(stats.foliage.paintedInstances)} painted instances of ${stats.foliage.paintedTypes} types`,
    `hlod ${stats.hlod ? `${stats.hlod.cells} cells, ${n(stats.hlod.triangles)} triangles; ${stats.hlod.clusters} clusters, ${n(stats.hlod.clusterTriangles)} triangles; landmarks ${n(stats.hlod.landmarkTriangles)} triangles` : "none"}`,
    `top models by placed triangles:`,
    ...stats.models.slice(0, top).map((model) => `  ${model.path ?? model.id}: ${n(model.placements)} × ${n(model.triangles)} = ${n(model.placedTriangles)} tris, ${model.primitives} primitives, ${model.slots} slots (${model.transparentSlots} transparent, ${model.doubleSidedSlots} double-sided), r ${model.radius} m`),
    ...stats.warnings.map((warning) => `warning ${warning}`),
  ];
  return lines.join("\n");
}
