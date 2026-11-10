// File revisions (architecture §4.6, A11): the first 16 hex digits of the
// SHA-256 of a file's bytes. Computed here, where the bytes are; core carries
// revisions as opaque values and only compares them.

import { createHash } from "node:crypto";

export function fileRevision(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
