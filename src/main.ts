// Application entry: boot the served project (architecture §4.7, §4.8).
// Engine features are collected from their folders, so a new feature changes
// no file here; the game module comes from the project (virtual module).
// Render bindings are collected the same way, from `features/*/render.ts`
// (phase 3 decision 2: `feature.ts` never names them), and handed to the
// render host through the level viewer.
//
// `?level=<project-relative folder>` opens another level than the project's
// start level (the render smoke and reference scenes use it); `?forceWebGL`
// is the labelled WebGL2 test mode (architecture §4.10), never a WebGPU run.

import type { FeatureDef } from "./core/index.ts";
import { createSaveClient } from "./core/index.ts";
import { loadDevAssetUrls, assetUrlsFromIndex, type AssetUrls } from "./render/resources/assetUrls.ts";
import type { RenderBindingDef } from "./render/sync/renderBinding.ts";
import { createLevelViewer } from "./render/viewer/levelViewer.ts";
import { bootErrorView, bootGame } from "./runtime/boot.ts";
import { createBootScreen } from "./runtime/bootScreen.ts";
import { loadProjectLevel } from "./runtime/projectLevel.ts";
import gameModule from "virtual:forge/game-module";

const featureModules = import.meta.glob<{ default: FeatureDef }>("./features/*/feature.ts", { eager: true });
const features = Object.keys(featureModules)
  .sort()
  .map((path) => featureModules[path]!.default);
const bindingModules = import.meta.glob<{ default: RenderBindingDef }>("./features/*/render.ts", { eager: true });
const bindings = Object.keys(bindingModules)
  .sort()
  .map((path) => bindingModules[path]!.default);

const root = document.querySelector<HTMLElement>("#app") ?? document.body;
const viewport = document.querySelector<HTMLElement>("#viewport") ?? document.body;
const screen = createBootScreen(document, root);
const client = createSaveClient({ fetch: (input, init) => fetch(input, init as RequestInit | undefined) });
const strict = import.meta.env.DEV;
const params = new URLSearchParams(location.search);

async function assetUrls(): Promise<AssetUrls> {
  try {
    return await loadDevAssetUrls(async (url, headers) => {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    });
  } catch (error) {
    // A production build has no dev server; its asset directory comes with the dist work (phase 4).
    if (strict) throw error;
    return assetUrlsFromIndex({}, (file) => file);
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function start(): Promise<void> {
  let startLevel = "";
  try {
    const identity = await client.identity();
    document.title = identity.project.name ?? "Forge WebGPU";
    if (identity.project.problems.length > 0) {
      screen.error({ ...bootErrorView("project", new Error(identity.project.root)), details: identity.project.problems });
      return;
    }
    startLevel = params.get("level") ?? identity.project.startLevel;
  } catch (error) {
    screen.error(bootErrorView("project", error));
    return;
  }
  let urls: AssetUrls;
  try {
    urls = await assetUrls();
  } catch (error) {
    screen.error(bootErrorView("project", error));
    return;
  }
  const viewer = createLevelViewer({
    document,
    container: viewport,
    dev: import.meta.env.DEV,
    forceWebGL: params.has("forceWebGL"),
    bindings,
    assetUrls: urls,
    storage: storage(),
  });
  await bootGame({
    features,
    ...(gameModule ? { gameModule } : {}),
    render: viewer,
    strict,
    loadLevel: async (registry) => (startLevel === "" ? null : loadProjectLevel(client, startLevel, registry, strict)),
    screen,
    scheduler: {
      request: (frame) => requestAnimationFrame(frame),
      cancel: (handle) => cancelAnimationFrame(handle),
    },
    warn: (issues) => console.warn("Level data report", issues),
  });
}

void start();
