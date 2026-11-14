import { describe, expect, test } from "vitest";
import { createSchemaRegistry, defineComponent, num, SchemaDefinitionError, type ComponentMap } from "../../core/index.ts";
import { createEditorCatalog } from "./editorCatalog.ts";
import { defineFeatureEditor } from "./featureEditor.ts";

const registry = createSchemaRegistry();
registry.registerComponent(defineComponent("test.lamp", 1, { power: num({ default: 1 }) }, { label: "Lamp" }));
registry.registerComponent(defineComponent("test.crate", 1, { size: num({ default: 1 }) }));
registry.registerComponent(defineComponent("test.tag", 1, {}));

const lamp = defineFeatureEditor({ feature: "test.lamp", components: { "test.lamp": { icon: "light", outliner: "light" } } });
const crate = defineFeatureEditor({
  feature: "test.crate",
  components: { "test.crate": { icon: (data) => (Number(data.size) > 2 ? "volume" : "mesh"), outliner: "mesh" } },
});
const catalog = createEditorCatalog([lamp, crate], registry);
const map = (...types: `${string}@${number}`[]): ComponentMap => Object.fromEntries(types.map((type, index) => [`c${index}`, { type, size: 3 }]));

describe("how actors show in the editor", () => {
  test("the first presented component decides; an icon can depend on the fields", () => {
    expect(catalog.present(map("test.tag@1", "test.lamp@1"), false)).toEqual({ icon: "light", type: "light", kind: "Lamp" });
    expect(catalog.present(map("test.crate@1"), false)).toEqual({ icon: "volume", type: "mesh", kind: "Crate" });
  });

  test("unpresented components show the generic icon; an empty actor is a group when it has children", () => {
    expect(catalog.present(map("test.tag@1"), true)).toEqual({ icon: "generic", type: "gameplay", kind: "Tag" });
    expect(catalog.present({}, true)).toEqual({ icon: "group", type: "gameplay", kind: "Group" });
    expect(catalog.present({}, false)).toEqual({ icon: "gameplay", type: "gameplay", kind: "Actor" });
  });

  test("a definition with a bad icon, Outliner type or component name is refused, and so is a component presented twice", () => {
    expect(() => defineFeatureEditor({ feature: "x", components: { "test.a": { icon: "teapot" as never, outliner: "mesh" } } })).toThrow(SchemaDefinitionError);
    expect(() => defineFeatureEditor({ feature: "x", components: { "test.a": { icon: "mesh", outliner: "props" as never } } })).toThrow(SchemaDefinitionError);
    expect(() => defineFeatureEditor({ feature: "x", components: { Lamp: { icon: "mesh", outliner: "mesh" } } })).toThrow(SchemaDefinitionError);
    expect(() => defineFeatureEditor({ feature: "", components: {} })).toThrow(SchemaDefinitionError);
    expect(() => createEditorCatalog([lamp, lamp], registry)).toThrow(/presented twice|Two feature editors/);
  });
});
