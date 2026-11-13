// Page setup shared by the render smoke and the measurements on the smoke
// server: the camera pose and the fixed quality profile go to localStorage
// before the page loads (the Phase 0 baseline's rules), then the level opens
// and the canvas reports ready (`data-forge-ready`) or the boot stops.

import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { Matrix4, Quaternion, Vector3 } from "three";
import { REPO_ROOT, SMOKE_QUALITY, type SmokePose } from "./renderScenes.ts";

export const READY_TIMEOUT_MS = 120_000;

export function quaternionOf(pose: SmokePose): [number, number, number, number] {
  const eye = new Vector3(...pose.position);
  const target = new Vector3(...pose.target);
  const rotation = new Matrix4().lookAt(eye, target, new Vector3(0, 1, 0));
  const q = new Quaternion().setFromRotationMatrix(rotation);
  return [q.x, q.y, q.z, q.w];
}

export function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export interface OpenedLevel {
  readonly cameraPose: { position: readonly [number, number, number]; quaternion: [number, number, number, number] };
}

/** Opens `level` at `pose` with the smoke profile and waits until it is ready; a boot error throws. */
export async function openSmokeLevel(page: Page, level: string, pose: SmokePose): Promise<OpenedLevel> {
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
  await page.goto(`/?level=${encodeURIComponent(level)}`);
  const canvas = page.locator("canvas[data-forge-ready='1']");
  const bootError = page.getByTestId("boot-error");
  await expect(canvas.or(bootError)).toBeVisible({ timeout: READY_TIMEOUT_MS });
  if (await bootError.isVisible()) throw new Error(`The boot stopped: ${await bootError.innerText()}`);
  return { cameraPose };
}
