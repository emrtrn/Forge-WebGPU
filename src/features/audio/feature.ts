import { defineFeature, defineSubsystem } from "../../core/index.ts";
import { AudioServiceKey, WorldAudioHostKey } from "../../engine/audio/worldAudio.ts";
import { CameraServiceKey } from "../../engine/camera/worldCamera.ts";
import { rotate } from "../../engine/math/affine.ts";
import { AudioSubsystem } from "../../runtime/audio/audioSubsystem.ts";
import { Audio } from "./schema.ts";

export default defineFeature({
  id: "forge.audio",
  assetTypes: [Audio],
  subsystems: [defineSubsystem({
    id: "forge.audio",
    tickGroups: ["renderSync"],
    create(world) {
      const host = world.services.get(WorldAudioHostKey);
      const audio = new AudioSubsystem(host ? {
        backend: "web-audio", resolveClipUrl: (id) => host.clipUrl(id),
        ...(host.headers ? { fetchHeaders: host.headers } : {}),
      } : {});
      const removeGesture = host?.onGesture(() => audio.resumeContext());
      world.services.provide(AudioServiceKey, audio);
      let elapsedSeconds = 0;
      let frame = 0;
      return {
        tick(_group, dt) {
          const camera = world.services.get(CameraServiceKey)?.current();
          const pose = camera ? { position: camera.position, rotation: camera.quaternion } : host?.listener();
          if (pose) audio.setListenerPose(pose.position, rotate(pose.rotation, [0, 0, -1]));
          elapsedSeconds += dt;
          audio.update({ deltaSeconds: dt, elapsedSeconds, frame: frame++ });
        },
        dispose() {
          removeGesture?.();
          audio.dispose();
        },
      };
    },
  })],
});
