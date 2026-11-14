import { describe, expect, test } from "vitest";
import type { ContentFile } from "../../src/core/index.ts";
import { assetId, build, CAR, createAssetTestRegistry, doc, MESH, projectFiles, TEX } from "../../src/core/assets/testKit.ts";
import { checkContentName, planContentOp, type ContentOp, type ContentOpOutcome } from "./contentOps.ts";
import type { ScanResult } from "./scan.ts";

const FOLDERS = ["content/textures", "content/meshes", "content/classes", "content/levels", "content/levels/main", "content/levels/main/cells", "content/empty"];

function plan(op: ContentOp, files: ContentFile[] = projectFiles(), extra: { startLevel?: string; readOnly?: string; folders?: string[] } = {}): ContentOpOutcome {
  const roots = ["content", ...(extra.readOnly ? [extra.readOnly] : [])];
  const scan: ScanResult = { roots, missing: [], files, folders: [...FOLDERS, ...(extra.folders ?? [])] };
  let n = 0;
  return planContentOp(op, {
    scan,
    index: build(files, false),
    registry: createAssetTestRegistry(),
    writable: (root) => root === "content",
    startLevel: extra.startLevel ?? "",
    newId: (kind) => `${kind === "asset" ? "ast" : kind === "level" ? "lvl" : "act"}_${(++n).toString(16).padStart(32, "0")}`,
  });
}

function ok(outcome: ContentOpOutcome) {
  if (!outcome.ok) throw new Error(`refused: ${outcome.message}`);
  return outcome.plan;
}

describe("moves and renames", () => {
  test("an asset moves with its meta file; references are GUIDs, nothing else is written", () => {
    const result = ok(plan({ op: "move", items: ["content/textures/paint.png"], to: "content/empty" }));
    expect(result.moves).toEqual([
      { from: "content/textures/paint.png", to: "content/empty/paint.png" },
      { from: "content/textures/paint.png.meta.json", to: "content/empty/paint.png.meta.json" },
    ]);
    expect([result.writes, result.deletes, result.result]).toEqual([[], [], ["content/empty/paint.png"]]);
  });

  test("a rename changes the name before the first dot, the meta file's too; a folder rename moves what it holds", () => {
    expect(ok(plan({ op: "rename", item: "content/meshes/car.glb", name: "truck" })).moves).toEqual([
      { from: "content/meshes/car.glb", to: "content/meshes/truck.glb" },
      { from: "content/meshes/car.glb.meta.json", to: "content/meshes/truck.glb.meta.json" },
    ]);
    const folder = ok(plan({ op: "rename", item: "content/meshes", name: "models" }));
    expect(folder.moves.map((move) => move.to)).toEqual([
      "content/models/car.glb",
      "content/models/car.glb.meta.json",
      "content/models/wheel.glb",
      "content/models/wheel.glb.meta.json",
    ]);
    expect(folder.removeDirs).toEqual(["content/meshes"]);
    expect(plan({ op: "rename", item: "content/meshes/car.glb", name: "a.b" })).toMatchObject({ ok: false, status: 400 });
    expect(plan({ op: "rename", item: "content/meshes/car.glb", name: "wheel" })).toMatchObject({ ok: false, reason: "exists" });
  });

  test("a level folder moves whole (its index too); the start level follows; the open level is protected", () => {
    const moved = ok(plan({ op: "move", items: ["content/levels/main"], to: "content/empty" }, projectFiles(), { startLevel: "content/levels/main" }));
    expect(moved.moves.map((move) => move.to)).toEqual([
      "content/empty/main/level.json",
      "content/empty/main/cells.json",
      "content/empty/main/cells/0_0.json",
    ]);
    expect(moved.startLevel).toBe("content/empty/main");
    expect(moved.removeDirs).toEqual(["content/levels/main", "content/levels/main/cells"]);
    expect(plan({ op: "move", items: ["content/levels"], to: "content/empty", protect: ["content/levels/main"] })).toMatchObject({ ok: false, reason: "protected" });
    expect(plan({ op: "move", items: ["content/levels"], to: "content/levels/main" })).toMatchObject({ ok: false, status: 400 });
  });

  test("the engine's content and packs are not written", () => {
    const files = [...projectFiles(), doc("x.json", {}, "engine:content/packs/starter")];
    expect(plan({ op: "move", items: ["engine:content/packs/starter/x.json"], to: "content/empty" }, files, { readOnly: "engine:content/packs/starter" })).toMatchObject({
      ok: false,
      status: 403,
      reason: "read-only",
    });
  });
});

