/**
 * Forge WebGL test classification (plan Faz 2b, "test sınıflaması"): which
 * Forge modules each engine check touches at value level, so every check can be
 * sorted into "algorithm" (ported mechanically in 2b), "old data model"
 * (rewritten against the new model or dropped) or "render" (goes with the
 * render rewrite in its phase).
 *
 * Pure: works on source text; the CLI (`tools/port-forge-tests.ts`) reads the
 * Forge checkout. Name resolution is by name, not by scope: a helper or import
 * referenced anywhere in a check (directly or through file-local helpers) counts.
 * That over-approximates when names shadow each other, which only moves a check
 * toward the stricter class.
 */
import ts from "typescript";

export const CHECK_CALLEES: ReadonlySet<string> = new Set(["check", "checkAsync", "checkSlow", "checkSlowAsync"]);

export interface FoundCheck {
  /** Label text; for a template or computed label, its source text. */
  readonly label: string;
  /** The label is built at run time (a loop or helper may run the site many times). */
  readonly dynamicLabel: boolean;
  readonly kind: string;
  /** 1-based line of the call. */
  readonly line: number;
  /** Module specifiers the check reaches at value level, sorted, unique. */
  readonly specifiers: readonly string[];
  /** String literals the check reaches (fixture paths and the like), sorted, unique. */
  readonly literals: readonly string[];
}

export interface FileAnalysis {
  /** Module specifiers the file imports at value level (for the module graph). */
  readonly valueSpecifiers: readonly string[];
  readonly checks: readonly FoundCheck[];
}

export interface AnalyzeOptions {
  /** Call names that register a check; default {@link CHECK_CALLEES}. */
  readonly callees?: ReadonlySet<string>;
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".ts") || fileName.endsWith(".mts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** `class A extends B` names B as a value even though the node is typed as a type node. */
function isClassExtends(node: ts.Node): boolean {
  if (!ts.isExpressionWithTypeArguments(node)) return false;
  const clause = node.parent;
  return ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent);
}

/** The identifier names something (a property, a declaration) rather than referring to a binding. */
function isNamePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent) ||
    ts.isJsxAttribute(parent)
  ) {
    return parent.name === node;
  }
  if (ts.isBindingElement(parent)) return parent.propertyName === node || parent.name === node;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return true;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return true;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return false;
}

function inTypePosition(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (isClassExtends(current)) return false;
    if (ts.isTypeNode(current)) return true;
    if (ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current)) return true;
  }
  return false;
}

interface Scanned {
  /** Identifiers referenced at value level (one node per reference). */
  readonly references: readonly ts.Identifier[];
  readonly literals: ReadonlySet<string>;
  readonly dynamicImports: ReadonlySet<string>;
}

/** Value references, string literals and dynamic imports inside `root`. */
function scan(root: ts.Node): Scanned {
  const references: ts.Identifier[] = [];
  const literals = new Set<string>();
  const dynamicImports = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (!isNamePosition(node) && !inTypePosition(node)) references.push(node);
    } else if (ts.isShorthandPropertyAssignment(node)) {
      references.push(node.name);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent)) {
        literals.add(node.text);
      }
    } else if (ts.isTemplateExpression(node)) {
      literals.add(node.head.text);
      for (const span of node.templateSpans) literals.add(span.literal.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [first] = node.arguments;
      if (first && ts.isStringLiteralLike(first)) dynamicImports.add(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return { references, literals, dynamicImports };
}

function isScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isFunctionLike(node) ||
    ts.isClassLike(node)
  );
}

function scopeAbove(node: ts.Node): ts.Node {
  for (let current = node.parent; current; current = current.parent) if (isScope(current)) return current;
  return node.getSourceFile();
}

/**
 * A file's bindings: imports, and every local declaration keyed by name and by
 * the scope it is visible in. A declaration's "dependencies" are the nodes whose
 * references it carries (its initializer, its body, the iterable of a loop).
 */
class Bindings {
  readonly imports = new Map<string, string>();
  private readonly locals = new Map<string, Map<ts.Node, ts.Node[]>>();

  constructor(source: ts.SourceFile) {
    this.collect(source);
  }

