// Layer gate (architecture §4.2, A3).
//
// 1. Repo run: cruise src/ and tools/ with .dependency-cruiser.cjs; any
//    violation fails.
// 2. Self-test: cruise tests/fixtures/layer-violations with the same config;
//    the violations found must equal expected.json exactly. A checker that
//    silently stops catching something fails here (the F02 lesson).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Violation {
  rule: string;
  from: string;
  to: string;
}

interface CruiseSummary {
  violations: Violation[];
  moduleCount: number;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(repoRoot, ".dependency-cruiser.cjs");
const depcruiseBin = join(repoRoot, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs");
const fixtureRoot = join(repoRoot, "tests/fixtures/layer-violations");

function cruise(cwd: string, targets: string[]): CruiseSummary {
  const present = targets.filter((target) => existsSync(join(cwd, target)));
  const result = spawnSync(
    process.execPath,
    [depcruiseBin, "--config", configPath, "--output-type", "json", ...present],
    { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }

  let parsed: {
    modules: unknown[];
    summary: { violations: { rule: { name: string }; from: string; to: string }[] };
  };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `dependency-cruiser produced no JSON for ${cwd} (exit ${result.status}).\n${result.stderr}`,
    );
  }

  return {
    moduleCount: parsed.modules.length,
    violations: parsed.summary.violations.map((violation) => ({
      rule: violation.rule.name,
      from: violation.from,
      to: violation.to,
    })),
  };
}

function checkRepo(): boolean {
  const { violations, moduleCount } = cruise(repoRoot, ["src", "tools", "vite.config.ts"]);
  if (moduleCount === 0) {
    console.error("verify:layers: the repo run cruised no modules; the gate would pass on nothing.");
    return false;
  }
  if (violations.length > 0) {
    console.error(`verify:layers: ${violations.length} layer violation(s):`);
    for (const violation of violations) {
      console.error(`  [${violation.rule}] ${violation.from} -> ${violation.to}`);
    }
    return false;
  }
  console.log(`verify:layers: repo clean (${moduleCount} modules).`);
  return true;
}

function checkSelfTest(): boolean {
  const expected = JSON.parse(
    readFileSync(join(fixtureRoot, "expected.json"), "utf8"),
  ) as { rule: string; from: string }[];
  const { violations } = cruise(fixtureRoot, ["src", "tools"]);

  const key = (entry: { rule: string; from: string }) => `${entry.rule} | ${entry.from}`;
  const expectedKeys = new Set(expected.map(key));
  const foundKeys = new Set(violations.map(key));

  const missed = [...expectedKeys].filter((entry) => !foundKeys.has(entry)).sort();
  const unexpected = [...foundKeys].filter((entry) => !expectedKeys.has(entry)).sort();

  if (missed.length === 0 && unexpected.length === 0) {
    console.log(`verify:layers: self-test caught all ${expectedKeys.size} planted violations.`);
    return true;
  }
  if (missed.length > 0) {
    console.error("verify:layers: self-test MISSED planted violations (rule | file):");
    for (const entry of missed) console.error(`  ${entry}`);
  }
  if (unexpected.length > 0) {
    console.error("verify:layers: self-test reported violations not in expected.json:");
    for (const entry of unexpected) console.error(`  ${entry}`);
  }
  return false;
}

const repoOk = checkRepo();
const selfTestOk = checkSelfTest();
process.exit(repoOk && selfTestOk ? 0 : 1);
