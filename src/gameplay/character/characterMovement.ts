import { createServiceKey, type ActorId, type SubsystemContext, type Vec3 } from "../../core/index.ts";
import { capsuleCanStand, capsuleGrounded, sweepCapsule } from "../../engine/movement/capsuleSweep.ts";
import { PhysicsServiceKey } from "../../engine/physics/physicsService.ts";
import { TerrainResidencyKey } from "../../engine/terrain/terrainResidency.ts";
import { ActorMotionKey } from "../../engine/world/actorMotion.ts";

export interface CharacterMoveInput {
  /** Desired horizontal direction and magnitude, in world coordinates. */
  readonly x: number;
  readonly z: number;
  readonly sprint?: boolean;
  readonly jump?: boolean;
  readonly crouch?: boolean;
}

export interface CharacterMotion {
  readonly grounded: boolean;
  readonly crouched: boolean;
  readonly height: number;
}

export interface CharacterMovementService {
  move(actor: ActorId, input: CharacterMoveInput, dt: number): CharacterMotion | null;
}

export const CharacterMovementKey = createServiceKey<CharacterMovementService>("forge.characterMovement");

export function createCharacterMovement(
  world: SubsystemContext,
  nearbyCellsReady: (position: readonly [number, number], radius: number) => boolean,
) {
  const vertical = new Map<ActorId, { speed: number; height: number }>();
  const configs = new Map<ActorId, Record<string, unknown>>();
  const get = (id: ActorId) => {
    if (!configs.has(id)) {
      const entry = world.componentsOf("forge.characterMovement").find(({ actor }) => actor.id === id);
      if (entry) configs.set(id, entry.component);
    }
    return configs.get(id);
  };
  const number = (data: Record<string, unknown>, key: string, fallback: number) =>
    typeof data[key] === "number" ? data[key] as number : fallback;
  const ready = (feet: Vec3, radius: number): boolean => {
    const area: readonly [number, number] = [feet[0], feet[2]];
    if (!nearbyCellsReady(area, radius)) return false;
    const terrain = world.services.get(TerrainResidencyKey);
    if (!terrain) return true;
    return world.componentsOf("forge.terrain").every(({ actor, key, component }) =>
      typeof component.data !== "string" || terrain.has(actor.id, key)) && terrain.available(area, radius);
  };
  return {
    move(id: ActorId, input: CharacterMoveInput, dt: number): CharacterMotion | null {
      const actor = world.actor(id);
      const data = get(id);
      const physics = world.services.get(PhysicsServiceKey);
      if (!actor || actor.parent !== null || !data || !physics || !Number.isFinite(dt) || dt < 0 ||
          !Number.isFinite(input.x) || !Number.isFinite(input.z)) return null;
      const radius = number(data, "radius", 0.32);
      const standing = Math.max(radius * 2, number(data, "standingHeight", 1.8));
      const crouchedHeight = Math.max(radius * 2, Math.min(standing, number(data, "crouchedHeight", 1.2)));
      const feet = actor.transform.p;
      let state = vertical.get(id);
      if (!state) vertical.set(id, state = { speed: 0, height: standing });
      const desired = input.crouch ? crouchedHeight : standing;
      if (capsuleCanStand(physics, id, feet, radius, state.height, desired)) state.height = desired;
      const crouched = state.height < standing;
      const dimensions = { radius, height: state.height };
      let grounded = capsuleGrounded(physics, id, feet, dimensions);
      if (dt === 0 || !ready(feet, radius)) return { grounded, crouched, height: state.height };
      const jumpSpeed = number(data, "jumpSpeed", 6.9);
      let nextSpeed = grounded && state.speed <= 0 ? (input.jump ? jumpSpeed : 0) : state.speed;
      const gravity = number(data, "gravity", 22);
      const speed = crouched ? number(data, "crouchSpeed", 2.6) : input.sprint ? number(data, "sprintSpeed", 6.9) : number(data, "walkSpeed", 3);
      const magnitude = Math.max(1, Math.hypot(input.x, input.z));
      const dx = input.x / magnitude * speed * dt, dz = input.z / magnitude * speed * dt;
      const future: Vec3 = [feet[0] + dx, feet[1], feet[2] + dz];
      if (!ready(future, radius)) return { grounded, crouched, height: state.height };
      const deltaY = nextSpeed * dt - 0.5 * gravity * dt * dt;
      nextSpeed -= gravity * dt;
      const move = sweepCapsule(physics, id, feet, dimensions, [dx, deltaY, dz]);
      grounded = move.grounded;
      state.speed = (grounded && nextSpeed < 0) || move.hitCeiling ? 0 : nextSpeed;
      world.services.require(ActorMotionKey).setTransforms([{
        actor: id, transform: { ...actor.transform, p: move.feet },
      }], "forge.player");
      return { grounded, crouched, height: state.height };
    },
    forget(id: ActorId, resetMotion: boolean) {
      configs.delete(id);
      if (resetMotion) vertical.delete(id);
    },
  };
}
