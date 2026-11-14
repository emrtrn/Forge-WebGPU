// The Content Browser's thumbnails, the editor's side (plan phase 4 step 6b;
// decision 9): a card of a model, a material or a texture asks for its image
// by `<guid>-<revision>` (the listing's revision: a JSON asset's bytes, a
// binary's size, time and meta file). The dev server's cache
// (`.forge-cache/thumbnails`) answers first, in parallel; a miss queues a
// drawing on the viewport's renderer (`draw`, render/editor/thumbnails.ts),
// one at a time between frames, only for cards still in view, and the PNG goes
// back to the server's cache. A card scrolled away and drawn again takes the
// image from memory. Refresh Thumbnail draws again over the cached one (a
// material's textures changed: the material's own revision did not).
// Three-free: the drawing is handed in.

import { FORGE_REQUEST_HEADER } from "../../core/index.ts";
import type { ContentAssetItem } from "./contentModel.ts";
import { ThumbnailQueue } from "./thumbnailQueue.ts";

export type ThumbnailKind = "model" | "material" | "texture";
export type ThumbnailDraw = (kind: ThumbnailKind, guid: string) => Promise<Blob | null>;

const KINDS: Readonly<Record<string, ThumbnailKind>> = {
  "forge.model": "model",
  "forge.material": "material",
  "forge.texture": "texture",
};

/** What a card draws as its thumbnail; null keeps the type's text (a level, a class, a sound). */
export function thumbnailKind(item: Pick<ContentAssetItem, "type">): ThumbnailKind | null {
  return item.type === null ? null : (KINDS[item.type] ?? null);
}

/** The cache key of a card's thumbnail; null when it has none (no kind, no GUID or no revision yet). */
export function thumbnailKey(item: Pick<ContentAssetItem, "type" | "id" | "revision">): string | null {
  if (thumbnailKind(item) === null || item.id === null || item.revision === null) return null;
  return `${item.id}-${item.revision}`;
}

export interface ContentThumbnails {
  /** Fills a card's thumb now or when its image is ready. */
  attach(item: ContentAssetItem, thumb: HTMLElement): void;
  /** The cards in view: waiting drawings of others are dropped. */
  retain(items: readonly ContentAssetItem[]): void;
  /** Draws it again over the cached image. */
  refresh(item: ContentAssetItem): void;
  /** Starts the next drawing when none runs (each editor frame, after the viewport's). */
  pump(): void;
  /** Drawings waiting (the browser checks wait for zero). */
  readonly pending: number;
}

export function createContentThumbnails(options: {
  readonly document: Document;
  readonly fetch: typeof fetch;
  /** Null when the viewport has no renderer: only cached images show. */
  readonly draw: ThumbnailDraw | null;
}): ContentThumbnails {
  const doc = options.document;
  const view = doc.defaultView!;
  const headers = { [FORGE_REQUEST_HEADER]: "1" };
  const queue = new ThumbnailQueue();
  /** Key -> object URL of its image. */
  const urls = new Map<string, string>();
  /** Keys the server's cache was asked for: still answering, or it had none (then they are drawn). */
  const asked = new Map<string, "asking" | "missing">();

  // A card's thumb may not be in the page yet (the grid builds cards before it puts them in).
  const show = (thumb: HTMLElement, url: string): void => {
    const image = doc.createElement("img");
    image.alt = "";
    image.src = url;
    thumb.replaceChildren(image);
    thumb.dataset.thumbnail = "ready";
  };
  const ready = (key: string, blob: Blob): void => {
    const old = urls.get(key);
    if (old) view.URL.revokeObjectURL(old);
    const url = view.URL.createObjectURL(blob);
    urls.set(key, url);
    // Every card of the asset in the page now (one in the grid; a refreshed one too).
    for (const thumb of doc.querySelectorAll<HTMLElement>(`[data-thumbnail-key="${key}"]`)) show(thumb, url);
  };
  const endpoint = (id: string, revision: string): string => `/__forge/thumbnail?id=${encodeURIComponent(id)}&rev=${encodeURIComponent(revision)}`;

  const queueDraw = (item: ContentAssetItem, key: string): void => {
    const draw = options.draw;
    const kind = thumbnailKind(item);
    if (draw === null || kind === null || item.id === null || item.revision === null) return;
    const id = item.id;
    const revision = item.revision;
    queue.request({
      key,
      run: async () => {
        const blob = await draw(kind, id);
        if (blob === null) return;
        ready(key, blob);
        // The cache is the server's; a failed store only costs a drawing next time.
        await options.fetch(endpoint(id, revision), { method: "POST", headers: { ...headers, "Content-Type": "image/png" }, body: blob }).catch(() => undefined);
      },
    });
  };

  return {
    attach(item, thumb) {
      const key = thumbnailKey(item);
      if (key === null) return;
      thumb.dataset.thumbnailKey = key;
      const url = urls.get(key);
      if (url) {
        show(thumb, url);
        return;
      }
      thumb.dataset.thumbnail = "pending";
      const state = asked.get(key);
      if (state === "missing") queueDraw(item, key);
      if (state !== undefined) return;
      asked.set(key, "asking");
      void options
        .fetch(endpoint(item.id!, item.revision!), { headers })
        .then(async (response) => (response.ok ? response.blob() : null))
        .catch(() => null)
        .then((blob) => {
          if (blob) {
            asked.delete(key);
            ready(key, blob);
          } else {
            asked.set(key, "missing");
            queueDraw(item, key);
          }
        });
    },
    retain(items) {
      queue.retain(new Set(items.map(thumbnailKey).filter((key): key is string => key !== null)));
    },
    refresh(item) {
      const key = thumbnailKey(item);
      if (key === null) return;
      queue.forget(key);
      queueDraw(item, key);
    },
    pump() {
      void queue.pump();
    },
    get pending() {
      return queue.size + (queue.busy ? 1 : 0);
    },
  };
}
