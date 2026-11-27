import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SDK_VERSION, isJsonObject } from "../../src/core/index.ts";

const FILE = "build-record.json";
const SCHEMA = "forge.buildRecord/1";

interface BuildFile {
  readonly bytes: number;
  readonly sha256: string;
}

export interface BuildRecord {
  readonly schema: typeof SCHEMA;
  readonly project: string;
  readonly sdkVersion: string;
  readonly base: string;
  readonly files: Readonly<Record<string, BuildFile>>;
}

async function fingerprint(path: string): Promise<BuildFile> {
  let bytes = 0;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Buffer;
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function filesOf(folder: string): Promise<Record<string, BuildFile>> {
  const files: Record<string, BuildFile> = Object.create(null) as Record<string, BuildFile>;
  const walk = async (key: string): Promise<void> => {
    const entries = await readdir(join(folder, key), { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const name = key ? `${key}/${entry.name}` : entry.name;
      if (name === FILE) continue;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files[name] = await fingerprint(join(folder, name));
      else throw new Error(`Cannot record an output link or special file: ${name}`);
    }
  };
  await walk("");
  return files;
}

export async function recordBuild(folder: string, project: string, base: string): Promise<BuildRecord> {
  const files = await filesOf(folder);
  if (!files["index.html"] || !files["forge/identity.json"]) throw new Error("Build must contain the application and static project content.");
  return { schema: SCHEMA, project, sdkVersion: SDK_VERSION, base, files };
}

export async function verifyBuild(folder: string): Promise<readonly string[]> {
  const stored: unknown = JSON.parse(await readFile(join(folder, FILE), "utf8"));
  if (!isJsonObject(stored) || stored.schema !== SCHEMA || !isJsonObject(stored.files) ||
      typeof stored.project !== "string" || typeof stored.sdkVersion !== "string" || typeof stored.base !== "string") {
    throw new Error(`Invalid ${FILE}.`);
  }
  if (!Object.hasOwn(stored.files, "index.html") || !Object.hasOwn(stored.files, "forge/identity.json")) {
    throw new Error(`${FILE} does not list an application and its static project content.`);
  }
  const actual = await filesOf(folder);
  const issues: string[] = [];
  for (const [name, expected] of Object.entries(stored.files)) {
    const file = actual[name];
    if (!isJsonObject(expected) || typeof expected.bytes !== "number" ||
        typeof expected.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(expected.sha256)) {
      issues.push(`Invalid record: ${name}`);
    } else if (!file) issues.push(`Missing: ${name}`);
    else if (file.bytes !== expected.bytes || file.sha256 !== expected.sha256) issues.push(`Modified: ${name}`);
  }
  for (const name of Object.keys(actual)) if (!Object.hasOwn(stored.files, name)) issues.push(`Unrecorded: ${name}`);
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error("Usage: npm run verify:build -- <build folder>");
    const folder = resolve(process.argv[2]);
    const issues = await verifyBuild(folder);
    for (const issue of issues) console.error(`verify:build: ${issue}`);
    if (issues.length) process.exitCode = 1;
    else console.log(`verify:build: ${folder} matches its build record.`);
  } catch (error) {
    console.error(`verify:build: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
