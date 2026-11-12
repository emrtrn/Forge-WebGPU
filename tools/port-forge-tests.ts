/**
 * Classifies Forge WebGL's engine tests for the Faz 2b port (plan §4 Faz 2b,
 * "test sınıflaması"). Reads a Forge checkout at the cut-over tag, finds every
 * check, follows what it reaches at value level, and writes one row per check
 * site to a TSV plus a Markdown summary to stdout.
 *
 *   node tools/port-forge-tests.ts --forge <Forge checkout> [--ref forge-webgl-final] [--out <tsv>]
 *
 * Classes: A algorithm (ported mechanically, the 2b gate's denominator),
 * M old data model (rewritten against the new model or dropped), R render
 * (reaches three; goes with the TSL rewrite in its phase), D not ported (plan
 * K12). See tools/port/forgeTests.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeSource,
  areaOf,
  classifyCheck,
  droppedCheck,
  isMathOnlyThreeArea,
  isThreePackage,
  OLD_MODEL_AREAS,
  RENDER_AREAS,
  type CheckVerdict,
  type FileAnalysis,
  type FoundCheck,
  type ModuleFacts,
} from "./port/forgeTests.ts";

interface Options {
  readonly forge: string;
  readonly ref: string;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): Options {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const forge = value("--forge");
  if (!forge) throw new Error("usage: node tools/port-forge-tests.ts --forge <Forge checkout> [--ref <tag>] [--out <tsv>]");
  return { forge, ref: value("--ref") ?? "forge-webgl-final", out: value("--out") ?? "docs/port/forge-engine-tests.tsv" };
}

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const SCANNED_TREES = ["engine", "tests", "tools", "editor", "src", "game", "project", "builder"];
const SCANNED_SOURCE = /\.(ts|tsx|mts|json)$/;

/**
 * The checkout must read as the tagged commit: no local change under the scanned
 * trees, and any commit after the tag (maintenance mode) touches no TypeScript or
 * JSON there. Otherwise check out the tag first.
 */
function assertAtRef(forge: string, ref: string): string {
  const tagged = git(forge, "rev-parse", `${ref}^{commit}`);
  const dirty = git(forge, "status", "--porcelain", "--", ...SCANNED_TREES);
  if (dirty) throw new Error(`Forge has local changes under the scanned trees:\n${dirty}`);
  const changed = git(forge, "diff", "--name-only", tagged, "HEAD", "--", ...SCANNED_TREES)
    .split("\n")
    .filter((path) => SCANNED_SOURCE.test(path));
  if (changed.length > 0) {
    throw new Error(`Forge HEAD differs from ${ref} in scanned sources; check out the tag first:\n${changed.join("\n")}`);
  }
  return tagged;
}

const ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["@forge-game/module", "src/game/gameModule.ts"],
  ["@forge-game/editor-catalog", "src/game/editorCatalog.ts"],
  ["@/", "src/"],
  ["@engine/", "engine/"],
  ["@editor/", "editor/"],
  ["@builder/", "builder/"],
  ["@game/", "game/"],
  ["@project/", "project/"],
];

interface Reach {
  readonly three: boolean;
  readonly threeMath: boolean;
  readonly oldModel: boolean;
}

const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", "/index.ts", "/index.js"];

class ForgeGraph {
  private readonly root: string;
  private readonly analyses = new Map<string, FileAnalysis>();
  private readonly facts = new Map<string, Reach>();
  private readonly inProgress = new Set<string>();

  constructor(root: string) {
    this.root = root;
  }

  read(path: string): string {
    return readFileSync(join(this.root, path), "utf8");
  }

  analysis(path: string): FileAnalysis {
    let found = this.analyses.get(path);
    if (!found) {
      found = /\.(ts|tsx|mts|mjs|js)$/.test(path) ? analyzeSource(path, this.read(path)) : { valueSpecifiers: [], checks: [] };
      this.analyses.set(path, found);
    }
    return found;
  }

  private isFile(path: string): boolean {
    const full = join(this.root, path);
    return existsSync(full) && statSync(full).isFile();
  }

