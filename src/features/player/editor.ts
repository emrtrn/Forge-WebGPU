import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { PlayerStart, TargetPoint } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.player",
  components: {
    "forge.playerStart": { icon: "gameplay", outliner: "gameplay" },
    "forge.targetPoint": { icon: "gameplay", outliner: "gameplay" },
  },
  addActor: [
    { key: PlayerStart.name, label: "Player Start", category: "Gameplay", icon: "gameplay",
      spatiallyLoaded: false, components: { playerStart: { type: componentTypeTag(PlayerStart) } } },
    { key: TargetPoint.name, label: "Target Point", category: "Gameplay", icon: "gameplay",
      components: { target: { type: componentTypeTag(TargetPoint) } } },
  ],
});
