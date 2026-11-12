/**
 * Runs a World Builder stage once, into a level that is being built (option B,
 * user decision 2026-11-12: "run, write, record `recipe.generatedBy`").
 *
 * Forge WebGL ran stages through `planStage` (engine/worldbuilder/stage.ts),
 * whose dry run, ownership, hand-edit keeping and output hashes are not ported.
 * In a build from a brief every stage runs once over the build's own output, so
 * of `planStage` only this remains, with Forge's rules:
 *
 * - the output is validated (ids, asset ids, roles, finite transforms; repeated
 *   ids) and each transform rounded as the layout save rounded it (position and
 *   scale to 3 decimals, rotation to 1);
 * - a wanted object whose id already exists is not written (Forge: "blocked",
 *   by another stage or a hand-placed object); the build reports it;
 * - splines go through the terrain spline normaliser;
 * - the recipe records the stage in `generation.stages`, its objects in
 *   `generatedBy` (stage, road edge) and takes its `generated` sections, and
 *   must normalise cleanly.
 *
 * Errors mean the stage's output must not be applied.
 */
import type { LayoutPlacement } from "../../legacy/layout.ts";
import { isPlacementId, isSemanticRole } from "../../legacy/placementIdentity.ts";
import { normalizeTerrainSplines } from "../../terrain/terrainSplineData.ts";
import type { TerrainSpline } from "../../terrain/terrainTypes.ts";
import { normalizeWorldRecipe, type WorldRecipe } from "../recipe.ts";
import type { GeneratedPlacement, StageInput, StageLayout, StageOutput, WorldStage } from "../stage.ts";

export interface StageRun {
  stageId: string;
  /** Validated and rounded, in output order. */
  placements: GeneratedPlacement[];
  splines: Array<{ landscapeId: string; spline: TerrainSpline; edge?: string }>;
  /** Wanted ids that already exist in the level or on the terrain. */
  blocked: string[];
  recipeAfter: WorldRecipe;
  warnings: string[];
  /** A non-empty list means the run must not be applied. */
  errors: string[];
}

