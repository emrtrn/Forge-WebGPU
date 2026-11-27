import { parseComponentTypeTag, type Vec3, type WorldActor } from "../../core/index.ts";
import { decomposeMat4 } from "../../engine/math/affine.ts";
import { eulerDegreesFromQuaternion } from "../../engine/physics/physicsBodies.ts";
import type { ModelCollisionSource } from "../../engine/physics/physicsService.ts";
import type { PhysicsBody } from "../../engine/physics/physicsTypes.ts";
import { terrainTileHeightfield } from "../../engine/terrain/worldTerrainActor.ts";
import type { WorldTerrainDocument } from "../../engine/terrain/terrainLoader.ts";
import { actorMatrix, componentMatrix } from "../../engine/world/worldMatrices.ts";
import { resolveCollider } from "../physics/runtime.ts";

export const colliderTypes = ["forge.collider", "forge.blockingVolume", "forge.shape", "forge.staticMesh"];

export function previewBodies(
  actors: Iterable<WorldActor>,
  lookup: (id: WorldActor["id"]) => WorldActor | undefined,
  model: ModelCollisionSource | undefined,
  terrains: Iterable<WorldTerrainDocument>,
): PhysicsBody[] {
  const bodies: PhysicsBody[] = [];
  for (const actor of actors) {
    const matrix = actorMatrix(actor, lookup);
    if (Object.values(actor.components).some((component) => String(component.type).startsWith("forge.collider@") &&
        component.enabled === true && component.motion === "dynamic")) continue;
    for (const [key, component] of Object.entries(actor.components)) {
      const type = parseComponentTypeTag(component.type)?.name;
      if (!type || !colliderTypes.includes(type)) continue;
      const { p, r: [x, y, z, w], s } = decomposeMat4(componentMatrix(actor, key, matrix));
      const collider = resolveCollider(type, component, s, model);
      if (!collider || collider.isSensor) continue;
      bodies.push({ id: `${actor.id}/${key}`, transform: { position: p, rotation: eulerDegreesFromQuaternion({ x, y, z, w }), scale: [1, 1, 1] }, collider });
    }
  }
  let tileIndex = 0;
  for (const { def, tiles } of terrains) {
    if (!def.collision) continue;
    for (const tile of tiles.values()) {
      const { translation, primitive } = terrainTileHeightfield(def, tile);
      const scale: Vec3 = [1, 1, 1];
      bodies.push({
        id: `terrain/${tileIndex++}`, transform: { position: translation, rotation: [0, 0, 0], scale },
        collider: { shape: "heightfield", size: primitive.size, primitives: [primitive], navigationRole: "walkable", isStatic: true, isSensor: false },
      });
    }
  }
  return bodies;
}
