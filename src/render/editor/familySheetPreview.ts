// The approval page's preview (vegetation plan §7.3, PG5): the published output
// of the recipe the page's list selects, its prototypes or one prototype's
// LODs and impostor, with the scale bar, under the preview's own weather.
// Rocks are drawn from their Foliage Types, plants from their family.

import type { AssetPreviewController, JsonObject } from "../../core/index.ts";
import type { RecipeLinks } from "../../engine/procgen/recipeLinks.ts";
import { foliageTypeDraw } from "../foliage/foliageTypeDraw.ts";
import type { FoliageTypeDraw } from "../foliage/foliageBatches.ts";
import { familyPrototype, plantDraw, type PlantFamilyFieldsRead } from "../plant/plantFamilies.ts";
import type { AssetPreviewContext } from "./assetPreview.ts";
import { IMPOSTOR_LOD, type FamilyPreviewReaders } from "./familyPreview.ts";
import { createFamilyStage, type StageColumn } from "./familyStage.ts";
import { createPreviewEnvironment, previewControl } from "./previewEnvironment.ts";

export interface FamilySheetReaders extends FamilyPreviewReaders {
  /** A stored `forge.plantFamily`, normalised. */
  readonly family: (raw: unknown) => PlantFamilyFieldsRead | null;
}

export function createFamilySheetPreview(ctx: AssetPreviewContext, readers: FamilySheetReaders): AssetPreviewController {
  const doc = ctx.container.ownerDocument;
  const panel = doc.createElement("div"), surface = doc.createElement("div"), bar = doc.createElement("div"), weather = doc.createElement("div"), stats = doc.createElement("output");
  panel.className = "tree-preview"; surface.className = "tree-preview-surface"; bar.className = "tree-preview-bar"; weather.className = "tree-preview-bar";
  const view = previewControl(doc, bar, "View", "select", "Bütün prototipler ya da bir prototipin LOD'ları.");
  view.append(new Option("Prototypes", "prototypes"), new Option("Side by Side", "lods"));
  const prototype = previewControl(doc, bar, "Prototype", "select", "LOD'ları gösterilen prototip.");
  prototype.disabled = true;
  stats.dataset.testid = "sheet-preview-stats";
  bar.append(stats); panel.append(surface, bar, weather); ctx.container.append(panel);
  const environment = createPreviewEnvironment(doc, weather);
  const stage = createFamilyStage(ctx, surface, environment);
  const resources = ctx.host.resources(`family-sheet:${ctx.guid}`);
  let selected: string | null = null, links: RecipeLinks | null = null, disposed = false, ticket = 0;

  const seedName = ({ seed, young }: { readonly seed: number; readonly young: boolean }): string => (young ? `${seed} (young)` : String(seed));
  const drawsOf = async (shown: RecipeLinks): Promise<{ seed: string; lods: number; impostor: boolean; draw: FoliageTypeDraw }[]> => {
    const family = shown.family === null ? null : readers.family(await resources.json(shown.family) as JsonObject);
    const found = await Promise.all(shown.prototypes.map(async (entry) => {
      if (family) {
        const read = familyPrototype(family, shown.family!, entry.index);
        return read ? { seed: seedName(entry), lods: read.lods.length + 1, impostor: read.impostor !== null, draw: plantDraw(read, shown.family!, entry.index, false) } : null;
      }
      const type = readers.foliageType(await resources.json(entry.foliageType));
      const draw = type ? foliageTypeDraw(entry.foliageType, { ...type, castShadow: false, cullStart: 0, cullEnd: 0 }, null) : null;
      return draw ? { seed: seedName(entry), lods: draw.lods.length + 1, impostor: false, draw } : null;
    }));
    return found.flatMap((entry) => (entry ? [entry] : []));
  };

  const draw = async (): Promise<void> => {
    const current = ++ticket, shown = links;
    if (!shown) return;
    const draws = await drawsOf(shown);
    if (disposed || current !== ticket) return;
    const at = Math.max(0, prototype.selectedIndex);
    prototype.replaceChildren(...draws.map((entry, index) => new Option(entry.seed, String(index))));
    prototype.selectedIndex = Math.min(at, draws.length - 1);
    const one = draws[prototype.selectedIndex];
    const columns: StageColumn[] = view.value === "lods" && one
      ? [
        ...Array.from({ length: one.lods }, (_, lod) => ({ label: `LOD ${lod}`, seed: 1, draw: { ...one.draw, id: `lod${lod}`, forcedLod: lod } })),
        ...(one.impostor ? [{ label: "Impostor", seed: 1, draw: { ...one.draw, id: "impostor", forcedLod: IMPOSTOR_LOD } }] : []),
      ]
      : draws.map((entry, index) => ({ label: `Seed ${entry.seed}`, seed: 1, draw: { ...entry.draw, id: `prototype${index}` } }));
    if (columns.length === 0) { stats.value = `${shown.recipe.name}: not generated yet.`; return; }
    if (await stage.show(columns)) stats.value = `${shown.recipe.name} · ${draws.length} prototypes · scale ${stage.scale} m`;
  };
  view.onchange = () => { prototype.disabled = view.value === "prototypes"; void draw(); };
  prototype.onchange = () => void draw();

  return {
    async update() {},
    select(recipe) {
      if (recipe === selected) return;
      selected = recipe;
      links = null;
      const current = ++ticket;
      void ctx.recipeLinks?.(recipe).then((found) => {
        if (disposed || current !== ticket) return;
        links = found;
        return draw();
      }).catch((error: unknown) => { if (!disposed && current === ticket) stats.value = error instanceof Error ? error.message : String(error); });
    },
    focus: () => stage.focus(), setTool() {}, info: () => ({ slots: [], meshes: [] }),
    dispose() { disposed = true; stage.dispose(); resources.releaseAll(); panel.remove(); },
  };
}
