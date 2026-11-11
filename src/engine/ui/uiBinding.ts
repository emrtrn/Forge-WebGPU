// Ported from Forge WebGL engine/ui/uiBinding.ts (collect and resolve; applying to the DOM is src/runtime/ui/uiDom.ts) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * UI data binding (UMG MVVM glue).
 *
 * Connects a rendered widget's elements to a {@link UiViewModelStore}: collects
 * the `{ "bind": "path" }` props in a widget tree, resolves each to its current
 * field value, and applies it to the DOM. Only nodes that carry a binding are
 * wired, and each re-applies only when one of its bound paths changes — the
 * event-driven update the plan calls for (no per-frame re-read of every widget).
 *
 * v1 bindable props: `text` (Text/Button), `value` + `max` (ProgressBar), `src`
 * (Image). Collection is pure + testable; {@link applyBoundNode} /
 * {@link bindUiWidget} touch the DOM and run only at runtime.
 */
import { readUiBindingPath, readUiTextKey, type UiNode, type UiTextKey, type UiWidgetDef } from "./uiWidget.ts";
import type { UiFieldValue, UiViewModelStore } from "./uiViewModel.ts";

/** Props a binding can drive, per widget kind. */
export const BINDABLE_UI_PROPS = ["text", "value", "max", "src"] as const;
export type BindableUiProp = (typeof BINDABLE_UI_PROPS)[number];

export interface UiNodeBinding {
  node: UiNode;
  binds: { prop: BindableUiProp; path: string }[];
}

/** Walks the tree and returns one entry per node that carries ≥1 binding. */
export function collectUiBindings(def: UiWidgetDef): UiNodeBinding[] {
  const out: UiNodeBinding[] = [];
  const walk = (node: UiNode): void => {
    const binds: { prop: BindableUiProp; path: string }[] = [];
    for (const prop of BINDABLE_UI_PROPS) {
      const path = readUiBindingPath(node, prop);
      if (path !== undefined) binds.push({ prop, path });
    }
    if (binds.length > 0) out.push({ node, binds });
    node.children.forEach(walk);
  };
  walk(def.root);
  return out;
}

/**
 * Resolves a prop to its live value: the store field when the prop is bound,
 * else the static literal (so a ProgressBar with a bound `value` and static
 * `max` still works). Undefined when neither yields a usable scalar.
 */
export function resolveUiBoundValue(
  node: UiNode,
  prop: BindableUiProp,
  store: UiViewModelStore,
): UiFieldValue | undefined {
  const path = readUiBindingPath(node, prop);
  if (path !== undefined) return store.getField(path);
  const literal = node.props[prop];
  return typeof literal === "string" || typeof literal === "number" || typeof literal === "boolean"
    ? literal
    : undefined;
}

// ---------------------------------------------------------------------------
// Localization glue (sibling of binding): re-resolve `{ key }` text on a locale
// switch. The initial render is already localized by the build pass
// (`resolveLoc`); this keeps mounted widgets in sync when the locale changes.
// ---------------------------------------------------------------------------

export interface UiNodeLoc {
  node: UiNode;
  textKey: UiTextKey;
}

/** Walks the tree and returns one entry per Text/Button node with a localized `text`. */
export function collectUiLocBindings(def: UiWidgetDef): UiNodeLoc[] {
  const out: UiNodeLoc[] = [];
  const walk = (node: UiNode): void => {
    if (node.widget === "Text" || node.widget === "Button") {
      const textKey = readUiTextKey(node, "text");
      if (textKey) out.push({ node, textKey });
    }
    node.children.forEach(walk);
  };
  walk(def.root);
  return out;
}
