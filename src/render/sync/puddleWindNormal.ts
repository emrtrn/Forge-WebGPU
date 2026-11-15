// Borrow the wind normal from the world's cache. Edits and removal invalidate
// late loads; a late promise cannot attach a texture to a removed puddle.
import type { Texture } from "three/webgpu";
import { resourceKey } from "../resources/resourceCache.ts";
import type { WorldResources } from "../resources/worldResources.ts";

export function createPuddleWindNormal(resources: WorldResources, set: (normal: Texture | null) => void) {
  let guid: string | null = null;
  let generation = 0;
  const update = (next: string | null): void => {
    if (next === guid) return;
    if (guid) resources.release(resourceKey.texture(guid, "linear"));
    guid = next;
    const version = ++generation;
    set(null);
    if (!next) return;
    void resources.texture(next, "linear").then((texture) => {
      if (version === generation) set(texture);
    }).catch((error: unknown) => {
      if (version === generation) console.warn(`forge render: puddle wind normal ${next}: ${String(error)}`);
    });
  };
  return { update, dispose() { update(null); generation += 1; } };
}
