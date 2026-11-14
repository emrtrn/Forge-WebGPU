import { describe, expect, test } from "vitest";
import type { ContentListingBody } from "../../core/index.ts";
import { assetCatalogOf } from "../assets/assetCatalog.ts";
import {
  buildContentIndex,
  CONTENT_FILTER_ALL,
  contentRootTitle,
  contentTypeLabel,
  contentTypePlural,
  folderItems,
  folderTrail,
  FolderHistory,
  treeChildren,
} from "./contentModel.ts";

const PACK = "engine:content/packs/starter";
const LISTING: ContentListingBody = {
  roots: [
    { label: "content", writable: true },
    { label: "engine:content/engine", writable: false },
    { label: PACK, writable: false },
  ],
  folders: ["content/levels", "content/levels/L03", "content/levels/L03/terrain", "content/meshes", "content/empty", `${PACK}/textures`],
  files: [
    { file: "content/levels/L03/level.json", id: "lvl_1", type: "forge.level" },
    { file: "content/levels/L03/terrain/valley.terrain.json", id: "ast_t", type: "forge.terrain" },
    { file: "content/meshes/crate.glb", id: "ast_c", type: "forge.model" },
    { file: "content/meshes/Barrel.glb", id: "ast_b", type: "forge.model" },
    { file: "content/meshes/red.material.json", id: "ast_m", type: "forge.material" },
    { file: "content/meshes/loose.png", issues: [{ severity: "warning", message: "no meta file" }] },
    { file: `${PACK}/textures/grass.png`, id: "ast_g", type: "forge.texture" },
  ],
};

const ALL = { type: CONTENT_FILTER_ALL, search: "" };

describe("content index", () => {
  test("a node per root, the engine's and the packs' read-only; folders by name", () => {
    const index = buildContentIndex(LISTING);
    expect(index.roots.map((root) => [root.title, root.writable])).toEqual([
      ["Content", true],
      ["Engine", false],
      ["Starter Pack", false],
    ]);
    expect(treeChildren(index, "content").map((folder) => folder.name)).toEqual(["empty", "levels", "meshes"]);
    expect(index.folder(`${PACK}/textures`)?.writable).toBe(false);
    expect(folderTrail(index, "content/levels/L03/terrain").map((folder) => folder.name)).toEqual(["Content", "levels", "L03", "terrain"]);
  });

  test("a level folder is a Level card in its parent and a folder in the tree; its level.json is not listed inside", () => {
    const index = buildContentIndex(LISTING);
    const levels = folderItems(index, "content/levels", ALL);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ kind: "asset", name: "L03", type: "forge.level", ext: "LEVEL", levelFolder: "content/levels/L03" });
    expect(treeChildren(index, "content/levels").map((folder) => folder.name)).toEqual(["L03"]);
    expect(folderItems(index, "content/levels/L03", ALL).map((item) => (item.kind === "folder" ? item.folder.name : item.name))).toEqual(["terrain"]);
  });

  test("folders first, then assets by name; the type filter and the search apply to the open folder", () => {
    const index = buildContentIndex(LISTING);
    const names = (type: string, search: string) =>
      folderItems(index, "content/meshes", { type, search }).map((item) => (item.kind === "folder" ? item.folder.name : item.name));
    expect(names(CONTENT_FILTER_ALL, "")).toEqual(["Barrel", "crate", "loose", "red"]);
    expect(names("forge.model", "")).toEqual(["Barrel", "crate"]);
    expect(names("file", "")).toEqual(["loose"]);
    expect(names(CONTENT_FILTER_ALL, "material")).toEqual(["red"]);
    expect(names(CONTENT_FILTER_ALL, "bar")).toEqual(["Barrel"]);
    expect(folderItems(index, "content", { type: CONTENT_FILTER_ALL, search: "mesh" }).map((item) => item.kind)).toEqual(["folder"]);
    expect(index.types).toEqual(["forge.level", "forge.material", "forge.model", "forge.terrain", "forge.texture", "file"].sort((a, b) =>
      a === "file" ? 1 : b === "file" ? -1 : contentTypePlural(a).localeCompare(contentTypePlural(b)),
    ));
    expect(index.byId("ast_g")).toMatchObject({ name: "grass", writable: false, folder: `${PACK}/textures` });
  });

  test("labels: Forge's names, another type from its name, plurals, root titles", () => {
    expect(contentTypeLabel("forge.model")).toBe("Static Mesh");
    expect(contentTypePlural("forge.model")).toBe("Static Meshes");
    expect(contentTypePlural("forge.actorClass")).toBe("Actor Classes");
    expect(contentTypeLabel("ridgebound.cargoContract")).toBe("Cargo Contract");
    expect(contentTypeLabel(null)).toBe("File");
    expect(contentRootTitle("content/extra")).toBe("Extra");
  });

  test("the asset catalog lists referable assets by name and follows a new listing", () => {
    let index = buildContentIndex(LISTING);
    const catalog = assetCatalogOf(() => index);
    expect(catalog.ofType("forge.model").map((asset) => asset.name)).toEqual(["Barrel", "crate"]);
    expect(catalog.ofType(null).some((asset) => asset.type === "forge.level")).toBe(false);
    expect(catalog.label("ast_m")).toBe("red");
    index = buildContentIndex({ ...LISTING, files: LISTING.files.filter((file) => file.id !== "ast_b") });
    expect(catalog.ofType("forge.model").map((asset) => asset.name)).toEqual(["crate"]);
  });
});

describe("folder history", () => {
  test("Back / Forward, a new visit drops what was ahead, missing folders are skipped, a rename follows", () => {
    const history = new FolderHistory("a");
    history.visit("a/b");
    history.visit("a/b/c");
    const all = () => true;
    expect(history.go(-1, all)).toBe("a/b");
    expect(history.canGo(1)).toBe(true);
    history.visit("x");
    expect(history.canGo(1)).toBe(false);
    expect(history.go(-1, (path) => path !== "a/b")).toBe("a");
    history.rename("a", "z");
    expect(history.current).toBe("z");
    expect(history.go(1, all)).toBe("z/b");
  });
});
