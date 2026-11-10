// The game project manifest, `forge.project.json` (architecture §4.8; project
// contract decision 1A). A game project is a repository of its own: this file
// at its root tells the engine who it is, which SDK it was written against,
// where its content is, which engine content packs it uses, which level to
// open and which module is its game.
//
// Loading and saving both call `normalizeProjectManifest`, like every other
// document. The fields are a field map, so the form and the JSON Schema come
// from the same definition.

import { isJsonObject } from "../json.ts";
import { array, num, object, text, type FieldValues } from "../schema/fields.ts";
import {
  createContext,
  finish,
  reportFatal,
  reportLoss,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import { normalizeFieldMap } from "../schema/normalize.ts";

export const PROJECT_SCHEMA = "forge.project/1";
export const PROJECT_FILE = "forge.project.json";

/** A project id: lower case, the namespace of its components (`ridgebound.contract`). */
export const PROJECT_ID_PATTERN = /^[a-z][a-z0-9]*$/;

/** A content pack id: the folder name under the engine's `content/packs/` (A9). */
export const CONTENT_PACK_ID_PATTERN = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";

/** A project-relative path: forward slashes, no `..`, no drive, not absolute. */
export const PROJECT_PATH_PATTERN = "^(?!.*(?:^|/)\\.\\.(?:/|$))[A-Za-z0-9_][A-Za-z0-9_./-]*$";

/** `<major>.<minor>`: the SDK a project is written against. */
export const SDK_VERSION_PATTERN = "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$";

export const ProjectManifestFields = {
  name: text({ required: true, hint: "Projenin görünen adı." }),
  sdkVersion: text({
    required: true,
    pattern: SDK_VERSION_PATTERN,
    label: "SDK Version",
    hint: "Projenin yazıldığı @forge/sdk sürümü, <ana>.<ara> (ör. 0.1). Uyumsuz sürümle proje açılmaz.",
  }),
  contentRoots: array(text({ pattern: PROJECT_PATH_PATTERN }), {
    default: ["content"],
    hint: "Projenin içerik kökleri, projeye göre. Asset dizini ve kayıt servisi bunları görür.",
  }),
  contentPacks: array(text({ pattern: CONTENT_PACK_ID_PATTERN }), {
    label: "Content Packs",
    hint: "Motorun content/packs/ altından seçilen içerik paketleri (ör. starter). İçerik oyuna kopyalanmaz, motordan okunur; salt okunurdur.",
  }),
  startLevel: text({
    pattern: PROJECT_PATH_PATTERN,
    hint: "Açılışta yüklenen level klasörü, projeye göre (ör. content/levels/main). Boşsa açılacak level yok.",
  }),
  game: object(
    {
      module: text({
        pattern: PROJECT_PATH_PATTERN,
        hint: "Oyun modülü, projeye göre (ör. src/game.ts). defineGameModule(...) dışa aktarır. Boşsa yalnız motor özellikleri çalışır.",
      }),
    },
    { hint: "Oyunun kodu." },
  ),
  devPort: num({
    min: 1024,
    max: 65535,
    step: 1,
    default: 5190,
    label: "Dev Port",
    hint: "Başlatıcının bu proje için açtığı dev server portu. Her proje kendi portunda çalışır.",
  }),
};

export type ProjectManifestData = FieldValues<typeof ProjectManifestFields>;

export interface ProjectManifest extends ProjectManifestData {
  schema: typeof PROJECT_SCHEMA;
  id: string;
}

const KEYS = ["schema", "id", ...Object.keys(ProjectManifestFields)];

/** Null when the file cannot be read as a manifest at all. */
export function normalizeProjectManifest(raw: unknown, options: NormalizeOptions): NormalizeResult<ProjectManifest | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "A project manifest must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== PROJECT_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${PROJECT_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (typeof raw.id !== "string" || !PROJECT_ID_PATTERN.test(raw.id)) {
    reportFatal(ctx, "invalid-document", "id", "A project needs an id: lower case letters and digits, starting with a letter.");
    return finish(ctx, null);
  }
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(ProjectManifestFields)) if (raw[key] !== undefined) fields[key] = raw[key];
  const data = normalizeFieldMap(ProjectManifestFields, fields as never, "", ctx) as ProjectManifestData;
  if (data.contentRoots.length === 0) {
    reportLoss(ctx, "invalid-value", "contentRoots", "A project has at least one content root; content used.");
    data.contentRoots = ["content"];
  }
  // An invalid id is already reported and normalised to ""; it names no pack.
  const named = data.contentPacks.filter((pack) => pack !== "");
  const packs = [...new Set(named)];
  if (packs.length !== named.length) {
    reportLoss(ctx, "invalid-value", "contentPacks", "A content pack is listed twice; listed once.");
  }
  data.contentPacks = packs;
  for (const key of Object.keys(raw)) {
    if (!KEYS.includes(key)) reportLoss(ctx, "unknown-field", key, "A project manifest has no such field; dropped.");
  }
  return finish(ctx, { schema: PROJECT_SCHEMA, id: raw.id, ...data });
}

export interface SdkVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** `0.1` or `0.1.3`; null when it is neither. */
export function parseSdkVersion(value: string): SdkVersion | null {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) };
}

/**
 * Whether a project written against `project` opens on an engine whose SDK is
 * `engine` (A8). Before 1.0 every minor version may break, so it must match;
 * from 1.0 on the major must match and the engine's minor must be at least the
 * project's. Patch versions never matter.
 */
export function checkSdkCompatibility(engine: string, project: string): { readonly ok: boolean; readonly reason: string } {
  const e = parseSdkVersion(engine);
  const p = parseSdkVersion(project);
  if (!e || !p) return { ok: false, reason: `Not an SDK version: ${!e ? engine : project}.` };
  if (e.major !== p.major) {
    return { ok: false, reason: `The project is written for SDK ${p.major}.x; this engine has ${e.major}.${e.minor}.` };
  }
  if (e.major === 0 && e.minor !== p.minor) {
    return { ok: false, reason: `Before 1.0 every minor version may break: the project needs SDK 0.${p.minor}, this engine has 0.${e.minor}.` };
  }
  if (e.minor < p.minor) {
    return { ok: false, reason: `The project needs SDK ${p.major}.${p.minor} or later; this engine has ${e.major}.${e.minor}.` };
  }
  return { ok: true, reason: "" };
}
