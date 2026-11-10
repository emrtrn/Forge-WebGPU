// `npm run sdk:snapshot` writes the SDK API snapshot and prints its hash;
// `npm run verify:sdk-api` (in the gate) checks the snapshot and the
// changelog's `API:` line against the sources. See tools/sdk/apiSnapshot.ts.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANGELOG_PATH, changelogApiHash, createApiSnapshot, SDK_ENTRIES, SNAPSHOT_PATH, snapshotHash } from "./sdk/apiSnapshot.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..").replaceAll("\\", "/");
const command = process.argv[2];
const snapshot = createApiSnapshot(root, SDK_ENTRIES);
const hash = snapshotHash(snapshot);

if (command === "write") {
  await writeFile(join(root, SNAPSHOT_PATH), snapshot);
  console.log(`sdk:snapshot: ${SNAPSHOT_PATH} written. Put this line in the newest entry of ${CHANGELOG_PATH}:\nAPI: ${hash}`);
} else if (command === "verify") {
  const problems: string[] = [];
  let committed = "";
  try {
    committed = await readFile(join(root, SNAPSHOT_PATH), "utf8");
  } catch {
    problems.push(`${SNAPSHOT_PATH} is missing.`);
  }
  if (committed !== "" && committed.replaceAll("\r\n", "\n") !== snapshot) {
    problems.push(`The SDK surface changed: ${SNAPSHOT_PATH} is not what the sources give. Run npm run sdk:snapshot and review the diff.`);
  }
  const listed = changelogApiHash(await readFile(join(root, CHANGELOG_PATH), "utf8"));
  if (listed !== hash) {
    problems.push(`The newest entry of ${CHANGELOG_PATH} must say "API: ${hash}" (it says ${listed === null ? "nothing" : listed}). Describe the change there.`);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`verify:sdk-api: ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`verify:sdk-api: SDK surface unchanged (API ${hash}).`);
  }
} else {
  console.error("Usage: node tools/sdk-api.ts <write|verify>");
  process.exitCode = 1;
}
