// The Outliner at 50.000 actors (plan phase 4 gate "Outliner 50.000 aktörde
// akıcı"; step 5a, user decision 2026-11-14): `npm run bench:outliner`.
// Headed Chrome on the real GPU (WebGPU, never forceWebGL), the editor
// smoke's temporary project copy, a generated level: 5.000 groups of an empty
// group actor and nine cubes (50.000 actors).
//
// Thresholds (the user's): the Outliner's first build (rows + paint)
// <= 150 ms; a selection change (a row click, everything that runs with it)
// p95 <= 16 ms; a scroll step's paint p95 <= 16 ms; a search keystroke
// <= 50 ms (the worst, clearing back to the full tree included); <= 200 rows
// in the DOM. The Outliner reports its last build and paint in
// `data-rebuild-ms` / `data-paint-ms` on its list. Frame intervals while
// scrolling, the level's open time and an edit's rebuild are recorded, not
// judged (the viewport draws 45.000 cubes in the same frames).
// Report: .forge-cache/bench/outliner/report.json; the summary on the console.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEVEL = "content/levels/outliner-bench";
const GROUPS = 5_000;
const CHILDREN = 9;
const THRESHOLDS = { firstBuildMs: 150, selectP95Ms: 16, scrollPaintP95Ms: 16, searchMaxMs: 50, domRows: 200 } as const;

const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? Number.NaN;
};
const round = (value: number): number => Number(value.toFixed(3));

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const identity = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
  const actors: unknown[] = [];
  let next = 1;
  for (let group = 0; group < GROUPS; group += 1) {
    const groupId = id(next++);
    const [gx, gz] = [(group % 100) * 6, Math.floor(group / 100) * 6];
    actors.push({ id: groupId, name: `Group ${group}`, class: null, parent: null, spatiallyLoaded: false, transform: { p: [gx, 0, gz], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: {} });
    for (let child = 0; child < CHILDREN; child += 1) {
      actors.push({
        id: id(next++),
        name: `Cube ${group}-${child}`,
        class: null,
        parent: groupId,
        spatiallyLoaded: false,
        transform: { p: [(child % 3) - 1, 0.25, Math.floor(child / 3) - 1], r: [0, 0, 0, 1], s: [1, 1, 1] },
        components: { shape: { type: "forge.shape@2", parent: null, local: identity, primitive: "cube", color: "#c8c8c8", castShadow: false, collision: true } },
      });
    }
  }
  const folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "level.json"), `${JSON.stringify({ schema: "forge.level/1", id: "lvl_0000000000000000000000000000b001", settings: { cellSize: 128 }, actors })}\n`);
});

