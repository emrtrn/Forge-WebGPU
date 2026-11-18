// The Foliage tab's Landscape Rules (plan 5c F6): a terrain actor's
// `forge.landscapeFoliage` rules, the level's data. Forge WebGL's panel listed
// the active landscape's rules with hand-made rows; here:
// - The terrain: the selected actor when it is a terrain, else the level's
//   first (a list when there are several).
// - Add Rule (the type the Types list has selected, an existing rule's paint
//   layer), Duplicate, Up / Down, Remove: each one level edit, one undo step
//   (engine/foliage/landscapeRuleEdit.ts; the level's Undo / Save).
// - The selected rule's fields are the schema's rule form (slider + box,
//   Turkish hints); a drag is one undo step. The ring regrows with each edit.
// - A terrain without the component gets it with Add Landscape Foliage. A
//   terrain from an actor class is edited in Details (its overrides).

import { createComponent, formFields, parseComponentTypeTag, type ActorDoc, type ActorId, type ArrayFormField, type ObjectFormField, type PlainActor } from "../../core/index.ts";
import { pathKey, setAtPath, type FormPath } from "../../engine/edit/formPath.ts";
import { addRule, duplicateRule, moveRule, removeRule } from "../../engine/foliage/landscapeRuleEdit.ts";
import { LandscapeFoliage, type LandscapeFoliageData } from "../../features/foliage/schema.ts";
import type { AssetCatalog } from "../assets/assetCatalog.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { createFormView, type FormView } from "../ui/formView.ts";

type Rule = LandscapeFoliageData["rules"][number];

export interface FoliageRulesOptions {
  readonly document: Document;
  readonly editor: EditorSession;
  readonly catalog: AssetCatalog;
  /** The Foliage Type the Types list has selected (a new rule's type). */
  selectedType(): string | null;
  pickAsset(type: string | null): Promise<string | null>;
  status(message: string, tone?: "info" | "warning" | "error"): void;
}

export interface FoliageRules {
  readonly element: HTMLElement;
  dispose(): void;
}

const TERRAIN = "forge.terrain";
const ruleItem = (): ObjectFormField => {
  const rules = formFields(LandscapeFoliage.fields).find((field) => field.key === "rules") as ArrayFormField;
  return rules.item as ObjectFormField;
};

const componentKey = (doc: PlainActor, name: string): string | null =>
  Object.entries(doc.components).find(([, component]) => parseComponentTypeTag(component.type)?.name === name)?.[0] ?? null;
const isPlain = (doc: ActorDoc | undefined): doc is PlainActor => doc !== undefined && doc.class === null;

