// Ported from Forge WebGL engine/ui/uiViewModel.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * UI ViewModel-lite store (UMG MVVM analogue).
 *
 * Holds the small, typed field set a UI Widget binds to (e.g. `player.health`)
 * and notifies subscribers only for the fields that actually changed. This is
 * the event-driven alternative to re-reading every binding each frame: the game
 * writes fields with {@link UiViewModelStore.setField}, calls
 * {@link UiViewModelStore.flush} once per tick, and only the widgets bound to a
 * changed path re-render.
 *
 * Paths are opaque dotted strings (`"player.health"`) — there is no expression
 * evaluation, by design (plan: no arbitrary JS binding). Pure: no DOM, no Three.
 */
export type UiFieldValue = string | number | boolean;

export class UiViewModelStore {
  private readonly fields = new Map<string, UiFieldValue>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly dirty = new Set<string>();

  /** Current value at `path`, or undefined when unset. */
  getField(path: string): UiFieldValue | undefined {
    return this.fields.get(path);
  }

  /** Writes `path`; marks it dirty only when the value actually changed. */
  setField(path: string, value: UiFieldValue): void {
    if (this.fields.get(path) === value) return;
    this.fields.set(path, value);
    this.dirty.add(path);
  }

  /** Bulk {@link setField} for a `{ path: value }` record. */
  setFields(record: Readonly<Record<string, UiFieldValue>>): void {
    for (const [path, value] of Object.entries(record)) this.setField(path, value);
  }

  /** Subscribes `listener` to changes at `path`; returns an unsubscribe handle. */
  subscribe(path: string, listener: () => void): () => void {
    let set = this.listeners.get(path);
    if (!set) {
      set = new Set();
      this.listeners.set(path, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(path);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(path);
    };
  }

  /**
   * Notifies the listeners of every dirty path, then clears the dirty set. Each
   * listener fires at most once per flush even when several of its paths changed
   * (batched render), so a node bound to multiple fields re-applies once.
   */
  flush(): void {
    if (this.dirty.size === 0) return;
    const toNotify = new Set<() => void>();
    for (const path of this.dirty) {
      const set = this.listeners.get(path);
      if (set) for (const listener of set) toNotify.add(listener);
    }
    this.dirty.clear();
    for (const listener of toNotify) listener();
  }

  /** Drops all fields + dirty marks (keeps subscriptions). */
  clear(): void {
    this.fields.clear();
    this.dirty.clear();
  }

  /**
   * All fields as a path-sorted `[path, value]` list — for the `?debug` UI
   * inspector. Read-only view; mutate via {@link setField}. Pure: no DOM.
   */
  snapshot(): Array<[string, UiFieldValue]> {
    return [...this.fields.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }
}
