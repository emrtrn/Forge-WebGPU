// Rebuilds the asset index cache `.forge-cache/asset-index.json` from the
// content roots (architecture §4.6, A10). The cache is derived data and is
// never committed; run this, or let the dev server do it, when it is missing.
// Unlike the gate it does not fail on issues: it reports them and still writes
// what it could index.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toAssetIndexCache, writeAssetIndexCache } from "./assets/cache.ts";
import { loadEngineRegistry } from "./assets/engineRegistry.ts";
import { verifyAssets } from "./assets/verify.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = await verifyAssets(repoRoot, { registry: await loadEngineRegistry(repoRoot) });
for (const line of result.lines) console.log(`asset-index: ${line}`);
const path = await writeAssetIndexCache(repoRoot, toAssetIndexCache(result.index, result.scan.roots));
console.log(`asset-index: wrote ${path}`);
