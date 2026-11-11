// Ported from Forge WebGL engine/ui/uiLocale.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * UI localization (UMG FText / string-table analogue).
 *
 * A `*.loc.json` asset is one locale's string table:
 * `{ schema:1, type:"uiLoc", locale, strings: { key: text } }`. A Text/Button
 * widget references a string by a typed {@link UiTextKey} (`{ key, params? }`) —
 * the sibling of `{ bind }` — and the active locale's table resolves it at render
 * time. Params are a flat `{ name: value }` map substituted into `{name}`
 * placeholders; there is no expression evaluation, by design.
 *
 * {@link LocaleRegistry} holds every loaded table, tracks the active locale and
 * notifies subscribers when it changes, so mounted widgets can re-resolve their
 * text on a locale switch (the same event-driven pattern as the ViewModel store).
 *
 * Pure module: no DOM, no Three. The runtime loader, the renderer/binding glue
 * and (future) tooling all reuse {@link normalizeUiLocaleTable}, so a malformed
 * file can never crash a load.
 */

export interface UiLocaleTable {
  schema: 1;
  type: "uiLoc";
  /** BCP-47-ish locale id (`en`, `tr`, `pt-BR`); the registry key. */
  locale: string;
  /** Flat `key → text` table. Non-string entries are dropped on normalize. */
  strings: Record<string, string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultUiLocaleTable(locale: string): UiLocaleTable {
  return { schema: 1, type: "uiLoc", locale, strings: {} };
}

/** Defensively coerces arbitrary JSON into a valid {@link UiLocaleTable}. */
export function normalizeUiLocaleTable(value: unknown, fallbackLocale = "en"): UiLocaleTable {
  const input = isPlainObject(value) ? value : {};
  const locale =
    typeof input.locale === "string" && input.locale.length > 0 ? input.locale : fallbackLocale;
  const strings: Record<string, string> = {};
  if (isPlainObject(input.strings)) {
    for (const [key, raw] of Object.entries(input.strings)) {
      if (typeof raw === "string") strings[key] = raw;
    }
  }
  return { schema: 1, type: "uiLoc", locale, strings };
}

/**
 * Substitutes `{name}` placeholders in `template` with `params[name]`. Unknown
 * placeholders are left untouched (a missing param stays visible rather than
 * silently blanking). Pure string replace — no expression evaluation.
 */
export function applyLocParams(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return typeof value === "string" ? value : match;
  });
}

/**
 * Holds the loaded locale tables, the active locale and locale-change listeners.
 * The first registered locale becomes active; {@link setActiveLocale} switches it
 * and notifies subscribers so mounted widgets re-resolve their localized text.
 */
export class LocaleRegistry {
  private readonly tables = new Map<string, UiLocaleTable>();
  private active: string | null = null;
  private readonly listeners = new Set<() => void>();

  /** Registers (or replaces) a locale's table; the first one registered is the default active. */
  register(table: UiLocaleTable): void {
    this.tables.set(table.locale, table);
    if (this.active === null) this.active = table.locale;
  }

  /** The active locale, or null when no table has been registered. */
  get activeLocale(): string | null {
    return this.active;
  }

  /** Registered locales, in insertion order. */
  availableLocales(): string[] {
    return [...this.tables.keys()];
  }

  /**
   * Switches the active locale and notifies subscribers. A no-op when the locale
   * is already active or unknown — an unknown id keeps the current locale so the
   * UI never blanks out.
   */
  setActiveLocale(locale: string): void {
    if (locale === this.active || !this.tables.has(locale)) return;
    this.active = locale;
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * Resolves `key` against the active locale's table, substituting `params`.
   * Falls back to `fallback` (when given) else the key itself, so a missing
   * string is visible during authoring rather than blank.
   */
  resolve(key: string, params?: Record<string, string>, fallback?: string): string {
    const table = this.active ? this.tables.get(this.active) : undefined;
    const template = table?.strings[key];
    if (template === undefined) return fallback ?? key;
    return applyLocParams(template, params);
  }

  /**
   * Like {@link resolve} but returns `undefined` when the active locale's table
   * has no entry for `key`, so callers that need a real fallback (e.g. dialogue
   * subtitle localization) can tell "missing" apart from "resolved to the key".
   */
  resolveOptional(key: string, params?: Record<string, string>): string | undefined {
    const table = this.active ? this.tables.get(this.active) : undefined;
    const template = table?.strings[key];
    if (template === undefined) return undefined;
    return applyLocParams(template, params);
  }

  /** Subscribes to active-locale changes; returns an unsubscribe handle. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
