import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fileRevision } from "../assets/revision.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import { JOURNAL_DIR } from "./journal.ts";
import { lockPath, ProjectLockTimeout, withProjectLock } from "./projectLock.ts";
import { createSaveService } from "./transaction.ts";

// A URL, not a path: an ESM import of "C:\..." fails on Windows (the drive reads as a URL scheme).
const LOCK_MODULE = new URL("./projectLock.ts", import.meta.url).href;

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-lock-"));
  await mkdir(join(project, "content"), { recursive: true });
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

const exists = (path: string) => stat(path).then(() => true, () => false);

/** A pid that ran and is gone. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolve) => child.on("exit", resolve));
  return child.pid!;
}

describe("project save lock", () => {
  test("holders on one project run one after another and the lock goes away", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = withProjectLock(project, async () => {
      order.push("first in");
      await gate;
      order.push("first out");
    });
    // The first holds the lock before the second asks for it.
    while (!(await exists(lockPath(project)))) await new Promise((resolve) => setTimeout(resolve, 5));
    const second = withProjectLock(project, async () => {
      order.push("second");
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(order).toEqual(["first in"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first in", "first out", "second"]);
    expect(await exists(lockPath(project))).toBe(false);
  });

  test("a lock held by another running process is waited for", async () => {
    const script = [
      `import { withProjectLock } from ${JSON.stringify(LOCK_MODULE)};`,
      `await withProjectLock(${JSON.stringify(project)}, async () => {`,
      `  process.stdout.write("held\\n");`,
      `  await new Promise((resolve) => setTimeout(resolve, 400));`,
      `});`,
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "inherit"] });
    const exited = new Promise<number>((resolve) => child.on("exit", () => resolve(Date.now())));
    await new Promise<void>((resolve) => child.stdout.on("data", (data: Buffer) => data.toString().includes("held") && resolve()));
    const owner = JSON.parse(await readFile(lockPath(project), "utf8")) as { pid: number; host: string };
    expect(owner).toMatchObject({ pid: child.pid, host: hostname() });
    const acquired = await withProjectLock(project, async () => Date.now());
    expect(acquired).toBeGreaterThanOrEqual((await exited) - 50);
  });

  test("the lock of a process that is gone is taken over", async () => {
    await mkdir(join(project, JOURNAL_DIR), { recursive: true });
    await writeFile(lockPath(project), JSON.stringify({ pid: await deadPid(), host: hostname(), since: "2026-11-15T00:00:00.000Z" }));
    expect(await withProjectLock(project, async () => "ran", { waitMs: 0 })).toBe("ran");
    expect(await exists(lockPath(project))).toBe(false);
  });

  test("a lock of another host, or a fresh unreadable one, is not taken over", async () => {
    await mkdir(join(project, JOURNAL_DIR), { recursive: true });
    await writeFile(lockPath(project), JSON.stringify({ pid: await deadPid(), host: `${hostname()}-elsewhere`, since: "2026-11-15T00:00:00.000Z" }));
    await expect(withProjectLock(project, async () => "ran", { waitMs: 30 })).rejects.toBeInstanceOf(ProjectLockTimeout);
    await expect(withProjectLock(project, async () => "ran", { waitMs: 30 })).rejects.toThrow(/delete .*save\.lock/);

    await writeFile(lockPath(project), "");
    await expect(withProjectLock(project, async () => "ran", { waitMs: 30 })).rejects.toBeInstanceOf(ProjectLockTimeout);
    // Unreadable for longer than a writer would take: its owner died between creating and writing it.
    const old = new Date(Date.now() - 60_000);
    await utimes(lockPath(project), old, old);
    expect(await withProjectLock(project, async () => "ran", { waitMs: 0 })).toBe("ran");
  });

  test("the lock is released when the work throws", async () => {
    await expect(withProjectLock(project, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await exists(lockPath(project))).toBe(false);
  });

  test("two save services on one project: the later save sees the earlier one's revision (409), never overwrites it", async () => {
    const path = "content/data.json";
    await writeFile(join(project, path), "{}\n");
    const base = fileRevision(Buffer.from("{}\n"));
    const policy = createWritePolicy(project);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let checking!: () => void;
    const checked = new Promise<void>((resolve) => (checking = resolve));
    // A slow check keeps the first save between its revision check and its renames.
    const slow = createSaveService({
      policy,
      check: async (file) => {
        checking();
        await gate;
        return { text: file.text, issues: [] };
      },
    });
    const other = createSaveService({ policy });
    const first = slow.commit({ writes: [{ path, base, text: '{"by":"first"}\n' }] });
    await checked;
    const second = other.commit({ writes: [{ path, base, text: '{"by":"second"}\n' }] });
    await new Promise((resolve) => setTimeout(resolve, 60));
    release();
    expect((await first).status).toBe("saved");
    const later = await second;
    expect(later.status).toBe("conflict");
    expect(await readFile(join(project, path), "utf8")).toBe('{"by":"first"}\n');
  });
});
