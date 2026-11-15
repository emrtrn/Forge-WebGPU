import { describe, expect, test } from "vitest";
import type { ActorId } from "../../core/index.ts";
import { PUDDLE_APPEARANCE, type PuddleWaterBody } from "../terrain/puddleWater.ts";
import { PUDDLE_TAG, puddleActors } from "./puddles.ts";

const body = (patch: Partial<PuddleWaterBody> = {}): PuddleWaterBody => ({
  schema: 1, kind: "puddle", coordinateSpace: "world", id: "puddle-1", name: "Courtyard", terrainRef: "terrain",
  seed: [30, 0], bounds: { min: [24, -6], max: [36, 6] }, surfaceLevel: 10.2, ...patch,
});
const ids = (key: string) => `act_${key.replace(/[^a-z0-9]/g, "").padEnd(32, "0").slice(0, 32)}` as ActorId;
const puddleOf = (actor: unknown) => (actor as { components: Record<string, Record<string, unknown>> }).components.puddle!;
const water = (id: string) => (id === "t-water-n" ? "ast_0000000000000000000000000000beef" : null);

describe("Forge puddleWaters → forge.puddle actors", () => {
  test("the actor stands at the seed and level, in its cell; the area is the bounds' width; Forge's appearance written out", () => {
    const { actors, notes } = puddleActors([body({ locked: true, appearance: { color: "#112233", reflectionMode: "sharedPlanar", mudDensity: 18 } })], ids, water);
    expect(notes).toEqual([]);
    const [actor] = actors;
    expect(actor).toMatchObject({ name: "Courtyard", spatiallyLoaded: true, locked: true, transform: { p: [30, 10.2, 0] } });
    const component = puddleOf(actor);
    expect(component).toMatchObject({
      type: PUDDLE_TAG, size: 12, color: "#112233", mudDensity: 18, reflectionMode: "planar",
      reflectionQuality: PUDDLE_APPEARANCE.reflectionQuality, windNormal: "ast_0000000000000000000000000000beef",
      wheelRippleStrength: PUDDLE_APPEARANCE.wheelRippleStrength, windInfluence: PUDDLE_APPEARANCE.windInfluence,
    });
    expect("terrainRef" in component).toBe(false);
  });

  test("an old body without a mode keeps the environment reflection; hidden and a missing wind normal are reported; a rejected body is left out", () => {
    const { actors, notes } = puddleActors([body({ hidden: true }), { ...body(), id: "bad", bounds: { min: [0, 0], max: [1, 2] } }], ids, () => null);
    expect(actors).toHaveLength(1);
    expect(puddleOf(actors[0])).toMatchObject({ reflectionMode: "environment", windNormal: null });
    expect(notes.map((note) => note.field)).toEqual([
      "puddleWaters[].hidden",
      "puddleWaters[] (Invalid Puddle bounds/seed)",
      "puddleWaters[].windNormal=t-water-n",
    ]);
  });
});
