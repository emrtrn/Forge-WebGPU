// The body of `POST /__forge/save` and its answer (architecture §4.6). Plain
// JSON, shared by the editor (which builds requests) and the dev server
// (`tools/server`, which answers them).

export interface SaveRequestBody {
  readonly writes: readonly {
    readonly path: string;
    /** Revision the author read; null for a file that must not exist yet. */
    readonly base: string | null;
    readonly text?: string;
    /** Id from `/__forge/stage-binary`. */
    readonly staged?: string;
  }[];
  readonly deletes: readonly { readonly path: string; readonly base: string }[];
}

export interface SaveIssueBody {
  readonly file: string;
  readonly path: string;
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export type SaveResponseBody =
  | {
      readonly status: "saved";
      /** Every file changed, the server-written level indexes included; null revision = deleted. */
      readonly files: readonly { readonly path: string; readonly revision: string | null }[];
      readonly warnings: readonly SaveIssueBody[];
    }
  | {
      readonly status: "conflict";
      readonly conflicts: readonly { readonly path: string; readonly base: string | null; readonly current: string | null }[];
    }
  | {
      readonly status: "rejected";
      readonly reason: string;
      readonly issues?: readonly SaveIssueBody[];
      readonly message?: string;
    };

/** The HTTP header every `/__forge/` request carries. */
export const FORGE_REQUEST_HEADER = "X-Forge-Request";

/** What `GET /__forge/identity` answers: which engine and which project the server serves (D14). */
export interface ForgeIdentity {
  readonly engine: { readonly sdkVersion: string };
  readonly project: {
    /** Absolute path of the project root on the serving machine. */
    readonly root: string;
    readonly id: string | null;
    readonly name: string | null;
    readonly sdkVersion: string | null;
    /** Project-relative level folder to open; "" for none. */
    readonly startLevel: string;
    /** Saves are refused (the engine's samples and fixtures). */
    readonly readOnly: boolean;
    /** Why the project cannot open (manifest, SDK version, game module); empty when it can. */
    readonly problems: readonly string[];
  };
}
