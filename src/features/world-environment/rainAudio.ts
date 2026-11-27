import { defineSubsystem } from "../../core/index.ts";
import { AudioServiceKey } from "../../engine/audio/worldAudio.ts";
import type { AudioPlaybackHandle } from "../../engine/audio/audioTypes.ts";
import { WorldEnvironmentServiceKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { WorldEnvironment, type WorldEnvironmentData } from "./schema.ts";

export const RainAudioSubsystem = defineSubsystem({
  id: "forge.worldEnvironment.rainAudio",
  tickGroups: ["renderSync"],
  create(world) {
    let loop: AudioPlaybackHandle | null = null;
    const stop = () => { loop?.stop(0.2); loop = null; };
    return {
      tick() {
        const audio = world.services.get(AudioServiceKey);
        const weather = world.services.get(WorldEnvironmentServiceKey);
        const data = world.componentsOf(WorldEnvironment.name)[0]?.component as unknown as WorldEnvironmentData | undefined;
        const rain = data?.precipitation.rain;
        const clip = rain?.sound;
        const volume = (weather?.precipitation().rain ?? 0) * (rain?.soundVolume ?? 0);
        if (!clip || !audio || volume === 0) { stop(); return; }
        if (loop?.clipId !== clip) {
          stop();
          loop = audio.play(clip, { bus: "ambience", loop: true, volume });
        } else if (!loop.stopped && Math.abs(loop.volume - volume) > 0.005) loop.setVolume(volume, 0.08);
      },
      dispose: stop,
    };
  },
});
