// Violation: feature.ts names its render binding through a dynamic import.
export const feature = { render: () => import("./render") };
