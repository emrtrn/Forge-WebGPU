import broadleaf from "../../../content/packs/starter/procgen/trees/Broadleaf.treerecipe.json";
import conifer from "../../../content/packs/starter/procgen/trees/Conifer.treerecipe.json";
import shrub from "../../../content/packs/starter/procgen/trees/Hazel.treerecipe.json";
import type { AssetCatalog } from "./assetCatalog.ts";
import type { AssetDocument } from "./assetDocument.ts";

const presets = { broadleaf, conifer, shrub };

/** Another habit's skeleton differs in spray and proportions too: the starter's recipe of that habit. */
export function treeHabitDraft(document: AssetDocument, habit: unknown, catalog: AssetCatalog): AssetDocument | null {
  if ((habit !== "broadleaf" && habit !== "conifer" && habit !== "shrub") || document.habit === habit) return null;
  const preset = presets[habit];
  const available = (guid: string | null) => guid !== null && catalog.label(guid) !== null ? guid : null;
  const wood = (document.materials as { wood: string | null }).wood;
  return {
    ...document,
    ...preset,
    schema: document.schema, id: document.id,
    variants: document.variants, response: document.response,
    materials: { wood: wood ?? available(preset.materials.wood), leaf: available(preset.materials.leaf) },
  };
}
