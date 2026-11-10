// The level assembler (architecture §4.7, D7): level data -> world. The
// editor viewport, editor Play and the standalone game build their world
// with this one function; the editor only adds its tools on top.
//
// Input is normalised level data: a whole level, or the persistent layer and
// the cells loaded so far (`mergeLevelParts`), or one more cell
// (`assembleActors`). An actor whose class is missing is an error in
// development; in a production build it is left out with a report, together
// with its child actors (the dropped-field rule, §4.5).

import { reportLoss, createContext, type ActorDoc, type ActorId, type ClassResolver, type Issue, type LevelDoc, type WorldActor } from "../core/index.ts";
import { WorldError, type World } from "./world.ts";

export interface AssembleOptions {
  readonly strict: boolean;
  readonly resolveClass: ClassResolver;
}

export interface AssembleResult {
  readonly actors: WorldActor[];
  readonly issues: readonly Issue[];
}

/** Adds actors to a world: a level's, or a cell's when it streams in. */
export function assembleActors(world: World, actors: readonly ActorDoc[], options: AssembleOptions): AssembleResult {
  const ctx = createContext(options);
  const skipped = new Set<ActorId>();
  actors.forEach((actor, index) => {
    if (actor.class !== null && !options.resolveClass(actor.class)) {
      reportLoss(ctx, "dangling-reference", `actors[${index}].class`, `Actor class ${actor.class} is not available; the actor is left out.`);
      skipped.add(actor.id);
    }
  });
  if (ctx.issues.some((issue) => issue.severity === "error")) {
    throw new WorldError("The level refers to actor classes that are not available.", ctx.issues);
  }
  // Children of a left-out actor go with it, at any depth.
  let grew = skipped.size > 0;
  while (grew) {
    grew = false;
    for (const actor of actors) {
      if (actor.parent !== null && skipped.has(actor.parent) && !skipped.has(actor.id)) {
        skipped.add(actor.id);
        grew = true;
      }
    }
  }
  const kept = skipped.size === 0 ? actors : actors.filter((actor) => !skipped.has(actor.id));
  return { actors: world.addActors(kept, "level"), issues: ctx.issues };
}

/** Builds a world's actors from a level. The world must be initialised. */
export function assembleLevel(world: World, level: LevelDoc, options: AssembleOptions): AssembleResult {
  return assembleActors(world, level.actors, options);
}
