// Registers the authoring endpoints on the Vite dev server (`npm run dev`).
// Not in `vite build` or `vite preview`, and not while Vitest runs the tests
// (Vitest loads the same config).

import type { Plugin } from "vite";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { createForgeServer } from "./forgeServer.ts";

export function forgeServerPlugin(options: { readonly writableRoots?: readonly string[] } = {}): Plugin {
  return {
    name: "forge-server",
    apply: (_config, env) => env.command === "serve" && env.isPreview !== true && process.env.VITEST === undefined,
    async configureServer(server) {
      const root = server.config.root;
      const registry = await loadEngineRegistry(root);
      const forge = await createForgeServer({
        root,
        registry,
        ...(options.writableRoots !== undefined ? { writableRoots: options.writableRoots } : {}),
      });
      server.middlewares.use(forge.middleware);
    },
  };
}
