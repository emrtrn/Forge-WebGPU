// What the editor knows about the features' editor sides: the collected
// `defineFeatureEditor` definitions, looked up by component. Three-free and
// DOM-free (Node tests drive it).
//
// An actor shows as the first of its components with a presentation (class
// actors: the class's components); components no editor presents show the
// generic icon. An actor without components shows as a group when it has
// children (phase 4 decision 10: a group is an empty actor), else as a
// gameplay actor (Forge's `actor` kind; Player Start until its feature).

import { SchemaDefinitionError, type ComponentMap, type SchemaRegistry } from "../../core/index.ts";
import type { ActorTypeIcon, ComponentPresentation, FeatureEditorDef, OutlinerType } from "./featureEditor.ts";

export interface ActorPresentation {
  readonly icon: ActorTypeIcon;
  readonly type: OutlinerType;
  /** What the actor is, in a word or two (the presenting component's label; Group; Actor). */
  readonly kind: string;
}

export interface EditorCatalog {
  readonly editors: readonly FeatureEditorDef[];
  /** How an actor with these (effective) components shows. */
  present(components: ComponentMap, hasChildren: boolean): ActorPresentation;
}

const GROUP: ActorPresentation = { icon: "group", type: "gameplay", kind: "Group" };
const ACTOR: ActorPresentation = { icon: "gameplay", type: "gameplay", kind: "Actor" };
const COMPONENT_TYPE = /^(.+)@\d+$/;

export function createEditorCatalog(editors: readonly FeatureEditorDef[], registry: SchemaRegistry): EditorCatalog {
  const byComponent = new Map<string, ComponentPresentation>();
  for (const editor of editors) {
    for (const [name, presentation] of Object.entries(editor.components)) {
      if (byComponent.has(name)) throw new SchemaDefinitionError(`Two feature editors present component ${name}.`);
      byComponent.set(name, presentation);
    }
  }
  return {
    editors,
    present(components, hasChildren) {
      for (const component of Object.values(components)) {
        const name = COMPONENT_TYPE.exec(component.type)?.[1];
        const presentation = name === undefined ? undefined : byComponent.get(name);
        if (!presentation || name === undefined) continue;
        const icon = typeof presentation.icon === "function" ? presentation.icon(component) : presentation.icon;
        return { icon, type: presentation.outliner, kind: registry.getComponent(name)?.label ?? name };
      }
      const first = Object.values(components)[0];
      if (first === undefined) return hasChildren ? GROUP : ACTOR;
      const name = COMPONENT_TYPE.exec(first.type)?.[1] ?? first.type;
      return { icon: "generic", type: "gameplay", kind: registry.getComponent(name)?.label ?? name };
    },
  };
}
