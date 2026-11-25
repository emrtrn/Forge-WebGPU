// Generate & Save of a model recipe's editor: the draft and its outputs in one
// revision-checked transaction, run by the dev server (tools/procgen/).

import { FORGE_REQUEST_HEADER } from "../../core/index.ts";
import type { AssetPublisher } from "../../editor-sdk/index.ts";

export const publishRecipe: AssetPublisher = async (path, base, document) => {
  const response = await fetch("/__forge/recipe-bake", {
    method: "POST", headers: { "Content-Type": "application/json", [FORGE_REQUEST_HEADER]: "1" },
    body: JSON.stringify({ path, base, document }),
  });
  const result = await response.json();
  if (result.status === "saved" || result.status === "conflict" || result.status === "rejected") return result;
  return { status: "rejected", reason: "generation", message: result.message ?? "Generation failed." };
};
