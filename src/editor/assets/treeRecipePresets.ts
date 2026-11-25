// What a tree recipe can start from in its editor: the starter pack's species
// (Species Preset: shape, sprays, bark, LODs and season response in one edit)
// and, when the habit changes, the starter's recipe of that habit. The
// recipe's own identity and seeds stay. A species added to the starter pack
// lists itself.

import type { AssetCatalog } from "./assetCatalog.ts";
import type { AssetDocument, AssetDocumentAdapter } from "./assetDocument.ts";

const FILES = import.meta.glob<AssetDocument>("../../../content/packs/starter/procgen/trees/*.treerecipe.json", { eager: true, import: "default" });
/** By name: `Birch`, `Broadleaf`… */
export const TREE_SPECIES: ReadonlyMap<string, AssetDocument> = new Map(Object.entries(FILES)
  .map(([file, document]) => [/([^/]+)\.treerecipe\.json$/.exec(file)![1]!, document] as const)
  .sort(([a], [b]) => a.localeCompare(b)));

const HABITS: Readonly<Record<string, string>> = { broadleaf: "Broadleaf", conifer: "Conifer", shrub: "Hazel" };
/** What stays the recipe's own when it takes a species. */
const OWN = ["schema", "id", "variants", "materials"];

interface Materials { readonly wood: string | null; readonly leaf: string | null }
const available = (guid: string | null, catalog: AssetCatalog): string | null => (guid !== null && catalog.label(guid) !== null ? guid : null);

/**
 * The recipe as a species: every field but its identity and seeds. The bark is the species' where the project has
 * it; the leaf slot is emptied, so the recipe's own sprays are drawn (the starter's leaf materials read the starter's).
 */
export function treeSpeciesDraft(document: AssetDocument, name: string, catalog: AssetCatalog): AssetDocument | null {
  const species = TREE_SPECIES.get(name);
  if (!species) return null;
  const wood = available((species.materials as Materials).wood, catalog) ?? (document.materials as Materials).wood;
  return { ...species, id: document.id, variants: document.variants, materials: { wood, leaf: null } };
}

/** Another habit's skeleton differs in spray and proportions too: the starter's recipe of that habit, its bark and response kept. */
export function treeHabitDraft(document: AssetDocument, habit: unknown, catalog: AssetCatalog): AssetDocument | null {
  const name = typeof habit === "string" ? HABITS[habit] : undefined;
  if (!name || document.habit === habit) return null;
  const draft = treeSpeciesDraft(document, name, catalog)!, wood = (document.materials as Materials).wood;
  return { ...draft, response: document.response, materials: { wood: wood ?? (draft.materials as Materials).wood, leaf: null } };
}

const sorted = (value: unknown): unknown => (Array.isArray(value) ? value.map(sorted) : typeof value === "object" && value !== null
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, entry]) => [key, sorted(entry)])) : value);
const shapeOf = (document: AssetDocument): string => JSON.stringify(sorted(Object.fromEntries(Object.entries(document).filter(([key]) => !OWN.includes(key)))));

/** The species a recipe still is, or null once anything of it was changed. */
export function createTreeSpeciesMatch(adapter: AssetDocumentAdapter): (document: AssetDocument) => string | null {
  const shapes = new Map<string, string>();
  for (const [name, document] of TREE_SPECIES) {
    const { value } = adapter.normalize(document);
    if (value) shapes.set(shapeOf(value), name);
  }
  return (document) => shapes.get(shapeOf(document)) ?? null;
}

export interface TreeSpeciesRow {
  readonly element: HTMLElement;
  update(): void;
}

/** The Species Preset row above the form. */
export function createTreeSpeciesRow(options: {
  readonly document: Document;
  readonly adapter: AssetDocumentAdapter;
  readonly catalog: AssetCatalog;
  readonly disabled: boolean;
  readonly value: () => AssetDocument;
  readonly apply: (name: string, document: AssetDocument) => void;
  readonly status: (message: string) => void;
}): TreeSpeciesRow {
  const doc = options.document, match = createTreeSpeciesMatch(options.adapter);
  const row = doc.createElement("label"), label = doc.createElement("span"), select = doc.createElement("select"), custom = doc.createElement("option");
  row.className = "detail-row";
  label.textContent = "Species Preset";
  label.title = select.title = "Tarife bir türün bütün biçimini, kabuğunu ve mevsim tepkisini verir (tek Undo). Tarifin kimliği ve tohumları kalır; çıktı Generate'e kadar değişmez.";
  custom.value = ""; custom.textContent = "Custom"; custom.disabled = true;
  select.append(custom, ...[...TREE_SPECIES.keys()].map((name) => {
    const option = doc.createElement("option");
    option.value = option.textContent = name;
    return option;
  }));
  select.dataset.testid = "asset-tree-species";
  select.setAttribute("aria-label", "Species Preset");
  select.disabled = options.disabled;
  const update = (): void => { select.value = match(options.value()) ?? ""; };
  select.addEventListener("change", () => {
    const name = select.value, draft = treeSpeciesDraft(options.value(), name, options.catalog);
    const checked = draft ? options.adapter.normalize(draft) : null;
    if (checked?.ok && checked.value) options.apply(name, checked.value);
    else { options.status(checked?.issues.map((issue) => issue.message).join("\n") ?? ""); update(); }
  });
  row.append(label, select);
  update();
  return { element: row, update };
}