test("the Outliner at 50.000 actors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const opening = Date.now();
  await page.goto(`/?editor&level=${encodeURIComponent(LEVEL)}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 300_000 });
  const openMs = Date.now() - opening;
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 300_000 });
  const backend = await canvas.getAttribute("data-forge-backend");
  expect(backend, "the bench runs on the real GPU (WebGPU)").toBe("webgpu");
  const list = page.getByTestId("outliner-list");
  await expect(page.getByTestId("outliner-summary")).toHaveText(`${GROUPS * (CHILDREN + 1)} actors (0 selected)`);
  const firstBuildMs = Number(await list.getAttribute("data-rebuild-ms"));
  const domRows = await page.getByTestId("outliner-row").count();

  // Selection: a click on a drawn row, timed from dispatch to return (the selection, Outliner, Details and viewport listeners).
  const selectMs = await list.evaluate(async (element) => {
    const times: number[] = [];
    for (let step = 0; step < 30; step += 1) {
      const rows = [...element.querySelectorAll<HTMLElement>('[data-testid="outliner-row"]')].filter((row) => !row.hidden);
      const row = rows[(step * 7) % rows.length]!;
      const started = performance.now();
      row.querySelector("strong")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      times.push(performance.now() - started);
      await new Promise((done) => requestAnimationFrame(done));
    }
    return times;
  });

  // Scrolling: 80 steps of 3 rows; each step's paint, and the frame intervals meanwhile.
  const scroll = await list.evaluate(async (element) => {
    const paints: number[] = [];
    const frames: number[] = [];
    let last = performance.now();
    const frame = () =>
      new Promise<void>((done) =>
        requestAnimationFrame((now) => {
          frames.push(now - last);
          last = now;
          done();
        }),
      );
    for (let step = 0; step < 80; step += 1) {
      element.scrollTop += 120 + step * 400;
      await frame();
      await frame();
      paints.push(Number(element.dataset.paintMs));
    }
    return { paints, frames: frames.slice(2) };
  });

  // Search: typing a name a key at a time, then clearing back to the tree; the input handler rebuilds synchronously.
  const searchMs = await page.getByTestId("outliner-search").evaluate(async (element) => {
    const input = element as HTMLInputElement;
    const times: number[] = [];
    for (const text of ["C", "Cu", "Cub", "Cube", "Cube ", "Cube 4", "Cube 49", "Cube 499", "Cube 4999", "Cube 4999-8", "Cube 4999", "Cube", ""]) {
      input.value = text;
      const started = performance.now();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      times.push(performance.now() - started);
      await new Promise((done) => requestAnimationFrame(done));
    }
    return times;
  });

  // An edit rebuilds the rows (recorded): lock the first drawn row and undo.
  await page.getByTestId("outliner-row").first().getByTestId("outliner-lock").click();
  const editRebuildMs = Number(await list.getAttribute("data-rebuild-ms"));
  await page.getByTestId("editor-undo").click();

  const values = {
    firstBuildMs: round(firstBuildMs),
    selectP95Ms: round(percentile(selectMs, 95)),
    scrollPaintP95Ms: round(percentile(scroll.paints, 95)),
    searchMaxMs: round(Math.max(...searchMs)),
    domRows,
  };
  const pass = {
    firstBuildMs: values.firstBuildMs <= THRESHOLDS.firstBuildMs,
    selectP95Ms: values.selectP95Ms <= THRESHOLDS.selectP95Ms,
    scrollPaintP95Ms: values.scrollPaintP95Ms <= THRESHOLDS.scrollPaintP95Ms,
    searchMaxMs: values.searchMaxMs <= THRESHOLDS.searchMaxMs,
    domRows: values.domRows <= THRESHOLDS.domRows,
  };
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    // Outside a checkout: the report says unknown.
  }
  const report = {
    when: new Date().toISOString(),
    commit,
    backend,
    actors: GROUPS * (CHILDREN + 1),
    thresholds: THRESHOLDS,
    values,
    pass,
    recorded: {
      openMs,
      editRebuildMs: round(editRebuildMs),
      selectMs: selectMs.map(round),
      scrollPaintMs: scroll.paints.map(round),
      scrollFrameP50Ms: round(percentile(scroll.frames, 50)),
      scrollFrameP95Ms: round(percentile(scroll.frames, 95)),
      searchMs: searchMs.map(round),
    },
  };
  const outDir = join(REPO_ROOT, ".forge-cache/bench/outliner");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    console.log(`bench:outliner: ${key} ${values[key]} (<= ${THRESHOLDS[key]}) ${pass[key] ? "ok" : "OVER"}`);
  }
  console.log(`bench:outliner: open ${openMs} ms, edit rebuild ${report.recorded.editRebuildMs} ms, scroll frames p50 ${report.recorded.scrollFrameP50Ms} / p95 ${report.recorded.scrollFrameP95Ms} ms`);
  console.log(`bench:outliner: report in ${join(outDir, "report.json")}`);
  expect(errors).toEqual([]);
  expect(pass).toEqual({ firstBuildMs: true, selectP95Ms: true, scrollPaintP95Ms: true, searchMaxMs: true, domRows: true });
});
