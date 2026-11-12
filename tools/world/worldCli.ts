// Shared by the World Builder CLIs.

import { relative, resolve, sep } from "node:path";

/** The engine's samples and test fixtures are read-only (A9): no World Builder run writes there. */
export function refuseEngineFixture(engineRoot: string, projectRoot: string): void {
  for (const folder of ["samples", "tests/fixtures"]) {
    const rel = relative(resolve(engineRoot, folder), resolve(projectRoot));
    if (rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel))) {
      throw new Error(`${projectRoot} is inside the engine's ${folder}/, which is read-only; create a project with npm run create-project`);
    }
  }
}
