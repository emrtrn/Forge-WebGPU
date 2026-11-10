// Violation: a schema file imports three and its own render binding.
import { float } from "three/tsl";
import { fogNode } from "./render";

export const schema = { float, fogNode };
