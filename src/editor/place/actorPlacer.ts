// Placing actors from the Add Actor menu (INV-A11, plan phase 4 step 5d;
// Forge WebGL EditorUi.ts `buildAddActorEntries` and SceneApp.ts
// `computeInstanceDropTransform`, `computeLightDropPosition`,
// `defaultActorPosition`, the asset drag preview @ forge-webgl-final).
// Three-free and DOM-free: the viewport answers rays, the menu (DOM) calls in.
//
// - Entries: the features' (`defineFeatureEditor({ addActor })`), Empty
//   Actor, and every actor class of the project (user decision 2026-11-14,
//   category Classes).
// - Where a new actor goes (Forge): the surface under the pointer (what the
//   level draws, else the ground plane y = 0), x / z on the move snap; a
//   light 1,5 m above it, a mesh with its base on it. A click places at the
//   middle of the viewport the same way.
// - An entry whose component is one per level (a singleton) is clicked only;
//   when the level has one already, that actor is selected instead.
// - Dragging over the viewport shows the actor in the world (not in the
//   level) under the pointer; the drop is one transaction and selects it.
// - A Content Browser asset with a feature's `place` rule (step 6f) is placed
//   the same way, under the key the browser gives it (`assetEntry`); it is in
//   no menu.

import {
  createId,
  parseComponentTypeTag,
  type ActorClassDoc,
  type ActorDoc,
  type ActorId,
  type ClassResolver,
  type ComponentMap,
  type SchemaRegistry,
  type Vec3,
} from "../../core/index.ts";
import type { Box } from "../../engine/gizmo/surfaceSnap.ts";
import { snapValue, type SnapSettings } from "../../engine/gizmo/snap.ts";
import type { Ray } from "../../engine/gizmo/transformDrag.ts";
import { newActorDoc } from "../../engine/edit/newActor.ts";
import type { EditorCatalog } from "../host/editorCatalog.ts";
import type { AddActorEntry } from "../host/featureEditor.ts";
import type { EditorSession } from "../session/editorSession.ts";

export const CLASSES_CATEGORY = "Classes";
export const EMPTY_ACTOR: AddActorEntry = { key: "forge.emptyActor", label: "Empty Actor", category: "Gameplay", icon: "gameplay", components: {} };
/** How far ahead a ray that meets nothing puts the actor (metres). */
export const MISS_DISTANCE = 10;
const FAR = 10_000;

/** What the placer asks of the viewport (three-free). */
export interface PlacerViewport {
  pointerRay(clientX: number, clientY: number): Ray | null;
  raycast(origin: Vec3, direction: Vec3, far: number, exclude: ReadonlySet<ActorId>): { readonly distance: number; readonly point: Vec3 } | null;
  localBox(actor: ActorId): Box | null;
  /** The middle of the viewport in page pixels. */
  centre(): { readonly x: number; readonly y: number };
  /** After the next drawn frame (what an actor draws is measured from then on). */
  nextFrame(): Promise<void>;
}

/** The point a ray places at: its hit, else where it meets the ground plane ahead, else `MISS_DISTANCE` along it. */
export function surfacePoint(ray: Ray, hit: { readonly point: Vec3 } | null): Vec3 {
  if (hit) return [...hit.point];
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0) return [ox + dx * t, 0, oz + dz * t];
  }
  return [ox + dx * MISS_DISTANCE, oy + dy * MISS_DISTANCE, oz + dz * MISS_DISTANCE];
}

const round = (value: number): number => Number(value.toFixed(3));

/** Forge's drop position: x / z on the move snap, y lifted (lights) or the base on the surface (`baseY`: the actor's lowest point under its origin). */
export function dropPosition(point: Vec3, entry: AddActorEntry, snap: SnapSettings, baseY: number | null): Vec3 {
  const lift = entry.lift ?? 0;
  const base = entry.restOnSurface && baseY !== null ? baseY : 0;
  return [snapValue(point[0], snap.move, snap.moveEnabled), round(point[1] + lift - base), snapValue(point[2], snap.move, snap.moveEnabled)];
}

export interface PlacerEntry extends AddActorEntry {
  /** The class it places (Classes). */
  readonly classId?: ActorClassDoc["id"];
  /** One per level: clicked only (Forge). */
  readonly singleton: boolean;
}

export interface ActorPlacer {
  entries(): readonly PlacerEntry[];
  /** A click: at the middle of the viewport, or the existing one of a singleton selected. */
  click(key: string): Promise<ActorId | null>;
  /** The drag over the viewport (the preview follows); false when this entry is not dragged. */
  dragOver(key: string, clientX: number, clientY: number): boolean;
  /** The pointer left the viewport: the preview hides. */
  dragLeave(): void;
  drop(key: string, clientX: number, clientY: number): ActorId | null;
  /** The drag ended (dropped or not): the preview goes. */
  endDrag(): void;
}

export interface ActorPlacerOptions {
  readonly editor: EditorSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly classes: () => readonly ActorClassDoc[];
  readonly catalog: EditorCatalog;
  readonly viewport: PlacerViewport;
  readonly snap: () => SnapSettings;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  readonly newId?: () => ActorId;
  /** An entry no menu lists (a dragged Content Browser asset, step 6f); undefined when the key is not one. */
  readonly assetEntry?: (key: string) => PlacerEntry | undefined;
}

