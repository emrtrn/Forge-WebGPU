import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetIndex } from "../../src/core/index.ts";
import { prepareTriangleModels } from "./triangleCache.ts";
import { refuseReason, type Middleware } from "../server/forgeServer.ts";

/** Opt-in GET: derivative work only when R7 is selected; no content writes.
 * Same localhost/header policy as other dev endpoints. Cache paths are hex IDs. */
export function triangleMiddleware(engineRoot: string, index: () => Promise<AssetIndex>, roots: readonly { readonly label: string; readonly dir: string }[]): Middleware {
  const cacheDir = join(engineRoot, ".forge-cache/triangles");
  return (req, res, next) => {
    const match = /^\/__forge\/triangles\/(index|[a-f0-9]{16})\.json$/.exec((req.url ?? "").split("?")[0]!);
    if (!match) { next(); return; }
    if (req.method !== "GET" || refuseReason(req)) { res.statusCode = 403; res.end(); return; }
    void (async () => {
      res.setHeader("Content-Type", "application/json");
      if (match[1] === "index") {
        const dirs = new Map(roots.map((root) => [root.label, root.dir]));
        const files = [...(await index()).entries.values()].filter((entry) => entry.type === "forge.model").map((entry) => join(dirs.get(entry.root)!, ...entry.path.split("/")));
        res.end(JSON.stringify(await prepareTriangleModels(files, cacheDir)));
      } else res.end(await readFile(join(cacheDir, `${match[1]}.json`)));
    })().catch((error: unknown) => { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); });
  };
}
