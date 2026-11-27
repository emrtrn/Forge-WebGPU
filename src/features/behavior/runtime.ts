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
    const bus = new ScriptMessageBus({ targetExists: (id) => isId(id, "actor") && world.actor(id) !== undefined });
    let deltaSeconds = 0;
    let frame = 0;
    let previousContacts = new Map<string, ContactPair>();
    const context = ({ actor }: Instance): BehaviorContext => ({
      actor, world, deltaSeconds,
      send(type, target, payload) { bus.send({ type, target, source: actor.id, frame, ...(payload ? { payload } : {}) }); },
      emit(type, payload) { bus.emit({ type, source: actor.id, frame, ...(payload ? { payload } : {}) }); },
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
          const instance: Instance = { actor, definition, cleanup: [], started: false };
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
          if (instance.started) dispatch(instance, { kind: "endPlay", reason: "removed" });
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
      actorsRemoved: remove,
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
          for (const instance of active) if (world.actor(instance.actor.id)) instance.definition.tick?.(context(instance));
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
        previousContacts.clear();
      },
    };
  },
});