  private add(name: string, scope: ts.Node, dependency: ts.Node): void {
    let byScope = this.locals.get(name);
    if (!byScope) {
      byScope = new Map();
      this.locals.set(name, byScope);
    }
    const list = byScope.get(scope);
    if (list) list.push(dependency);
    else byScope.set(scope, [dependency]);
  }

  private addBindingNames(name: ts.BindingName, scope: ts.Node, dependency: ts.Node): void {
    if (ts.isIdentifier(name)) this.add(name.text, scope, dependency);
    else {
      for (const element of name.elements) {
        if (!ts.isOmittedExpression(element)) this.addBindingNames(element.name, scope, dependency);
      }
    }
  }

  private collect(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause && !clause.isTypeOnly) {
        const specifier = node.moduleSpecifier.text;
        if (clause.name) this.imports.set(clause.name.text, specifier);
        const named = clause.namedBindings;
        if (named && ts.isNamespaceImport(named)) this.imports.set(named.name.text, specifier);
        if (named && ts.isNamedImports(named)) {
          for (const element of named.elements) if (!element.isTypeOnly) this.imports.set(element.name.text, specifier);
        }
      }
      return;
    }
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      this.add(node.name.text, scopeAbove(node), node);
    } else if (ts.isVariableDeclaration(node)) {
      const scope = scopeAbove(node);
      this.addBindingNames(node.name, scope, node);
      // `for (const item of items)`: the loop variable stands for what `items` holds.
      const loop = node.parent.parent;
      if (ts.isForOfStatement(loop) || ts.isForInStatement(loop)) this.addBindingNames(node.name, scope, loop.expression);
    } else if (ts.isParameter(node)) {
      // A parameter shadows outer names; it carries only its default value.
      this.addBindingNames(node.name, node.parent, node.initializer ?? node.name);
    }
    ts.forEachChild(node, (child) => this.collect(child));
  }

  /** What a reference resolves to: the innermost visible local declaration, else an import. */
  resolve(reference: ts.Identifier): { dependencies: readonly ts.Node[] } | { specifier: string } | null {
    const byScope = this.locals.get(reference.text);
    if (byScope) {
      for (let current: ts.Node | undefined = reference.parent; current; current = current.parent) {
        const found = byScope.get(current);
        if (found) return { dependencies: found };
      }
    }
    const specifier = this.imports.get(reference.text);
    return specifier === undefined ? null : { specifier };
  }
}

/** Side-effect imports and value re-exports: the file depends on them whatever it references. */
function unconditionalSpecifiers(source: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && !statement.importClause && ts.isStringLiteral(statement.moduleSpecifier)) {
      out.push(statement.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const clause = statement.exportClause;
      const valueNamed = !clause || ts.isNamespaceExport(clause) || clause.elements.some((element) => !element.isTypeOnly);
      if (valueNamed) out.push(statement.moduleSpecifier.text);
    }
  }
  return out;
}

class Reach {
  private readonly bindings: Bindings;
  private readonly memo = new Map<ts.Node, Scanned>();

  constructor(bindings: Bindings) {
    this.bindings = bindings;
  }

  private scanned(node: ts.Node): Scanned {
    let result = this.memo.get(node);
    if (!result) {
      result = scan(node);
      this.memo.set(node, result);
    }
    return result;
  }

  /** Specifiers and literals reachable from `root` through the local declarations its references resolve to. */
  from(root: ts.Node): { specifiers: Set<string>; literals: Set<string> } {
    const specifiers = new Set<string>();
    const literals = new Set<string>();
    const seen = new Set<ts.Node>();
    const queue: ts.Node[] = [root];
    while (queue.length > 0) {
      const node = queue.pop()!;
      if (seen.has(node)) continue;
      seen.add(node);
      const found = this.scanned(node);
      for (const literal of found.literals) literals.add(literal);
      for (const specifier of found.dynamicImports) specifiers.add(specifier);
      for (const reference of found.references) {
        const target = this.bindings.resolve(reference);
        if (target === null) continue;
        if ("specifier" in target) specifiers.add(target.specifier);
        else for (const dependency of target.dependencies) if (!seen.has(dependency)) queue.push(dependency);
      }
    }
    return { specifiers, literals };
  }
}

