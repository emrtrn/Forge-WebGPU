// Development only (phase 5c steps 5.1–5.4): the render smoke's GPU-driven
// foliage. The page gets foliage instances the smoke generated in Node
// (Derekavak's landscape rules, `tests/smoke/gpuFoliageScene.ts`), draws them
// through the foliage batches (`render/foliage/foliageBatches.ts`, R4: one
// GPU-driven batch per type) and compares the GPU's visible count of every
// view with the CPU reference for the same view
// (`engine/world/instanceCulling.ts`, as Phase 1 G7 compared culling). The
// reference project is not changed.

import { Group, PerspectiveCamera, type Object3D } from "three/webgpu";
import { cullInstanceCounts, type InstanceCullResult } from "../../engine/world/instanceCulling.ts";
import { createFoliageBatches, type FoliageBatches } from "../foliage/foliageBatches.ts";
import type { RenderHost } from "../host/renderHost.ts";
import { foliageProbe } from "../sync/debugTags.ts";
import type { GpuDrivenBatch } from "./gpuDrivenBatch.ts";

export interface DevGpuType {
  readonly name: string;
  /** `forge.model` GUID. */
  readonly mesh: string;
  readonly cullStart: number;
  readonly cullEnd: number;
  /** 16 column-major floats per instance. */
  readonly matrices: readonly number[];
}

export interface DevGpuInstall {
  /** `gpu` (WebGPU) or `cpu` (the WebGL2 twin). */
  readonly path: "gpu" | "cpu";
  readonly batches: number;
  readonly instances: number;
  readonly parts: number;
  readonly draws: number;
}

export interface DevGpuViewCheck {
  readonly gpu: readonly number[];
  readonly minCasterRadius?: number;
  readonly cpu: Pick<InstanceCullResult, "counts" | "certain" | "possible">;
}

export interface DevGpuCheck extends DevGpuViewCheck {
  readonly name: string;
  readonly instances: number;
  /** The shadow views (5.2), cascades in order. */
  readonly shadows: readonly DevGpuViewCheck[];
  /** The camera views (R9a step 1), in registration order. */
  readonly cameras: readonly DevGpuViewCheck[];
}

export interface DevGpuDriven {
  install(types: readonly DevGpuType[], cullScale: number, castShadow?: boolean, bundle?: boolean): Promise<DevGpuInstall>;
  /** The last frame's GPU counts beside the CPU reference of the same view: the installed batches, else the level's foliage. */
  check(): Promise<DevGpuCheck[]>;
  /** The level's procedural foliage ring (plan 5c F1), every placement summed; null without a world or foliage. */
  level(): { rings: number; cells: number; instances: number; pending: number } | null;
  /** The level's far billboard blocks (plan 5c F3), every placement summed; null without a world or foliage. */
  levelFar(): { blocks: number; instances: number } | null;
  /** Shows or hides the level's foliage (the smoke's image without it). */
  levelVisible(visible: boolean): void;
  /** Stops or resumes the level foliage binding's per-frame work (a measurement's baseline). */
  levelActive(active: boolean): void;
  /** Render bundles three recorded (`backend.beginBundle` calls) since the first call (5.3 measurement). */
  bundleRecords(): number;
  /**
   * Registers a camera view mirrored through `plane` (unit normal, offset; R9a step 1) with a camera
   * that never draws, or removes it (null): the cull's mirrored lists, checked against the CPU reference.
   */
  mirror(plane: readonly [number, number, number, number] | null): void;
  remove(): void;
}

