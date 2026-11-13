// Violation: feature.ts names its editor helper drawing, even lazily; the
// editor host collects features/*/editorRender.ts itself (phase 4 decision 1).
export const feature = { helper: () => import("./editorRender") };
