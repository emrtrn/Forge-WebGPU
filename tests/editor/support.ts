// Shared helpers of the editor smokes (plan phase 4 step 10a): the editor's
// address with the WebGL switch, opening it and waiting for it, the page's
// errors, and levels written into the run's project copy (never into
// samples/, D14).
//
// `FORGE_EDITOR_WEBGPU=1` (`npm run smoke:editor:webgpu`, headed Chrome on a
// machine with a GPU) drops `forceWebGL`; every opened editor then also
// proves its canvas draws with the WebGPU backend, so a run that silently
// fell back never passes as a WebGPU acceptance.
//
// Errors: uncaught page errors, every `console.error` and every response of
// 400 or more (as `409 POST /__forge/save`). A test that provokes one on
// purpose (a refused save's 409, an unknown play session's 410) names it in
// `allow`; nothing else is let through.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/** True when the run draws with WebGPU (no `forceWebGL`). */
export const WEBGPU = process.env.FORGE_EDITOR_WEBGPU === "1";

/** The `forceWebGL` query part (with its `&`), empty on a WebGPU run. */
export const WEBGL_QUERY = WEBGPU ? "" : "&forceWebGL";

export const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };

/** The run's temporary project copy (playwright.config.ts makes it). */
export function smokeProject(): string {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  return project;
}

/** A project-relative path (`content/levels/x`) on disk, in `root` (default: the run's project copy). */
export function projectPath(path: string, root: string = smokeProject()): string {
  return join(root, ...path.split("/"));
}

/** The editor's address: `?editor`, the level when given, `forceWebGL` unless WebGPU. `base` for a spec's own server. */
export function editorUrl(level?: string, base = "/"): string {
  return `${base}?editor${level ? `&level=${encodeURIComponent(level)}` : ""}${WEBGL_QUERY}`;
}

/** A `forge.shape@2` component in the level's stored form. */
export function shape(primitive = "cube", color = "#c8c8c8"): Record<string, unknown> {
  return { type: "forge.shape@2", parent: null, local: IDENTITY, primitive, color, castShadow: true, collision: true };
}

/**
 * Writes `level.json` (stored form, `cellSize` 128) into the level folder,
 * creating it; returns the folder on disk.
 */
export function writeLevel(level: string, levelId: string, actors: readonly unknown[], root: string = smokeProject()): string {
  const folder = projectPath(level, root);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "level.json"), `${JSON.stringify({ schema: "forge.level/1", id: levelId, settings: { cellSize: 128 }, actors }, null, 2)}\n`);
  return folder;
}

/**
 * Collects the page's uncaught errors and `console.error` messages from now
 * on; a console message matching one of `allow` is left out.
 */
/**
 * Answers the editor asks for knowing they may be missing, never errors:
 * - a level's `cells.json` (a level without cells has none; the session reads it optionally);
 * - a thumbnail the server's cache does not hold yet (the editor draws it and stores it).
 */
export const EXPECTED_MISSES: readonly RegExp[] = [
  /^404 GET \/__forge\/read\?path=[^&]*%2Fcells\.json$/,
  /^404 GET \/__forge\/read\?path=[^&]*%2Fhlod\.json(?:&play=[^&]+)?$/,
  /^404 GET \/__forge\/thumbnail\?/,
];

/** The 409 a refused save answers (a test that provokes one on purpose allows it). */
export const SAVE_CONFLICT = /^409 POST \/__forge\/save$/;

export function watchErrors(page: Page, allow: readonly RegExp[] = []): string[] {
  const errors: string[] = [];
  const add = (text: string): void => {
    if (![...EXPECTED_MISSES, ...allow].some((pattern) => pattern.test(text))) errors.push(text);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // The browser's "Failed to load resource" names no address; the response below does.
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) add(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) add(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}${new URL(response.url()).search}`);
  });
  return errors;
}

export interface OpenOptions {
  /** The level to open (default: the project's start level). */
  readonly level?: string;
  /** Another server's root URL (a spec that runs its own dev server). */
  readonly base?: string;
  /** Also wait until the viewport has drawn the level (`data-forge-ready`). */
  readonly drawn?: boolean;
  /** Console errors the test provokes on purpose. */
  readonly allow?: readonly RegExp[];
}

/** Opens the editor and waits until it is ready; returns the page's errors from now on (see `watchErrors`). */
export async function openEditor(page: Page, options: OpenOptions = {}): Promise<string[]> {
  const errors = watchErrors(page, options.allow);
  await page.goto(editorUrl(options.level, options.base));
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  const canvas = page.getByTestId("forge-canvas");
  if (options.drawn) await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  if (WEBGPU) await expect(canvas).toHaveAttribute("data-forge-backend", "webgpu", { timeout: 60_000 });
  return errors;
}

/** The backend a page must draw with on this run (`data-forge-backend`). */
export const BACKEND = WEBGPU ? "webgpu" : "webgl2";

/** The gizmo's handle points in client pixels (`origin`, `tool:axis`), from the canvas's `data-forge-gizmo`. */
export type GizmoPoints = Record<string, [number, number]>;

export async function gizmoHandles(canvas: Locator): Promise<GizmoPoints> {
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /origin/);
  return JSON.parse((await canvas.getAttribute("data-forge-gizmo"))!) as GizmoPoints;
}

/** Drags in ten steps from `from` by `delta` pixels with the left button. */
export async function drag(page: Page, from: readonly [number, number], delta: readonly [number, number]): Promise<void> {
  const [x, y] = from;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(x + (delta[0] * step) / 10, y + (delta[1] * step) / 10);
  await page.mouse.up();
}

/** Drags a handle `pixels` further along the line from the gizmo's origin through it (a move or scale axis). */
export async function dragHandle(page: Page, canvas: Locator, handle: string, pixels: number): Promise<void> {
  const points = await gizmoHandles(canvas);
  const [ox, oy] = points.origin!;
  const [hx, hy] = points[handle]!;
  const length = Math.hypot(hx - ox, hy - oy);
  await drag(page, [hx, hy], [((hx - ox) / length) * pixels, ((hy - oy) / length) * pixels]);
}

/** The Outliner row of an actor. */
export const row = (page: Page, actorId: string): Locator => page.locator(`[data-testid="outliner-row"][data-actor-id="${actorId}"]`);

/** The Outliner row whose name is exactly `name`. */
export const named = (page: Page, name: string): Locator =>
  page.getByTestId("outliner-row").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) });
