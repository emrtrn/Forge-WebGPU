// Reference integrity (architecture §4.6, decision A10).
//
// References are GUIDs only, so moving or renaming a file breaks nothing: the
// index is rebuilt and the GUID resolves to the new path. What can break:
// - a dangling reference: the GUID is in no indexed file. An error in
//   development, a report in a production build (the dropped-field rule, §4.5).
// - a type mismatch: an `assetRef` field limited to one asset type points at
//   an asset of another type. Same severity rule.
// Deleting goes through `planDelete`: an asset that is still referenced is
// not deleted without the caller seeing who uses it.

import { createContext, reportLoss, type NormalizeOptions } from "../schema/issues.ts";
import type { AssetReference } from "./assetIndex.ts";
import type { AssetEntry, FileIssue } from "./identity.ts";

export function checkReferences(
  entries: ReadonlyMap<string, AssetEntry>,
  references: readonly AssetReference[],
  options: NormalizeOptions,
): FileIssue[] {
  const issues: FileIssue[] = [];
  for (const reference of references) {
    const ctx = createContext(options);
    const target = entries.get(reference.target);
    if (!target) {
      // A missing class is reported by level normalisation, with what it
      // means for the overrides; do not report it twice.
      if (reference.via !== "class") {
        reportLoss(ctx, "dangling-reference", reference.path, `Asset ${reference.target} is in no indexed file.`);
      }
    } else if (reference.assetType !== null && target.type !== "" && target.type !== reference.assetType) {
      // A target without a type has its own `missing-required` issue in its meta file.
      reportLoss(
        ctx,
        "asset-type-mismatch",
        reference.path,
        `Expected a ${reference.assetType}; ${reference.target} is a ${target.type}.`,
      );
    }
    for (const issue of ctx.issues) issues.push({ ...issue, file: reference.file });
  }
  return issues;
}

export interface DeletePlan {
  readonly id: string;
  /** False when the index has no asset with this GUID. */
  readonly exists: boolean;
  /** References from other assets; a reference from the asset to itself does not count. */
  readonly referrers: readonly AssetReference[];
  /** True when nothing else references the asset. */
  readonly allowed: boolean;
}

export function planDelete(
  index: { readonly entries: ReadonlyMap<string, AssetEntry>; referrersOf(id: string): readonly AssetReference[] },
  id: string,
): DeletePlan {
  const referrers = index.referrersOf(id).filter((reference) => reference.from !== id);
  return { id, exists: index.entries.has(id), referrers, allowed: referrers.length === 0 };
}
