// The plant family's preview (vegetation plan §9, PG5): its prototypes, one
// prototype's LODs and impostor side by side, or a single `forge.plant` beside
// a foliage patch of the family's Foliage Types, each the way its binding
// draws it, under the preview's own season, snow, wetness and wind. The form
// edits the family's response; the plants follow the draft without a rebuild.

import type { AssetPreviewController, JsonObject } from "../../core/index.ts";
import { foliageTypeDraw, type FoliageTypeFieldsRead } from "../foliage/foliageTypeDraw.ts";
import { familyPrototype, plantDraw, type PlantFamilyFieldsRead } from "../plant/plantFamilies.ts";
import type { AssetPreviewContext } from "./assetPreview.ts";
import { createFamilyStage, type StageColumn } from "./familyStage.ts";
import { createPreviewEnvironment, previewControl } from "./previewEnvironment.ts";

export interface FamilyPreviewReaders {
  /** A stored `forge.foliageType`, normalised. */
  readonly foliageType: (raw: unknown) => FoliageTypeFieldsRead | null;
}

/** A forced LOD past every batch's last: the impostor, when there is one. */
export const IMPOSTOR_LOD = 99;

export function createFamilyPreview(ctx: AssetPreviewContext, readers: FamilyPreviewReaders): AssetPreviewController {
  const doc = ctx.container.ownerDocument;
  const panel = doc.createElement("div"), surface = doc.createElement("div"), bar = doc.createElement("div"), weather = doc.createElement("div"), stats = doc.createElement("output");
  panel.className = "tree-preview"; surface.className = "tree-preview-surface"; bar.className = "tree-preview-bar"; weather.className = "tree-preview-bar";
  const option = (value: string, label: string) => new Option(label, value);
  const view = previewControl(doc, bar, "View", "select", "Prototipler, bir prototipin LOD'ları ya da tekil bitki ile foliage yan yana.");
  view.append(option("prototypes", "Prototypes"), option("lods", "Side by Side"), option("foliage", "Single and Foliage"));
  const prototype = previewControl(doc, bar, "Prototype", "select", "LOD'ları ya da foliage'ı gösterilen prototip.");
  stats.dataset.testid = "family-preview-stats";
  bar.append(stats); panel.append(surface, bar, weather); ctx.container.append(panel);
  const environment = createPreviewEnvironment(doc, weather);
  const stage = createFamilyStage(ctx, surface, environment);
  const resources = ctx.host.resources(`family-preview:${ctx.guid}`);
  let family: PlantFamilyFieldsRead | null = null, structure = "", disposed = false, types: Promise<Map<string, FoliageTypeFieldsRead>> | null = null;

  /** The Foliage Types that draw this family. */
  const foliageTypes = () => types ??= (async () => {
    const found = new Map<string, FoliageTypeFieldsRead>();
    await Promise.all((ctx.assetsOf?.("forge.foliageType") ?? []).map(async (guid) => {
      const raw = await resources.json(guid).catch(() => null) as JsonObject | null;
      if (raw?.family !== ctx.guid) return;
      const type = readers.foliageType(raw);
      if (type) found.set(guid, type);
    }));
    return found;
  })();

  const columns = async (draft: PlantFamilyFieldsRead): Promise<StageColumn[]> => {
    const single = (index: number, id: string, forcedLod?: number): StageColumn["draw"] | null => {
      const read = familyPrototype(draft, ctx.guid, index);
      return read ? { ...plantDraw(read, ctx.guid, index, false), id, ...(forcedLod !== undefined ? { forcedLod } : {}) } : null;
    };
    const column = (label: string, draw: StageColumn["draw"] | null, patch?: number): StageColumn[] =>
      draw ? [{ label, draw, seed: 1, ...(patch ? { patch } : {}) }] : [];
    if (view.value === "lods") {
      const index = Number(prototype.value), read = familyPrototype(draft, ctx.guid, index);
      if (!read) return [];
      return [
        ...Array.from({ length: read.lods.length + 1 }, (_, lod) => column(`LOD ${lod}`, single(index, `lod${lod}`, lod))).flat(),
        ...(read.impostor ? column("Impostor", single(index, "impostor", IMPOSTOR_LOD)) : []),
      ];
    }
    if (view.value === "foliage") {
      const index = Number(prototype.value), read = familyPrototype(draft, ctx.guid, index);
      const type = [...await foliageTypes()].find(([, data]) => Math.floor(data.prototype) === index);
      const drawn = type && read ? foliageTypeDraw(type[0], type[1], read) : null;
      return [...column("forge.plant", single(index, "single")), ...column(drawn ? "Foliage" : "No Foliage Type", drawn ? { ...drawn, id: "foliage" } : null, 4)];
    }
    return draft.prototypes.flatMap((_, index) => column(`Prototype ${index}`, single(index, `prototype${index}`)));
  };

  const draw = async (): Promise<void> => {
    if (!family) return;
    const shown = await columns(family);
    if (disposed) return;
    if (shown.length === 0) { stats.value = "The family has no prototype to draw."; return; }
    if (await stage.show(shown)) stats.value = `${family.prototypes.length} prototypes · scale ${stage.scale} m`;
  };
  view.onchange = () => { prototype.disabled = view.value === "prototypes"; void draw(); };
  prototype.onchange = () => void draw();
  prototype.disabled = true;

  return {
    async update(value) {
      family = value as unknown as PlantFamilyFieldsRead;
      environment.plants.setResponse(ctx.guid, family.response);
      // What the batches are built from; the response only moves uniforms.
      const next = JSON.stringify([family.prototypes, family.materials, family.sway]);
      if (next === structure) return;
      structure = next;
      const at = Math.max(0, prototype.selectedIndex);
      prototype.replaceChildren(...family.prototypes.map((_, index) => option(String(index), String(index))));
      prototype.selectedIndex = Math.min(at, family.prototypes.length - 1);
      await draw();
    },
    focus: () => stage.focus(), setTool() {}, info: () => ({ slots: [], meshes: [] }),
    dispose() { disposed = true; stage.dispose(); resources.releaseAll(); panel.remove(); },
  };
}
