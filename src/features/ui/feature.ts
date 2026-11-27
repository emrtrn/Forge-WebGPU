import { defineFeature, defineSubsystem, normalizeJsonAsset } from "../../core/index.ts";
import { transformPoint } from "../../engine/math/affine.ts";
import { CheckpointKey } from "../../engine/persistence/checkpointService.ts";
import { buildSaveGameUiFields, emptySaveGameUiSlots, readSaveGameUiCommand } from "../../engine/persistence/saveGameSlots.ts";
import { UiViewModelStore } from "../../engine/ui/uiViewModel.ts";
import { LocaleRegistry } from "../../engine/ui/uiLocale.ts";
import { resolveWorldWidgetVisibility } from "../../engine/ui/uiWorldWidget.ts";
import { UiServiceKey, type WidgetAnchor, type WidgetHandle } from "../../engine/ui/worldUi.ts";
import { actorMatrix } from "../../engine/world/worldMatrices.ts";
import { applyUiTheme, bindUiLocale, bindUiWidget, renderUiWidget } from "../../runtime/ui/uiDom.ts";
import { BrowserUiFrameKey, BrowserUiHostKey } from "../../runtime/ui/uiHost.ts";
import { UiWidget } from "./schema.ts";
import { hudPlacement, widgetFromData } from "./widgetData.ts";

export default defineFeature({
  id: "forge.ui",
  assetTypes: [UiWidget],
  subsystems: [defineSubsystem({
    id: "forge.ui",
    tickGroups: ["renderSync"],
    create(world) {
      const host = world.services.get(BrowserUiHostKey);
      const fields = new UiViewModelStore();
      const locale = new LocaleRegistry();
      const widgets = new Set<WidgetHandle>();
      const anchors = new Map<HTMLElement, WidgetAnchor>();
      let disposed = false;
      world.services.provide(BrowserUiFrameKey, {
        draw(project) {
          for (const [element, anchor] of anchors) {
            const point = anchor.position ?? [0, 0, 0];
            const actor = anchor.actor ? world.actor(anchor.actor) : undefined;
            const projected = actor ? project(transformPoint(actorMatrix(actor, world.actor), point)) :
              anchor.actor ? null : project(point);
            const visibility = projected && resolveWorldWidgetVisibility(projected.distance,
              anchor.maxDistance === undefined ? undefined : { maxDistance: anchor.maxDistance });
            element.hidden = !visibility?.visible;
            if (!visibility?.visible || !projected) continue;
            const [dx, dy] = anchor.offset ?? [0, 0];
            element.style.transform = `translate(${projected.x + dx}px, ${projected.y + dy}px) scale(${visibility.scale}) translate(-50%, -100%)`;
            element.style.opacity = String(visibility.opacity);
          }
        },
      });
      const refreshSlots = () => {
        const slots = world.services.get(CheckpointKey)?.slots() ?? [];
        fields.setFields(buildSaveGameUiFields(emptySaveGameUiSlots().map((entry) => {
          const saved = slots.find((slot) => slot.slot === entry.slot);
          return { ...entry, updatedAt: saved?.updatedAt ?? null, levelPath: saved?.levelName ?? null };
        })));
      };
      world.services.provide(UiServiceKey, {
        set: (values) => fields.setFields(values),
        registerLocale: (table) => locale.register(table),
        setLocale: (language) => locale.setActiveLocale(language),
        async show(asset, options) {
          if (!host || disposed) return null;
          const doc = normalizeJsonAsset(UiWidget, await host.load(asset), { strict: false }).value;
          if (!doc || disposed) return null;
          const widget = widgetFromData(doc);
          refreshSlots();
          const view = renderUiWidget(widget, {
            resolveLoc: (key, params) => locale.resolve(key, params),
            onAction(action, node) {
              if (action.type !== "message") return;
              const command = readSaveGameUiCommand(action.message);
              const save = world.services.get(CheckpointKey);
              if (command && save) {
                if (command.kind === "write") save.save(command.slot);
                else if (command.kind === "delete") save.delete(command.slot);
                else save.restore(command.slot);
                refreshSlots();
              }
              options?.onMessage?.(action.message, node);
            },
          });
          Object.assign(view.element.style, { position: "absolute", inset: "0", color: "#fff", font: "16px system-ui, sans-serif",
            pointerEvents: options?.interactive ? "auto" : "none" });
          for (const node of doc.nodes) {
            const element = view.byId.get(node.id);
            if (!element) continue;
            if (node.parent === "" && !options?.anchor) Object.assign(element.style, hudPlacement(node));
            if (!options?.interactive) element.style.pointerEvents = "none";
          }
          const unbind = bindUiWidget(view, widget, fields);
          const unbindLocale = bindUiLocale(view, widget, locale);
          if (options?.theme) applyUiTheme(view.element, options.theme);
          if (options?.anchor) {
            anchors.set(view.element, options.anchor);
            view.element.hidden = true;
            Object.assign(view.element.style, { inset: "0 auto auto 0", width: "max-content", height: "auto", transformOrigin: "top left" });
          }
          host.overlay.append(view.element);
          const handle = {
            dispose() { unbind(); unbindLocale(); anchors.delete(view.element); view.dispose(); widgets.delete(handle); },
          };
          widgets.add(handle);
          return handle;
        },
      });
      return {
        tick: () => fields.flush(),
        dispose() {
          disposed = true;
          for (const widget of widgets) widget.dispose();
          fields.clear();
        },
      };
    },
  })],
});
