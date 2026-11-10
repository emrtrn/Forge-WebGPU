// The SDK API snapshot (architecture §4.8, A8; project contract decision 1D).
//
// The type surface of `@forge/sdk` and `@forge/editor-sdk`, written as sorted
// text with the TypeScript compiler API (no extra dependency): a function by
// its signatures, a constant by its type, an interface by its members, a type
// alias by what it expands to. Types the exports reach but do not export
// (a field option, a component record) are listed too: their shape is part of
// what a game sees. The same sources give the same text on every machine.
//
// The gate (`verify:sdk-api`) checks two things: the snapshot in the
// repository is the one the sources give, and the newest entry of the SDK
// changelog carries the snapshot's hash (`API: <hash>`). So the surface cannot
// change without the snapshot and the changelog changing in the same commit;
// local `check:projects` cannot run in CI, this can.

import { createHash } from "node:crypto";
import { relative } from "node:path";
import ts from "typescript";

const FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.WriteArrayAsGenericType |
  ts.TypeFormatFlags.UseFullyQualifiedType |
  ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  skipLibCheck: true,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  types: [],
};

const slashes = (path: string): string => path.split("\\").join("/");

/** Writes the absolute import paths TypeScript puts into qualified names relative to the root. */
function clean(text: string, root: string): string {
  return text.replace(/import\("([^"]+)"\)\./g, (_match, path: string) => `import("${slashes(relative(root, path))}").`);
}

function describeSymbol(symbol: ts.Symbol, checker: ts.TypeChecker, root: string): string[] {
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const name = symbol.getName();
  const lines: string[] = [];
  const declaration = target.declarations?.[0];
  const str = (type: ts.Type, node?: ts.Node): string => clean(checker.typeToString(type, node, FLAGS), root);

  if (target.flags & ts.SymbolFlags.Function) {
    for (const signature of checker.getTypeOfSymbol(target).getCallSignatures()) {
      lines.push(`function ${name}${clean(checker.signatureToString(signature, declaration, FLAGS), root)}`);
    }
  } else if (target.flags & ts.SymbolFlags.Variable) {
    lines.push(`const ${name}: ${str(checker.getTypeOfSymbol(target), declaration)}`);
  } else if (target.flags & ts.SymbolFlags.Interface) {
    const type = checker.getDeclaredTypeOfSymbol(target);
    const params = (type as ts.InterfaceType).typeParameters?.map((param) => str(param)) ?? [];
    lines.push(`interface ${name}${params.length > 0 ? `<${params.join(", ")}>` : ""}`);
    for (const signature of type.getCallSignatures()) {
      lines.push(`  ${clean(checker.signatureToString(signature, declaration, FLAGS), root)}`);
    }
    for (const info of checker.getIndexInfosOfType(type)) {
      lines.push(`  ${info.isReadonly ? "readonly " : ""}[key: ${str(info.keyType)}]: ${str(info.type, declaration)}`);
    }
    const props = checker.getPropertiesOfType(type).map((property) => {
      const optional = property.flags & ts.SymbolFlags.Optional ? "?" : "";
      const decl = property.declarations?.[0];
      const readonly = decl && ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Readonly ? "readonly " : "";
      return `  ${readonly}${property.getName()}${optional}: ${str(checker.getTypeOfSymbol(property), declaration)}`;
    });
    lines.push(...props.sort());
  } else if (target.flags & ts.SymbolFlags.TypeAlias) {
    const type = checker.getDeclaredTypeOfSymbol(target);
    const decl = declaration && ts.isTypeAliasDeclaration(declaration) ? declaration : undefined;
    const params = decl?.typeParameters?.map((param) => param.getText()) ?? [];
    const body = clean(checker.typeToString(type, declaration, FLAGS | ts.TypeFormatFlags.InTypeAlias), root);
    lines.push(`type ${name}${params.length > 0 ? `<${params.join(", ")}>` : ""} = ${body}`);
  } else {
    lines.push(`${ts.SymbolFlags[target.flags] ?? "symbol"} ${name}`);
  }
  return lines;
}

