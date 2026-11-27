import { COMPONENT_NAME_PATTERN, SchemaDefinitionError, createServiceKey, type ActorId, type EndPlayReason, type SubsystemContext, type Vec3, type WorldActor } from "../../core/index.ts";

export interface BehaviorMessage {
  readonly type: string;
  readonly source: ActorId;
  readonly target?: ActorId;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type BehaviorEvent =
  | { readonly kind: "beginPlay" }
  | { readonly kind: "endPlay"; readonly reason: EndPlayReason | "removed" }
  | { readonly kind: "hit" | "overlap"; readonly other: ActorId; readonly phase: "begin" | "end" }
  | { readonly kind: "impact"; readonly other: ActorId; readonly point: Readonly<Vec3> | null; readonly normal: Readonly<Vec3>; readonly impulse: number };

export interface BehaviorContext {
  readonly actor: WorldActor;
  readonly world: SubsystemContext;
  readonly deltaSeconds: number;
  /** Holds this behavior's tick callbacks while its events and messages stay active. */
  setTickEnabled(enabled: boolean): void;
  /** Runs each tick with the accumulated simulation time. Zero restores per-frame ticks. */
  setTickInterval(seconds: number): void;
  /** Removes the actor after this much simulation time. Zero cancels removal. */
  setLifeSpan(seconds: number): void;
  readonly timers: {
    /** Schedules a self-targeted message on this behavior's simulation clock. */
    after(seconds: number, message: string, payload?: Record<string, unknown>): string;
    clear(handle: string): void;
  };
  send(type: string, target: ActorId, payload?: Record<string, unknown>): void;
  emit(type: string, payload?: Record<string, unknown>): void;
}

export interface BehaviorDefinition {
  readonly id: string;
  readonly tick?: (context: BehaviorContext) => void;
  readonly events?: Partial<Record<BehaviorEvent["kind"], (context: BehaviorContext, event: BehaviorEvent) => void>>;
  readonly messages?: Readonly<Record<string, {
    readonly target: "self" | "any";
    handle(context: BehaviorContext, message: BehaviorMessage): void;
  }>>;
}

export function defineBehavior(definition: BehaviorDefinition): BehaviorDefinition {
  if (!COMPONENT_NAME_PATTERN.test(definition.id)) throw new SchemaDefinitionError(`Invalid behavior id "${definition.id}".`);
  return Object.freeze({
    ...definition,
    ...(definition.events ? { events: Object.freeze({ ...definition.events }) } : {}),
    ...(definition.messages ? { messages: Object.freeze({ ...definition.messages }) } : {}),
  });
}

export const BehaviorDefinitionsKey = createServiceKey<ReadonlyMap<string, BehaviorDefinition>>("forge.behavior.definitions");
