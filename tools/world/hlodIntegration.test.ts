import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, expect, test, vi } from "vitest";
import { buildAssetIndex, normalizeLevel, splitLevel, stringifyDocument } from "../../src/core/index.ts";
import { buildContent } from "../build-content.ts";
import { verifyAssets } from "../assets/verify.ts";
import { loadGameSchemas } from "../project/gameSchemas.ts";
import { scanDist } from "../verify-dist.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import { buildLevelHlod } from "./hlodBuild.ts";
import { parseHlodArgs, runHlod, writeHlodResult } from "./hlodCli.ts";
import { hlodStaleness } from "./hlodStale.ts";
import { actor, addResult, encode, fixture, FOLDER, inputOf, level, LEVEL } from "./hlodTestKit.ts";

const temps: string[] = [];
afterAll(async () => { for (const path of temps) await rm(path, { recursive: true, force: true }); });
async function temp() { const path = await mkdtemp(join(tmpdir(), "forge-hlod-")); temps.push(path); return path; }

test("source hash staleness is one warning per changed, removed or missing cell of a built level; small details need no entry", async () => {
  const source = await fixture();
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  addResult(source, result.files);
  expect(await hlodStaleness(await inputOf(source))).toEqual([]);
  source.set(`${FOLDER}/level.json`, encode(level([actor(1, 11), actor(2, 20), actor(3, 400), actor(4, 600, [1, 1, 1])])));
  const warnings = await hlodStaleness(await inputOf(source));
  expect(warnings.map((warning) => warning.cell).sort()).toEqual(["0_0", "2_0", "3_0"]);
  for (const warning of warnings) expect(warning).toMatchObject({ severity: "warning", code: "hlod-stale" });
  // HLOD is optional: a level without hlod.json is not stale.
  source.delete(`${FOLDER}/hlod.json`);
  expect(await hlodStaleness(await inputOf(source))).toEqual([]);
});

test("asset verification prints hlod-stale without failing; production copies index and proxies and warns", async () => {
  const project = await temp();
  const source = await fixture();
  // Save canonical cell files: no misplaced actors or obsolete cell revisions.
  const input = await inputOf(source);
  const normalized = normalizeLevel(level(), { strict: true, registry: input.registry, resolveClass: input.index.resolveClass });
  const split = splitLevel(normalized.value!, { strict: true, registry: input.registry, resolveClass: input.index.resolveClass });
  source.set(`${FOLDER}/level.json`, encode(split.persistent));
  for (const cell of split.cells) source.set(`${FOLDER}/cells/${cell.cell}.json`, encode(cell));
  // Use actual bytes for the index's revisions.
  const { fileRevision } = await import("../assets/revision.ts");
  source.set(`${FOLDER}/cells.json`, encode({ schema: "forge.levelCells/1", level: LEVEL,
    persistent: fileRevision(source.get(`${FOLDER}/level.json`)!), cells: Object.fromEntries(split.cells.map((cell) =>
      [cell.cell, fileRevision(source.get(`${FOLDER}/cells/${cell.cell}.json`)!)])) }));
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  addResult(source, result.files);
  const staleIndex = { ...result.index, cells: result.index.cells.map((cell) => ({ ...cell, sourceHash: "00000000" })) };
  source.set(`${FOLDER}/hlod.json`, encode(staleIndex));
  for (const [path, bytes] of source) { await mkdir(dirname(join(project, path)), { recursive: true }); await writeFile(join(project, path), bytes); }
  const verified = await verifyAssets(project, { roots: ["content"], registry: input.registry });
  expect(verified.ok, verified.lines.join("\n")).toBe(true);
  expect(verified.lines.filter((line) => line.startsWith("warning hlod-stale"))).toHaveLength(2);
  await cp(join(process.cwd(), "samples/starter"), project, { recursive: true });
  const out = await temp(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await buildContent({ projectRoot: project, engineRoot: process.cwd(), outDir: out });
    expect(warn.mock.calls.filter(([line]) => String(line).startsWith("warning hlod-stale"))).toHaveLength(2);
  } finally { warn.mockRestore(); }
  for (const relative of ["hlod.json", "hlod/0_0.glb", "hlod/2_0.glb"]) {
    expect(await readFile(join(out, "forge/files/project/content/levels/test", relative))).toEqual(Buffer.from(source.get(`${FOLDER}/${relative}`)!));
  }
  expect(scanDist(out)).toEqual([]);
});

