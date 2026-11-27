import { createId, createServiceKey, type ActorId, type ComponentMap, type SubsystemContext, type Transform, type Vec4, type WorldActor } from "../../core/index.ts";
import { decomposeMat4, rotate } from "../../engine/math/affine.ts";
import { actorMatrix, componentMatrix } from "../../engine/world/worldMatrices.ts";

export interface PlayerStartOptions {
  readonly tag?: string;
  readonly facing?: Readonly<Vec4>;
}

export interface PlayerService {
  start(options?: PlayerStartOptions): Transform;
  existing(): WorldActor | undefined;
  spawn(options?: PlayerStartOptions & { readonly components?: ComponentMap; readonly name?: string; readonly scale?: number }): WorldActor;
  possess(actor: ActorId | null): void;
  possessed(): WorldActor | undefined;
}

export const PlayerServiceKey = createServiceKey<PlayerService>("forge.player");

export function computePlayerStartSpawn(world: SubsystemContext, { tag, facing }: PlayerStartOptions = {}): Transform {
  const starts = world.componentsOf("forge.playerStart");
  const chosen = (tag ? starts.find(({ component }) => component.tag === tag) : undefined) ?? starts[0];
  if (!chosen) return { p: [0, 0, 0], r: facing ? [...facing] : [0, 0, 0, 1], s: [1, 1, 1] };
  const actor = chosen.actor;
  const pose = decomposeMat4(componentMatrix(actor, chosen.key, actorMatrix(actor, world.actor)));
  const forward = rotate(pose.r, [0, 0, -1]);
  const yaw = Math.atan2(-forward[0], -forward[2]);
  return { p: pose.p, r: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], s: [1, 1, 1] };
}

export function hasPlayerCharacter(world: SubsystemContext): boolean {
  return findPlayerCharacter(world) !== undefined;
}

function findPlayerCharacter(world: SubsystemContext): WorldActor | undefined {
  return world.componentsOf("forge.characterMovement").find(({ component }) => component.player === true)?.actor
    ?? world.componentsOf("forge.behavior").find(({ component }) => component.script === "input-move")?.actor;
}

export function createPlayerService(world: SubsystemContext): PlayerService {
  let current: ActorId | null = null;
  return {
    start: (options) => computePlayerStartSpawn(world, options),
    existing: () => findPlayerCharacter(world),
    spawn(options = {}) {
      const transform = computePlayerStartSpawn(world, options);
      if (options.scale !== undefined) transform.s = [options.scale, options.scale, options.scale];
      const [actor] = world.spawnActors([{
        id: createId("actor"), name: options.name ?? "Player",
        class: null, parent: null, spatiallyLoaded: false, transform,
        components: options.components ?? {
          movement: { type: "forge.characterMovement@1", player: true },
          behavior: { type: "forge.behavior@1", script: "input-move" },
        },
      }]);
      if (!actor) throw new Error("The supplied player pawn could not be spawned.");
      current = actor.id;
      return actor;
    },
    possess(actor) {
      if (actor && !world.actor(actor)) throw new Error(`Cannot possess an actor outside the World: ${actor}.`);
      current = actor;
    },
    possessed: () => current === null ? undefined : world.actor(current),
  };
}
