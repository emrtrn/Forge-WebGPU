// The light's editor helpers in an editor world (no GPU): an icon per light,
// tagged with its actor and placed at the light, the reach wire shown only
// while the actor is selected, Forge's wire sizes, and an edit moving the
// helper.

import { describe, expect, test } from "vitest";
import { Group, Sprite, SpriteNodeMaterial, Vector3, type LineSegments } from "three/webgpu";
import { float } from "three/tsl";
import { createSchemaRegistry, installFeatures, type ActorDoc, type ActorId, type Transform } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { createEditorHelpersFeature } from "../../render/editor/editorBinding.ts";
import { actorOfObject } from "../../render/sync/pickTags.ts";
import { createWorld } from "../../runtime/world.ts";
import lightHelpers, { lightWirePoints } from "./editorRender.ts";
import lightFeature from "./feature.ts";

const AT = (x: number): Transform => ({ p: [x, 2, 0], r: [0, 0, 0, 1], s: [3, 3, 3] });
const IDENTITY: Transform = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };

function boot() {
  const registry = createSchemaRegistry();
  installFeatures([lightFeature], registry);
  const root = new Group();
  const selected = new Set<ActorId>();
  const created: string[] = [];
  const helpers = createEditorHelpersFeature({
    bindings: [lightHelpers],
    features: [lightFeature],
    root,
    selected: () => selected,
    sceneVisibility: float(1),
    icons: {
      create: (key, _draw, scale = 0.5) => {
        created.push(key);
        const sprite = new Sprite(new SpriteNodeMaterial());
        sprite.scale.setScalar(scale);
        return sprite;
      },
      dispose: () => {},
    },
    camera: () => null,
  });
  const world = createWorld({ strict: true, registry, resolveClass: () => undefined, features: [lightFeature, helpers], mode: "editor" });
  world.init();
  const doc = (id: string, x: number, component: Record<string, unknown>): ActorDoc => ({
    id: actorId(id),
    name: id,
    class: null,
    parent: null,
    spatiallyLoaded: true,
    transform: AT(x),
    components: { light: { parent: null, local: IDENTITY, ...component } as never },
  });
  const point = doc("1", 4, { type: "forge.pointLight@1", color: "#ff0000", intensity: 5, castShadow: false, distance: 6, decay: 2 });
  const sun = doc("2", -4, { type: "forge.directionalLight@1", color: "#ffffff", intensity: 3, castShadow: true, cascadedShadows: false, atmosphereSun: true });
  world.addActors([point, sun], "level");
  world.beginPlay();
  world.tick(0.016);
  const sprites = (): Sprite[] => {
    const found: Sprite[] = [];
    root.traverse((object) => {
      if ((object as Sprite).isSprite) found.push(object as Sprite);
    });
    return found;
  };
  const wireOf = (id: string): LineSegments => {
    const icon = sprites().find((sprite) => actorOfObject(sprite) === actorId(id))!;
    return icon.parent!.getObjectByName("light-wire") as LineSegments;
  };
  return { world, root, selected, created, sprites, wireOf, point };
}

describe("light editor helpers (Forge's light gizmo, plan phase 4 step 3)", () => {
  test("one icon per light at the light, a sun or a bulb, tagged with its actor; the actor's scale does not stretch it", () => {
    const { created, sprites } = boot();
    expect(created.sort()).toEqual(["light-bulb", "light-sun"]);
    const icons = sprites();
    expect(icons).toHaveLength(2);
    const bulb = icons.find((icon) => actorOfObject(icon) === actorId("1"))!;
    expect(bulb.getWorldPosition(new Vector3()).toArray()).toEqual([4, 2, 0]);
    expect(bulb.parent!.scale.toArray()).toEqual([1, 1, 1]);
    expect(bulb.scale.x).toBeCloseTo(0.55);
  });

  test("the reach wire shows only while the light's actor is selected and never takes a click", () => {
    const { world, selected, wireOf } = boot();
    expect(wireOf("1").visible).toBe(false);
    selected.add(actorId("1"));
    world.tick(0.016);
    expect(wireOf("1").visible).toBe(true);
    expect(wireOf("2").visible).toBe(false);
    const hits: unknown[] = [];
    wireOf("1").raycast({} as never, hits as never);
    expect(hits).toEqual([]);
  });

  test("an edit moves the helper (removed and added again)", () => {
    const { world, sprites, point } = boot();
    world.updateActors([{ ...point, transform: { ...point.transform, p: [9, 1, 0] } }]);
    const bulb = sprites().find((icon) => actorOfObject(icon) === actorId("1"))!;
    expect(bulb.getWorldPosition(new Vector3()).toArray()).toEqual([9, 1, 0]);
    expect(sprites()).toHaveLength(2);
  });

  test("Forge's wire sizes: a point light's three circles at its distance, a spot cone, a directional aim line", () => {
    const sphere = lightWirePoints("point", { distance: 6 });
    expect(sphere).toHaveLength(3 * 32 * 6);
    expect(Math.hypot(sphere[0]!, sphere[1]!, sphere[2]!)).toBeCloseTo(6);
    expect(lightWirePoints("point", { distance: 0 }).slice(0, 3).map((n) => Math.abs(n))).toContain(1);
    const cone = lightWirePoints("spot", { distance: 10, angle: 45 });
    expect(cone).toHaveLength((24 + 4) * 6);
    expect(cone[2]).toBeCloseTo(-10);
    expect(Math.hypot(cone[0]!, cone[1]!)).toBeCloseTo(10);
    expect(lightWirePoints("directional", {})).toEqual([0, 0, 0, 0, 0, -1.2]);
  });
});