function labelOf(argument: ts.Expression | undefined, source: ts.SourceFile): { label: string; dynamic: boolean } {
  if (!argument) return { label: "", dynamic: true };
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return { label: argument.text, dynamic: false };
  return { label: argument.getText(source), dynamic: true };
}

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/**
 * A call that only forwards its enclosing function's own label and body
 * parameters (`const checkSlow = (label, fn) => { ... check(label, fn); }`)
 * is the harness defining a check variant, not a check site.
 */
function isForwardingCall(call: ts.CallExpression): boolean {
  if (call.arguments.length < 2 || !call.arguments.slice(0, 2).every(ts.isIdentifier)) return false;
  let scope: ts.Node | undefined = call.parent;
  while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
  if (!scope) return false;
  const parameters = new Set(
    (scope as ts.SignatureDeclaration).parameters.flatMap((parameter) => (ts.isIdentifier(parameter.name) ? [parameter.name.text] : [])),
  );
  return call.arguments.slice(0, 2).every((argument) => parameters.has((argument as ts.Identifier).text));
}

/** Value imports of a file and the checks it registers, each with what it reaches. */
export function analyzeSource(fileName: string, text: string, options: AnalyzeOptions = {}): FileAnalysis {
  const callees = options.callees ?? CHECK_CALLEES;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const bindings = new Bindings(source);
  const reach = new Reach(bindings);

  const calls: ts.CallExpression[] = [];
  const findCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && callees.has(node.expression.text) && !isForwardingCall(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, findCalls);
  };
  findCalls(source);

  const checks = calls.map((call): FoundCheck => {
    const { label, dynamic } = labelOf(call.arguments[0], source);
    // The label is prose, not a dependency: only the body (and later arguments) is followed.
    const specifiers = new Set<string>();
    const literals = new Set<string>();
    for (const argument of call.arguments.slice(1)) {
      const reached = reach.from(argument);
      for (const specifier of reached.specifiers) specifiers.add(specifier);
      for (const literal of reached.literals) literals.add(literal);
    }
    return {
      label,
      dynamicLabel: dynamic,
      kind: (call.expression as ts.Identifier).text,
      line: source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1,
      specifiers: sorted(specifiers),
      literals: sorted(literals),
    };
  });

  const referenced = scan(source);
  const valueSpecifiers = new Set<string>(unconditionalSpecifiers(source));
  for (const specifier of referenced.dynamicImports) valueSpecifiers.add(specifier);
  for (const reference of referenced.references) {
    const target = bindings.resolve(reference);
    if (target !== null && "specifier" in target) valueSpecifiers.add(target.specifier);
  }

  return { valueSpecifiers: sorted(valueSpecifiers), checks };
}

/** Area of a Forge path (repo-relative, forward slashes): `engine/<sub>`, `tools/<name>`, `editor`, … */
export function areaOf(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "engine" && parts.length > 2) return `engine/${parts[1]}`;
  if (parts[0] === "tools" && parts.length > 1) return `tools/${parts.slice(1).join("/").replace(/\.(ts|mts|mjs|js)$/, "")}`;
  return parts[0] ?? path;
}

/** Areas that hold Forge WebGL's data model or app: rewritten against the new model, not ported (plan 2b). */
export const OLD_MODEL_AREAS: ReadonlySet<string> = new Set([
  "engine/scene",
  "editor",
  "src",
  "game",
  "project",
  "templates",
  "tools/saveValidator",
  "tools/terrainSaveValidator",
  "tools/droppedFields",
]);

/**
 * Areas where only some modules hold the old model; the rest is pure math that
 * ports (plan 2b save-game + World Partition design, user decision 2026-11-12):
 * the old level partition, foliage cells, HLOD and open-world setup read
 * `RoomLayout`; the save payload carries the untyped `flags` and index keys.
 */
export const OLD_MODEL_MODULES: ReadonlyMap<string, readonly string[]> = new Map([
  ["engine/world", ["engine/world/worldPartition.ts", "engine/world/foliageCells.ts", "engine/world/hlod.ts", "engine/world/openWorldSetup.ts", "engine/world/workers/foliageWorker.ts"]],
  ["engine/persistence", ["engine/persistence/saveGameState.ts", "engine/persistence/saveEntityKeys.ts"]],
]);

/** A Forge module that holds the old data model (its area, or one listed in {@link OLD_MODEL_MODULES}). */
export function isOldModelModule(path: string): boolean {
  const area = areaOf(path);
  return OLD_MODEL_AREAS.has(area) || (OLD_MODEL_MODULES.get(area)?.includes(path) ?? false);
}

