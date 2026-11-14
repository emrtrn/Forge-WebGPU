// What the editor's Content Browser lists (plan phase 4 step 6a; the body of
// `GET /__forge/content`, src/core/edit/contentProtocol.ts), built from a scan
// of the content roots and the asset index over it. Pure: the server passes
// both in.
//
// An asset is listed by its own file: a binary (its meta file is not listed;
// the meta's issues go on the binary), a document (a level by `level.json`).
// The parts of another asset (level cells and indexes, terrain tiles) are not
// listed; their issues go on the level whose folder holds them, when there is
// one. A file the index could not identify (a binary without a meta file, a
// meta without its binary, an unknown JSON) is listed without a GUID, with its
// issues. A folder that holds only parts (a level's `cells/`) is not listed;
// an empty folder is.

import type { AssetIndex, ContentFileBody, ContentIssueBody, ContentListingBody, FileIssue } from "../../src/core/index.ts";
import { fileLabel } from "../../src/core/index.ts";
import type { ScanResult } from "./scan.ts";

function parentOf(label: string): string | null {
  const slash = label.lastIndexOf("/");
  return slash < 0 ? null : label.slice(0, slash);
}

function issueBody(issue: FileIssue): ContentIssueBody {
  return { severity: issue.severity, message: issue.path === "" ? issue.message : `${issue.path}: ${issue.message}` };
}

export function buildContentListing(scan: ScanResult, index: AssetIndex, writable: (label: string) => boolean): ContentListingBody {
  const assetOf = new Map<string, { readonly id: string; readonly type: string }>();
  /** A meta file -> its binary. */
  const binaryOfMeta = new Map<string, string>();
  /** A level's folder -> its `level.json`. */
  const levelOfFolder = new Map<string, string>();
  for (const entry of index.entries.values()) {
    const file = fileLabel(entry.root, entry.path);
    assetOf.set(file, { id: entry.id, type: entry.type });
    if (entry.meta !== null) binaryOfMeta.set(fileLabel(entry.root, entry.meta), file);
    if (entry.type === "forge.level") {
      const folder = parentOf(file);
      if (folder !== null) levelOfFolder.set(folder, file);
    }
  }
  const owner = (file: string): string => {
    const binary = binaryOfMeta.get(file);
    if (binary !== undefined) return binary;
    if (!index.parts.has(file)) return file;
    for (let folder = parentOf(file); folder !== null; folder = parentOf(folder)) {
      const level = levelOfFolder.get(folder);
      if (level !== undefined) return level;
    }
    return file;
  };
  const issues = new Map<string, ContentIssueBody[]>();
  for (const issue of index.issues) {
    const file = owner(issue.file);
    const list = issues.get(file);
    if (list) list.push(issueBody(issue));
    else issues.set(file, [issueBody(issue)]);
  }

  const files: ContentFileBody[] = [];
  for (const file of scan.files) {
    const label = fileLabel(file.root, file.path);
    if (index.parts.has(label) || binaryOfMeta.has(label)) continue;
    const asset = assetOf.get(label);
    const found = issues.get(label);
    files.push({
      file: label,
      ...(asset ? { id: asset.id, type: asset.type } : {}),
      ...(file.revision !== undefined ? { revision: file.revision } : {}),
      ...(found ? { issues: found } : {}),
    });
  }
  // A folder with parts under it and no listed file is the inside of an asset.
  const listed = new Set<string>();
  const withParts = new Set<string>();
  const mark = (file: string, into: Set<string>): void => {
    for (let folder = parentOf(file); folder !== null && !into.has(folder); folder = parentOf(folder)) into.add(folder);
  };
  for (const file of files) mark(file.file, listed);
  for (const part of index.parts) mark(part, withParts);
  return {
    roots: scan.roots.map((label) => ({ label, writable: writable(label) })),
    folders: scan.folders.filter((folder) => listed.has(folder) || !withParts.has(folder)),
    files,
  };
}
