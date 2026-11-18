// Zone drawing (plan 5c R9b Z3): a world's zones and portals, and which of
// its static batches draw this frame.
//
// The world's render subsystem refreshes the zone set from the level's
// `forge.zone` / `forge.portal` components before its bindings see an edit, so
// a static binding keys its placements by the zone they fall in (`zoneOf`,
// the placement's origin) and re-keys them when the set changes (`onChange`).
// Each zoned batch registers here (`track`); once a frame, before the GPU cull,
// the host calls `update` with the camera: the visible zones come from the
// portal walk (`engine/world/zones.ts`) and every batch gets its mode:
// visible, shadow only (hidden, `alwaysCastShadows`) or hidden. Content in no
// zone is never tracked and always draws. Visibility only: nothing unloads.
//
// GPU-driven batches are not split (user decision 2026-11-18, after the Z6
// measurement: a batch per zone multiplied dispatches and draws): each
// instance carries its zone's slot (`slotOf`, written by `triangleDrawing.ts`
// when `revision` changes) and the cull reads this frame's masks (`masks`:
// the visible zones for the main view, those plus the always-casting ones for
// shadow views; `gpuDriven.setZoneMasks`).
//
// The component names are strings here: the render layer never imports a
// feature (the schemas live in `features/zone/schema.ts`).

import { Matrix4, Quaternion, Vector3, type Camera } from "three/webgpu";
import type { ActorId, WorldActor } from "../../core/index.ts";
import { buildZoneSet, visibleZones, zoneAt, type PortalInput, type VisibleZones, type ZoneInput, type ZoneSet, type ZoneVec3 } from "../../engine/world/zones.ts";
import { MAX_ZONE_SLOTS, ZONE_MASK_WORDS, type ZoneMode } from "../gpu/gpuDrivenBatch.ts";
import type { RenderWorldView } from "./renderBinding.ts";
import { componentWorldMatrix } from "./transforms.ts";

export const ZONE_COMPONENT = "forge.zone";
export const PORTAL_COMPONENT = "forge.portal";

/** What a zoned batch exposes (an `InstanceBatch`). */
export interface ZoneTarget {
  readonly zoneMode: ZoneMode;
  setZoneMode(mode: ZoneMode): void;
}

export interface ZoneDrawingStats {
  readonly zones: number;
  readonly portals: number;
  readonly cameraZone: string | null;
  /** Visible zones; equal to `zones` when everything shows. */
  readonly visible: number;
  readonly tracked: number;
  readonly shadowOnly: number;
  readonly hidden: number;
}

