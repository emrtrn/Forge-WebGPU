/**
 * Porting toolkit for Forge WebGL → Forge WebGPU (plan Faz 2b). The workflow is
 * in docs/PORT_LOG.md §2 ("Taşıma kalıbı").
 *
 *   npm run port:forge -- tests <areaRegex> --forge <dir> [--write] [--why <line,line>]
 *       Ports the A checks (docs/port/forge-engine-tests.tsv) in those areas whose
 *       every import is ported; without --write, reports what blocks the rest.
 *       Rerun `npm run port:forge-tests` afterwards to refresh the counts.
 *   npm run port:forge -- closure <stopRegex> <forgeFile...> --forge <dir>
 *       Import closure (type imports included) of Forge files, stopping at modules
 *       matching the regex and listing them per file: the scope of a port.
 *   npm run port:forge -- subset <forgeFile> <name,name> --forge <dir> [--out <repoPath>]
 *       The declarations those names need from a Forge file (transitively), with
 *       narrowed imports: for taking part of a large old-model file.
 *   npm run port:forge -- members <forgeFile> --forge <dir>
 *       Top-level declarations and class members with line counts and the fields
 *       each method touches: for planning a split of a file over the budget.
 *
 * The transforms (import rewrite, parameter properties, port note) are in
 * tools/port/portFiles.ts for one-off port scripts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CheckPorter } from "./port/portChecks.ts";
import { declaredName, portNote, subsetDeclarations } from "./port/portFiles.ts";

const repo = `${resolve(dirname(fileURLToPath(import.meta.url)), "..").replaceAll("\\", "/")}/`;
const argv = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const positional = argv.filter((arg, index) => !arg.startsWith("--") && !argv[index - 1]?.startsWith("--"));
const forgeOption = option("--forge");
if (!forgeOption) {
  console.error("usage: npm run port:forge -- <tests|closure|subset|members> … --forge <Forge checkout> (see the header of tools/port-forge.ts)");
  process.exit(2);
}
const forge = `${forgeOption.replaceAll("\\", "/").replace(/\/$/, "")}/`;
const [command, ...rest] = positional;
const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(file, readFileSync(forge + file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const lineOf = (source: ts.SourceFile, position: number): number => source.getLineAndCharacterOfPosition(position).line + 1;

function closure(stop: RegExp, entries: readonly string[]): void {
  const seen = new Map<string, { lines: number; deps: string[] }>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const text = readFileSync(forge + file, "utf8");
    const deps = ts
      .preProcessFile(text, true, true)
      .importedFiles.map(({ fileName }) => {
        let base: string | null = null;
        if (fileName.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(file), fileName));
        else if (fileName.startsWith("@engine/")) base = `engine/${fileName.slice(8)}`;
        if (base === null) return null;
        return [".ts", "/index.ts"].map((ext) => base + ext).find((candidate) => existsSync(forge + candidate)) ?? null;
      })
      .filter((dep): dep is string => dep !== null);
    seen.set(file, { lines: text.split("\n").length, deps });
    for (const dep of deps) if (!stop.test(dep)) queue.push(dep);
  }
  let total = 0;
  for (const [file, { lines, deps }] of [...seen].sort()) {
    total += lines;
    const stopped = deps.filter((dep) => stop.test(dep));
    console.log(`${file} ${lines}${stopped.length ? `  STOP→ ${stopped.join(" ")}` : ""}`);
  }
  console.log(`total lines ${total}`);
}

function members(file: string): void {
  const source = parse(file);
  for (const statement of source.statements) {
    const lines = lineOf(source, statement.getEnd()) - lineOf(source, statement.getStart(source)) + 1;
    if (!ts.isClassDeclaration(statement)) {
      const name = declaredName(statement);
      if (name && lines > 15) console.log(`top ${name} ${lineOf(source, statement.getStart(source))} (${lines})`);
      continue;
    }
    console.log(`class ${statement.name?.text ?? "?"} ${lineOf(source, statement.getStart(source))}-${lineOf(source, statement.getEnd())}`);
    for (const member of statement.members) {
      const size = lineOf(source, member.getEnd()) - lineOf(source, member.getStart(source)) + 1;
      const fields = new Set<string>();
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) fields.add(node.name.text);
        ts.forEachChild(node, visit);
      };
      visit(member);
      const name = member.name ? member.name.getText(source) : "constructor";
      if (size >= 8) console.log(`  ${lineOf(source, member.getStart(source))} ${name} ${size} [${[...fields].slice(0, 10).join(",")}]`);
    }
  }
}

switch (command) {
  case "tests": {
    const area = rest[0];
    if (!area) throw new Error("tests: give an area regex, e.g. \"engine/terrain\"");
    const why = option("--why");
    const porter = new CheckPorter({ forge, repo });
    const report = porter.run(new RegExp(area), {
      write: argv.includes("--write"),
      ...(why ? { why: new Set(why.split(",").map(Number)) } : {}),
    });
    console.log(report.join("\n"));
    break;
  }
  case "closure": {
    const [stop, ...entries] = rest;
    if (!stop || entries.length === 0) throw new Error("closure: give a stop regex and at least one Forge file");
    closure(new RegExp(stop), entries);
    break;
  }
  case "subset": {
    const [file, names] = rest;
    if (!file || !names) throw new Error("subset: give a Forge file and comma-separated names");
    const result = subsetDeclarations(readFileSync(forge + file, "utf8"), file, names.split(","));
    const out = option("--out");
    if (out) writeFileSync(repo + out, portNote(`${file} (${names})`) + result.text);
    else process.stdout.write(result.text);
    console.error(`${result.declarations} of ${result.total} declarations; imports: ${result.imports.join(" | ") || "none"}`);
    break;
  }
  case "members":
    if (!rest[0]) throw new Error("members: give a Forge file");
    members(rest[0]);
    break;
  default:
    throw new Error(`unknown command ${command ?? "(none)"}`);
}
