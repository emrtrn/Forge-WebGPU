// Public surface of the core layer. Loads in the browser and in plain Node
// (`npm run verify:node-load`), so nothing here may touch the DOM, three or
// `import.meta.env`.

export * from "./id.ts";
export * from "./schema/component.ts";
export * from "./schema/fields.ts";
export * from "./schema/label.ts";
