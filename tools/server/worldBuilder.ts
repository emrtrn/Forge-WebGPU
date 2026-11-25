// The dev server's side of the World Builder window (plan 5d step 8, INV-B13;
// Forge WebGL tools/world/randomWorldEndpoint.ts, rewritten for the project's
// content roots and the save service):
//
//   GET  /__forge/world-builder        what the window needs to know: the levels folder, the packs World Builder
//                                      misses, whether a build runs
//   POST /__forge/world-builder/pack   adds the missing packs to `contentPacks` in forge.project.json (through the
//                                      save service), then restarts the dev server: its content roots are read at start
//   POST /__forge/world-random         a build: { out, force, world } (tools/world/randomWorldRequest.ts) ->
//                                      newline-delimited events (progress…, then done or error)
//
// The build is `tools/world-random.ts --request` in a child process (it is
// synchronous and takes seconds), one at a time. An existing level needs
// `force`: the window asks the user first. A read-only project refuses both
// writes; the build's own write goes through the save service in the child.

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join, posix } from "node:path";
import { createInterface } from "node:readline";
import { LEVEL_FILE, type ProjectManifest } from "../../src/core/index.ts";
import { parseRandomWorldEvent, WORLD_BUILDER_PACK, type RandomWorldEvent } from "../../src/engine/worldbuilder/randomWorldChoices.ts";
import { CONTENT_PACKS_DIR, ENGINE_LABEL_PREFIX, packWithRequired } from "../assets/engineContent.ts";
import { fileRevision } from "../assets/revision.ts";
import { MANIFEST_FILE } from "../save/transaction.ts";
import { validateRandomWorldRequest, type RandomWorldRequest } from "../world/randomWorldRequest.ts";
import { READ_ONLY_MESSAGE, type Authoring } from "./authoring.ts";
import { ProjectPathError, resolveWritablePath } from "./projectPaths.ts";

export interface WorldBuilderState {
  readonly readOnly: boolean;
  /** Where generated levels go, project-relative (`content/levels`). */
  readonly levels: string;
  /** Packs to add to `contentPacks`. */
  readonly missing: readonly string[];
  /** The manifest has them but this server does not read them yet (it restarts for that). */
  readonly restarting: boolean;
  readonly building: boolean;
}

export interface WorldBuild {
  /** Settles when the build is over; the events come before. */
  readonly done: Promise<void>;
  cancel(): void;
}

/** Starts a build and reports its events; tests inject their own. */
export type StartWorldBuild = (engineRoot: string, projectRoot: string, request: RandomWorldRequest, event: (event: RandomWorldEvent) => void) => WorldBuild;

