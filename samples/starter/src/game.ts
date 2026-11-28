// The starter game module: the smallest game the engine opens. It imports
// nothing but @forge/sdk. A game adds its features (components, subsystems)
// to `features` and reacts to the start and end of play.
import { InputServiceKey, TimeControlKey, UiServiceKey, defineFeature, defineGameModule, defineSubsystem, type WidgetHandle } from "@forge/sdk";
import { thirdPerson } from "./tps.ts";

const CheckpointMenu = defineFeature({
  id: "starter.checkpoint",
  subsystems: [defineSubsystem({
    id: "starter.checkpoint",
    tickGroups: ["postPhysics"],
    create(world) {
      const input = world.services.require(InputServiceKey);
      const time = world.services.require(TimeControlKey);
      const ui = world.services.require(UiServiceKey);
      let open = false;
      let generation = 0;
      let handle: WidgetHandle | null = null;
      const close = () => {
        open = false;
        generation += 1;
        time.resume("starter.checkpoint");
        handle?.dispose();
        handle = null;
      };
      return {
        tick() {
          if (!input.get("menu").pressed) return;
          if (open) {
            close();
            return;
          }
          open = true;
          time.pause("starter.checkpoint");
          const ticket = ++generation;
          void ui.show("ast_1d6a8c427b8343e180ba871cbed4a552", {
            interactive: true,
            onMessage: (message) => { if (message === "menu:resume") close(); },
          }).then((widget) => {
            if (ticket !== generation) widget?.dispose();
            else if (widget) handle = widget;
            else close();
          }).catch((error: unknown) => {
            if (ticket !== generation) return;
            close();
            console.warn("Checkpoint menu could not open.", error);
          });
        },
        dispose: close,
      };
    },
  })],
});

export default defineGameModule({
  id: "starter.main",
  features: [CheckpointMenu],
  gameModes: [thirdPerson],
  onBeginPlay: (ctx) => {
    console.info(`Starter: playing with ${[...ctx.actors()].length} actor(s).`);
  },
});