/** Areas rewritten in TSL / WebGPU (plan Faz 3+). */
export const RENDER_AREAS: ReadonlySet<string> = new Set(["engine/render-three"]);

export const isThreePackage = (specifier: string): boolean => specifier === "three" || specifier.startsWith("three/");

/** A module here importing three directly uses it as math, not to render (engine outside render-three). */
export const isMathOnlyThreeArea = (area: string): boolean => area.startsWith("engine/") && !RENDER_AREAS.has(area);

/** Literal that points at old-format level data (a level, layout or its cells), not at a terrain tile. */
export function isOldLevelData(literal: string): boolean {
  return /(^|[\\/])(levels|layouts)[\\/]|\.(level|layout)\.json$|\.cells[\\/]/.test(literal);
}

/**
 * Forge modules not ported at all (plan K12, scope by the product thesis in
 * architecture §0.0). A check that reaches one directly is dropped with it;
 * a module that merely imports one keeps its class (the import is cut when ported).
 */
export const DROPPED_MODULES: ReadonlyArray<{ readonly prefix: string; readonly why: string }> = [
  { prefix: "engine/dialogue/", why: "K12 dialogue" },
  { prefix: "tools/dialogue", why: "K12 dialogue" },
  { prefix: "engine/ai/", why: "K12 AI authoring stack" },
  { prefix: "engine/physics/ragdoll.ts", why: "K12 ragdoll" },
  { prefix: "engine/audio/soundCue", why: "K12 Sound Cue" },
  { prefix: "engine/physics/movingPlatform", why: "K12 moving platform" },
];

export function droppedBy(path: string): string | null {
  return DROPPED_MODULES.find((entry) => path.startsWith(entry.prefix))?.why ?? null;
}

/**
 * Single checks dropped with a K12 cut that no module boundary shows: the check
 * exercises cut data (a component the ported code no longer reads) through a
 * module that is ported. Keyed by Forge file and label.
 */
const WORLD_STAGE_RUNNER =
  "World Builder option B: the Stage Runner / ownership surface (dry run, output hashes, hand-edit keeping, generator versions, manual-deletion records)";

const OLD_LEVEL_DOCUMENT =
  "Forge WebGL's old level document (RoomLayout with instances / loadGroups, Game Mode path); the new format has its own checks (user decision 2026-11-12)";

const OLD_ASSET_MANIFEST =
  "Forge WebGL's central asset manifest (public/assets/manifest.json) and its health report; the A10 asset index and verify:assets replace it (user decision 2026-11-12)";

const SAVE_BY_GUID =
  "Forge WebGL's save payload (actor index keys, untyped flags, level path); forge.saveGame/1 keys by actor GUID + component + field (A7, user decision 2026-11-12)";

const OLD_PARTITION =
  "Forge WebGL's RoomLayout partition / cell files; the A11 cell model and the save service (phase 2a) and their tests replace them (user decision 2026-11-12)";

