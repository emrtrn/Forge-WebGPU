import { defineFeature, defineSubsystem, normalizeJsonAsset, parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import type { AudioPlaybackHandle } from "../../engine/audio/audioTypes.ts";
import { AudioServiceKey } from "../../engine/audio/worldAudio.ts";
import { InputServiceKey } from "../../engine/input/inputService.ts";
import { PhysicsRuntimeKey } from "../../engine/physics/physicsService.ts";
import { createPhysicalMaterialSurfaceProvider } from "../../engine/physics/surface/surfaceResponse.ts";
import { vehicleEngineSoundLevels } from "../../engine/physics/vehicle/vehicleEngineSound.ts";
import { createReferenceCarDefinition, resolveVehicleDefinition, type VehicleDefinition } from "../../engine/physics/vehicle/vehicleTypes.ts";
import { VehicleServiceKey } from "../../engine/physics/vehicle/worldVehicle.ts";
import { TerrainResidencyKey } from "../../engine/terrain/terrainResidency.ts";
import { createTerrainSurfaceProvider } from "../../engine/terrain/terrainSurface.ts";
import { WorldJsonAssetsKey } from "../../engine/world/worldAssets.ts";
import { PlayerServiceKey } from "../../gameplay/player/playerSpawn.ts";
import { Vehicle, VehicleAsset } from "./schema.ts";

interface RuntimeVehicle {
  readonly actor: WorldActor;
  readonly playerInput: boolean;
  definition: VehicleDefinition | null;
  chassis: string | null;
  audio: AudioPlaybackHandle | null;
}

export default defineFeature({
  id: "forge.vehicle",
  components: [Vehicle],
  assetTypes: [VehicleAsset],
  subsystems: [defineSubsystem({
    id: "forge.vehicle",
    tickGroups: ["prePhysics", "postPhysics"],
    create(world) {
      const physics = world.services.get(PhysicsRuntimeKey);
      const assetLoader = world.services.get(WorldJsonAssetsKey);
      const assets = new Map<string, Promise<VehicleDefinition>>();
      const vehicles = new Map<ActorId, RuntimeVehicle>();
      const reference = () => createReferenceCarDefinition();
      if (physics) physics.physics.setVehicleSurfaceProvider(createTerrainSurfaceProvider(
        (id) => world.services.get(TerrainResidencyKey)?.samplerFor(id),
        createPhysicalMaterialSurfaceProvider((id) => physics.physics.colliderPhysicalMaterialId(id)),
      ));
      const load = (id: string): Promise<VehicleDefinition> => {
        let request = assets.get(id);
        if (!request) {
          request = (async () => {
            if (!assetLoader) return reference();
            const doc = normalizeJsonAsset(VehicleAsset, await assetLoader(id), { strict: true });
            if (!doc.ok || !doc.value) throw new Error(`Invalid vehicle asset ${id}.`);
            const { wheels, sound, ...data } = doc.value;
            return resolveVehicleDefinition({
              ...data, wheels: wheels.length ? wheels : reference().wheels,
              engineSound: sound ? { sound } : null,
            });
          })().catch((error: unknown) => {
            console.warn("forge vehicle: unable to load definition", error);
            return reference();
          });
          assets.set(id, request);
        }
        return request;
      };
      const add = (actors: readonly WorldActor[]) => {
        for (const actor of actors) {
          const component = Object.values(actor.components).find((entry) => parseComponentTypeTag(entry.type)?.name === Vehicle.name);
          if (!component) continue;
          const id = component.definition;
          const item: RuntimeVehicle = { actor, playerInput: component.playerInput === true, definition: null, chassis: null, audio: null };
          vehicles.set(actor.id, item);
          if (typeof id === "string") void load(id).then((definition) => { if (vehicles.get(actor.id) === item) item.definition = definition; });
          else item.definition = reference();
        }
      };
      const remove = (id: ActorId) => {
        const item = vehicles.get(id);
        if (!item) return;
        if (item.chassis) physics?.physics.removeVehicle(item.chassis);
        item.audio?.stop();
        vehicles.delete(id);
      };
      world.services.provide(VehicleServiceKey, {
        input(actor, input) {
          const item = vehicles.get(actor);
          if (!physics || !item?.chassis) return false;
          physics.physics.setVehicleInput(item.chassis, input);
          return true;
        },
        definition: (actor) => vehicles.get(actor)?.definition ?? null,
        state(actor) {
          const item = vehicles.get(actor);
          return item?.chassis ? physics?.physics.vehicleState(item.chassis) ?? null : null;
        },
      });
      return {
        actorsAdded: add,
        actorsRemoved(actors) { for (const { id } of actors) remove(id); },
        actorsChanged(changes) {
          for (const { actor, transformOnly } of changes) if (!transformOnly) { remove(actor.id); add([actor]); }
        },
        tick(group) {
          if (!physics) return;
          const driver = world.services.get(PlayerServiceKey)?.possessed();
          const input = world.services.get(InputServiceKey);
          for (const item of vehicles.values()) {
            if (!item.definition) continue;
            if (group === "prePhysics") {
              if (!item.chassis || !physics.physics.hasVehicle(item.chassis)) {
                item.chassis = [...physics.ids(item.actor.id)].find((id) => physics.physics.createVehicle(id, item.definition!)) ?? null;
              }
              if (!item.chassis || !item.playerInput || !input) continue;
              const driving = driver?.id === item.actor.id;
              const held = (action: string) => driving && input.get(action).held;
              physics.physics.setVehicleInput(item.chassis, {
                throttle: Number(held("move-forward")), brake: Number(held("move-back")),
                steer: Number(held("move-right")) - Number(held("move-left")), handbrake: held("jump"),
              });
            } else if (item.chassis && item.definition.engineSound) {
              const state = physics.physics.vehicleState(item.chassis);
              if (!state) continue;
              const sound = item.definition.engineSound;
              const position = item.actor.transform.p;
              const levels = vehicleEngineSoundLevels(sound, item.definition, state);
              item.audio ??= world.services.get(AudioServiceKey)?.play(sound.sound, { ...levels, loop: true,
                position, spatial: true, refDistance: sound.refDistance, maxDistance: sound.maxDistance }) ?? null;
              item.audio?.setPosition(position);
              item.audio?.setPitch(levels.pitch);
              item.audio?.setVolume(levels.volume, 0.05);
            }
          }
        },
        dispose() { for (const id of vehicles.keys()) remove(id); },
      };
    },
  })],
});
