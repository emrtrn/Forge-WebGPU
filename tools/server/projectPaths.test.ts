import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createWritePolicy,
  normalizeProjectPath,
  ProjectPathError,
  resolveProjectPath,
  resolveWritablePath,
  type ProjectPathErrorCode,
} from "./projectPaths.ts";

let project: string;
let outside: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-paths-"));
  outside = await mkdtemp(join(tmpdir(), "forge-outside-"));
  await mkdir(join(project, "content/levels"), { recursive: true });
  await writeFile(join(outside, "secret.json"), "{}");
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

function codeOf(work: () => unknown): ProjectPathErrorCode | "none" | "other" {
  try {
    work();
    return "none";
  } catch (error) {
    return error instanceof ProjectPathError ? error.code : "other";
  }
}

describe("normalizeProjectPath", () => {
  test("slashes and dot segments", () => {
    expect(normalizeProjectPath("content\\levels\\.\\main/level.json")).toBe("content/levels/main/level.json");
    expect(normalizeProjectPath("content/a/../b.json")).toBe("content/b.json");
  });

  test.each([
    ["", "not-relative"],
    [".", "not-relative"],
    ["/etc/passwd", "not-relative"],
    ["C:/Windows/win.ini", "not-relative"],
    ["c:relative", "not-relative"],
    ["content/a\0.json", "not-relative"],
    ["../outside.json", "outside-root"],
    ["content/../../outside.json", "outside-root"],
  ])("%j is refused (%s)", (path, code) => {
    expect(codeOf(() => normalizeProjectPath(path))).toBe(code);
  });
});

describe("resolveProjectPath", () => {
  test("a file inside the project, existing or not", () => {
    expect(resolveProjectPath(project, "content/levels/new/level.json")).toBe(join(project, "content/levels/new/level.json"));
  });

  test("a link on the way is refused, also for a file that does not exist yet", async () => {
    // A junction needs no elevated rights on Windows; elsewhere it is a plain directory symlink.
    await symlink(outside, join(project, "content/linked"), "junction");
    expect(codeOf(() => resolveProjectPath(project, "content/linked/secret.json"))).toBe("link");
    expect(codeOf(() => resolveProjectPath(project, "content/linked/new.json"))).toBe("link");
    expect(codeOf(() => resolveProjectPath(project, "content/linked"))).toBe("link");
  });
});

describe("write policy", () => {
  test("writes go under a writable root only", () => {
    const policy = createWritePolicy(project);
    expect(resolveWritablePath(policy, "content/levels/main/level.json").relative).toBe("content/levels/main/level.json");
    expect(codeOf(() => resolveWritablePath(policy, "content"))).toBe("read-only");
    expect(codeOf(() => resolveWritablePath(policy, "contentx/a.json"))).toBe("read-only");
    expect(codeOf(() => resolveWritablePath(policy, "src/main.ts"))).toBe("read-only");
    expect(codeOf(() => resolveWritablePath(policy, "package.json"))).toBe("read-only");
  });

  test("fixtures, samples and dot names are never written", () => {
    const policy = createWritePolicy(project, ["content", "levels-extra"]);
    expect(codeOf(() => resolveWritablePath(policy, "tests/fixtures/assets/content/x.json"))).toBe("read-only");
    expect(codeOf(() => resolveWritablePath(policy, "samples/starter/content/x.json"))).toBe("read-only");
    expect(codeOf(() => resolveWritablePath(policy, "content/.forge-journal/x.json"))).toBe("hidden");
    expect(codeOf(() => resolveWritablePath(policy, "content/levels/.level.json.tmp"))).toBe("hidden");
    expect(resolveWritablePath(policy, "levels-extra/a.json").relative).toBe("levels-extra/a.json");
  });

  test("a writable root cannot be configured over fixtures or samples", () => {
    expect(() => createWritePolicy(project, ["samples/starter/content"])).toThrow(/samples/);
    expect(() => createWritePolicy(project, ["tests"])).toThrow(/tests\/fixtures/);
    expect(() => createWritePolicy(project, ["../elsewhere"])).toThrow(ProjectPathError);
  });

  test("the policy holds the real root path", () => {
    expect(createWritePolicy(join(project, "content/..")).root.toLowerCase()).toBe(project.toLowerCase());
  });
});