  /** Repo-relative path of a local module, or null for a package / builtin. */
  resolve(from: string, specifier: string): string | null {
    let base: string | null = null;
    if (specifier.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), specifier));
    else {
      for (const [alias, target] of ALIASES) {
        if (specifier === alias || (alias.endsWith("/") && specifier.startsWith(alias))) {
          base = target + specifier.slice(alias.length);
          break;
        }
      }
    }
    if (base === null) return null;
    const candidates = [...EXTENSIONS.map((extension) => base + extension), base.replace(/\.js$/, ".ts")];
    const hit = candidates.find((candidate) => this.isFile(candidate));
    if (!hit) throw new Error(`cannot resolve ${specifier} from ${from}`);
    return hit;
  }

  /** Value-level three and old-model reach of a local module (transitive; a cycle reads as "not yet"). */
  factsOf(path: string): Reach {
    const known = this.facts.get(path);
    if (known) return known;
    const area = areaOf(path);
    const own: Reach = { three: RENDER_AREAS.has(area), threeMath: false, oldModel: OLD_MODEL_AREAS.has(area) };
    if (this.inProgress.has(path)) return own;
    this.inProgress.add(path);
    let { three, threeMath, oldModel } = own;
    for (const specifier of this.analysis(path).valueSpecifiers) {
      const target = this.resolve(path, specifier);
      if (target === null) {
        if (isThreePackage(specifier)) {
          if (isMathOnlyThreeArea(area)) threeMath = true;
          else three = true;
        }
        continue;
      }
      const facts = this.factsOf(target);
      three ||= facts.three;
      threeMath ||= facts.threeMath;
      oldModel ||= facts.oldModel;
    }
    this.inProgress.delete(path);
    const result: Reach = { three, threeMath, oldModel };
    this.facts.set(path, result);
    return result;
  }

  moduleFacts(from: string, specifier: string): ModuleFacts {
    const path = this.resolve(from, specifier);
    if (path === null) return { path: null, specifier, three: isThreePackage(specifier), threeMath: false, oldModel: false };
    return { path, specifier, ...this.factsOf(path) };
  }
}

interface Row {
  readonly file: string;
  readonly check: FoundCheck;
  readonly verdict: CheckVerdict;
  /** This repo's test file that carries the check (same label), if ported. */
  readonly ported: string | null;
}

/**
 * Labels of the checks this repo already carries: every `check(...)` in a
 * `*.test.ts` under src/. A ported Forge check keeps its label word for word,
 * so a label match is the port record; a label built at run time (a template
 * in a loop) is matched by its source text, which is copied unchanged too.
 */
function collectPortedLabels(repoRoot: string): Map<string, string> {
  const labels = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".test.ts")) {
        for (const check of analyzeSource(path, readFileSync(join(repoRoot, path), "utf8")).checks) {
          if (!labels.has(check.label)) labels.set(check.label, path);
        }
      }
    }
  };
  walk("src");
  return labels;
}

const ENGINE_HARNESS = "tools/engine-tests.ts";

function listEngineTests(forge: string): string[] {
  return readdirSync(join(forge, "tests/engine"))
    .filter((name) => name.endsWith(".test.ts"))
    .sort()
    .map((name) => `tests/engine/${name}`);
}

function classifyFile(graph: ForgeGraph, file: string, ported: ReadonlyMap<string, string>): Row[] {
  return graph.analysis(file).checks.map((check) => {
    const modules = check.specifiers.map((specifier) => graph.moduleFacts(file, specifier));
    const dataPaths = modules.flatMap((module) => (module.path && module.path.endsWith(".json") ? [module.path] : []));
    const classified = classifyCheck(modules, [...check.literals, ...dataPaths]);
    const dropped = droppedCheck(file, check.label);
    const verdict = dropped === null ? classified : { ...classified, cls: "D" as const, reasons: [`dropped:${dropped}`] };
    return { file, check, verdict, ported: ported.get(check.label) ?? null };
  });
}

const cell = (text: string): string => text.replace(/[\t\r\n]+/g, " ").trim();

function toTsv(rows: readonly Row[]): string {
  const header = ["file", "line", "kind", "class", "boundary", "dynamicLabel", "areas", "reasons", "ported", "label"].join("\t");
  const lines = rows.map((row) =>
    [
      row.file,
      String(row.check.line),
      row.check.kind,
      row.verdict.cls,
      row.verdict.boundary ? "yes" : "",
      row.check.dynamicLabel ? "yes" : "",
      row.verdict.areas.join(","),
      row.verdict.reasons.map((reason) => reason.slice(0, 120)).join(","),
      row.ported ?? "",
      cell(row.check.label).slice(0, 240),
    ].join("\t"),
  );
  return `${[header, ...lines].join("\n")}\n`;
}

