// R9c S12. The city fixture, camera and quality are shared by all three paths.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { writeCityLevel } from "../../tools/bench-city-level.ts";
import { cityDraws, cityFrames, citySettle, requireCityGpu } from "./cityPage.ts";
import { REPO_ROOT, SMOKE_VIEWPORT } from "./renderPaths.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

const paths = ["auto", "s12-gpu", "s12-cells"] as const;
const profiles = ["high", "ultra"] as const;
const warmFrames = 60;
const frames = 300;

async function webglSmoke(page: Page) {
  const { proof, parts } = await page.evaluate(async () => {
    const host = window.__forgeDev.host()!;
    const parts = [];
    for (const batch of host.gpuDriven.lastBatches) {
      if (!batch.name.startsWith("s12/")) continue;
      const visible = await batch.readCounts(host.renderer);
      parts.push({ name: batch.name, path: batch.path, count: batch.instances.count, visible: visible[0] });
    }
    return { proof: host.proof, parts };
  });
  expect(proof.backend).toBe("webgl2");
  for (const part of parts) {
    expect(part.path).toBe("cpu");
    expect(part.visible).toBeLessThanOrEqual(part.count);
  }
  return { proof, parts };
}

test("city S12 static culling comparison", async ({ context, browser }) => {
  test.setTimeout(1_800_000);
  const project = process.env.FORGE_CITY_TEMP_PROJECT;
  if (!project) throw new Error("City fixture path is missing.");
  const fixture = JSON.parse(await readFile(join(project, ".forge-cache", "city.json"), "utf8")) as Awaited<ReturnType<typeof writeCityLevel>>;
  const street = fixture.poses.find(pose => pose.id === "street")!;
  const square = fixture.poses.find(pose => pose.id === "square")!;
  const output = join(REPO_ROOT, ".forge-cache", "s12-runs");
  await mkdir(output, { recursive: true });
  const date = new Date().toISOString();
  const path = join(output, `${date.replace(/[:.]/g, "-")}-city-s12.json`);
  const results: unknown[] = [], webgl2: unknown[] = [];
  const report = { date, commit: git(["rev-parse", "HEAD"]), browser: browser.version(), viewport: SMOKE_VIEWPORT,
    devicePixelRatio: 1, warmFrames, frames, fixture, results, webgl2 };
  console.log(`S12 raw measurements: ${path}`);

  for (const profile of profiles) for (const pose of [street, square]) for (const mode of paths) {
    const page = await context.newPage();
    try {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
      });
      await openSmokeLevel(page, fixture.level, pose, `&staticPath=${mode}&buildingStreaming=off`, profile);
      const proof = await requireCityGpu(page, profile);
      await citySettle(page);
      await cityFrames(page, warmFrames);
      const timing = await cityFrames(page, frames);
      const counters = await cityDraws(page, true);
      expect(timing.gpuTotalMs?.samples).toBe(frames);
      expect(counters.perView.main?.draws).toBeGreaterThan(0);
      expect(Object.keys(counters.perView).filter(key => key.startsWith("shadow-")).length).toBe(profile === "high" ? 3 : 4);
      for (const batch of counters.s12Batches ?? []) for (const stage of batch.stages) {
        expect(stage.drawn).toBeGreaterThanOrEqual(stage.certain!);
        expect(stage.drawn).toBeLessThanOrEqual(stage.possible!);
      }
      expect(errors).toEqual([]);
      results.push({ profile, pose, mode, proof, timing, counters });
      await writeFile(path, JSON.stringify(report, null, 2) + "\n");
      console.log(`${profile}/${pose.id}/${mode}: ${counters.draws} draws, ${counters.dispatches} dispatches, `
        + `${timing.gpuTotalMs!.mean.toFixed(3)} ms GPU; ${counters.s12Batches?.length ?? 0} GPU parts, ${counters.s12Cells?.length ?? 0} cell meshes`);
    } finally {
      await page.close();
    }
  }

  for (const mode of ["auto", "s12-gpu"]) {
    const page = await context.newPage();
    try {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
      });
      await openSmokeLevel(page, fixture.level, street, `&forceWebGL&staticPath=${mode}&buildingStreaming=off`);
      await citySettle(page);
      await cityFrames(page, warmFrames);
      const timing = await cityFrames(page, frames, true);
      const { proof, parts } = await webglSmoke(page);
      expect(timing.cullCpuMs?.samples).toBe(frames);
      if (mode === "s12-gpu") expect(parts.length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
      webgl2.push({ mode, proof, profile: "high", pose: street, timing, parts });
      await writeFile(path, JSON.stringify(report, null, 2) + "\n");
    } finally {
      await page.close();
    }
  }
});
