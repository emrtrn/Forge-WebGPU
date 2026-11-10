import { describe, expect, expectTypeOf, test } from "vitest";
import {
  createComponent,
  createSchemaRegistry,
  installFeatures,
  normalizeComponent,
} from "../../core/index.ts";
import heightFogFeature from "./feature.ts";
import { HeightFog, type HeightFogData } from "./schema.ts";

describe("height fog schema", () => {
  test("defaults are the ones Forge WebGL shipped", () => {
    expect(createComponent(HeightFog)).toEqual({
      type: "forge.heightFog@1",
      mode: "exp",
      color: "#bcc6d1",
      density: 0.03,
      heightFalloff: 0,
      baseHeight: 0,
      startDistance: 0,
      maxOpacity: 1,
      sunColor: "#ffe2bd",
      sunStrength: 0,
      start: 5,
      end: 60,
    });
  });

  test("the TypeScript type comes from the definition", () => {
    expectTypeOf<HeightFogData["mode"]>().toEqualTypeOf<"exp" | "linear">();
    expectTypeOf<HeightFogData["density"]>().toEqualTypeOf<number>();
    expectTypeOf<HeightFogData["sunColor"]>().toEqualTypeOf<string>();
  });

  test("is a singleton and not spatial", () => {
    expect(HeightFog.singleton).toBe(true);
    expect(HeightFog.spatial).toBe(false);
  });

  test("every field has a Turkish hint", () => {
    for (const [key, field] of Object.entries(HeightFog.fields)) {
      expect(field.hint, key).toBeTruthy();
    }
    expect(HeightFog.hint).toBeTruthy();
  });

  test("an authored value outside its range is clamped", () => {
    const result = normalizeComponent(
      HeightFog,
      { type: "forge.heightFog@1", density: 0.02, maxOpacity: 1.5, heightFalloff: 0.2 },
      { strict: true },
    );
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ density: 0.02, maxOpacity: 1, heightFalloff: 0.01 });
    expect(result.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      "clamped heightFalloff",
      "clamped maxOpacity",
    ]);
  });
});

describe("height fog feature", () => {
  test("installs its component through the registration point", () => {
    const registry = createSchemaRegistry();
    installFeatures([heightFogFeature], registry);
    expect(registry.getComponent("forge.heightFog")).toBe(HeightFog);
  });
});
