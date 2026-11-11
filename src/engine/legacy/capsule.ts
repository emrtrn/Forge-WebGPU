// Ported from Forge WebGL engine/scene/capsule.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).
import type { Vec3 } from "./layout.ts";
import type { Entity, SceneJsonValue } from "./entity.ts";

export const DEFAULT_CAPSULE_RADIUS = 0.3;
export const DEFAULT_CAPSULE_HALF_HEIGHT = 0.9;

export interface CapsuleDimensions {
  /** Radius of the cylinder and both hemispherical end caps. */
  radius: number;
  /** Half-height from the capsule center to the top/bottom of the hemispheres. */
  halfHeight: number;
  /** Half-length of the straight cylinder section, excluding the hemispheres. */
  cylinderHalfHeight: number;
  /** Full AABB size used by existing collider and preview paths. */
  size: Vec3;
  /** Feet-at-origin center offset used by Character-style capsules. */
  center: Vec3;
}

export type CharacterCapsuleSource = "collider" | "legacyMovement" | "default";

export interface CharacterCapsuleResolution extends CapsuleDimensions {
  halfExtents: Vec3;
  source: CharacterCapsuleSource;
}

export function resolveCapsuleDimensions(
  radius = DEFAULT_CAPSULE_RADIUS,
  halfHeight = DEFAULT_CAPSULE_HALF_HEIGHT,
): CapsuleDimensions {
  const safeRadius = positiveOrDefault(radius, DEFAULT_CAPSULE_RADIUS);
  const safeHalfHeight = Math.max(positiveOrDefault(halfHeight, DEFAULT_CAPSULE_HALF_HEIGHT), safeRadius);
  return {
    radius: safeRadius,
    halfHeight: safeHalfHeight,
    cylinderHalfHeight: Math.max(0, safeHalfHeight - safeRadius),
    size: [safeRadius * 2, safeHalfHeight * 2, safeRadius * 2],
    center: [0, safeHalfHeight, 0],
  };
}

export function resolveCharacterCapsule(entity: Entity): CharacterCapsuleResolution {
  const collider = entity.components.Collider;
  if (collider?.shape === "capsule" && collider.isSensor !== true) {
    const dimensions = resolveCapsuleDimensions(
      readPositiveNumber(collider.capsuleRadius) ?? radiusFromSize(collider.size),
      readPositiveNumber(collider.capsuleHalfHeight) ?? halfHeightFromSize(collider.size),
    );
    return withCharacterCapsuleSource(dimensions, "collider");
  }

  const movement = entity.components.CharacterMovement;
  const legacyRadius = readPositiveNumber(movement?.capsuleRadius);
  const legacyHalfHeight = readPositiveNumber(movement?.capsuleHalfHeight);
  if (legacyRadius !== undefined || legacyHalfHeight !== undefined) {
    return withCharacterCapsuleSource(
      resolveCapsuleDimensions(
        legacyRadius ?? DEFAULT_CAPSULE_RADIUS,
        legacyHalfHeight ?? DEFAULT_CAPSULE_HALF_HEIGHT,
      ),
      "legacyMovement",
    );
  }

  return withCharacterCapsuleSource(resolveCapsuleDimensions(), "default");
}

function withCharacterCapsuleSource(
  dimensions: CapsuleDimensions,
  source: CharacterCapsuleSource,
): CharacterCapsuleResolution {
  return {
    ...dimensions,
    halfExtents: [dimensions.radius, dimensions.halfHeight, dimensions.radius],
    source,
  };
}

function radiusFromSize(value: SceneJsonValue | undefined): number | undefined {
  const size = readVec3(value);
  return size ? Math.max(size[0], size[2]) / 2 : undefined;
}

function halfHeightFromSize(value: SceneJsonValue | undefined): number | undefined {
  const size = readVec3(value);
  return size ? size[1] / 2 : undefined;
}

function readVec3(value: SceneJsonValue | undefined): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return undefined;
  return [x, y, z];
}

function readPositiveNumber(value: SceneJsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
