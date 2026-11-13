// Asset GUID -> URL (architecture §4.9): resolved from the asset index. In
// development the dev server answers `GET /__forge/asset-files` (every binary
// asset's file, read through `/__forge/read`); a production build gets its
// own directory with the build (phase 4 dist work).

import { FORGE_REQUEST_HEADER } from "../../core/index.ts";

export interface AssetFile {
  /** Asset type, e.g. `forge.model`. */
  readonly type: string;
  /** `<root label>/<path>`: what `/__forge/read?path=` takes. */
  readonly file: string;
}

export interface AssetUrls {
  /** Null when the index has no such asset. */
  url(guid: string): string | null;
  type(guid: string): string | null;
  /** Headers a loader sends with each request. */
  readonly headers: Readonly<Record<string, string>>;
}

export function assetUrlsFromIndex(files: Readonly<Record<string, AssetFile>>, readUrl: (file: string) => string, headers: Record<string, string> = {}): AssetUrls {
  return {
    url: (guid) => {
      const found = files[guid];
      return found ? readUrl(found.file) : null;
    },
    type: (guid) => files[guid]?.type ?? null,
    headers,
  };
}

/** The dev server's asset files, read once at boot. */
export async function loadDevAssetUrls(fetchJson: (url: string, headers: Record<string, string>) => Promise<unknown>): Promise<AssetUrls> {
  const headers = { [FORGE_REQUEST_HEADER]: "1" };
  const body = (await fetchJson("/__forge/asset-files", headers)) as { assets?: Record<string, AssetFile> };
  return assetUrlsFromIndex(body.assets ?? {}, (file) => `/__forge/read?path=${encodeURIComponent(file)}`, headers);
}
