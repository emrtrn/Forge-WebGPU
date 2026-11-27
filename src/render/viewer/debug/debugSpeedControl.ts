import { DIAGNOSTIC_TIME_HOLDER, type TimeControl } from "../../../engine/time/timeControl.ts";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

export function createDebugSpeedControl(document: Document, time: TimeControl) {
  const element = document.createElement("div");
  element.className = "forge-debug-speed";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "Simulation time");

  const pause = document.createElement("button");
  pause.type = "button";
  pause.className = "forge-debug-panel-button";
  pause.dataset.forgeDebugAction = "toggle-pause";
  const speeds = SPEEDS.map((speed) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "forge-debug-panel-button";
    button.dataset.forgeDebugAction = `speed-${speed}`;
    button.textContent = `${speed}x`;
    button.title = `Run the simulation at ${speed}x.`;
    button.addEventListener("click", () => {
      time.setTimeScale(speed);
      refresh();
    });
    return { speed, button };
  });

  function refresh(): void {
    const held = time.heldBy(DIAGNOSTIC_TIME_HOLDER);
    const externalPause = time.paused && !held;
    pause.textContent = held ? "Resume" : externalPause ? "Paused" : "Pause";
    pause.title = externalPause ? "The game is holding the simulation paused." : "Toggle the diagnostic pause. Rendering continues.";
    pause.disabled = externalPause;
    pause.dataset.forgeDebugHeld = held ? "self" : externalPause ? "other" : "none";
    pause.classList.toggle("is-active", time.paused);
    pause.setAttribute("aria-pressed", String(held));
    for (const { speed, button } of speeds) {
      const selected = time.timeScale === speed;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  pause.addEventListener("click", () => {
    if (time.heldBy(DIAGNOSTIC_TIME_HOLDER)) time.resume(DIAGNOSTIC_TIME_HOLDER);
    else time.pause(DIAGNOSTIC_TIME_HOLDER);
    refresh();
  });
  element.append(pause, ...speeds.map(({ button }) => button));
  refresh();
  return { element, refresh, dispose: () => time.resume(DIAGNOSTIC_TIME_HOLDER) };
}
