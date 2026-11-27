// A new actor's document, as Add Actor makes it (INV-A11, plan phase 4 step
// 5d; moved here in step 9c so the agent's `add` makes the same one, A12):
// a fresh GUID, a name no other actor of the level has (Forge's `Name 2`),
// spatially loaded, its transform from a position, XYZ degrees and a scale; a
// class actor with no overrides, a plain one with the stored components it
// is given (normalisation fills their defaults).

import {
  createId,
  normalizeActorDoc,
  type ActorDoc,
  type ActorId,
  type Issue,
  type LevelNormalizeOptions,
  type Vec3,
} from "../../core/index.ts";
import { eulerDegreesToQuaternion } from "../math/euler.ts";
import { uniqueName } from "./actorOps.ts";

export interface NewActorSpec {
  /** Default: a new GUID. */
  readonly id?: ActorId;
  /** The name, made unique in the level unless `uniqueName` is false. */
  readonly label: string;
  readonly uniqueName?: boolean;
  /** A class actor (prefab) of this class. */
  readonly classId?: string;
  /** A plain actor's components: local id -> stored component (`type` tag and the fields that differ from the defaults). */
  readonly components?: Readonly<Record<string, Readonly<{ type: string } & Record<string, unknown>>>>;
  readonly parent?: ActorId | null;
  readonly spatiallyLoaded?: boolean;
  /** In the parent's space (the world at the level root). */
  readonly position: Vec3;
  /** XYZ degrees. */
  readonly rotation?: Vec3 | readonly [number, number, number];
  readonly scale?: Vec3;
}

export type NewActorResult = { readonly ok: true; readonly doc: ActorDoc; readonly issues: readonly Issue[] } | { readonly ok: false; readonly issues: readonly Issue[] };

export function newActorDoc(spec: NewActorSpec, level: readonly ActorDoc[], options: LevelNormalizeOptions): NewActorResult {
  const raw = {
    id: spec.id ?? createId("actor"),
    name: spec.uniqueName === false ? spec.label : uniqueName(spec.label, new Set(level.map((actor) => actor.name))),
    class: spec.classId ?? null,
    parent: spec.parent ?? null,
    spatiallyLoaded: spec.spatiallyLoaded ?? true,
    transform: { p: [...spec.position], r: eulerDegreesToQuaternion([...(spec.rotation ?? [0, 0, 0])] as [number, number, number]), s: [...(spec.scale ?? [1, 1, 1])] },
    ...(spec.classId ? { overrides: {} } : { components: structuredClone(spec.components ?? {}) }),
  };
  const result = normalizeActorDoc(raw, options);
  if (!result.ok || !result.value) return { ok: false, issues: result.issues };
  return { ok: true, doc: result.value, issues: result.issues };
}
