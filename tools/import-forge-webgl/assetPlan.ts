// Which Forge WebGL assets an import brings and how (plan 2b importer, user
// decisions 2026-11-12).
//
// From seed asset ids (the models the levels place, the materials of their
// terrain layers, any asset asked for), the plan follows Forge's chain
// model -> `<model>.materials.json` slots -> material -> textures, so the
// textures are there when materials are converted (Faz 3). Three Forge types
// become binary assets now (`forge.model`, `forge.texture`, `forge.sound`);
// every other type is reported with the phase that brings it, the K12 types
// are skipped and listed, and the licence decides through the provenance
// table (`provenance.ts`).

import type { ForgeManifestAsset, ForgeSource } from "./forgeSource.ts";
import { provenanceOf, type Provenance } from "./provenance.ts";

export type BinaryTarget = "forge.model" | "forge.texture" | "forge.sound";

/** Forge manifest types: the binary type they become now, or the phase that brings them. */
export const FORGE_ASSET_TYPES: Readonly<Record<string, { readonly type: BinaryTarget } | { readonly phase: string }>> = {
  staticMesh: { type: "forge.model" },
  texture: { type: "forge.texture" },
  sound: { type: "forge.sound" },
  material: { phase: "3" },
  foliageType: { phase: "5c" },
  effect: { phase: "6" },
  skeletalMesh: { phase: "6" },
  animation: { phase: "6" },
  vehicle: { phase: "6" },
  prefab: { phase: "6" },
  ui: { phase: "6" },
  level: { phase: "level (--level)" },
  aiQuery: { phase: "- (K12)" },
  behaviorTree: { phase: "- (K12)" },
  blackboard: { phase: "- (K12)" },
  stateTree: { phase: "- (K12)" },
  conversation: { phase: "- (K12)" },
  dialogueLine: { phase: "- (K12)" },
  dialogueVoice: { phase: "- (K12)" },
  soundCue: { phase: "- (K12)" },
};

/** Forge model sidecars: the phase that converts each. */
export const MODEL_SIDECAR_PHASES: Readonly<Record<string, string>> = {
  ".materials.json": "3",
  ".uvw.json": "3",
  ".vertexcolors.json": "3",
  ".collision.json": "6",
  ".fracture.json": "8",
  ".deformable.json": "8",
};

export interface PlannedAsset {
  readonly asset: ForgeManifestAsset;
  readonly type: BinaryTarget;
  readonly provenance: Provenance;
  readonly rule: string;
}

export interface AssetPlan {
  /** Assets to import, by Forge id. */
  readonly imported: Map<string, PlannedAsset>;
  /** Assets of a type a later phase brings, by Forge id: the phase. */
  readonly deferred: Map<string, { readonly asset: ForgeManifestAsset; readonly phase: string }>;
  /** Assets the provenance table refuses (Kenney / Quaternius), by Forge id. */
  readonly excluded: Map<string, { readonly asset: ForgeManifestAsset; readonly reason: string }>;
  /** Ids a level or material names that the manifest does not list. */
  readonly unknownIds: Set<string>;
  /** Model sidecars seen, by suffix: how many. */
  readonly sidecars: Map<string, number>;
}

const modelBase = (path: string): string => path.replace(/\.(glb|gltf)$/i, "");

/** Texture ids a Forge material names: every string under a key ending in `Texture`, nested layers too. */
export function materialTextureIds(material: unknown): string[] {
  const ids: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (/Texture$/.test(key) && typeof child === "string" && child !== "") ids.push(child);
        else visit(child);
      }
    }
  };
  visit(material);
  return ids;
}

export async function planAssets(source: ForgeSource, seeds: Iterable<string>): Promise<AssetPlan> {
  const plan: AssetPlan = {
    imported: new Map(), deferred: new Map(), excluded: new Map(), unknownIds: new Set(), sidecars: new Map(),
  };
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const asset = source.assets.get(id);
    if (!asset) {
      plan.unknownIds.add(id);
      continue;
    }
    const decision = provenanceOf(asset);
    if (decision.kind === "excluded") {
      plan.excluded.set(id, { asset, reason: decision.reason });
      continue;
    }
    const target = FORGE_ASSET_TYPES[asset.assetType] ?? { phase: "?" };
    if ("phase" in target) {
      plan.deferred.set(id, { asset, phase: target.phase });
      // A material comes in Faz 3; the textures it names come now.
      if (asset.assetType === "material" && await source.exists(asset.path)) {
        queue.push(...materialTextureIds(await source.readJson(asset.path)));
      }
      continue;
    }
    plan.imported.set(id, { asset, type: target.type, provenance: decision.provenance, rule: decision.rule });
    if (target.type !== "forge.model") continue;
    for (const suffix of Object.keys(MODEL_SIDECAR_PHASES)) {
      const sidecar = `${modelBase(asset.path)}${suffix}`;
      if (!(await source.exists(sidecar))) continue;
      plan.sidecars.set(suffix, (plan.sidecars.get(suffix) ?? 0) + 1);
      if (suffix !== ".materials.json") continue;
      const slots = (await source.readJson(sidecar)) as { slots?: unknown };
      for (const slot of Array.isArray(slots.slots) ? slots.slots : []) if (typeof slot === "string") queue.push(slot);
    }
  }
  return plan;
}
