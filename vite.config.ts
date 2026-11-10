import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { forgeServerPlugin } from "./tools/server/vitePlugin.ts";

// This repo's own ports. Forge WebGL uses 5173 / 5273 and Ridgebound 5175;
// strictPort makes a clash fail loudly instead of drifting onto another
// project's port.
export const DEV_PORT = 5183;
export const SMOKE_PORT = 5283;

export default defineConfig({
  plugins: [forgeServerPlugin()],
  resolve: {
    // The only engine imports a game project has (A8). Its generated
    // tsconfig knows these two names and nothing else.
    alias: {
      "@forge/sdk": fileURLToPath(new URL("./src/sdk/index.ts", import.meta.url)),
      "@forge/editor-sdk": fileURLToPath(new URL("./src/editor-sdk/index.ts", import.meta.url)),
    },
  },
  server: {
    port: DEV_PORT,
    strictPort: true,
  },
  preview: {
    port: SMOKE_PORT,
    strictPort: true,
  },
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
