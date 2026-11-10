import { defineGameModule, type SubsystemContext } from "@forge/sdk";
import { cargoFeature } from "./cargo.ts";

export default defineGameModule({
  id: "good.main",
  features: [cargoFeature],
  onBeginPlay: (ctx: SubsystemContext) => {
    void ctx.componentsOf("good.cargo");
  },
});
