import { defineComponent, defineFeature, num } from "@forge/sdk";

export const Cargo = defineComponent("good.cargo", 1, { mass: num({ min: 0, default: 100 }) });
export const cargoFeature = defineFeature({ id: "good.cargo", components: [Cargo] });
