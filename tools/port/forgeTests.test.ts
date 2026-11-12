import { describe, expect, test } from "vitest";
import { analyzeSource, areaOf, classifyCheck, deferredTo, droppedBy, droppedCheck, isMathOnlyThreeArea, isOldModelModule, isOldLevelData, type ModuleFacts } from "./forgeTests.ts";

const analyze = (text: string) => analyzeSource("tests/engine/sample.test.ts", text);

describe("analyzeSource: what a check reaches", () => {
  test("type-only imports and type positions do not count; value uses do", () => {
    const result = analyze(`
      import type { RoomLayout } from "../../engine/scene/layout";
      import { type Grid, makeGrid } from "../../engine/terrain/grid";
      import { normalize } from "../../engine/environment/wind";
      export function registerTests(check: Check): void {
        check("grid", () => {
          const layout: RoomLayout = { schema: 1 } as RoomLayout;
          const grid: Grid = makeGrid(4);
          void layout; void grid;
        });
      }
    `);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.specifiers).toEqual(["../../engine/terrain/grid"]);
    expect(result.valueSpecifiers).toEqual(["../../engine/terrain/grid"]);
  });

  test("a helper's imports reach the check that calls it, transitively", () => {
    const result = analyze(`
      import { validateLayout } from "../../tools/saveValidator";
      import { resolveWind } from "../../engine/environment/wind";
      function level() { return validateLayout({}); }
      const fixture = () => level();
      export function registerTests(check: Check): void {
        check("wind alone", () => resolveWind(1));
        check("through the validator", () => fixture());
      }
    `);
    expect(result.checks.map((found) => found.specifiers)).toEqual([
      ["../../engine/environment/wind"],
      ["../../tools/saveValidator"],
    ]);
  });

  test("a name declared in one check does not leak into another (lexical scope)", () => {
    const result = analyze(`
      import { loadLevel } from "../../engine/scene/level";
      import { bake } from "../../engine/terrain/bake";
      export function registerTests(check: Check): void {
        check("scene", () => { const result = loadLevel(); void result; });
        check("terrain", () => { const result = bake(); void result; });
      }
    `);
    expect(result.checks.map((found) => found.specifiers)).toEqual([
      ["../../engine/scene/level"],
      ["../../engine/terrain/bake"],
    ]);
  });

  test("a parameter shadows an import of the same name", () => {
    const result = analyze(`
      import { terrain } from "../../engine/terrain/terrain";
      const measure = (terrain: number) => terrain * 2;
      export function registerTests(check: Check): void {
        check("shadowed", () => measure(3));
      }
    `);
    expect(result.checks[0]!.specifiers).toEqual([]);
  });

  test("a loop variable carries the iterable; the label is not followed", () => {
    const result = analyze(`
      import { CASES } from "../../engine/ai/cases";
      import { describeCase } from "../../engine/scene/describe";
      export function registerTests(check: Check): void {
        for (const item of CASES) {
          check(\`case \${describeCase(item)}\`, () => { void item; });
        }
      }
    `);
    expect(result.checks[0]!.dynamicLabel).toBe(true);
    expect(result.checks[0]!.specifiers).toEqual(["../../engine/ai/cases"]);
  });

  test("string literals and dynamic imports in the body are recorded", () => {
    const result = analyze(`
      import { readFileSync } from "node:fs";
      export async function registerTests(checkAsync: CheckAsync): Promise<void> {
        await checkAsync("level fixture", async () => {
          readFileSync("tests/smoke/fixtures/levels/LandscapeTest.json", "utf8");
          await import("../../engine/world/streaming");
        });
      }
    `);
    const [found] = result.checks;
    expect(found!.kind).toBe("checkAsync");
    expect(found!.specifiers).toEqual(["../../engine/world/streaming", "node:fs"]);
    expect(found!.literals).toContain("tests/smoke/fixtures/levels/LandscapeTest.json");
  });

  test("class extends is a value use; implements is not", () => {
    const result = analyzeSource(
      "engine/x/y.ts",
      `
      import { Base } from "./base";
      import { Shape } from "./shape";
      export class Box extends Base implements Shape {}
    `,
    );
    expect(result.valueSpecifiers).toEqual(["./base"]);
  });

  test("a harness variant forwarding its own label and body is not a check site", () => {
    const result = analyze(`
      const check = (label: string, fn: () => void): void => { fn(); report(label); };
      const checkSlow = (label: string, fn: () => void): void => { if (slow) check(label, fn); };
      const named = (label: string): void => check(label, () => {});
      check("real", () => {});
      checkSlow("slow one", () => {});
    `);
    expect(result.checks.map((found) => found.label)).toEqual(["label", "real", "slow one"]);
  });

  test("side-effect imports and value re-exports count for the module graph", () => {
    const result = analyzeSource(
      "engine/x/index.ts",
      `
      import "./register";
      export { a } from "./a";
      export type { B } from "./b";
      export * from "./c";
    `,
    );
    expect(result.valueSpecifiers).toEqual(["./a", "./c", "./register"]);
  });
});

