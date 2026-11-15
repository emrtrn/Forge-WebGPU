// What `npm run forge -- edit` prints (A12: short output; plan phase 4 step
// 9d). Text: one line per actor a command touched or found, then the files
// saved and any warnings; numbers rounded for reading. `--json`: the same as
// one JSON object (the GUIDs, positions and revisions whole).

import type { ActorSummary, CommandOutcome } from "./commands.ts";
import type { EditRunResult } from "./run.ts";

const round = (value: number): string => String(Number(value.toFixed(3)));
const vec = (value: readonly number[]): string => value.map(round).join(",");

function actorLine(actor: ActorSummary): string {
  const kind = actor.class !== null ? `class ${actor.class}` : actor.types.length > 0 ? actor.types.join(" ") : "empty";
  return `${actor.id} "${actor.name}" ${kind} @ ${vec(actor.position)}${actor.parent === null ? "" : ` under ${actor.parent}`}`;
}

const VERB: Record<Exclude<CommandOutcome["kind"], "find" | "show">, string> = {
  add: "added",
  move: "moved",
  delete: "deleted",
  set: "set",
  reset: "reset",
};

function outcomeLines(outcome: CommandOutcome): string[] {
  if (outcome.kind === "find") {
    const head = outcome.total > outcome.actors.length ? `found ${outcome.total}, first ${outcome.actors.length}:` : `found ${outcome.total}${outcome.total > 0 ? ":" : ""}`;
    return [head, ...outcome.actors.map((actor) => `  ${actorLine(actor)}`)];
  }
  if (outcome.kind === "show") return [actorLine(outcome.actor), JSON.stringify(outcome.doc)];
  const verb = VERB[outcome.kind];
  const warnings = outcome.warnings.map((warning) => `warning: ${warning}`);
  if (outcome.actors.length === 1) return [`${verb} ${actorLine(outcome.actors[0]!)}`, ...warnings];
  return [`${verb} ${outcome.actors.length} actors:`, ...outcome.actors.map((actor) => `  ${actorLine(actor)}`), ...warnings];
}

export function formatText(result: EditRunResult): string {
  const lines = result.outcomes.flatMap(outcomeLines);
  if (result.ok) {
    const written = result.files.filter((file) => file.revision !== null).map((file) => file.path);
    const removed = result.files.filter((file) => file.revision === null).map((file) => file.path);
    if (written.length > 0) lines.push(`saved ${written.length} file${written.length === 1 ? "" : "s"}: ${written.join(", ")}`);
    if (removed.length > 0) lines.push(`removed ${removed.join(", ")}`);
  } else if (result.error) {
    lines.push(`error (${result.error.code}): ${result.error.message}`, "nothing saved");
  }
  for (const warning of result.warnings) lines.push(`warning: ${warning.file} ${warning.path}: ${warning.message}`.replace(/ +:/, ":"));
  return lines.join("\n");
}

export function formatJson(result: EditRunResult): string {
  return JSON.stringify({
    ok: result.ok,
    level: result.level,
    results: result.outcomes,
    files: result.files,
    warnings: result.warnings,
    ...(result.error ? { error: result.error } : {}),
  });
}
