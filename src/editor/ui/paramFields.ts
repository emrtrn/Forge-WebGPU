// The editor's parameter rules as pure functions (K7; user rules 2026-10-31).
// Adapted from Forge WebGL src/editor/paramFields.ts @ forge-webgl-final
// (04b5fb23): Forge enhanced any number input with min / max after the fact
// (a MutationObserver over the panels); here the kit builds each row from the
// schema's form field (core `formOf`), so the rules are applied where the row is
// made and these functions hold what Forge's DOM code computed:
//
// - A bounded number is a slider plus a number box; the range shows under the
//   parameter name, in the locale the number box displays.
// - Input outside the limits is never rejected: it is clamped, and a Turkish
//   warning names the range and the value applied.
// - The slider may travel a narrower span than the hard limits (schema
//   `slider`); typing still reaches the hard limits.

import type { FormRange } from "../../core/index.ts";

/** Shortest form of a limit in the page's locale (`0.05`, or `0,05` in Turkish), so range and value read alike. */
export function formatParamLimit(value: number, locale?: string): string {
  return Number(value.toPrecision(6)).toLocaleString(locale, { maximumFractionDigits: 6, useGrouping: false });
}

/** The range text under a bounded parameter's name, e.g. `0 – 1`; null unless both sides are set. */
export function paramRangeText(range: FormRange, locale?: string): string | null {
  if (range.min === null || range.max === null) return null;
  return `${formatParamLimit(range.min, locale)} – ${formatParamLimit(range.max, locale)}`;
}

/** `value` held to `range`; `clamped` tells whether it moved. Non-finite input is returned as is (the caller keeps the old value). */
export function clampParam(value: number, range: FormRange): { readonly value: number; readonly clamped: boolean } {
  if (!Number.isFinite(value)) return { value, clamped: false };
  const held = Math.min(range.max ?? Infinity, Math.max(range.min ?? -Infinity, value));
  return { value: held, clamped: held !== value };
}

/** Forge's clamp warning: `<Name> 0 – 1 aralığında olmalı; 1 uygulandı.` (or `en az` / `en fazla` for one side). */
export function clampWarning(label: string, range: FormRange, applied: number, locale?: string): string {
  const both = paramRangeText(range, locale);
  const rule = both !== null
    ? `${both} aralığında`
    : range.min !== null
      ? `en az ${formatParamLimit(range.min, locale)}`
      : `en fazla ${formatParamLimit(range.max ?? applied, locale)}`;
  return `${label.trim() || "Value"} ${rule} olmalı; ${formatParamLimit(applied, locale)} uygulandı.`;
}

/** The slider's step: the field's own step, else 1/200 of its travel (Forge). */
export function sliderStep(step: number | null, travel: { readonly min: number; readonly max: number }): number {
  if (step !== null && Number.isFinite(step) && step > 0) return step;
  return (travel.max - travel.min) / 200;
}
