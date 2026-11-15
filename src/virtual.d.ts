// The served project's game module, or null (tools/server/vitePlugin.ts).
declare module "virtual:forge/game-module" {
  import type { GameModuleDef } from "./runtime/gameModule.ts";
  const gameModule: GameModuleDef | null;
  export default gameModule;
}

// The served project's editor sides, for the editor only (tools/server/gameEditors.ts).
declare module "virtual:forge/game-editors" {
  import type { GameEditorFile } from "./editor/host/gameEditors.ts";
  const gameEditors: readonly GameEditorFile[];
  export default gameEditors;
}
