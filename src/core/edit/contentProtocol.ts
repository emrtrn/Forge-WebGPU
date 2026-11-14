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
