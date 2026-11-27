import { defineFeature, defineSubsystem } from "../../core/index.ts";
import { evaluatePerception } from "../../engine/perception/perception.ts";
import { PerceptionServiceKey } from "../../engine/perception/worldPerception.ts";
import { PhysicsRuntimeKey } from "../../engine/physics/physicsService.ts";

export default defineFeature({
  id: "forge.perception",
  subsystems: [defineSubsystem({
    id: "forge.perception",
    create(world) {
      world.services.provide(PerceptionServiceKey, {
        evaluate(input) {
          const blockers = input.blockers ?? world.services.get(PhysicsRuntimeKey)?.physics.staticBlockerAabbs() ?? [];
          return evaluatePerception({ ...input, blockers });
        },
      });
      return {};
    },
  })],
});
