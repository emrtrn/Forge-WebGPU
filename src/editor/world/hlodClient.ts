import { FORGE_REQUEST_HEADER } from "../../core/index.ts";
import type { HlodBuildRequest, HlodBuildStatus } from "../../core/level/hlodBuild.ts";

/** Only editor code references the development build endpoints. */
export function createHlodClient(level: string, request: typeof fetch = fetch) {
  const read = async (response: Response): Promise<HlodBuildStatus> => {
    const body = await response.json() as HlodBuildStatus & { message?: string };
    if (!response.ok) throw new Error(body.message ?? `HLOD request failed (${response.status})`);
    return body;
  };
  return {
    request: (body: HlodBuildRequest): Promise<HlodBuildStatus> => request("/__forge/hlod", {
      method: "POST", headers: { [FORGE_REQUEST_HEADER]: "1", "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(read),
    poll: (): Promise<HlodBuildStatus> => request(`/__forge/hlod?level=${encodeURIComponent(level)}`, {
      headers: { [FORGE_REQUEST_HEADER]: "1" },
    }).then(read),
  };
}
