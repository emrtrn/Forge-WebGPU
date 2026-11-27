import { lstat, mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { build } from "vite";
import { buildContent } from "../build-content.ts";
import { scanDist } from "../verify-dist.ts";
import { recordBuild } from "./buildRecord.ts";
import { checkProject, formatProblem } from "./check.ts";

export async function buildProject(options: {
  readonly projectRoot: string;
  readonly engineRoot: string;
  readonly outDir?: string;
  readonly base?: string;
}): Promise<string> {
  const { engineRoot, projectRoot } = options;
  const checked = await checkProject(projectRoot, engineRoot);
  if (!checked.manifest || !checked.ok) throw new Error(checked.problems.map(formatProblem).join("\n"));
  const base = options.base ?? "/";
  if (!/^\/(?:[a-zA-Z0-9_.-]+\/)*$/.test(base) || base.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Build base must be an absolute URL path ending in a slash.");
  }
  const requested = resolve(options.outDir ?? join(projectRoot, ".forge/build"));
  await mkdir(dirname(requested), { recursive: true });
  const parent = await realpath(dirname(requested));
  const output = join(parent, basename(requested));
  try {
    await lstat(output);
    throw new Error(`Build output already exists: ${output}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const work = await mkdtemp(join(parent, ".forge-build-"));
  const staging = await realpath(work);
  const insideParent = relative(parent, staging);
  if (!insideParent || insideParent.startsWith(`..${sep}`) || insideParent === ".." || isAbsolute(insideParent)) {
    throw new Error("Build staging directory is outside the output parent.");
  }
  const previous = process.env.FORGE_PROJECT_ROOT;
  process.env.FORGE_PROJECT_ROOT = projectRoot;
  try {
    await build({ root: engineRoot, configFile: join(engineRoot, "vite.config.ts"), base, build: { outDir: staging, emptyOutDir: true } });
    await buildContent({ outDir: staging, projectRoot, engineRoot });
    const findings = scanDist(staging);
    if (findings.length) throw new Error(findings.map(({ file, reason }) => `${file}: ${reason}`).join("\n"));
    const record = await recordBuild(staging, checked.manifest.id, base);
    await writeFile(join(staging, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`);
    await rename(staging, output);
    return output;
  } finally {
    if (previous === undefined) delete process.env.FORGE_PROJECT_ROOT;
    else process.env.FORGE_PROJECT_ROOT = previous;
    await rm(staging, { recursive: true, force: true });
  }
}
