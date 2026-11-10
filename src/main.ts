// Application entry: boot the served project (architecture §4.7, §4.8).
// Engine features are collected from their folders, so a new feature changes
// no file here; the game module comes from the project (virtual module).

import type { FeatureDef } from "./core/index.ts";
import { createSaveClient } from "./core/index.ts";
import { bootErrorView, bootGame } from "./runtime/boot.ts";
import { createBootScreen } from "./runtime/bootScreen.ts";
import { loadProjectLevel } from "./runtime/projectLevel.ts";
import gameModule from "virtual:forge/game-module";

const featureModules = import.meta.glob<{ default: FeatureDef }>("./features/*/feature.ts", { eager: true });
const features = Object.keys(featureModules)
  .sort()
  .map((path) => featureModules[path]!.default);

const root = document.querySelector<HTMLElement>("#app") ?? document.body;
const screen = createBootScreen(document, root);
const client = createSaveClient({ fetch: (input, init) => fetch(input, init as RequestInit | undefined) });
const strict = import.meta.env.DEV;

async function start(): Promise<void> {
  let startLevel = "";
  try {
    const identity = await client.identity();
    document.title = identity.project.name ?? "Forge WebGPU";
    if (identity.project.problems.length > 0) {
      screen.error({ ...bootErrorView("project", new Error(identity.project.root)), details: identity.project.problems });
      return;
    }
    startLevel = identity.project.startLevel;
  } catch (error) {
    screen.error(bootErrorView("project", error));
    return;
  }
  await bootGame({
    features,
    ...(gameModule ? { gameModule } : {}),
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
