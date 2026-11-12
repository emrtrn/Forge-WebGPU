// TEST SCAFFOLD (plan 2b, K12 user decision 2026-11-12): only tests import it
// (engine-testing-is-test-only); deleted in Faz 6 with the rest of src/engine/testing.
//
// Forge bound actor events and script messages to scripts with authored
// `EventBindings` / `MessageBindings` components. They are not ported: a behavior
// declares its handlers in its code registration (`BehaviorDefinition`). The
// ported Forge checks still build their fixtures with the old components, so
// this subclass turns each fixture's bindings into that registration on the way
// in. Check bodies and assertions stay word for word; a check file swaps only
// the `BehaviorSubsystem` import. Entities without bindings pass through as is.
import type { ActorEventKind } from "../behavior/actorEvents.ts";
import { ACTOR_EVENT_KINDS } from "../behavior/actorEvents.ts";
import { BehaviorSubsystem } from "../behavior/behaviorSubsystem.ts";
import type {
  BehaviorDefinition,
  BehaviorMessageHandler,
  BehaviorRegistration,
  BehaviorRegistry,
  BehaviorUpdate,
} from "../behavior/behaviorTypes.ts";
import type { Entity, EntityId, SceneJsonValue } from "../legacy/entity.ts";

type Params = Record<string, SceneJsonValue>;

interface EventBinding {
  readonly event: ActorEventKind;
  readonly scriptId: string;
  readonly params: Params | undefined;
}

interface MessageBinding {
  readonly message: string;
  readonly scriptId: string;
  readonly target: "self" | "any";
  readonly params: Params | undefined;
}

interface BindingTable {
  /** The entity's own `Behavior` script (its every-frame tick), if any. */
  readonly tick: string | undefined;
  readonly events: readonly EventBinding[];
  readonly messages: readonly MessageBinding[];
}

const SCRIPT_PREFIX = "forge-bindings:";
const tables = new Map<string, BindingTable>();
let nextTable = 0;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const paramsOf = (value: unknown): Params | undefined => {
  const params = record(value);
  return params ? { ...(params as Params) } : undefined;
};

const entriesOf = (component: unknown): Record<string, unknown>[] => {
  const bindings = record(component)?.bindings;
  return Array.isArray(bindings) ? bindings.flatMap((entry) => (record(entry) ? [record(entry)!] : [])) : [];
};

// The filters and defaults of Forge's readEventBindingsComponent /
// readMessageBindingsComponent (engine/scene/components.ts).
function readEventBindings(component: unknown): EventBinding[] {
  return entriesOf(component).flatMap((entry) => {
    const event = entry.event;
    if (!(ACTOR_EVENT_KINDS as readonly unknown[]).includes(event)) return [];
    if (typeof entry.scriptId !== "string" || entry.scriptId.length === 0) return [];
    return [{ event: event as ActorEventKind, scriptId: entry.scriptId, params: paramsOf(entry.params) }];
  });
}

function readMessageBindings(component: unknown): MessageBinding[] {
  return entriesOf(component).flatMap((entry) => {
    if (typeof entry.message !== "string" || entry.message.length === 0) return [];
    if (typeof entry.scriptId !== "string" || entry.scriptId.length === 0) return [];
    const target: "self" | "any" = entry.target === "any" ? "any" : "self";
    return [{ message: entry.message, scriptId: entry.scriptId, target, params: paramsOf(entry.params) }];
  });
}

/** The entity with its bindings moved into a code registration (`Behavior` → the table's script id). */
export function adaptForgeBindings(entity: Entity): Entity {
  const events = readEventBindings(entity.components.EventBindings);
  const messages = readMessageBindings(entity.components.MessageBindings);
  if (!("EventBindings" in entity.components) && !("MessageBindings" in entity.components)) return entity;
  const behavior = record(entity.components.Behavior);
  const tick = typeof behavior?.scriptId === "string" && behavior.scriptId.length > 0 ? behavior.scriptId : undefined;
  const scriptId = `${SCRIPT_PREFIX}${nextTable++}`;
  tables.set(scriptId, { tick, events, messages });
  const components = { ...entity.components };
  delete components.EventBindings;
  delete components.MessageBindings;
  const params = paramsOf(behavior?.params);
  components.Behavior = params ? { scriptId, params } : { scriptId };
  return { ...entity, components };
}

/** Each binding runs with its own params, as Forge's binding instances did. */
const withParams = (update: BehaviorUpdate, params: Params | undefined): BehaviorUpdate =>
  (context) => update({ ...context, params: params ?? {} });

/** Bindings of one key run in authored order, as Forge's instances / subscriptions did. */
const inOrder = (updates: readonly BehaviorUpdate[]): BehaviorUpdate =>
  updates.length === 1 ? updates[0]! : (context) => { for (const update of updates) update(context); };

/** Resolves the adapted entities' tables against the check's own registry. */
export function withForgeBindings(scripts: BehaviorRegistry): BehaviorRegistry {
  const resolve = (scriptId: string): BehaviorUpdate | undefined => {
    const registration: BehaviorRegistration | undefined = scripts.get(scriptId);
    return typeof registration === "function" ? registration : registration?.tick;
  };
  return {
    get: (scriptId) => {
      const table = tables.get(scriptId);
      if (!table) return scripts.get(scriptId);
      // Forge skipped a binding whose script was not registered when the actor was added.
      const events = new Map<ActorEventKind, BehaviorUpdate[]>();
      for (const binding of table.events) {
        const update = resolve(binding.scriptId);
        if (!update) continue;
        events.set(binding.event, [...(events.get(binding.event) ?? []), withParams(update, binding.params)]);
      }
      const messages = new Map<string, { target: "self" | "any"; updates: BehaviorUpdate[] }>();
      for (const binding of table.messages) {
        const update = resolve(binding.scriptId);
        if (!update) continue;
        const entry = messages.get(binding.message) ?? { target: binding.target, updates: [] };
        if (entry.target !== binding.target) {
          throw new Error(`forgeBindings: "${binding.message}" bound with both targets on one actor`);
        }
        entry.updates.push(withParams(update, binding.params));
        messages.set(binding.message, entry);
      }
      const tick = table.tick === undefined ? undefined : resolve(table.tick);
      const definition: BehaviorDefinition = {
        ...(tick ? { tick } : {}),
        events: Object.fromEntries([...events].map(([event, updates]) => [event, inOrder(updates)])),
        messages: Object.fromEntries(
          [...messages].map(([message, { target, updates }]): [string, BehaviorMessageHandler] => [
            message,
            { target, handle: inOrder(updates) },
          ]),
        ),
      };
      return definition;
    },
  };
}

/**
 * `BehaviorSubsystem` for ported Forge checks whose fixtures still author
 * bindings: same API, the registry and entities go through the adapters above.
 */
export class ForgeBindingBehaviorSubsystem extends BehaviorSubsystem {
  constructor(registry: BehaviorRegistry, ...rest: ConstructorParameters<typeof BehaviorSubsystem> extends [unknown, ...infer R] ? R : never) {
    super(withForgeBindings(registry), ...rest);
  }

  override setEntities(entities: readonly Entity[]): void {
    super.setEntities(entities.map(adaptForgeBindings));
  }

  override addEntity(entity: Entity, options: { owner?: EntityId } = {}): boolean {
    return super.addEntity(adaptForgeBindings(entity), options);
  }
}
