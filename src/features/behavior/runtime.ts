import { defineSubsystem, isId, parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { ScriptMessageBus } from "../../engine/behavior/scriptMessages.ts";
import {
  BehaviorDefinitionsKey, type BehaviorContext, type BehaviorDefinition, type BehaviorEvent,
} from "../../engine/behavior/worldBehavior.ts";
import { PhysicsRuntimeKey } from "../../engine/physics/physicsService.ts";
import { TimeControlKey } from "../../engine/time/timeControl.ts";

interface Instance {
  readonly actor: WorldActor;
  readonly definition: BehaviorDefinition;
  readonly cleanup: (() => void)[];
  started: boolean;
  tickEnabled: boolean;
  tickInterval: number;
  tickElapsed: number;
  timers?: Map<string, Timer>;
}

interface Timer {
  readonly message: string;
  readonly payload?: Record<string, unknown>;
  readonly createdFrame: number;
  remaining: number;
}

interface ContactPair {
  readonly a: ActorId;
  readonly b: ActorId;
  readonly kind: "hit" | "overlap";
}

export const BehaviorSubsystem = defineSubsystem({
  id: "forge.behavior",
  tickGroups: ["postPhysics"],
  create(world) {
    const definitions = world.services.get(BehaviorDefinitionsKey);
    const instances = new Map<ActorId, Instance[]>();
    const lifeSpans = new Map<ActorId, { remaining: number; createdFrame: number }>();
    const bus = new ScriptMessageBus({ targetExists: (id) => isId(id, "actor") && world.actor(id) !== undefined });
    let deltaSeconds = 0;
    let frame = 0;
    let nextTimer = 1;
    let previousContacts = new Map<string, ContactPair>();
    const context = (instance: Instance, elapsed = deltaSeconds): BehaviorContext => ({
      actor: instance.actor, world, deltaSeconds: elapsed,
      setTickEnabled(enabled) { instance.tickEnabled = enabled; },
      setTickInterval(seconds) {
        instance.tickInterval = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
        instance.tickElapsed = 0;
      },
      setLifeSpan(seconds) {
        if (world.actor(instance.actor.id) !== instance.actor) return;
        if (Number.isFinite(seconds) && seconds > 0) lifeSpans.set(instance.actor.id, { remaining: seconds, createdFrame: frame });
        else lifeSpans.delete(instance.actor.id);
      },
      timers: {
        after(seconds, message, payload) {
          const handle = `script-timer:${nextTimer++}`;
          (instance.timers ??= new Map()).set(handle, { message, ...(payload ? { payload: { ...payload } } : {}),
            createdFrame: frame, remaining: Number.isFinite(seconds) ? Math.max(0, seconds) : 0 });
          return handle;
        },
        clear(handle) { instance.timers?.delete(handle); },
      },
      send(type, target, payload) { bus.send({ type, target, source: instance.actor.id, frame, ...(payload ? { payload } : {}) }); },
      emit(type, payload) { bus.emit({ type, source: instance.actor.id, frame, ...(payload ? { payload } : {}) }); },
    });
    const dispatch = (item: Instance, event: BehaviorEvent) => item.definition.events?.[event.kind]?.(context(item), event);
    const dispatchTo = (id: ActorId, event: BehaviorEvent) => {
      for (const instance of instances.get(id) ?? []) if (instance.started && world.actor(id)) dispatch(instance, event);
    };
    const updateImpactInterest = (id: ActorId): void => {
      const runtime = world.services.get(PhysicsRuntimeKey);
      if (!runtime) return;
      const requested = instances.get(id)?.some(({ definition }) => definition.events?.impact);
      for (const body of runtime.ids(id)) runtime.physics.setImpactEventThreshold(body, requested ? 0 : null, "behavior");
    };
    const start = (item: Instance) => {
      if (item.started || !world.actor(item.actor.id)) return;
      item.started = true;
      updateImpactInterest(item.actor.id);
      dispatch(item, { kind: "beginPlay" });
    };
    const add = (actors: readonly WorldActor[]) => {
      for (const actor of actors) {
        for (const component of Object.values(actor.components)) {
          if (parseComponentTypeTag(component.type)?.name !== "forge.behavior" || typeof component.script !== "string") continue;
          const definition = definitions?.get(component.script);
          if (!definition) continue;
          let active = instances.get(actor.id);
          if (!active) instances.set(actor.id, active = []);
          const instance: Instance = { actor, definition, cleanup: [], started: false, tickEnabled: true, tickInterval: 0, tickElapsed: 0 };
          active.push(instance);
          for (const [type, handler] of Object.entries(definition.messages ?? {})) {
            const unsubscribe = bus.subscribe(type, (message) => {
              if (!instance.started || !world.actor(actor.id) || !isId(message.source, "actor")) return;
              handler.handle(context(instance), {
                type: message.type, source: message.source, payload: message.payload,
                ...(isId(message.target, "actor") ? { target: message.target } : {}),
              });
            }, handler.target === "self" ? { target: actor.id } : {});
            instance.cleanup.push(unsubscribe);
          }
        }
      }
    };
    const remove = (actors: readonly WorldActor[]) => {
      for (const actor of actors) {
        const active = instances.get(actor.id);
        if (!active) continue;
        instances.delete(actor.id);
        updateImpactInterest(actor.id);
        for (const instance of active) {
          for (const unsubscribe of instance.cleanup) unsubscribe();
          if (instance.started) {
            instance.started = false;
            dispatch(instance, { kind: "endPlay", reason: "removed" });
          }
          instance.timers?.clear();
        }
      }
    };
    const emitPhysics = (): void => {
      const runtime = world.services.get(PhysicsRuntimeKey);
      if (!runtime) return;
      const current = new Map<string, ContactPair>();
      for (const contact of runtime.contacts()) {
        const a = runtime.owner(contact.a), b = runtime.owner(contact.b);
        if (!a || !b || a === b) continue;
        const [first, second] = a < b ? [a, b] : [b, a];
        const kind = contact.isSensor ? "overlap" : "hit";
        const key = `${first}:${second}:${kind}`;
        if (!current.has(key)) current.set(key, { a: first, b: second, kind });
      }
      for (const [phase, primary, other] of [
        ["begin", current, previousContacts], ["end", previousContacts, current],
      ] as const) {
        for (const [key, { a, b, kind }] of primary) {
          if (other.has(key)) continue;
          dispatchTo(a, { kind, phase, other: b });
          dispatchTo(b, { kind, phase, other: a });
        }
      }
      previousContacts = current;
      for (const impact of runtime.impacts()) {
        const a = runtime.owner(impact.a), b = runtime.owner(impact.b);
        if (!a || !b || a === b) continue;
        const { point, normal, impulse } = impact;
        dispatchTo(a, { kind: "impact", other: b, point, normal, impulse });
        dispatchTo(b, { kind: "impact", other: a, point, normal: [-normal[0], -normal[1], -normal[2]], impulse });
      }
    };
    return {
      actorsAdded: add,
      actorsRemoved(actors) {
        for (const { id } of actors) lifeSpans.delete(id);
        remove(actors);
      },
      actorsChanged(changes) {
        for (const { actor, previous, transformOnly } of changes) if (!transformOnly) {
          remove([previous]);
          add([actor]);
        }
      },
      beginPlay() {
        for (const group of [...instances.values()]) for (const instance of group) start(instance);
      },
      tick(_group, dt) {
        deltaSeconds = dt;
        frame += 1;
        const active = [...instances.values()].flat();
        for (const instance of active) start(instance);
        if (!world.services.get(TimeControlKey)?.paused) {
          emitPhysics();
          for (const instance of active) {
            const { actor, definition, started, tickEnabled, tickInterval } = instance;
            if (!definition.tick || !started || !tickEnabled || world.actor(actor.id) !== actor) continue;
            instance.tickElapsed += dt;
            if (instance.tickElapsed + 1e-9 < tickInterval) continue;
            const elapsed = instance.tickElapsed;
            instance.tickElapsed = 0;
            definition.tick(context(instance, elapsed));
          }
          for (const instance of active) {
            if (!instance.started || !instance.timers) continue;
            const id = instance.actor.id;
            for (const [handle, timer] of instance.timers) {
              if (timer.createdFrame === frame) continue;
              timer.remaining -= dt;
              if (timer.remaining > 1e-9) continue;
              instance.timers.delete(handle);
              bus.send({ type: timer.message, source: id, target: id, frame, ...(timer.payload ? { payload: timer.payload } : {}) });
            }
          }
          const expired: ActorId[] = [];
          for (const [id, lifeSpan] of lifeSpans) {
            if (lifeSpan.createdFrame === frame) continue;
            lifeSpan.remaining -= dt;
            if (lifeSpan.remaining <= 1e-9) expired.push(id);
          }
          if (expired.length > 0) world.destroyActors(expired);
        }
        bus.flush();
      },
      endPlay(reason) {
        for (const group of [...instances.values()]) for (const instance of group) {
          if (!instance.started) continue;
          instance.started = false;
          dispatch(instance, { kind: "endPlay", reason });
        }
      },
      dispose() {
        bus.clear();
        instances.clear();
        lifeSpans.clear();
        previousContacts.clear();
      },
    };
  },
});
