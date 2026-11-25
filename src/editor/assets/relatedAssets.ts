// The asset editor's Related section of a model recipe (vegetation plan PG5):
// what it uses (the texture recipes behind its materials included), what it
// generated and who uses either, each opened with a click.

import type { RecipeLink, RecipeLinks } from "../../engine/procgen/recipeLinks.ts";
import { contentTypeLabel } from "../content/contentModel.ts";

export interface RelatedAssets {
  readonly element: HTMLElement;
  /** Reads the links again (opened, generated). */
  refresh(): Promise<void>;
}

const GROUPS = [["uses", "Uses"], ["outputs", "Generated"], ["usedBy", "Used By"]] as const;

export function createRelatedAssets(options: {
  readonly document: Document;
  /** A model recipe, or a generated plant family. */
  readonly asset: string;
  readonly links: (asset: string) => Promise<RecipeLinks>;
  /** Whether a link opens in the asset editor. */
  readonly canOpen: (id: string) => boolean;
  readonly open: (id: string) => void;
  readonly alive: () => boolean;
}): RelatedAssets {
  const doc = options.document;
  const element = doc.createElement("section");
  element.className = "asset-related";
  element.dataset.testid = "asset-related";
  const row = (link: RecipeLink): HTMLElement => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "asset-component-node";
    node.dataset.assetId = link.id;
    node.textContent = `${link.name} · ${contentTypeLabel(link.type)}`;
    node.title = link.file;
    node.disabled = !options.canOpen(link.id);
    node.addEventListener("click", () => options.open(link.id));
    return node;
  };
  const draw = (links: RecipeLinks): void => {
    const title = doc.createElement("strong");
    title.textContent = links.built ? "Related" : "Related · not generated yet";
    element.replaceChildren(title);
    if (links.recipe.id !== options.asset) {
      const line = doc.createElement("p");
      line.className = "asset-related-note";
      line.textContent = "Generated: the next generation of this recipe writes its own response over edits made here.";
      element.append(line, row(links.recipe));
    }
    for (const note of links.notes) {
      const line = doc.createElement("p");
      line.className = "asset-related-note";
      line.textContent = note;
      element.append(line);
    }
    for (const [key, label] of GROUPS) {
      if (links[key].length === 0) continue;
      const group = doc.createElement("details"), summary = doc.createElement("summary");
      group.open = key !== "outputs";
      group.dataset.testid = `asset-related-${key}`;
      summary.textContent = `${label} (${links[key].length})`;
      group.append(summary, ...links[key].map(row));
      element.append(group);
    }
  };
  return {
    element,
    async refresh() {
      try {
        const links = await options.links(options.asset);
        if (options.alive()) draw(links);
      } catch (error) {
        if (options.alive()) element.textContent = `Related: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}
