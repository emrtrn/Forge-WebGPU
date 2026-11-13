import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { scanDist } from "./verify-dist.ts";

const made: string[] = [];
afterEach(() => {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function dist(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), "forge-dist-"));
  made.push(folder);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(folder, name, ".."), { recursive: true });
    writeFileSync(join(folder, name), text);
  }
  return folder;
}

describe("verify:dist (Forge's verify-dist)", () => {
  test("a clean game build has no findings; binary files are not read", () => {
    const folder = dist({ "index.html": "<div id=app></div>", "assets/index.js": "const game = 1;", "assets/model.glb": "editor-shell" });
    expect(scanDist(folder)).toEqual([]);
  });

  test("an editor marker fails; an authoring endpoint warns", () => {
    const folder = dist({
      "index.html": "<html></html>",
      "assets/index.js": 'el.className="editor-shell";fetch("/__forge/save")',
      "assets/style.css": ".forge-kit-style{}",
    });
    expect(scanDist(folder).map((found) => `${found.tier} ${found.file} ${found.token}`).sort()).toEqual([
      "fail assets/index.js editor-shell",
      "fail assets/style.css forge-kit-style",
      "warn assets/index.js __forge/save",
    ]);
  });
});
