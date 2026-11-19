import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { writeCityLevel } from "../../tools/bench-city-level.ts";
import { citySettle, distribution } from "./cityPage.ts";
import type * as Probe from "./fixtures/cityS12Cpu.ts";
import { REPO_ROOT } from "./renderPaths.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

test("S12 cpu twin cost at 20,000 part-instances", async ({ page, browser }) => {
  const project = process.env.FORGE_CITY_TEMP_PROJECT;
  if (!project) throw new Error("City fixture path is missing.");
  const fixture = JSON.parse(await readFile(join(project, ".forge-cache", "city.json"), "utf8")) as Awaited<ReturnType<typeof writeCityLevel>>;
  const pose = fixture.poses.find(item => item.id === "street")!;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
  });
  await openSmokeLevel(page, fixture.level, pose, "&forceWebGL&staticPath=s12-gpu&buildingStreaming=off");
  await citySettle(page);
  const count = 20_000, warmFrames = 60, frames = 300;
  const replay = await page.evaluate(async ({ url, count, warmFrames, frames }) =>
    (await import(url) as typeof Probe).measureCpuTwin(count, warmFrames, frames),
  { url: "/tests/smoke/fixtures/cityS12Cpu.ts", count, warmFrames, frames });
  expect(replay.visible.reduce((sum, batch) => sum + batch.count, 0)).toBe(count);
  expect(replay.samples.length).toBe(frames);
  expect(errors).toEqual([]);
  const date = new Date().toISOString();
  const output = join(REPO_ROOT, ".forge-cache", "s12-runs");
  const path = join(output, `${date.replace(/[:.]/g, "-")}-city-s12-webgl2-cpu.json`);
  await mkdir(output, { recursive: true });
  await writeFile(path, JSON.stringify({ date, commit: git(["rev-parse", "HEAD"]), browser: browser.version(),
    profile: "high", pose, count, warmFrames, frames, prepareMs: distribution(replay.samples), ...replay }, null, 2) + "\n");
  console.log(`S12 CPU twin raw measurements: ${path}`);
});
