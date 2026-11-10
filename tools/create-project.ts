// npm run create-project -- <target> --id <id> [--name <name>] [--register]
// See tools/project/create.ts.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProject } from "./project/create.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const target = args[0];
const id = option("id");
if (target === undefined || target.startsWith("--") || id === undefined) {
  console.error("Usage: npm run create-project -- <target folder> --id <id> [--name <name>] [--register]");
  process.exitCode = 1;
} else {
  const name = option("name");
  try {
    const created = await createProject({
      engineRoot,
      target,
      id,
      ...(name !== undefined ? { name } : {}),
      register: args.includes("--register"),
    });
    console.log(`create-project: ${created.root}\n  open it:  npm run forge -- dev --project "${created.root}"\n  check it: npm run forge -- check --project "${created.root}"`);
  } catch (error) {
    console.error(`create-project: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
