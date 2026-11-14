import { assetRef, color, formFields, num } from "../../core/index.ts";
import type { AssetEditorExtension, AssetEditorExtensionContext } from "../host/assetEditorTypes.ts";
import { createFormView, type FormView } from "../ui/formView.ts";

export function createModelTools(ctx: AssetEditorExtensionContext): AssetEditorExtension {
  const doc = ctx.document, element = doc.createElement("section"), stats = doc.createElement("div"), slots = doc.createElement("div");
  const tools = doc.createElement("div"); element.className = "asset-model-tools";
  const button = (label: string, id: string, run: () => void) => {
    const node = doc.createElement("button"); node.type = "button"; node.className = "detail-inline-button";
    node.textContent = label; node.dataset.testid = id; node.disabled = ctx.readOnly; node.addEventListener("click", run); return node;
  };
  for (const tool of ["select", "move", "rotate", "scale"] as const) tools.append(button(tool, `asset-uvw-${tool}`, () => ctx.preview()?.setTool(tool)));
  let fill: Record<string, unknown> = { color: "#ffffff", alpha: 1 };
  const form = createFormView({ document: doc, fields: formFields({ color: color({ default: "#ffffff", label: "Fill Color" }), alpha: num({ default: 1, min: 0, max: 1, label: "Fill Alpha" }) }),
    value: fill, disabled: ctx.readOnly, testIdPrefix: "asset-vertex", onChange: (change) => { fill = change.next; },
  });
  element.append(stats, slots, tools, form.element,
    button("Fill Asset Colors", "asset-vertex-fill", () => {
      const info = ctx.preview()?.info();
      if (!info?.meshes.length) { ctx.status("Model geometry is not ready."); return; }
      if (info.meshes.some((mesh) => mesh.vertexCount > 2_000_000)) { ctx.status("The model exceeds the schema's vertex-color limit."); return; }
      const rgb = String(fill.color).slice(1).match(/../g)!.map((value) => parseInt(value, 16) / 255);
      ctx.edit("Fill vertex colors", ["import", "vertexColors"], info.meshes.map((mesh) => ({ ...mesh, colors: Array.from({ length: mesh.vertexCount * 4 }, (_, i) => i % 4 === 3 ? Number(fill.alpha) : rgb[i % 4]!) })));
    }),
    button("Remove Asset Colors", "asset-vertex-remove", () => ctx.edit("Remove vertex colors", ["import", "vertexColors"], [])),
  );
  let signature = "", views: FormView[] = [];
  return {
    element,
    update() {
      const info = ctx.preview()?.info();
      stats.textContent = info ? `${info.meshes.length} primitives · ${info.meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0)} vertices · ${info.slots.length} slots` : "Loading model…";
      const value = ctx.value().import as Record<string, unknown>;
      const materials = Array.isArray(value?.materials) ? value.materials : [];
      const next = JSON.stringify(info?.slots ?? []);
      if (signature === next) { views.forEach((view, index) => view.update({ material: materials[index] ?? null })); return; }
      signature = next; views = []; slots.replaceChildren();
      info?.slots.forEach((label, index) => {
        const view = createFormView({ document: doc, fields: formFields({ material: assetRef({ assetType: "forge.material", label: `Element ${index}: ${label}` }) }), value: { material: materials[index] ?? null },
          disabled: ctx.readOnly, testIdPrefix: `asset-slot-${index}`, assetLabel: (id) => ctx.catalog.label(id), pickAsset: ctx.pickAsset,
          onChange: (change) => ctx.edit("Assign slot", ["import", "materials", index], change.value, change.phase),
        });
        views.push(view); slots.append(view.element);
      });
    },
  };
}
