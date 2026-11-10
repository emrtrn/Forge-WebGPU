// Application entry: boot the game (architecture §4.7). Engine features are
// collected from their folders, so a new feature changes no file here.
// Without a project there is nothing to open: the boot screen says so (the
// engine repository has no default scene, A9).

import type { FeatureDef } from "./core/index.ts";
import { bootGame } from "./runtime/boot.ts";
import { createBootScreen } from "./runtime/bootScreen.ts";

const featureModules = import.meta.glob<{ default: FeatureDef }>("./features/*/feature.ts", { eager: true });
const features = Object.keys(featureModules)
  .sort()
  .map((path) => featureModules[path]!.default);

const root = document.querySelector<HTMLElement>("#app") ?? document.body;

void bootGame({
  features,
  strict: import.meta.env.DEV,
  loadLevel: async () => null,
  screen: createBootScreen(document, root),
  scheduler: {
    request: (frame) => requestAnimationFrame(frame),
    cancel: (handle) => cancelAnimationFrame(handle),
  },
  warn: (issues) => console.warn("Level data report", issues),
});
