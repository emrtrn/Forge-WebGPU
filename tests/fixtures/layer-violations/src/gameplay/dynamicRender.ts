// Violation: gameplay -> render through a dynamic import.
export const loadRender = () => import("../render/thing");
