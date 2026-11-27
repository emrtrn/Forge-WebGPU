import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { renderUiWidget } from "../../runtime/ui/uiDom.ts";
import { UiWidget, type WidgetData } from "./schema.ts";
import { hudPlacement, widgetFromData } from "./widgetData.ts";

export default defineFeatureEditor({
  feature: "forge.ui",
  newAssets: [{ type: UiWidget.name, label: "UI Widget", values: {} }],
  assetEditors: [{
    assetType: UiWidget.name,
    tools(context) {
      const viewport = context.document.createElement("div");
      viewport.setAttribute("aria-label", "HUD layout preview");
      Object.assign(viewport.style, {
        position: "relative", width: "100%", minHeight: "140px", marginBottom: "12px", overflow: "hidden",
        background: "#262930", color: "#fff", border: "1px solid #535862", touchAction: "none",
      });
      const board = context.document.createElement("div");
      Object.assign(board.style, { position: "absolute", inset: "0 auto auto 0", transformOrigin: "top left" });
      viewport.append(board);
      let view: ReturnType<typeof renderUiWidget> | null = null;
      let scale = 1;
      let active: {
        id: number; index: number; x: number; y: number; element: HTMLElement;
        node: WidgetData["nodes"][number]; offset: [number, number];
      } | null = null;
      const data = () => context.value() as unknown as WidgetData;
      const resize = () => {
        const [width, height] = data().preview;
        scale = Math.min(viewport.clientWidth / width, viewport.clientHeight / height) || 1;
        Object.assign(board.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(viewport);
      const update = () => {
        view?.dispose();
        const draft = data();
        view = renderUiWidget(widgetFromData(draft));
        for (const node of draft.nodes) {
          const element = node.parent === "" ? view.byId.get(node.id) : null;
          if (!element) continue;
          Object.assign(element.style, hudPlacement(node));
          if (!context.readOnly) element.style.cursor = "move";
        }
        board.append(view.element);
        viewport.style.aspectRatio = `${draft.preview[0]} / ${draft.preview[1]}`;
        resize();
      };
      viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || context.readOnly) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-ui-id]");
        const draft = data();
        const index = draft.nodes.findIndex((node) => node.id === target?.dataset.uiId && node.parent === "");
        if (index < 0 || !target) return;
        const node = draft.nodes[index]!;
        active = { id: event.pointerId, index, x: event.clientX, y: event.clientY, element: target, node, offset: [...node.offset] };
        viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      viewport.addEventListener("pointermove", (event) => {
        if (!active || active.id !== event.pointerId) return;
        active.offset = [
          Math.round(active.node.offset[0] + (event.clientX - active.x) / scale * (active.node.anchor.endsWith("Right") ? -1 : 1)),
          Math.round(active.node.offset[1] + (event.clientY - active.y) / scale * (active.node.anchor.startsWith("bottom") ? -1 : 1)),
        ];
        Object.assign(active.element.style, hudPlacement({ anchor: active.node.anchor, offset: active.offset }));
      });
      viewport.addEventListener("pointerup", (event) => {
        if (!active || active.id !== event.pointerId) return;
        const { index, offset } = active;
        active = null;
        context.edit("Move HUD widget", ["nodes", index, "offset"], offset, "commit");
      });
      viewport.addEventListener("pointercancel", () => { active = null; update(); });
      update();
      return { element: viewport, update, dispose() { resizeObserver.disconnect(); view?.dispose(); } };
    },
  }],
});
