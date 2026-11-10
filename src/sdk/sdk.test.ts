import { describe, expect, test } from "vitest";
import * as sdk from "./index.ts";

describe("@forge/sdk", () => {
  test("the runtime surface is exactly the listed names", () => {
    expect(Object.keys(sdk).sort()).toEqual([
      "SDK_VERSION",
      "TICK_GROUPS",
      "actorRef",
      "array",
      "assetRef",
      "bool",
      "color",
      "createId",
      "createServiceKey",
      "defineAssetType",
      "defineComponent",
      "defineFeature",
      "defineGameModule",
      "defineSubsystem",
      "enumOf",
      "isId",
      "num",
      "object",
      "text",
      "transform",
      "vec2",
      "vec3",
      "vec4",
    ]);
  });

  test("a game can define a component, a feature and its module with it alone", () => {
    const Cargo = sdk.defineComponent("mygame.cargo", 1, { mass: sdk.num({ min: 0, default: 100 }) });
    const feature = sdk.defineFeature({ id: "mygame.cargo", components: [Cargo] });
    const module = sdk.defineGameModule({ id: "mygame.main", features: [feature] });
    expect(module.features[0]?.components[0]?.name).toBe("mygame.cargo");
  });
});
