// `npm run forge -- zones --project <path> --level <level folder> [--json] [--floor <y>] [--dry-run]`
// (plan 5c R9b Z4): generates the level's zones and portals from its walls
// (`engine/world/zoneLevel.ts`, `zoneGeneration.ts`) and saves them as one
// edit through the record service, as `forge edit` does (same read, save and
// 409 retry; an open editor refreshes by itself). Generated zones and portals
// are replaced; the user's stay. `--dry-run` reports without saving.

import { buildAssetIndex, effectiveComponents, normalizeActorDoc, type ActorDoc, type Vec3 } from "../../src/core/index.ts";
import { worldMatrixOf } from "../../src/engine/edit/hierarchy.ts";
import { planZoneLevel, zoneOccluders, type ZoneLevelActor, type ZoneLevelPlan } from "../../src/engine/world/zoneLevel.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { scanRoots } from "../assets/scan.ts";
import { openEditProject } from "../edit/editProject.ts";
import { runEdit, EXIT_ERROR, type EditRunResult } from "../edit/run.ts";
import { readModelInfo } from "../stats/sceneStats.ts";
import { createHlodAssets } from "../world/hlodAssets.ts";
import { diskHlodInput } from "../world/hlodInput.ts";

export const ZONES_USAGE = "Usage: npm run forge -- zones --project <path> --level <level folder> [--json] [--floor <y>] [--dry-run]";

interface Args { project: string; level: string; json: boolean; floor: number | undefined; dryRun: boolean }

export function parseZonesArgs(args: readonly string[]): Args {
  let project: string | undefined, level: string | undefined, json = false, floor: number | undefined, dryRun = false;
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at]!;
    if (word === "--json") json = true;
    else if (word === "--dry-run") dryRun = true;
    else if (word === "--project") project = args[(at += 1)];
    else if (word === "--level") level = args[(at += 1)];
    else if (word === "--floor") floor = Number(args[(at += 1)]);
    else throw new Error(`Unknown option: ${word}`);
  }
  if (!project || !level || (floor !== undefined && !Number.isFinite(floor))) throw new Error(ZONES_USAGE);
  return { project, level, json, floor, dryRun };
}

export interface ZonesResult {
  readonly plan: ZoneLevelPlan | null;
  readonly edit: EditRunResult;
}

export async function runZones(args: Args, engineRoot: string, occludingModels?: ReadonlySet<string>): Promise<ZonesResult> {
  const opened = await openEditProject(engineRoot, args.project);
  const manifest = opened.project.manifest!;
  // Model bounds read from disk as `forge stats` reads them (static meshes as walls).
  const roots = projectIndexRoots(engineRoot, opened.project.root, manifest);
  const scan = await scanRoots(roots);
  const index = buildAssetIndex(scan.files, { strict: true, registry: opened.registry });
  const input = diskHlodInput(scan.files, index, opened.registry, roots);
  const { nodeIO } = await createHlodAssets(input, () => undefined);
  const bounds = new Map<string, { min: Vec3; max: Vec3 } | null>();
  let plan: ZoneLevelPlan | null = null;
  const edit = await runEdit({
    engineRoot, project: args.project, level: args.level, commands: [], opened,
    step: async (context) => {
      const session = context.session;
      const lookup = (id: Parameters<typeof session.actor>[0]) => session.actor(id);
      const actors: ZoneLevelActor[] = session.level.actors.map((doc) => ({
        id: doc.id, name: doc.name, world: worldMatrixOf(lookup, doc),
        components: doc.class === null ? doc.components : effectiveComponents(doc, context.resolveClass(doc.class)),
      }));
      for (const actor of actors) {
        for (const component of Object.values(actor.components)) {
          const mesh = (component as { mesh?: unknown }).mesh;
          if (typeof mesh === "string" && (!occludingModels || occludingModels.has(mesh)) && !bounds.has(mesh)) {
            bounds.set(mesh, (await readModelInfo((path) => nodeIO.read(path), input, mesh)).bounds);
          }
        }
      }
      const occluders = zoneOccluders(actors, (model) => bounds.get(model) ?? null);
      plan = planZoneLevel(actors, occluders, { levelId: session.level.id, ...(args.floor !== undefined ? { floorY: args.floor } : {}) });
      if (args.dryRun) return;
      const docs: ActorDoc[] = [];
      for (const raw of plan.add) {
        const result = normalizeActorDoc(raw, { strict: true, registry: context.registry, resolveClass: context.resolveClass });
        if (!result.ok || !result.value) throw new Error(`zones: a generated actor does not normalise: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
        docs.push(result.value);
      }
      if (plan.remove.length === 0 && docs.length === 0) return;
      const removed = plan.remove;
      const result = session.edit("Generate Zones", (tx) => {
        for (const id of removed) tx.removeActor(id);
        for (const doc of docs) tx.setActor(doc);
      });
      if (!result.ok) throw new Error(`zones: ${result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    },
  });
  return { plan, edit };
}

function formatZones({ plan, edit }: ZonesResult, dryRun: boolean): string {
  if (!edit.ok) return `forge zones: ${edit.error?.code ?? "error"}: ${edit.error?.message ?? "failed"}`;
  if (!plan) return "forge zones: nothing was planned";
  const p: ZoneLevelPlan = plan;
  const lines = [
    `${edit.level}: ${p.floorYs.length > 1 ? "floors" : "floor"} ${p.floorYs.join(", ") || "not found (no wall reaches eye height)"}`,
    `zones ${p.zones}, portals ${p.portals}; generated actors replaced ${p.remove.length}; user zones kept ${p.kept} (rooms left to them ${p.skipped})`,
    dryRun ? "dry run: nothing saved" : `files ${edit.files.length === 0 ? "unchanged" : edit.files.map((file) => file.path).join(", ")}`,
  ];
  return lines.join("\n");
}

export async function zonesMain(argv: readonly string[], engineRoot: string): Promise<number> {
  let args: Args;
  try {
    args = parseZonesArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT_ERROR;
  }
  try {
    const result = await runZones(args, engineRoot);
    if (args.json) {
      const p = result.plan as ZoneLevelPlan | null;
      console.log(JSON.stringify({
        ok: result.edit.ok, level: result.edit.level, dryRun: args.dryRun,
        ...(p ? { floorY: p.floorY, floorYs: p.floorYs, zones: p.zones, portals: p.portals, replaced: p.remove.length, kept: p.kept, skipped: p.skipped } : {}),
        files: result.edit.files, ...(result.edit.error ? { error: result.edit.error } : {}),
      }, null, 2));
    } else if (result.edit.ok) console.log(formatZones(result, args.dryRun));
    else console.error(formatZones(result, args.dryRun));
    return result.edit.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) console.log(JSON.stringify({ ok: false, error: { code: "error", message } }));
    else console.error(`forge zones: ${message}`);
    return EXIT_ERROR;
  }
}
