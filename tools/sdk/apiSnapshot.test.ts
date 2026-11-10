import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { changelogApiHash, createApiSnapshot, snapshotHash } from "./apiSnapshot.ts";

let root: string;

beforeEach(async () => {
  root = (await mkdtemp(join(tmpdir(), "forge-sdk-api-"))).split("\\").join("/");
  await mkdir(join(root, "src/api"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function surface(inner: string): Promise<string> {
  await writeFile(join(root, "src/api/inner.ts"), inner);
  await writeFile(
    join(root, "src/api/index.ts"),
    [
      'import type { Options } from "./inner.ts";',
      "export const VERSION = \"1.0.0\";",
      "export interface Thing { readonly id: string; size?: number }",
      "export type Kind = \"a\" | \"b\";",
      "export function make(options: Options): Thing { return { id: options.name }; }",
    ].join("\n"),
  );
  return createApiSnapshot(root, ["src/api/index.ts"]);
}

describe("createApiSnapshot", () => {
  test("lists exports by kind, sorted, and the types they reach", async () => {
    const text = await surface("export interface Options { readonly name: string; retries?: number }");
    expect(text).toBe(
      [
        "# src/api/index.ts",
        "",
        'type Kind = "a" | "b"',
        "",
        "interface Thing",
        "  readonly id: string",
        "  size?: number | undefined",
        "",
        'const VERSION: "1.0.0"',
        "",
        "function make(options: Options): Thing",
        "",
        "# referenced (not exported, part of the surface)",
        "",
        "interface Options  // src/api/inner.ts",
        "  readonly name: string",
        "  retries?: number | undefined",
        "",
      ].join("\n"),
    );
  });

  test("a change in a type the exports only reach still changes the snapshot", async () => {
    const before = await surface("export interface Options { readonly name: string }");
    const after = await surface("export interface Options { readonly name: string; strict: boolean }");
    expect(snapshotHash(after)).not.toBe(snapshotHash(before));
    expect(await surface("export interface Options { readonly name: string }")).toBe(before);
  });

  test("an SDK that does not compile is an error", async () => {
    await expect(surface("export interface Options { name: Missing }")).rejects.toThrow(/does not compile/);
  });
});

describe("changelogApiHash", () => {
  test("reads the newest entry only", () => {
    const changelog = "# log\n\n## 0.2.0\n\nAPI: 1111111111111111\n\nText.\n\n## 0.1.0\n\nAPI: 2222222222222222\n";
    expect(changelogApiHash(changelog)).toBe("1111111111111111");
    expect(changelogApiHash("# log\n\n## 0.2.0\n\nNo hash.\n\n## 0.1.0\n\nAPI: 2222222222222222\n")).toBeNull();
    expect(changelogApiHash("# log\n")).toBeNull();
  });
});
