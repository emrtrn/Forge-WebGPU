import type { HlodJobRequest } from "./hlodService.ts";
import { runHlodJob } from "./hlodService.ts";

// Cancel before publication. Once publication starts, finish/rollback it rather
// than exiting midway through replacement of the old working proxy set.
let cancelled = false, running = false;
process.once("disconnect", () => { cancelled = true; if (!running) process.exit(0); });
process.once("message", async (message: unknown) => {
  running = true;
  try {
    if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Expected one HLOD job request");
    const request = message as HlodJobRequest;
    if (![request.engineRoot, request.project, request.level].every((value) => typeof value === "string" && value.length > 0) ||
      typeof request.build !== "boolean" || [request.force, request.dryRun].some((value) => value !== undefined && typeof value !== "boolean")) {
      throw new Error("Invalid HLOD job request");
    }
    const result = await runHlodJob(request, { cancelled: () => cancelled });
    if (process.connected && process.send) process.send({ ok: true, result }, () => process.disconnect());
    else process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.connected && process.send) process.send({ ok: false, message }, () => process.disconnect());
    else process.exit(1);
  }
});
if (!process.connected) process.exit(1);
