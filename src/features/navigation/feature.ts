import { defineFeature, defineSubsystem, type Vec3 } from "../../core/index.ts";
import { transformPoint } from "../../engine/math/affine.ts";
import { actorMatrix, componentMatrix } from "../../engine/world/worldMatrices.ts";
import { NavigationServiceKey } from "../../engine/navigation/worldNavigation.ts";
import { loadRecastModules } from "../../engine/navigation/recastNavMesh.ts";
import { RecastPlanner } from "../../engine/navigation/recastPlanner.ts";
import { PhysicsRuntimeKey } from "../../engine/physics/physicsService.ts";
import { createBrowserTileBuilder } from "../../runtime/navigation/browserTileBuilder.ts";
import { NavigationVolume } from "./schema.ts";

export default defineFeature({
  id: "forge.navigation",
  components: [NavigationVolume],
  subsystems: [defineSubsystem({
    id: "forge.navigation",
    tickGroups: ["postPhysics"],
    create(world) {
      let planner: RecastPlanner | null = null;
      let worker: ReturnType<typeof createBrowserTileBuilder> = null;
      let startup: Promise<boolean> | null = null;
      let disposed = false;
      let failed = false;
      let now = 0;
      const bounds = () => world.componentsOf(NavigationVolume.name).map(({ actor, key, component }) => {
        const size = component.size as Vec3;
        const matrix = componentMatrix(actor, key, actorMatrix(actor, world.actor));
        const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
        for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
          const point = transformPoint(matrix, [size[0] * x, size[1] * y, size[2] * z]);
          for (const axis of [0, 1, 2] as const) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
          }
        }
        return { min, max };
      });
      const invalidate = () => {
        if (!planner) return;
        const dirty = world.services.get(PhysicsRuntimeKey)?.physics.takeNavigationDirtyRegions();
        if (dirty === "all") planner.invalidateAll();
        else for (const rect of dirty ?? []) planner.invalidateRect(rect.minX, rect.minZ, rect.maxX, rect.maxZ);
      };
      const ready = () => {
        if (startup) return startup;
        const physics = world.services.get(PhysicsRuntimeKey)?.physics;
        if (!physics || disposed) return Promise.resolve(false);
        startup = loadRecastModules().then((modules) => {
          if (disposed) return false;
          try { worker = createBrowserTileBuilder(); }
          catch (error) { console.warn("forge navigation: worker unavailable", error); }
          planner = new RecastPlanner(modules, {
            forEachTriangleInRect: (...args) => physics.forEachNavigationTriangleInRect(...args),
            forEachObstacleInRect: (...args) => physics.forEachNavigationObstacleInRect(...args),
          }, worker ? { tileWorker: worker, maxSyncBuilds: 0 } : {});
          return true;
        }).catch((error: unknown) => {
          failed = true;
          console.warn("forge navigation: Recast could not start", error);
          return false;
        });
        return startup;
      };
      world.services.provide(NavigationServiceKey, {
        ready,
        path(start, goal, agent) {
          if (!planner) {
            if (failed || !world.services.get(PhysicsRuntimeKey)) return { status: "failure", points: [], visited: 0 };
            void ready();
            return { status: "pending", points: [], visited: 0 };
          }
          invalidate();
          return planner.findPath({ start, goal, agent, bounds: bounds() });
        },
      });
      return {
        tick(_group, dt) {
          now += dt;
          invalidate();
          planner?.update({ invokers: [], bounds: bounds(), now });
        },
        dispose() { disposed = true; planner?.dispose(); worker?.dispose(); },
      };
    },
  })],
});
