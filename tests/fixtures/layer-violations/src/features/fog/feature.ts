// Violation (two rules): feature.ts statically imports its own editor part,
// which would put the editor into the game bundle. feature.ts never names
// editor.ts; the editor host collects features/*/editor.ts itself.
import { fogEditor } from "./editor";

export const feature = { fogEditor };
