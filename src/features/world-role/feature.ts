import { defineFeature } from "../../core/index.ts";
import { WorldRole } from "./schema.ts";

export default defineFeature({
  id: "forge.worldRole",
  components: [WorldRole],
});