test("writer replaces proxies, removes obsolete GLBs only, and respects project write policy", async () => {
  const project = await temp(), policy = createWritePolicy(project);
  const source = await fixture(), result = await buildLevelHlod(FOLDER, await inputOf(source));
  const folder = join(project, "content/levels/test/hlod");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "9_9.glb"), "old"); await writeFile(join(folder, "keep.txt"), "keep");
  await writeHlodResult(policy, "content/levels/test", result);
  expect((await readdir(folder)).sort()).toEqual(["0_0.glb", "2_0.glb", "keep.txt"]);
  expect(await readFile(join(project, "content/levels/test/hlod.json"), "utf8")).toBe(stringifyDocument(result.index));
  await expect(writeHlodResult(policy, "../outside", result)).rejects.toThrow();
  await expect(writeHlodResult(policy, "engine:content/levels/test", result)).rejects.toThrow();
});

test("CLI options validate ranges, flags, duplicates and unknown options", () => {
  expect(parseHlodArgs(["--project", "p", "--level", "content/levels/test", "--dry-run", "--json", "--ratio", "1", "--error", "0.5"]))
    .toMatchObject({ project: "p", dryRun: true, json: true, ratio: 1, error: .5 });
  for (const tail of [["--ratio", "0"], ["--error", "0"], ["--error", "1.1"], ["--unknown"], ["--json", "--json"], ["--ratio"]]) {
    expect(() => parseHlodArgs(["--project", "p", "--level", "content/levels/test", ...tail])).toThrow();
  }
  expect(() => parseHlodArgs([])).toThrow(/Usage/);
});

test("engine samples and pack labels cannot be build targets", async () => {
  const args = parseHlodArgs(["--project", join(process.cwd(), "samples/starter"), "--level", "content/levels/main"]);
  await expect(runHlod(args, process.cwd())).rejects.toThrow(/not writable/);
  const root = await temp();
  await cp(join(process.cwd(), "samples/starter"), root, { recursive: true });
  await expect(runHlod({ ...args, project: root, level: "engine:content/packs/starter/levels/main" }, process.cwd())).rejects.toThrow();
});

test("HLOD under a content-root level is checked for staleness", async () => {
  const source = await fixture();
  source.set("content/level.json", source.get(`${FOLDER}/level.json`)!); source.delete(`${FOLDER}/level.json`);
  const doc = JSON.parse(new TextDecoder().decode(source.get("content/level.json")!)) as { id: string; settings: { cellSize: number } };
  const stale = { schema: "forge.levelHlod/1", level: doc.id, cellSize: doc.settings.cellSize, cells: [{ key: "0_0", triangles: 1, sourceHash: "00000000" }, { key: "3_0", triangles: 1, sourceHash: "00000000" }] };
  source.set("content/hlod.json", encode(stale));
  const input = await inputOf(source);
  expect(buildAssetIndex(input.files, { strict: true, registry: input.registry }).levels.size).toBe(1);
  // 0_0 and 3_0 changed since their (fake) bake; 2_0 has placements to bake but no entry.
  expect((await hlodStaleness(input)).map((warning) => warning.cell).sort()).toEqual(["0_0", "2_0", "3_0"]);
});

test("the HLOD schema loader reads a cold project without generating .forge files", async () => {
  const root = await temp();
  await cp(join(process.cwd(), "samples/starter"), root, { recursive: true, filter: (path) => !path.includes(".forge") });
  const before = await readdir(root);
  const input = await inputOf(await fixture());
  await loadGameSchemas(process.cwd(), root, "src/game.ts", input.registry, { readOnly: true });
  expect(await readdir(root)).toEqual(before);
});