export function createDevGpuDriven(host: () => RenderHost | null): DevGpuDriven {
  let group: Group | null = null;
  let foliage: FoliageBatches | null = null;
  let records = 0;
  let counting = false;
  let unmirror: (() => void) | null = null;
  let detached: { object: Object3D; parent: Object3D } | null = null;
  const mirrorCamera = new PerspectiveCamera();

  const remove = (): void => {
    foliage?.dispose();
    group?.removeFromParent();
    foliage = null; group = null;
  };

  return {
    async install(types, cullScale, castShadow = true, bundle = false) {
      remove();
      const current = host();
      const scene = current?.world?.scene;
      if (!current || !scene) throw new Error("no world is drawn");
      group = new Group();
      group.name = "gpuDrivenDev";
      scene.add(group);
      const fov = (current.camera as PerspectiveCamera | null)?.fov ?? 60;
      foliage = createFoliageBatches({
        gpuDriven: current.gpuDriven, resources: current.resources("gpuDrivenDev"), parent: group,
        quality: { cullScale, verticalFov: fov }, bundle,
      });
      for (const type of types) {
        foliage.set({ id: type.name, mesh: type.mesh, lods: [], castShadow, cullStart: type.cullStart, cullEnd: type.cullEnd }, "smoke", type.matrices);
      }
      await foliage.ready();
      const batches = foliage.batches;
      return {
        path: current.gpuDriven.supported ? "gpu" : "cpu", batches: batches.length,
        instances: batches.reduce((sum, batch) => sum + batch.instances.count, 0),
        parts: batches.reduce((sum, batch) => sum + batch.meshes.length, 0),
        draws: batches.reduce((sum, batch) => sum + batch.draws, 0),
      };
    },
    async check() {
      const current = host();
      const views = current?.gpuDriven.lastViews ?? [];
      if (!current || views.length === 0) throw new Error("no culled frame yet");
      const viewCheck = async (batch: GpuDrivenBatch, index: number): Promise<DevGpuViewCheck> => {
        const layer = batch.viewLayers[index];
        const view = views.find(entry => entry.layer === layer) ?? views[0]!;
        const cpu = cullInstanceCounts(batch.instances.matrices(), batch.instances.count, batch.cullBatch, view);
        return { gpu: await batch.readCounts(current.renderer, index),
          ...(view.minCasterRadius === undefined ? {} : { minCasterRadius: view.minCasterRadius }),
          cpu: { counts: cpu.counts, certain: cpu.certain, possible: cpu.possible } };
      };
      // The installed batches, else the level's own foliage (plan 5c F1: the ring).
      const batches = foliage?.batches ?? (current.world ? foliageProbe(current.world.scene)?.batches() ?? [] : []);
      return Promise.all(batches.map(async (batch) => {
        // A batch that casts shadows has the cull's views in order; one that does not skips the shadow
        // views, so only its main view is checked.
        const shadows: DevGpuViewCheck[] = [], cameras: DevGpuViewCheck[] = [];
        if (batch.views === views.length) {
          for (let index = 1; index < batch.views; index += 1) (views[index]!.role === "camera" ? cameras : shadows).push(await viewCheck(batch, index));
        }
        return { name: batch.name, instances: batch.instances.count, ...(await viewCheck(batch, 0)), shadows, cameras };
      }));
    },
    level() {
      const scene = host()?.world?.scene;
      return scene ? foliageProbe(scene)?.ring() ?? null : null;
    },
    levelFar() {
      const scene = host()?.world?.scene;
      return scene ? foliageProbe(scene)?.far() ?? null : null;
    },
    levelActive(active) {
      const scene = host()?.world?.scene;
      if (scene) (detached?.object ? foliageProbe(detached.object) : foliageProbe(scene))?.setActive(active);
    },
    levelVisible(visible) {
      // Out of the scene graph, not just hidden: the cull skips batches outside the scene, so the
      // smoke's own batches are then the only GPU-driven ones.
      const scene = host()?.world?.scene;
      if (!scene) return;
      if (!visible && !detached) {
        const found = scene.getObjectByName("foliage");
        if (found?.parent && foliageProbe(found)) {
          detached = { object: found, parent: found.parent };
          found.removeFromParent();
        }
      } else if (visible && detached) {
        detached.parent.add(detached.object);
        detached = null;
      }
    },
    bundleRecords() {
      const backend = host()?.renderer.backend as { beginBundle?: (...args: unknown[]) => unknown } | undefined;
      if (!counting && backend?.beginBundle) {
        const original = backend.beginBundle.bind(backend);
        backend.beginBundle = (...args: unknown[]) => { records += 1; return original(...args); };
        counting = true;
      }
      return records;
    },
    mirror(plane) {
      unmirror?.(); unmirror = null;
      const current = host();
      if (!plane || !current) return;
      unmirror = current.gpuDriven.add({ view: () => ({ camera: mirrorCamera, mirror: plane, active: true }) });
    },
    remove() {
      unmirror?.(); unmirror = null;
      remove();
    },
  };
}
