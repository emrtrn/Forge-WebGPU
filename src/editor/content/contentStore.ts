// The editor's view of the project's content (plan phase 4 step 6a): the dev
// server's listing (`GET /__forge/content`) as the Content Browser's index,
// and the asset catalog Details reads names and Browse lists from. A refresh
// asks again (the server rescans after a save, and on `force`); listeners
// hear the new index. DOM-free.

import { FORGE_REQUEST_HEADER, type ContentListingBody, type ContentOpBody, type ContentOpResponseBody } from "../../core/index.ts";
import { assetCatalogOf, type AssetCatalog } from "../assets/assetCatalog.ts";
import { buildContentIndex, type ContentIndex } from "./contentModel.ts";

export interface ContentStore {
  index(): ContentIndex;
  /** Details' view of the same index. */
  readonly catalog: AssetCatalog;
  /** Asks the server again; `force` makes it rescan the disk. Resolves false when the listing cannot be read. */
  refresh(force?: boolean): Promise<boolean>;
  /** A file operation (step 6c): the server plans and saves it; the listing is read again after it. */
  op(body: ContentOpBody): Promise<ContentOpResponseBody>;
  /** Called with each new index; returns the unsubscribe. */
  onChange(listener: (index: ContentIndex) => void): () => void;
}

const EMPTY: ContentListingBody = { roots: [], folders: [], files: [] };

async function fetchListing(fetchImpl: typeof fetch, force: boolean): Promise<ContentListingBody | null> {
  try {
    const response = await fetchImpl(`/__forge/content${force ? "?refresh=1" : ""}`, { headers: { [FORGE_REQUEST_HEADER]: "1" } });
    if (!response.ok) return null;
    return (await response.json()) as ContentListingBody;
  } catch {
    return null;
  }
}

/**
 * Reads the listing, the disk rescanned (a page load sees what changed outside the editor); an empty
 * index when it cannot be read (Details then shows GUIDs).
 */
export async function createContentStore(fetchImpl: typeof fetch): Promise<ContentStore> {
  let index = buildContentIndex((await fetchListing(fetchImpl, true)) ?? EMPTY);
  const listeners = new Set<(index: ContentIndex) => void>();
  /** Refreshes run one after another, so the last answer is the newest. */
  let queue: Promise<unknown> = Promise.resolve();
  const store: ContentStore = {
    async op(body) {
      let answer: ContentOpResponseBody;
      try {
        const response = await fetchImpl("/__forge/content", {
          method: "POST",
          headers: { [FORGE_REQUEST_HEADER]: "1", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        answer = (await response.json()) as ContentOpResponseBody;
      } catch (error) {
        return { status: "refused", reason: "request", message: error instanceof Error ? error.message : String(error) };
      }
      if (answer.status === "done") await store.refresh();
      return answer;
    },
    index: () => index,
    catalog: assetCatalogOf(() => index),
    refresh(force = false) {
      const run = queue.then(async () => {
        const listing = await fetchListing(fetchImpl, force);
        if (listing === null) return false;
        index = buildContentIndex(listing);
        for (const listener of [...listeners]) listener(index);
        return true;
      });
      queue = run;
      return run;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}
