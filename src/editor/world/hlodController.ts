import type { HlodBuildRequest, HlodBuildStatus } from "../../core/level/hlodBuild.ts";
import { HLOD_DIR, HLOD_INDEX_FILE } from "../../core/level/hlod.ts";
import { FOLIAGE_DIR, FOLIAGE_INDEX_FILE } from "../../core/level/foliage.ts";

export interface HlodControllerOptions {
  readonly level: string;
  readonly writable: boolean;
  /** Caller supplies a project + level scoped key; used verbatim. */
  readonly preferenceKey: string;
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly dirty: () => boolean;
  readonly save: () => Promise<{ ok: boolean; message: string }>;
  readonly request: (request: HlodBuildRequest) => Promise<HlodBuildStatus>;
  readonly poll: () => Promise<HlodBuildStatus>;
  /** A new publication is on disk; `status.completedAt` tells the adapter whether it already shows it. */
  readonly reload: (status: HlodBuildStatus) => Promise<void>;
  readonly status?: (message: string, tone?: "info" | "warning" | "error") => void;
}

export interface HlodControllerSnapshot {
  readonly auto: boolean;
  readonly writable: boolean;
  readonly dirty: boolean;
  /** Effective status: stable disk results become stale while edits are unsaved. */
  readonly status: HlodBuildStatus;
  /** Includes an explicit save, a request, and a checking/building/queued job. */
  readonly busy: boolean;
}

export interface HlodController {
  start(): void;
  edited(): void;
  saved(): void;
  diskChanged(paths: readonly string[]): void;
  setAuto(enabled: boolean): void;
  /** Resolves after explicit save/request; a remote job continues via polling. */
  generate(): Promise<void>;
  snapshot(): HlodControllerSnapshot;
  onChange(listener: () => void): () => void;
  dispose(): void;
}

const DEBOUNCE_MS = 400;
const POLL_MS = 500;
const active = (status: HlodBuildStatus) => status.queued || status.state === "checking" || status.state === "building";
const normalizePath = (path: string) => path.replace(/\\/g, "/").replace(/^(?:\.\/|\/)+|\/$/g, "").toLowerCase();

// Level parts that never feed HLOD: its own outputs (a watcher loop otherwise) and painted foliage.
const IGNORED_LEVEL_PARTS = [HLOD_INDEX_FILE, HLOD_DIR, FOLIAGE_INDEX_FILE, FOLIAGE_DIR].map((name) => name.toLowerCase());

