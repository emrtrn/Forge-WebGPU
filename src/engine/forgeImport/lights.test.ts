import { describe, expect, test } from "vitest";
import type { ActorId, JsonObject } from "../../core/index.ts";
import { forgeLightSources, forgeSunIndex, lightActors } from "./lights.ts";
import { eulerXyzQuaternion } from "./placements.ts";

const ids = (key: string) => `act_${key}` as ActorId;

describe("Forge lights as light actors", () => {
  test("each type gets its component with Forge's defaults written out", () => {
    const { actors } = lightActors(
      [
        { light: { id: "sun", type: "directional", position: [3, 9, 4], rotation: [-55, 35, 0], name: "Sun", color: "#FFF4E0", intensity: 4, castShadow: true, cascadedShadows: true }, keyPrefix: "" },
        { light: { id: "lamp", type: "point", position: [1, 2, 3] }, keyPrefix: "" },
        { light: { id: "torch", type: "spot", position: [0, 3, 0], rotation: [-90, 0, 0], castShadow: true, spatiallyLoaded: false }, keyPrefix: "" },
      ],
      ids,
    );
    expect(actors.map((actor) => [actor.name, actor.spatiallyLoaded])).toEqual([["Sun", false], ["lamp", true], ["torch", false]]);
    const [sun, lamp, torch] = actors.map((actor) => (actor.class === null ? actor.components.light : null));
    expect(sun).toMatchObject({ type: "forge.directionalLight@1", color: "#fff4e0", intensity: 4, castShadow: true, cascadedShadows: true, atmosphereSun: true });
    expect(actors[0]!.transform).toEqual({ p: [3, 9, 4], r: eulerXyzQuaternion(-55, 35, 0), s: [1, 1, 1] });
    expect(lamp).toEqual({
      type: "forge.pointLight@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      color: "#ffffff", intensity: 2.5, distance: 8, decay: 2, castShadow: false,
    });
    expect(torch).toMatchObject({ type: "forge.spotLight@1", intensity: 3, distance: 10, angle: 30, penumbra: 0.35, decay: 2, castShadow: true });
  });

  test("the sun is Forge's: the `sun` id, else the first directional light", () => {
    const light = (id: string, type = "directional"): JsonObject => ({ id, type, position: [0, 0, 0] });
    expect(forgeSunIndex([light("a"), light("sun"), light("b")])).toBe(1);
    expect(forgeSunIndex([light("p", "point"), light("a"), light("b")])).toBe(1);
    expect(forgeSunIndex([light("p", "point")])).toBe(-1);
    const { actors } = lightActors([{ light: light("a"), keyPrefix: "" }, { light: light("b"), keyPrefix: "" }], ids);
    expect(actors.map((actor) => actor.class === null && actor.components.light!.atmosphereSun)).toEqual([true, false]);
  });

  test("cell lights come after the level's, keyed by their cell; unknown types and unread fields are reported", () => {
    const sources = forgeLightSources(
      { lights: [{ id: "l1", type: "point", position: [0, 0, 0], hidden: false }] },
      [{ key: "1_0", doc: { lights: [{ id: "l1", type: "point", position: [130, 0, 0], groupId: "g" }, { type: "ambient" }] } }],
    );
    expect(sources.map((source) => source.keyPrefix)).toEqual(["", "cells/1_0/", "cells/1_0/"]);
    const { actors, unknownTypes, unread } = lightActors(sources, ids);
    expect(actors.map((actor) => actor.id)).toEqual(["act_light/l1", "act_cells/1_0/light/l1"]);
    expect([...unknownTypes]).toEqual([["ambient", 1]]);
    expect([...unread]).toEqual([["groupId", 1]]);
  });
});
