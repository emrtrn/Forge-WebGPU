// Violation: a game render binding pulls in the editor helper drawing (a
// side-effect import); it would ship in the game build.
import "./editorRender";

export const sleetBinding = {};
