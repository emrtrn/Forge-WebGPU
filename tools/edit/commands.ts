// The agent's edit commands on a level session (A12; plan phase 4 step 9d).
// Every write is the editor's own operation (src/engine/edit, shared with
// the editor since step 9c) as one edit of the session:
//
// - add: the Add Actor rule (`newActorDoc`: a unique name, spatially loaded,
//   stored components normalised to their defaults), at the level root or
//   under a parent;
// - move: Details' transform fields (the actor's own transform, in its
//   parent's space) and the Outliner's reparenting (world placement kept);
// - delete: the editor's delete (everything under the actors goes too);
// - set: Details' field edit (a class actor gets an override of the field's
//   whole value, override rule v1); `actor.<field>` Details' actor fields;
// - reset: Details' override reset.
//
// Reading commands (find, show) see the session as the commands before them
// in the same run left it. A command that cannot run throws `CommandError`;
// the run then saves nothing.

import {
  componentTypeTag,
  effectiveComponents,
  parseComponentTypeTag,
  type ActorClassDoc,
  type ActorDoc,
  type ActorId,
  type ClassResolver,
  type ComponentMap,
  type LevelSession,
  type SchemaRegistry,
  type Transform,
  type Vec3,
} from "../../src/core/index.ts";
import { deletionOf, singletonOf, type OpsContext } from "../../src/engine/edit/actorOps.ts";
import { detailsTarget, editActor, editComponent, resetOverride } from "../../src/engine/edit/actorFields.ts";
import { reparentActors, worldMatrixOf } from "../../src/engine/edit/hierarchy.ts";
import { newActorDoc } from "../../src/engine/edit/newActor.ts";
import { eulerDegreesToQuaternion } from "../../src/engine/math/euler.ts";
import { transformPoint } from "../../src/engine/math/affine.ts";
import { CommandError, type Assignment, type Command } from "./args.ts";

/** An actor as the commands report it. */
export interface ActorSummary {
  readonly id: ActorId;
  readonly name: string;
  /** Its class's GUID, or null. */
  readonly class: string | null;
  /** Its components' type names (class ones included), in order. */
  readonly types: readonly string[];
  /** World position of its origin. */
  readonly position: Vec3;
  readonly parent: ActorId | null;
}

export type CommandOutcome =
  | { readonly kind: "find"; readonly total: number; readonly actors: readonly ActorSummary[] }
  | {
      readonly kind: "show";
      readonly actor: ActorSummary;
      /** The stored document; with `--effective`, a class actor's components resolved (class + overrides). */
      readonly doc: object;
    }
  | {
      readonly kind: "add" | "move" | "delete" | "set" | "reset";
      readonly actors: readonly ActorSummary[];
      /** What the edit changed on its own: a value clamped to its field's range (`act_….light.intensity: …`). */
      readonly warnings: readonly string[];
    };

export interface CommandContext {
  readonly session: LevelSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  /** A class by GUID or by file (a content label); undefined when none. */
  readonly findClass: (ref: string) => ActorClassDoc | undefined;
  /** A new actor GUID (tests pass a counter). */
  readonly newId?: () => ActorId;
}

const componentsOf = (context: CommandContext, doc: ActorDoc): ComponentMap =>
  doc.class === null ? doc.components : effectiveComponents(doc, context.resolveClass(doc.class));

const typeName = (type: string): string => parseComponentTypeTag(type)?.name ?? type;

/** Rounds float noise for reports (positions come out of matrices). */
const tidy = (value: number): number => (Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6)));

export function summaryOf(context: CommandContext, doc: ActorDoc): ActorSummary {
  const lookup = (id: ActorId) => context.session.actor(id);
  const position = transformPoint(worldMatrixOf(lookup, doc), [0, 0, 0]).map(tidy) as Vec3;
  return {
    id: doc.id,
    name: doc.name,
    class: doc.class,
    types: Object.values(componentsOf(context, doc)).map((component) => typeName(component.type)),
    position,
    parent: doc.parent,
  };
}

/** The actor an id or a unique id prefix names. */
export function resolveActor(context: CommandContext, ref: string): ActorDoc {
  const exact = context.session.actor(ref as ActorId);
  if (exact) return exact;
  if (ref.length < 6) throw new CommandError(`No actor ${ref}; give its GUID or a longer prefix (find lists them).`);
  const found = context.session.level.actors.filter((actor) => actor.id.startsWith(ref));
  if (found.length === 1) return found[0]!;
  if (found.length === 0) throw new CommandError(`No actor ${ref} in the level (find lists them).`);
  throw new CommandError(`${ref} names ${found.length} actors (${found.slice(0, 5).map((actor) => actor.id).join(", ")}${found.length > 5 ? ", …" : ""}); give more of the GUID.`);
}

