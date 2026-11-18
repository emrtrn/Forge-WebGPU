// Development only (plan 5c R9a O5, heavy-mesh test): high-poly props drawn
// by the engine's own static batch (`render/sync/instanceBatches.ts`) at the
// given placements, so a measurement compares the shipped paths on expensive
// geometry: `instanced`, `gpu` (GPU-driven with automatic LOD) and `auto`
// (the host's rule, `triangles/staticPath.ts`). The geometry is a sphere of
// `segments` × segments / 2 quads; nothing is saved to the level.
//
// Zones (plan 5c R9b Z6): as the static mesh binding does, `instanced` props
// split into one batch per zone of the world (registered with it); on the GPU
// path they stay one batch and the cull reads each instance's zone.

import { Matrix4, MeshStandardNodeMaterial, SphereGeometry } from "three/webgpu";
import { placementZone } from "../sync/batchCells.ts";
import { createInstanceBatch, type InstanceBatch } from "../sync/instanceBatches.ts";
import type { StaticPath } from "../triangles/staticPath.ts";
import type { RenderHost } from "../host/renderHost.ts";

export interface HeavyProps {
  readonly triangles: number;
  readonly instances: number;
  readonly path: StaticPath;
  /** Batches: one per zone the props fall in (and one for those in none). */
  readonly batches: number;
}

export interface DevHeavyProps {
  /** Replaces the heavy props: 16 floats per placement; resolves once the batches draw. */
  install(matrices: readonly number[], segments: number, path: StaticPath): Promise<HeavyProps>;
  remove(): void;
}

export function createDevHeavyProps(host: () => RenderHost | null): DevHeavyProps {
  let batches: { batch: InstanceBatch; untrack: (() => void) | null }[] = [];
  let geometry: SphereGeometry | null = null;
  let material: MeshStandardNodeMaterial | null = null;
  const remove = (): void => {
    for (const { batch, untrack } of batches) { untrack?.(); batch.dispose(); }
    geometry?.dispose(); material?.dispose();
    batches = []; geometry = null; material = null;
  };
  return {
    async install(matrices, segments, path) {
      remove();
      const current = host();
      const world = current?.world;
      if (!current || !world) throw new Error("heavy props: no world is drawn");
      geometry = new SphereGeometry(0.5, segments, Math.max(2, Math.floor(segments / 2)));
      material = new MeshStandardNodeMaterial({ color: "#b07a4a", roughness: 0.6 });
      const scene = world.scene;
      const byZone = new Map<string | null, InstanceBatch>();
      const placement = new Matrix4();
      for (let i = 0; i * 16 < matrices.length; i += 1) {
        placement.fromArray(matrices, i * 16);
        const zone = path === "instanced" ? placementZone(world.zones, placement) : null;
        let batch = byZone.get(zone);
        if (!batch) {
          batch = createInstanceBatch({
            name: `heavyProps${zone === null ? "" : `/${zone}`}`, source: "staticMesh", parent: world.root, castShadow: true,
            prepare: (objects, signal) => current.prepare(objects, scene, signal),
            ...(path === "instanced" ? {} : { triangles: current.triangles, staticPath: () => path }),
          });
          batch.setParts([{ geometry, material, local: new Matrix4(), name: "sphere" }]);
          byZone.set(zone, batch);
          batches.push({ batch, untrack: zone !== null && world.zones ? world.zones.track(zone, batch) : null });
        }
        batch.set(`heavy/${i}`, placement, null, "act_00000000000000000000000000000000");
      }
      for (const { batch } of batches) batch.flush();
      const started = performance.now();
      while (!batches.every(({ batch }) => batch.ready)) {
        if (performance.now() - started > 120_000) throw new Error("heavy props: not ready in 120 s");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const index = geometry.index!;
      return { triangles: index.count / 3, instances: batches.reduce((sum, { batch }) => sum + batch.size, 0), path, batches: batches.length };
    },
    remove,
  };
}
