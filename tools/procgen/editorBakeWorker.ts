import { parentPort, workerData } from "node:worker_threads";
import { generateFromRecipe, RecipeSaveConflict, type GenerateOptions } from "./generate.ts";

try {
  const result = await generateFromRecipe(workerData as GenerateOptions);
  parentPort!.postMessage({ ...result.publication, warnings: [...result.publication!.warnings,
    ...result.warnings.map(message => ({ file: result.recipe, path: "", code: "bake", severity: "warning", message }))] });
} catch (error) {
  parentPort!.postMessage(error instanceof RecipeSaveConflict ? error.response : {
    status: "rejected", reason: "generation", issues: [], message: error instanceof Error ? error.message : String(error),
  });
}
