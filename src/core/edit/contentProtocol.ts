// The body of `GET /__forge/content` (plan phase 4 step 6a): what the editor's
// Content Browser lists. Plain JSON, shared by the dev server (tools/server,
// which builds it from the content roots and the asset index) and the editor.
//
// - `roots`: the content roots in scan order, the project's own first, then
//   the engine's content and the selected packs (`engine:` labels, A9); a root
//   the server will not write is not `writable`.
// - `folders`: every folder under a root, empty ones too (`<label>/<path>`).
// - `files`: every file the Content Browser shows. An asset is listed by its
//   own file (a binary, not its meta file; a level by its `level.json`) with
//   its GUID and type; the parts of another asset (level cells, terrain tiles)
//   are not listed. A file the index could not identify is listed without a
//   GUID. Issues of a meta file are listed on its binary.

export interface ContentRootBody {
  /** `content`, `engine:content/engine`, `engine:content/packs/starter`. */
  readonly label: string;
  readonly writable: boolean;
}

export interface ContentIssueBody {
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface ContentFileBody {
  /** `<root label>/<path>`; what `/__forge/read?path=` takes. */
  readonly file: string;
  /** The asset's GUID; absent for a file that is no asset. */
  readonly id?: string;
  /** Asset type name (`forge.model`, `forge.level`). */
  readonly type?: string;
  /** Revision of a JSON file's bytes. */
  readonly revision?: string;
  readonly issues?: readonly ContentIssueBody[];
}

export interface ContentListingBody {
  readonly roots: readonly ContentRootBody[];
  readonly folders: readonly string[];
  readonly files: readonly ContentFileBody[];
}

/**
 * The body of `POST /__forge/content` (step 6c): one Content Browser
 * operation on `<root label>/<path>` items. `protect` names what must not
 * move or go (the level the editor has open).
 */
export type ContentOpBody =
  | { readonly op: "move"; readonly items: readonly string[]; readonly to: string; readonly protect?: readonly string[] }
  | { readonly op: "rename"; readonly item: string; readonly name: string; readonly protect?: readonly string[] }
  | { readonly op: "copy"; readonly items: readonly string[]; readonly to: string }
  | { readonly op: "delete"; readonly items: readonly string[]; readonly protect?: readonly string[] }
  | { readonly op: "mkdir"; readonly path: string };

/** A file that still refers to what an operation would move away or delete. */
export interface ContentReferrerBody {
  /** `<root label>/<path>` of the file that refers. */
  readonly file: string;
  /** The referring asset's GUID, when it is one. */
  readonly id?: string;
  /** What it refers to (a GUID, or a file it names by path). */
  readonly target: string;
}

export type ContentOpResponseBody =
  | { readonly status: "done"; readonly result: readonly string[] }
  | { readonly status: "refused"; readonly reason: string; readonly message: string; readonly referrers?: readonly ContentReferrerBody[] };
