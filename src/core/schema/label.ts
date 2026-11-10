// English display names derived from identifiers. Parameter names in the
// editor are always English; a definition overrides the derived name with
// `label` when the identifier does not read well.

/** `heightFalloff` -> `Height Falloff`. */
export function labelFromKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `forge.heightFog` -> `Height Fog`. */
export function labelFromComponentName(name: string): string {
  return labelFromKey(name.slice(name.lastIndexOf(".") + 1));
}
