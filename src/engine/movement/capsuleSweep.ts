import type { ActorId, Vec3 } from "../../core/index.ts";
import { add, dot, length, scale, sub } from "../math/affine.ts";
import type { PhysicsService } from "../physics/physicsService.ts";

const SKIN = 0.016;
const WALKABLE_NORMAL_Y = 0.65;

export interface CapsuleDimensions {
  readonly radius: number;
  readonly height: number;
}

export interface CapsuleMove {
  readonly feet: Vec3;
  readonly grounded: boolean;
  readonly hitCeiling: boolean;
}

function capsule(physics: PhysicsService, actor: ActorId, feet: Vec3, dimensions: CapsuleDimensions, direction: Vec3, distance: number) {
  const halfHeight = Math.max(0, dimensions.height / 2 - dimensions.radius);
  return physics.castShape({
    shape: { kind: "capsule", radius: dimensions.radius, halfHeight },
    direction, distance,
    origin: [feet[0], feet[1] + dimensions.radius + halfHeight, feet[2]],
  }, { ignore: [actor] });
}

export function capsuleGrounded(physics: PhysicsService, actor: ActorId, feet: Vec3, dimensions: CapsuleDimensions): boolean {
  const hit = capsule(physics, actor, feet, dimensions, [0, -1, 0], 3 * SKIN);
  return hit !== null && hit.normal[1] >= WALKABLE_NORMAL_Y;
}

export function capsuleCanStand(physics: PhysicsService, actor: ActorId, feet: Vec3, radius: number, current: number, next: number): boolean {
  if (next <= current) return true;
  const origin: Vec3 = [feet[0], feet[1] + Math.max(radius, current - radius), feet[2]];
  return physics.castShape({
    shape: { kind: "sphere", radius },
    origin, direction: [0, 1, 0], distance: next - current + SKIN,
  }, { ignore: [actor] }) === null;
}

export function sweepCapsule(
  physics: PhysicsService, actor: ActorId, initialFeet: Vec3, dimensions: CapsuleDimensions, delta: Vec3,
): CapsuleMove {
  let feet = initialFeet;
  let remaining = delta;
  let hitCeiling = false;
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const distance = length(remaining);
    if (distance < 1e-6) break;
    const direction = scale(remaining, 1 / distance);
    const hit = capsule(physics, actor, feet, dimensions, direction, distance + SKIN);
    if (!hit) {
      feet = add(feet, remaining);
      break;
    }
    const advance = Math.max(0, hit.distance - SKIN);
    const step = scale(direction, advance);
    feet = add(feet, step);
    if (remaining[1] > 0 && hit.normal[1] < -0.3) hitCeiling = true;
    remaining = sub(remaining, step);
    const inward = dot(remaining, hit.normal);
    if (inward >= 0) break;
    remaining = sub(remaining, scale(hit.normal, inward));
  }
  return { feet, grounded: capsuleGrounded(physics, actor, feet, dimensions), hitCeiling };
}
