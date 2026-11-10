import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { checkProject, formatProblem, GENERATED_TSCONFIG } from "./check.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = join(engineRoot, "tests/fixtures/projects");
const copies: string[] = [];

/** A fixture project copied outside the engine repository. */
async function copy(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `forge-project-${name}-`));
  await cp(join(fixtures, name), target, { recursive: true });
  copies.push(target);
  return target;
}

afterEach(async () => {
  for (const target of copies.splice(0)) await rm(target, { recursive: true, force: true });
});

const lines = (result: Awaited<ReturnType<typeof checkProject>>) => result.problems.map(formatProblem);

describe("forge check", () => {
  test("a project within the contract passes; the generated tsconfig knows the two SDKs only", async () => {
    const project = await copy("good");
    const result = await checkProject(project, engineRoot);
    expect(lines(result)).toEqual([]);
    expect(result.ok).toBe(true);
    const generated = JSON.parse(await readFile(join(project, GENERATED_TSCONFIG), "utf8"));
    expect(Object.keys(generated.compilerOptions.paths)).toEqual(["@forge/sdk", "@forge/editor-sdk"]);
    expect(generated.compilerOptions.paths["@forge/sdk"][0]).toBe(`${engineRoot.split("\\").join("/")}/src/sdk/index.ts`);
    expect(generated.compilerOptions.strict).toBe(true);
  }, 60_000);

  test("every way out of the contract is caught from the AST", async () => {
    const result = await checkProject(await copy("bad-imports"), engineRoot);
    const boundary = result.problems.filter((problem) => !problem.code.startsWith("TS")).map((problem) => `${problem.line} ${problem.code}`);
    expect(boundary).toEqual([
      "3 editor-sdk-outside-editor",
      "4 not-in-contract",
      "5 not-in-contract",
      "6 outside-project",
      "7 not-in-contract",
      "9 not-in-contract",
      "10 not-in-contract",
    ]);
    expect(result.ok).toBe(false);
  }, 60_000);

  test("a project for another SDK version is not compiled at all", async () => {
    const result = await checkProject(await copy("old-sdk"), engineRoot);
    expect(lines(result)).toEqual([
      "forge.project.json sdk-version: Before 1.0 every minor version may break: the project needs SDK 0.0, this engine has 0.1.",
    ]);
  });

  test("a type error against the SDK fails the check with its place", async () => {
    const result = await checkProject(await copy("type-error"), engineRoot);
    expect(result.ok).toBe(false);
    expect(result.problems.map((problem) => `${problem.file}:${problem.line} ${problem.code}`)).toEqual(["src/game.ts:4 TS2322"]);
  }, 60_000);

  test("no manifest, or a broken one, is reported", async () => {
    const empty = await mkdtemp(join(tmpdir(), "forge-project-empty-"));
    copies.push(empty);
    expect((await checkProject(empty, engineRoot)).problems.map((problem) => problem.code)).toEqual(["no-manifest"]);
  });
});
