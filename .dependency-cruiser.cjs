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
      name: "feature-does-not-name-render",
      comment:
        "feature.ts never references the render layer or its own render.ts, statically or dynamically (phase 3 decision 2): Node tools and the headless boot (check:projects) load feature.ts, and three/webgpu must not come with it. The application entry collects features/*/render.ts and hands the bindings to the render host.",
      severity: "error",
      from: { path: role("feature") },
      to: { path: ["^src/render/", role("render")] },
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
      name: "src-no-node-builtins",
      comment:
        "src/ runs in the browser and core also in Node: no fs, path or other Node module. Reading the disk is tools/ work (e.g. tools/assets scans content roots and hands core a file list).",
      severity: "error",
      from: { path: "^src/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "engine-testing-is-test-only",
      comment:
        "src/engine/testing holds Forge WebGL's old app loop as a test scaffold (plan 2b): ported checks tick subsystems through it word for word. Product code never reaches it; it is deleted in Faz 6 when the subsystems bind to the world.",
      severity: "error",
      from: { path: "^src/", pathNot: ["\\.test\\.ts$", "^src/engine/testing/"] },
      to: { path: "^src/engine/testing/" },
    },
    {
      name: "engine-legacy-stays-in-engine",
      comment:
        "src/engine/legacy holds the part of Forge WebGL's old entity/component model that ported subsystems read (plan 2b transition). Only the engine layer may use it; Faz 6 replaces it with schema components and deletes it.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/engine/" },
      to: { path: "^src/engine/legacy/" },
    },
    {
      name: "src-tests-node-assert-only",
      comment:
        "A test under src/ runs in Node (Vitest) and never ships, so it may use node:assert: tests ported from Forge WebGL keep their assertions word for word (plan 2b). node:zlib is allowed as an independent reference codec (the heightmap PNG checks inflate / deflate with it; user decision 2026-11-12). node:fs is allowed to read a shared test fixture from disk (the World Builder checks read tests/engine/fixtures/neutral.regionprofile.json word for word; user decision 2026-11-12). Every other Node module stays out of src/, tests included.",
      severity: "error",
      from: { path: "^src/.*\\.test\\.ts$" },
      to: { dependencyTypes: ["core"], pathNot: "^(node:)?(assert(/strict)?|zlib|fs)$" },
    },
    {
      name: "src-does-not-import-tools",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^tools/" },
    },
    {
      name: "not-to-unresolvable",
      comment:
        "An import the resolver cannot follow is an import the rules cannot judge. " +
        "Exception: virtual:forge/* modules, which the engine's Vite plugin makes (the served project's game module).",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, pathNot: "^virtual:forge/" },
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
