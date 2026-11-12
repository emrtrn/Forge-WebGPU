/**
 * Ports Forge WebGL checks whose every import is already ported (plan Faz 2b).
 *
 * Reads the classification (docs/port/forge-engine-tests.tsv: A rows not yet
 * ported, in the given areas), maps Forge modules to this repo's files through
 * their "Ported from Forge WebGL" notes (portNote), and for each check resolves
 * every (module, name) it reaches, through the file's top-level helpers. A check
 * also waits when it reads a content file this repo does not have.
 * Register-style test files are copied with the unportable checks cut; checks
 * from the harness (tools/engine-tests.ts) are extracted with their helpers and
 * grouped by the module they test. Checks stay word for word.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { posix } from "node:path";
import ts from "typescript";
import { declaredName, referencedNames } from "./portFiles.ts";

export const ENGINE_HARNESS = "tools/engine-tests.ts";
const RUNNERS = /^check(Async|Slow|SlowAsync)?$/;
const CONTENT_PATH = /^(public|tests|content|assets)\/.+\.[a-z0-9]+$/i;

export interface Roots {
  /** Forge checkout, forward slashes, trailing slash. */
  readonly forge: string;
  /** This repo, forward slashes, trailing slash. */
  readonly repo: string;
}

interface ImportInfo {
  readonly specifier: string;
  /** Forge module path, or null for a package / builtin. */
  readonly module: string | null;
  readonly name: string;
  readonly typeOnly: boolean;
  readonly isDefault: boolean;
  readonly isNamespace: boolean;
}

interface Resolved extends ImportInfo {
  /** Repo file carrying the name, or the package specifier. */
  readonly target: string;
}

interface Need {
  readonly imports: Map<string, Resolved>;
  readonly helpers: ts.Statement[];
  readonly missing: string[];
}

interface FileInfo {
  readonly file: string;
  readonly text: string;
  readonly source: ts.SourceFile;
  readonly imports: Map<string, ImportInfo>;
  readonly top: Map<string, ts.Statement>;
  readonly calls: Map<number, ts.ExpressionStatement>;
}

const parse = (name: string, text: string): ts.SourceFile =>
  ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function expandBraces(path: string): string[] {
  const match = path.match(/^(.*)\{([^}]+)\}(.*)$/);
  return match ? match[2]!.split(",").map((part) => `${match[1]}${part}${match[3]}`) : [path];
}

/** Forge source -> repo files ported from it, and each repo file's exports (name -> is value). */
export function scanPorted(repo: string): { bySource: Map<string, string[]>; exports: Map<string, Map<string, boolean>> } {
  const bySource = new Map<string, string[]>();
  const exports = new Map<string, Map<string, boolean>>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(repo + dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;
      const text = readFileSync(repo + path, "utf8");
      const note = text.split("\n").slice(0, 3).join(" ").match(/Ported from Forge WebGL (\S+)/);
      if (note) {
        for (const source of expandBraces(note[1]!.replace(/[;,]$/, ""))) {
          const list = bySource.get(source) ?? [];
          list.push(path);
          bySource.set(source, list);
        }
      }
      const names = new Map<string, boolean>();
      for (const statement of parse(path, text).statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) names.set(element.name.text, !(statement.isTypeOnly || element.isTypeOnly));
          continue;
        }
        const exported = (ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : []).some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        );
        if (!exported) continue;
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) names.set(declaration.name.text, true);
          }
          continue;
        }
        const name = declaredName(statement);
        if (name) names.set(name, ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement));
      }
      exports.set(path, names);
    }
  };
  walk("src");
  return { bySource, exports };
}

const ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["@engine/", "engine/"],
  ["@/", "src/"],
];

function forgeResolve(forge: string, from: string, specifier: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), specifier));
  else for (const [alias, target] of ALIASES) if (specifier.startsWith(alias)) base = target + specifier.slice(alias.length);
  if (base === null) return null;
  for (const extension of [".ts", "/index.ts", ""]) {
    const candidate = base + extension;
    if (/\.[a-z]+$/.test(candidate) && existsSync(forge + candidate)) return candidate;
  }
  return `${base}.ts`;
}

