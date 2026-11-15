// The actor-class adapter's tree and defaults share the Details form kit.
// Component ids are stable addresses for instance overrides, not display names.
import { componentTypeTag, createComponent, enumOf, formFields, formOf, normalizeActorClass, parseComponentTypeTag, transform, type ComponentMap, type ComponentRecord, type FormField } from "../../core/index.ts";
import { newComponentId } from "../../engine/edit/actorFields.ts";
import { openPicker } from "../details/pickerPopover.ts";
import type { AssetEditorExtension, AssetEditorExtensionContext } from "../host/assetEditorTypes.ts";
import { createFormView, type FormView } from "../ui/formView.ts";
import { setAtPath } from "../../engine/edit/formPath.ts";

export function createClassTools(ctx: AssetEditorExtensionContext): AssetEditorExtension {
  const doc = ctx.document, element = doc.createElement("section"), tree = doc.createElement("div"), inspector = doc.createElement("div"), bar = doc.createElement("div");
  element.className = "asset-class-tools"; tree.dataset.testid = "asset-component-tree";
  let selected: string | null = null, signature = "", view: FormView | null = null;
  const components = () => ctx.value().components as ComponentMap;
  const commit = (label: string, next: ComponentMap) => {
    const result = normalizeActorClass({ ...ctx.value(), components: next }, { strict: true, registry: ctx.registry });
    if (!result.ok) { ctx.status(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")); return; }
    ctx.edit(label, ["components"], next);
  };
  const button = (label: string, id: string, run: () => void) => {
    const node = doc.createElement("button"); node.type = "button"; node.className = "detail-inline-button"; node.textContent = label; node.dataset.testid = id; node.disabled = ctx.readOnly;
    node.addEventListener("click", run); return node;
  };
  bar.append(button("Add Component", "asset-component-add", () => {
    void openPicker({ document: doc, host: element, title: "Add Component", testId: "asset-component-picker", items: ctx.registry.components().map((def) => ({ id: def.name, label: def.label,
      disabled: def.singleton && Object.values(components()).some((comp) => parseComponentTypeTag(comp.type)?.name === def.name) ? "This class already has this singleton component." : null,
    })) }).then((name) => {
      if (!name) return;
      const def = ctx.registry.getComponent(name)!;
      const id = newComponentId(def, components());
      const component = { ...createComponent(def), type: componentTypeTag(def) } as ComponentRecord;
      if (def.spatial) { component.parent = null; component.local = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }; }
      selected = id;
      commit("Add Component", { ...components(), [id]: component });
    });
  }), button("Remove Component", "asset-component-remove", () => {
    if (!selected || !components()[selected]) return;
    const removed = components()[selected]!, next = { ...components() };
    delete next[selected];
    for (const [id, comp] of Object.entries(next)) if (comp.parent === selected) next[id] = { ...comp, parent: removed.parent ?? null };
    selected = null;
    commit("Remove Component", next);
  }));
  element.append(bar, tree, inspector);
  const drawInspector = () => {
    inspector.replaceChildren(); view = null;
    const component = selected ? components()[selected] : undefined;
    const def = component && ctx.registry.getComponent(parseComponentTypeTag(component.type)?.name ?? "");
    if (!component || !def) return;
    const fields: FormField[] = [...formOf(def).fields];
    if (def.spatial) fields.unshift(...formFields({ parent: enumOf(["", ...Object.keys(components()).filter((id) => id !== selected && components()[id]!.parent !== undefined)], { default: "", labels: { "": "Actor Root" } }), local: transform({ label: "Local Transform" }) }));
    view = createFormView({ document: doc, fields, value: { ...component, parent: component.parent ?? "" }, disabled: ctx.readOnly, testIdPrefix: "asset-component",
      assetLabel: (id) => ctx.catalog.label(id), pickAsset: ctx.pickAsset,
      onChange: (change) => {
        const value = change.path[0] === "parent" && change.value === "" ? null : change.value;
        const next = setAtPath(components(), [selected!, ...change.path], value);
        const result = normalizeActorClass({ ...ctx.value(), components: next }, { strict: true, registry: ctx.registry });
        if (!result.ok) {
          ctx.status(result.issues.map((issue) => issue.message).join("; "));
          const current = components()[selected!] ?? component;
          view?.update({ ...current, parent: current.parent ?? "" }); return;
        }
        ctx.edit(`Edit ${selected}`, ["components", selected!, ...change.path], value, change.phase);
      },
    });
    inspector.append(view.element);
  };
  const update = () => {
    const map = components();
    if (selected && !map[selected]) selected = null;
    const nextSignature = JSON.stringify(Object.entries(map).map(([id, comp]) => [id, comp.type, comp.parent]));
    if (nextSignature !== signature) {
      signature = nextSignature; tree.replaceChildren();
      const depth = (id: string) => { let n = 0, parent = map[id]?.parent; const visited = new Set([id]); while (typeof parent === "string" && !visited.has(parent)) { visited.add(parent); n++; parent = map[parent]?.parent; } return n; };
      for (const [id, component] of Object.entries(map)) {
        const row = doc.createElement("button"); row.type = "button"; row.className = "asset-component-node"; row.dataset.componentId = id;
        row.textContent = `${id} · ${ctx.registry.getComponent(parseComponentTypeTag(component.type)?.name ?? "")?.label ?? component.type}`;
        row.style.paddingLeft = `${8 + depth(id) * 14}px`;
        row.addEventListener("click", () => { selected = id; drawInspector(); }); tree.append(row);
      }
      drawInspector();
    } else if (selected && map[selected]) view?.update({ ...map[selected], parent: map[selected]!.parent ?? "" });
  };
  update(); return { element, update };
}