export function runStage(stage: WorldStage, input: StageInput): StageRun {
  const run: StageRun = {
    stageId: stage.id,
    placements: [],
    splines: [],
    blocked: [],
    recipeAfter: structuredClone(input.recipe),
    warnings: [],
    errors: [],
  };
  if (!isSemanticRole(stage.id)) {
    run.errors.push(`stage id "${stage.id}" must be a token`);
    return run;
  }
  const output = stage.run(input);
  run.warnings.push(...output.warnings);

  const existing = new Set<string>();
  for (const group of input.layout.instances) {
    for (const placement of group.placements) if (placement.id !== undefined) existing.add(placement.id);
  }
  const wanted = new Set<string>();
  output.placements.forEach((entry, index) => {
    const id = entry.placement.id;
    if (!isPlacementId(id)) {
      run.errors.push(`stage output placements[${index}]: id must be an id`);
    } else if (typeof entry.assetId !== "string" || entry.assetId.length === 0) {
      run.errors.push(`stage output ${id}: assetId must be a non-empty string`);
    } else if (entry.placement.role !== undefined && !isSemanticRole(entry.placement.role)) {
      run.errors.push(`stage output ${id}: role must be a semantic role`);
    } else if (wanted.has(id)) {
      run.errors.push(`stage output repeats id "${id}"`);
    } else {
      wanted.add(id);
      const placement = saveCanonicalTransform(structuredClone(entry.placement));
      if (typeof placement === "string") run.errors.push(`stage output ${id}: ${placement}`);
      else if (existing.has(id)) run.blocked.push(id);
      else run.placements.push({ assetId: entry.assetId, placement });
    }
  });

  const terrains = new Map(input.terrains.map((terrain) => [terrain.id, terrain]));
  const splineIds = new Set(input.terrains.flatMap((terrain) => terrain.splines.map((spline) => spline.id)));
  const wantedSplines = new Set<string>();
  (output.splines ?? []).forEach((entry, index) => {
    const id = entry.spline.id;
    if (!isPlacementId(id)) {
      run.errors.push(`stage output splines[${index}]: id must be an id`);
    } else if (!terrains.has(entry.landscapeId)) {
      run.errors.push(`stage output spline ${id}: terrain "${entry.landscapeId}" is not loaded`);
    } else if (entry.spline.coordinateSpace !== "world") {
      run.errors.push(`stage output spline ${id}: coordinateSpace must be world`);
    } else if (wantedSplines.has(id)) {
      run.errors.push(`stage output repeats spline id "${id}"`);
    } else {
      wantedSplines.add(id);
      try {
        const [spline] = normalizeTerrainSplines([entry.spline]);
        if (splineIds.has(id) || terrains.get(entry.landscapeId)!.locked) run.blocked.push(id);
        else run.splines.push({ landscapeId: entry.landscapeId, spline: spline!, ...(entry.edge === undefined ? {} : { edge: entry.edge }) });
      } catch (error) {
        run.errors.push(`stage output spline ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  run.recipeAfter = nextRecipe(input.recipe, stage, run, output.generated);
  const { issues } = normalizeWorldRecipe(run.recipeAfter);
  run.errors.push(...issues.map((issue) => `recipe after the stage: ${issue}`));
  return run;
}

/** Appends a run's placements to the layout's groups (a new asset's group goes last). */
export function applyStageRun(layout: StageLayout, run: StageRun): void {
  for (const { assetId, placement } of run.placements) {
    const group = layout.instances.find((entry) => entry.assetId === assetId);
    if (group) group.placements.push(structuredClone(placement));
    else layout.instances.push({ assetId, placements: [structuredClone(placement)] });
  }
}

function nextRecipe(recipe: WorldRecipe, stage: WorldStage, run: StageRun, generated: StageOutput["generated"]): WorldRecipe {
  const next = structuredClone(recipe);
  for (const { placement } of run.placements) next.generatedBy.placements[placement.id] = { stage: stage.id };
  for (const { spline, edge } of run.splines) {
    next.generatedBy.splines[spline.id] = { stage: stage.id, ...(edge === undefined ? {} : { edge }) };
  }
  next.generatedBy.placements = sortedRecord(next.generatedBy.placements);
  next.generatedBy.splines = sortedRecord(next.generatedBy.splines);
  if (!next.generation.stages.includes(stage.id)) next.generation.stages.push(stage.id);
  if (generated) {
    for (const [key, entries] of Object.entries(generated)) {
      if (entries) (next.generated as Record<string, unknown>)[key] = structuredClone(entries);
    }
  }
  return next;
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]!]));
}

/**
 * Forge's `saveCanonicalTransform` (engine/worldbuilder/stage.ts): rounds the
 * transform like the layout save and returns an error message for a transform
 * the save would reject.
 */
function saveCanonicalTransform<T extends LayoutPlacement>(placement: T): T | string {
  const finite = (values: readonly number[]) => values.every((value) => Number.isFinite(value));
  if (!Array.isArray(placement.position) || placement.position.length !== 3 || !finite(placement.position)) {
    return "position must be three finite numbers";
  }
  placement.position = placement.position.map((value) => round(value, 3)) as LayoutPlacement["position"];
  if (placement.rotation !== undefined) {
    if (!finite(placement.rotation) || placement.rotation.some((value) => Math.abs(value) > 360)) {
      return "rotation components must be within ±360";
    }
    placement.rotation = placement.rotation.map((value) => round(value, 1)) as LayoutPlacement["position"];
  }
  if (placement.rotationYDeg !== undefined) placement.rotationYDeg = round(placement.rotationYDeg, 1);
  if (placement.pivot !== undefined) {
    placement.pivot = placement.pivot.map((value) => round(value, 3)) as LayoutPlacement["position"];
  }
  if (placement.scale !== undefined) {
    const axes = typeof placement.scale === "number" ? [placement.scale] : placement.scale;
    if (!finite(axes) || axes.some((value) => value <= 0 || value > 1000)) return "scale must be within (0, 1000]";
    placement.scale = typeof placement.scale === "number"
      ? round(placement.scale, 3)
      : placement.scale.map((value) => round(value, 3)) as LayoutPlacement["position"];
  }
  return placement;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
