// Ported from Forge WebGL engine/ui/uiTheme.ts (tokens; applying to an element is src/runtime/ui/uiDom.ts) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * UI theme tokens (UMG Lite).
 *
 * A `*.theme.json` asset is a flat token table (`color.surface`, `space.md`,
 * `radius.lg`, ...). At runtime the tokens become CSS custom properties on the
 * widget's root element (`--forge-ui-<dashed-token>`), and widget props
 * reference them with a `$token` string (resolved in `uiRenderer.ts`). This
 * keeps styling out of inline CSS and lets one screen be re-skinned without
 * touching its widget tree.
 *
 * Pure data model + a thin DOM applier. No Three.
 */
export type UiTokenValue = string | number;

export interface UiThemeDef {
  schema: 1;
  type: "uiTheme";
  name: string;
  /** Flat token table; numbers are treated as px lengths, strings pass through. */
  tokens: Record<string, UiTokenValue>;
}

export function defaultUiThemeDef(name: string): UiThemeDef {
  return { schema: 1, type: "uiTheme", name, tokens: {} };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Defensively coerces arbitrary JSON into a valid {@link UiThemeDef}. */
export function normalizeUiThemeDef(value: unknown, fallbackName = "Theme"): UiThemeDef {
  const input = isPlainObject(value) ? value : {};
  const name = typeof input.name === "string" && input.name.length > 0 ? input.name : fallbackName;
  const tokens: Record<string, UiTokenValue> = {};
  if (isPlainObject(input.tokens)) {
    for (const [key, raw] of Object.entries(input.tokens)) {
      if (typeof raw === "string") tokens[key] = raw;
      else if (typeof raw === "number" && Number.isFinite(raw)) tokens[key] = raw;
    }
  }
  return { schema: 1, type: "uiTheme", name, tokens };
}

/** Token name → CSS custom property: `color.surface` → `--forge-ui-color-surface`. */
export function tokenToCssVar(token: string): string {
  return `--forge-ui-${token.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Resolves a theme's tokens to a `{ "--forge-ui-x": "value" }` CSS-variable map. */
export function themeToCssVariables(theme: UiThemeDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, value] of Object.entries(theme.tokens)) {
    out[tokenToCssVar(token)] = typeof value === "number" ? `${value}px` : value;
  }
  return out;
}
