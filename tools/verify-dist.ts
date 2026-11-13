// `npm run verify:dist` (plan phase 4; INV-H07): the production build carries
// no editor. Adapted from Forge WebGL builder/web/verify-dist.mjs @
// forge-webgl-final (04b5fb23): a string scan of `dist/` after `vite build`.
//
// The editor is reached only through dev-gated dynamic imports in src/main.ts
// (`editor-only-dynamic`, `editor-render-is-editor-only`), which a production
// build drops with their chunks; a correct dist has none of the editor's
// marker strings (CSS classes, test ids, style ids, the kit's sample).
//
// Two tiers, as in Forge:
// - FAIL: an editor marker in dist; the boundary is broken. Exit 1.
// - WARN: authoring endpoints of the dev server (save, binary staging) in the
//   game bundle. `--strict` fails on them too.
//
// A heuristic scan, not a proof: minifiers rename identifiers, so the markers
// are strings that survive minification.
//
// Usage: node tools/verify-dist.ts [--strict] [--dist <folder>]

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Strings only the editor contains. */
export const FAIL_TOKENS: readonly { token: string; reason: string }[] = [
  { token: "editor-shell", reason: "the editor shell (layout CSS or markup)" },
  { token: "forge-editor", reason: "the editor root's test id" },
  { token: "forge-editor-shell-style", reason: "the editor shell's stylesheet" },
  { token: "forge-kit-style", reason: "the editor UI kit's stylesheet" },
  { token: "editorkit.sample", reason: "the UI kit's sample component (?editor-kit)" },
  { token: "Editor UI Kit", reason: "the UI kit's page (?editor-kit)" },
  { token: "editorReady", reason: "the editor's ready flag" },
  { token: "editor overlay", reason: "the editor viewport's drawing layer (src/render/editor)" },
];

/** Dev server authoring endpoints: a game only reads. */
export const WARN_TOKENS: readonly { token: string; reason: string }[] = [
  { token: "__forge/save", reason: "the save endpoint (authoring) in the game bundle" },
  { token: "__forge/stage-binary", reason: "the binary staging endpoint (authoring) in the game bundle" },
];

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".html", ".css", ".json", ".map", ".txt", ".svg"]);

export interface DistFinding {
  readonly tier: "fail" | "warn";
  readonly file: string;
  readonly token: string;
  readonly reason: string;
}

function walk(folder: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/** Every marker found in the text files under `dist`, with the file relative to it. */
export function scanDist(dist: string): DistFinding[] {
  const findings: DistFinding[] = [];
  for (const file of walk(dist)) {
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const text = readFileSync(file, "utf8");
    const name = relative(dist, file).split("\\").join("/");
    for (const { token, reason } of FAIL_TOKENS) if (text.includes(token)) findings.push({ tier: "fail", file: name, token, reason });
    for (const { token, reason } of WARN_TOKENS) if (text.includes(token)) findings.push({ tier: "warn", file: name, token, reason });
  }
  return findings;
}

function main(argv: readonly string[]): number {
  const strict = argv.includes("--strict");
  const at = argv.indexOf("--dist");
  const dist = at >= 0 && argv[at + 1] ? resolve(process.cwd(), argv[at + 1]!) : join(REPO_ROOT, "dist");
  if (!existsSync(dist) || !statSync(dist).isDirectory() || !existsSync(join(dist, "index.html"))) {
    console.error(`verify:dist: no build at ${dist} (run npm run build first).`);
    return 1;
  }
  const findings = scanDist(dist);
  for (const found of findings) {
    const line = `verify:dist: ${found.tier === "fail" ? "FAIL" : "WARN"} ${found.file}: "${found.token}" (${found.reason})`;
    if (found.tier === "fail" || strict) console.error(line);
    else console.warn(line);
  }
  const failed = findings.filter((found) => found.tier === "fail" || strict).length;
  if (failed > 0) {
    console.error(`verify:dist: ${failed} finding(s) fail the build${strict ? " (--strict)" : ""}.`);
    return 1;
  }
  const warnings = findings.length;
  console.log(`verify:dist: no editor in ${relative(REPO_ROOT, dist) || dist}${warnings > 0 ? ` (${warnings} warning(s))` : ""}.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
