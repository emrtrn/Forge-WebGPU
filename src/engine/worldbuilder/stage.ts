// Ported from Forge WebGL engine/worldbuilder/stage.ts (the stage contract) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * World Builder stage contract (World Builder plan v0.4 §2.1).
 *
 * A stage is a pure, deterministic function from the recipe (+ level, region
 * profile, World Terrains) to the objects it wants to exist: placements and
 * World Terrain splines. Dependency-free; no three.js.
 *
 * Option B (user decision 2026-11-12): Forge's Stage Runner (`planStage`: the
 * dry run, ownership, hand-edit and deletion keeping, protected / locked
 * guards, output hashes, generator versions) is not ported. Writing a stage's
 * output into a level, and recording `recipe.generatedBy`, is the stage
 * runner's job (tools/world); the ported Forge checks run stages through a
 * test-scaffold copy (src/engine/testing/worldStagePlan.ts).
 */
import type { LayoutModelInstances, LayoutPlacement } from "../legacy/layout.ts";
import type { TerrainSpline, WorldTerrainSpline } from "../terrain/terrainTypes.ts";
import type { OceanContext } from "./island.ts";
import type { WorldPoint } from "./normalize.ts";
import type { ProgramExtension } from "./program.ts";
import type { WorldRecipe } from "./recipe.ts";
import type { RegionProfile } from "./regionProfile.ts";

/** A World Terrain of the level, as stages see it. */
export interface StageTerrain {
  /** The Landscape actor id. */
  readonly id: string;
  /** XZ box the tile grid covers, world metres. */
  readonly min: WorldPoint;
  readonly max: WorldPoint;
  readonly layers: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  /** The definition's splines as they are now. */
  readonly splines: readonly TerrainSpline[];
  /** A locked terrain's splines are never written. */
  readonly locked: boolean;
}

/**
 * The part of the level stages read: its placement groups (earlier stages'
 * output among them). Forge passed the whole `RoomLayout`; stages only read
 * `instances` (boundary adaptation, plan 2b).
 */
export interface StageLayout {
  instances: LayoutModelInstances[];
}

export interface StageInput {
  /** Shared coastline of a generated island, with its actual sea level. */
  readonly ocean?: OceanContext;
  readonly recipe: WorldRecipe;
  readonly layout: StageLayout;
  /** The recipe's region profile, when it has one and it loaded. */
  readonly profile: RegionProfile | null;
  /** Terrain height at world XZ, or null where there is no terrain. */
  readonly sampleHeight: (x: number, z: number) => number | null;
  /** The level's loaded World Terrains, in level order. */
  readonly terrains: readonly StageTerrain[];
  /** The game module's settlement program rows (L1 "game rows"), if it supplies any. */
  readonly programExtensions?: readonly ProgramExtension[];
}

/** One placement a stage wants; `placement.id` is its stable identity. */
export interface GeneratedPlacement {
  assetId: string;
  placement: LayoutPlacement & { id: string };
}

/** One spline a stage wants on a World Terrain; `spline.id` is its stable identity. */
export interface GeneratedSpline {
  /** The `StageTerrain.id` that holds it. */
  landscapeId: string;
  spline: WorldTerrainSpline;
  /** The road edge it realises, recorded in its `recipe.generatedBy` entry. */
  edge?: string;
}

export interface StageOutput {
  placements: GeneratedPlacement[];
  splines?: GeneratedSpline[];
  /** Replaces the named `recipe.generated` sections. */
  generated?: Partial<WorldRecipe["generated"]>;
  warnings: string[];
}

export interface WorldStage {
  /** Token; also the `recipe.generatedBy` stage of what it produces. */
  readonly id: string;
  readonly label: string;
  // Forge's `version` (recorded in `recipe.generators` to mark stale output) is cut with the re-run surface.
  run(input: StageInput): StageOutput;
}
