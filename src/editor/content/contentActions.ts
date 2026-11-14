// The Content Browser's file operations, the editor's side (plan phase 4 step
// 6c; INV-A24; Forge WebGL's openAssetContextMenu / openContentFolderContextMenu,
// renameContentAsset, setContentClipboard / pasteContent, deleteContentAsset
// @ forge-webgl-final): Rename (F2, in place, like the Outliner's), Cut / Copy
// / Paste (Ctrl + X / C / V, the browser's own clipboard; a cut card is dimmed
// until the paste), Copy Path, Delete (Del, after Forge's confirm). The server
// plans and saves each one (`POST /__forge/content`); a refusal is shown, and
// a delete refused because the asset is in use lists who uses it (decision 1
// of step 6): picking one shows it in the browser.
//
// The level the editor has open is locked against rename, cut and delete
// (Forge's active level); so is anything under a read-only root, which can
// still be copied (into the project). An asset the open level uses in edits
// not saved yet is not deleted either (`inUse`). The keys are the drawer's
// while it has the focus; elsewhere they are the actors'.

import type { ContentOpBody, ContentOpResponseBody } from "../../core/index.ts";
import { openPicker } from "../details/pickerPopover.ts";
import type { ContextMenuItem } from "../ui/contextMenu.ts";
import { isWithin, type ContentAssetItem, type ContentFolderNode, type ContentIndex } from "./contentModel.ts";
import type { ContentStore } from "./contentStore.ts";

export interface ContentActionsOptions {
  readonly document: Document;
  readonly store: ContentStore;
  /** Where the referrer list opens (the drawer). */
  readonly host: HTMLElement;
  /** The open level's folder: never renamed, moved or deleted from here. */
  readonly activeLevel: string;
  /** Names of the open level's actors that use any of these GUIDs (the session, saved or not). */
  readonly inUse?: (ids: readonly string[]) => readonly string[];
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** After an operation: the paths it made, to show and select. */
  readonly done: (paths: readonly string[]) => void;
  /** Shows a file or folder in the browser. */
  readonly reveal: (path: string) => void;
}

/** What a card or row stands for: its path (a level's is its folder), name and whether it is written here. */
export interface ContentTarget {
  readonly path: string;
  readonly name: string;
  readonly folder: boolean;
  readonly writable: boolean;
}

export const targetOfAsset = (item: ContentAssetItem): ContentTarget => ({ path: item.levelFolder ?? item.file, name: item.name, folder: false, writable: item.writable });
export const targetOfFolder = (node: ContentFolderNode): ContentTarget => ({ path: node.path, name: node.name, folder: true, writable: node.writable });

export interface ContentActions {
  assetMenu(item: ContentAssetItem, folder: string): ContextMenuItem[];
  folderMenu(node: ContentFolderNode): ContextMenuItem[];
  /** Right click on the open folder's empty space. */
  emptyMenu(folder: ContentFolderNode): ContextMenuItem[];
  /** The drawer's keys; true when the key was taken. */
  key(event: KeyboardEvent, selected: ContentTarget | null, folder: ContentFolderNode | null): boolean;
  isCut(path: string): boolean;
}

