// Ported from Forge WebGL engine/ui/{uiRenderer,uiBinding,uiTheme}.ts @ forge-webgl-final
// (04b5fb23): the part of the UI library that touches the DOM. The render tree,
// bindings and theme tokens it applies are built in src/engine/ui (DOM-free);
// docs/PORT_LOG.md §2.
import type { UiAction, UiNode, UiTextKey, UiWidgetDef } from "../../engine/ui/uiWidget.ts";
import { buildUiRenderTree, type UiBuildOptions, type UiRenderNode } from "../../engine/ui/uiRenderer.ts";
import { collectUiBindings, collectUiLocBindings, resolveUiBoundValue } from "../../engine/ui/uiBinding.ts";
import { themeToCssVariables, type UiThemeDef } from "../../engine/ui/uiTheme.ts";
import type { UiFieldValue, UiViewModelStore } from "../../engine/ui/uiViewModel.ts";
import type { LocaleRegistry } from "../../engine/ui/uiLocale.ts";

// --- Mount (from uiRenderer.ts) ------------------------------------------------
export interface UiMountContext {
  onAction?: ((action: UiAction, nodeId: string) => void) | undefined;
  /** Filled with authored-node id → element (synthetic nodes excluded). */
  byId: Map<string, HTMLElement>;
}

/** Thin DOM layer: materializes one {@link UiRenderNode} (and its subtree). */
export function mountUiRenderNode(node: UiRenderNode, ctx: UiMountContext): HTMLElement {
  const element = document.createElement(node.tag);
  element.className = node.className;
  for (const [css, value] of Object.entries(node.style)) {
    element.style.setProperty(css, value);
  }
  if (node.attrs) {
    for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
  }
  if (!node.synthetic && node.nodeId) element.dataset.uiId = node.nodeId;
  if (node.text !== undefined && node.children.length === 0) {
    element.textContent = node.text;
  }
  for (const child of node.children) {
    element.appendChild(mountUiRenderNode(child, ctx));
  }
  if (node.action && ctx.onAction) {
    const action = node.action;
    element.addEventListener("click", () => ctx.onAction?.(action, node.nodeId));
  }
  if (!node.synthetic && node.nodeId) ctx.byId.set(node.nodeId, element);
  return element;
}

export interface RenderedUiWidget {
  /** Root element (mount it under `#ui-overlay`). */
  element: HTMLElement;
  /** Authored-node id → element, for binding updates / inspection. */
  byId: Map<string, HTMLElement>;
  /** The pure render tree the element was built from. */
  tree: UiRenderNode;
  /** Removes the element from the DOM (listeners GC with it). */
  dispose(): void;
}

export interface RenderUiWidgetOptions {
  onAction?: (action: UiAction, nodeId: string) => void;
  /** Resolves Include widget `src` references to their definitions. */
  resolveWidget?: (src: string) => UiWidgetDef | null;
  /** Resolves localized `{ key, params }` text for the initial render. */
  resolveLoc?: (key: string, params?: Record<string, string>) => string;
}

/** Builds + mounts a widget asset into a detached element ready to append to the overlay. */
export function renderUiWidget(
  def: UiWidgetDef,
  options: RenderUiWidgetOptions = {},
): RenderedUiWidget {
  const buildOpts: UiBuildOptions = {};
  if (options.resolveWidget) buildOpts.resolveWidget = options.resolveWidget;
  if (options.resolveLoc) buildOpts.resolveLoc = options.resolveLoc;
  const tree = buildUiRenderTree(def, buildOpts);
  const byId = new Map<string, HTMLElement>();
  const element = mountUiRenderNode(tree, { onAction: options.onAction, byId });
  return {
    element,
    byId,
    tree,
    dispose: () => element.remove(),
  };
}

// --- Bindings (from uiBinding.ts) ----------------------------------------------
function numberOr(value: UiFieldValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Applies a bound node's current values to its element (DOM). */
export function applyBoundNode(
  element: HTMLElement,
  node: UiNode,
  store: UiViewModelStore,
): void {
  switch (node.widget) {
    case "Text":
    case "Button": {
      const value = resolveUiBoundValue(node, "text", store);
      element.textContent = value === undefined ? "" : String(value);
      break;
    }
    case "Image": {
      const src = resolveUiBoundValue(node, "src", store);
      element.style.backgroundImage =
        typeof src === "string" && src ? `url(${JSON.stringify(src)})` : "";
      break;
    }
    case "ProgressBar": {
      const value = numberOr(resolveUiBoundValue(node, "value", store), 0);
      const max = numberOr(resolveUiBoundValue(node, "max", store), 1);
      const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
      const fill = element.querySelector<HTMLElement>(".forge-ui-progress__fill");
      if (fill) fill.style.width = `${(pct * 100).toFixed(2)}%`;
      // Keep the ARIA value in sync so a screen reader announces the live progress.
      element.setAttribute("aria-valuenow", String(value));
      element.setAttribute("aria-valuemax", String(max));
      break;
    }
    default:
      break;
  }
}

/**
 * Wires a rendered widget's bound nodes to the store: applies initial values,
 * then subscribes each node to its paths. Returns an unsubscribe handle the
 * caller releases on unmount.
 */
export function bindUiWidget(
  rendered: RenderedUiWidget,
  def: UiWidgetDef,
  store: UiViewModelStore,
): () => void {
  const unsubscribes: (() => void)[] = [];
  for (const { node, binds } of collectUiBindings(def)) {
    const element = rendered.byId.get(node.id);
    if (!element) continue;
    const apply = (): void => applyBoundNode(element, node, store);
    apply();
    for (const { path } of binds) unsubscribes.push(store.subscribe(path, apply));
  }
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

/** Resolves a localized node's text against the active locale and applies it (DOM). */
export function applyLocNode(
  element: HTMLElement,
  textKey: UiTextKey,
  registry: LocaleRegistry,
): void {
  element.textContent = registry.resolve(textKey.key, textKey.params);
}

/**
 * Wires a rendered widget's localized text nodes to the registry: re-resolves
 * them whenever the active locale changes. Returns an unsubscribe handle the
 * caller releases on unmount. No-op when the widget has no localized text.
 */
export function bindUiLocale(
  rendered: RenderedUiWidget,
  def: UiWidgetDef,
  registry: LocaleRegistry,
): () => void {
  const locNodes = collectUiLocBindings(def);
  if (locNodes.length === 0) return () => {};
  const apply = (): void => {
    for (const { node, textKey } of locNodes) {
      const element = rendered.byId.get(node.id);
      if (element) applyLocNode(element, textKey, registry);
    }
  };
  apply();
  return registry.subscribe(apply);
}

// --- Theme (from uiTheme.ts) ---------------------------------------------------
/** Applies a theme's CSS variables onto an element (its subtree inherits them). */
export function applyUiTheme(element: HTMLElement, theme: UiThemeDef): void {
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    element.style.setProperty(name, value);
  }
}
