// Caster classes occupy separate layers for visible and shadow-only zones.
import { Vector3, type Camera, type InstancedMesh, type Object3D } from "three/webgpu";
import { casterFadeEnd, casterLayerMask, maxCasterCascade, type ShadowCasterProfile } from "../../engine/world/shadowCasters.ts";
import { setDrawLayer, ZONE_HIDDEN_LAYER, ZONE_SHADOW_LAYER, type ZoneMode } from "../gpu/gpuDrivenBatch.ts";

const VISIBLE_CLASSES = [16, 17, 18, 19] as const;
const SHADOW_CLASSES = [20, 21, 22, 23] as const;
const VISIBLE_ZERO = 24, SHADOW_ZERO = 25;
export const VISIBLE_CASTER_LAYERS = casterLayerMask(1, VISIBLE_CLASSES) | (1 << VISIBLE_ZERO);
export const SHADOW_CASTER_LAYERS = casterLayerMask(1, SHADOW_CLASSES) | (1 << SHADOW_ZERO);

export function instancedCasterMask(cascade?: number): number {
  return cascade === undefined ? VISIBLE_CASTER_LAYERS | SHADOW_CASTER_LAYERS
    : casterLayerMask(cascade, VISIBLE_CLASSES) | casterLayerMask(cascade, SHADOW_CLASSES);
}

export function instancedCasterLayer(mode: ZoneMode, cascade: number | null): number {
  if (mode === "hidden") return ZONE_HIDDEN_LAYER;
  if (cascade === null) return mode === "shadow" ? ZONE_SHADOW_LAYER : 0;
  if (cascade === 0) return mode === "shadow" ? SHADOW_ZERO : VISIBLE_ZERO;
  return (mode === "shadow" ? SHADOW_CLASSES : VISIBLE_CLASSES)[cascade - 1]!;
}

export interface ShadowCasterFade {
  update(origin: Vector3, cameras: ReadonlySet<Camera>, end: number): void;
}

export interface InstancedShadowBatch {
  readonly parent: Object3D;
  readonly meshes: readonly InstancedMesh[];
  readonly fade: ShadowCasterFade;
  radius(): number;
  zoneMode(): ZoneMode;
}

export interface ShadowCasterCount {
  readonly batches: number;
  readonly instances: number;
}

export interface InstancedShadowCasters {
  add(batch: InstancedShadowBatch): () => void;
}

function inScene(object: Object3D, scene: Object3D): boolean {
  for (let at: Object3D | null = object; at; at = at.parent) if (at === scene) return true;
  return false;
}

export function createInstancedShadowCasters() {
  const entries = new Map<InstancedShadowBatch, { radius: number; cascade: number | null; revision: number }>();
  const origin = new Vector3();
  let scene: Object3D | null = null;
  let active: ShadowCasterProfile | null = null;
  let revision = 0;
  return {
    add(batch: InstancedShadowBatch) {
      entries.set(batch, { radius: 0, cascade: null, revision: -1 });
      return () => { entries.delete(batch); };
    },
    update(currentScene: Object3D, camera: Camera, profile: ShadowCasterProfile | null, cameras: ReadonlySet<Camera>) {
      scene = currentScene;
      if (active?.minTexels !== profile?.minTexels || active?.texels.length !== profile?.texels.length
        || (profile && profile.texels.some((texel, i) => texel !== active?.texels[i]))) revision += 1;
      active = profile;
      if (entries.size === 0) return;
      camera.getWorldPosition(origin);
      for (const [batch, state] of entries) {
        if (!inScene(batch.parent, currentScene)) continue;
        const radius = batch.radius();
        if (radius !== state.radius || state.revision !== revision) {
          state.radius = radius;
          state.revision = revision;
          // Missing bounds retain conservative casting on the default layers.
          state.cascade = profile && radius > 0 && Number.isFinite(radius)
            ? maxCasterCascade(radius, profile.texels, profile.minTexels) : null;
        }
        const layer = instancedCasterLayer(batch.zoneMode(), state.cascade);
        for (const mesh of batch.meshes) setDrawLayer(mesh, layer);
        const end = profile && state.cascade !== null ? casterFadeEnd(state.cascade, profile) : 0;
        batch.fade.update(origin, cameras, end);
      }
    },
    stats(): readonly ShadowCasterCount[] {
      if (!active || !scene) return [];
      const out = active.texels.map(() => ({ batches: 0, instances: 0 }));
      for (const [batch, { cascade }] of entries) {
        if (!inScene(batch.parent, scene) || batch.zoneMode() === "hidden") continue;
        const count = batch.meshes.find(mesh => mesh.visible && mesh.parent !== null
          && (Array.isArray(mesh.material) ? mesh.material.some(material => material.visible) : mesh.material.visible))?.count ?? 0;
        if (count === 0) continue;
        for (let index = 0; index < (cascade ?? out.length); index += 1) {
          out[index]!.batches += 1;
          out[index]!.instances += count;
        }
      }
      return out;
    },
    clear: () => { entries.clear(); active = null; scene = null; },
  };
}
