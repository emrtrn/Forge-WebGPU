// File size budget (architecture §4.3): warn at 800 lines, fail at 1,500.
// Catches a god object growing back early. Generated files (*.generated.*)
// are exempt.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WARN_LINES = 800;
const FAIL_LINES = 1500;
const ROOTS = ["src", "tools"];
const EXTENSIONS = [".ts", ".mts", ".mjs", ".js", ".css", ".html"];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function* walk(directory: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return; // root does not exist yet
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (
      EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
      !entry.name.includes(".generated.")
    ) {
      yield path;
    }
  }
}

const warnings: string[] = [];
const failures: string[] = [];
let fileCount = 0;

for (const root of ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    fileCount += 1;
    const text = readFileSync(file, "utf8");
    const lines = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const label = `${relative(repoRoot, file).replaceAll("\\", "/")} (${lines} lines)`;
    if (lines > FAIL_LINES) {
      failures.push(label);
    } else if (lines > WARN_LINES) {
      warnings.push(label);
    }
  }
}

for (const label of warnings) {
  console.warn(`verify:file-size: warning, over ${WARN_LINES} lines: ${label}`);
}
for (const label of failures) {
  console.error(`verify:file-size: over the ${FAIL_LINES}-line budget: ${label}`);
}
if (failures.length > 0) {
  process.exit(1);
}
console.log(
  `verify:file-size: ${fileCount} files within budget` +
    (warnings.length > 0 ? ` (${warnings.length} warning(s)).` : "."),
);
