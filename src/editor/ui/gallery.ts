// `?editor-kit` (development only): every engine component's Details form,
// generated from its schema by the UI kit, plus a sample component with every
// field kind. It is where the kit is checked (tests/editor/kit.spec.ts) and
// where a new schema's generated form can be looked at before Details exists
// (plan phase 4 step 1). Edits change only this page: each form shows its
// current value as JSON under it and clamp warnings in the status line.

import {
  actorRef,
  array,
  assetRef,
  bool,
  color,
  createComponent,
  defineComponent,
  enumOf,
  formOf,
  num,
  object,
  text,
  transform,
  vec3,
  type ComponentDef,
  type FeatureDef,
} from "../../core/index.ts";
import { createFormView, createSection } from "./formView.ts";
import { installKitStyle } from "./kitStyle.ts";

/** Every field kind the form view draws, with the parameter rules' edge cases. */
export const KIT_SAMPLE = defineComponent(
  "editorkit.sample",
  1,
  {
    density: num({ min: 0, max: 1, default: 0.02, step: 0.001, hint: "Sınırlı sayı: kaydırıcı + kutu, aralık adın altında." }),
    distance: num({ min: 0, max: 10000, default: 5, slider: [0, 50], label: "Distance (m)", hint: "Kaydırıcı dar aralıkta, yazarak 10000'e kadar." }),
    open: num({ default: 5, hint: "Sınırsız sayı: yalnız kutu." }),
    floor: num({ min: 0, default: 1, hint: "Yalnız alt sınır." }),
    enabled: bool({ default: true, hint: "Açık / kapalı." }),
    mode: enumOf(["exp", "linearRamp"], { default: "exp", labels: { exp: "Exponential" }, hint: "Seçenek." }),
    tint: color({ default: "#b8c4d6", hint: "Renk." }),
    overlay: color({ default: null, hint: "İsteğe bağlı renk: boş olabilir." }),
    note: text({ default: "", hint: "Serbest metin." }),
    code: text({ default: "AB-1", pattern: "^[A-Z]{2}-[0-9]+$", hint: "Desenli metin: AB-1 gibi." }),
    size: vec3({ default: [1, 2, 3], min: 0, step: 0.1, hint: "Vektör, alt sınır 0." }),
    offset: transform({ default: { p: [0, 1, 0] } }),
    mesh: assetRef({ assetType: "forge.model", hint: "Asset başvurusu." }),
    target: actorRef({ hint: "Aktör başvurusu." }),
    waypoints: array(vec3({ default: [0, 0, 0] }), { hint: "Dizi." }),
    wheel: object({ radius: num({ min: 0.05, max: 2, default: 0.35 }), steering: bool({ default: false }) }, { label: "Front Wheel", hint: "İç içe nesne." }),
  },
  { hint: "Kit örneği: her alan türü." },
);

function fieldsOf(def: ComponentDef): Record<string, unknown> {
  const { type: _type, parent: _parent, local: _local, ...fields } = createComponent(def) as Record<string, unknown>;
  return fields;
}

export function showKitGallery(document: Document, features: readonly FeatureDef[]): void {
  installKitStyle(document);
  document.title = "Editor UI Kit";
  document.body.replaceChildren();
  document.body.style.margin = "0";
  document.documentElement.style.background = "var(--forge-bg-0)";
  const page = document.createElement("main");
  page.className = "forge-kit";
  page.style.cssText = "max-width: 420px; margin: 0 auto; padding: 16px; display: grid; gap: 12px;";
  const heading = document.createElement("h1");
  heading.textContent = "Editor UI Kit";
  heading.style.cssText = "font-size: 16px; margin: 0;";
  const status = document.createElement("output");
  status.dataset.testid = "kit-status";
  status.style.cssText = "min-height: 18px; color: var(--forge-warning-text); font-size: 12px;";
  page.append(heading, status);

  const components = [KIT_SAMPLE, ...features.flatMap((feature) => feature.components)];
  for (const def of components) {
    const { section, body } = createSection(document, `${def.label} (${def.name})`, {
      collapsed: def !== KIT_SAMPLE,
      testId: `kit-form-${def.name}`,
    });
    if (def.hint) section.title = def.hint;
    const json = document.createElement("pre");
    json.dataset.testid = `kit-value-${def.name}`;
    json.style.cssText = "margin: 0; padding: 6px; overflow: auto; color: var(--forge-text-dim); font-size: 11px; background: var(--forge-bg-1);";
    const form = formOf(def);
    const view = createFormView({
      document,
      fields: form.fields,
      value: fieldsOf(def),
      testIdPrefix: `${def.name}`,
      onChange: (change) => {
        json.textContent = JSON.stringify(change.next);
        json.dataset.phase = change.phase;
      },
      warn: (message) => {
        status.textContent = message;
      },
      pickAsset: async () => "00000000000000000000000000000001",
      pickActor: async () => "act_00000000000000000000000000000002",
    });
    json.textContent = JSON.stringify(view.value());
    body.append(view.element, json);
    page.append(section);
  }
  document.body.append(page);
}