export function createFoliageRules(options: FoliageRulesOptions): FoliageRules {
  const doc = options.document;
  const { editor } = options;
  const item = ruleItem();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, testId: string, hint: string, run: () => void): HTMLButtonElement => {
    const node = el("button", "detail-inline-button", label);
    node.type = "button";
    node.dataset.testid = testId;
    node.title = hint;
    node.addEventListener("click", run);
    return node;
  };

  const element = el("div", "foliage-rules");
  element.dataset.testid = "foliage-rules";
  const head = el("div", "foliage-section-head");
  head.append(el("span", "", "Landscape Rules"));
  const terrainPick = el("select", "foliage-terrain");
  terrainPick.dataset.testid = "foliage-terrain";
  terrainPick.title = "Kuralları düzenlenen terrain.";
  head.append(terrainPick);
  const toolbar = el("div", "foliage-toolbar");
  const list = el("div", "foliage-list");
  list.setAttribute("role", "listbox");
  list.dataset.testid = "foliage-rule-list";
  const formHost = el("div", "foliage-rule-editor");
  element.append(head, toolbar, list, formHost);

  let terrainId: ActorId | null = null;
  let pinned = false;
  let ruleId: string | null = null;
  let form: FormView | null = null;
  let formRule: string | null = null;

  // Terrains from an actor class keep their rules in the class (Details edits its overrides).
  const terrains = (): PlainActor[] => editor.level.level.actors.filter((actor): actor is PlainActor => isPlain(actor) && componentKey(actor, TERRAIN) !== null);
  const current = (): PlainActor | null => { const actor = terrainId ? editor.level.actor(terrainId) : undefined; return isPlain(actor) ? actor : null; };
  const rulesOf = (actor: PlainActor | null): Rule[] => {
    const key = actor ? componentKey(actor, LandscapeFoliage.name) : null;
    return key ? ((actor!.components[key] as unknown as LandscapeFoliageData).rules as Rule[]) : [];
  };

  /** One level edit of the terrain's rules; `coalesce` merges a drag's inputs, `commit` seals the step. */
  const writeRules = (label: string, next: (rules: Rule[]) => Rule[], phase: "input" | "commit" = "commit", coalesce?: string): boolean => {
    const actor = current();
    if (!actor) return false;
    const key = componentKey(actor, LandscapeFoliage.name);
    if (!key) return false;
    const component = actor.components[key] as unknown as LandscapeFoliageData;
    const updated: PlainActor = { ...actor, components: { ...actor.components, [key]: { ...actor.components[key]!, rules: next(component.rules as Rule[]) } as never } };
    const result = editor.edit(label, (tx) => tx.setActor(updated), coalesce ? { coalesce } : undefined);
    if (phase === "commit") editor.level.history.seal();
    if (!result.ok) options.status(result.issues.map((issue) => issue.message).join("; "), "error");
    return result.ok;
  };

  const addComponent = (): void => {
    const actor = current();
    if (!actor) return;
    const stored = createComponent(LandscapeFoliage);
    const result = editor.edit("Add Landscape Foliage", (tx) => tx.setActor({ ...actor, components: { ...actor.components, landscapeFoliage: stored as never } }));
    editor.level.history.seal();
    if (!result.ok) options.status(result.issues.map((issue) => issue.message).join("; "), "error");
  };

  const addNewRule = async (): Promise<void> => {
    const actor = current();
    if (!actor) return;
    const type = options.selectedType() ?? await options.pickAsset("forge.foliageType");
    if (!type) { options.status("Önce bir foliage türü seç.", "warning"); return; }
    // The terrain's paint layers live in its data asset: a new rule takes an existing rule's layer, else none.
    const layer = rulesOf(actor).find((rule) => rule.layer)?.layer ?? "";
    let created: string | null = null;
    if (writeRules("Add Foliage Rule", (rules) => {
      const added = addRule(rules, item.default, { foliageType: type, layer });
      created = added.id;
      return added.rules;
    })) ruleId = created;
  };

  const drawTerrains = (): void => {
    const all = terrains();
    const selected = editor.selection.primary();
    if (!pinned || !all.some((actor) => actor.id === terrainId)) {
      terrainId = all.find((actor) => actor.id === selected)?.id ?? all[0]?.id ?? null;
    }
    terrainPick.replaceChildren(...all.map((actor) => {
      const option = el("option", "", actor.name || actor.id);
      option.value = actor.id;
      option.selected = actor.id === terrainId;
      return option;
    }));
    terrainPick.hidden = all.length < 2;
  };

  const draw = (): void => {
    drawTerrains();
    toolbar.replaceChildren();
    list.replaceChildren();
    const actor = current();
    if (!actor) {
      list.append(el("div", "foliage-empty", "Level'da sınıfsız terrain yok. Sınıftan gelen terrain'in kurallarını Details'te düzenle."));
      formHost.replaceChildren(); form = null; formRule = null;
      return;
    }
    if (!componentKey(actor, LandscapeFoliage.name)) {
      list.append(el("div", "foliage-empty", "Bu terrain'de Landscape Foliage yok."));
      toolbar.append(button("Add Landscape Foliage", "foliage-rule-component", "Terrain'e Landscape Foliage bileşenini ekler.", addComponent));
      formHost.replaceChildren(); form = null; formRule = null;
      return;
    }
    const rules = rulesOf(actor);
    if (!rules.some((rule) => rule.id === ruleId)) ruleId = rules[0]?.id ?? null;
    const index = rules.findIndex((rule) => rule.id === ruleId);
    toolbar.append(
      button("Add Rule", "foliage-rule-add", "Seçili foliage türüyle yeni bir kural ekler.", () => void addNewRule()),
      button("Duplicate", "foliage-rule-duplicate", "Seçili kuralın kopyasını hemen altına ekler.", () => {
        let created: string | null = null;
        if (ruleId && writeRules("Duplicate Foliage Rule", (all) => { const copy = duplicateRule(all, ruleId!); created = copy.id; return copy.rules; })) ruleId = created;
      }),
      button("Up", "foliage-rule-up", "Seçili kuralı bir sıra yukarı taşır.", () => { if (ruleId) writeRules("Move Foliage Rule", (all) => moveRule(all, ruleId!, -1)); }),
      button("Down", "foliage-rule-down", "Seçili kuralı bir sıra aşağı taşır.", () => { if (ruleId) writeRules("Move Foliage Rule", (all) => moveRule(all, ruleId!, 1)); }),
      button("Remove", "foliage-rule-remove", "Seçili kuralı siler.", () => { if (ruleId) writeRules("Remove Foliage Rule", (all) => removeRule(all, ruleId!)); }),
    );
    for (const button of toolbar.querySelectorAll<HTMLButtonElement>("[data-testid^=foliage-rule-]:not([data-testid=foliage-rule-add])")) button.disabled = index < 0;
    if (rules.length === 0) list.append(el("div", "foliage-empty", "Kural yok. Add Rule seçili türle bir kural ekler."));
    for (const rule of rules) {
      const row = el("button", "foliage-row");
      row.type = "button";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(rule.id === ruleId));
      row.dataset.testid = "foliage-rule-row";
      row.dataset.rule = rule.id;
      const type = rule.foliageType ? options.catalog.label(rule.foliageType) ?? rule.foliageType : "(no type)";
      row.append(el("span", "", `${type}`), el("small", "", `${rule.layer || "-"} · ${rule.density}`));
      row.addEventListener("click", () => { ruleId = rule.id; draw(); });
      list.append(row);
    }
    const selected = index >= 0 ? rules[index]! : null;
    if (!selected) { formHost.replaceChildren(); form = null; formRule = null; return; }
    if (form && formRule === selected.id) { form.update(selected as unknown as Record<string, unknown>); return; }
    formRule = selected.id;
    form = createFormView({
      document: doc, fields: item.fields, value: selected as unknown as Record<string, unknown>, testIdPrefix: "foliage-rule-field",
      assetLabel: (id) => options.catalog.label(id), pickAsset: (assetType) => options.pickAsset(assetType),
      warn: (message) => options.status(message, "warning"),
      onChange: (change) => {
        const id = selected.id;
        const path: FormPath = change.path;
        writeRules(`Edit ${pathKey(path)}`, (all) => all.map((rule) => (rule.id === id ? setAtPath(rule as unknown as Record<string, unknown>, path, change.value) as unknown as Rule : rule)),
          change.phase, `foliage-rule:${terrainId}:${id}:${pathKey(path)}`);
      },
    });
    formHost.replaceChildren(form.element);
  };

  terrainPick.addEventListener("change", () => { terrainId = terrainPick.value as ActorId; pinned = true; ruleId = null; draw(); });
  const unsubscribe = editor.onChange(() => draw());
  draw();
  return {
    element,
    dispose() {
      unsubscribe();
      element.remove();
    },
  };
}