function count<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return new Map([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

/** Area a check is filed under: its first engine area, else its first area, else "(none)". */
function primaryArea(row: Row): string {
  return row.verdict.areas.find((area) => area.startsWith("engine/")) ?? row.verdict.areas[0] ?? "(none)";
}

function summary(rows: readonly Row[], files: readonly string[], unregistered: readonly string[], sha: string, ref: string): string {
  const byClass = count(rows, (row) => row.verdict.cls);
  const n = (cls: string): number => byClass.get(cls) ?? 0;
  const out: string[] = [];
  out.push(`Forge \`${ref}\` = \`${sha.slice(0, 8)}\`. ${files.length} test dosyası + \`${ENGINE_HARNESS}\` içi kontroller.`);
  out.push("");
  out.push(`| Sınıf | Kontrol yeri | Dinamik etiketli |`);
  out.push(`|---|---|---|`);
  for (const cls of ["A", "M", "R", "D"]) {
    const dynamic = rows.filter((row) => row.verdict.cls === cls && row.check.dynamicLabel).length;
    out.push(`| ${cls} | ${n(cls)} | ${dynamic} |`);
  }
  out.push(`| Toplam | ${rows.length} | ${rows.filter((row) => row.check.dynamicLabel).length} |`);
  const portedA = rows.filter((row) => row.verdict.cls === "A" && row.ported !== null).length;
  const portedOther = rows.filter((row) => row.verdict.cls !== "A" && row.ported !== null).length;
  out.push("");
  out.push(`**Taşınan:** A ${portedA} / ${n("A")}; A dışından etiketiyle taşınan ${portedOther}.`);
  const boundary = rows.filter((row) => row.verdict.boundary);
  const via = (kind: string): number => boundary.filter((row) => row.verdict.reasons.some((reason) => reason.startsWith(kind))).length;
  out.push("");
  out.push(
    `A içinde sınır uyarlaması gereken: ${boundary.length} (eski modele inen ${via("boundary-model")}, three'yi matematik için kullanan motor modülüne inen ${via("boundary-three-math")}).`,
  );
  const harness = rows.filter((row) => row.file === ENGINE_HARNESS);
  const inHarness = (cls: string): number => harness.filter((row) => row.verdict.cls === cls).length;
  out.push(`\`${ENGINE_HARNESS}\` içi: ${harness.length} (A ${inHarness("A")}, M ${inHarness("M")}, R ${inHarness("R")}, D ${inHarness("D")}).`);
  if (unregistered.length > 0) out.push(`Koşucuya bağlı olmayan dosyalar: ${unregistered.join(", ")}.`);
  out.push("");
  out.push("| Alan | A | M | R | D |");
  out.push("|---|---|---|---|---|");
  const areas = count(rows, primaryArea);
  for (const area of areas.keys()) {
    const inArea = rows.filter((row) => primaryArea(row) === area);
    const c = (cls: string): number => inArea.filter((row) => row.verdict.cls === cls).length;
    out.push(`| ${area} | ${c("A")} | ${c("M")} | ${c("R")} | ${c("D")} |`);
  }
  out.push("");
  out.push("| Dosya sınıfı | Dosya |");
  out.push("|---|---|");
  const fileClass = count(files, (file) => {
    const classes = new Set(rows.filter((row) => row.file === file).map((row) => row.verdict.cls));
    if (classes.size === 0) return "kontrolsüz";
    return classes.size === 1 ? `yalnız ${[...classes][0]}` : `karışık (${[...classes].sort().join("+")})`;
  });
  for (const [key, value] of fileClass) out.push(`| ${key} | ${value} |`);
  return out.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const sha = assertAtRef(options.forge, options.ref);
  const graph = new ForgeGraph(options.forge);
  const files = listEngineTests(options.forge);

  // A test file runs if the harness reaches it, directly or through another test file.
  const registered = new Set<string>();
  const queue = [ENGINE_HARNESS];
  while (queue.length > 0) {
    const from = queue.pop()!;
    for (const specifier of graph.analysis(from).valueSpecifiers) {
      const path = graph.resolve(from, specifier);
      if (path?.startsWith("tests/engine/") && !registered.has(path)) {
        registered.add(path);
        queue.push(path);
      }
    }
  }
  const unregistered = files.filter((file) => !registered.has(file));

  const ported = collectPortedLabels(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const rows = [...files, ENGINE_HARNESS].flatMap((file) => classifyFile(graph, file, ported));
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, toTsv(rows), "utf8");
  console.log(summary(rows, files, unregistered, sha, options.ref));
  console.log(`\n${rows.length} rows → ${options.out}`);
}

main();
