// A class is one asset; saving it never silently migrates instance documents.
// Check the consumers visible to this server against the proposed defaults.
import { isJsonObject, normalizeActorDoc, type ActorClassDoc, type ClassResolver, type SchemaRegistry } from "../../src/core/index.ts";
import type { SaveContext, SaveIssue } from "./transaction.ts";

export interface ClassConsumerOptions {
  files(): Promise<readonly { readonly file: string; readonly json: unknown }[]>;
  label(path: string): string;
}
export async function checkClassConsumers(cls: ActorClassDoc, path: string, context: SaveContext, registry: SchemaRegistry, resolveClass: ClassResolver, options: ClassConsumerOptions): Promise<SaveIssue[]> {
  const pending = new Map(context.pending.map((file) => [options.label(file.path), file.text]));
  const issues: SaveIssue[] = [];
  for (const file of await options.files()) {
    let document = file.json;
    const replacement = pending.get(file.file);
    if (replacement !== undefined) { try { document = JSON.parse(replacement); } catch { continue; } }
    if (!isJsonObject(document) || !["forge.level/1", "forge.levelCell/1"].includes(String(document.schema)) || !Array.isArray(document.actors)) continue;
    for (const raw of document.actors) {
      if (!isJsonObject(raw) || raw.class !== cls.id) continue;
      const checked = normalizeActorDoc(raw, { strict: true, registry, resolveClass });
      for (const issue of checked.issues.filter((issue) => issue.severity === "error")) issues.push({
        file: path, path: "", code: "incompatible-class", severity: "error",
        message: `${file.file}, actor ${String(raw.name ?? raw.id)} (${String(raw.id)}), ${issue.path}: ${issue.message} Change the instance override first; no level file was changed.`,
      });
    }
  }
  return issues;
}
