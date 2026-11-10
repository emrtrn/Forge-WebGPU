// The starter game module: the smallest game the engine opens. It imports
// nothing but @forge/sdk. A game adds its features (components, subsystems)
// to `features` and reacts to the start and end of play.
import { defineGameModule } from "@forge/sdk";

export default defineGameModule({
  id: "starter.main",
  features: [],
  onBeginPlay: (ctx) => {
    console.info(`Starter: playing with ${[...ctx.actors()].length} actor(s).`);
  },
});
