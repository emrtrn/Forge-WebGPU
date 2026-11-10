// The served project's game module, or null (tools/server/vitePlugin.ts).
declare module "virtual:forge/game-module" {
  import type { GameModuleDef } from "./runtime/gameModule.ts";
  const gameModule: GameModuleDef | null;
  export default gameModule;
}
