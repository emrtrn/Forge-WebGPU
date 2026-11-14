// The project's assets as the editor lists them (plan phase 4 step 5b): GUID,
// type and display name, from the dev server's `GET /__forge/asset-files`
// (the list the viewport's asset URLs come from). Details shows an asset
// reference by name and its Browse lists the assets of the field's type; the
// Content Browser (step 6) brings folders, thumbnails and search. A name is
// the file's name up to its first dot (`crate.glb`, `red.material.json`).
// Three-free and DOM-free.

import { FORGE_REQUEST_HEADER } from "../../core/index.ts";

export interface AssetListing {
  readonly guid: string;
  readonly type: string;
  readonly name: string;
  /** `<root label>/<path>` (engine content and packs have their label). */
  readonly file: string;
}

export interface AssetCatalog {
  label(guid: string): string | null;
  /** The assets of a type (every asset for null), by name. */
  ofType(type: string | null): readonly AssetListing[];
}

export function assetCatalogFrom(files: Readonly<Record<string, { readonly type: string; readonly file: string }>>): AssetCatalog {
  const listings = Object.entries(files)
    .map(([guid, entry]): AssetListing => {
      const base = entry.file.slice(entry.file.lastIndexOf("/") + 1);
      const dot = base.indexOf(".");
      return { guid, type: entry.type, name: dot > 0 ? base.slice(0, dot) : base, file: entry.file };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  const byGuid = new Map(listings.map((listing) => [listing.guid, listing]));
  return {
    label: (guid) => byGuid.get(guid)?.name ?? null,
    ofType: (type) => (type === null ? listings : listings.filter((listing) => listing.type === type)),
  };
}

/** The dev server's list; an empty catalog when it cannot be read (Details then shows GUIDs). */
export async function loadAssetCatalog(fetchImpl: typeof fetch): Promise<AssetCatalog> {
  try {
    const response = await fetchImpl("/__forge/asset-files", { headers: { [FORGE_REQUEST_HEADER]: "1" } });
    if (!response.ok) return assetCatalogFrom({});
    const body = (await response.json()) as { assets?: Record<string, { type: string; file: string }> };
    return assetCatalogFrom(body.assets ?? {});
  } catch {
    return assetCatalogFrom({});
  }
}
