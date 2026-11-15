// The editor's save client without a dev server (architecture §4.11, phase 4
// decision 4; plan step 9b): `npm run forge -- edit` reads and saves a
// project through the same authoring module the dev server answers from
// (authoring.ts): the same readable roots, document check, journal, lock and
// revisions. Core's level reader and saver (`openLevelFromServer`,
// `saveLevelSession`) run on it unchanged, so a command writes the canonical
// files the editor writes.
//
// Binary uploads and play sessions are the editor's; a command has neither.

import { SaveClientError, type ForgeIdentity, type SaveClient, type SaveResponseBody } from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import type { Authoring } from "../server/authoring.ts";
import { ProjectPathError } from "../server/projectPaths.ts";

export function createLocalSaveClient(authoring: Authoring, identity: ForgeIdentity): SaveClient {
  const unsupported = (what: string) => async (): Promise<never> => {
    throw new SaveClientError(501, `${what} is the editor's; an edit command has none.`);
  };
  return {
    async read(path) {
      let bytes: Buffer | null;
      try {
        bytes = await authoring.read(path);
      } catch (error) {
        if (error instanceof ProjectPathError) throw new SaveClientError(403, error.message);
        throw error;
      }
      return bytes === null ? null : { text: bytes.toString("utf8"), revision: fileRevision(bytes) };
    },
    async save(request) {
      return (await authoring.save(request)).body as SaveResponseBody;
    },
    identity: async () => identity,
    classes: async () => authoring.classes.all(),
    stageBinary: unsupported("A binary upload"),
    play: unsupported("A play session"),
    playSession: unsupported("A play session"),
  };
}
