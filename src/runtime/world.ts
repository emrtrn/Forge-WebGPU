// The world: runtime state of one running level (architecture §4.7; Unreal's
// UWorld). Actors, their component index, services and the subsystems of the
// installed features, with one explicit lifecycle (application shell 1B–1D):
//
//   createWorld -> init -> (assembleLevel / addActors) -> beginPlay ->
//   tick* -> endPlay -> dispose
//
// - Everything lives in the world instance; there is no module-level mutable
//   state, so two worlds can run side by side and be torn down (A6).
// - Actors from the level and actors spawned at runtime go through the same
//   path and reach every subsystem through `actorsAdded` (F11).
// - The editor replaces actors with their edited documents (`updateActors`);
//   subsystems hear `actorsChanged`, or removed + added without that hook. A
//   moved actor's descendants come along as transform-only changes.
// - The editor's world (`mode: "editor"`) installs only the subsystems marked
//   `inEditor` (plan phase 4; user decision 2026-11-13): render, environment,
//   fog, never physics or gameplay.
// - Removing an actor removes its child actors with it.
// - Teardown runs backwards: endPlay and dispose call the subsystems in the
//   reverse of their install order.
// - Hooks run synchronously; a subsystem may spawn or destroy actors from a
//   hook, and the other subsystems hear about it before the call returns. An
//   error in a hook is not swallowed: it reaches the caller (the boot screen).

import {
  effectiveComponents,
  normalizeActorDoc,
  parseComponentTypeTag,
  TICK_GROUPS,
  createServices,
  defaultValue, object, LevelSettingsFields, LevelSettingsKey, type LevelSettings,
  type ActorDoc,
  type ActorId,
  type ClassResolver,
  type ComponentEntry,
  type EndPlayReason,
  type FeatureDef,
  type Issue,
  type SchemaRegistry,
  type Services,
  type SubsystemContext,
  type SubsystemDef,
  type SubsystemInstance,
  type WorldActor,
  type WorldActorChange,
  type WorldState,
} from "../core/index.ts";
import { TimeControlKey } from "../engine/time/timeControl.ts";
import { ActorMotionKey } from "../engine/world/actorMotion.ts";
import { CheckpointActorTrackingKey } from "../engine/persistence/checkpointService.ts";
import { SubsystemProfiler } from "../engine/perf/subsystemProfiler.ts";

export const MAX_TICK_SECONDS = 0.1;
const ENGINE_REGION_ID = "engine";

export class WorldError extends Error {
  readonly issues: readonly Issue[];
  constructor(message: string, issues: readonly Issue[] = []) {
    super(message);
    this.name = "WorldError";
    this.issues = issues;
  }
}

export interface WorldOptions {
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  /** Development, editor, tools: data loss is an error. */
  readonly strict: boolean;
  /** Their subsystems run in this order. */
  readonly features: readonly FeatureDef[];
  /** `editor`: only the subsystems marked `inEditor` are installed. Default `game`. */
  readonly mode?: "game" | "editor";
}

export interface World {
  readonly state: WorldState;
  readonly services: Services;
  /** The view subsystems get; also what the editor and tests read the world through. */
  readonly context: SubsystemContext;
  /** Creates the subsystems, in feature order. */
  init(): void;
  /** Adds normalised actor documents (a level, a cell). */
  addActors(actors: readonly ActorDoc[], origin: WorldActor["origin"]): WorldActor[];
  /** Removes actors and their children, returning them after removal hooks finish. */
  removeActors(ids: readonly ActorId[]): WorldActor[];
  /**
   * Replaces actors (by id) with their edited, normalised documents (the
   * editor). Returns the changes the subsystems heard: the edited actors, then
   * their descendants as transform-only changes. An unchanged document is no
   * change.
   */
  updateActors(actors: readonly ActorDoc[]): WorldActorChange[];
  beginPlay(): void;
  /** Clamps real seconds to [0, 0.1], runs the tick groups, and returns the simulation seconds advanced. */
  tick(dt: number): number;
  /** Enables tick timing once. The frame owner records and closes the whole frame. */
  enableProfiling(now?: () => number, windowFrames?: number): SubsystemProfiler;
  endPlay(reason?: EndPlayReason): void;
  /** Ends play if needed and releases everything. The world cannot be used afterwards. */
  dispose(): void;
}