export function createContentActions(options: ContentActionsOptions): ContentActions {
  const doc = options.document;
  let clipboard: { readonly paths: readonly string[]; readonly mode: "copy" | "move"; readonly label: string } | null = null;
  const index = (): ContentIndex => options.store.index();
  const locked = (target: ContentTarget): string | null => {
    if (!target.writable) return "Salt okunur (motor içeriği / paket): kopyalanabilir, değiştirilemez.";
    if (isWithin(options.activeLevel, target.path)) return "Açık level kilitli: önce başka bir level açın.";
    return null;
  };
  const refused = (answer: Extract<ContentOpResponseBody, { status: "refused" }>): void => options.status(answer.message, "error");
  const run = async (body: ContentOpBody, success: string): Promise<boolean> => {
    const answer = await options.store.op(body);
    if (answer.status === "refused") {
      refused(answer);
      return false;
    }
    options.status(success);
    options.done(answer.result);
    return true;
  };

  const copyPath = (path: string): void => {
    const clip = doc.defaultView?.navigator.clipboard;
    if (!clip) options.status(`Path: ${path}`);
    else clip.writeText(path).then(() => options.status(`Copied ${path}`), () => options.status(`Path: ${path}`));
  };

  const setClipboard = (target: ContentTarget, mode: "copy" | "move"): void => {
    clipboard = { paths: [target.path], mode, label: target.name };
    options.status(`${mode === "move" ? "Cut" : "Copied"} ${target.name}. Select a folder and choose Paste.`);
    options.done([]);
  };

  const paste = async (folder: ContentFolderNode): Promise<void> => {
    const held = clipboard;
    if (!held) {
      options.status("Content clipboard is empty.", "warning");
      return;
    }
    if (!folder.writable) {
      options.status(`${folder.name} is read-only: paste into the project's content.`, "warning");
      return;
    }
    const body: ContentOpBody =
      held.mode === "move" ? { op: "move", items: held.paths, to: folder.path, protect: [options.activeLevel] } : { op: "copy", items: held.paths, to: folder.path };
    const ok = await run(body, `${held.mode === "move" ? "Moved" : "Copied"} ${held.label} to ${folder.path}`);
    if (ok && held.mode === "move") clipboard = null;
  };

  /** Edits a name in place (Enter / blur commit, Escape cancels); resolves to the new name or null. */
  const editName = (label: HTMLElement, current: string): Promise<string | null> =>
    new Promise((resolve) => {
      const input = doc.createElement("input");
      input.className = "content-rename";
      input.value = current;
      input.dataset.testid = "content-rename";
      input.setAttribute("aria-label", "New name");
      const previous = label.textContent;
      label.replaceChildren(input);
      let finished = false;
      const finish = (value: string | null): void => {
        if (finished) return;
        finished = true;
        label.textContent = previous;
        resolve(value === null || value.trim() === current ? null : value.trim());
      };
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(input.value);
        else if (event.key === "Escape") finish(null);
      });
      input.addEventListener("blur", () => finish(input.value));
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("dblclick", (event) => event.stopPropagation());
      input.focus();
      const dot = current.indexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : current.length);
    });

  const rename = async (target: ContentTarget): Promise<void> => {
    const why = locked(target);
    if (why) {
      options.status(why, "warning");
      return;
    }
    const selector = target.folder ? `[data-folder-path="${CSS.escape(target.path)}"] strong` : `[data-asset-path="${CSS.escape(target.path)}"] strong`;
    const label =
      options.host.querySelector<HTMLElement>(selector) ??
      options.host.querySelector<HTMLElement>(`.folder-row[title="${CSS.escape(target.path)}"] .folder-name`);
    if (!label) return;
    const name = await editName(label, target.name);
    if (name === null) return;
    await run({ op: "rename", item: target.path, name, protect: [options.activeLevel] }, `Renamed to ${name}`);
  };

  const remove = async (target: ContentTarget): Promise<void> => {
    const why = locked(target);
    if (why) {
      options.status(why, "warning");
      return;
    }
    const inside = index().assets.filter((asset) => (target.folder ? isWithin(asset.file, target.path) : (asset.levelFolder ?? asset.file) === target.path));
    const view = doc.defaultView!;
    const message = target.folder
      ? inside.length > 0
        ? `Delete folder "${target.name}" and ${inside.length} asset(s)? This cannot be undone.`
        : `Delete empty folder "${target.name}"? This cannot be undone.`
      : `Delete "${target.name}"? This cannot be undone.`;
    if (!view.confirm(message)) return;
    const users = options.inUse?.(inside.map((asset) => asset.id).filter((id): id is string => id !== null)) ?? [];
    if (users.length > 0) {
      options.status(`"${target.name}" is used by the open level (${users.slice(0, 5).join(", ")}${users.length > 5 ? "…" : ""}); remove those uses first.`, "error");
      return;
    }
    const answer = await options.store.op({ op: "delete", items: [target.path], protect: [options.activeLevel] });
    if (answer.status === "done") {
      if (clipboard?.paths.some((path) => isWithin(path, target.path))) clipboard = null;
      options.status(`Deleted ${target.path}`);
      options.done([]);
      return;
    }
    refused(answer);
    if (answer.referrers && answer.referrers.length > 0) {
      const files = [...new Set(answer.referrers.map((referrer) => referrer.file))];
      const picked = await openPicker({
        document: doc,
        host: options.host,
        title: `In use: ${target.name}`,
        testId: "content-referrers",
        items: files.map((file) => {
          const owner = index().byFile(file) ?? index().assets.find((asset) => asset.levelFolder !== null && isWithin(file, asset.levelFolder));
          return { id: file, label: owner?.name ?? file.slice(file.lastIndexOf("/") + 1), note: file };
        }),
      });
      if (picked !== null) {
        const owner = index().byFile(picked) ?? index().assets.find((asset) => asset.levelFolder !== null && isWithin(picked, asset.levelFolder));
        options.reveal(owner ? (owner.levelFolder ?? owner.file) : picked);
      }
    }
  };

  const targetMenu = (target: ContentTarget): ContextMenuItem[] => {
    const why = locked(target);
    return [
      { label: "Rename...", shortcut: "F2", enabled: why === null, run: () => void rename(target), testId: "content-menu-rename" },
      { label: "Cut", shortcut: "Ctrl+X", enabled: why === null, run: () => setClipboard(target, "move"), testId: "content-menu-cut" },
      { label: "Copy", shortcut: "Ctrl+C", run: () => setClipboard(target, "copy"), testId: "content-menu-copy" },
      { label: "Copy Path", run: () => copyPath(target.path), testId: "content-menu-copy-path" },
      { separator: true },
      { label: "Delete", shortcut: "Del", danger: true, enabled: why === null, run: () => void remove(target), testId: "content-menu-delete" },
    ];
  };
  const pasteItem = (folder: ContentFolderNode): ContextMenuItem => ({
    label: "Paste",
    shortcut: "Ctrl+V",
    enabled: clipboard !== null && folder.writable,
    run: () => void paste(folder),
    testId: "content-menu-paste",
  });

  return {
    assetMenu: (item) => targetMenu(targetOfAsset(item)),
    folderMenu: (node) => [pasteItem(node), { separator: true }, ...targetMenu(targetOfFolder(node))],
    emptyMenu: (folder) => [pasteItem(folder)],
    key(event, selected, folder) {
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.altKey) return false;
      if (!ctrl && event.key === "F2" && selected) void rename(selected);
      else if (!ctrl && event.key === "Delete" && selected) void remove(selected);
      else if (ctrl && !event.shiftKey && event.code === "KeyC" && selected) setClipboard(selected, "copy");
      else if (ctrl && !event.shiftKey && event.code === "KeyX" && selected) {
        const why = locked(selected);
        if (why) options.status(why, "warning");
        else setClipboard(selected, "move");
      } else if (ctrl && !event.shiftKey && event.code === "KeyV" && folder) void paste(folder);
      else return false;
      return true;
    },
    isCut: (path) => clipboard?.mode === "move" && clipboard.paths.includes(path),
  };
}
