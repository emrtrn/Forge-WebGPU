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
//    browser, GPU, pose, resolution / DPR, profile, perf witness.
//
// The quality profile is fixed (SMOKE_QUALITY, adaptive off, no calibration).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { Matrix4, Quaternion, Vector3 } from "three";
import { RENDER_REFS, REPO_ROOT, SMOKE_QUALITY, SMOKE_SCENES, type SmokePose } from "./renderScenes.ts";

/** Below this the image is blank or flat (luminance, 0 - 255). */
const MIN_LUMINANCE_STD = 4;
/** A mostly black image is a failed draw, not a dark scene. */
const MIN_LUMINANCE_MEAN = 8;
const READY_TIMEOUT_MS = 120_000;

function quaternionOf(pose: SmokePose): [number, number, number, number] {
  const eye = new Vector3(...pose.position);
  const target = new Vector3(...pose.target);
  const rotation = new Matrix4().lookAt(eye, target, new Vector3(0, 1, 0));
  const q = new Quaternion().setFromRotationMatrix(rotation);
  return [q.x, q.y, q.z, q.w];
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

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
      const cameraPose = { position: pose.position, quaternion: quaternionOf(pose) };
      await page.addInitScript((value) => localStorage.setItem("forge.play.cameraPose", value), JSON.stringify(cameraPose));
      const settings = {
        schema: 1,
        updatedAt: new Date().toISOString(),
        payload: {
          audio: { busVolumes: {} },
          locale: null,
          graphics: {
            adaptiveOptimizationEnabled: false,
            targetFrameRate: 60,
            selectedQualityLevel: SMOKE_QUALITY,
            allowAdaptiveFineTuning: false,
            manuallySelected: true,
            startupCalibrated: true,
          },
        },
      };
      await page.addInitScript((value) => localStorage.setItem("forge.userSettings", value), JSON.stringify(settings));
      await page.goto(`/?level=${encodeURIComponent(scene.level)}`);

      const canvas = page.locator("canvas[data-forge-ready='1']");
      const bootError = page.getByTestId("boot-error");
      await expect(canvas.or(bootError)).toBeVisible({ timeout: READY_TIMEOUT_MS });
      if (await bootError.isVisible()) throw new Error(`The boot stopped: ${await bootError.innerText()}`);

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
      expect(luminance.mean, "the image is not black").toBeGreaterThan(MIN_LUMINANCE_MEAN);
      expect(luminance.std, "the image is not blank or flat").toBeGreaterThan(MIN_LUMINANCE_STD);
      if (reference !== "candidate-written") {
        expect(shot).toMatchSnapshot([scene.id, `${pose.id}.png`], { maxDiffPixelRatio: 0.01 });
      }
    });
  }
}
