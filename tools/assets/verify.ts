// The asset gate (architecture §4.10, D16): every asset under the content
// roots has a type, a licence and a source; no GUID is used twice; no binary
// lacks its meta file; no reference dangles. Runs strict: in the gate, data
// loss is an error.
//
// The engine's content and packs (A9) are also checked the way a project sees
// them: `content/engine/` alone, and each pack with `content/engine/`. Engine
// content may refer to no pack, a pack to no other pack; such a reference
// dangles in the narrower index and fails the gate.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { buildAssetIndex, type AssetIndex, type SchemaRegistry } from "../../src/core/index.ts";
import { engineContentRoots, listContentPacks } from "./engineContent.ts";
import { scanContentRoots, scanRoots, type ScanResult } from "./scan.ts";

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
  let errors = index.issues.filter((issue) => issue.severity === "error").length;
  for (const pack of [null, ...(await listContentPacks(projectRoot))]) {
    const seen = pack === null ? "engine content alone" : `pack ${pack} with engine content`;
    const narrow = buildAssetIndex((await scanRoots(engineContentRoots(projectRoot, pack === null ? [] : [pack]))).files, {
      strict: true,
      registry: options.registry,
    });
    for (const issue of narrow.issues) {
      if (issue.code !== "dangling-reference") continue;
      errors += 1;
      lines.push(`error ${issue.code} ${issue.file} ${issue.path} (${seen}): ${issue.message}`);
    }
  }
  lines.push(`${index.entries.size} asset(s), ${scan.files.length} file(s), ${where}; ${errors} error(s).`);
  return { ok: errors === 0, scan, index, lines };
}
