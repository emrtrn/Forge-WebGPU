// Compare the written values, not just singleton counts. A missing/defaulted
// surface or a lost level wind must make --compare fail even if actors match.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isJsonObject, type JsonObject } from "../../src/core/index.ts";
import { normalizeWorldEnvironment, resolveWorldEnvironment } from "../../src/engine/environment/worldEnvironment.ts";
import { normalizeLayoutWind, resolveWind } from "../../src/engine/environment/wind.ts";
import { SURFACE_RATES } from "../../src/engine/environment/surfaceAccumulation.ts";
import type { CountRow } from "./compare.ts";
import type { ForgeSource } from "./forgeSource.ts";

export async function compareEnvironment(source: ForgeSource, sourcePath: string, project: string, folder: string): Promise<CountRow[]> {
  const raw = await source.readJson(sourcePath);
  const old = isJsonObject(raw) ? raw : {};
  const target = JSON.parse(await readFile(join(project, folder, "level.json"), "utf8")) as JsonObject;
  const settings = isJsonObject(old.worldSettings) ? old.worldSettings : {};
  const base = resolveWind(undefined, normalizeLayoutWind(settings.wind, "wind", []), null);
  const baseValues = { directionDeg: base.directionDeg, strength: base.strength, gust: base.gust };
  const targetSettings = isJsonObject(target.settings) ? target.settings : {};
  const same = (expected: Record<string, unknown>, actual: unknown): boolean => isJsonObject(actual)
    && Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
  const row = (what: string, equal: boolean): CountRow => ({ what, source: 1, target: equal ? 1 : 0, note: equal ? "" : "? written values differ" });
  const rows = [row("level wind values (direction / strength / gust)", same(baseValues, targetSettings.wind))];
  if (!isJsonObject(old.worldEnvironment)) return rows;
  const wes = old.worldEnvironment;
  let targetWes: JsonObject | null = null;
  for (const actor of Array.isArray(target.actors) ? target.actors : []) {
    if (!isJsonObject(actor) || !isJsonObject(actor.components)) continue;
    for (const component of Object.values(actor.components)) {
      if (isJsonObject(component) && component.type === "forge.worldEnvironment@3") targetWes = component;
    }
  }
  const env = resolveWorldEnvironment(normalizeWorldEnvironment(wes).environment);
  const s = env.surface;
  rows.push(row("WES surface values (cover / masks / simulation rates)", same({
    snowCoverage: s.snowCoverage, wetness: s.wetness, snowColor: s.snowColor,
    snowSlopeStartDeg: s.snowSlopeStartDeg, snowSlopeEndDeg: s.snowSlopeEndDeg,
    snowAltitudeEnabled: s.snowMinAltitude !== null, snowMinAltitude: s.snowMinAltitude ?? 0,
    snowAltitudeBlend: s.snowAltitudeBlend, ...SURFACE_RATES,
  }, targetWes?.surface)));
  const authored = normalizeLayoutWind(wes.wind, "wind", []);
  const wind = resolveWind(authored, baseValues, null);
  rows.push(row("WES wind values (field priority before weather / season)", same({
    useLevelWind: !authored || Object.keys(authored).length === 0,
    directionDeg: wind.directionDeg, strength: wind.strength, gust: wind.gust,
  }, targetWes?.wind)));
  return rows;
}
