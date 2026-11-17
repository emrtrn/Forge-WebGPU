// Page setup shared by the render smoke and the measurements on the smoke
// server: the camera pose and the fixed quality profile go to localStorage
// before the page loads (the Phase 0 baseline's rules), then the level opens
// and the canvas reports ready (`data-forge-ready`) or the boot stops.

import { execFileSync } from "node:child_process";
import { expect, type ConsoleMessage, type Page } from "@playwright/test";
import { Matrix4, Quaternion, Vector3 } from "three";
import { REPO_ROOT, SMOKE_QUALITY, type SmokePose } from "./renderScenes.ts";

export const READY_TIMEOUT_MS = 120_000;

/** Legacy levels may have no HLOD bake; only that exact optional 404 is expected. */
export function isOptionalHlodMiss(message: ConsoleMessage): boolean {
  if (!message.text().startsWith("Failed to load resource:") || !message.text().includes("404 (Not Found)")) return false;
  try {
    const url = new URL(message.location().url);
    return url.pathname === "/__forge/read" && /^content\/levels\/.+\/hlod\.json$/.test(url.searchParams.get("path") ?? "");
  } catch { return false; }
}

export function quaternionOf(pose: Required<SmokePose>): [number, number, number, number] {
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
  /** Null when the viewer framed the level itself. */
  readonly cameraPose: { position: readonly [number, number, number]; quaternion: [number, number, number, number] } | null;
}

/** Opens `level` at `pose` with the smoke profile and waits until it is ready; a boot error throws. `query` adds URL parameters (`&debug`). */
export async function openSmokeLevel(page: Page, level: string, pose: SmokePose, query = ""): Promise<OpenedLevel> {
  const quaternion = pose.quaternion ? [...pose.quaternion] as [number, number, number, number] : pose.position && pose.target ? quaternionOf(pose as Required<SmokePose>) : null;
  const cameraPose = pose.position && quaternion ? { position: pose.position, quaternion } : null;
  if (cameraPose) await page.addInitScript((value) => localStorage.setItem("forge.play.cameraPose", value), JSON.stringify(cameraPose));
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
  await page.goto(`/?level=${encodeURIComponent(level)}${query}`);
  const canvas = page.locator("canvas[data-forge-ready='1']");
  const bootError = page.getByTestId("boot-error");
  await expect(canvas.or(bootError)).toBeVisible({ timeout: READY_TIMEOUT_MS });
  if (await bootError.isVisible()) throw new Error(`The boot stopped: ${await bootError.innerText()}`);
  return { cameraPose };
}

/** Mean absolute luminance difference of two PNG shots, 0 - 255. */
export async function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([first, second]) => {
    const pixels = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [x, y] = [await pixels(first), await pixels(second)];
    let sum = 0;
    for (let index = 0; index < x.length; index += 4) {
      const lx = 0.2126 * x[index]! + 0.7152 * x[index + 1]! + 0.0722 * x[index + 2]!;
      const ly = 0.2126 * y[index]! + 0.7152 * y[index + 1]! + 0.0722 * y[index + 2]!;
      sum += Math.abs(lx - ly);
    }
    return sum / (x.length / 4);
  }, [a.toString("base64"), b.toString("base64")] as const);
}
