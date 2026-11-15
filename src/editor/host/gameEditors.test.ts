import { describe, expect, test } from "vitest";
import { defineFeatureEditor } from "./featureEditor.ts";
import { collectGameEditors } from "./gameEditors.ts";

const features = [{ id: "forge.shape" }, { id: "game.beacon" }];
const beacon = defineFeatureEditor({ feature: "game.beacon", components: { "game.beacon": { icon: "light", outliner: "gameplay" } } });

describe("a game's editor sides (INV-A32)", () => {
  test("a feature editor of a feature the editor runs joins as it is, in the server's order", () => {
    expect(collectGameEditors([{ path: "src/beacon/editor.ts", editor: beacon }], features)).toEqual([beacon]);
    expect(collectGameEditors([], features)).toEqual([]);
  });

  test("anything else stops the editor with the file named", () => {
    expect(() => collectGameEditors([{ path: "src/a/editor.ts", editor: undefined }], features)).toThrow(/^src\/a\/editor\.ts: the default export is not defineFeatureEditor/);
    expect(() => collectGameEditors([{ path: "editor.ts", editor: { feature: "game.beacon" } }], features)).toThrow(/^editor\.ts: the default export/);
    const stray = defineFeatureEditor({ feature: "game.missing" });
    expect(() => collectGameEditors([{ path: "src/x/editor.ts", editor: stray }], features)).toThrow(/src\/x\/editor\.ts: feature "game\.missing" is not one of the game module's features/);
  });
});
