import { defineGameModule, num } from "@forge/sdk";

// A number field with a string default: the SDK's types refuse it.
export const field = num({ default: "fast" });
export default defineGameModule({ id: "typeerror.main" });
