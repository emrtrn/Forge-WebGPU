// `npm run forge -- edit --project <path> --level <folder> [--json] <command …>`
// and `… edit --project <path> --level <folder> [--json] -` (commands from
// stdin, one per line, one save). See args.ts for the commands.

import { readFileSync } from "node:fs";
import { COMMAND_USAGE, CommandError, parseBatch, parseCommand, type Command } from "./args.ts";
import { formatJson, formatText } from "./format.ts";
import { EXIT_ERROR, runEdit } from "./run.ts";

export const EDIT_USAGE = [
  "Usage: npm run forge -- edit --project <path> --level <level folder> [--json] <command>",
  "       npm run forge -- edit --project <path> --level <level folder> [--json] -   (commands from stdin, one per line, one save)",
  "Commands:",
  ...COMMAND_USAGE.map((line) => `  ${line}`),
].join("\n");

export async function editMain(args: readonly string[], engineRoot: string, stdin: () => string = () => readFileSync(0, "utf8")): Promise<number> {
  let project: string | undefined;
  let level: string | undefined;
  let json = false;
  let at = 0;
  for (; at < args.length; at += 1) {
    const word = args[at]!;
    if (word === "--json") json = true;
    else if (word === "--project") project = args[(at += 1)];
    else if (word === "--level") level = args[(at += 1)];
    else break;
  }
  const rest = args.slice(at);
  if (project === undefined || level === undefined || rest.length === 0) {
    console.error(EDIT_USAGE);
    return EXIT_ERROR;
  }
  let commands: Command[];
  try {
    commands = rest.length === 1 && rest[0] === "-" ? parseBatch(stdin()).map((entry) => entry.command) : [parseCommand(rest)];
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    if (json) console.log(JSON.stringify({ ok: false, level, results: [], files: [], warnings: [], error: { code: "usage", message: error.message } }));
    else console.error(`error (usage): ${error.message}`);
    return EXIT_ERROR;
  }
  if (commands.length === 0) {
    console.error("No commands on stdin.");
    return EXIT_ERROR;
  }
  const result = await runEdit({ engineRoot, project, level, commands });
  const text = json ? formatJson(result) : formatText(result);
  if (result.ok || json) console.log(text);
  else console.error(text);
  return result.exitCode;
}