export const DROPPED_CHECKS: ReadonlyArray<{ readonly file: string; readonly label: string; readonly why: string }> = [
  {
    file: "tools/engine-tests.ts",
    label: "audio subsystem records one-shot requests from a collision behavior",
    why: "K12 audio component (BehaviorContext.audioComponent)",
  },  {
    file: "tests/engine/referenceImport.test.ts",
    label: "reference import: persisted deletions and dependent edges never resurrect",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldRecipe.test.ts",
    label: "world recipe: bad entries and dangling references are dropped with a path",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldRecipe.test.ts",
    label: "world recipe: ownership keys are written in sorted order",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldRoads.test.ts",
    label: "world roads: each road edge becomes a world-space terrain spline with profile width, mesh and paint",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldRoads.test.ts",
    label: "world roads: hand edits and deletions are kept unless preserveManualOverrides is off (WB-08)",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldRoads.test.ts",
    label: "world roads: manual ids, other stages, protected regions and locked terrains block or keep",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldRoads.test.ts",
    label: "world roads: a stage touches only its own ownership section",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldSettlement.test.ts",
    label: "world settlement: a v2 run removes the core disc a v1 run placed",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: planBlockout adds one marker per plan element and records ownership",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: plan edits update and remove only the stage's own objects",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: hand edits and deletions are kept unless preserveManualOverrides is off (WB-08)",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: wanted ids held by manual objects, other stages or protected regions are blocked",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: applying before after after restores the level exactly, group order included",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: malformed stage output is an error, not a partial apply",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/worldStage.test.ts",
    label: "world stage: default stages are unique tokens with positive versions",
    why: WORLD_STAGE_RUNNER,
  },
  {
    file: "tests/engine/testWorld.test.ts",
    label: "test world: deterministic per seed, and the level wires terrain, Player Start and Game Mode",
    why: OLD_LEVEL_DOCUMENT,
  },
  {
    file: "tests/engine/worldDataCheck.test.ts",
    label: "world data: level documents require both arrays on an object",
    why: OLD_LEVEL_DOCUMENT,
  },
  ...[
    "content: asset manifest accepts legacy aliases and rejects bad version and duplicate ids",
    "content: asset health separates generated previews, registered companions and real orphans",
    "content: asset health treats a model's fracture sidecar as a companion, an orphan one as unregistered",
    "content: terrain global maps and tiles are companions; binaries without a definition stay visible",
  ].map((label) => ({ file: "tests/engine/contentLoading.test.ts", label, why: OLD_ASSET_MANIFEST })),
  ...[
    "asset manifest validates against the public root including registered levels outside assets",
    "asset manifest helpers expose canonical path, load group, and byte size",
    "asset manifest rejects stale DevelopmentContent parent texture variants",
    "asset manifest classifies Sound Cue assets separately from prefab JSON",
    "asset manifest helpers tolerate the legacy file/loadGroup/bytes shape",
  ].map((label) => ({ file: "tools/engine-tests.ts", label, why: OLD_ASSET_MANIFEST })),
  ...["game-starter: its app contains no scene-setup code at all", "rts-starter: its app contains no scene-setup code at all"].map((label) => ({
    file: "tests/engine/runtimeParityLevel.test.ts",
    label,
    why: "Forge WebGL's templates/*/main.ts import list; a game module's import boundary is enforced by forge check here (user decision 2026-11-12)",
  })),
  {
    file: "tests/engine/regionProfile.test.ts",
    label: "world builder: engine/worldbuilder modules stay dependency-free (no three.js)",
    why: "reads Forge WebGL's folder layout; the layer rules (.dependency-cruiser.cjs) keep src/engine three-free here (user decision 2026-11-12)",
  },
  ...[
    "save identity: a saved actor is found again after its index moved",
    "save identity: old saves and id-less actors stay by index, other entities pass through",
    "save identity: an actor that left the level is null, never another actor",
    "save identity: of two actors sharing an id the first has it",
    "save identity: entries are renamed, a null drops them, the rest is kept",
  ].map((label) => ({ file: "tests/engine/saveEntityKeys.test.ts", label, why: SAVE_BY_GUID })),
  ...[
    "game save serializer: collects level, player facing, and persistent state",
    "game save serializer: rejects bad player transforms and drops non-json flags",
  ].map((label) => ({ file: "tools/engine-tests.ts", label, why: SAVE_BY_GUID })),
  {
    file: "tools/engine-tests.ts",
    label: "game save restore waits for the matching loaded level before applying",
    why: "rewritten against forge.saveGame/1 (level by GUID); the new test lives next to src/core/save (user decision 2026-11-12)",
  },
  ...[
    "world partition persistence: every routed element and settings survive the save allowlist",
    "world partition persistence: true and absent spatiallyLoaded stay omitted for every kind",
    "world partition persistence: every kind rejects non-boolean spatiallyLoaded",
    "world partition persistence: partial partition settings normalize only when authored",
    "world partition persistence: invalid partition settings name the field and normalizer reason",
    "world partition persistence: explicit element clones preserve authored spatiallyLoaded",
    "world partition persistence: split and merge preserve independent partition settings",
    "world partition persistence: normalized world widgets retain the persistent flag on save",
  ].map((label) => ({ file: "tests/engine/serializationDrift.test.ts", label, why: OLD_PARTITION })),
  ...[
    "world cells: index validation omits empty indices and uses numeric z then x ordering",
    "world cells: save payload validates paths, keys, keep membership and duplicate writes",
    "world cells: element allowlist and dropped-field reporting match layout saves",
    "world cells: shared loader merges cells and classifies missing, corrupt and mismatched cells by path",
    "world cells: saver orders writes, sends changed cells only, keeps full index and clears stale cells on disable",
  ].map((label) => ({ file: "tests/engine/worldCellPersistence.test.ts", label, why: OLD_PARTITION })),
  ...[
    "wb pilot valley: two builds agree byte for byte; partition only moves placements into cells",
    "wb pilot valley: a partitioned level reads back whole, and saving it again writes the same files",
  ].map((label) => ({ file: "tests/engine/wbPilotValley.test.ts", label, why: "the old partitioned layout; import:forge --compare and world:brief's byte-identical rebuild cover it (user decision 2026-11-12)" })),
];

