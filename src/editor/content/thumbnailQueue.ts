// The Content Browser's thumbnail work queue (plan phase 4 step 6b): one job
// per thumbnail key (`<guid>-<revision>`), first asked first done, one at a
// time (a job draws on the viewport's GPU between its frames). Cards scrolled
// out of view drop their waiting jobs (`retain`); a key is done once, failed
// or not, until it is forgotten (Refresh Thumbnail). A hold (a file operation
// in flight) starts no job until it is released; `idle` waits for the one
// running. Pure.

export interface ThumbnailJob {
  readonly key: string;
  run(): Promise<void>;
}

export class ThumbnailQueue {
  private readonly waiting = new Map<string, ThumbnailJob>();
  private readonly done = new Set<string>();
  private running: string | null = null;
  private current: Promise<void> | null = null;
  private holds = 0;

  /** No job starts until the returned release is called (once; later calls do nothing). */
  hold(): () => void {
    this.holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds -= 1;
    };
  }

  /** Resolves when the running job (if any) has ended. */
  idle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }

  /** Queues a job unless its key is waiting, running or done. */
  request(job: ThumbnailJob): void {
    if (this.done.has(job.key) || this.running === job.key || this.waiting.has(job.key)) return;
    this.waiting.set(job.key, job);
  }

  /** Drops the waiting jobs whose key is not among `keys` (the cards in view). */
  retain(keys: ReadonlySet<string>): void {
    for (const key of [...this.waiting.keys()]) if (!keys.has(key)) this.waiting.delete(key);
  }

  /** The key can be drawn again. */
  forget(key: string): void {
    this.done.delete(key);
  }

  get busy(): boolean {
    return this.running !== null;
  }

  get size(): number {
    return this.waiting.size;
  }

  /** Starts the next job when none runs and nothing holds the queue; resolves when it ends (null when nothing started). */
  pump(): Promise<void> | null {
    if (this.running !== null || this.holds > 0) return null;
    const next = this.waiting.values().next();
    if (next.done) return null;
    const job = next.value;
    this.waiting.delete(job.key);
    this.running = job.key;
    const current = job.run().then(
      () => this.finish(job.key),
      () => this.finish(job.key),
    );
    this.current = current;
    return current;
  }

  private finish(key: string): void {
    this.done.add(key);
    if (this.running === key) {
      this.running = null;
      this.current = null;
    }
  }
}
