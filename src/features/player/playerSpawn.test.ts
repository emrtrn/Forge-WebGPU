import { afterEach, expect, test as check } from "vitest";
import { createSchemaRegistry, installFeatures, type ComponentMap, type Transform } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { CameraServiceKey } from "../../engine/camera/worldCamera.ts";
import { computePlayerStartSpawn, hasPlayerCharacter, PlayerServiceKey } from "../../gameplay/player/playerSpawn.ts";
import { createWorld } from "../../runtime/world.ts";
import behaviorFeature from "../behavior/feature.ts";
import playerFeature from "./feature.ts";

const features = [behaviorFeature, playerFeature];
let world: ReturnType<typeof createWorld> | undefined;

function openWorld() {
  const registry = createSchemaRegistry();
  installFeatures(features, registry);
  world = createWorld({ features, registry, strict: true, resolveClass: () => undefined });
  world.init();
  return world;
}

function addPawn({ context }: ReturnType<typeof createWorld>, components: ComponentMap) {
  const [pawn] = context.spawnActors([{
    id: actorId("e"), name: "Pawn", class: null, parent: null, spatiallyLoaded: false,
    transform: { p: [9, 9, 9], r: [0, 0, 0, 1], s: [1, 1, 1] }, components,
  }]);
  return pawn!;
}

afterEach(() => world?.dispose());

check("computePlayerStartSpawn: no marker spawns at the origin and keeps facing", () => {
  const scene = openWorld();
  const facing = [0, 1, 0, 0] as const;
  addPawn(scene, { behavior: { type: "forge.behavior@1", script: "input-move" } });
  expect(computePlayerStartSpawn(scene.context, { facing })).toEqual({ p: [0, 0, 0], r: facing, s: [1, 1, 1] });
});

check("hasPlayerCharacter: true for tagged or input-move, false otherwise", () => {
  const scene = openWorld();
  expect(hasPlayerCharacter(scene.context)).toBe(false);
  const spinning = addPawn(scene, { behavior: { type: "forge.behavior@1", script: "spin" } });
  expect(hasPlayerCharacter(scene.context)).toBe(false);
  scene.context.destroyActors([spinning.id]);
  const tagged = addPawn(scene, { movement: { type: "forge.characterMovement@1", player: true } });
  expect(hasPlayerCharacter(scene.context)).toBe(true);
  scene.context.destroyActors([tagged.id]);
  addPawn(scene, { behavior: { type: "forge.behavior@1", script: "input-move" } });
  expect(hasPlayerCharacter(scene.context)).toBe(true);
});

check("createDefaultPlayerCharacter: tagged input-move pawn placed at the spawn", () => {
  const scene = openWorld();
  const players = scene.services.require(PlayerServiceKey);
  scene.context.spawnActors([{
    id: actorId("b"), name: "Start", class: null, parent: null, spatiallyLoaded: false,
    transform: { p: [3, 0, -2], r: [0, Math.SQRT1_2, 0, Math.SQRT1_2], s: [1, 1, 1] },
    components: { start: { type: "forge.playerStart@1", tag: "main" } },
  }]);
  const pawn = players.spawn({ tag: "main", scale: 0.3 });
  expect(pawn.transform.p).toEqual([3, 0, -2]);
  expect(pawn.transform.r[1]).toBeCloseTo(Math.SQRT1_2);
  expect(pawn.transform.s).toEqual([0.3, 0.3, 0.3]);
  expect(pawn.components.movement).toMatchObject({ player: true, walkSpeed: 3 });
  expect(pawn.components.behavior).toMatchObject({ script: "input-move" });
  expect(players.existing()).toBe(pawn);
  expect(players.possessed()).toBe(pawn);
});

check("createDefaultPlayerCharacter: null yaw keeps a zero facing, defaults scale/speed", () => {
  const scene = openWorld();
  const pawn = scene.services.require(PlayerServiceKey).spawn();
  expect(pawn.transform).toEqual({ p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });
  expect(pawn.components.movement).toMatchObject({ walkSpeed: 3 });
});

check("camera view model selection uses component-local placement and follows actor lifetime", () => {
  const scene = openWorld();
  const camera = scene.services.require(CameraServiceKey);
  const model = `ast_${"b".repeat(32)}`;
  const local: Transform = { p: [0.3, -0.2, -1], r: [0, 0, 0, 1], s: [1, 1, 1] };
  const pawn = addPawn(scene, { camera: { type: "forge.camera@1" }, hands: { type: "forge.viewModel@1", model, local } });
  expect(camera.setViewModel(pawn.id, "hands")).toBe(true);
  expect(camera.setViewModel(pawn.id, "camera")).toBe(false);
  expect(camera.currentViewModel()).toEqual({ model, local, fov: 60 });
  camera.setViewModel(null);
  expect(camera.currentViewModel()).toBeNull();
  camera.setViewModel(pawn.id, "hands");
  scene.context.destroyActors([pawn.id]);
  expect(camera.currentViewModel()).toBeNull();
});