/**
 * Named types declared under `src/` that the exports reach (through property,
 * parameter, return, union, index and type-argument types).
 */
function referencedSymbols(exports: readonly ts.Symbol[], checker: ts.TypeChecker, root: string): ts.Symbol[] {
  const resolved = exports.map((symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol));
  const exported = new Set(resolved);
  const found = new Set<ts.Symbol>();
  const pending: ts.Symbol[] = [...resolved];
  const inSource = (symbol: ts.Symbol): boolean =>
    (symbol.declarations ?? []).some((decl) => slashes(decl.getSourceFile().fileName).startsWith(`${root}/src/`));
  const consider = (symbol: ts.Symbol | undefined): void => {
    if (!symbol) return;
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (found.has(target) || exported.has(target)) return;
    if (!(target.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))) return;
    if (!inSource(target)) return;
    found.add(target);
    pending.push(target);
  };
  // Syntactic: the type references written in the declarations. Walking the
  // checker's instantiated types instead does not terminate on the DSL's
  // mapped generics.
  const visitNode = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) consider(checker.getSymbolAtLocation(node.typeName));
    else if (ts.isExpressionWithTypeArguments(node)) consider(checker.getSymbolAtLocation(node.expression));
    if (ts.isFunctionLike(node)) {
      node.typeParameters?.forEach(visitNode);
      node.parameters.forEach(visitNode);
      if (node.type) visitNode(node.type);
      return; // not the body
    }
    if (ts.isVariableDeclaration(node)) {
      if (node.type) visitNode(node.type);
      return; // not the initialiser
    }
    ts.forEachChild(node, visitNode);
  };
  while (pending.length > 0) {
    const symbol = pending.pop()!;
    for (const declaration of symbol.declarations ?? []) visitNode(declaration);
  }
  return [...found];
}

/** The snapshot text of the given entry files, relative to `root` (forward slashes). */
export function createApiSnapshot(root: string, entries: readonly string[]): string {
  const program = ts.createProgram(
    entries.map((entry) => `${root}/${entry}`),
    COMPILER_OPTIONS,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const message = ts.formatDiagnostics(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    });
    throw new Error(`The SDK does not compile:\n${message}`);
  }
  const checker = program.getTypeChecker();
  const byName = (a: ts.Symbol, b: ts.Symbol): number => (a.getName() < b.getName() ? -1 : a.getName() > b.getName() ? 1 : 0);
  const fileOf = (symbol: ts.Symbol): string => slashes(relative(root, symbol.declarations![0]!.getSourceFile().fileName));
  const out: string[] = [];
  const all: ts.Symbol[] = [];
  for (const entry of entries) {
    const source = program.getSourceFile(`${root}/${entry}`);
    const module = source ? checker.getSymbolAtLocation(source) : undefined;
    if (!module) throw new Error(`No module at ${entry}.`);
    out.push(`# ${entry}`, "");
    const exports = checker.getExportsOfModule(module).sort(byName);
    all.push(...exports);
    for (const symbol of exports) out.push(...describeSymbol(symbol, checker, root), "");
  }
  const referenced = referencedSymbols(all, checker, root).sort((a, b) => byName(a, b) || (fileOf(a) < fileOf(b) ? -1 : 1));
  out.push("# referenced (not exported, part of the surface)", "");
  for (const symbol of referenced) {
    const [first, ...rest] = describeSymbol(symbol, checker, root);
    out.push(`${first}  // ${fileOf(symbol)}`, ...rest, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

export function snapshotHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** The `API:` hash of the newest changelog entry (the first `## ` section); null when it has none. */
export function changelogApiHash(changelog: string): string | null {
  const newest = changelog.split(/^## /m)[1];
  if (newest === undefined) return null;
  const match = /^API: ([0-9a-f]{16})\s*$/m.exec(newest);
  return match ? match[1]! : null;
}

export const SDK_ENTRIES = ["src/sdk/index.ts", "src/editor-sdk/index.ts"] as const;
export const SNAPSHOT_PATH = "src/sdk/api.snapshot.txt";
export const CHANGELOG_PATH = "src/sdk/CHANGELOG.md";
