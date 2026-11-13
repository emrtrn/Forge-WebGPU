import { describe, expect, test } from "vitest";
import { createStaticContentClient, STATIC_REVISION, staticContentFile } from "./saveClient.ts";

function fakeFetch(files: Record<string, string>) {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    const text = files[url];
    return {
      status: text === undefined ? 404 : 200,
      headers: { get: () => null },
      text: async () => text ?? "",
      json: async () => JSON.parse(text ?? "null") as unknown,
    };
  };
  return { fetch, asked };
}

describe("a production build's static content (plan phase 4 step 2b)", () => {
  test("project paths and engine-labelled paths map to files under forge/files", () => {
    expect(staticContentFile("content/levels/main/level.json")).toBe("files/project/content/levels/main/level.json");
    expect(staticContentFile("engine:content/packs/starter/rock.glb")).toBe("files/engine/content/packs/starter/rock.glb");
    // A colon after a slash is part of a name, not a label.
    expect(staticContentFile("content/a:b.json")).toBe("files/project/content/a:b.json");
  });

  test("reads under the page's base URL; a missing file is null; identity and classes come from their JSON", async () => {
    const { fetch, asked } = fakeFetch({
      "/games/demo/forge/files/project/content/levels/main/level.json": '{"schema":"forge.level/1"}',
      "/games/demo/forge/identity.json": '{"engine":{"sdkVersion":"0.1.4"},"project":{"startLevel":"content/levels/main"}}',
      "/games/demo/forge/classes.json": '{"classes":[{"id":"ast_1"}]}',
    });
    const client = createStaticContentClient({ fetch, baseUrl: "/games/demo/" });
    expect(await client.read("content/levels/main/level.json")).toEqual({ text: '{"schema":"forge.level/1"}', revision: STATIC_REVISION });
    expect(await client.read("content/levels/main/cells.json")).toBeNull();
    expect((await client.identity()).project.startLevel).toBe("content/levels/main");
    expect(await client.classes()).toEqual([{ id: "ast_1" }]);
    expect(asked.every((url) => url.startsWith("/games/demo/forge/"))).toBe(true);
  });
});