export const startWorldBuild: StartWorldBuild = (engineRoot, projectRoot, request, event) => {
  const child = spawn(process.execPath, [join(engineRoot, "tools/world-random.ts"), "--project", projectRoot, "--request"], {
    cwd: engineRoot, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let answered = false;
  let errorText = "";
  child.stderr.on("data", (bytes: Buffer) => { errorText = (errorText + bytes.toString()).slice(-4096); });
  const report = (value: RandomWorldEvent): void => {
    if (value.type !== "progress") answered = true;
    event(value);
  };
  createInterface({ input: child.stdout }).on("line", (line) => {
    const value = line.startsWith("@@") ? parseRandomWorldEvent(line.slice(2)) : null;
    if (value && !answered) report(value);
  });
  // A child that could not start or died reading its request answers below.
  child.stdin.on("error", () => undefined);
  child.stdin.end(JSON.stringify(request));
  const done = new Promise<void>((resolve) => {
    let failure: string | null = null;
    child.on("error", (error) => { failure = error.message; });
    child.on("close", (code) => {
      if (!answered) report({ type: "error", message: failure ?? (errorText.trim() || `The builder stopped before answering (${code ?? "terminated"}).`) });
      resolve();
    });
  });
  return { done, cancel: () => void child.kill() };
};

/** The manifest's text with `packs` as its contentPacks; only that value changes (the file keeps its form) where it is there. */
export function withContentPacks(text: string, packs: readonly string[]): string {
  const list = `[${packs.map((pack) => JSON.stringify(pack)).join(", ")}]`;
  const replaced = text.replace(/("contentPacks"\s*:\s*)\[[^\]]*\]/, (_, key: string) => `${key}${list}`);
  if (replaced !== text) return replaced;
  return `${JSON.stringify({ ...(JSON.parse(text) as Record<string, unknown>), contentPacks: packs }, null, 2)}\n`;
}

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

export interface WorldBuilderServer {
  state(): Promise<WorldBuilderState>;
  addPacks(): Promise<{ readonly status: number; readonly body: unknown; readonly restart: boolean }>;
  /** Answers the request itself: an error as JSON, a build as event lines. */
  build(body: unknown, res: ServerResponse): Promise<void>;
  /** A build runs. */
  building(): boolean;
  dispose(): void;
}

export function createWorldBuilderServer(options: {
  readonly engineRoot: string;
  readonly authoring: Authoring;
  readonly readOnly: boolean;
  readonly start?: StartWorldBuild;
}): WorldBuilderServer {
  const { authoring, engineRoot } = options;
  const root = authoring.policy.root;
  let active: WorldBuild | null = null;

  const readManifest = async (): Promise<{ text: string; manifest: Partial<ProjectManifest> }> => {
    const text = await readFile(join(root, MANIFEST_FILE), "utf8");
    return { text, manifest: JSON.parse(text) as Partial<ProjectManifest> };
  };
  const chosen = (manifest: Partial<ProjectManifest>): string[] => (Array.isArray(manifest.contentPacks) ? [...manifest.contentPacks] : []);
  const needed = (): Promise<string[]> => packWithRequired(engineRoot, WORLD_BUILDER_PACK);
  const missingFrom = async (manifest: Partial<ProjectManifest>): Promise<string[]> => {
    const have = chosen(manifest);
    // A pack after the ones it requires, as a manifest lists them by hand.
    return (await needed()).filter((pack) => !have.includes(pack)).reverse();
  };
  const levelsFolder = (): string => `${authoring.policy.writableRoots[0] ?? "content"}/levels`;
  const served = (pack: string): boolean => authoring.readOnlyRoots.some((entry) => entry.label === `${ENGINE_LABEL_PREFIX}${CONTENT_PACKS_DIR}/${pack}`);

  const refusal = (status: number, message: string, extra: Record<string, unknown> = {}) => ({ status, body: { message, ...extra } });

  return {
    async state() {
      const { manifest } = await readManifest();
      const missing = await missingFrom(manifest);
      return {
        readOnly: options.readOnly,
        levels: levelsFolder(),
        missing,
        restarting: missing.length === 0 && !(await needed()).every(served),
        building: active !== null,
      };
    },
    async addPacks() {
      if (options.readOnly) return { ...refusal(403, READ_ONLY_MESSAGE), restart: false };
      if (active) return { ...refusal(409, "A world is being built; add the pack when it is done."), restart: false };
      const { text, manifest } = await readManifest();
      const missing = await missingFrom(manifest);
      if (missing.length > 0) {
        const result = await authoring.saves.commit({ manifest: { base: fileRevision(Buffer.from(text, "utf8")), text: withContentPacks(text, [...chosen(manifest), ...missing]) } });
        if (result.status !== "saved") return { ...refusal(409, `${MANIFEST_FILE} changed meanwhile; try again.`), restart: false };
      }
      return { status: 200, body: { added: missing }, restart: !(await needed()).every(served) };
    },
    async build(body, res) {
      const answer = ({ status, body: value }: { status: number; body: unknown }): void => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(value));
      };
      if (options.readOnly) return answer(refusal(403, READ_ONLY_MESSAGE));
      let request: RandomWorldRequest;
      try {
        request = validateRandomWorldRequest(body);
        const level = resolveWritablePath(authoring.policy, `${request.out}/${LEVEL_FILE}`);
        const brief = resolveWritablePath(authoring.policy, `${request.out}/${posix.basename(request.out)}.worldbrief.json`);
        if (active) return answer(refusal(409, "Another world is being built."));
        if (!request.force && (await exists(level.absolute) || await exists(brief.absolute))) {
          return answer(refusal(409, `${request.out} exists.`, { exists: true }));
        }
        const missing = await missingFrom((await readManifest()).manifest);
        if (missing.length > 0) return answer(refusal(409, `Add ${missing.join(", ")} to contentPacks in ${MANIFEST_FILE}.`));
      } catch (error) {
        return answer(refusal(error instanceof ProjectPathError ? 403 : 400, error instanceof Error ? error.message : String(error)));
      }
      // Two requests may have waited on the checks above together.
      if (active) return answer(refusal(409, "Another world is being built."));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.flushHeaders();
      const write = (event: RandomWorldEvent): void => {
        if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
      };
      // The last event waits for the index: the window opens the level right after it.
      let last: RandomWorldEvent | null = null;
      const build = (options.start ?? startWorldBuild)(engineRoot, root, request, (event) => {
        if (event.type === "progress") write(event);
        else last = event;
      });
      // A window closed meanwhile does not stop the build: the level is whole or not there.
      active = build;
      try {
        await build.done;
        await authoring.rescan();
      } finally {
        active = null;
        write(last ?? { type: "error", message: "The builder ended without an answer." });
        res.end();
      }
    },
    building: () => active !== null,
    dispose() {
      active?.cancel();
      active = null;
    },
  };
}
