// Violation: feature.ts statically imports its own render binding. Node tools
// and the headless boot load feature.ts, so three/webgpu would come with it;
// the application entry collects features/*/render.ts itself.
import { snowNode } from "./render";

export const feature = { snowNode };
