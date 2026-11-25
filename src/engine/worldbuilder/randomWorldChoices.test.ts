import { describe, expect, test } from "vitest";
import {
  asksForWater, DEFAULT_RANDOM_WORLD_CHOICES, freeWorldName, overviewCameraPose, parseRandomWorldEvent, plainFolderName, randomWorldRequest,
  readRandomWorldChoices, settleRandomWorldChoices,
} from "./randomWorldChoices.ts";

describe("random world choices", () => {
  test("an island keeps its roads and has no rivers; an ocean world is Small or Medium", () => {
    const island = settleRandomWorldChoices({ ...DEFAULT_RANDOM_WORLD_CHOICES, landform: "island", size: "large", rivers: 2, roads: "exits" });
    expect(island).toMatchObject({ size: "small", rivers: 0, roads: "between" });
    expect(settleRandomWorldChoices({ ...DEFAULT_RANDOM_WORLD_CHOICES, landform: "coast", rivers: 2 })).toMatchObject({ size: "medium", rivers: 2, roads: "exits" });
    expect(asksForWater(DEFAULT_RANDOM_WORLD_CHOICES)).toBe(false);
    expect(asksForWater(island)).toBe(true);
  });

  test("stored choices: usable fields are kept, the others fall back", () => {
    expect(readRandomWorldChoices(null)).toEqual(DEFAULT_RANDOM_WORLD_CHOICES);
    const read = readRandomWorldChoices({ seed: 7, size: "huge", cover: "alpine", lakes: 9, settlements: ["town", "city", 3], forest: "high" });
    expect(read).toEqual({ ...DEFAULT_RANDOM_WORLD_CHOICES, seed: 7, cover: "alpine", settlements: ["town"], forest: "high" });
    expect(readRandomWorldChoices({ settlements: ["city"] }).settlements).toEqual(DEFAULT_RANDOM_WORLD_CHOICES.settlements);
  });

  test("the request carries the densities as a group and settlements as entries", () => {
    expect(randomWorldRequest(DEFAULT_RANDOM_WORLD_CHOICES)).toMatchObject({
      settlements: [{ type: "village" }, { type: "hamlet" }], densities: { forest: "medium", rocks: "medium", fields: "medium" },
    });
  });

  test("folder names and the first free one", () => {
    expect(["My World", "a-1_b.c"].every(plainFolderName)).toBe(true);
    expect(["", ".a", "a ", "a.", "a/b", "dünya"].some(plainFolderName)).toBe(false);
    expect(freeWorldName((name) => name === "World_1" || name === "World_2")).toBe("World_3");
  });

  test("event lines: known ones are read, anything else is not an event", () => {
    expect(parseRandomWorldEvent('{"type":"progress","step":"paint"}')).toEqual({ type: "progress", step: "paint" });
    expect(parseRandomWorldEvent('{"type":"progress","step":"tea"}')).toBeNull();
    expect(parseRandomWorldEvent('{"type":"error"}')).toEqual({ type: "error", message: "The build failed." });
    expect(parseRandomWorldEvent("not json")).toBeNull();
  });

  test("the opening view looks 52° down, north up, at the ground north of the middle", () => {
    const pose = overviewCameraPose(1024, 10);
    // Forward (0, 0, -1) turned by the quaternion about X.
    const [x, , , w] = pose.quaternion;
    const forward = [0, 2 * x! * w!, -(1 - 2 * x! * x!)];
    const t = (10 - pose.position[1]) / forward[1]!;
    expect(pose.position[2] + t * forward[2]!).toBeCloseTo(-102.4, 6);
    expect(Math.atan2(-forward[1]!, -forward[2]!) * (180 / Math.PI)).toBeCloseTo(52, 6);
  });
});
