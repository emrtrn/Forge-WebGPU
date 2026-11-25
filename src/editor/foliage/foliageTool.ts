// The Foliage tools in the viewport (plan 5d step 6, INV-B09; Forge WebGL
// SceneApp @ forge-webgl-final: beginFoliageStroke, applyFoliagePaint / Single /
// Fill / Erase, the select / lasso tools and the selection's actions). User
// decisions 2026-11-25: a tool takes the left button only while it is on (the
// Foliage tab's buttons; the same button, Escape or leaving the tab turns it
// off); instances keep no target, the surface filters hold while painting.
//
// - Paint scatters the active type under the brush, one dab per brush radius of
//   travel (Shift erases every type); Erase takes every type, Remove the active
//   one; Single places one; Fill scatters over the clicked actor (a terrain is
//   loaded whole, at most 20.000 samples). Every sample is the topmost surface
//   there: it counts when it is the kind the press was on (a terrain, a static
//   mesh or shape) and the filters allow it; an unloaded terrain tile has none.
// - A stroke is one undo step. Its dabs run in order and wait for the foliage
//   cells and terrain tiles under them; the press that started it owns the
//   pointer until it is released.
// - Select picks an instance by its model's box (nothing solid in front);
//   Lasso adds those under the brush, Ctrl takes them out. The actions work on
//   the selection: Remove, Reattach (onto the ground below), Reapply (the
//   type's settings now; the active type when nothing is selected), Select
//   Invalid (Forge's rules, the whole level).

import { parseComponentTypeTag, type ActorId, type AssetId, type Vec3, type WorldActor } from "../../core/index.ts";
import { foliageBrushSamples, foliageFillSamplePoints, foliageFillSpacing, foliageInRadius, foliageInvalid, placeFoliage, reapplyPaintedInstance, reattachPaintedInstance, type FoliagePaintType, type PaintedFoliageInstance } from "../../engine/foliage/foliagePaint.ts";
import { mergeFoliagePatches, type FoliagePatch, type FoliageRect } from "../../engine/foliage/foliagePaintSession.ts";
import { makeFoliageRng, type FoliageSurfaceHit } from "../../engine/foliage/foliageRoll.ts";
import type { Ray } from "../../engine/gizmo/transformDrag.ts";
import { composeMat4, invertMat4, transformPoint } from "../../engine/math/affine.ts";
import { worldTerrainExtent } from "../../engine/terrain/worldTerrainActor.ts";
import { terrainBrushTileKeys } from "../../engine/terrain/terrainEditorStreaming.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import { terrainHeightAt } from "../../engine/terrain/terrainHeightQuery.ts";
import type { FoliageCage } from "../../render/editor/foliageSelection.ts";
import type { SurfaceProbe } from "../../render/editor/surfaceProbe.ts";
import { holdWholeTerrain } from "../landscape/landscapeSteps.ts";
import type { FoliageEdits } from "./foliageEdits.ts";

export const FOLIAGE_TOOLS = ["select", "lasso", "paint", "erase", "single", "fill", "remove"] as const;
export type FoliageTool = (typeof FOLIAGE_TOOLS)[number];

export interface FoliageToolSettings {
  /** Null: no tool, the viewport selects actors. */
  readonly tool: FoliageTool | null;
  readonly brushSize: number;
  readonly paintDensity: number;
  readonly randomSeed: number;
  readonly landscape: boolean;
  readonly staticMesh: boolean;
}

/** Forge's defaults (SceneApp.foliageToolSettings); no tool until one is picked. */
export const DEFAULT_FOLIAGE_SETTINGS: FoliageToolSettings = { tool: null, brushSize: 4, paintDensity: 0.5, randomSeed: 1, landscape: true, staticMesh: true };

/** A Foliage Type as painting needs it. */
export interface FoliageTypeInfo {
  readonly params: FoliagePaintType;
  /** Its model's box (model space), for picking and the cages; null when unknown. */
  readonly box: { readonly min: Vec3; readonly max: Vec3 } | null;
}

