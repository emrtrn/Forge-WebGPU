import { defineFeature, defineSubsystem, type Vec2 } from "../../core/index.ts";
import { ActionMap } from "../../engine/input/actionMap.ts";
import { DEFAULT_INPUT_BINDINGS } from "../../engine/input/defaultInputBindings.ts";
import { InputHostKey, InputServiceKey } from "../../engine/input/inputService.ts";

export default defineFeature({
  id: "forge.input",
  subsystems: [defineSubsystem({
    id: "forge.input",
    tickGroups: ["prePhysics"],
    create(world) {
      const actions = new ActionMap(DEFAULT_INPUT_BINDINGS);
      const source = world.services.get(InputHostKey)?.(actions);
      const idle: Readonly<Vec2> = [0, 0];
      let pointer = idle;
      world.services.provide(InputServiceKey, {
        get: (action) => actions.get(action),
        axis: (axis) => actions.axis(axis),
        pointerDelta: () => pointer,
        bind: (code, action) => actions.bind(code, action),
        bindAxis: (code, axis, modifiers) => actions.bindAxis(code, axis, modifiers),
        setPointerLock: (enabled) => source?.setPointerLock(enabled),
        setTouchEnabled: (enabled) => source?.setTouchEnabled(enabled),
      });
      return {
        tick() {
          pointer = source?.poll() ?? idle;
          actions.advance();
        },
        dispose: () => source?.dispose(),
      };
    },
  })],
});
