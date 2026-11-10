// What normalisation reports (architecture §4.5, A2).
//
// Normalisation never throws on data. It returns the best value it can build
// plus a list of issues; `ok` is false when any issue is an error, and the
// caller then refuses the load or the save.
//
// Two kinds of issue:
// - loss: data could not be kept (unknown field, wrong type, unknown component
//   type...). An error under `strict` (development, editor, tools), a warning
//   otherwise (production build: reported, the game keeps running).
// - adjustment: the value was pulled to a limit. Always a warning.
//
// Core does not know which environment it runs in; the caller passes `strict`.

export type IssueCode =
  | "unknown-field"
  | "invalid-value"
  | "clamped"
  | "unknown-component-type"
  | "unsupported-version"
  | "migration-failed";

export type IssueSeverity = "error" | "warning";

export interface Issue {
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  /** Where in the document, e.g. `actors[3].components.fog.density`. */
  readonly path: string;
  readonly message: string;
}

export interface NormalizeOptions {
  /** True in development, in the editor and in tools: data loss is an error. */
  readonly strict: boolean;
}

export interface NormalizeResult<T> {
  readonly value: T;
  readonly issues: readonly Issue[];
  /** False when an issue is an error: the load or the save must be refused. */
  readonly ok: boolean;
}

export interface NormalizeContext {
  readonly strict: boolean;
  readonly issues: Issue[];
}

export function createContext(options: NormalizeOptions): NormalizeContext {
  return { strict: options.strict, issues: [] };
}

/** Data could not be kept: error under `strict`, warning otherwise. */
export function reportLoss(ctx: NormalizeContext, code: IssueCode, path: string, message: string): void {
  ctx.issues.push({ code, severity: ctx.strict ? "error" : "warning", path, message });
}

/** A value was adjusted but nothing was lost: always a warning. */
export function reportAdjustment(
  ctx: NormalizeContext,
  code: IssueCode,
  path: string,
  message: string,
): void {
  ctx.issues.push({ code, severity: "warning", path, message });
}

export function finish<T>(ctx: NormalizeContext, value: T): NormalizeResult<T> {
  return {
    value,
    issues: ctx.issues,
    ok: ctx.issues.every((issue) => issue.severity !== "error"),
  };
}

export function childPath(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

export function indexPath(path: string, index: number): string {
  return `${path}[${index}]`;
}
