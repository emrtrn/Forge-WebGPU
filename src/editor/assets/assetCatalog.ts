// The project's assets as Details lists them (plan phase 4 step 5b): GUID,
// type and display name. Since step 6a it reads the Content Browser's listing
// (content/contentStore.ts, `GET /__forge/content`) and follows its refreshes:
// Details shows an asset reference by name and its Browse lists the assets of
// the field's type. A name is the file's name up to its first dot (`crate.glb`,
// `red.material.json`). Three-free and DOM-free.

import type { ContentIndex } from "../content/contentModel.ts";

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

/** A live view of the Content Browser's index: each call reads the index as it is now. */
export function assetCatalogOf(index: () => ContentIndex): AssetCatalog {
  let seen: ContentIndex | null = null;
  let listings: AssetListing[] = [];
  const current = (): AssetListing[] => {
    const now = index();
    if (now !== seen) {
      seen = now;
      listings = now.assets
        .filter((asset) => asset.id !== null && asset.type !== null && asset.type !== "forge.level")
        .map((asset) => ({ guid: asset.id!, type: asset.type!, name: asset.name, file: asset.file }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
    }
    return listings;
  };
  return {
    label: (guid) => index().byId(guid)?.name ?? null,
    ofType: (type) => (type === null ? current() : current().filter((listing) => listing.type === type)),
  };
}
