import { defineFeature, defineSubsystem, parseComponentTypeTag, type ActorId } from "../../core/index.ts";
import { CameraServiceKey, type RuntimeCameraPose } from "../../engine/camera/worldCamera.ts";
import { TerrainPhysicsFocusKey } from "../../engine/terrain/terrainResidency.ts";
import { CharacterMovementKey, createCharacterMovement } from "../../gameplay/character/characterMovement.ts";
import { createPlayerService, PlayerServiceKey } from "../../gameplay/player/playerSpawn.ts";
import { CellStreamingKey } from "../../runtime/streaming/cellStreaming.ts";
import { PhysicsServiceKey } from "../../engine/physics/physicsService.ts";
import { add, decomposeMat4, rotate, scale } from "../../engine/math/affine.ts";
import { actorMatrix, componentMatrix } from "../../engine/world/worldMatrices.ts";
import { Camera, CharacterMovement, GameplaySpline, Interaction, PlayerStart, SpringArm, TargetPoint } from "./schema.ts";

export default defineFeature({
  id: "forge.player",
  components: [PlayerStart, CharacterMovement, TargetPoint, Interaction, Camera, SpringArm, GameplaySpline],
  subsystems: [defineSubsystem({
    id: "forge.player",
    create(world) {
      const player = createPlayerService(world);
      world.services.provide(PlayerServiceKey, player);
      world.services.provide(TerrainPhysicsFocusKey, {
        sources() {
          const pawn = player.possessed();
          return pawn ? [{ position: [pawn.transform.p[0], pawn.transform.p[2]] }] : null;
        },
      });
      const movement = createCharacterMovement(world, (position, radius) =>
        world.services.get(CellStreamingKey)?.isAreaActive(position, radius) ?? true);
      world.services.provide(CharacterMovementKey, movement);
      let pose: RuntimeCameraPose | null = null;
      let follow: { actor: ActorId; camera: string; arm: string | undefined } | null = null;
      world.services.provide(CameraServiceKey, {
        set(next) {
          if (next && (!next.position.every(Number.isFinite) || !next.quaternion.every(Number.isFinite) ||
              !Number.isFinite(next.fov) || next.fov <= 0 || next.fov >= 180)) return;
          follow = null;
          pose = next ? structuredClone(next) : null;
        },
        follow(id, camera, arm) {
          const actor = world.actor(id);
          if (parseComponentTypeTag(actor?.components[camera]?.type)?.name !== Camera.name ||
              (arm !== undefined && parseComponentTypeTag(actor?.components[arm]?.type)?.name !== SpringArm.name)) return false;
          follow = { actor: id, camera, arm };
          pose = null;
          return true;
        },
        current() {
          if (!follow) return pose;
          const actor = world.actor(follow.actor);
          const camera = actor?.components[follow.camera];
          if (!actor || !camera) return null;
          const { p, r } = decomposeMat4(componentMatrix(actor, follow.camera, actorMatrix(actor, world.actor)));
          const arm = follow.arm ? actor.components[follow.arm] : null;
          if (!arm || typeof arm.length !== "number" || typeof arm.probeRadius !== "number") {
            return { position: p, quaternion: r, fov: camera.fov as number };
          }
          const direction = rotate(r, [0, 0, 1]);
          const hit = world.services.get(PhysicsServiceKey)?.castShape({
            origin: p, direction, distance: arm.length, shape: { kind: "sphere", radius: arm.probeRadius },
          }, { ignore: [actor.id], channel: "camera" });
          return { position: add(p, scale(direction, hit ? Math.max(0, hit.distance - 0.015) : arm.length)),
            quaternion: r, fov: camera.fov as number };
        },
      });
      return {
        actorsRemoved: (actors) => { for (const actor of actors) movement.forget(actor.id, true); },
        actorsChanged(changes) {
          for (const { actor, transformOnly, source } of changes) {
            if (!transformOnly || source !== "forge.player") movement.forget(actor.id, true);
          }
        },
      };
    },
  })],
});
