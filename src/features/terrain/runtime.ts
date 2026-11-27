import { defineSubsystem } from "../../core/index.ts";
import { createTerrainResidency, TerrainResidencyKey } from "../../engine/terrain/terrainResidency.ts";

export const TerrainResidencySubsystem = defineSubsystem({
  id: "forge.terrain.residency",
  inEditor: true,
  create(world) {
    const residency = createTerrainResidency(world.services);
    world.services.provide(TerrainResidencyKey, residency);
    return {
      actorsRemoved(removed) {
        for (const actor of removed) residency.removeActor(actor.id);
      },
      actorsChanged() {
        // The render attachment replaces the placement only when terrain data changes.
      },
      dispose: residency.dispose,
    };
  },
});
