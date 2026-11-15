// One run of `npm run forge -- edit` (A12; plan phase 4 step 9d): open the
// project the dev server's way, read the level whole (every cell, phase 4
// decision 11) through the local client, run the commands on the editor's
// edit model, and save once with the editor's saver: the files written are
// the canonical files the editor writes for the same change.
//
// - A command that cannot run stops the run: nothing is saved.
// - A 409 (the level changed on disk between reading and saving: an editor
//   saved, another command ran) re-reads the level and runs the commands once
//   more; a second 409 is the result (exit 2).
// - Commands only read the engine's content and the packs (user decision
//   2026-11-15): a level under `engine:` is found and shown, not changed.

import {
  fileLabel,
  openLevelFromServer,
  saveLevelSession,
  SaveClientError,
  type ActorClassDoc,
  type ActorId,
  type SaveIssueBody,
} from "../../src/core/index.ts";
import { ENGINE_LABEL_PREFIX } from "../assets/engineContent.ts";
import { CommandError, type Command } from "./args.ts";
import { runCommand, type CommandContext, type CommandOutcome } from "./commands.ts";
import { EditProjectError, openEditProject, type EditProject } from "./editProject.ts";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_CONFLICT = 2;

export interface EditRunOptions {
  readonly engineRoot: string;
  readonly project: string;
  /** Level folder, e.g. `content/levels/main` (a trailing `/level.json` is taken off). */
  readonly level: string;
  readonly commands: readonly Command[];
  /** Tests: a project already open (its schemas loaded). */
  readonly opened?: EditProject;
  /** Tests: new actor GUIDs. */
  readonly newId?: () => ActorId;
}

export interface EditRunResult {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly level: string;
  readonly outcomes: readonly CommandOutcome[];
  /** Files the save changed (revision null: deleted). */
  readonly files: readonly { readonly path: string; readonly revision: string | null }[];
  readonly warnings: readonly SaveIssueBody[];
  readonly error?: { readonly code: "usage" | "command" | "level" | "rejected" | "conflict" | "read-only"; readonly message: string; readonly issues?: readonly SaveIssueBody[] };
}

const WRITES = new Set<Command["kind"]>(["add", "move", "delete", "set", "reset"]);

export function levelFolderOf(level: string): string {
  return level.replaceAll("\\", "/").replace(/\/level\.json$/, "").replace(/\/+$/, "");
}

function failure(level: string, outcomes: readonly CommandOutcome[], code: NonNullable<EditRunResult["error"]>["code"], message: string, issues?: readonly SaveIssueBody[]): EditRunResult {
  return {
    ok: false,
    exitCode: code === "conflict" ? EXIT_CONFLICT : EXIT_ERROR,
    level,
    outcomes,
    files: [],
    warnings: [],
    error: { code, message, ...(issues ? { issues } : {}) },
  };
}

export async function runEdit(options: EditRunOptions): Promise<EditRunResult> {
  const level = levelFolderOf(options.level);
  const writes = options.commands.some((command) => WRITES.has(command.kind));
  if (writes && level.startsWith(ENGINE_LABEL_PREFIX)) {
    return failure(level, [], "read-only", `${level} is the engine's content or a pack: edit commands read it (find, show) but do not change it.`);
  }
  let opened: EditProject;
  try {
    opened = options.opened ?? (await openEditProject(options.engineRoot, options.project));
  } catch (error) {
    if (error instanceof EditProjectError) return failure(level, [], "level", error.message);
    throw error;
  }
  if (writes && opened.project.readOnly) {
    return failure(level, [], "read-only", `The project at ${opened.project.root} is read-only (the engine's samples and fixtures); make your own with npm run create-project.`);
  }
  // Classes by GUID or by file.
  const classIdOfFile = new Map<string, string>();
  for (const entry of (await opened.authoring.current()).index.entries.values()) {
    if (entry.type === "forge.actorClass") classIdOfFile.set(fileLabel(entry.root, entry.path), entry.id);
  }
  const findClass = (ref: string): ActorClassDoc | undefined =>
    opened.classes.get(ref as never) ?? opened.classes.get((classIdOfFile.get(ref.replaceAll("\\", "/")) ?? "") as never);

  for (let attempt = 0; ; attempt += 1) {
    let session;
    try {
      const read = await openLevelFromServer(opened.client, level, opened.options);
      const errors = read.issues.filter((issue) => issue.severity === "error");
      if (errors.length > 0) return failure(level, [], "level", `The level has errors: ${errors.map((issue) => `${issue.file} ${issue.path}: ${issue.message}`).join("; ")}`);
      session = read.session;
    } catch (error) {
      if (error instanceof SaveClientError) return failure(level, [], "level", error.message);
      throw error;
    }
    const context: CommandContext = {
      session,
      registry: opened.registry,
      resolveClass: opened.options.resolveClass,
      findClass,
      ...(options.newId ? { newId: options.newId } : {}),
    };
    const outcomes: CommandOutcome[] = [];
    try {
      for (const command of options.commands) outcomes.push(runCommand(context, command));
    } catch (error) {
      if (error instanceof CommandError) return failure(level, outcomes, "command", error.message);
      throw error;
    }
    if (!writes || session.dirtyActors().length === 0) {
      return { ok: true, exitCode: EXIT_OK, level, outcomes, files: [], warnings: [] };
    }
    const saved = await saveLevelSession(session, opened.client);
    if (saved.status === "needs-load") return failure(level, outcomes, "level", `Cells ${saved.cells.join(", ")} are not loaded.`);
    if (saved.status === "clean") return { ok: true, exitCode: EXIT_OK, level, outcomes, files: [], warnings: [] };
    const response = saved.response;
    if (response.status === "saved") {
      return { ok: true, exitCode: EXIT_OK, level, outcomes, files: response.files, warnings: response.warnings };
    }
    if (response.status === "conflict") {
      if (attempt === 0) continue;
      return failure(level, outcomes, "conflict", `The level changed on disk while the commands ran (twice): ${response.conflicts.map((conflict) => conflict.path).join(", ")}. Run them again.`);
    }
    const message = response.message ?? (response.issues ?? []).filter((issue) => issue.severity === "error").map((issue) => `${issue.file} ${issue.path}: ${issue.message}`).join("; ");
    return failure(level, outcomes, response.reason === "read-only" ? "read-only" : "rejected", `The save refused it (${response.reason}): ${message}`, response.issues);
  }
}
