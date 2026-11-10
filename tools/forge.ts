// The launcher for game projects (architecture §4.8, A8):
//
//   npm run forge -- check --project <path>
//
// `check`: manifest, SDK version, generated .forge/tsconfig.json, compile,
// import boundary (tools/project/check.ts).

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, formatProblem } from "./project/check.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const [command, ...args] = process.argv.slice(2);
const project = option(args, "project");
if (command !== "check" || project === undefined) {
  console.error("Usage: npm run forge -- check --project <path>");
  process.exitCode = 1;
} else {
  const result = await checkProject(resolve(project), engineRoot);
  for (const problem of result.problems) console.error(`forge check: ${formatProblem(problem)}`);
  if (result.ok) console.log(`forge check: ${result.manifest!.name} (${result.manifest!.id}) fits SDK ${result.manifest!.sdkVersion}; compiles; imports stay in the contract.`);
  else process.exitCode = 1;
}