export function createActorPlacer(options: ActorPlacerOptions): ActorPlacer {
  const { editor, registry, resolveClass, viewport, status } = options;
  const normalizeOptions = { strict: true, registry, resolveClass };

  const singletonIn = (components: Readonly<Record<string, { readonly type: string }>>): string | null => {
    for (const component of Object.values(components)) {
      const name = parseComponentTypeTag(component.type)?.name;
      if (name !== undefined && registry.getComponent(name)?.singleton) return name;
    }
    return null;
  };

  const entries = (): PlacerEntry[] => {
    const list: PlacerEntry[] = [];
    for (const editorDef of options.catalog.editors) {
      for (const entry of editorDef.addActor) list.push({ ...entry, singleton: singletonIn(entry.components) !== null });
    }
    list.push({ ...EMPTY_ACTOR, singleton: false });
    for (const cls of [...options.classes()].sort((a, b) => a.name.localeCompare(b.name))) {
      const look = options.catalog.present(cls.components, false);
      list.push({ key: `class:${cls.id}`, label: cls.name, category: CLASSES_CATEGORY, icon: look.icon, components: {}, classId: cls.id, singleton: singletonIn(cls.components) !== null });
    }
    return list;
  };
  const entryOf = (key: string): PlacerEntry | undefined => entries().find((entry) => entry.key === key) ?? options.assetEntry?.(key);

  /** The level's actor carrying the singleton component `name`, if any. */
  const holderOf = (name: string): ActorDoc | undefined =>
    editor.level.level.actors.find((actor) => {
      const components: ComponentMap = actor.class === null ? actor.components : (resolveClass(actor.class)?.components ?? {});
      return Object.values(components).some((component) => parseComponentTypeTag(component.type)?.name === name);
    });

  /** The new actor's stored form, normalised (the world takes it as it is). */
  const build = (entry: PlacerEntry, id: ActorId, position: Vec3): ActorDoc | null => {
    const result = newActorDoc(
      {
        id,
        label: entry.label,
        ...(entry.classId ? { classId: entry.classId } : { components: entry.components }),
        position,
        rotation: entry.rotation ?? [0, 0, 0],
      },
      editor.level.level.actors,
      normalizeOptions,
    );
    if (!result.ok) {
      status(`${entry.label} cannot be placed: ${result.issues.map((issue) => issue.message).join("; ")}`, "error");
      return null;
    }
    return result.doc;
  };

  // The drag preview: an actor in the world only, under the pointer.
  let preview: { key: string; doc: ActorDoc; baseY: number | null; shown: boolean } | null = null;
  const exclude = (): ReadonlySet<ActorId> => new Set(preview ? [preview.doc.id] : []);
  const pointAt = (clientX: number, clientY: number): Vec3 | null => {
    const ray = viewport.pointerRay(clientX, clientY);
    if (!ray) return null;
    return surfacePoint(ray, viewport.raycast(ray.origin, ray.direction, FAR, exclude()));
  };
  const baseOf = (id: ActorId): number | null => viewport.localBox(id)?.min[1] ?? null;
  const hidePreview = (): void => {
    if (preview?.shown) editor.world.removeActors([preview.doc.id]);
    if (preview) preview.shown = false;
  };

  const place = (entry: PlacerEntry, position: Vec3, baseY: number | null): ActorId | null => {
    const id = options.newId?.() ?? createId("actor");
    const doc = build(entry, id, dropPosition(position, entry, options.snap(), baseY));
    if (!doc) return null;
    const result = editor.edit(`Add ${doc.name}`, (tx) => tx.setActor(doc));
    if (!result.ok) {
      status(result.issues.map((issue) => issue.message).join("; "), "error");
      return null;
    }
    editor.selection.set([id]);
    status(`Added ${doc.name}`);
    return id;
  };

  return {
    entries,
    async click(key) {
      const entry = entryOf(key);
      if (!entry) return null;
      const single = entry.classId ? singletonIn(resolveClass(entry.classId)?.components ?? {}) : singletonIn(entry.components);
      if (single !== null) {
        const holder = holderOf(single);
        if (holder) {
          editor.selection.set([holder.id]);
          status(`The level already has a ${entry.label}; selected it.`, "warning");
          return holder.id;
        }
      }
      const centre = viewport.centre();
      const point = pointAt(centre.x, centre.y);
      if (!point) return null;
      // A mesh's base is known once it is drawn: measure it in the world for a frame, then place in one step.
      let baseY: number | null = null;
      if (entry.restOnSurface) {
        const probe = build(entry, createId("actor"), point);
        if (probe) {
          editor.world.addActors([probe], "level");
          await viewport.nextFrame();
          baseY = baseOf(probe.id);
          editor.world.removeActors([probe.id]);
        }
      }
      const id = place(entry, point, baseY);
      return id;
    },
    dragOver(key, clientX, clientY) {
      const entry = entryOf(key);
      if (!entry || entry.singleton) return false;
      const point = pointAt(clientX, clientY);
      if (!point) {
        hidePreview();
        return true;
      }
      if (!preview || preview.key !== key) {
        hidePreview();
        const doc = build(entry, createId("actor"), point);
        if (!doc) return false;
        preview = { key, doc, baseY: null, shown: false };
      }
      // Measured once it has been drawn (a frame after it went in).
      if (preview.shown && preview.baseY === null) preview.baseY = baseOf(preview.doc.id);
      const transform = { ...preview.doc.transform, p: dropPosition(point, entry, options.snap(), preview.baseY) };
      preview.doc = { ...preview.doc, transform };
      if (!preview.shown) {
        editor.world.addActors([preview.doc], "level");
        preview.shown = true;
      } else {
        editor.world.updateActors([preview.doc]);
      }
      return true;
    },
    dragLeave: hidePreview,
    drop(key, clientX, clientY) {
      const entry = entryOf(key);
      const baseY = preview?.key === key ? preview.baseY : null;
      hidePreview();
      preview = null;
      if (!entry || entry.singleton) return null;
      const point = pointAt(clientX, clientY);
      return point ? place(entry, point, baseY) : null;
    },
    endDrag() {
      hidePreview();
      preview = null;
    },
  };
}