describe("classifyCheck", () => {
  const local = (path: string, facts: Partial<ModuleFacts> = {}): ModuleFacts => ({
    path,
    specifier: path,
    three: false,
    threeMath: false,
    oldModel: false,
    ...facts,
  });

  test("three, directly or through a module, makes a render check", () => {
    expect(classifyCheck([{ path: null, specifier: "three", three: true, threeMath: false, oldModel: false }], []).cls).toBe("R");
    const verdict = classifyCheck([local("engine/terrain/lod.ts", { three: true })], []);
    expect(verdict.cls).toBe("R");
    expect(verdict.reasons).toEqual(["three-via:engine/terrain"]);
  });

  test("an old-model area or old level data makes a model check", () => {
    expect(classifyCheck([local("engine/scene/layout.ts")], []).cls).toBe("M");
    expect(classifyCheck([local("tools/saveValidator.ts")], []).cls).toBe("M");
    expect(classifyCheck([local("engine/navigation/path.ts")], ["tests/smoke/fixtures/levels/Offroad.json"]).cls).toBe("M");
  });

  test("otherwise algorithm; a model dependency further down marks the boundary", () => {
    expect(classifyCheck([local("engine/navigation/path.ts")], ["x"])).toEqual({ cls: "A", boundary: false, areas: ["engine/navigation"], reasons: [] });
    expect(classifyCheck([local("engine/navigation/path.ts", { oldModel: true })], [])).toMatchObject({
      cls: "A",
      boundary: true,
      reasons: ["boundary-model:engine/navigation"],
    });
    expect(classifyCheck([local("engine/physics/world.ts", { threeMath: true })], [])).toMatchObject({
      cls: "A",
      reasons: ["boundary-three-math:engine/physics"],
    });
  });

  test("a check reaching a dropped module directly is dropped, ahead of every other class (K12)", () => {
    const verdict = classifyCheck([local("engine/dialogue/dialogueSubsystem.ts"), local("engine/scene/layout.ts")], []);
    expect(verdict).toMatchObject({ cls: "D", reasons: ["dropped:K12 dialogue"] });
    expect(classifyCheck([local("engine/physics/ragdoll.ts", { threeMath: true })], []).cls).toBe("D");
    // Importing a dropped module further down does not drop the check: the import is cut when ported.
    expect(classifyCheck([local("engine/physics/physicsSubsystem.ts", { threeMath: true })], []).cls).toBe("A");
    expect(droppedBy("engine/ai/behaviorRunner.ts")).toBe("K12 AI authoring stack");
    expect(droppedBy("engine/perception/perception.ts")).toBeNull();
    // A check exercising cut data through a ported module is listed by file and label.
    expect(droppedCheck("tools/engine-tests.ts", "audio subsystem records one-shot requests from a collision behavior")).toMatch(/K12/);
    expect(droppedCheck("tools/engine-tests.ts", "behavior subsystem ticks behaviors and mutates transforms deterministically")).toBeNull();
  });

  test("an unported algorithm check may name the phase it waits for, by file or label prefix", () => {
    expect(deferredTo("tests/engine/terrainLakeWater.test.ts", "anything")).toBe("7");
    expect(deferredTo("tools/engine-tests.ts", "adaptive quality: classifyFrameLoad splits")).toBe("3");
    expect(deferredTo("tools/engine-tests.ts", "computePlayerStartSpawn: no marker")).toBe("6");
    expect(deferredTo("tools/engine-tests.ts", "behavior subsystem ticks behaviors")).toBeNull();
  });

  test("in engine/world and engine/persistence only the modules holding the old model are old", () => {
    expect(isOldModelModule("engine/world/worldPartition.ts")).toBe(true);
    expect(isOldModelModule("engine/world/streamingPolicy.ts")).toBe(false);
    expect(isOldModelModule("engine/persistence/saveGameState.ts")).toBe(true);
    expect(isOldModelModule("engine/persistence/saveGameStore.ts")).toBe(false);
    expect(isOldModelModule("engine/scene/layout.ts")).toBe(true);
    expect(classifyCheck([local("engine/world/viewDistance.ts")], []).cls).toBe("A");
    expect(classifyCheck([local("engine/world/hlod.ts")], []).cls).toBe("M");
    expect(droppedCheck("tests/engine/worldPartition.test.ts", "world partition: split/merge round trip")).toMatch(/A11/);
    expect(droppedCheck("tests/engine/worldPartition.test.ts", "world partition: light peaks use inclusive box distances")).toBeNull();
  });

  test("three in an engine module outside render-three is math, not render", () => {
    expect(isMathOnlyThreeArea("engine/physics")).toBe(true);
    expect(isMathOnlyThreeArea("engine/render-three")).toBe(false);
    expect(isMathOnlyThreeArea("src")).toBe(false);
  });

  test("areas and level data", () => {
    expect(areaOf("engine/render-three/water/ocean.ts")).toBe("engine/render-three");
    expect(areaOf("tools/saveValidator.ts")).toBe("tools/saveValidator");
    expect(areaOf("editor/core/selection.ts")).toBe("editor");
    expect(isOldLevelData("public/assets/levels/demo.level.json")).toBe(true);
    expect(isOldLevelData("LandscapeTest.cells/main/0_0.json")).toBe(true);
    expect(isOldLevelData("landscape-1.tiles/0_0.bin")).toBe(false);
  });
});
