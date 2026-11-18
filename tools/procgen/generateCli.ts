// `npm run forge -- generate (--project <path> | --pack <id>) --recipe <file> [--force] [--dry-run] [--json]`
// (vegetation plan PG1, §9): runs the recipe's generator and writes its
// output beside it (tools/procgen/generate.ts). Short output: the files with
// their status, the counts, budget warnings. `--pack` writes into an engine
// content pack (the starter presets, PK6) from the engine repo.

import { resolve } from "node:path";
import { generateFromRecipe, type GenerateOptions } from "./generate.ts";

export const GENERATE_USAGE = "Usage: npm run forge -- generate (--project <path> | --pack <id>) --recipe <file> [--force] [--dry-run] [--json]";

export function parseGenerateArgs(args: readonly string[], engineRoot: string): GenerateOptions & { json: boolean } {
  let projectRoot: string | undefined, pack: string | undefined, recipe: string | undefined;
  let force = false, dryRun = false, json = false;
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at]!;
    if (word === "--force") force = true;
    else if (word === "--dry-run") dryRun = true;
    else if (word === "--json") json = true;
    else if (word === "--project") projectRoot = args[(at += 1)];
    else if (word === "--pack") pack = args[(at += 1)];
    else if (word === "--recipe") recipe = args[(at += 1)];
    else throw new Error(`Unknown option: ${word}`);
  }
  if (!recipe || (projectRoot === undefined) === (pack === undefined)) throw new Error(GENERATE_USAGE);
  return { engineRoot, ...(projectRoot !== undefined ? { projectRoot: resolve(projectRoot) } : {}), ...(pack !== undefined ? { pack } : {}), recipe, force, dryRun, json };
}

export async function generateMain(args: readonly string[], engineRoot: string): Promise<number> {
  let options;
  try {
    options = parseGenerateArgs(args, engineRoot);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  try {
    const result = await generateFromRecipe(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    console.log(`${result.recipe}: ${result.generator} v${result.generatorVersion}${options.dryRun ? " (dry run)" : ""}, ${result.milliseconds} ms`);
    for (const line of result.stats) console.log(`  ${line}`);
    for (const file of result.files) if (file.status !== "unchanged") console.log(`  ${file.status} ${file.path}`);
    const unchanged = result.files.filter((file) => file.status === "unchanged").length;
    if (unchanged > 0) console.log(`  ${unchanged} unchanged`);
    for (const path of result.removed) console.log(`  removed ${path}`);
    for (const warning of result.warnings) console.warn(`  warning: ${warning}`);
    return 0;
  } catch (error) {
    console.error(`forge generate: ${(error as Error).message}`);
    return 1;
  }
}
