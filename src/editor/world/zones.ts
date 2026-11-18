// Generate Zones in the editor (plan 5c R9b Z5): the same plan `forge zones`
// saves (`engine/world/zoneLevel.ts`), applied as one edit of the open level
// (one Undo). Every cell must be loaded: the walls of an unloaded cell would
// be missing and its zones replaced by fewer.

import { effectiveComponents, normalizeActorDoc, type ActorDoc, type ClassResolver, type EditResult, type SchemaRegistry, type Vec3 } from "../../core/index.ts";
import { worldMatrixOf } from "../../engine/edit/hierarchy.ts";
import { planZoneLevel, zoneOccluders, type ZoneLevelActor, type ZoneLevelPlan } from "../../engine/world/zoneLevel.ts";
import type { EditorSession } from "../session/editorSession.ts";

export type ModelBounds = (model: string) => Promise<{ readonly min: Vec3; readonly max: Vec3 } | null>;

export interface GenerateZonesResult {
  readonly result: EditResult;
  readonly plan: ZoneLevelPlan | null;
}

const failed = (message: string): GenerateZonesResult => ({ result: { ok: false, issues: [{ severity: "error", code: "invalid-value", path: "zones", message }] }, plan: null });

export async function generateLevelZones(editor: EditorSession, registry: SchemaRegistry, resolveClass: ClassResolver, modelBounds: ModelBounds | null): Promise<GenerateZonesResult> {
  if (editor.level.unloadedCells().length > 0) return failed("Bölgeleri üretmek için sahnenin bütün hücrelerini yükleyin.");
  const docs = editor.level.level.actors;
  const lookup = (id: ActorDoc["id"]) => editor.level.actor(id);
  const actors: ZoneLevelActor[] = docs.map((doc) => ({
    id: doc.id, name: doc.name, world: worldMatrixOf(lookup, doc),
    components: doc.class === null ? doc.components : effectiveComponents(doc, resolveClass(doc.class)),
  }));
  const bounds = new Map<string, { min: Vec3; max: Vec3 } | null>();
  for (const actor of actors) {
    for (const component of Object.values(actor.components)) {
      const mesh = (component as { mesh?: unknown }).mesh;
      if (typeof mesh === "string" && !bounds.has(mesh)) bounds.set(mesh, modelBounds ? await modelBounds(mesh) : null);
    }
  }
  const plan = planZoneLevel(actors, zoneOccluders(actors, (model) => bounds.get(model) ?? null), { levelId: editor.level.level.id });
  const added: ActorDoc[] = [];
  for (const raw of plan.add) {
    const normal = normalizeActorDoc(raw, { strict: true, registry, resolveClass });
    if (!normal.ok || !normal.value) return { result: { ok: false, issues: normal.issues }, plan };
    added.push(normal.value);
  }
  if (plan.remove.length === 0 && added.length === 0) return { result: { ok: true, issues: [] }, plan };
  const result = editor.edit("Generate Zones", (tx) => {
    for (const id of plan.remove) tx.removeActor(id);
    for (const doc of added) tx.setActor(doc);
  });
  return { result, plan };
}
