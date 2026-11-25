import assert from "node:assert/strict";
import { test } from "vitest";
import { readSheetEntries, recipeState, sheetEntryState, unlistedRecipes, type SheetEntry } from "./familySheet.ts";

const entry = (status: SheetEntry["status"], digest = "d1", recipe = "r"): SheetEntry => ({ recipe, status, digest, note: "" });

test("an approval is for one output; a rejection holds", () => {
  assert.equal(sheetEntryState(entry("approved"), "d1"), "approved");
  assert.equal(sheetEntryState(entry("approved"), "d2"), "changed");
  assert.equal(sheetEntryState(entry("approved"), null), "changed");
  assert.equal(sheetEntryState(entry("rejected"), "d2"), "rejected");
  assert.equal(sheetEntryState(entry("pending", ""), "d1"), "pending");
});

test("over several pages: rejected, approved, changed, pending; unlisted is null", () => {
  assert.equal(recipeState([[entry("approved")], [entry("rejected")]], "r", "d1"), "rejected");
  assert.equal(recipeState([[entry("approved", "old")], [entry("approved")]], "r", "d1"), "approved");
  assert.equal(recipeState([[entry("pending")], [entry("approved", "old")]], "r", "d1"), "changed");
  assert.equal(recipeState([[entry("approved")]], "other", "d1"), null);
});

test("entries are read from a page document; unlisted recipes keep their order", () => {
  const entries = readSheetEntries({ entries: [{ recipe: "a", status: "approved", digest: "x", note: "n" }, { recipe: null, status: "pending" }, { recipe: "b", status: "nope" }, 3] });
  assert.deepEqual(entries, [{ recipe: "a", status: "approved", digest: "x", note: "n" }, { recipe: null, status: "pending", digest: "", note: "" }]);
  assert.deepEqual(readSheetEntries(null), []);
  assert.deepEqual(unlistedRecipes(entries, ["c", "a", "b"]), ["c", "b"]);
});
