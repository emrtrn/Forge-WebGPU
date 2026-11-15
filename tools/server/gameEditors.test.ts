import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { findGameEditors, gameEditorsSource, isGameEditorPath } from "./gameEditors.ts";

const cleanup: string[] = [];
afterEach(async () => {
  for (const folder of cleanup.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function project(files: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "forge-game-editors-"));
  cleanup.push(root);
  for (const file of files) {
    const path = join(root, ...file.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "export default null;\n");
  }
  return root;
}

describe("a game project's editor sides (INV-A32)", () => {
  test("the project's editor.ts and every editor.ts under src/, sorted; not hidden folders, node_modules or content", async () => {
    const root = await project([
      "editor.ts",
      "src/game.ts",
      "src/beacon/editor.ts",
      "src/a/b/editor.ts",
      "src/editor/panels.ts",
      "src/.cache/editor.ts",
      "src/node_modules/x/editor.ts",
      "content/editor.ts",
      "tools/editor.ts",
    ]);
    expect(await findGameEditors(root)).toEqual(["editor.ts", "src/a/b/editor.ts", "src/beacon/editor.ts"]);
    expect(await findGameEditors(join(root, "missing"))).toEqual([]);
  });

  test("which changed paths are editor sides", () => {
    expect(isGameEditorPath("editor.ts")).toBe(true);
    expect(isGameEditorPath("src/beacon/editor.ts")).toBe(true);
    expect(isGameEditorPath("src/editor.ts")).toBe(true);
    expect(isGameEditorPath("src/beacon/editor.test.ts")).toBe(false);
    expect(isGameEditorPath("content/editor.ts")).toBe(false);
    expect(isGameEditorPath("src/.hidden/editor.ts")).toBe(false);
    expect(isGameEditorPath("../other/src/editor.ts")).toBe(false);
  });

  test("the virtual module imports each by its absolute path; no project or none found is an empty list", () => {
    expect(gameEditorsSource(null, ["editor.ts"])).toBe("export default [];\n");
    expect(gameEditorsSource("/game", [])).toBe("export default [];\n");
    const source = gameEditorsSource("/game", ["editor.ts", "src/beacon/editor.ts"]);
    expect(source).toMatch(/^import e0 from ".*\/game\/editor\.ts";\nimport e1 from ".*\/game\/src\/beacon\/editor\.ts";\n/);
    expect(source).toContain('export default [{ path: "editor.ts", editor: e0 }, { path: "src/beacon/editor.ts", editor: e1 }];');
  });
});
