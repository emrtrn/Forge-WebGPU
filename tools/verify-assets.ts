// Asset gate (architecture §4.10, D16; decision A10). Scans `content/` and
// `samples/*/content/`, builds the asset index strictly and fails on any
// error: an asset without type, licence or source, a binary without its meta
// file, a duplicate GUID, a dangling reference. Writes nothing.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngineRegistry } from "./assets/engineRegistry.ts";
import { verifyAssets } from "./assets/verify.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = await verifyAssets(repoRoot, { registry: await loadEngineRegistry(repoRoot) });
for (const line of result.lines) {
  (result.ok ? console.log : console.error)(`verify:assets: ${line}`);
}
if (!result.ok) process.exit(1);
