// Explicit authoring operation, never a render-time override. One document per
// changed actor; class assets are untouched (instances get normal field overrides).
import { parseComponentTypeTag, type ActorDoc, type ClassResolver } from "../../core/index.ts";
import { detailsTarget, editComponent } from "./actorFields.ts";

const OBJECT_TYPES = new Set(["forge.staticMesh", "forge.shape"]);

export function planObjectShadows(actors: readonly ActorDoc[], resolveClass: ClassResolver, enabled: boolean): ActorDoc[] {
  const changed: ActorDoc[] = [];
  for (const actor of actors) {
    let next = actor;
    for (const [key, component] of Object.entries(detailsTarget(actor, resolveClass).components)) {
      if (!OBJECT_TYPES.has(parseComponentTypeTag(component.type)?.name ?? "")) continue;
      if ((component.castShadow !== false) === enabled) continue;
      next = editComponent(detailsTarget(next, resolveClass), key, ["castShadow"], enabled);
    }
    if (next !== actor) changed.push(next);
  }
  return changed;
}
