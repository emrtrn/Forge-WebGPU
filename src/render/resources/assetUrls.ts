// Asset GUID -> URL (architecture §4.9): resolved from the asset index. In
// development the dev server answers `GET /__forge/asset-files` (every binary
// asset's file with its import settings, and every schema-defined JSON asset
// such as a material, read through `/__forge/read`); a production build gets
// its own directory with the build (phase 4 dist work).

import { FORGE_REQUEST_HEADER, type JsonObject } from "../../core/index.ts";

export interface AssetFile {
  /** Asset type, e.g. `forge.model`. */
  readonly type: string;
  /** `<root label>/<path>`: what `/__forge/read?path=` takes. */
  readonly file: string;
  /** A binary asset's normalised import settings; absent for a JSON asset. */
  readonly import?: JsonObject;
}

export interface AssetUrls {
  /** Null when the index has no such asset. */
  url(guid: string): string | null;
  /**
   * A file beside the asset's own, `{stem}` being the asset file's name
   * without `suffix`: a data document's part (`{stem}.tiles/0_0.tile.bin`).
   * Null when the index has no such asset or its file does not end in `suffix`.
   */
  part(guid: string, suffix: string, name: string): string | null;
  type(guid: string): string | null;
  /** A binary asset's import settings; null when unknown or not binary. */
  importSettings(guid: string): JsonObject | null;
  /** Headers a loader sends with each request. */
  readonly headers: Readonly<Record<string, string>>;
}

export function assetUrlsFromIndex(files: Readonly<Record<string, AssetFile>>, readUrl: (file: string) => string, headers: Record<string, string> = {}): AssetUrls {
  return {
    url: (guid) => {
      const found = files[guid];
      return found ? readUrl(found.file) : null;
    },
    part: (guid, suffix, name) => {
      const found = files[guid];
      if (!found || !found.file.endsWith(suffix)) return null;
      const slash = found.file.lastIndexOf("/");
      const stem = found.file.slice(slash + 1, -suffix.length);
      return readUrl(`${found.file.slice(0, slash + 1)}${name.replaceAll("{stem}", stem)}`);
    },
    type: (guid) => files[guid]?.type ?? null,
    importSettings: (guid) => files[guid]?.import ?? null,
    headers,
  };
}

/** The dev server's asset files, read once at boot. */
export async function loadDevAssetUrls(fetchJson: (url: string, headers: Record<string, string>) => Promise<unknown>): Promise<AssetUrls> {
  const headers = { [FORGE_REQUEST_HEADER]: "1" };
  const body = (await fetchJson("/__forge/asset-files", headers)) as { assets?: Record<string, AssetFile> };
  return assetUrlsFromIndex(body.assets ?? {}, (file) => `/__forge/read?path=${encodeURIComponent(file)}`, headers);
}