/** The old-level part of tests/engine/worldPartition.test.ts: every check except the light peaks (5b). */
export function droppedPartitionCheck(file: string, label: string): string | null {
  if (file !== "tests/engine/worldPartition.test.ts") return null;
  return label.startsWith("world partition: light peaks") || label.startsWith("world partition: lightless") ? null : OLD_PARTITION;
}

export function droppedCheck(file: string, label: string): string | null {
  return DROPPED_CHECKS.find((entry) => entry.file === file && entry.label === label)?.why ?? droppedPartitionCheck(file, label);
}

/**
 * Checks that read as old level data only because a level path is an opaque
 * string in them (a save slot's payload, a slot label), not a level the check
 * loads: algorithm checks.
 */
export const OPAQUE_LEVEL_PATH_CHECKS: ReadonlyArray<{ readonly file: string; readonly label: string }> = [
  { file: "tools/engine-tests.ts", label: "save-game store: writes, lists, reads, overwrites, and deletes slots" },
  { file: "tools/engine-tests.ts", label: "save-game store: storage write failures return an error result" },
  { file: "tools/engine-tests.ts", label: "save-game UI commands and ViewModel fields stay slot-scoped" },
];

export function opaqueLevelPathCheck(file: string, label: string): boolean {
  return OPAQUE_LEVEL_PATH_CHECKS.some((entry) => entry.file === file && entry.label === label);
}

/**
 * Algorithm checks whose port waits for a later phase: the module they test
 * comes with that phase (plan 2b "Taşıma" closing rule, user decision
 * 2026-11-12). They stay in the denominator; each phase's gate lists its own.
 * Keyed by Forge file and, where the file mixes phases, a label prefix.
 */
export const DEFERRED_CHECKS: ReadonlyArray<{ readonly file: string; readonly labelPrefix?: string; readonly phase: string; readonly why: string }> = [
  ...[
    "graphics preferences:",
    "quality profiles:",
    "hardware hints:",
    "quality ladder:",
    "measurement calibration:",
    "GPU timer:",
    "adaptive quality:",
  ].map((labelPrefix) => ({ file: "tools/engine-tests.ts", labelPrefix, phase: "3", why: "quality profiles / adaptive quality rebuilt with the render pipeline (INV-G29)" })),
  { file: "tools/engine-tests.ts", labelPrefix: "asset perf:", phase: "3", why: "asset perf report (INV-H20)" },
  { file: "tools/engine-tests.ts", labelPrefix: "starter material assets", phase: "3", why: "material asset type" },
  ...["computePlayerStartSpawn:", "hasPlayerCharacter:", "createDefaultPlayerCharacter:"].map((labelPrefix) => ({
    file: "tools/engine-tests.ts",
    labelPrefix,
    phase: "6",
    why: "Player Start and the default pawn (INV-D25)",
  })),
  { file: "tests/engine/puddlePersistence.test.ts", phase: "5a", why: "puddles (INV-D21)" },
  { file: "tests/engine/terrainPuddle.test.ts", phase: "5a", why: "puddles (INV-D21)" },
  { file: "tests/engine/terrainOrphans.test.ts", phase: "5a", why: "terrain repair / orphan cleanup (INV-H11)" },
  { file: "tests/engine/terrainRuntimeStreaming.test.ts", phase: "5b", why: "runtime terrain streaming (A11)" },
  { file: "tests/engine/worldTerrainMove.test.ts", phase: "5d", why: "moving a World Terrain shifts the water types too (5d / 7)" },
  ...["terrainLakeWater", "terrainLakeBed", "lakeInteraction", "lakeQuality", "oceanWater", "waterWheelInteraction", "waterFoam"].map((name) => ({
    file: `tests/engine/${name}.test.ts`,
    phase: "7",
    why: "lakes, rivers and ocean",
  })),
  ...["worldStreaming", "assetResidency", "viewDistance", "detailCulling", "worldMapView", "heightFog"].map((name) => ({
    file: `tests/engine/${name}.test.ts`,
    phase: "5b",
    why: "runtime cell streaming, asset residency, view distance and culling, World Partition map (INV-F24, B11)",
  })),
  ...["sunCascades", "followShadow"].map((name) => ({ file: `tests/engine/${name}.test.ts`, phase: "3", why: "sun shadow cascades" })),
  { file: "tools/engine-tests.ts", labelPrefix: "user settings", phase: "3", why: "user settings carry the graphics preferences (quality profiles)" },
  { file: "tests/engine/foliageRing.test.ts", phase: "5c", why: "foliage ring" },
  { file: "tools/engine-tests.ts", labelPrefix: "starter save/load UI asset", phase: "6", why: "the starter's save / load UI widget asset" },
  { file: "tests/engine/offroadTestWorld.test.ts", phase: "8", why: "off-road test level, regenerated in the new format (user decision 2026-11-12)" },
];

