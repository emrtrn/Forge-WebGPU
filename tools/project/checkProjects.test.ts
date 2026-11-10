import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { checkProjects } from "./checkProjects.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temps: string[] = [];
afterAll(async () => {
  for (const path of temps) await rm(path, { recursive: true, force: true });
});

async function copy(from: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "forge-checkprojects-"));
  temps.push(target);
  await cp(join(engineRoot, from), target, { recursive: true, filter: (source) => !source.includes(".forge") });
  return target;
}

test("each project is checked, its assets gated and its start played headless", async () => {
  const starter = await copy("samples/starter");
  const noLevel = await copy("tests/fixtures/projects/good");
  const badImports = await copy("tests/fixtures/projects/bad-imports");

  const throwing = await copy("samples/starter");
  await writeFile(
    join(throwing, "src/game.ts"),
    'import { defineGameModule } from "@forge/sdk";\nexport default defineGameModule({ id: "starter.main", onBeginPlay: () => { throw new Error("no spawn point"); } });\n',
  );

  const brokenContent = await copy("samples/starter");
  await writeFile(join(brokenContent, "content/levels/main/cells/9_9.json"), "{}");

  const reports = await checkProjects(engineRoot, [starter, noLevel, badImports, throwing, brokenContent]);
  const summary = reports.map((report) => [report.ok, report.start]);
  expect(summary).toEqual([
    [true, "played 3 frames with 2 actor(s)"],
    [true, "nothing to open"],
    [false, "not started"],
    [false, "stopped"],
    [false, "not started"],
  ]);
  expect(reports[3]!.problems[0]).toMatch(/^start: The world could not be started \| no spawn point/);
  expect(reports[4]!.problems.join("\n")).toMatch(/cells\/9_9\.json/);
}, 120_000);
