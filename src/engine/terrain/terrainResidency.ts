import { createServiceKey, type ActorId, type Services } from "../../core/index.ts";
import { StaticCollisionSourceKey } from "../physics/physicsService.ts";
import type { StreamingSource } from "../world/streamingPolicy.ts";
import { TerrainRuntimeStreaming, type TerrainColliderTile } from "./terrainRuntimeStreaming.ts";
import type { WorldTerrainDocument } from "./terrainLoader.ts";
import type { TerrainTileData } from "./terrainTypes.ts";
import { terrainTileHeightfield, worldTerrainColliderEntityId } from "./worldTerrainActor.ts";
import { TerrainSurfaceSampler, worldTerrainSurfaceSource } from "./terrainSurface.ts";

/** The active pawn or controlled vehicle can set physics residency independently of the view. */
export const TerrainPhysicsFocusKey = createServiceKey<{
  sources(): readonly StreamingSource[] | null;
}>("forge.terrain.physicsFocus");

export type HeadlessTerrainSource = (asset: string) => Promise<WorldTerrainDocument>;

interface TerrainPlacement {
  readonly actor: ActorId;
  readonly component: string;
  readonly document: WorldTerrainDocument;
  readonly fetch?: (tile: string, signal: AbortSignal) => Promise<TerrainTileData>;
  readonly changed?: (tile: string) => void;
  readonly disposeReader?: () => void;
  readonly clock?: () => number;
  readonly warn?: (message: string) => void;
}

export interface TerrainResidencyHandle {
  readonly stream: TerrainRuntimeStreaming | null;
  update(viewSources: readonly StreamingSource[], kept: readonly string[]): void;
  dispose(): void;
}

export const TerrainResidencyKey = createServiceKey<ReturnType<typeof createTerrainResidency>>("forge.terrain.residency");

export function createTerrainResidency(services: Services) {
  const placements = new Map<string, TerrainResidencyHandle>();
  const colliderIds = new Map<string, ReadonlySet<string>>();
  const samplers = new Map<string, TerrainSurfaceSampler>();
  const documents = new Map<string, WorldTerrainDocument>();
  let generation = 0;
  const name = (actor: ActorId, component: string) => `${actor}/${component}`;
  return {
    place(input: TerrainPlacement): TerrainResidencyHandle {
      const key = name(input.actor, input.component);
      placements.get(key)?.dispose();
      const physics = services.get(StaticCollisionSourceKey);
      const ids = new Set<string>();
      colliderIds.set(key, ids);
      const surface = worldTerrainSurfaceSource(input.document);
      const sampler = surface ? new TerrainSurfaceSampler(surface) : null;
      const add = (id: string, { translation, primitive }: Omit<TerrainColliderTile, "id">) => {
        physics?.add(id, input.actor, input.component, translation, primitive);
        if (physics) ids.add(id);
        if (physics && sampler) samplers.set(id, sampler);
      };
      const remove = (removed: readonly string[]) => {
        if (removed.length > 0) physics?.remove(removed);
        for (const id of removed) {
          ids.delete(id);
          samplers.delete(id);
        }
      };
      const { document } = input;
      documents.set(key, document);
      generation += 1;
      const collision = physics !== undefined && document.def.collision;
      const stream = input.fetch ? new TerrainRuntimeStreaming(document, {
        id: key, name: document.def.name, collision,
      }, {
        fetch: input.fetch,
        changed(tile) {
          generation += 1;
          input.changed?.(tile);
        },
        addColliders: (tiles) => { for (const tile of tiles) add(tile.id, tile); },
        removeColliders: remove,
        clock: input.clock ?? (() => performance.now()),
        warn: input.warn ?? ((message) => console.warn(message)),
      }) : null;
      if (!stream && collision) {
        for (const [tileKey, tile] of document.tiles) {
          add(worldTerrainColliderEntityId(key, tileKey), terrainTileHeightfield(document.def, tile));
        }
      }
      let disposed = false;
      const handle: TerrainResidencyHandle = {
        stream,
        update(viewSources, kept) {
          if (disposed) return;
          const focus = services.get(TerrainPhysicsFocusKey)?.sources();
          stream?.update(viewSources, 1, kept, focus ?? viewSources);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          stream?.dispose();
          input.disposeReader?.();
          remove([...ids]);
          placements.delete(key);
          colliderIds.delete(key);
          documents.delete(key);
          generation += 1;
        },
      };
      placements.set(key, handle);
      return handle;
    },
    available(position: readonly [number, number], radius: number): boolean {
      return [...placements.values()].every(({ stream }) => stream?.canOccupy(position, radius) ?? true);
    },
    has(actor: ActorId, component: string): boolean {
      return placements.has(name(actor, component));
    },
    colliderCount(actor: ActorId, component: string): number {
      return colliderIds.get(name(actor, component))?.size ?? 0;
    },
    height(actor: ActorId, component: string, x: number, z: number): number | null {
      const ids = colliderIds.get(name(actor, component));
      if (!ids?.size) return null;
      const physics = services.get(StaticCollisionSourceKey);
      return physics?.ray({ origin: [x, 20000, z], direction: [0, -1, 0], distance: 40000 }, (id) => ids.has(id))?.point[1] ?? null;
    },
    removeActor(actor: ActorId): void {
      for (const [id, handle] of placements) if (id.startsWith(`${actor}/`)) handle.dispose();
    },
    samplerFor(id: string) { return samplers.get(id); },
    revision: () => generation,
    documents: () => documents.values(),
    dispose(): void {
      for (const handle of placements.values()) handle.dispose();
    },
  };
}
