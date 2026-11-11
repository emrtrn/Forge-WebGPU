// Violation: a test under src/ may use node:assert and nothing else from Node.
// Reading fixtures from disk belongs in tools/ tests.
import { readFileSync } from "node:fs";

export const read = (path: string): string => readFileSync(path, "utf8");