function dependencyCandidate(path: string, level: string): boolean {
  const file = normalizePath(path);
  if (/\.(?:tile|global)\.bin(?:\.meta\.json)?$/.test(file)) return false;
  const own = normalizePath(level).replace(/^content\//, "");
  const relative = file.replace(/^content\//, "");
  if (relative === own) return true;
  if (relative.startsWith(`${own}/`)) {
    // The part itself, its files and sidecars (`hlod.json.meta.json`, `foliage/0_0.bin`).
    const inner = relative.slice(own.length + 1);
    if (IGNORED_LEVEL_PARTS.some((part) => inner === part || inner.startsWith(`${part}/`) || inner.startsWith(`${part}.`))) return false;
  } else if (/(^|\/)levels\//.test(relative)) return false;
  // These are dependency candidates, not assertions that every asset affects HLOD.
  // The service decides freshness from the actual dependency stamp.
  return /\.(?:json|glb|gltf|bin|obj|fbx|png|jpe?g|webp|ktx2?|dds|tga|basis|hdr|exr)$/.test(file);
}

/** Transport-free authoring coordinator. Adapters own HTTP and scene reloading. */
export function createHlodController(options: HlodControllerOptions): HlodController {
  let auto = true;
  try {
    const stored = options.storage?.getItem(options.preferenceKey)?.trim().toLowerCase();
    auto = !["false", "0", "off", "no"].includes(stored ?? "");
  } catch { /* Storage can be denied by the host. */ }

  let disposed = false;
  let started = false;
  let generation = 0;
  let diskStatus: HlodBuildStatus = { level: options.level, state: "missing", queued: false, publication: null };
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshWanted = false;
  let requestFlight: Promise<void> | null = null;
  let manualFlight: Promise<void> | null = null;
  let reloadQueue = Promise.resolve();
  const publications = new Set<string>();
  const listeners = new Set<() => void>();

  function emit(): void {
    if (!disposed) for (const listener of [...listeners]) {
      if (disposed) break;
      listener();
    }
  }

  function report(message: string, tone: "info" | "warning" | "error"): void {
    if (!disposed) options.status?.(message, tone);
  }

  function cancelRefresh(): void {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
    refreshWanted = false;
  }

  function cancelPoll(): void {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  const live = (token: number) => !disposed && token === generation;

  function fail(error: unknown, token: number): void {
    if (!live(token)) return;
    cancelPoll();
    const message = error instanceof Error ? error.message : String(error);
    diskStatus = { ...diskStatus, state: "failed", queued: false, message };
    report(message, "error");
    emit();
  }

  function accept(status: HlodBuildStatus, token: number): void {
    if (!live(token)) return;
    diskStatus = { ...status };
    if (status.state === "failed") report(status.message ?? "HLOD generation failed", "error");
    if (status.state === "current" && !status.queued && status.publication !== null && !publications.has(status.publication)) {
      publications.add(status.publication);
      // Serialize publications so an older reload cannot finish after a newer reload.
      // Disposal also prevents queued reloads from starting.
      reloadQueue = reloadQueue.then(async () => {
        if (disposed) return;
        try { await options.reload(status); }
        catch (error) {
          if (live(token)) report(`HLOD reload failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
      });
    }
    if (active(status)) {
      cancelPoll();
      pollTimer = setTimeout(() => { void pollStatus(token); }, POLL_MS);
    }
    emit();
  }

  async function pollStatus(token: number): Promise<void> {
    pollTimer = undefined;
    if (!live(token)) return;
    try { accept(await options.poll(), token); }
    catch (error) { fail(error, token); }
  }

  function scheduleRefresh(): void {
    if (disposed || !started) return;
    refreshWanted = true;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (disposed || requestFlight || manualFlight) return;
      refreshWanted = false;
      void send(false);
    }, DEBOUNCE_MS);
  }

  function send(force: boolean): Promise<void> {
    const token = ++generation;
    cancelPoll();
    if (!active(diskStatus)) diskStatus = { ...diskStatus, state: "checking", queued: false };
    // Deferring the adapter call also makes the single-flight guard visible to listeners.
    const flight = Promise.resolve().then(async () => {
      if (!live(token)) return;
      // Re-read at dispatch: listeners may have edited or disabled auto since send().
      const build = options.writable && (force || auto) && !options.dirty();
      try { accept(await options.request({ level: options.level, build, force }), token); }
      catch (error) { fail(error, token); }
    }).finally(() => {
      if (!live(token)) return;
      requestFlight = null;
      if (refreshWanted) scheduleRefresh();
      emit();
    });
    requestFlight = flight;
    emit();
    return flight;
  }

  function generate(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (!options.writable) {
      report("This level is read-only; HLOD cannot be generated", "warning");
      return Promise.resolve();
    }
    if (manualFlight) return manualFlight;
    cancelRefresh();
    const flight = Promise.resolve().then(async () => {
      if (disposed) return;
      if (requestFlight) {
        await requestFlight;
        if (disposed) return;
      }
      if (options.dirty()) {
        let result: { ok: boolean; message: string };
        try { result = await options.save(); }
        catch (error) {
          if (!disposed) {
            cancelRefresh();
            report(error instanceof Error ? error.message : String(error), "error");
          }
          return;
        }
        if (disposed) return;
        // The explicit save consumes its own saved()/disk notifications.
        cancelRefresh();
        emit();
        if (!result.ok) { report(result.message, "error"); return; }
        if (options.dirty()) {
          report("New edits arrived while saving; save again to generate HLOD", "warning");
          return;
        }
      }
      if (!disposed) await send(true);
    }).finally(() => {
      if (disposed) return;
      manualFlight = null;
      if (refreshWanted) scheduleRefresh();
      emit();
    });
    manualFlight = flight;
    emit();
    return flight;
  }

  return {
    start() {
      if (disposed || started) return;
      started = true;
      if (!manualFlight && !requestFlight) void send(false);
    },
    edited: emit,
    saved() { emit(); scheduleRefresh(); },
    diskChanged(paths) {
      if (paths.some((path) => dependencyCandidate(path, options.level))) scheduleRefresh();
    },
    setAuto(enabled) {
      if (disposed || enabled === auto) return;
      auto = enabled;
      try { options.storage?.setItem(options.preferenceKey, String(enabled)); }
      catch { /* Preference still works for this session. */ }
      emit();
      if (enabled && !options.dirty()) scheduleRefresh();
    },
    generate,
    snapshot() {
      const dirty = options.dirty();
      const status = dirty && !active(diskStatus) && diskStatus.state !== "failed"
        ? { ...diskStatus, state: "stale" as const, message: "Unsaved changes; HLOD needs an update" }
        : { ...diskStatus };
      return { auto, writable: options.writable, dirty, status,
        busy: manualFlight !== null || requestFlight !== null || active(diskStatus) };
    },
    onChange(listener) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      cancelRefresh();
      cancelPoll();
      listeners.clear();
    },
  };
}