function analyse(forge: string, file: string): FileInfo {
  const text = readFileSync(forge + file, "utf8");
  const source = parse(file, text);
  const imports = new Map<string, ImportInfo>();
  const top = new Map<string, ts.Statement>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const module = forgeResolve(forge, file, specifier);
      const clause = statement.importClause;
      const base = { specifier, module, isDefault: false, isNamespace: false };
      if (clause.name) imports.set(clause.name.text, { ...base, name: "default", typeOnly: clause.isTypeOnly, isDefault: true });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            ...base,
            name: element.propertyName?.text ?? element.name.text,
            typeOnly: clause.isTypeOnly || element.isTypeOnly,
          });
        }
      }
      if (bindings && ts.isNamespaceImport(bindings)) {
        imports.set(bindings.name.text, { ...base, name: "*", typeOnly: false, isNamespace: true });
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) top.set(declaration.name.text, statement);
      }
      continue;
    }
    const name = declaredName(statement);
    if (name) top.set(name, statement);
  }
  const calls = new Map<number, ts.ExpressionStatement>();
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node)) {
      let expression = node.expression;
      if (ts.isAwaitExpression(expression)) expression = expression.expression;
      if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && RUNNERS.test(expression.expression.text)) {
        calls.set(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { file, text, source, imports, top, calls };
}

export class CheckPorter {
  private readonly roots: Roots;
  private readonly bySource: Map<string, string[]>;
  private readonly exports: Map<string, Map<string, boolean>>;

  constructor(roots: Roots) {
    this.roots = roots;
    const scanned = scanPorted(roots.repo);
    this.bySource = scanned.bySource;
    this.exports = scanned.exports;
  }

  /** Repo file that carries `name` from Forge module `module`, or null. */
  locate(module: string, name: string): string | null {
    for (const path of this.bySource.get(module) ?? []) if (this.exports.get(path)?.has(name)) return path;
    return null;
  }

  /** Imports a node needs (through top-level helpers unless `ownOnly`), resolved; `missing` lists what blocks it. */
  needs(info: FileInfo, node: ts.Node, ownOnly = false): Need {
    const imports = new Map<string, Resolved>();
    const helpers = new Set<ts.Statement>();
    const missing: string[] = [];
    const queue: ts.Node[] = [node];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const id of referencedNames(current)) {
        const imported = info.imports.get(id);
        if (imported) {
          if (imported.module === null) imports.set(id, { ...imported, target: imported.specifier });
          else if (imported.isNamespace) missing.push(`${id} (namespace ${imported.specifier})`);
          else {
            const target = this.locate(imported.module, imported.name);
            if (target) imports.set(id, { ...imported, target });
            else missing.push(`${imported.name} from ${imported.module}`);
          }
          continue;
        }
        if (RUNNERS.test(id) || ownOnly) continue;
        const statement = info.top.get(id);
        if (statement && !helpers.has(statement)) {
          helpers.add(statement);
          queue.push(statement);
        }
      }
      const literals: string[] = [];
      const collect = (child: ts.Node): void => {
        if (ts.isStringLiteralLike(child)) literals.push(child.text);
        ts.forEachChild(child, collect);
      };
      collect(current);
      for (const literal of literals) {
        if (CONTENT_PATH.test(literal) && !existsSync(this.roots.repo + literal)) missing.push(`content ${literal}`);
      }
    }
    return { imports, helpers: [...helpers], missing };
  }

  /** Plans (and with `write`, writes) the port of the A checks in `areas`; returns a report. */
  run(areas: RegExp, options: { write: boolean; why?: ReadonlySet<number> }): string[] {
    const report: string[] = [];
    const rows = readFileSync(`${this.roots.repo}docs/port/forge-engine-tests.tsv`, "utf8")
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t"))
      .filter((row) => row[3] === "A" && !row[8] && areas.test(row[6] ?? ""));
    const byFile = new Map<string, number[]>();
    for (const row of rows) {
      const lines = byFile.get(row[0]!) ?? [];
      lines.push(Number(row[1]));
      byFile.set(row[0]!, lines);
    }
    let portable = 0;
    let blocked = 0;
    const blockers = new Map<string, number>();
    const plan: Array<{ info: FileInfo; results: Array<{ line: number; call: ts.ExpressionStatement; need: Need }> }> = [];
    for (const [file, lines] of byFile) {
      const info = analyse(this.roots.forge, file);
      const results: Array<{ line: number; call: ts.ExpressionStatement; need: Need }> = [];
      for (const line of lines) {
        const call = info.calls.get(line);
        if (!call) {
          blocked += 1;
          blockers.set(`(no check call at ${file}:${line})`, 1);
          continue;
        }
        const need = this.needs(info, call);
        if (need.missing.length > 0) {
          blocked += 1;
          if (options.why?.has(line)) report.push(`  why ${file}:${line}: ${[...new Set(need.missing)].join("; ")}`);
          for (const reason of new Set(need.missing)) blockers.set(reason, (blockers.get(reason) ?? 0) + 1);
        } else {
          portable += 1;
          results.push({ line, call, need });
        }
      }
      plan.push({ info, results });
    }
    report.unshift(`A rows in scope: ${rows.length}; portable now: ${portable}; blocked: ${blocked}`);
    for (const [reason, count] of [...blockers].sort((a, b) => b[1] - a[1]).slice(0, 25)) report.push(`  blocked ${count}× by ${reason}`);
    if (!options.write) return report;

    const written: string[] = [];
    for (const { info, results } of plan) {
      if (results.length === 0) continue;
      if (info.file === ENGINE_HARNESS) written.push(...this.writeHarnessGroups(info, results, report));
      else {
        const done = this.writeRegisterFile(info, results, report);
        if (done) written.push(done);
      }
    }
    report.push("written:", ...written.map((line) => `  ${line}`));
    return report;
  }

  private importLines(dest: string, imports: ReadonlyMap<string, Resolved>): string[] {
    const bySpecifier = new Map<string, { defaultName: string | null; named: string[] }>();
    for (const [local, info] of imports) {
      let specifier = info.target;
      if (info.module !== null) {
        specifier = posix.relative(posix.dirname(dest), info.target);
        if (!specifier.startsWith(".")) specifier = `./${specifier}`;
      }
      const entry = bySpecifier.get(specifier) ?? { defaultName: null, named: [] };
      if (info.isDefault) entry.defaultName = local;
      else entry.named.push((info.typeOnly ? "type " : "") + (info.name !== local ? `${info.name} as ${local}` : local));
      bySpecifier.set(specifier, entry);
    }
    const node = (s: string): boolean => s.startsWith("node:");
    return [...bySpecifier.keys()]
      .sort((a, b) => (node(a) === node(b) ? a.localeCompare(b) : node(a) ? -1 : 1))
      .map((specifier) => {
        const { defaultName, named } = bySpecifier.get(specifier)!;
        const parts = [...(defaultName ? [defaultName] : []), ...(named.length ? [`{ ${named.sort().join(", ")} }`] : [])];
        return `import ${parts.join(", ")} from "${specifier}";`;
      });
  }

  private writeRegisterFile(
    info: FileInfo,
    results: ReadonlyArray<{ line: number }>,
    report: string[],
  ): string | null {
    const keep = new Set(results.map((result) => result.line));
    const cuts = [...info.calls]
      .filter(([line]) => !keep.has(line))
      .map(([, node]) => [node.getFullStart(), node.getEnd()] as const);
    let body = info.text;
    for (const [from, to] of [...cuts].sort((a, b) => b[0] - a[0])) body = body.slice(0, from) + body.slice(to);
    const cut = parse(info.file, body);
    const firstStatement = cut.statements[0];
    const firstOther = cut.statements.find((statement) => !ts.isImportDeclaration(statement));
    if (!firstStatement || !firstOther) return null;
    const leading = body.slice(0, firstStatement.getStart(cut));
    const rest = body.slice(firstOther.getFullStart());
    const need = this.needs({ ...info, top: new Map() }, parse("rest.ts", rest), true);
    if (need.missing.length > 0) {
      report.push(`  skip ${info.file}: file-level needs unported ${[...new Set(need.missing)].join(", ")}`);
      return null;
    }
    const targets = [...need.imports.values()].filter((i) => i.module !== null).map((i) => i.target);
    const base = posix.basename(info.file).replace(/\.test\.ts$/, ".ts");
    const home =
      targets.find((target) => posix.basename(target) === base) ??
      targets.find((target) => !/\/(legacy|testing)\//.test(target)) ??
      targets[0];
    if (!home) {
      report.push(`  skip ${info.file}: no ported import`);
      return null;
    }
    const dest = posix.join(posix.dirname(home), posix.basename(info.file));
    if (existsSync(this.roots.repo + dest)) {
      report.push(`  skip ${info.file}: ${dest} exists`);
      return null;
    }
    // Every runner parameter (check, checkAsync, …) gets Vitest's `test`.
    const registers = parse("rest.ts", rest)
      .statements.filter(
        (statement): statement is ts.FunctionDeclaration =>
          ts.isFunctionDeclaration(statement) && /^register[A-Za-z0-9]+$/.test(statement.name?.text ?? ""),
      )
      .map((statement) => ({
        name: statement.name!.text,
        arity: statement.parameters.length,
        // An async register may await setup (a wasm load) before its first check:
        // awaited at the top level so Vitest collects the checks.
        isAsync: (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword),
      }));
    const out =
      leading +
      `// Ported from Forge WebGL ${info.file} @ forge-webgl-final (04b5fb23): checks unchanged, run by\n` +
      `// Vitest; ${cuts.length ? `${cuts.length} check(s) not yet portable left out` : "whole file"}. docs/PORT_LOG.md §2.\n` +
      this.importLines(dest, need.imports).join("\n") +
      `\nimport { test } from "vitest";\n` +
      rest.trimEnd() +
      "\n\n" +
      registers
        .map(({ name, arity, isAsync }) => {
          const args = Array.from({ length: arity }, (_, index) => `test as unknown as Parameters<typeof ${name}>[${index}]`);
          return `${isAsync ? "await " : ""}${name}(${args.join(", ")});`;
        })
        .join("\n") +
      "\n";
    mkdirSync(posix.dirname(this.roots.repo + dest), { recursive: true });
    writeFileSync(this.roots.repo + dest, out);
    return `${dest} (${results.length})`;
  }

  private writeHarnessGroups(
    info: FileInfo,
    results: ReadonlyArray<{ line: number; call: ts.ExpressionStatement; need: Need }>,
    report: string[],
  ): string[] {
    const groups = new Map<string, Array<{ line: number; call: ts.ExpressionStatement; need: Need }>>();
    for (const result of results) {
      const ported = [...result.need.imports.values()].filter((i) => i.module !== null);
      const plain = (i: Resolved): boolean => !/\/(legacy|testing)\//.test(i.target);
      const target = (ported.find((i) => !i.typeOnly && plain(i)) ?? ported.find(plain) ?? ported[0])?.target;
      if (!target) continue;
      const group = groups.get(target) ?? [];
      group.push(result);
      groups.set(target, group);
    }
    const written: string[] = [];
    for (const [target, group] of groups) {
      let dest = target.replace(/\.ts$/, ".test.ts");
      if (existsSync(this.roots.repo + dest)) dest = target.replace(/\.ts$/, ".checks.test.ts");
      if (existsSync(this.roots.repo + dest)) {
        report.push(`  skip harness group ${dest}: exists`);
        continue;
      }
      const imports = new Map<string, Resolved>();
      const helpers = new Set<ts.Statement>();
      for (const result of group) {
        for (const [name, value] of result.need.imports) imports.set(name, value);
        for (const helper of result.need.helpers) helpers.add(helper);
      }
      const clean = (text: string): string => text.replace(/^\s*\n/, "\n").trimEnd();
      const helperText = [...helpers].sort((a, b) => a.pos - b.pos).map((statement) => clean(statement.getFullText(info.source)));
      const callText = [...group].sort((a, b) => a.line - b.line).map((result) => clean(result.call.getFullText(info.source)));
      const all = [...helperText, ...callText].join("\n");
      const runners = ["check", "checkAsync", "checkSlow", "checkSlowAsync"]
        .filter((runner) => new RegExp(`\\b${runner}\\(`).test(all))
        .map((runner) => `const ${runner} = test;`);
      const out =
        `// Ported from Forge WebGL ${ENGINE_HARNESS} @ forge-webgl-final (04b5fb23): each check is\n` +
        `// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.\n` +
        this.importLines(dest, imports).join("\n") +
        `\nimport { test } from "vitest";\n\n${runners.join("\n")}\n${all}\n`;
      mkdirSync(posix.dirname(this.roots.repo + dest), { recursive: true });
      writeFileSync(this.roots.repo + dest, out);
      written.push(`${dest} (${group.length})`);
    }
    return written;
  }
}
