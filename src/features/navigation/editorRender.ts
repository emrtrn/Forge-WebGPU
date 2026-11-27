import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicNodeMaterial, Vector3 } from "three/webgpu";
import type { Vec3, WorldActor } from "../../core/index.ts";
import type { NavAabb } from "../../engine/navigation/navigationTypes.ts";
import { loadRecastModules, type RecastModules } from "../../engine/navigation/recastNavMesh.ts";
import { RecastPlanner } from "../../engine/navigation/recastPlanner.ts";
import { PhysicsSubsystem } from "../../engine/physics/physicsSubsystem.ts";
import { TerrainResidencyKey } from "../../engine/terrain/terrainResidency.ts";
import { defineEditorRenderBinding } from "../../render/editor/editorBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { createBrowserTileBuilder } from "../../runtime/navigation/browserTileBuilder.ts";
import { colliderTypes, previewBodies } from "./editorNavigationSource.ts";
import { NavigationVolume } from "./schema.ts";

export default defineEditorRenderBinding({
  feature: "forge.navigation",
  create(ctx) {
    const root = new Group();
    const wire = new Group();
    root.add(wire);
    ctx.root.add(root);
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicNodeMaterial({ color: "#57b8ff", wireframe: true, transparent: true, depthWrite: false });
    material.opacityNode = ctx.sceneVisibility.mul(0.85);
    const fill = new MeshBasicNodeMaterial({ color: "#48c8df", transparent: true, depthWrite: false });
    fill.opacityNode = ctx.sceneVisibility.mul(0.36);
    const preview = new Mesh(new BufferGeometry(), fill);
    preview.position.y = 0.04;
    root.add(preview);
    const scale = new Matrix4();
    let planner: RecastPlanner | null = null;
    let worker: ReturnType<typeof createBrowserTileBuilder> = null;
    let modules: RecastModules | null = null;
    let loading = false;
    let failed = false;
    let disposed = false;
    let revision = "";
    let tileRevision = -1;
    let refreshAfter = 0;
    let bounds: NavAabb[] = [];
    let simulation: PhysicsSubsystem | null = null;
    let dirty = true;
    const invalidate = () => { dirty = true; };
    const rebuild = (): void => {
      wire.clear();
      bounds = [];
      for (const { actor, key, component } of ctx.world.componentsOf(NavigationVolume.name)) {
        const volume = new Mesh(geometry, material);
        volume.matrixAutoUpdate = false;
        componentWorldMatrix(ctx.world, actor, key, volume.matrix).multiply(scale.makeScale(...component.size as Vec3));
        wire.add(volume);
        const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
        for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
          const point = new Vector3(x, y, z).applyMatrix4(volume.matrix).toArray();
          for (const axis of [0, 1, 2] as const) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
          }
        }
        bounds.push({ min, max });
      }
      if (bounds.length === 0 || !simulation || !planner) return;
      const actors = new Map<WorldActor["id"], WorldActor>();
      for (const type of colliderTypes) for (const { actor } of ctx.world.componentsOf(type)) actors.set(actor.id, actor);
      simulation.clear();
      simulation.addBodies(previewBodies(actors.values(), ctx.world.actor, ctx.modelCollision,
        ctx.world.services.get(TerrainResidencyKey)?.documents() ?? []));
      planner.clear();
    };
    return {
      actorsAdded: invalidate,
      actorsRemoved: invalidate,
      actorsChanged: invalidate,
      sync() {
        root.visible = ctx.show?.("navigation") === true;
        if (!root.visible) return;
        if (dirty) {
          rebuild();
          dirty = false;
        }
        if (!modules && !loading && !failed && bounds.length > 0) {
          loading = true;
          void loadRecastModules().then((value) => {
            if (disposed) return;
            modules = value;
            simulation = new PhysicsSubsystem();
            try { worker = createBrowserTileBuilder(); } catch { worker = null; }
            const source = simulation;
            planner = new RecastPlanner(modules, {
              forEachTriangleInRect: (...args) => source.forEachNavigationTriangleInRect(...args),
              forEachObstacleInRect: (...args) => source.forEachNavigationObstacleInRect(...args),
            }, worker ? { tileWorker: worker, maxSyncBuilds: 0 } : {});
            dirty = true;
          }).catch((error: unknown) => {
            failed = true;
            console.warn("forge navigation: preview unavailable", error);
          }).finally(() => { loading = false; });
        }
        preview.visible = bounds.length > 0;
        if (!planner || bounds.length === 0) return;
        const clock = performance.now();
        const terrain = ctx.world.services.get(TerrainResidencyKey)?.revision() ?? 0;
        if (terrain !== tileRevision && clock >= refreshAfter) {
          tileRevision = terrain;
          refreshAfter = clock + 250;
          rebuild();
        }
        planner.update({ now: clock / 1000, bounds, invokers: bounds.map(({ min, max }) => ({
          position: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
          agent: { radius: 0.32, height: 1.8 },
        })) });
        const next = planner.debugRevision();
        if (revision === next) return;
        revision = next;
        const merged = new BufferGeometry();
        const positions: number[] = [], indices: number[] = [];
        for (const view of planner.debugMeshes()) {
          const data = view.geometry();
          const start = positions.length / 3;
          for (const position of data.positions) positions.push(position);
          for (const index of data.indices) indices.push(index + start);
        }
        merged.setAttribute("position", new Float32BufferAttribute(positions, 3));
        merged.setIndex(indices);
        preview.geometry.dispose();
        preview.geometry = merged;
      },
      dispose() {
        disposed = true;
        planner?.dispose(); worker?.dispose(); simulation?.dispose();
        root.clear(); root.removeFromParent(); geometry.dispose(); material.dispose();
        preview.geometry.dispose(); fill.dispose();
      },
    };
  },
});