function opsContext(context: CommandContext): OpsContext {
  return {
    lookup: (id) => context.session.actor(id),
    actors: () => context.session.level.actors,
    registry: context.registry,
    resolveClass: context.resolveClass,
    ...(context.newId ? { newId: context.newId } : {}),
  };
}

function classOf(context: CommandContext, ref: string): ActorClassDoc {
  const cls = context.findClass(ref);
  if (!cls) throw new CommandError(`No actor class ${ref} in the project (give its GUID or its file).`);
  return cls;
}

/** Runs one edit of the session; its errors become the command's error, its warnings are returned. */
function commit(context: CommandContext, label: string, docs: readonly ActorDoc[], removed: readonly ActorId[] = []): string[] {
  const result = context.session.edit(label, (tx) => {
    for (const doc of docs) tx.setActor(doc);
    for (const id of removed) tx.removeActor(id);
  });
  if (!result.ok) {
    throw new CommandError(result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  }
  return result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

/** The fields a component's path may start with: its definition's, and `local` for a spatial one. */
function fieldsOf(context: CommandContext, type: string): string[] | null {
  const def = context.registry.getComponent(typeName(type));
  if (!def) return null;
  return [...(def.spatial ? ["local"] : []), ...Object.keys(def.fields)];
}

const ACTOR_FIELDS = ["name", "spatiallyLoaded", "locked", "pivot", "transform"];

/** `doc` with one assignment applied, as Details applies a field edit. */
function assign(context: CommandContext, doc: ActorDoc, assignment: Assignment): ActorDoc {
  const [head, ...rest] = assignment.path;
  if (head === "actor") {
    if (rest.length === 0 || !ACTOR_FIELDS.includes(String(rest[0]))) {
      throw new CommandError(`${doc.id}: no actor field ${assignment.text}; actor fields: ${ACTOR_FIELDS.map((field) => `actor.${field}`).join(", ")}`);
    }
    return editActor(doc, rest, assignment.value);
  }
  const components = componentsOf(context, doc);
  const id = String(head);
  const component = components[id];
  if (!component) {
    throw new CommandError(`${doc.id} (${doc.name}) has no component ${id}; components: ${Object.keys(components).join(", ") || "none"} (actor fields: actor.name, …)`);
  }
  const fields = fieldsOf(context, component.type);
  if (rest.length === 0 || (fields !== null && !fields.includes(String(rest[0])))) {
    throw new CommandError(`${doc.id}: ${typeName(component.type)} has no field ${assignment.text}; fields: ${(fields ?? []).map((field) => `${id}.${field}`).join(", ")}`);
  }
  return editComponent(detailsTarget(doc, context.resolveClass), id, rest, assignment.value);
}

function moved(doc: ActorDoc, command: Extract<Command, { kind: "move" }>): ActorDoc {
  const transform: Transform = {
    p: command.to ?? (command.by ? [doc.transform.p[0] + command.by[0], doc.transform.p[1] + command.by[1], doc.transform.p[2] + command.by[2]] : doc.transform.p),
    r: command.rot ? eulerDegreesToQuaternion(command.rot) : doc.transform.r,
    s: command.scale ?? doc.transform.s,
  };
  return editActor(doc, ["transform"], transform);
}

export function runCommand(context: CommandContext, command: Command): CommandOutcome {
  const { session } = context;
  const summaries = (ids: readonly ActorId[]): ActorSummary[] => ids.flatMap((id) => {
    const doc = session.actor(id);
    return doc ? [summaryOf(context, doc)] : [];
  });
  switch (command.kind) {
    case "find": {
      const lookup = (id: ActorId) => session.actor(id);
      const name = command.name?.toLowerCase();
      const cls = command.cls === undefined ? undefined : classOf(context, command.cls);
      const found: ActorDoc[] = [];
      for (const doc of session.level.actors) {
        if (name !== undefined && !doc.name.toLowerCase().includes(name)) continue;
        if (cls !== undefined && doc.class !== cls.id) continue;
        if (command.component !== undefined) {
          const wanted = command.component;
          if (!Object.entries(componentsOf(context, doc)).some(([id, component]) => typeName(component.type) === wanted || id === wanted)) continue;
        }
        if (command.near) {
          const at = transformPoint(worldMatrixOf(lookup, doc), [0, 0, 0]);
          const [x, y, z] = command.near.at;
          if (Math.hypot(at[0] - x, at[1] - y, at[2] - z) > command.near.radius) continue;
        }
        found.push(doc);
      }
      if (command.near) {
        const [x, y, z] = command.near.at;
        const distance = (doc: ActorDoc): number => {
          const at = transformPoint(worldMatrixOf(lookup, doc), [0, 0, 0]);
          return Math.hypot(at[0] - x, at[1] - y, at[2] - z);
        };
        found.sort((a, b) => distance(a) - distance(b));
      }
      return { kind: "find", total: found.length, actors: found.slice(0, command.limit).map((doc) => summaryOf(context, doc)) };
    }
    case "show": {
      const doc = resolveActor(context, command.id);
      const shown: object = command.effective && doc.class !== null ? { ...doc, components: componentsOf(context, doc) } : doc;
      return { kind: "show", actor: summaryOf(context, doc), doc: shown };
    }
    case "add": {
      const cls = command.cls === undefined ? undefined : classOf(context, command.cls);
      const components: Record<string, { type: string }> = {};
      for (const { id, type } of command.components) {
        const def = context.registry.getComponent(typeName(type));
        if (!def) throw new CommandError(`No component type ${type}; the project's types are listed by the SDK and the features' READMEs.`);
        if (Object.hasOwn(components, id)) throw new CommandError(`Two components have the local id ${id}.`);
        components[id] = { type: componentTypeTag(def) };
      }
      const parent = command.parent === undefined ? null : resolveActor(context, command.parent).id;
      const firstDef = command.components[0] ? context.registry.getComponent(typeName(command.components[0].type)) : undefined;
      const label = command.name ?? cls?.name ?? firstDef?.label ?? "Empty Actor";
      const built = newActorDoc(
        {
          ...(context.newId ? { id: context.newId() } : {}),
          label,
          uniqueName: command.name === undefined,
          ...(cls ? { classId: cls.id } : { components }),
          parent,
          position: command.at ?? [0, 0, 0],
          rotation: command.rot ?? [0, 0, 0],
          ...(command.scale ? { scale: command.scale } : {}),
        },
        session.level.actors,
        { strict: true, registry: context.registry, resolveClass: context.resolveClass },
      );
      if (!built.ok) throw new CommandError(`The actor cannot be added: ${built.issues.map((issue) => `${issue.path} ${issue.message}`.trim()).join("; ")}`);
      // One per level (the editor's Add Actor selects the one there is instead).
      const single = singletonOf(opsContext(context), built.doc);
      if (single !== null) {
        const holder = session.level.actors.find((actor) => singletonOf(opsContext(context), actor) === single);
        if (holder) throw new CommandError(`The level already has a ${single} (${holder.id} "${holder.name}"); there is one per level.`);
      }
      let doc = built.doc;
      for (const assignment of command.sets) doc = assign(context, doc, assignment);
      const warnings = commit(context, `Add ${doc.name}`, [doc]);
      return { kind: "add", actors: summaries([doc.id]), warnings };
    }
    case "move": {
      const ids = [...new Set(command.ids.map((ref) => resolveActor(context, ref).id))];
      const warnings: string[] = [];
      if (command.parent !== undefined) {
        const parent = command.parent === null ? null : resolveActor(context, command.parent).id;
        const result = reparentActors((id) => session.actor(id), ids, parent);
        if (result.refused.length > 0) throw new CommandError(`${result.refused.join(", ")} cannot go under ${parent} (itself or one of its children).`);
        if (result.docs.length > 0) warnings.push(...commit(context, `Parent ${result.docs.length} to ${parent ?? "the level"}`, result.docs));
      }
      if (command.to || command.by || command.rot || command.scale) {
        warnings.push(...commit(context, `Move ${ids.length === 1 ? session.actor(ids[0]!)!.name : `${ids.length} actors`}`, ids.map((id) => moved(session.actor(id)!, command))));
      }
      return { kind: "move", actors: summaries(ids), warnings };
    }
    case "delete": {
      const ids = [...new Set(command.ids.map((ref) => resolveActor(context, ref).id))];
      const doomed = deletionOf(opsContext(context), ids);
      const reported = summaries(doomed);
      const warnings = commit(context, `Delete ${ids.length === 1 ? session.actor(ids[0]!)!.name : `${ids.length} actors`}`, [], doomed);
      return { kind: "delete", actors: reported, warnings };
    }
    case "set": {
      const docs = [...new Set(command.ids.map((ref) => resolveActor(context, ref)))].map((doc) => {
        let next = doc;
        for (const assignment of command.sets) next = assign(context, next, assignment);
        return next;
      });
      const warnings = commit(context, `Edit ${command.sets.map((one) => one.text).join(", ")}`, docs);
      return { kind: "set", actors: summaries(docs.map((doc) => doc.id)), warnings };
    }
    case "reset": {
      const docs = [...new Set(command.ids.map((ref) => resolveActor(context, ref)))].map((doc) => {
        if (doc.class === null) throw new CommandError(`${doc.id} (${doc.name}) has no class: nothing overrides it.`);
        if (!doc.overrides[command.component] && !componentsOf(context, doc)[command.component]) {
          throw new CommandError(`${doc.id} (${doc.name}) has no component ${command.component}.`);
        }
        return resetOverride(doc, command.component, command.field);
      });
      const warnings = commit(context, `Reset ${command.component}${command.field === null ? "" : `.${command.field}`}`, docs);
      return { kind: "reset", actors: summaries(docs.map((doc) => doc.id)), warnings };
    }
  }
}
