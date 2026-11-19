import { stableHex } from "../forgeImport/ids.ts";

export function generatedOutputId(recipe: string, role: string): string {
  return `ast_${stableHex(`procgen/${recipe}/${role}`)}`;
}

export function srgbTriple(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
