// Violation: a test under src/ may use node:assert, node:zlib and node:fs
// (shared fixtures) and nothing else from Node. Spawning processes belongs in
// tools/ tests.
import { execFileSync } from "node:child_process";

export const run = (file: string): string => execFileSync(file, { encoding: "utf8" });
