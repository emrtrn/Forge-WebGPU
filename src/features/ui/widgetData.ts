import { defaultUiWidgetDef, isUiContainerKind, type UiNode, type UiWidgetDef } from "../../engine/ui/uiWidget.ts";
import type { WidgetData } from "./schema.ts";

type WidgetNode = WidgetData["nodes"][number];

export function widgetFromData(data: WidgetData): UiWidgetDef {
  const widget = defaultUiWidgetDef(data.name);
  widget.preview = { width: data.preview[0], height: data.preview[1] };
  const build = (parent: string, visited: ReadonlySet<string>): UiNode[] => {
    const nodes: UiNode[] = [];
    const seen = new Set(visited);
    for (const node of data.nodes) {
      if (!node.id || node.parent !== parent || seen.has(node.id)) continue;
      seen.add(node.id);
      const text: UiNode["props"][string] = node.bind && node.kind !== "ProgressBar" ? { bind: node.bind } :
        node.localeKey ? { key: node.localeKey } : node.text;
      const props: UiNode["props"] = {
        text, fontSize: node.fontSize, gap: node.gap,
        ...(node.kind === "Stack" ? { direction: node.direction } : {}),
        ...(node.padding ? { padding: node.padding } : {}),
        ...(node.size[0] ? { width: node.size[0] } : {}),
        ...(node.size[1] ? { height: node.size[1] } : {}),
        ...(node.backgroundToken || node.background ? { background: node.backgroundToken ? `$${node.backgroundToken}` : node.background } : {}),
        ...(node.foregroundToken || node.foreground ? { color: node.foregroundToken ? `$${node.foregroundToken}` : node.foreground } : {}),
        ...(node.message && node.kind === "Button" ? { onClick: { type: "message", message: node.message } } : {}),
      };
      if (node.kind === "ProgressBar") {
        props.value = node.bind ? { bind: node.bind } : 0;
        props.max = node.max;
      }
      nodes.push({
        id: node.id, widget: node.kind, props,
        children: isUiContainerKind(node.kind) ? build(node.id, seen) : [],
      });
    }
    return nodes;
  };
  widget.root.children = build("", new Set([widget.root.id]));
  return widget;
}

export function hudPlacement(node: Pick<WidgetNode, "anchor" | "offset">): Record<string, string> {
  const [x, y] = node.offset;
  if (node.anchor === "center") return {
    position: "absolute", left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: "translate(-50%, -50%)",
  };
  const horizontal = node.anchor.endsWith("Right") ? "right" : "left";
  const vertical = node.anchor.startsWith("bottom") ? "bottom" : "top";
  return { position: "absolute", [horizontal]: `${x}px`, [vertical]: `${y}px` };
}
