import { normalizeJsonAsset } from "../../core/index.ts";
import { readSheetEntries, SHEET_STATUSES } from "../../engine/plant/familySheet.ts";
import { expect, test } from "vitest";
import { FAMILY_SHEET_STATUSES, FamilySheetAssetType } from "./schema.ts";

test("the page's schema and the rules read the same entries", () => {
  expect(FAMILY_SHEET_STATUSES).toEqual(SHEET_STATUSES);
  const entry = { recipe: `ast_${"1".repeat(32)}`, status: "approved", digest: "d", note: "n" };
  const { value } = normalizeJsonAsset(FamilySheetAssetType, { schema: "forge.familySheet/1", id: `ast_${"2".repeat(32)}`, entries: [entry, {}] }, { strict: true });
  expect(readSheetEntries(value)).toEqual([entry, { recipe: null, status: "pending", digest: "", note: "" }]);
});