export function deferredTo(file: string, label: string): string | null {
  return (
    DEFERRED_CHECKS.find((entry) => entry.file === file && (entry.labelPrefix === undefined || label.startsWith(entry.labelPrefix)))?.phase ?? null
  );
}

/** A algorithm, M old data model, R render, D not ported (K12). */
export type CheckClass = "A" | "M" | "R" | "D";

export interface ModuleFacts {
  /** Repo-relative path of a resolved local module, or null for a package. */
  readonly path: string | null;
  readonly specifier: string;
  /** Depends on three for rendering at value level (itself, transitively, or by area). */
  readonly three: boolean;
  /**
   * Reaches three only through an engine (non-render) module that uses it as a
   * math library (Vector3, Quaternion): ported with the math swapped, not rewritten.
   */
  readonly threeMath: boolean;
  /** Depends on an old-model area at value level, transitively. */
  readonly oldModel: boolean;
}

export interface CheckVerdict {
  readonly cls: CheckClass;
  /**
   * Algorithm check whose modules reach the old model or three math further down
   * (adapted at the boundary when ported); `reasons` says which.
   */
  readonly boundary: boolean;
  readonly areas: readonly string[];
  readonly reasons: readonly string[];
}

/** Class of a check from the facts of the modules it reaches and its literals. */
export function classifyCheck(modules: readonly ModuleFacts[], literals: readonly string[]): CheckVerdict {
  const areas = sorted(modules.flatMap((module) => (module.path ? [areaOf(module.path)] : [])));
  const reasons: string[] = [];
  for (const module of modules) {
    const why = module.path === null ? null : droppedBy(module.path);
    if (why !== null) reasons.push(`dropped:${why}`);
  }
  if (reasons.length > 0) return { cls: "D", boundary: false, areas, reasons: sorted(reasons) };
  for (const module of modules) {
    if (module.path === null && isThreePackage(module.specifier)) reasons.push(`three:${module.specifier}`);
    else if (module.path !== null && module.three) reasons.push(`three-via:${areaOf(module.path)}`);
  }
  if (reasons.length > 0) return { cls: "R", boundary: false, areas, reasons: sorted(reasons) };
  for (const module of modules) if (module.path !== null && isOldModelModule(module.path)) reasons.push(`model:${areaOf(module.path)}`);
  for (const literal of literals) if (isOldLevelData(literal)) reasons.push(`level-data:${literal}`);
  if (reasons.length > 0) return { cls: "M", boundary: false, areas, reasons: sorted(reasons) };
  for (const module of modules) {
    if (module.path === null) continue;
    if (module.oldModel) reasons.push(`boundary-model:${areaOf(module.path)}`);
    if (module.threeMath) reasons.push(`boundary-three-math:${areaOf(module.path)}`);
  }
  return { cls: "A", boundary: reasons.length > 0, areas, reasons: sorted(reasons) };
}
