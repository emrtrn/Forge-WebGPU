import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { createReferenceCarDefinition } from "../../engine/physics/vehicle/vehicleTypes.ts";
import { Collider } from "../physics/schema.ts";
import { Shape } from "../shape/schema.ts";
import { Vehicle, VehicleAsset } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.vehicle",
  components: { "forge.vehicle": { icon: "gameplay", outliner: "gameplay" } },
  newAssets: [{
    type: VehicleAsset.name, label: "Vehicle",
    values: { wheels: createReferenceCarDefinition().wheels },
  }],
  addActor: [{
    key: Vehicle.name, label: "Vehicle", category: "Gameplay", icon: "gameplay", lift: 0.7,
    components: {
      vehicle: { type: componentTypeTag(Vehicle) },
      chassis: { type: componentTypeTag(Collider), motion: "dynamic", size: [1.53, 0.48, 3.15], mass: 1150 },
      shape: { type: componentTypeTag(Shape), primitive: "cube", collision: false, color: "#517f98",
        local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [3.06, 0.96, 6.3] } },
    },
  }],
});