export interface ZoneDrawing {
  /** Zone id (its actor) holding a world point, null in none. */
  zoneOf(point: ZoneVec3): string | null;
  /** The zone slot (GPU masks) holding a world point; 0 in none. */
  slotOf(point: ZoneVec3): number;
  /** Bumps when the zone set changes (slots are reassigned). */
  readonly revision: number;
  /** This frame's masks for the GPU-driven cull; null: every zone draws. */
  readonly masks: { readonly main: Uint32Array; readonly shadow: Uint32Array } | null;
  /** Called after the zone set changed; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** A batch of zone `zone`'s content; returns the untrack. */
  track(zone: string, target: ZoneTarget): () => void;
  /** Rebuilds the set when `actors` (added, removed or edited, before and after) touch a zone or portal. */
  refresh(actors: readonly WorldActor[]): void;
  /** Once a frame, before the cull: every tracked batch's mode for this camera. */
  update(camera: Camera | null): void;
  readonly last: VisibleZones | null;
  stats(): ZoneDrawingStats;
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const viewProjection = new Matrix4();

const hasZoneParts = (actor: WorldActor): boolean =>
  Object.values(actor.components).some((component) => component.type.startsWith(`${ZONE_COMPONENT}@`) || component.type.startsWith(`${PORTAL_COMPONENT}@`));

const tuple = (vector: Vector3): ZoneVec3 => [vector.x, vector.y, vector.z];
const quat = (q: Quaternion): readonly [number, number, number, number] => [q.x, q.y, q.z, q.w];

export function createZoneDrawing(world: RenderWorldView): ZoneDrawing {
  let set: ZoneSet | null = null;
  /** Zones whose content casts while hidden. */
  let alwaysCast = new Set<string>();
  const listeners = new Set<() => void>();
  const targets = new Map<ZoneTarget, string>();
  let last: VisibleZones | null = null;
  let revision = 0;
  /** Zone id -> slot (1 … MAX_ZONE_SLOTS - 1; zones past it stay slot 0, always drawn). */
  let slots = new Map<string, number>();
  const main = new Uint32Array(ZONE_MASK_WORDS), shadow = new Uint32Array(ZONE_MASK_WORDS);
  let masks: { main: Uint32Array; shadow: Uint32Array } | null = null;
  const setBit = (words: Uint32Array, slot: number): void => { words[slot >>> 5] = (words[slot >>> 5]! | (1 << (slot & 31))) >>> 0; };

  const rebuild = (): void => {
    const zones: ZoneInput[] = [];
    const portals: PortalInput[] = [];
    const casting = new Set<string>();
    const seen = new Set<ActorId>();
    for (const entry of world.componentsOf(ZONE_COMPONENT)) {
      // One zone per actor: its id is the actor's (portals pin zones by actor).
      if (seen.has(entry.actor.id)) continue;
      seen.add(entry.actor.id);
      const data = entry.component as unknown as { size: [number, number, number]; alwaysCastShadows: boolean };
      componentWorldMatrix(world, entry.actor, entry.key, matrix).decompose(position, rotation, scale);
      zones.push({
        id: entry.actor.id, center: tuple(position), rotation: quat(rotation),
        halfExtents: [Math.abs(data.size[0] * scale.x) / 2, Math.abs(data.size[1] * scale.y) / 2, Math.abs(data.size[2] * scale.z) / 2],
      });
      if (data.alwaysCastShadows) casting.add(entry.actor.id);
    }
    for (const entry of world.componentsOf(PORTAL_COMPONENT)) {
      const data = entry.component as unknown as { size: [number, number]; zoneA: string | null; zoneB: string | null };
      componentWorldMatrix(world, entry.actor, entry.key, matrix).decompose(position, rotation, scale);
      portals.push({
        id: `${entry.actor.id}/${entry.key}`, center: tuple(position), rotation: quat(rotation),
        halfSize: [Math.abs(data.size[0] * scale.x) / 2, Math.abs(data.size[1] * scale.y) / 2],
        zoneA: data.zoneA, zoneB: data.zoneB,
      });
    }
    set = zones.length > 0 ? buildZoneSet(zones, portals) : null;
    alwaysCast = casting;
    slots = new Map((set?.zones ?? []).slice(0, MAX_ZONE_SLOTS - 1).map((zone, index) => [zone.id, index + 1]));
    revision += 1;
    for (const listener of [...listeners]) listener();
  };

  return {
    zoneOf(point) {
      return set ? zoneAt(set, point) : null;
    },
    slotOf(point) {
      const zone = set ? zoneAt(set, point) : null;
      return zone === null ? 0 : slots.get(zone) ?? 0;
    },
    get revision() { return revision; },
    get masks() { return masks; },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    track(zone, target) {
      targets.set(target, zone);
      return () => { targets.delete(target); };
    },
    refresh(actors) {
      if (actors.some(hasZoneParts)) rebuild();
    },
    update(camera) {
      let visible: ReadonlySet<string> | null = null;
      if (set && camera) {
        camera.updateMatrixWorld();
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        camera.getWorldPosition(position);
        last = visibleZones(set, { position: tuple(position), viewProjection: viewProjection.elements });
        visible = last.zones;
      } else last = null;
      if (visible === null) masks = null;
      else {
        main.fill(0); shadow.fill(0);
        setBit(main, 0); setBit(shadow, 0);
        for (const [zone, slot] of slots) {
          if (visible.has(zone)) { setBit(main, slot); setBit(shadow, slot); } else if (alwaysCast.has(zone)) setBit(shadow, slot);
        }
        masks = { main, shadow };
      }
      for (const [target, zone] of targets) {
        const mode: ZoneMode = visible === null || visible.has(zone) ? "visible" : alwaysCast.has(zone) ? "shadow" : "hidden";
        if (target.zoneMode !== mode) target.setZoneMode(mode);
      }
    },
    get last() { return last; },
    stats() {
      let shadowOnly = 0, hidden = 0;
      for (const target of targets.keys()) {
        if (target.zoneMode === "shadow") shadowOnly += 1;
        else if (target.zoneMode === "hidden") hidden += 1;
      }
      const zones = set?.zones.length ?? 0;
      return {
        zones, portals: set?.links.length ?? 0, cameraZone: last?.cameraZone ?? null,
        visible: last?.zones ? last.zones.size : zones, tracked: targets.size, shadowOnly, hidden,
      };
    },
  };
}
