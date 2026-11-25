// The World Builder window's requests (tools/server/worldBuilder.ts). Only
// editor code references the development build endpoints.

import { FORGE_REQUEST_HEADER } from "../../core/index.ts";
import { parseRandomWorldEvent, type RandomWorldDone, type RandomWorldRequestChoices } from "../../engine/worldbuilder/randomWorldChoices.ts";
import type { WorldBuildStep } from "../../engine/worldbuilder/worldBrief.ts";

/** `GET /__forge/world-builder`. */
export interface WorldBuilderState {
  readonly readOnly: boolean;
  readonly missing: readonly string[];
  readonly restarting: boolean;
  readonly building: boolean;
}

export interface WorldBuilderClient {
  state(): Promise<WorldBuilderState>;
  /** Adds the missing packs to the manifest; the dev server restarts. */
  addPacks(): Promise<void>;
  /** Builds the world; rejects with the server's or the builder's message. */
  build(request: { readonly out: string; readonly force: boolean; readonly world: RandomWorldRequestChoices }, progress: (step: WorldBuildStep) => void): Promise<RandomWorldDone>;
}

/** Reads a build's event lines until `done` (returned) or `error` (thrown). */
export async function readWorldBuild(stream: ReadableStream<Uint8Array>, progress: (step: WorldBuildStep) => void): Promise<RandomWorldDone> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const line of lines) {
      const event = parseRandomWorldEvent(line);
      if (event?.type === "progress") progress(event.step);
      else if (event?.type === "error") throw new Error(event.message);
      else if (event?.type === "done") return event;
    }
    if (done) throw new Error("The server closed the connection before the build finished.");
  }
}

export function createWorldBuilderClient(request: typeof fetch = (input, init) => fetch(input, init)): WorldBuilderClient {
  const headers = { [FORGE_REQUEST_HEADER]: "1", "Content-Type": "application/json" };
  const refused = async (response: Response): Promise<Error> => {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return new Error(body?.message ?? `${response.status} ${response.statusText}`);
  };
  return {
    async state() {
      const response = await request("/__forge/world-builder", { headers });
      if (!response.ok) throw await refused(response);
      return (await response.json()) as WorldBuilderState;
    },
    async addPacks() {
      const response = await request("/__forge/world-builder/pack", { method: "POST", headers, body: "{}" });
      if (!response.ok) throw await refused(response);
    },
    async build(body, progress) {
      const response = await request("/__forge/world-random", { method: "POST", headers, body: JSON.stringify(body) });
      if (!response.ok || !response.body) throw await refused(response);
      return readWorldBuild(response.body, progress);
    },
  };
}
