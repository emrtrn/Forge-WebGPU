import {
  applyActorState, captureActorState, createContext, defaultValue, effectiveComponents, isJsonObject, normalizeFieldMap, normalizeSaveGame,
  saveStateTypeTag, SaveLedger, type ActorDoc, type ActorId, type ActorStateSnapshot, type LevelId, type LevelNormalizeOptions,
  type SaveGameDoc, type SavedActor, type SaveStateData, type SaveStateDef,
} from "../../core/index.ts";
import { CheckpointActorTrackingKey, CheckpointKey, type CheckpointService } from "../../engine/persistence/checkpointService.ts";
import type { SaveGameStore } from "../../engine/persistence/saveGameStore.ts";
import { CellStreamingKey } from "../streaming/cellStreaming.ts";
import type { World } from "../world.ts";

export interface CheckpointOptions {
  readonly store: SaveGameStore<SaveGameDoc>;
  /** The slot to restore when starting this level. */
  readonly initialSlot?: string;
  readonly levelPath?: string;
  readonly reopen?: (slot: string) => void;
}

export function installWorldCheckpoint(
  world: World, level: LevelId, options: LevelNormalizeOptions, { store, initialSlot, levelPath, reopen }: CheckpointOptions,
) {
  const raw = initialSlot === undefined ? null : store.readSlot(initialSlot)?.payload ?? null;
  const restore = raw === null ? null : normalizeSaveGame(raw, { ...options, strict: false });
  const report = createContext({ strict: false });
  report.issues.push(...(restore?.issues ?? []));
  const ledger = new SaveLedger(level, restore?.value?.level === level ? restore.value : null);
  const persistent = new Map<ActorId, ActorStateSnapshot>();
  const spawned = new Map<ActorId, ActorDoc>();
  const restored = new Set<ActorId>();
  const snapshot = (doc: ActorDoc): ActorStateSnapshot => ({
    transform: doc.transform,
    components: effectiveComponents(doc, doc.class === null ? undefined : options.resolveClass(doc.class)),
  });
  const apply = (raw: ActorDoc, base: ActorStateSnapshot): ActorDoc => {
    if (raw.class !== null && !options.resolveClass(raw.class)) return raw;
    const { transform, components } = applyActorState(base, ledger.take(raw.id), options.registry, `actors.${raw.id}`, report);
    const { id, name, parent, spatiallyLoaded } = raw;
    return { id, name, parent, spatiallyLoaded, class: null, transform, components };
  };
  world.services.provide(CheckpointActorTrackingKey, {
    spawned: (doc) => { spawned.set(doc.id, doc); },
    destroyed(id, origin) {
      if (origin === "level") ledger.markRemoved(id);
      else {
        ledger.forgetSpawned(id);
        spawned.delete(id);
      }
    },
    unloaded(actor) {
      const original = spawned.get(actor.id);
      if (!original) return;
      ledger.remember(actor.id, captureActorState(snapshot(original), actor, options.registry));
      ledger.rememberSpawned(original);
      spawned.delete(actor.id);
      restored.delete(actor.id);
    },
  });
  const capture = () => {
    const entries = new Map<ActorId, SavedActor | null>(world.services.get(CellStreamingKey)?.captureLive() ?? []);
    for (const [id, base] of persistent) {
      const actor = world.context.actor(id);
      if (actor) entries.set(id, captureActorState(base, actor, options.registry));
    }
    const liveSpawned: ActorDoc[] = [];
    for (const [id, original] of spawned) {
      const actor = world.context.actor(id);
      if (!actor) continue;
      entries.set(id, captureActorState(snapshot(original), actor, options.registry));
      liveSpawned.push(original);
    }
    return ledger.toDocument(entries, liveSpawned);
  };
  const service: CheckpointService = {
    capture,
    save: (slot) => store.writeSlot(slot, capture()).ok,
    slots: () => store.listSlots().map((entry) => {
      const savedLevel = store.readSlot(entry.slot)?.payload?.level;
      return { ...entry, levelName: typeof savedLevel === "string" ? (savedLevel === level ? levelPath ?? level : savedLevel) : null };
    }),
    delete: (slot) => store.deleteSlot(slot),
    restore(slot) {
      const payload: unknown = store.readSlot(slot)?.payload;
      if (!reopen || !isJsonObject(payload) || payload.level !== level) return false;
      reopen(slot);
      return true;
    },
    state<S extends SaveStateDef>(definition: S): SaveStateData<S> {
      const current = ledger.getState(definition.name);
      if (current) {
        const { type: _type, ...data } = current;
        return data as SaveStateData<S>;
      }
      return Object.fromEntries(Object.entries(definition.fields).map(([key, field]) =>
        [key, defaultValue(field)])) as SaveStateData<S>;
    },
    setState<S extends SaveStateDef>(definition: S, value: SaveStateData<S>) {
      if (options.registry.getSaveState(definition.name) !== definition) throw new Error(`Unregistered save state ${definition.name}.`);
      const input = createContext({ strict: true });
      const fields = normalizeFieldMap(definition.fields, value, definition.name, input);
      if (input.issues.some((issue) => issue.severity === "error")) {
        throw new Error(input.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
      }
      ledger.setState({ ...fields, type: saveStateTypeTag(definition) });
    },
  };
  world.services.provide(CheckpointKey, service);
  return {
    ledger,
    issues: report.issues,
    persistentActors(actors: readonly ActorDoc[]): ActorDoc[] {
      const removed = new Set(actors.filter((actor) => ledger.isRemoved(actor.id)).map((actor) => actor.id));
      let changed = removed.size > 0;
      while (changed) {
        changed = false;
        for (const actor of actors) if (actor.parent && removed.has(actor.parent) && !removed.has(actor.id)) {
          removed.add(actor.id);
          changed = true;
        }
      }
      return actors.flatMap((actor) => {
        if (removed.has(actor.id)) return [];
        const base = snapshot(actor);
        persistent.set(actor.id, base);
        return [apply(actor, base)];
      });
    },
    restoreSpawned(): void {
      const candidates = ledger.spawnedActors().filter(({ id }) => !restored.has(id));
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const doc of candidates) {
          if (restored.has(doc.id) || world.context.actor(doc.id) || (doc.parent && !world.context.actor(doc.parent))) continue;
          restored.add(doc.id);
          world.addActors([apply(doc, snapshot(doc))], "spawned");
          spawned.set(doc.id, doc);
          ledger.forgetSpawned(doc.id);
          progressed = true;
        }
      }
    },
  };
}
