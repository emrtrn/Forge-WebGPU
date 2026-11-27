import { defineFeature, defineSubsystem } from "../../core/index.ts";
import { TimeControl, TimeControlKey } from "../../engine/time/timeControl.ts";

export default defineFeature({
  id: "forge.time",
  subsystems: [defineSubsystem({
    id: "forge.time",
    create(world) {
      const time = new TimeControl();
      world.services.provide(TimeControlKey, time);
      return { dispose: () => time.resumeAll() };
    },
  })],
});
