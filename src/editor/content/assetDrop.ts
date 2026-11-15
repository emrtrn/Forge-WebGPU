// Content Browser cards dragged into the viewport (plan phase 4 step 6f;
// Forge WebGL's asset drag preview and drops: editor/input/bindings.ts,
// SceneApp `onAssetDrop`, `assignMaterialAt`, `onActorClassDrop` @
// forge-webgl-final; user decisions 2026-11-14):
// - an actor class: a class actor, placed like its Add Actor entry;
// - an asset whose feature gives a `place` rule (a model): a new actor, with
//   the Add Actor menu's preview under the pointer and its placement;
// - an asset with an `assign` rule (a material), dropped on an actor that has
//   the rule's component: written into it (the slot under the pointer), one
//   undo step; a class actor gets an override (Details' rule). Dropped on
//   nothing that takes it: placed when it can be, else a hint.
// The drag's data is unreadable while it moves over the page (the browser's
// rule), so the card tells this module what it carries when it starts.
// DOM listeners on the viewport host; three-free.

import { normalizeActorDoc, parseComponentTypeTag, type ActorId, type ClassResolver, type SchemaRegistry } from "../../core/index.ts";
import { detailsTarget, editComponent } from "../../engine/edit/actorFields.ts";
import type { AssetDropRule, FeatureEditorDef } from "../host/featureEditor.ts";
import type { ActorPlacer } from "../place/actorPlacer.ts";
import type { EditorSession } from "../session/editorSession.ts";
import type { ContentAssetItem } from "./contentModel.ts";

/** The drag's data type (other windows read it on the drop). */
export const CONTENT_ASSET_MIME = "application/x-forge-content-asset";
/** A placer key for an asset with a `place` rule. */
export const assetPlacerKey = (guid: string): string => `asset:${guid}`;

export interface AssetDrop {
  /** True when the card can be dragged into the viewport. */
  draggable(item: ContentAssetItem): boolean;
  /** The card's drag starts (dragstart). */
  begin(item: ContentAssetItem): void;
  /** It ended, dropped or not (dragend). */
  end(): void;
  /** The `place` rule of an asset type, for the placer's entries. */
  placeRule(type: string): AssetDropRule | undefined;
}

export function createAssetDrop(options: {
  readonly host: HTMLElement;
  readonly editors: readonly FeatureEditorDef[];
  readonly placer: ActorPlacer;
  readonly editor: EditorSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly pickSlot: (clientX: number, clientY: number) => { readonly actor: ActorId; readonly slot: number | null } | null;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}): AssetDrop {
  const rules = options.editors.flatMap((editor) => editor.assets);
  const placeRule = (type: string): AssetDropRule | undefined => rules.find((rule) => rule.assetType === type && rule.place);
  const assignRules = (type: string): AssetDropRule[] => rules.filter((rule) => rule.assetType === type && rule.assign);
  let dragging: ContentAssetItem | null = null;
  /** The placer key while the dragged asset can be placed. */
  const keyOf = (item: ContentAssetItem): string | null => {
    if (item.id === null || item.type === null) return null;
    if (item.type === "forge.actorClass") return `class:${item.id}`;
    return placeRule(item.type) ? assetPlacerKey(item.id) : null;
  };

  /** Writes the asset into the actor under the pointer; false when no actor there takes it. */
  const assign = (item: ContentAssetItem, clientX: number, clientY: number): boolean => {
    const hit = options.pickSlot(clientX, clientY);
    if (!hit || item.id === null || item.type === null) return false;
    const doc = options.editor.level.actor(hit.actor);
    if (!doc || doc.locked) return false;
    const target = detailsTarget(doc, options.resolveClass);
    for (const rule of assignRules(item.type)) {
      const entry = Object.entries(target.components).find(([, component]) => parseComponentTypeTag(component.type)?.name === rule.assign!.component);
      if (!entry) continue;
      const fields = rule.assign!.fields(entry[1], { guid: item.id, name: item.name }, { slot: hit.slot });
      if (fields === null) continue;
      let next = doc;
      for (const [key, value] of Object.entries(fields)) next = editComponent(detailsTarget(next, options.resolveClass), entry[0], [key], value);
      const normalized = normalizeActorDoc(next, { strict: true, registry: options.registry, resolveClass: options.resolveClass });
      if (!normalized.ok || !normalized.value) {
        options.status(normalized.issues.map((issue) => issue.message).join("; "), "error");
        return true;
      }
      const result = options.editor.edit(`Assign ${item.name}`, (tx) => tx.setActor(normalized.value!));
      if (!result.ok) options.status(result.issues.map((issue) => issue.message).join("; "), "error");
      else {
        options.editor.selection.set([doc.id]);
        options.status(`${item.name} on ${doc.name}${hit.slot !== null ? ` (slot ${hit.slot})` : ""}`);
      }
      return true;
    }
    return false;
  };

  const host = options.host;
  host.addEventListener("dragover", (event) => {
    if (!dragging) return;
    const key = keyOf(dragging);
    if (key !== null) options.placer.dragOver(key, event.clientX, event.clientY);
    if (key === null && assignRules(dragging.type ?? "").length === 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  host.addEventListener("dragleave", (event) => {
    if (dragging && !host.contains(event.relatedTarget as Node | null)) options.placer.dragLeave();
  });
  host.addEventListener("drop", (event) => {
    const item = dragging;
    if (!item) return;
    event.preventDefault();
    dragging = null;
    const key = keyOf(item);
    // An actor under the pointer that takes it gets it; otherwise it is placed (the preview goes first).
    if (assignRules(item.type ?? "").length > 0) {
      if (key !== null) options.placer.dragLeave();
      if (assign(item, event.clientX, event.clientY)) {
        options.placer.endDrag();
        return;
      }
    }
    if (key !== null) options.placer.drop(key, event.clientX, event.clientY);
    else options.status(`Drop ${item.name} on an actor that takes it.`, "warning");
  });

  return {
    draggable: (item) => keyOf(item) !== null || (item.type !== null && assignRules(item.type).length > 0),
    begin(item) {
      dragging = item;
      options.status(`Dragging ${item.name} - drop it in the viewport.`);
    },
    end() {
      dragging = null;
      options.placer.endDrag();
    },
    placeRule,
  };
}
