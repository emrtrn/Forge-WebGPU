/**
 * Source transforms for porting Forge WebGL files into this repo (plan Faz 2b).
 * Pure: text in, text out. The CLI is tools/port-forge.ts; the workflow is in
 * docs/PORT_LOG.md §2 ("Taşıma kalıbı").
 */
import ts from "typescript";

/** The header every ported file starts with; tools/port-forge.ts maps Forge sources through it. */
export function portNote(source: string): string {
  return `// Ported from Forge WebGL ${source} @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.\n`;
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/**
 * Rewrites import / export specifiers: an exact `map` entry wins; any other
 * relative specifier without an extension gains `.ts` (this repo's rule).
 */
export function rewriteImports(text: string, map: Readonly<Record<string, string>>, fileName: string): string {
  const source = parse(fileName, text);
  const edits: Array<[number, number, string]> = [];
  for (const statement of source.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) continue;
    let next = map[specifier.text];
    if (next === undefined) {
      if (!specifier.text.startsWith(".") || specifier.text.endsWith(".ts")) continue;
      next = `${specifier.text}.ts`;
    }
    edits.push([specifier.getStart(source) + 1, specifier.getEnd() - 1, next]);
  }
  let out = text;
  for (const [from, to, value] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, from) + value + out.slice(to);
  return out;
}

const PARAMETER_MODIFIERS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.PublicKeyword,
  ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.ReadonlyKeyword,
]);

/**
 * Spells constructor parameter properties out as fields assigned at the top of
 * the constructor (after `super(...)`): this repo allows only erasable syntax
 * (Node type stripping). The fields go above the constructor's doc comment.
 */
export function spellOutParameterProperties(text: string, fileName: string): string {
  const source = parse(fileName, text);
  const constructors: ts.ConstructorDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isConstructorDeclaration(node) &&
      node.body &&
      node.parameters.some((parameter) => (ts.getModifiers(parameter) ?? []).some((m) => PARAMETER_MODIFIERS.has(m.kind)))
    ) {
      constructors.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const edits: Array<[number, number, string]> = [];
  for (const constructor of constructors) {
    const start = constructor.getStart(source, true);
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const indent = text.slice(lineStart, start);
    const fields: string[] = [];
    const assignments: string[] = [];
    for (const parameter of constructor.parameters) {
      const modifiers = (ts.getModifiers(parameter) ?? []).filter((m) => PARAMETER_MODIFIERS.has(m.kind));
      const first = modifiers[0];
      if (!first) continue;
      if (!ts.isIdentifier(parameter.name) || !parameter.type) {
        throw new Error(`${fileName}: a parameter property needs a plain name and a type annotation`);
      }
      const name = parameter.name.text;
      fields.push(
        `${indent}${modifiers.map((m) => m.getText(source)).join(" ")} ${name}${parameter.questionToken ? "?" : ""}: ${parameter.type.getText(source)};`,
      );
      assignments.push(`this.${name} = ${name};`);
      edits.push([first.getStart(source), parameter.name.getStart(source), ""]);
    }
    const body = constructor.body!;
    const firstStatement = body.statements[0];
    const callsSuper =
      firstStatement !== undefined &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isCallExpression(firstStatement.expression) &&
      firstStatement.expression.expression.kind === ts.SyntaxKind.SuperKeyword;
    const at = callsSuper ? firstStatement.getEnd() : body.getStart(source) + 1;
    edits.push([at, at, `\n${indent}  ${assignments.join(`\n${indent}  `)}`]);
    edits.push([
      lineStart,
      lineStart,
      `${indent}// Constructor parameter properties in Forge, spelled out here (this repo\n` +
        `${indent}// allows only erasable TypeScript syntax: Node type stripping).\n${fields.join("\n")}\n`,
    ]);
  }
  let out = text;
  for (const [from, to, value] of edits.sort((a, b) => b[0] - a[0] || b[1] - a[1])) out = out.slice(0, from) + value + out.slice(to);
  return out;
}

/** Name declared by a top-level statement (first declarator for a variable statement), if any. */
export function declaredName(statement: ts.Statement): string | null {
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)) &&
    statement.name
  ) {
    return statement.name.text;
  }
  if (ts.isVariableStatement(statement)) {
    const first = statement.declarationList.declarations[0];
    return first && ts.isIdentifier(first.name) ? first.name.text : null;
  }
  return null;
}

/** An identifier naming a property or member rather than referring to a binding. */
export function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent)
  ) {
    return parent.name === node;
  }
  return false;
}

/** Identifiers in `node` that refer to bindings (property names excluded). */
export function referencedNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && !isPropertyName(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

export interface Subset {
  readonly text: string;
  readonly declarations: number;
  readonly total: number;
  /** `specifier: names` of the imports the subset keeps. */
  readonly imports: readonly string[];
}

/**
 * The part of a file that the given top-level names need: their declarations
 * and, transitively, the top-level declarations those use, in source order,
 * with the import declarations narrowed to the names actually used.
 */
export function subsetDeclarations(text: string, fileName: string, names: readonly string[]): Subset {
  const source = parse(fileName, text);
  const byName = new Map<string, ts.Statement>();
  const order = new Map<ts.Statement, number>();
  const imports: ts.ImportDeclaration[] = [];
  source.statements.forEach((statement, index) => {
    order.set(statement, index);
    if (ts.isImportDeclaration(statement)) {
      imports.push(statement);
      return;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) byName.set(declaration.name.text, statement);
      }
      return;
    }
    const name = declaredName(statement);
    if (name) byName.set(name, statement);
  });
  for (const name of names) if (!byName.has(name)) throw new Error(`${fileName}: no top-level declaration ${name}`);
  const wanted = new Set<ts.Statement>();
  const used = new Set<string>();
  const queue = [...names];
  while (queue.length > 0) {
    const statement = byName.get(queue.pop()!);
    if (!statement || wanted.has(statement)) continue;
    wanted.add(statement);
    for (const name of referencedNames(statement)) {
      used.add(name);
      const next = byName.get(name);
      if (next && !wanted.has(next)) queue.push(name);
    }
  }
  let head = "";
  const kept: string[] = [];
  for (const declaration of imports) {
    const clause = declaration.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings) || !ts.isStringLiteral(declaration.moduleSpecifier)) continue;
    const elements = clause.namedBindings.elements.filter((element) => used.has(element.name.text));
    if (elements.length === 0) continue;
    const parts = elements.map(
      (element) =>
        (element.isTypeOnly ? "type " : "") +
        (element.propertyName ? `${element.propertyName.text} as ${element.name.text}` : element.name.text),
    );
    head += `import ${clause.isTypeOnly ? "type " : ""}{ ${parts.join(", ")} } from "${declaration.moduleSpecifier.text}";\n`;
    kept.push(`${declaration.moduleSpecifier.text}: ${parts.join(", ")}`);
  }
  const body = [...wanted]
    .sort((a, b) => order.get(a)! - order.get(b)!)
    .map((statement) => statement.getFullText(source))
    .join("");
  return { text: `${head}${body.replace(/^\n+/, "\n")}\n`, declarations: wanted.size, total: byName.size, imports: kept };
}
