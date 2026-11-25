// The approval page's rules (`forge.familySheet`, vegetation plan PG5; user
// decision 2026-11-25): a project's page lists model recipes (its own and its
// packs'), each with the user's answer and the digest of the output it was
// given for (engine/procgen/recipeOutputs.ts). A regeneration does not touch
// the page: an approval whose output changed reads "changed".

import { isJsonObject } from "../../core/index.ts";

export const SHEET_STATUSES = ["pending", "approved", "rejected"] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export interface SheetEntry {
  /** The recipe's GUID. */
  readonly recipe: string | null;
  readonly status: SheetStatus;
  /** Digest of the output approved or rejected; empty while pending. */
  readonly digest: string;
  readonly note: string;
}

export type SheetState = SheetStatus | "changed";

/** A rejection holds whatever the output is now. */
export function sheetEntryState(entry: SheetEntry, digest: string | null): SheetState {
  return entry.status === "approved" && (digest === null || entry.digest !== digest) ? "changed" : entry.status;
}

const STRONGEST: readonly SheetState[] = ["rejected", "approved", "changed", "pending"];

/** A recipe's state over a project's pages; null when none lists it. */
export function recipeState(sheets: readonly (readonly SheetEntry[])[], recipe: string, digest: string | null): SheetState | null {
  const states = new Set(sheets.flatMap((entries) => entries.filter((entry) => entry.recipe === recipe).map((entry) => sheetEntryState(entry, digest))));
  return STRONGEST.find((state) => states.has(state)) ?? null;
}

/** The entries of a page document; anything unusable is left out. */
export function readSheetEntries(document: unknown): SheetEntry[] {
  if (!isJsonObject(document) || !Array.isArray(document.entries)) return [];
  return (document.entries as unknown[]).flatMap((raw): SheetEntry[] => {
    if (!isJsonObject(raw)) return [];
    const status = SHEET_STATUSES.find((value) => value === raw.status);
    if (!status) return [];
    return [{
      recipe: typeof raw.recipe === "string" && raw.recipe !== "" ? raw.recipe : null, status,
      digest: typeof raw.digest === "string" ? raw.digest : "", note: typeof raw.note === "string" ? raw.note : "",
    }];
  });
}

/** Recipes no entry names, in the order given. */
export function unlistedRecipes(entries: readonly SheetEntry[], recipes: readonly string[]): string[] {
  const listed = new Set(entries.map((entry) => entry.recipe));
  return recipes.filter((recipe) => !listed.has(recipe));
}
