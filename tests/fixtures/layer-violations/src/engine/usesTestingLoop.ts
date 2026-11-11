// Violation: product code reaches the test scaffold (old app loop).
import { tick } from "./testing/loop";

export const run = (): number => tick();
