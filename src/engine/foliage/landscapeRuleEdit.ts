// Plan 5c F6: the Foliage tab's rule list operations on forge.landscapeFoliage's rules (pure; the editor applies the result as one component edit, one undo step). The rule's fields are described structurally: the engine cannot import features (src/features/foliage/schema.ts owns them).

/** A rule as stored: `id` and the fields the editor reads; other fields are kept as they are. */
export interface LandscapeRuleLike {
  readonly id: string;
  readonly [field: string]: unknown;
}

/** A rule id unused in `rules`: `rule-1`, `rule-2`, … (the smallest free number). */
export function nextRuleId(rules: readonly LandscapeRuleLike[]): string {
  const usedIds = new Set(rules.map((rule) => rule.id));
  let number = 1;
  while (usedIds.has(`rule-${number}`)) number++;
  return `rule-${number}`;
}

/**
 * The list with a new rule appended: `defaults` (the schema's rule defaults, given by the caller) with `fields`
 * over them and a fresh `id` (nextRuleId). Returns the new list and the new rule's id. Never mutates its inputs.
 */
export function addRule<R extends LandscapeRuleLike>(
  rules: readonly R[],
  defaults: Readonly<Record<string, unknown>>,
  fields: Readonly<Record<string, unknown>>,
): { rules: R[]; id: string } {
  const id = nextRuleId(rules);
  const rule = structuredClone({ ...defaults, ...fields, id }) as R;
  return { rules: [...rules, rule], id };
}

/** The list without the rule `id` (unchanged copy when absent). */
export function removeRule<R extends LandscapeRuleLike>(rules: readonly R[], id: string): R[] {
  return rules.filter((rule) => rule.id !== id);
}

/** The list with rule `id` moved by `delta` places (clamped to the ends; unchanged copy when absent or delta 0). */
export function moveRule<R extends LandscapeRuleLike>(rules: readonly R[], id: string, delta: number): R[] {
  const result = [...rules];
  const index = ruleIndex(rules, id);
  if (index < 0 || !delta) return result;

  const target = Math.max(0, Math.min(rules.length - 1, index + Math.trunc(delta)));
  if (target === index) return result;

  result.splice(index, 1);
  result.splice(target, 0, rules[index]!);
  return result;
}

/** A copy of rule `id` placed right after it with a fresh id (unchanged copy when absent). Returns the new id (null when absent). */
export function duplicateRule<R extends LandscapeRuleLike>(
  rules: readonly R[],
  id: string,
): { rules: R[]; id: string | null } {
  const result = [...rules];
  const index = ruleIndex(rules, id);
  if (index < 0) return { rules: result, id: null };

  const newId = nextRuleId(rules);
  result.splice(index + 1, 0, { ...structuredClone(rules[index]!), id: newId });
  return { rules: result, id: newId };
}

/** Index of rule `id`, -1 when absent. */
export function ruleIndex(rules: readonly LandscapeRuleLike[], id: string): number {
  return rules.findIndex((rule) => rule.id === id);
}
