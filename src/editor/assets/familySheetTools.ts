// The approval page's list (vegetation plan §7.3, PG5; `forge.familySheet`):
// one card per model recipe with its state, the user's answer and a note. An
// answer keeps the digest of the output it was given for, so a later
// generation reads "Changed". Selecting a card shows the recipe's published
// output in the preview; edits are the asset's (undo, save).

import { readSheetEntries, sheetEntryState, unlistedRecipes, type SheetEntry, type SheetState } from "../../engine/plant/familySheet.ts";
import type { RecipeLinks } from "../../engine/procgen/recipeLinks.ts";
import { MODEL_RECIPE_TYPES } from "../../engine/procgen/recipeOutputs.ts";
import { openPicker } from "../details/pickerPopover.ts";
import type { AssetEditorExtension, AssetEditorExtensionContext } from "../host/assetEditorTypes.ts";
import { contentTypeLabel } from "../content/contentModel.ts";
import { fetchRecipeLinks } from "./recipeClient.ts";

const STATE_LABELS: Readonly<Record<SheetState, string>> = { pending: "Pending", approved: "Approved", changed: "Changed since approval", rejected: "Rejected" };

export function createFamilySheetTools(ctx: AssetEditorExtensionContext, links: (recipe: string) => Promise<RecipeLinks> = fetchRecipeLinks): AssetEditorExtension {
  const doc = ctx.document, element = doc.createElement("section"), bar = doc.createElement("div"), list = doc.createElement("div");
  element.className = "family-sheet";
  list.dataset.testid = "family-sheet-list";
  let selected: string | null = null, drawn = "", disposed = false;
  /** Digests by recipe; undefined while unread, null when nothing is built or it cannot be read. */
  const digests = new Map<string, string | null>();
  const entries = (): SheetEntry[] => readSheetEntries(ctx.value());
  const recipes = () => MODEL_RECIPE_TYPES.flatMap((type) => ctx.catalog.ofType(type));
  const commit = (label: string, next: readonly SheetEntry[]): void => ctx.edit(label, ["entries"], next);
  const replace = (label: string, index: number, change: Partial<SheetEntry>): void =>
    commit(label, entries().map((entry, at) => (at === index ? { ...entry, ...change } : entry)));
  const button = (label: string, testId: string, run: () => void, disabled = ctx.readOnly): HTMLButtonElement => {
    const node = doc.createElement("button");
    node.type = "button"; node.className = "detail-inline-button"; node.textContent = label; node.dataset.testid = testId; node.disabled = disabled;
    node.addEventListener("click", (event) => { event.stopPropagation(); run(); });
    return node;
  };
  const read = (recipe: string): void => {
    if (digests.has(recipe)) return;
    void links(recipe).then((found) => found.digest, () => null).then((digest) => {
      if (disposed) return;
      digests.set(recipe, digest);
      update(true);
    });
  };
  const show = (recipe: string): void => {
    selected = recipe;
    ctx.preview()?.select?.(recipe);
    update(true);
  };
  bar.append(
    button("Add Recipe…", "family-sheet-add", () => {
      const missing = new Set(unlistedRecipes(entries(), recipes().map((recipe) => recipe.guid)));
      const items = recipes().filter((recipe) => missing.has(recipe.guid)).map((recipe) => ({ id: recipe.guid, label: recipe.name, note: recipe.file }));
      void openPicker({ document: doc, host: element, title: "Add Recipe", testId: "family-sheet-picker", items }).then((id) => {
        if (id !== null && !disposed) commit("Add recipe", [...entries(), { recipe: id, status: "pending", digest: "", note: "" }]);
      });
    }),
    button("Add Generated", "family-sheet-add-all", () => {
      // Every recipe whose output exists: the families a world can be built with.
      const missing = unlistedRecipes(entries(), recipes().map((recipe) => recipe.guid));
      void Promise.all(missing.map((recipe) => links(recipe).then((found) => (found.built ? recipe : null), () => null))).then((found) => {
        const added = found.flatMap((recipe) => (recipe === null ? [] : [{ recipe, status: "pending" as const, digest: "", note: "" }]));
        if (!disposed && added.length > 0) commit("Add generated recipes", [...entries(), ...added]);
        else ctx.status("Every generated recipe is already listed.");
      });
    }),
  );
  element.append(bar, list);

  const card = (entry: SheetEntry, index: number): HTMLElement => {
    const node = doc.createElement("article"), head = doc.createElement("button"), state = doc.createElement("span"), actions = doc.createElement("div"), note = doc.createElement("input");
    const recipe = entry.recipe ?? "";
    const known = recipes().find((item) => item.guid === recipe);
    const digest = digests.get(recipe);
    const now: SheetState = digest === undefined ? entry.status : sheetEntryState(entry, digest);
    node.className = "family-sheet-card";
    node.dataset.testid = "family-sheet-card";
    node.dataset.recipe = recipe;
    node.dataset.state = now;
    node.classList.toggle("is-selected", recipe === selected);
    head.type = "button"; head.className = "asset-component-node";
    head.textContent = known ? `${known.name} · ${contentTypeLabel(known.type)}` : "Missing recipe";
    head.title = known?.file ?? recipe;
    head.addEventListener("click", () => show(recipe));
    state.className = "family-sheet-state";
    state.textContent = `${STATE_LABELS[now]}${digest === null ? " · not generated" : ""}`;
    const answer = (status: SheetEntry["status"]) => () => { replace(`${status === "pending" ? "Reset" : status === "approved" ? "Approve" : "Reject"} ${known?.name ?? "recipe"}`, index, { status, digest: status === "pending" ? "" : digest ?? "" }); };
    actions.append(
      // Only an output that exists can be approved.
      button("Approve", "family-sheet-approve", answer("approved"), ctx.readOnly || !digest || now === "approved"),
      button("Reject", "family-sheet-reject", answer("rejected"), ctx.readOnly || now === "rejected"),
      button("Reset", "family-sheet-reset", answer("pending"), ctx.readOnly || entry.status === "pending"),
      button("Remove", "family-sheet-remove", () => { commit("Remove recipe", entries().filter((_, at) => at !== index)); }),
    );
    note.type = "text"; note.value = entry.note; note.placeholder = "Note"; note.disabled = ctx.readOnly; note.dataset.testid = "family-sheet-note";
    note.addEventListener("change", () => replace("Edit note", index, { note: note.value }));
    node.append(head, state, actions, note);
    return node;
  };

  function update(force = false): void {
    const now = entries(), key = JSON.stringify(now);
    if (!force && key === drawn) return;
    drawn = key;
    for (const entry of now) if (entry.recipe) read(entry.recipe);
    list.replaceChildren(...now.map(card));
    if (now.length === 0) list.textContent = "No recipe is listed. Add Generated lists every recipe with output.";
    if (selected === null && now[0]?.recipe) show(now[0].recipe);
  }
  update();
  return { element, update: () => update(), dispose: () => { disposed = true; } };
}
