// Render regression smoke (architecture §4.10; plan phase 3). Per scene x pose:
//
// 1. the pose goes to `forge.play.cameraPose` before the page loads;
// 2. ready is `data-forge-ready` on the canvas (load done, resources settled,
//    frames drawn), never a hidden-born overlay; a boot error fails at once;
// 3. a run whose backend is not WebGPU fails (`isWebGPUBackend`), and so does
//    one whose resources did not all load;
// 4. the shot is `page.screenshot({ clip })` of the viewport (a canvas
//    locator shot is black: the drawing buffer is not preserved), and a blank
//    or flat image fails (luminance standard deviation);
// 5. with a reference image in render-refs/, the shot is compared to it;
//    without one, the shot is written to render-refs/candidates/ for the
//    user's acceptance (references are never written silently);
// 6. a record goes to render-refs/runs/: commit, three, backend proof,
//    browser, GPU, pose, resolution / DPR, profile, perf witness (with the
//    pipeline's passes, MRT targets and the device's MRT probe);
// 7. the full MRT set must fit the device (phase 3 decision 4).
//
// The quality profile is fixed (SMOKE_QUALITY, adaptive off, no calibration).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { RENDER_REFS, REPO_ROOT, SMOKE_QUALITY, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, openSmokeLevel } from "./smokePage.ts";

/** Below this the image is blank or flat (luminance, 0 - 255). */
const MIN_LUMINANCE_STD = 4;
/** A mostly black image is a failed draw, not a dark scene. */
const MIN_LUMINANCE_MEAN = 8;

// The Phase 0 shots' resolution, so a shot sits next to its WebGL counterpart pixel for pixel
// (`npm run smoke:grid`). The viewer smoke and the measurements keep the config's 1280 x 720.
test.use({ viewport: SMOKE_VIEWPORT, deviceScaleFactor: 1 });

const threeVersion = (JSON.parse(readFileSync(join(REPO_ROOT, "node_modules/three/package.json"), "utf8")) as { version: string }).version;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

for (const scene of SMOKE_SCENES) {
  for (const pose of scene.poses) {
    test(`${scene.id} ${pose.id}`, async ({ page, browser }, testInfo) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      const { cameraPose } = await openSmokeLevel(page, scene.level, pose);
      const canvas = page.locator("canvas[data-forge-ready='1']");

      const proof = JSON.parse((await canvas.getAttribute("data-forge-backend-proof")) ?? "null") as {
        isWebGPUBackend: boolean;
        backend: string;
        adapter: Record<string, string | undefined> | null;
      } | null;
      const resourceErrors = Number(await canvas.getAttribute("data-forge-resource-errors"));
      // Let the perf witness publish at least once after ready (every 500 ms).
      await page.waitForTimeout(1200);
      const perf = JSON.parse((await canvas.getAttribute("data-forge-perf")) ?? "null") as unknown;

      const viewport = page.viewportSize()!;
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } });
      const luminance = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas2d = document.createElement("canvas");
        canvas2d.width = image.width;
        canvas2d.height = image.height;
        const context = canvas2d.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height).data;
        let sum = 0;
        let squares = 0;
        const pixels = data.length / 4;
        for (let index = 0; index < data.length; index += 4) {
          const value = 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
          sum += value;
          squares += value * value;
        }
        const mean = sum / pixels;
        return { mean, std: Math.sqrt(Math.max(0, squares / pixels - mean * mean)) };
      }, shot.toString("base64"));

      const referencePath = join(RENDER_REFS, scene.id, `${pose.id}.png`);
      const updating = testInfo.config.updateSnapshots === "all" || testInfo.config.updateSnapshots === "changed";
      let reference: "compared" | "candidate-written" | "updated" = "compared";
      if (!existsSync(referencePath) && !updating) {
        const candidate = join(RENDER_REFS, "candidates", scene.id, `${pose.id}.png`);
        mkdirSync(join(RENDER_REFS, "candidates", scene.id), { recursive: true });
        writeFileSync(candidate, shot);
        reference = "candidate-written";
        testInfo.annotations.push({ type: "reference", description: `no reference yet; candidate at ${candidate}` });
      } else if (updating) {
        reference = "updated";
      }

      const runs = join(RENDER_REFS, "runs");
      mkdirSync(runs, { recursive: true });
      const base = join(runs, `${stamp}-${scene.id}-${pose.id}`);
      writeFileSync(`${base}.png`, shot);
      const record = {
        schema: 1,
        date: new Date().toISOString(),
        commit: git(["rev-parse", "HEAD"]),
        dirty: git(["status", "--porcelain", "--", "src", "tests/smoke", "index.html"]) !== "",
        three: threeVersion,
        browser: `chrome ${browser.version()}`,
        backend: proof,
        gpu: proof?.adapter ?? null,
        scene: scene.id,
        level: scene.level,
        pose: cameraPose,
        resolution: viewport,
        devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
        profile: (perf as { quality?: string } | null)?.quality ?? null,
        perf,
        resourceErrors,
        luminance,
        reference,
        pageErrors,
        consoleErrors,
      };
      writeFileSync(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`);

      expect(pageErrors, "page errors").toEqual([]);
      expect((perf as { quality?: string } | null)?.quality, "the run draws with the smoke profile").toBe(SMOKE_QUALITY);
      expect(proof?.isWebGPUBackend, "the renderer must run on WebGPU; a WebGL2 run is not a WebGPU acceptance run").toBe(true);
      expect(resourceErrors, "every resource loads").toBe(0);
      // Phase 3 decision 4: the full MRT set (30 bytes per sample) fits this device without requiredLimits.
      const witness = perf as { mrtProbeOk?: boolean; mrtProbeBytes?: number; pipeline?: string } | null;
      expect(witness?.mrtProbeBytes, "the MRT probe ran").toBe(30);
      expect(witness?.mrtProbeOk, "the full MRT set fits the device").toBe(true);
      expect(typeof witness?.pipeline, "the pipeline's passes are recorded").toBe("string");
      expect(luminance.mean, "the image is not black").toBeGreaterThan(MIN_LUMINANCE_MEAN);
      expect(luminance.std, "the image is not blank or flat").toBeGreaterThan(MIN_LUMINANCE_STD);
      if (reference !== "candidate-written") {
        expect(shot).toMatchSnapshot([scene.id, `${pose.id}.png`], { maxDiffPixelRatio: 0.01 });
      }
    });
  }
}
