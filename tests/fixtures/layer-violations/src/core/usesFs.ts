// Violation: core reads the disk. A Node module in src/ breaks the browser
// build; scanning files is tools/ work.
import { readFileSync } from "node:fs";

export const read = (path: string): string => readFileSync(path, "utf8");
