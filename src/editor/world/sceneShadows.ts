// World Settings authoring: the scene gate is a singleton in the light feature.
// It is created only when the user first changes the default, never on load.
import { createId, parseComponentTypeTag, type ActorDoc, type ClassResolver, type EditResult } from "../../core/index.ts";
import { detailsTarget, editComponent } from "../../engine/edit/actorFields.ts";
import { planObjectShadows } from "../../engine/edit/objectShadows.ts";
import type { EditorSession } from "../session/editorSession.ts";

export const SHADOW_SETTINGS_COMPONENT = "forge.shadowSettings";

export function shadowSettingsTarget(actors: readonly ActorDoc[], resolveClass: ClassResolver) {
  for (const actor of actors) {
    const target = detailsTarget(actor, resolveClass);
    for (const [key, component] of Object.entries(target.components)) {
      if (parseComponentTypeTag(component.type)?.name === SHADOW_SETTINGS_COMPONENT) return { target, key, enabled: component.enabled !== false };
    }
  }
  return null;
}

export function setSceneShadows(editor: EditorSession, resolveClass: ClassResolver, enabled: boolean): EditResult {
  const current = shadowSettingsTarget(editor.level.level.actors, resolveClass);
  if ((current?.enabled ?? true) === enabled) return { ok: true, issues: [] };
  return editor.edit("Set scene shadows", (tx) => {
    if (current) tx.setActor(editComponent(current.target, current.key, ["enabled"], enabled));
    else tx.setActor({ id: createId("actor"), name: "Shadow Settings", class: null, parent: null, spatiallyLoaded: false,
      transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { shadows: { type: "forge.shadowSettings@1", enabled } } });
  });
}

export function setObjectShadows(editor: EditorSession, resolveClass: ClassResolver, enabled: boolean): EditResult {
  if (editor.level.unloadedCells().length > 0) return { ok: false, issues: [{ severity: "error", code: "invalid-value", path: "cells", message: "Toplu işlem için sahnenin bütün hücrelerini yükleyin." }] };
  const changes = planObjectShadows(editor.level.level.actors, resolveClass, enabled);
  return editor.edit(enabled ? "Enable object shadows" : "Disable object shadows", (tx) => {
    for (const actor of changes) tx.setActor(actor);
  });
}
