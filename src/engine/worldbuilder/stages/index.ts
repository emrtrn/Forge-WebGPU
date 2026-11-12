// Ported from Forge WebGL engine/worldbuilder/stages/index.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/** The stages World Builder offers, in their default run order. */
import type { WorldStage } from "../stage.ts";
import { planBlockoutStage } from "./planBlockout.ts";
import { roadsStage } from "./roads.ts";
import { buildingsStage } from "./buildings.ts";
import { fencesStage } from "./fences.ts";
import { furnitureStage } from "./furniture.ts";
import { landUseStage } from "./landUse.ts";
import { parcelsStage } from "./parcels.ts";
import { settlementSitesStage } from "./settlementSites.ts";
import { streetsStage } from "./streets.ts";

export function createDefaultWorldStages(): WorldStage[] {
  return [planBlockoutStage, roadsStage, settlementSitesStage, streetsStage, parcelsStage, landUseStage, buildingsStage, furnitureStage, fencesStage];
}
