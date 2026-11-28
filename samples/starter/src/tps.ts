import {
  ActorMotionKey, CameraServiceKey, CharacterMovementKey, InputServiceKey, PlayerServiceKey, SkeletalClipsKey,
  createId, type GameModeDef, type Vec4,
} from "@forge/sdk";

const MODEL = "ast_6f235223d51f49b490a5c62d17b874ae";

export const thirdPerson: GameModeDef = {
  id: "starter.tps",
  label: "Third Person (TPS)",
  create(world) {
    const players = world.services.require(PlayerServiceKey);
    const movement = world.services.require(CharacterMovementKey);
    const camera = world.services.require(CameraServiceKey);
    const motion = world.services.require(ActorMotionKey);
    const input = world.services.require(InputServiceKey);
    const clips = world.services.require(SkeletalClipsKey);
    const existing = players.existing();
    const pawn = existing ?? players.spawn({
      name: "TPS Character",
      components: {
        movement: { type: "forge.characterMovement@1", player: true, walkSpeed: 1.6, sprintSpeed: 5.5 },
        body: { type: "forge.skeletalMesh@1", model: MODEL, clip: "Idle_Loop",
          local: { p: [0, 0, 0], r: [0, 1, 0, 0], s: [1, 1, 1] } },
      },
    });
    players.possess(pawn.id);
    const start = world.componentsOf("forge.playerStart").length ? players.start() : pawn.transform;
    if (existing) motion.setTransforms([{ actor: pawn.id, transform: { ...pawn.transform, p: start.p, r: start.r } }], "forge.player");
    let yaw = 2 * Math.atan2(start.r[1], start.r[3]);
    let pitch = -0.22;
    const rig = createId("actor");

    const orbit = (): Vec4 => {
      const x = Math.sin(pitch / 2), a = Math.cos(pitch / 2);
      const y = Math.sin(yaw / 2), b = Math.cos(yaw / 2);
      return [x * b, a * y, -x * y, a * b];
    };
    world.spawnActors([{
      id: rig, name: "TPS Camera", class: null, parent: null, spatiallyLoaded: false,
      transform: { p: [start.p[0], start.p[1] + 1.45, start.p[2]], r: orbit(), s: [1, 1, 1] },
      components: { camera: { type: "forge.camera@1", fov: 60 }, arm: { type: "forge.springArm@1", length: 3.8 } },
    }]);
    camera.follow(rig, "camera", "arm");
    input.setPointerLock(true);
    return {
      tick(dt) {
        const actor = world.actor(pawn.id);
        if (!actor) return;
        const [lookX, lookY] = input.pointerDelta();
        yaw -= lookX * 0.003;
        pitch = Math.max(-1.15, Math.min(0.65, pitch - lookY * 0.003));
        const forward = Number(input.get("move-forward").held) - Number(input.get("move-back").held);
        const right = Number(input.get("move-right").held) - Number(input.get("move-left").held);
        const x = -Math.sin(yaw) * forward + Math.cos(yaw) * right;
        const z = -Math.cos(yaw) * forward - Math.sin(yaw) * right;
        const sprint = input.get("sprint").held;
        const before = [...actor.transform.p];
        const result = movement.move(pawn.id, { x, z, sprint, jump: input.get("jump").pressed }, dt);
        const [px, py, pz] = actor.transform.p;
        const dx = px - before[0]!, dz = pz - before[2]!;
        const moving = Math.hypot(dx, dz) > 1e-4;
        const updates = [{ actor: rig, transform: { p: [px, py + 1.45, pz], r: orbit(), s: [1, 1, 1] } }] satisfies
          { actor: typeof rig; transform: typeof actor.transform }[];
        if (moving) {
          const halfYaw = Math.atan2(-dx, -dz) / 2;
          updates.push({ actor: pawn.id, transform: { ...actor.transform, r: [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)] } });
        }
        motion.setTransforms(updates, "forge.player");
        clips.play(pawn.id, "body", result && !result.grounded ? "Jump_Loop" : moving ? (sprint ? "Sprint_Loop" : "Walk_Loop") : "Idle_Loop");
      },
      dispose() {
        input.setPointerLock(false);
        camera.set(null);
        players.possess(null);
        clips.play(pawn.id, "body", null);
      },
    };
  },
};