describe("delete", () => {
  test("an asset another one references is not deleted: the referrers are listed", () => {
    const texture = plan({ op: "delete", items: ["content/textures/paint.png"] });
    expect(texture).toMatchObject({ ok: false, status: 409, reason: "in-use", referrers: [{ file: "content/meshes/car.glb.meta.json", id: MESH, target: TEX }] });
    const meshes = plan({ op: "delete", items: ["content/meshes"] });
    expect(meshes.ok ? [] : meshes.referrers!.map((referrer) => referrer.file)).toEqual(["content/classes/car.json", "content/levels/main/cells/0_0.json", "content/levels/main/cells/0_0.json"]);
  });

  test("references from inside what is deleted do not count; a level's index goes with it; the start level stays", () => {
    const all = ok(plan({ op: "delete", items: ["content/levels", "content/classes", "content/meshes", "content/textures"] }));
    expect(all.deletes).toContain("content/levels/main/level.json");
    expect(all.deletes).toContain("content/levels/main/cells/0_0.json");
    expect(all.deletes).not.toContain("content/levels/main/cells.json");
    expect(plan({ op: "delete", items: ["content/levels"] }, projectFiles(), { startLevel: "content/levels/main" })).toMatchObject({ ok: false, reason: "start-level" });
    expect(plan({ op: "delete", items: ["content/classes/car.json"] })).toMatchObject({ ok: false, referrers: [{ target: CAR }] });
  });

  test("a file a World Builder document names by path is neither moved nor deleted", () => {
    const recipe = doc("wb/a.worldrecipe.json", { schema: "forge.worldRecipe/1", id: assetId("71"), data: {} });
    const brief = doc("wb/a.worldbrief.json", { schema: "forge.worldBrief/1", id: assetId("72"), data: { recipe: "content/wb/a.worldrecipe.json" } });
    const files = [...projectFiles(), recipe, brief];
    const refused = plan({ op: "delete", items: ["content/wb/a.worldrecipe.json"] }, files, { folders: ["content/wb"] });
    expect(refused).toMatchObject({ ok: false, reason: "named-by-path", referrers: [{ file: "content/wb/a.worldbrief.json" }] });
    expect(plan({ op: "rename", item: "content/wb/a.worldrecipe.json", name: "b" }, files, { folders: ["content/wb"] })).toMatchObject({ ok: false, reason: "named-by-path" });
    // Both go together: nothing outside names them.
    expect(plan({ op: "delete", items: ["content/wb"] }, files, { folders: ["content/wb"] }).ok).toBe(true);
  });
});

describe("copy and new folder", () => {
  test("a copy gets new GUIDs (a level: its id, its actors and their parents) and a free name", () => {
    const copied = ok(plan({ op: "copy", items: ["content/levels/main"], to: "content/levels" }));
    expect(copied.result).toEqual(["content/levels/main_2"]);
    expect(copied.writes.map((write) => write.path)).toEqual(["content/levels/main_2/level.json", "content/levels/main_2/cells/0_0.json"]);
    const level = JSON.parse(copied.writes[0]!.text!) as { id: string };
    const cell = JSON.parse(copied.writes[1]!.text!) as { level: string; actors: { id: string }[] };
    expect(level.id).toMatch(/^lvl_0+\d+$/);
    expect(cell.level).toBe(level.id);
    expect(cell.actors.every((actor) => /^act_0+[0-9a-f]+$/.test(actor.id))).toBe(true);

    const binary = ok(plan({ op: "copy", items: ["content/textures/paint.png"], to: "content/empty" }));
    expect(binary.writes[0]).toEqual({ path: "content/empty/paint.png", copyOf: "content/textures/paint.png" });
    expect(JSON.parse(binary.writes[1]!.text!).id).not.toBe(TEX);
  });

  test("a new folder needs a free, valid name in an existing folder", () => {
    expect(ok(plan({ op: "mkdir", path: "content/empty/new" })).mkdirs).toEqual(["content/empty/new"]);
    expect(plan({ op: "mkdir", path: "content/meshes" })).toMatchObject({ ok: false, reason: "exists" });
    expect(plan({ op: "mkdir", path: "content/none/new" })).toMatchObject({ ok: false, reason: "missing" });
    expect(checkContentName("a:b")).not.toBeNull();
    expect(checkContentName(".hidden")).not.toBeNull();
    expect(checkContentName("Props")).toBeNull();
  });
});
