// Layer boundaries: the single source of truth (architecture §4.2, decision A3).
//
// Rules are written by path and by file role. They run against the real AST
// with the TypeScript resolver, including type-only imports, re-exports and
// dynamic import(). `tools/verify-layers.ts` runs this config twice: on the
// repo (expects zero violations) and on tests/fixtures/layer-violations
// (expects every planted violation to be caught).
//
// Layers, lowest first:
//   core      imports nothing above it
//   engine    core
//   render    core, engine            (sole owner of three)
//   runtime   core, engine, render
//   gameplay  core, engine, runtime
//   editor    everything; reachable only through dynamic import
//   tools     core, engine, feature schemas (Node)
//
// A test file sits next to its module and obeys that module's rule.

const THREE = "(^|/)node_modules/(@types/)?three/|^three($|/)";
const FEATURE = "^src/features/[^/]+/";
const role = (name) => `${FEATURE}${name}(\\.test)?\\.ts$`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-is-foundation",
      comment: "core imports no other layer.",
      severity: "error",
      from: { path: "^src/core/" },
      to: { path: "^src/(engine|render|runtime|gameplay|editor|features|sdk|editor-sdk)/" },
    },
    {
      name: "engine-imports-core-only",
      severity: "error",
      from: { path: "^src/engine/" },
      to: { path: "^src/(render|runtime|gameplay|editor|features|sdk|editor-sdk)/" },
    },
    {
      name: "render-imports-core-engine",
      severity: "error",
      from: { path: "^src/render/" },
      to: { path: "^src/(runtime|gameplay|editor|features|sdk|editor-sdk)/" },
    },
    {
      name: "runtime-imports-core-engine-render",
      severity: "error",
      from: { path: "^src/runtime/" },
      to: { path: "^src/(gameplay|editor|features|sdk|editor-sdk)/" },
    },
    {
      name: "gameplay-imports-core-engine-runtime",
      severity: "error",
      from: { path: "^src/gameplay/" },
      to: { path: "^src/(render|editor|features|sdk|editor-sdk)/" },
    },
    {
      name: "three-only-in-render",
      comment: "three/webgpu and three/tsl belong to src/render and features/*/render.ts.",
      severity: "error",
      from: { pathNot: ["^src/render/", role("render")] },
      to: { path: THREE },
    },
    {
      name: "editor-only-dynamic",
      comment: "The editor never enters the game bundle: static imports of it are forbidden.",
      severity: "error",
      from: { pathNot: ["^src/editor/", "^src/editor-sdk/", role("editor")] },
      to: { path: ["^src/editor/", role("editor")], dynamic: false },
    },
    {
      name: "sdk-excludes-editor",
      severity: "error",
      from: { path: "^src/sdk/" },
      to: { path: ["^src/editor/", "^src/editor-sdk/", role("editor")] },
    },
    {
      name: "feature-schema-is-pure",
      comment: "Schemas load in Node and in the dev server: core and other schemas only.",
      severity: "error",
      from: { path: role("schema") },
      to: {
        path: [
          "^src/(engine|render|runtime|gameplay|editor|sdk|editor-sdk)/",
          `${FEATURE}(runtime|render|editor|feature)\\.ts$`,
        ],
      },
    },
    {
      name: "feature-does-not-name-editor",
      comment:
        "feature.ts never references the editor, not even lazily: Rollup emits a chunk for every import() and the editor would land in the game build. The editor host collects features/*/editor.ts itself.",
      severity: "error",
      from: { path: role("feature") },
      to: { path: ["^src/editor/", "^src/editor-sdk/", role("editor")] },
    },
    {
      name: "feature-runtime-no-render",
      severity: "error",
      from: { path: role("runtime") },
      to: { path: ["^src/(render|editor)/", `${FEATURE}(render|editor)\\.ts$`] },
    },
    {
      name: "tools-are-node-only",
      comment: "Node tools load core, engine and feature schemas; nothing that needs a browser.",
      severity: "error",
      from: { path: "^tools/" },
      to: {
        path: [
          "^src/(render|runtime|gameplay|editor|sdk|editor-sdk)/",
          `${FEATURE}(runtime|render|editor|feature)\\.ts$`,
          "^src/main\\.ts$",
        ],
      },
    },
    {
      name: "src-does-not-import-tools",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^tools/" },
    },
    {
      name: "not-to-unresolvable",
      comment: "An import the resolver cannot follow is an import the rules cannot judge.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json", ".d.ts"],
    },
  },
};
