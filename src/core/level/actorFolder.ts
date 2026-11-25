// Outliner folders (user decision 2026-11-25, as Unreal's Outliner): a path
// such as `World/Fences` an actor carries. Editor data like `pivot`: the world
// and the game never read it, and it decides neither the actor's cell nor its
// transform (a child actor lives in its root's cell, so grouping a generated
// world under a parent would break streaming). Folders are made of the paths
// actors carry; there is no folder object. A child shows under its parent and
// its own path waits until it is a root again.

export const FOLDER_SEPARATOR = "/";

/** The path with trimmed names and no empty ones; "" is the level root. */
export function normalizeFolder(path: string): string {
  return path.split(FOLDER_SEPARATOR).map((name) => name.trim()).filter((name) => name !== "").join(FOLDER_SEPARATOR);
}

/** The folder a folder is in; "" at the root. */
export function parentFolder(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf(FOLDER_SEPARATOR)));
}

/** The last name of a folder path. */
export function folderName(path: string): string {
  return path.slice(path.lastIndexOf(FOLDER_SEPARATOR) + 1);
}

/** Whether `path` is `folder` or inside it. */
export function isInFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}${FOLDER_SEPARATOR}`);
}

/** `path` with the leading `from` replaced by `to` ("" drops it); a path outside `from` is unchanged. */
export function rebaseFolder(path: string, from: string, to: string): string {
  return isInFolder(path, from) ? normalizeFolder(`${to}${path.slice(from.length)}`) : path;
}
