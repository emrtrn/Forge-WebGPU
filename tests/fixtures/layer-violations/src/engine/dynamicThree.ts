// Violation: three outside render through a dynamic import.
export const loadThree = () => import("three");
