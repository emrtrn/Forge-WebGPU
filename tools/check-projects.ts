// npm run check:projects: samples/* and this machine's registered projects
// against the engine as it is now (tools/project/checkProjects.ts).

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProjects, formatReport } from "./project/checkProjects.ts";
import { projectsToCheck } from "./project/localProjects.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = await projectsToCheck(engineRoot);
if (roots.length === 0) {
  console.log("check:projects: no project to check.");
} else {
  const reports = await checkProjects(engineRoot, roots);
  for (const report of reports) for (const line of formatReport(report, engineRoot)) console.log(`check:projects: ${line}`);
  if (reports.some((report) => !report.ok)) process.exitCode = 1;
}
