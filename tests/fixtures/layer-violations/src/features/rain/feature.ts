// Violation: feature.ts names its editor part through a dynamic import. The
// general editor rule allows lazy loading, but a feature must not do it: the
// chunk would be emitted into the game build.
export const feature = { editor: () => import("./editor") };
