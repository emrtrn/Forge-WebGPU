// The World Environment feature in the editor: Forge's Outliner icon and type
// group, its Add Actor entry (one per level: clicked, not dragged), and the
// Preview strip below its Details form (Forge WebGL worldEnvironmentDetails.ts
// `previewStrip` @ forge-webgl-final; user decision 2026-11-14): the hour
// (scrubbed, or played at 0,25 / 1 / 4 hours a second), the season, the
// weather and its intensity, shown in the viewport through the editor
// world's World Environment and never saved. Make Default writes them into
// the level (one undo step); Reset goes back to the level's. Cover sliders
// preview the amount directly; only Make Default changes authored targets.
// A weather button with a transition time (plan phase W2) runs the timed
// change (`transitionWeather`); the time itself is never saved or undone.
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor, type DetailsExtensionContext } from "../../editor-sdk/index.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { SEASONS, WEATHER_PRESETS, WorldEnvironment, type WorldEnvironmentData } from "./schema.ts";

const PREVIEW_SPEEDS = [0.25, 1, 4] as const;
const titleCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
/** `07:30` (Forge's formatHour). */
export function formatHour(hour: number): string {
  const minutes = Math.round((((hour % 24) + 24) % 24) * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function previewStrip(ctx: DetailsExtensionContext): { element: HTMLElement; dispose(): void } {
  const doc = ctx.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  /** The editor world's live World Environment (null: the level has none, or it is hidden). */
  const controller = () => ctx.service(WorldEnvironmentKey)?.controller ?? null;
  const box = el("div", "detail-extension wes-preview");
  box.dataset.testid = "wes-preview";
  const title = el("div", "detail-actions-title", "Preview ");
  title.append(el("span", "detail-hint", "kaydedilmez"));
  box.append(title);

  const row = (label: string, control: HTMLElement): HTMLElement => {
    const line = el("div", "detail-row");
    line.append(el("span", "", label), control);
    box.append(line);
    return line;
  };
  const hourLabel = el("span", "", "");
  hourLabel.dataset.testid = "wes-preview-hour-label";
  const hourRow = el("div", "detail-row");
  const hourName = el("span", "", "Time ");
  hourName.append(hourLabel);
  const hour = el("input", "param-slider");
  hour.type = "range";
  hour.min = "0";
  hour.max = "23.99";
  hour.step = "0.01";
  hour.dataset.testid = "wes-preview-hour";
  hourRow.append(hourName, hour);
  box.append(hourRow);

  const playBox = el("span", "wes-preview-buttons");
  const play = el("button", "detail-action-button", "Play");
  play.type = "button";
  play.dataset.testid = "wes-preview-play";
  const speed = el("select");
  speed.dataset.testid = "wes-preview-speed";
  for (const value of PREVIEW_SPEEDS) {
    const option = el("option", "", `${value} h/s`);
    option.value = String(value);
    speed.append(option);
  }
  speed.value = "1";
  playBox.append(play, speed);
  row("Play", playBox);

  const choices = (label: string, values: readonly string[], testId: string, pick: (value: string) => void): HTMLButtonElement[] => {
    const line = el("span", "wes-preview-buttons");
    const buttons = values.map((value) => {
      const button = el("button", "detail-action-button", titleCase(value));
      button.type = "button";
      button.dataset.value = value;
      button.dataset.testid = `${testId}-${value}`;
      button.addEventListener("click", () => pick(value));
      return button;
    });
    line.append(...buttons);
    row(label, line);
    return buttons;
  };
  const seasons = choices("Season", SEASONS, "wes-preview-season", (season) => controller()?.setSeason(season as WorldEnvironmentData["season"]));
  const weathers = choices("Weather", WEATHER_PRESETS, "wes-preview-weather", (preset) => {
    const live = controller()?.current();
    const seconds = Number(transition.value);
    const target = preset as WorldEnvironmentData["weather"]["preset"];
    if (seconds > 0) void controller()?.transitionWeather({ preset: target, intensity: live?.weather.intensity ?? 1, seconds });
    else controller()?.setWeather(target, live?.weather.intensity);
  });
  // The preview's transition time, beside the weather buttons (not a level value).
  const transition = el("input");
  transition.type = "number";
  transition.min = "0";
  transition.max = "600";
  transition.step = "1";
  transition.value = "0";
  transition.dataset.testid = "wes-preview-transition";
  transition.setAttribute("aria-label", "Transition");
  transition.title = "Hava geçiş süresi (simülasyon saniyesi); 0 anında değiştirir. Kaydedilmez.";
  transition.addEventListener("change", () => {
    const value = Number(transition.value);
    transition.value = String(Number.isFinite(value) ? Math.min(600, Math.max(0, value)) : 0);
  });
  const transitionBox = el("span", "wes-preview-buttons");
  const progress = el("span", "detail-hint", "");
  progress.dataset.testid = "wes-preview-transition-progress";
  transitionBox.append(transition, el("span", "detail-hint", "s"), progress);
  row("Transition", transitionBox);
  const intensity = el("input", "param-slider");
  intensity.type = "range";
  intensity.min = "0";
  intensity.max = "1";
  intensity.step = "0.05";
  intensity.dataset.testid = "wes-preview-intensity";
  row("Intensity", intensity);
  const coverSlider = (label: string, field: "snowCoverage" | "wetness") => {
    const slider = el("input", "param-slider");
    slider.type = "range"; slider.min = "0"; slider.max = "1"; slider.step = ".01";
    slider.dataset.testid = `wes-preview-${field}`;
    slider.addEventListener("input", () => controller()?.setSurface({ [field]: Number(slider.value) }));
    row(label, slider);
    return slider;
  };
  const snow = coverSlider("Snow Coverage", "snowCoverage");
  const wetness = coverSlider("Wetness", "wetness");

  const actions = el("div", "wes-preview-buttons");
  const makeDefault = el("button", "detail-action-button", "Make Default");
  makeDefault.type = "button";
  makeDefault.dataset.testid = "wes-preview-default";
  makeDefault.title = "Önizlemeyi level'ın değeri yap (geri alınabilir)";
  const reset = el("button", "detail-action-button", "Reset");
  reset.type = "button";
  reset.dataset.testid = "wes-preview-reset";
  reset.title = "Level'ın değerlerine dön";
  actions.append(makeDefault, reset);
  box.append(actions);
  const missing = el("div", "detail-hint", "Bu World Environment gizli ya da çizilmiyor; önizleme yok.");
  box.append(missing);

  let playing = false;
  const authored = (): WorldEnvironmentData => ctx.value() as unknown as WorldEnvironmentData;
  const update = (): void => {
    const live = controller()?.current() ?? null;
    missing.hidden = live !== null;
    for (const control of [hour, play, speed, intensity, transition, snow, wetness, makeDefault, reset, ...seasons, ...weathers]) control.disabled = live === null;
    if (!live) return;
    if (doc.activeElement !== hour) hour.value = String(live.hour);
    hourLabel.textContent = formatHour(live.hour);
    play.textContent = playing ? "Pause" : "Play";
    for (const button of seasons) button.classList.toggle("on", button.dataset.value === live.season);
    for (const button of weathers) button.classList.toggle("on", button.dataset.value === live.weather.preset);
    if (doc.activeElement !== intensity) intensity.value = String(live.weather.intensity);
    const changing = live.weatherProgress !== undefined && live.weatherProgress < 1;
    progress.textContent = changing ? `${Math.round(live.weatherProgress! * 100)}%` : "";
    if (doc.activeElement !== snow) snow.value = String(live.surface.snowCoverage);
    if (doc.activeElement !== wetness) wetness.value = String(live.surface.wetness);
    const level = authored();
    const modified = Math.abs(live.hour - level.hour) > 1e-6 || live.season !== level.season || changing || live.weather.preset !== level.weather.preset || Math.abs(live.weather.intensity - level.weather.intensity) > 1e-6
      || Math.abs(live.surface.snowCoverage - level.surface.snowCoverage) > 1e-6 || Math.abs(live.surface.wetness - level.surface.wetness) > 1e-6;
    makeDefault.disabled = !modified;
    reset.disabled = !modified;
  };

  hour.addEventListener("input", () => {
    playing = false;
    controller()?.setHour(Number(hour.value));
  });
  play.addEventListener("click", () => {
    playing = !playing;
    update();
  });
  intensity.addEventListener("input", () => {
    const live = controller()?.current();
    if (live) controller()?.setWeather(live.weather.preset, Number(intensity.value));
  });
  makeDefault.addEventListener("click", () => {
    const live = controller()?.current();
    if (!live) return;
    playing = false;
    // A running weather change is live state: its target becomes the level's weather, shown at once.
    if (live.weatherProgress !== undefined) controller()?.setWeather(live.weather.preset, live.weather.intensity);
    ctx.edit("Make preview default", { hour: Number(live.hour.toFixed(2)), season: live.season, weather: { preset: live.weather.preset, intensity: live.weather.intensity },
      // The authored amounts only: standing water and snow depth are live state.
      surface: { ...authored().surface, snowCoverage: live.surface.snowCoverage, wetness: live.surface.wetness } });
  });
  reset.addEventListener("click", () => {
    const level = authored();
    const live = controller();
    playing = false;
    live?.setHour(level.hour);
    live?.setSeason(level.season);
    live?.setWeather(level.weather.preset, level.weather.intensity);
    live?.setSurface({ ...level.surface, puddleFill: 0, snowDepth: 0 });
  });

  const stopChanged = controller()?.onChanged(() => update()) ?? (() => {});
  ctx.onFrame((dt) => {
    const live = controller();
    const state = live?.current();
    if (playing && live && state) live.setHour((state.hour + Number(speed.value) * dt) % 24);
  });
  update();
  return { element: box, dispose: stopChanged };
}

export default defineFeatureEditor({
  feature: "forge.worldEnvironment",
  components: { "forge.worldEnvironment": { icon: "worldEnvironment", outliner: "environment" } },
  addActor: [{ key: "forge.worldEnvironment", label: "World Environment", category: "Visual Effects", icon: "worldEnvironment", components: { environment: { type: componentTypeTag(WorldEnvironment) } } }],
  details: { "forge.worldEnvironment": previewStrip },
});
