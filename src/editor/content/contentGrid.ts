// The Content Browser's card grid, virtualised (plan phase 4 step 6a; the
// Outliner's pattern, step 5a): Forge WebGL's grid (`.content-list`,
// `repeat(auto-fill, minmax(<card>, 1fr))`, fixed row height per thumbnail
// size, 8 px gap) laid out by hand, so only the rows in view have cards. The
// column count is what `auto-fill` would give for the list's width.

export type ContentViewSize = "small" | "medium" | "large";

/** Forge's sizes (editorUi.css `.content-list`, `[data-content-view]`): narrowest card and row height. */
export const CONTENT_VIEW_SIZES: Readonly<Record<ContentViewSize, { readonly min: number; readonly row: number }>> = {
  small: { min: 66, row: 95 },
  medium: { min: 90, row: 118 },
  large: { min: 122, row: 150 },
};
export const CONTENT_GRID_GAP = 8;
/** Rows drawn above and below the view. */
const OVERSCAN = 2;

export interface GridWindow {
  readonly columns: number;
  /** Height of every row, the gaps between them included. */
  readonly height: number;
  /** First and one-past-last item drawn. */
  readonly first: number;
  readonly end: number;
  /** Where the first drawn row starts. */
  readonly top: number;
}

export function gridWindow(width: number, scrollTop: number, viewHeight: number, count: number, size: ContentViewSize): GridWindow {
  const { min, row } = CONTENT_VIEW_SIZES[size];
  const columns = Math.max(1, Math.floor((Math.max(0, width) + CONTENT_GRID_GAP) / (min + CONTENT_GRID_GAP)));
  const rows = Math.ceil(count / columns);
  const pitch = row + CONTENT_GRID_GAP;
  const height = rows === 0 ? 0 : rows * pitch - CONTENT_GRID_GAP;
  const firstRow = Math.max(0, Math.floor(scrollTop / pitch) - OVERSCAN);
  const lastRow = Math.min(rows, Math.ceil((scrollTop + viewHeight) / pitch) + OVERSCAN);
  return { columns, height, first: Math.min(count, firstRow * columns), end: Math.min(count, lastRow * columns), top: firstRow * pitch };
}

/** The scroll position that shows row `index` of a grid: unchanged when it is in view. */
export function revealGridTop(index: number, columns: number, scrollTop: number, viewHeight: number, size: ContentViewSize): number {
  const pitch = CONTENT_VIEW_SIZES[size].row + CONTENT_GRID_GAP;
  const top = Math.floor(index / columns) * pitch;
  if (top < scrollTop) return top;
  if (top + pitch > scrollTop + viewHeight) return top + pitch - viewHeight;
  return scrollTop;
}

export interface ContentGrid<T> {
  set(items: readonly T[], size: ContentViewSize): void;
  /** Scrolls item `index` into view. */
  reveal(index: number): void;
  /** Draws the cards in view again (a selection change). */
  draw(): void;
}

export function createContentGrid<T>(options: {
  readonly document: Document;
  /** The scrolling `.content-list`. */
  readonly list: HTMLElement;
  readonly card: (item: T) => HTMLElement;
}): ContentGrid<T> {
  const doc = options.document;
  const sizer = doc.createElement("div");
  sizer.className = "content-list-sizer";
  const grid = doc.createElement("div");
  grid.className = "content-list-grid";
  sizer.append(grid);
  options.list.append(sizer);
  let items: readonly T[] = [];
  let size: ContentViewSize = "medium";
  let frame: number | null = null;

  const draw = (): void => {
    const view = gridWindow(options.list.clientWidth, options.list.scrollTop, options.list.clientHeight || 400, items.length, size);
    sizer.style.height = `${view.height}px`;
    grid.style.top = `${view.top}px`;
    grid.style.gridTemplateColumns = `repeat(${view.columns}, minmax(0, 1fr))`;
    grid.style.gridAutoRows = `${CONTENT_VIEW_SIZES[size].row}px`;
    grid.replaceChildren(...items.slice(view.first, view.end).map(options.card));
  };
  const schedule = (): void => {
    if (frame !== null) return;
    frame = doc.defaultView?.requestAnimationFrame(() => {
      frame = null;
      draw();
    }) ?? null;
  };
  options.list.addEventListener("scroll", schedule, { passive: true });
  const View = doc.defaultView as (Window & typeof globalThis) | null;
  if (View?.ResizeObserver) new View.ResizeObserver(schedule).observe(options.list);

  return {
    set(next, nextSize) {
      items = next;
      size = nextSize;
      draw();
    },
    reveal(index) {
      const view = gridWindow(options.list.clientWidth, options.list.scrollTop, options.list.clientHeight, items.length, size);
      options.list.scrollTop = revealGridTop(index, view.columns, options.list.scrollTop, options.list.clientHeight, size);
      draw();
    },
    draw,
  };
}