interface Running {
  readonly def: SubsystemDef;
  readonly instance: SubsystemInstance;
}

export function createWorld(options: WorldOptions): World {
  let state: WorldState = "created";
  const services = createServices();
  const actors = new Map<ActorId, WorldActor>();
  const byType = new Map<string, ComponentEntry[]>();
  const subsystems: Running[] = [];
  const definitions: SubsystemDef[] = [];
  let profiling: { readonly profiler: SubsystemProfiler; readonly now: () => number } | undefined;
  const editor = (options.mode ?? "game") === "editor";
  services.provide(LevelSettingsKey, { current: defaultValue(object(LevelSettingsFields)) as LevelSettings });
  for (const feature of options.features) {
    for (const def of feature.subsystems) {
      if (definitions.some((other) => other.id === def.id)) {
        throw new WorldError(`Subsystem "${def.id}" is installed twice.`);
      }
      if (editor && !def.inEditor) continue;
      definitions.push(def);
    }
  }

  const expect = (allowed: readonly WorldState[], action: string): void => {
    if (!allowed.includes(state)) throw new WorldError(`Cannot ${action} a world that is ${state}.`);
  };

  const index = (actor: WorldActor): void => {
    for (const [key, component] of Object.entries(actor.components)) {
      const name = parseComponentTypeTag(component.type)?.name;
      if (name === undefined) continue;
      const list = byType.get(name);
      const entry: ComponentEntry = { actor, key, component };
      if (list) list.push(entry);
      else byType.set(name, [entry]);
    }
  };

  const add = (docs: readonly ActorDoc[], origin: WorldActor["origin"]): WorldActor[] => {
    expect(["initialized", "playing"], "add actors to");
    const batch = new Set<ActorId>();
    for (const doc of docs) {
      if (actors.has(doc.id) || batch.has(doc.id)) throw new WorldError(`Actor ${doc.id} is already in the world.`);
      batch.add(doc.id);
    }
    for (const doc of docs) {
      if (doc.parent !== null && !actors.has(doc.parent) && !batch.has(doc.parent)) {
        throw new WorldError(`Actor ${doc.id}: its parent ${doc.parent} is not in the world.`);
      }
    }
    const added: WorldActor[] = [];
    for (const doc of docs) {
      const cls = doc.class === null ? undefined : options.resolveClass(doc.class);
      if (doc.class !== null && !cls) {
        throw new WorldError(`Actor ${doc.id}: its class ${doc.class} is not available.`);
      }
      const actor: WorldActor = {
        id: doc.id,
        name: doc.name,
        parent: doc.parent,
        transform: structuredClone(doc.transform),
        components: effectiveComponents(doc, cls),
        origin,
      };
      actors.set(actor.id, actor);
      if (origin === "spawned") services.get(CheckpointActorTrackingKey)?.spawned(doc);
      index(actor);
      added.push(actor);
    }
    if (added.length > 0) for (const running of subsystems) running.instance.actorsAdded?.(added);
    return added;
  };

  const remove = (ids: readonly ActorId[], destroyed = false): WorldActor[] => {
    expect(["initialized", "playing"], "remove actors from");
    const doomed = new Set<ActorId>(ids.filter((id) => actors.has(id)));
    if (doomed.size === 0) return [];
    // Children go with their parent, at any depth.
    let grew = true;
    while (grew) {
      grew = false;
      for (const actor of actors.values()) {
        if (actor.parent !== null && doomed.has(actor.parent) && !doomed.has(actor.id)) {
          doomed.add(actor.id);
          grew = true;
        }
      }
    }
    const removed: WorldActor[] = [];
    for (const actor of actors.values()) if (doomed.has(actor.id)) removed.push(actor);
    for (const actor of removed) {
      actors.delete(actor.id);
      const tracker = services.get(CheckpointActorTrackingKey);
      if (destroyed) tracker?.destroyed(actor.id, actor.origin);
      else if (actor.origin === "spawned") tracker?.unloaded(actor);
    }
    for (const [name, list] of byType) {
      const kept = list.filter((entry) => !doomed.has(entry.actor.id));
      if (kept.length > 0) byType.set(name, kept);
      else byType.delete(name);
    }
    for (const running of subsystems) running.instance.actorsRemoved?.(removed);
    return removed;
  };

  const notifyChanges = (changes: WorldActorChange[]): void => {
    if (changes.length === 0) return;
    const changed = new Map(changes.map((change) => [change.actor.id, change.source]));
    let grew = true;
    while (grew) {
      grew = false;
      for (const actor of actors.values()) {
        if (actor.parent !== null && changed.has(actor.parent) && !changed.has(actor.id)) {
          const source = changed.get(actor.parent);
          changed.set(actor.id, source);
          changes.push({ actor, previous: actor, transformOnly: true, ...(source ? { source } : {}) });
          grew = true;
        }
      }
    }
    for (const running of subsystems) {
      if (running.instance.actorsChanged) running.instance.actorsChanged(changes);
      else {
        running.instance.actorsRemoved?.(changes.map((change) => change.previous));
        running.instance.actorsAdded?.(changes.map((change) => change.actor));
      }
    }
  };

  services.provide(ActorMotionKey, {
    setTransforms(updates, source) {
      expect(["initialized", "playing"], "move actors in");
      const changed = new Map<ActorId, WorldActorChange>();
      for (const { actor: id, transform } of updates) {
        const actor = actors.get(id);
        if (!actor) continue;
        const current = actor.transform;
        if (current.p.every((value, index) => Math.abs(value - transform.p[index]!) < 1e-9) &&
            current.r.every((value, index) => Math.abs(value - transform.r[index]!) < 1e-9) &&
            current.s.every((value, index) => Math.abs(value - transform.s[index]!) < 1e-9)) continue;
        actor.transform = structuredClone(transform);
        changed.set(id, { actor, previous: actor, transformOnly: true, ...(source ? { source } : {}) });
      }
      notifyChanges([...changed.values()]);
    },
  });

  const update = (docs: readonly ActorDoc[]): WorldActorChange[] => {
    expect(["initialized", "playing"], "update actors in");
    const changes: WorldActorChange[] = [];
    const seen = new Set<ActorId>();
    let reindex = false;
    for (const doc of docs) {
      const previous = actors.get(doc.id);
      if (!previous) throw new WorldError(`Actor ${doc.id} is not in the world.`);
      if (seen.has(doc.id)) throw new WorldError(`Actor ${doc.id} is updated twice in one batch.`);
      seen.add(doc.id);
      if (doc.parent !== null) {
        if (!actors.has(doc.parent)) throw new WorldError(`Actor ${doc.id}: its parent ${doc.parent} is not in the world.`);
        for (let at: ActorId | null = doc.parent; at !== null; at = actors.get(at)?.parent ?? null) {
          if (at === doc.id) throw new WorldError(`Actor ${doc.id}: parenting it to ${doc.parent} makes a cycle.`);
        }
      }
      const cls = doc.class === null ? undefined : options.resolveClass(doc.class);
      if (doc.class !== null && !cls) throw new WorldError(`Actor ${doc.id}: its class ${doc.class} is not available.`);
      const components = effectiveComponents(doc, cls);
      const sameShape = doc.name === previous.name && doc.parent === previous.parent && JSON.stringify(components) === JSON.stringify(previous.components);
      if (sameShape) {
        if (JSON.stringify(doc.transform) === JSON.stringify(previous.transform)) continue;
        previous.transform = structuredClone(doc.transform);
        changes.push({ actor: previous, previous, transformOnly: true });
        continue;
      }
      const actor: WorldActor = { id: doc.id, name: doc.name, parent: doc.parent, transform: structuredClone(doc.transform), components, origin: previous.origin };
      actors.set(actor.id, actor); // Keeps the actor's place in the world's order.
      changes.push({ actor, previous, transformOnly: false });
      reindex = true;
    }
    if (changes.length === 0) return changes;
    if (reindex) {
      byType.clear();
      for (const actor of actors.values()) index(actor);
    }
    notifyChanges(changes);
    return changes;
  };

  const context: SubsystemContext = {
    get state() {
      return state;
    },
    services,
    actor: (id) => actors.get(id),
    actors: () => actors.values(),
    componentsOf: (type) => [...(byType.get(type) ?? [])],
    spawnActors(raw) {
      const docs: ActorDoc[] = [];
      const issues: Issue[] = [];
      for (const item of raw) {
        const result = normalizeActorDoc(item, options);
        issues.push(...result.issues);
        if (result.value) docs.push(result.value);
      }
      if (issues.some((found) => found.severity === "error") || docs.length !== raw.length) {
        throw new WorldError("A spawned actor is not a valid actor.", issues);
      }
      return add(docs, "spawned");
    },
    destroyActors(ids) { remove(ids, true); },
  };

  return {
    get state() {
      return state;
    },
    services,
    context,
    init() {
      expect(["created"], "initialise");
      state = "initialized";
      for (const def of definitions) subsystems.push({ def, instance: def.create(context) });
    },
    addActors: add,
    removeActors: remove,
    updateActors: update,
    beginPlay() {
      expect(["initialized"], "begin play in");
      state = "playing";
      for (const running of subsystems) running.instance.beginPlay?.();
    },
    enableProfiling(now = () => performance.now(), windowFrames) {
      if (profiling) return profiling.profiler;
      const profiler = new SubsystemProfiler(windowFrames);
      profiler.declareRegion({ id: ENGINE_REGION_ID });
      for (const { id } of definitions) profiler.declareRegion({ id, parent: ENGINE_REGION_ID });
      profiling = { profiler, now };
      return profiler;
    },
    tick(dt) {
      expect(["playing"], "tick");
      const rawStep = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_TICK_SECONDS) : 0;
      const step = services.get(TimeControlKey)?.simulationDelta(rawStep) ?? rawStep;
      const timing = profiling;
      const times = timing && new Map<string, number>();
      const start = timing?.now() ?? 0;
      for (const group of TICK_GROUPS) {
        for (const { def, instance } of subsystems) {
          if (!def.tickGroups.includes(group) || !instance.tick) continue;
          if (timing && times) {
            const started = timing.now();
            instance.tick(group, step);
            const elapsed = Math.max(0, timing.now() - started);
            times.set(def.id, (times.get(def.id) ?? 0) + elapsed);
          } else {
            instance.tick(group, step);
          }
        }
      }
      if (timing && times) {
        const elapsed = timing.now() - start;
        // Keep one rolling sample per subsystem even if it ticks in several groups.
        for (const [id, ms] of times) timing.profiler.record(id, ms);
        timing.profiler.record(ENGINE_REGION_ID, elapsed);
      }
      return step;
    },
    endPlay(reason = "stopped") {
      expect(["playing"], "end play in");
      state = "ended";
      for (const running of [...subsystems].reverse()) running.instance.endPlay?.(reason);
    },
    dispose() {
      if (state === "disposed") return;
      if (state === "playing") this.endPlay("stopped");
      for (const running of [...subsystems].reverse()) running.instance.dispose?.();
      subsystems.length = 0;
      actors.clear();
      byType.clear();
      state = "disposed";
    },
  };
}
