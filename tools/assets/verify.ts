// The asset gate (architecture §4.10, D16): every asset under the content
// roots has a type, a licence and a source; no GUID is used twice; no binary
// lacks its meta file; no reference dangles. Runs strict: in the gate, data
// loss is an error.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { buildAssetIndex, type AssetIndex, type SchemaRegistry } from "../../src/core/index.ts";
import { scanContentRoots, type ScanResult } from "./scan.ts";

/** `content/` and every `samples/<name>/content/`. Missing ones are skipped by the scan. */
export function defaultContentRoots(projectRoot: string): string[] {
  const roots = ["content"];
  try {
    for (const entry of readdirSync(join(projectRoot, "samples"), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) roots.push(`samples/${entry.name}/content`);
    }
  } catch {
    // no samples yet
  }
  return roots;
}

export interface AssetVerification {
  readonly ok: boolean;
  readonly scan: ScanResult;
  readonly index: AssetIndex;
  /** One line per issue, then a summary line. */
  readonly lines: readonly string[];
}

export async function verifyAssets(
  projectRoot: string,
  options: { readonly registry: SchemaRegistry; readonly roots?: readonly string[] },
): Promise<AssetVerification> {
  const scan = await scanContentRoots(projectRoot, options.roots ?? defaultContentRoots(projectRoot));
  const index = buildAssetIndex(scan.files, { strict: true, registry: options.registry });
  const lines = index.issues.map(
    (issue) => `${issue.severity} ${issue.code} ${issue.file}${issue.path === "" ? "" : ` ${issue.path}`}: ${issue.message}`,
  );
  const where = scan.roots.length === 0 ? "no content root yet" : `${scan.roots.length} root(s): ${scan.roots.join(", ")}`;
  const errors = index.issues.filter((issue) => issue.severity === "error").length;
  lines.push(`${index.entries.size} asset(s), ${scan.files.length} file(s), ${where}; ${errors} error(s).`);
  return { ok: index.ok, scan, index, lines };
}