export interface FoliageToolViewport {
  pointerRay(clientX: number, clientY: number): Ray | null;
  raycast(origin: Vec3, direction: Vec3, far: number, exclude: ReadonlySet<ActorId>): { readonly distance: number; readonly point: Vec3; readonly actor: ActorId; readonly normal: Vec3 | null } | null;
  surfaceProbe(rect: FoliageRect): SurfaceProbe;
  worldBox(actors: readonly ActorId[]): { readonly min: Vec3; readonly max: Vec3 } | null;
  setBrushCursor(points: readonly Vec3[] | null): void;
  setFoliageSelection(cages: readonly FoliageCage[]): void;
}

export interface FoliageToolOptions {
  readonly edits: FoliageEdits;
  readonly editing: TerrainEditing;
  readonly viewport: FoliageToolViewport;
  readonly actor: (id: ActorId) => WorldActor | undefined;
  /** The type the panel has selected; null for none. */
  readonly activeType: () => AssetId | null;
  /** A type's fields now (the panel's draft for the selected one); null when it cannot be read. */
  readonly typeInfo: (type: AssetId) => Promise<FoliageTypeInfo | null>;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

export interface FoliageToolPointer {
  readonly pointerId: number;
  readonly button: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly clientX: number;
  readonly clientY: number;
}

export interface FoliageTools {
  readonly settings: FoliageToolSettings;
  update(patch: Partial<FoliageToolSettings>): void;
  readonly active: boolean;
  pointerDown(event: FoliageToolPointer): boolean;
  /** True while a tool is on (it owns the hover and the drag). */
  pointerMove(event: FoliageToolPointer): boolean;
  pointerUp(event: FoliageToolPointer): boolean;
  cancel(): void;
  /** The pointer left, the tool went: no ring. */
  leave(): void;
  selectionSize(): number;
  deselect(): void;
  removeSelected(): void;
  reattach(): Promise<void>;
  reapply(): Promise<void>;
  selectInvalid(): Promise<void>;
  /** A stroke or an action is running. */
  readonly busy: boolean;
  /** Settings, selection or busy changed; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Settles when the running stroke or action is done (tests). */
  idle(): Promise<void>;
}

type SurfaceKind = "landscape" | "staticMesh";
interface Surface { readonly kind: SurfaceKind; readonly actor: ActorId; readonly point: Vec3; readonly normal: Vec3 }

const RING_POINTS = 64;
const RING_LIFT = 0.05;
const FAR = 1e5;
const NOTHING: ReadonlySet<ActorId> = new Set();
/** Forge's dab seed mix; the dab number varies the pattern of a stroke. */
const SEED_MIX = 2654435761;

export function createFoliageTools(options: FoliageToolOptions): FoliageTools {
  const { edits, editing, viewport, status } = options;
  let settings = DEFAULT_FOLIAGE_SETTINGS;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  let stroke: { readonly pointerId: number; readonly tool: FoliageTool; readonly kind: SurfaceKind | null; readonly patches: FoliagePatch[]; lastDab: Vec3 | null; readonly held: Map<EditableTerrain, Set<string>> } | null = null;
  let dabs = 0;
  let running = 0;
  let queue: Promise<void> = Promise.resolve();
  /** The selected instances with their types. */
  let selection = new Map<PaintedFoliageInstance, AssetId>();

  const kindOf = (id: ActorId): SurfaceKind | null => {
    const names = Object.values(options.actor(id)?.components ?? {}).map((component) => parseComponentTypeTag(component.type)?.name);
    if (names.includes("forge.terrain")) return "landscape";
    return names.includes("forge.staticMesh") || names.includes("forge.shape") ? "staticMesh" : null;
  };
  const allowed = (kind: SurfaceKind): boolean => (kind === "landscape" ? settings.landscape : settings.staticMesh);
  /** The surface under the pointer; null off every surface. */
  const under = (event: Pick<FoliageToolPointer, "clientX" | "clientY">): Surface | null => {
    const ray = viewport.pointerRay(event.clientX, event.clientY);
    const hit = ray ? viewport.raycast([...ray.origin] as Vec3, [...ray.direction] as Vec3, FAR, NOTHING) : null;
    const kind = hit ? kindOf(hit.actor) : null;
    return hit && kind ? { kind, actor: hit.actor, point: hit.point, normal: hit.normal ?? [0, 1, 0] } : null;
  };
  const around = (center: Readonly<Vec3>, reach: number): FoliageRect => ({ minX: center[0] - reach, minZ: center[2] - reach, maxX: center[0] + reach, maxZ: center[2] + reach });

  /** Runs after what is running; errors are said. */
  const enqueue = (what: string, work: () => Promise<void> | void): Promise<void> => {
    running += 1;
    notify();
    queue = queue.then(work).catch((error: unknown) => status(`${what}: ${error instanceof Error ? error.message : String(error)}`, "error")).finally(() => {
      running -= 1;
      notify();
    });
    return queue;
  };

  const activeInfo = async (): Promise<{ id: AssetId; info: FoliageTypeInfo } | null> => {
    const id = options.activeType();
    const info = id ? await options.typeInfo(id) : null;
    if (!id || !info) {
      status("Select a Foliage Type first.", "warning");
      return null;
    }
    return { id, info };
  };

  /** Instances of a type in the cells under a rectangle (they are loaded). */
  const existing = (type: AssetId, rect: FoliageRect): PaintedFoliageInstance[] => edits.session.cellsIn(rect).flatMap((key) => [...(edits.session.instances(key).get(type) ?? [])]);

  const samplesAt = (probe: SurfaceProbe, kind: SurfaceKind, points: readonly (readonly [number, number])[], only: ActorId | null = null): (FoliageSurfaceHit | null)[] => points.map(([x, z]) => {
    const found = probe(x, z);
    if (!found || (only !== null && found.actor !== only) || kindOf(found.actor) !== kind) return null;
    return { position: found.point, normal: found.normal };
  });

  /** Keeps the terrain's tiles under a dab loaded until the stroke ends. */
  const holdTiles = async (current: NonNullable<typeof stroke>, actor: ActorId, center: Readonly<Vec3>, reach: number): Promise<void> => {
    const terrain = editing.find(actor);
    if (!terrain) return;
    const held = current.held.get(terrain) ?? new Set<string>();
    current.held.set(terrain, held);
    const fresh = terrainBrushTileKeys(terrain.session.world.def, center[0], center[2], reach).filter((key) => !held.has(key));
    for (const key of fresh) held.add(key);
    if (fresh.length > 0) await terrain.demand(fresh);
  };

  const commit = (patches: FoliagePatch[], into: FoliagePatch[]): void => {
    if (patches.length === 0) return;
    edits.apply(patches);
    into.push(...patches);
  };

  const paintDab = async (current: NonNullable<typeof stroke>, at: Surface): Promise<void> => {
    const active = await activeInfo();
    if (!active) return;
    const { params } = active.info;
    const reach = settings.brushSize;
    await edits.ensure(around(at.point, reach + params.radius));
    if (at.kind === "landscape") await holdTiles(current, at.actor, at.point, reach);
    dabs += 1;
    const brush = { center: at.point, radius: reach, density: settings.paintDensity };
    const rng = makeFoliageRng((Math.imul(settings.randomSeed, SEED_MIX) + dabs) >>> 0);
    const samples = foliageBrushSamples(params, brush, rng);
    const hits = samplesAt(viewport.surfaceProbe(around(at.point, reach)), at.kind, samples);
    const placed = placeFoliage(params, hits, existing(active.id, around(at.point, reach + params.radius)), rng);
    commit(edits.session.adding(active.id, placed), current.patches);
  };

  const singleDab = async (current: NonNullable<typeof stroke>, at: Surface): Promise<void> => {
    const active = await activeInfo();
    if (!active) return;
    const { params } = active.info;
    const rect = around(at.point, params.radius);
    await edits.ensure(rect);
    dabs += 1;
    const rng = makeFoliageRng((settings.randomSeed + dabs) >>> 0);
    commit(edits.session.adding(active.id, placeFoliage(params, [{ position: at.point, normal: at.normal }], existing(active.id, rect), rng)), current.patches);
  };

  const eraseDab = async (current: NonNullable<typeof stroke>, center: Vec3, only: AssetId | null): Promise<void> => {
    const rect = around(center, settings.brushSize);
    await edits.ensure(rect);
    const { session } = edits;
    const byType = new Map<AssetId, Set<PaintedFoliageInstance>>();
    for (const key of session.cellsIn(rect)) {
      for (const [type, list] of session.instances(key)) {
        if (only !== null && type !== only) continue;
        const gone = byType.get(type) ?? new Set();
        for (const instance of foliageInRadius(list, center, settings.brushSize)) gone.add(instance);
        byType.set(type, gone);
      }
    }
    for (const [type, gone] of byType) if (gone.size > 0) commit(session.removing(type, gone), current.patches);
  };

  const fill = async (current: NonNullable<typeof stroke>, at: Surface): Promise<void> => {
    const active = await activeInfo();
    if (!active) return;
    const { params } = active.info;
    const terrain = at.kind === "landscape" ? editing.find(at.actor) : undefined;
    let area: FoliageRect | null = null;
    if (terrain) {
      const { def } = terrain.session.world;
      const [width, depth] = worldTerrainExtent(def);
      area = { minX: def.origin[0], minZ: def.origin[2], maxX: def.origin[0] + width, maxZ: def.origin[2] + depth };
    } else {
      const box = viewport.worldBox([at.actor]);
      if (box) area = { minX: box.min[0], minZ: box.min[2], maxX: box.max[0], maxZ: box.max[2] };
    }
    if (!area) {
      status("Could not resolve the fill target bounds.", "warning");
      return;
    }
    const release = terrain ? await holdWholeTerrain(terrain, "fill it with foliage", status) : () => {};
    try {
      await edits.ensure({ minX: area.minX - params.radius, minZ: area.minZ - params.radius, maxX: area.maxX + params.radius, maxZ: area.maxZ + params.radius });
      const rng = makeFoliageRng((settings.randomSeed * 40503 + 1) >>> 0);
      const points = foliageFillSamplePoints(area, foliageFillSpacing(params, area), settings.paintDensity, rng);
      const placed = placeFoliage(params, samplesAt(viewport.surfaceProbe(area), at.kind, points, at.actor), existing(active.id, area), rng);
      if (placed.length === 0) {
        status("Fill added no foliage: filters or spacing rejected every sample.");
        return;
      }
      commit(edits.session.adding(active.id, placed), current.patches);
      status(`Filled ${placed.length} foliage instance${placed.length === 1 ? "" : "s"}.`);
    } finally {
      release();
    }
  };

  const LABELS: Record<FoliageTool, string> = { select: "Select Foliage", lasso: "Select Foliage", paint: "Paint Foliage", erase: "Erase Foliage", single: "Place Foliage", fill: "Fill Foliage", remove: "Remove Foliage" };

  // --- Selection ---

  const showSelection = (): void => {
    const picked = selection;
    void Promise.all([...new Set(picked.values())].map(async (type) => [type, await options.typeInfo(type)] as const)).then((infos) => {
      if (picked !== selection) return;
      const boxes = new Map(infos.map(([type, info]) => [type, info?.box ?? null]));
      viewport.setFoliageSelection([...picked].map(([instance, type]) => {
        const { min, max } = boxes.get(type) ?? { min: [-0.5, 0, -0.5] as Vec3, max: [0.5, 1, 0.5] as Vec3 };
        return { matrix: composeMat4(instance.position, instance.rotation, [instance.scale, instance.scale, instance.scale]), min, max };
      }));
    });
  };
  const select = (next: Map<PaintedFoliageInstance, AssetId>): void => {
    selection = next;
    showSelection();
    notify();
  };
  /** What an edit took away leaves the selection. */
  const prune = (): void => {
    if (selection.size === 0) return;
    const alive = new Set<PaintedFoliageInstance>();
    for (const key of edits.session.loadedCells()) for (const list of edits.session.instances(key).values()) for (const instance of list) if (selection.has(instance)) alive.add(instance);
    if (alive.size !== selection.size) select(new Map([...selection].filter(([instance]) => alive.has(instance))));
  };
  edits.onChange(prune);

  const pickInstance = async (event: FoliageToolPointer): Promise<void> => {
    const additive = event.ctrlKey || event.shiftKey;
    const ray = viewport.pointerRay(event.clientX, event.clientY);
    if (!ray) return;
    const solid = viewport.raycast([...ray.origin] as Vec3, [...ray.direction] as Vec3, FAR, NOTHING);
    // A little past the ground: an instance's box reaches into it.
    const reach = solid ? solid.distance + 1 : 2000;
    const { session } = edits;
    const keys = new Set<string>();
    const step = session.cellSize / 2;
    for (let t = 0; ; t = Math.min(reach, t + step)) {
      const rect = around([ray.origin[0] + ray.direction[0] * t, 0, ray.origin[2] + ray.direction[2] * t], step / 2);
      await edits.ensure(rect);
      for (const key of session.cellsIn(rect)) keys.add(key);
      if (t >= reach) break;
    }
    let best: { instance: PaintedFoliageInstance; type: AssetId; distance: number } | null = null;
    for (const key of keys) {
      for (const [type, list] of session.instances(key)) {
        const box = (await options.typeInfo(type))?.box;
        if (!box) continue;
        for (const instance of list) {
          const distance = rayBox(ray, instance, box);
          if (distance !== null && distance <= reach && (!best || distance < best.distance)) best = { instance, type, distance };
        }
      }
    }
    if (!best) {
      if (!additive) select(new Map());
      return;
    }
    const next = additive ? new Map(selection) : new Map<PaintedFoliageInstance, AssetId>();
    if (additive && next.has(best.instance)) next.delete(best.instance);
    else next.set(best.instance, best.type);
    select(next);
  };

  const lassoDab = async (center: Vec3, subtract: boolean): Promise<void> => {
    const rect = around(center, settings.brushSize);
    await edits.ensure(rect);
    const next = new Map(selection);
    for (const key of edits.session.cellsIn(rect)) {
      for (const [type, list] of edits.session.instances(key)) {
        for (const instance of foliageInRadius(list, center, settings.brushSize)) {
          if (subtract) next.delete(instance);
          else next.set(instance, type);
        }
      }
    }
    if (next.size !== selection.size) select(next);
  };

  const byType = (): Map<AssetId, PaintedFoliageInstance[]> => {
    const out = new Map<AssetId, PaintedFoliageInstance[]>();
    for (const [instance, type] of selection) {
      const list = out.get(type);
      if (list) list.push(instance);
      else out.set(type, [instance]);
    }
    return out;
  };
  /** One undo step of replacements, the selection moving to them. */
  const replace = (label: string, replacements: ReadonlyMap<AssetId, ReadonlyMap<PaintedFoliageInstance, PaintedFoliageInstance>>): number => {
    const patches: FoliagePatch[] = [];
    let next: Map<PaintedFoliageInstance, AssetId> | null = null;
    let count = 0;
    for (const [type, map] of replacements) {
      if (map.size === 0) continue;
      count += map.size;
      const changed = edits.session.replacing(type, map);
      const kept = selection;
      next ??= new Map(kept);
      for (const [before, after] of map) if (next.delete(before)) next.set(after, type);
      // The selection follows before the edit prunes it.
      selection = next;
      commit(changed, patches);
    }
    edits.push(label, mergeFoliagePatches(patches));
    if (next) select(next);
    return count;
  };

  /** The ground below points: every drawn terrain's tiles there are loaded first. */
  const groundUnder = async (instances: readonly PaintedFoliageInstance[]): Promise<{ readonly at: (instance: PaintedFoliageInstance) => FoliageSurfaceHit | null; release(): void }> => {
    const held: [EditableTerrain, string[]][] = [];
    const release = (): void => {
      for (const [terrain, keys] of held) terrain.release(keys);
    };
    if (instances.length === 0) return { at: () => null, release };
    try {
      for (const terrain of editing.list()) {
        const keys = new Set(instances.flatMap(({ position }) => terrainBrushTileKeys(terrain.session.world.def, position[0], position[2], 0)));
        if (keys.size === 0) continue;
        held.push([terrain, [...keys]]);
        await terrain.demand(keys);
      }
    } catch (error) {
      release();
      throw error;
    }
    const xs = instances.map(({ position }) => position[0]), zs = instances.map(({ position }) => position[2]);
    const bound = (values: readonly number[], pick: (a: number, b: number) => number): number => values.reduce(pick);
    const probe = viewport.surfaceProbe({ minX: bound(xs, Math.min), minZ: bound(zs, Math.min), maxX: bound(xs, Math.max), maxZ: bound(zs, Math.max) });
    return {
      release,
      at: ({ position }) => {
        const found = probe(position[0], position[2]);
        return found && kindOf(found.actor) ? { position: found.point, normal: found.normal } : null;
      },
    };
  };

  const hover = (event: FoliageToolPointer): void => {
    const surface = settings.tool === "select" || settings.tool === "fill" ? null : under(event);
    if (!surface) {
      viewport.setBrushCursor(null);
      return;
    }
    const world = editing.find(surface.actor)?.session.world;
    viewport.setBrushCursor(Array.from({ length: RING_POINTS }, (_, i): Vec3 => {
      const angle = (i / RING_POINTS) * Math.PI * 2;
      const x = surface.point[0] + Math.cos(angle) * settings.brushSize, z = surface.point[2] + Math.sin(angle) * settings.brushSize;
      return [x, (world ? terrainHeightAt(world.def, world, x, z) : null) ?? surface.point[1], z].map((value, axis) => (axis === 1 ? value + RING_LIFT : value)) as Vec3;
    }));
  };

  const dab = (current: NonNullable<typeof stroke>, event: FoliageToolPointer): void => {
    const surface = under(event);
    if (!surface) return;
    const { tool } = current;
    if (tool === "lasso") {
      void enqueue("Select foliage", () => lassoDab(surface.point, event.ctrlKey));
      return;
    }
    if (tool === "erase" || tool === "remove" || (tool === "paint" && event.shiftKey)) {
      const only = tool === "remove" ? options.activeType() : null;
      if (tool === "remove" && only === null) {
        status("Select a Foliage Type first.", "warning");
        return;
      }
      void enqueue("Erase foliage", () => eraseDab(current, surface.point, only));
      return;
    }
    if (!allowed(surface.kind) || (current.kind !== null && surface.kind !== current.kind)) return;
    if (tool === "paint") {
      // Forge: the next dab a brush radius further, so a held drag keeps a click's density.
      if (current.lastDab && Math.hypot(surface.point[0] - current.lastDab[0], surface.point[2] - current.lastDab[2]) < settings.brushSize) return;
      current.lastDab = surface.point;
      void enqueue("Paint foliage", () => paintDab(current, surface));
    } else if (tool === "single") void enqueue("Place foliage", () => singleDab(current, surface));
    else if (tool === "fill") void enqueue("Fill foliage", () => fill(current, surface));
  };

  const end = (): void => {
    const current = stroke;
    if (!current) return;
    stroke = null;
    void enqueue(LABELS[current.tool], () => {
      for (const [terrain, keys] of current.held) terrain.release(keys);
      edits.push(LABELS[current.tool], mergeFoliagePatches(current.patches));
    });
  };

  const tools: FoliageTools = {
    get settings() {
      return settings;
    },
    update(patch) {
      const tool = settings.tool;
      settings = { ...settings, ...patch };
      if (settings.tool !== tool) {
        end();
        viewport.setBrushCursor(null);
      }
      notify();
    },
    get active() {
      return settings.tool !== null;
    },
    pointerDown(event) {
      if (settings.tool === null || event.button !== 0 || event.altKey || stroke) return false;
      if (settings.tool === "select") {
        void enqueue("Select foliage", () => pickInstance(event));
        return true;
      }
      const surface = under(event);
      stroke = { pointerId: event.pointerId, tool: settings.tool, kind: surface?.kind ?? null, patches: [], lastDab: null, held: new Map() };
      dab(stroke, event);
      return true;
    },
    pointerMove(event) {
      if (settings.tool === null) return false;
      hover(event);
      if (stroke?.pointerId === event.pointerId && stroke.tool !== "single" && stroke.tool !== "fill") dab(stroke, event);
      return true;
    },
    pointerUp(event) {
      if (stroke?.pointerId !== event.pointerId) return false;
      end();
      return true;
    },
    cancel: end,
    leave() {
      if (settings.tool !== null && !stroke) viewport.setBrushCursor(null);
    },
    selectionSize: () => selection.size,
    deselect() {
      if (selection.size > 0) select(new Map());
    },
    removeSelected() {
      if (selection.size === 0) return;
      void enqueue("Remove foliage", () => {
        const patches: FoliagePatch[] = [];
        for (const [type, list] of byType()) commit(edits.session.removing(type, new Set(list)), patches);
        edits.push("Remove Selected Foliage", mergeFoliagePatches(patches));
        select(new Map());
      });
    },
    reattach: () => enqueue("Reattach foliage", async () => {
      if (selection.size === 0) return;
      const ground = await groundUnder([...selection.keys()]);
      try {
        const replacements = new Map<AssetId, Map<PaintedFoliageInstance, PaintedFoliageInstance>>();
        for (const [type, list] of byType()) {
          const params = (await options.typeInfo(type))?.params;
          if (!params) continue;
          const map = new Map<PaintedFoliageInstance, PaintedFoliageInstance>();
          for (const instance of list) {
            const surface = ground.at(instance);
            if (surface) map.set(instance, reattachPaintedInstance(instance, params, surface));
          }
          replacements.set(type, map);
        }
        const count = replace("Reattach Foliage", replacements);
        status(count === 0 ? "No ground found under the selected foliage." : `Reattached ${count} foliage instance${count === 1 ? "" : "s"}.`, count === 0 ? "warning" : "info");
      } finally {
        ground.release();
      }
    }),
    reapply: () => enqueue("Reapply foliage", async () => {
      const replacements = new Map<AssetId, Map<PaintedFoliageInstance, PaintedFoliageInstance>>();
      let groups = byType();
      if (groups.size === 0) {
        const active = await activeInfo();
        if (!active) return;
        await edits.ensureAll();
        groups = new Map([[active.id, edits.session.loadedCells().flatMap((key) => [...(edits.session.instances(key).get(active.id) ?? [])])]]);
      }
      for (const [type, list] of groups) {
        const params = (await options.typeInfo(type))?.params;
        if (params) replacements.set(type, new Map(list.map((instance) => [instance, reapplyPaintedInstance(instance, params)])));
      }
      const count = replace("Reapply Foliage", replacements);
      status(count === 0 ? "No foliage instances to reapply." : `Reapplied ${count} foliage instance${count === 1 ? "" : "s"}.`);
    }),
    selectInvalid: () => enqueue("Select invalid foliage", async () => {
      await edits.ensureAll();
      const { session } = edits;
      const all = session.loadedCells().flatMap((key) => [...session.instances(key)].flatMap(([type, list]) => list.map((instance) => [instance, type] as const)));
      const ground = await groundUnder(all.map(([instance]) => instance));
      try {
        const next = new Map<PaintedFoliageInstance, AssetId>();
        for (const [instance, type] of all) {
          const params = (await options.typeInfo(type))?.params ?? null;
          if (foliageInvalid(instance, params, ground.at(instance))) next.set(instance, type);
        }
        select(next);
        status(next.size === 0 ? "No invalid foliage found." : `Selected ${next.size} invalid foliage instance${next.size === 1 ? "" : "s"}.`);
      } finally {
        ground.release();
      }
    }),
    get busy() {
      return running > 0 || stroke !== null;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async idle() {
      while (running > 0) await queue;
    },
  };
  return tools;
}

/** Distance along a ray to an instance's box; null for a miss. */
export function rayBox(ray: Ray, instance: PaintedFoliageInstance, box: { readonly min: Readonly<Vec3>; readonly max: Readonly<Vec3> }): number | null {
  const matrix = composeMat4(instance.position, instance.rotation, [instance.scale, instance.scale, instance.scale]);
  const inverse = invertMat4(matrix);
  if (!inverse) return null;
  const origin = transformPoint(inverse, [...ray.origin] as Vec3);
  const tip = transformPoint(inverse, [ray.origin[0] + ray.direction[0], ray.origin[1] + ray.direction[1], ray.origin[2] + ray.direction[2]]);
  // Not normalised: the parameter stays the world distance.
  let near = 0, far = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis]!, d = tip[axis]! - o;
    if (Math.abs(d) < 1e-12) {
      if (o < box.min[axis]! || o > box.max[axis]!) return null;
      continue;
    }
    const a = (box.min[axis]! - o) / d, b = (box.max[axis]! - o) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}

/** Escape takes the foliage selection first, then the tool; Delete the selected foliage, never the selected actors. */
export function bindFoliageKeys(doc: Document, tools: FoliageTools): void {
  doc.defaultView?.addEventListener("keydown", (event) => {
    const { target } = event;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (typing || !tools.active) return;
    if (event.code === "Escape") {
      if (tools.selectionSize() > 0) tools.deselect();
      else tools.update({ tool: null });
    } else if (event.code === "Delete" && tools.selectionSize() > 0) tools.removeSelected();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}
