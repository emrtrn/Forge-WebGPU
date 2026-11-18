import { defineFeature } from "../../core/index.ts";
import { Portal, Zone } from "./schema.ts";

export default defineFeature({
  id: "forge.zone",
  components: [Zone, Portal],
});
