import broadleaf from "../../../content/packs/starter/procgen/trees/Broadleaf.treerecipe.json";
import conifer from "../../../content/packs/starter/procgen/trees/Conifer.treerecipe.json";
import shrub from "../../../content/packs/starter/procgen/trees/Hazel.treerecipe.json";
import type { AssetCatalog } from "./assetCatalog.ts";
import type { AssetDocument } from "./assetDocument.ts";

const presets = { broadleaf, conifer, shrub };

export function treeHabitDraft(document: AssetDocument, habit: unknown, catalog: AssetCatalog): AssetDocument | null {
  if (habit !== "broadleaf" && habit !== "conifer" && habit !== "shrub") return null;
  const wasShrub = document.generatorVersion === 5;
  if (wasShrub === (habit === "shrub")) return null;

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
