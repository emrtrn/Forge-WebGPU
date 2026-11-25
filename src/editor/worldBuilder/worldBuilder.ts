// The World Builder window (plan 5d step 8, INV-B13; Forge WebGL
// src/editor/panels/world/randomWorldPanel.ts @ forge-webgl-final): a few
// choices, a bird's-eye preview that follows them, and Create. User decisions
// 2026-11-25:
//
// - Create builds a new level folder (`content/levels/<Name>`) and opens it
//   (Forge built into the open level and replaced it). A level that exists is
//   replaced only after a question; the open generated level's own name is
//   offered, so its world can be made again.
// - Rivers, lakes, island and coast can be chosen: the beds and the coast are
//   shaped now, water is drawn from Faz 7 on; the window says so.
// - A project without the `worldbuilder` content pack gets an Add Pack button:
//   the manifest is written and the dev server restarts.
//
// The choices are a per-viewer convenience kept in the page's storage, never
// in the project; the built level keeps its own brief beside it.

import { enumOf, formFields, num, text, type FieldMap, type SaveClient } from "../../core/index.ts";
import { SEA_SIDES } from "../../engine/worldbuilder/island.ts";
import { COVERS, LANDFORMS, MOUNTAIN_HEIGHTS, oceanWorldSizeSupported, ROAD_NETWORKS, SETTLEMENT_TYPES, WORLD_SIZES, worldExtent, type SettlementType, type WorldSize } from "../../engine/worldbuilder/randomWorld.ts";
import { MAX_RANDOM_WATER } from "../../engine/worldbuilder/randomWater.ts";
import type { RandomWorldPreview } from "../../engine/worldbuilder/randomWorldPreview.ts";
import {
  asksForWater, DEFAULT_RANDOM_WORLD_CHOICES, freeWorldName, isOceanLandform, MAX_RANDOM_SETTLEMENTS, overviewCameraPose, plainFolderName,
  randomWorldRequest, readRandomWorldChoices, settleRandomWorldChoices, type RandomWorldChoices, type RandomWorldDone,
} from "../../engine/worldbuilder/randomWorldChoices.ts";
import { COVER_DENSITY_LEVELS, WORLD_BUILD_STEPS, type WorldBuildStep } from "../../engine/worldbuilder/worldBrief.ts";
import { storeEditorCameraPose } from "../../render/editor/cameraPoseStore.ts";
import { createFormView, type FormView } from "../ui/formView.ts";
import { createForgeWindow } from "../ui/forgeWindow.ts";
import { createWorldBuilderClient, type WorldBuilderClient, type WorldBuilderState } from "./worldBuilderClient.ts";
import { installWorldBuilderStyle } from "./worldBuilderStyle.ts";
import { createWorldPreviewer, drawWorldPreview, PREVIEW_SIZE, SETTLEMENT_LABELS } from "./worldPreview.ts";

const CHOICES_KEY = "forge.worldBuilder.random";
const WINDOW_KEY = "forge.worldBuilder.window";
/** Session storage: the window opens again after the server's restart; the last build's summary, for the level it opens. */
const REOPEN_KEY = "forge.worldBuilder.reopen";
const REPORT_KEY = "forge.worldBuilder.report";
/** Wait this long after the last change before drawing a new preview, ms. */
const PREVIEW_DELAY = 120;
const RESTART_POLL = 500;

/** What the window says while each build step runs. */
const STEP_LABELS: Readonly<Record<WorldBuildStep, string>> = {
  terrain: "Arazi şekilleniyor…",
  paint: "Arazi boyanıyor…",
  settlements: "Yollar, yerleşimler ve yapılar planlanıyor…",
  roads: "Yollar ve yapı setleri araziye işleniyor…",
  ground: "Donatılar ve çitler yerleştiriliyor…",
  placements: "Kayalar ve bitki kuralları yerleştiriliyor…",
  files: "Dosyalar yazılıyor…",
};

const DENSITY_LABELS = { low: "Low", medium: "Medium", high: "High" } as const;
const SIZE_LABELS = { small: "Small (1 km)", medium: "Medium (2 km)", large: "Large (4 km)" } as const;
const ROAD_LABELS = { between: "Between", exits: "Exits" } as const;
/** The labels of the values offered (an enum field takes no others). */
const of = <T extends string>(labels: Readonly<Record<T, string>>, values: readonly T[]): Record<string, string> => Object.fromEntries(values.map((value) => [value, labels[value]]));
const density = (label: string, hint: string) => enumOf(COVER_DENSITY_LEVELS, { default: "medium", labels: DENSITY_LABELS, label, hint });
const water = (label: string, hint: string) => num({ default: 0, min: 0, max: MAX_RANDOM_WATER, step: 1, label, hint });

/** The form above the settlements, and the one below; an island or a coast narrows them. */
function shapeFields(choices: RandomWorldChoices): FieldMap {
  const sizes = (Object.keys(WORLD_SIZES) as WorldSize[]).filter((size) => !isOceanLandform(choices.landform) || oceanWorldSizeSupported(size));
  return {
    size: enumOf(sizes, { default: sizes[0]!, labels: of(SIZE_LABELS, sizes), label: "Size", hint: "Dünyanın kenar uzunluğu. Island ve Coast en çok 2 km." }),
    landform: enumOf(LANDFORMS, {
      default: "hills", labels: { plain: "Plain", hills: "Hills", mountains: "Mountains", valley: "Valley", island: "Island", coast: "Coast" }, label: "Landform",
      hint: "Arazinin genel şekli. Plain: düze yakın; Hills: tepeler; Mountains: sırtlı dağlar; Valley: haritayı kuzeyden güneye geçen vadi; Island: denizle çevrili ada; Coast: bir yanı deniz.",
    }),
    ...(choices.landform === "coast" ? { seaSide: enumOf(SEA_SIDES, { default: "west", labels: { west: "West", east: "East", north: "North", south: "South" }, label: "Sea Side", hint: "Denizin haritanın hangi tarafında olacağı. Yol çıkışları karada kalır." }) } : {}),
    mountainHeight: enumOf(MOUNTAIN_HEIGHTS, { default: "medium", labels: DENSITY_LABELS, label: "Mountains", hint: "Dağların ve tepelerin yüksekliği; küçük dünyada kendiliğinden alçalır." }),
  };
}

function detailFields(choices: RandomWorldChoices): FieldMap {
  const island = choices.landform === "island";
  const networks = island ? ROAD_NETWORKS.filter((network) => network === "between") : ROAD_NETWORKS;
  return {
    roads: enumOf(networks, { default: "between", labels: of(ROAD_LABELS, networks), label: "Roads", hint: "Between: yollar yalnız yerleşimleri bağlar. Exits: ayrıca iki yol harita kenarına çıkar." }),
    ...(island ? {} : { rivers: water("Rivers", "Nehir sayısı. Nehirler yüksekten başlar, yokuş aşağı akar; yol nehri köprüyle geçer.") }),
    lakes: water("Lakes", "Göl sayısı. Göller önce çanaklara, yoksa nehrin aşağı kısmına konur."),
    cover: enumOf(Object.keys(COVERS) as (keyof typeof COVERS)[], {
      default: "forest", labels: { forest: "Forest", meadow: "Meadow", farmland: "Farmland", steppe: "Steppe", desert: "Desert", alpine: "Alpine" }, label: "Cover",
      hint: "Örtü / iklim: boya katmanları, bitki, tarla ve kar kuralları.",
    }),
    forest: density("Forest", "Ormanın yoğunluğu ve köylere ne kadar yaklaştığı."),
    rocks: density("Rocks", "Kaya sayısı."),
    fields: density("Fields", "Köy çevresindeki tarlaların ne kadar uzağa uzandığı (tarla olan örtülerde)."),
    seed: num({ default: 1, min: 0, max: 999999, step: 1, label: "Seed", hint: "Aynı seçimler ve aynı tohum aynı dünyayı verir. Roll Dice başka bir dünya seçer." }),
  };
}

export interface WorldBuilderOptions {
  readonly document: Document;
  readonly host: HTMLElement;
  /** The viewport's rectangle: the window opens in it. */
  readonly area: () => DOMRect;
  readonly storage: Storage | null;
  readonly session: Storage | null;
  readonly client: SaveClient;
  readonly projectName: string;
  /** The open level's folder. */
  readonly level: string;
  /** Whether a project folder or file is listed (the Content Browser's listing). */
  readonly exists: (path: string) => boolean;
  readonly dirty: () => boolean;
  /** Opens a level in this page; `confirmed`: unsaved edits were asked about already. */
  readonly openLevel: (folder: string, name: string, confirmed: boolean) => void;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  readonly api?: WorldBuilderClient;
}

export interface WorldBuilder {
  open(): void;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export function createWorldBuilder(options: WorldBuilderOptions): WorldBuilder {
  const { document: doc, storage, session } = options;
  const view = doc.defaultView!;
  const api = options.api ?? createWorldBuilderClient();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", content?: string, testId?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    if (testId) node.dataset.testid = testId;
    return node;
  };
  const button = (label: string, testId: string, hint: string, run: () => void, className = "detail-inline-button"): HTMLButtonElement => {
    const node = el("button", className, label, testId);
    node.type = "button";
    node.title = hint;
    node.addEventListener("click", run);
    return node;
  };
  const remember = (store: Storage | null, key: string, value: string | null): void => {
    try {
      if (value === null) store?.removeItem(key);
      else store?.setItem(key, value);
    } catch {
      // A convenience; the window works without it.
    }
  };
  const recall = (store: Storage | null, key: string): string | null => {
    try {
      return store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const newSeed = (): number => Math.floor(Math.random() * 100000);
  const stored = (): RandomWorldChoices => {
    const fallback = { ...DEFAULT_RANDOM_WORLD_CHOICES, seed: newSeed() };
    try {
      return readRandomWorldChoices(JSON.parse(recall(storage, CHOICES_KEY) ?? "null"), fallback);
    } catch {
      return fallback;
    }
  };

  // The last build's summary, in the level it opened.
  const report = recall(session, REPORT_KEY);
  if (report !== null) {
    remember(session, REPORT_KEY, null);
    try {
      const done = JSON.parse(report) as RandomWorldDone;
      if (done.level === options.level) {
        const open = [...done.notes, ...done.deferred];
        options.status(`World built in ${done.seconds} s: ${done.buildings} buildings, ${done.bridges} bridges, ${done.actors} actors.${open.length ? ` Not built: ${open.join("; ")}` : ""}`);
      }
    } catch {
      // Not a summary: nothing to say.
    }
  }

  let build: (() => { open(): void }) | null = () => {
    installWorldBuilderStyle(doc);
    const frame = createForgeWindow({
      document: doc, host: options.host, area: options.area, title: "World Builder", storage, storageKey: WINDOW_KEY, testId: "world-builder",
      size: { width: 780, height: 730 },
    });
    let choices = stored();
    let state: WorldBuilderState | null = null;
    let name = "";
    let building = false;
    /** Middle of the last preview's ground heights, for the new level's first view. */
    let groundHeight = 0;
    const covers = new Map<string, Promise<unknown>>();

    const root = el("div", "random-world", undefined, "random-world-panel");
    const pack = el("div", "random-world-pack", undefined, "world-builder-pack");
    const packText = el("span");
    const addPack = button("Add Pack", "world-builder-add-pack", "Eksik içerik paketlerini forge.project.json'a ekler; sunucu yeniden başlar", () => void addPacks());
    pack.append(packText, addPack);
    pack.hidden = true;

    const column = el("div", "random-world-options");
    const nameHost = el("div");
    const shapeHost = el("div");
    const detailHost = el("div");
    const settlements = el("div", "detail-row");
    const settlementLabel = el("span", "", "Settlements");
    settlementLabel.title = "Yerleşimler ve türleri. Hamlet: mezra (~40 kişi), Village: köy (~180), Town: kasaba (~600). Yer kalmazsa yerleşim çıkarılır.";
    const settlementBox = el("div", "random-world-settlements");
    const chips = el("div", "random-world-chips");
    const adders = el("div", "random-world-add");
    const addButtons = (Object.keys(SETTLEMENT_TYPES) as SettlementType[]).map((type) =>
      button(`+ ${SETTLEMENT_LABELS[type]}`, `world-builder-add-${type}`, "Yerleşim ekle", () => change({ settlements: [...choices.settlements, type] })));
    adders.append(...addButtons);
    settlementBox.append(chips, adders);
    settlements.append(settlementLabel, settlementBox);
    const roll = button("Roll Dice", "world-builder-roll", "Başka bir tohum seç", () => {
      let seed = newSeed();
      while (seed === choices.seed) seed = newSeed();
      change({ seed });
    });
    const waterNote = el("div", "random-world-water", "Su Faz 7'de geliyor: şimdilik nehir ve göl yatakları ile kıyı araziye işlenir, su çizilmez. Dünya sonra aynı seçimlerle yeniden kurulabilir.", "world-builder-water-note");
    column.append(nameHost, shapeHost, settlements, detailHost, roll, waterNote);

    const preview = el("div", "random-world-preview");
    const canvas = el("canvas", "", undefined, "random-world-preview");
    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    canvas.setAttribute("aria-label", "Preview");
    const summary = el("div", "random-world-summary", "Önizleme hazırlanıyor…", "random-world-summary");
    const notes = el("ul", "random-world-notes");
    const previewError = el("div", "random-world-error");
    previewError.setAttribute("role", "alert");
    preview.append(canvas, summary, el("div", "random-world-hint", "Kuzey yukarıda. Yollar düz çizgiyle gösterilir; gerçek güzergâh kurulumda çizilir. Sokak, yapı ve ağaç önizlemede yok."), notes, previewError);

    const create = el("div", "random-world-create");
    const actions = el("div", "random-world-actions");
    const path = el("span", "random-world-path", undefined, "random-world-level");
    const createButton = button("Create", "random-world-create", "Dünyayı kur ve aç", () => void createWorld(), "forge-btn-primary");
    actions.append(path, createButton);
    const targetNote = el("div", "random-world-hint", undefined, "random-world-target");
    const progress = el("div", "random-world-progress", undefined, "random-world-progress");
    const bar = el("progress");
    bar.max = 1;
    const progressLabel = el("span");
    progress.append(bar, progressLabel);
    progress.hidden = true;
    const createError = el("div", "random-world-error", undefined, "random-world-error");
    createError.setAttribute("role", "alert");
    create.append(actions, targetNote, progress, createError);
    root.append(pack, column, preview, create);
    frame.body.append(root);

    const folder = (): string => `${state?.levels ?? "content/levels"}/${name}`;
    const ready = (): boolean => state !== null && !state.readOnly && state.missing.length === 0 && !state.restarting;

    const showError = (message: string | null): void => {
      createError.hidden = message === null;
      createError.textContent = message ?? "";
    };
    showError(null);

    /** The target line, the pack line and the buttons, from the state and the name. */
    const syncTarget = (): void => {
      const plain = plainFolderName(name);
      path.textContent = plain ? folder() : "—";
      targetNote.textContent = !plain
        ? "Ad yalnız harf, rakam, boşluk, _ . - içerebilir."
        : options.exists(folder()) ? "Bu adda bir level var; Create yerini almadan önce sorar." : "Yeni level; kurulunca açılır ve Content Browser'da görünür.";
      createButton.disabled = building || !plain || !ready();
      pack.hidden = state === null || ready();
      if (state && !ready()) {
        packText.textContent = state.readOnly
          ? "Bu proje salt okunur; dünya kurulamaz. Kendi projenizi npm run create-project ile oluşturun."
          : state.restarting ? "Dev server yeniden başlıyor…"
          : `World Builder'ın içerik paketi bu projede seçili değil: ${state.missing.join(", ")}.`;
        addPack.hidden = state.readOnly || state.restarting;
      }
    };

    const coverData = (file: string): Promise<unknown> => {
      let pending = covers.get(file);
      if (!pending) {
        pending = options.client.read(file).then((found) => {
          if (!found) throw new Error(`${file} bulunamadı.`);
          return (JSON.parse(found.text) as { data: unknown }).data;
        });
        pending.catch(() => covers.delete(file));
        covers.set(file, pending);
      }
      return pending;
    };
    const previewFailed = (message: string): void => {
      previewError.hidden = false;
      previewError.textContent = `Önizleme çizilemedi: ${message}`;
      root.dataset.previewState = "error";
    };
    const previewReady = (picture: RandomWorldPreview): void => {
      previewError.hidden = true;
      drawWorldPreview(canvas, picture);
      const km = Math.round(picture.extent / 1000);
      const [low, high] = picture.heightRange;
      groundHeight = (low + high) / 2;
      summary.textContent = `${km} × ${km} km · ${picture.settlements.length} yerleşim · ${picture.rivers.length} nehir · ${picture.lakes.length} göl · yükseklik ${Math.round(low)}–${Math.round(high)} m`;
      notes.hidden = picture.notes.length === 0;
      notes.replaceChildren(...picture.notes.map((note) => el("li", "", note)));
      root.dataset.previewState = "ready";
    };
    const previewer = createWorldPreviewer(previewReady, previewFailed);
    let timer = 0;
    let wanted = 0;
    const schedulePreview = (delay: number): void => {
      view.clearTimeout(timer);
      // A ready picture always describes the current choices, never the last request.
      previewer.cancel();
      const ticket = (wanted += 1);
      root.dataset.previewState = "pending";
      if (state === null || state.missing.length > 0 || state.restarting) return;
      timer = view.setTimeout(() => {
        const asked = choices;
        coverData(COVERS[asked.cover]).then((cover) => {
          if (ticket === wanted) previewer.request({ id: "preview", name: "Preview", ...randomWorldRequest(asked) }, cover);
        }, (error: unknown) => {
          if (ticket === wanted) previewFailed(error instanceof Error ? error.message : String(error));
        });
      }, delay);
    };

    const forms = new Map<HTMLElement, { key: string; form: FormView }>();
    const showForm = (host: HTMLElement, fields: FieldMap, value: Record<string, unknown>, onChange: (next: Record<string, unknown>) => void): void => {
      const key = JSON.stringify(formFields(fields));
      const shown = forms.get(host);
      if (shown?.key === key) {
        shown.form.update(value);
        return;
      }
      const form = createFormView({ document: doc, fields: formFields(fields), value, testIdPrefix: "world-builder", warn: (message) => options.status(message, "warning"), onChange: (changed) => onChange(changed.next) });
      host.replaceChildren(form.element);
      forms.set(host, { key, form });
    };
    const only = (fields: FieldMap): Record<string, unknown> => Object.fromEntries(Object.keys(fields).map((key) => [key, choices[key as keyof RandomWorldChoices]]));
    const syncForms = (): void => {
      showForm(nameHost, { name: text({ default: "", label: "Name", hint: "Yeni level'ın adı; klasörü bu adla açılır." }) }, { name }, (next) => {
        name = String(next.name ?? "").trim();
        syncTarget();
      });
      const apply = (next: Record<string, unknown>): void => change(next as Partial<RandomWorldChoices>);
      const shape = shapeFields(choices);
      showForm(shapeHost, shape, only(shape), apply);
      const detail = detailFields(choices);
      showForm(detailHost, detail, only(detail), apply);
      chips.replaceChildren(...choices.settlements.map((type, index) => {
        const chip = el("span", "random-world-chip", SETTLEMENT_LABELS[type], "random-world-settlement");
        const remove = button("×", "random-world-remove", "Yerleşimi çıkar", () => change({ settlements: choices.settlements.filter((_, at) => at !== index) }));
        remove.setAttribute("aria-label", `Remove ${SETTLEMENT_LABELS[type]}`);
        remove.disabled = choices.settlements.length <= 1;
        chip.append(remove);
        return chip;
      }));
      for (const add of addButtons) add.disabled = choices.settlements.length >= MAX_RANDOM_SETTLEMENTS;
      waterNote.hidden = !asksForWater(choices);
    };
    const change = (patch: Partial<RandomWorldChoices>): void => {
      choices = settleRandomWorldChoices({ ...choices, ...patch });
      remember(storage, CHOICES_KEY, JSON.stringify(choices));
      syncForms();
      schedulePreview(PREVIEW_DELAY);
    };

    const refreshState = async (): Promise<void> => {
      try {
        state = await api.state();
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
        return;
      }
      if (name === "") {
        // The open generated level can be made again; else a free name.
        const open = baseName(options.level);
        name = options.level === `${state.levels}/${open}` && options.exists(`${options.level}/${open}.worldbrief.json`) ? open
          : freeWorldName((candidate) => options.exists(`${state!.levels}/${candidate}`));
        syncForms();
      }
      syncTarget();
      schedulePreview(0);
    };

    const addPacks = async (): Promise<void> => {
      if (options.dirty()) {
        options.status("Sunucu yeniden başlarken editör kendini yeniler; önce kaydedin.", "warning");
        return;
      }
      addPack.disabled = true;
      try {
        await api.addPacks();
        remember(session, REOPEN_KEY, "1");
        state = { ...state!, missing: [], restarting: true };
        syncTarget();
        // Vite's client reloads the page when the server is back; this does it where it does not.
        for (;;) {
          await new Promise((done) => view.setTimeout(done, RESTART_POLL));
          const now = await api.state().catch(() => null);
          if (now && now.missing.length === 0 && !now.restarting) break;
        }
        view.location.reload();
      } catch (error) {
        addPack.disabled = false;
        showError(error instanceof Error ? error.message : String(error));
      }
    };

    const setProgress = (fraction: number, label: string): void => {
      progress.hidden = false;
      bar.value = fraction;
      progressLabel.textContent = label;
    };
    const createWorld = async (): Promise<void> => {
      if (building || !ready() || !plainFolderName(name)) return;
      const out = folder();
      const force = options.exists(out);
      const replacesOpen = out === options.level;
      const unsaved = replacesOpen && options.dirty() ? "\nKaydedilmemiş değişiklikler de kaybolur." : "";
      if (force && !view.confirm(`"${out}" yeniden kurulacak ve level'daki her şeyin (arazi, nesneler, boyanmış foliage, elle yapılan değişiklikler) yerini alacak.${unsaved}\nDevam edilsin mi?`)) {
        root.dataset.createState = "cancelled";
        return;
      }
      const world = randomWorldRequest(choices);
      building = true;
      root.dataset.createState = "building";
      showError(null);
      setProgress(0, "Kurucu başlatılıyor…");
      syncTarget();
      try {
        const done = await api.build({ out, force, world }, (step) => setProgress((WORLD_BUILD_STEPS.indexOf(step) + 1) / (WORLD_BUILD_STEPS.length + 1), STEP_LABELS[step]));
        setProgress(1, `Bitti (${done.seconds} s): ${done.buildings} yapı, ${done.bridges} köprü, ${done.actors} aktör. Level açılıyor…`);
        root.dataset.createState = "done";
        // A new world opens looking over all of it, not at the ground at the origin.
        storeEditorCameraPose(storage, `${options.projectName}/${done.level}`, overviewCameraPose(worldExtent(world.size), groundHeight));
        remember(session, REPORT_KEY, JSON.stringify(done));
        options.openLevel(done.level, baseName(done.level), replacesOpen);
      } catch (error) {
        root.dataset.createState = "error";
        progress.hidden = true;
        showError(`Dünya kurulamadı: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        building = false;
        syncTarget();
      }
    };

    syncForms();
    syncTarget();
    schedulePreview(0);
    return {
      open() {
        frame.open();
        void refreshState();
      },
    };
  };

  let panel: { open(): void } | null = null;
  const open = (): void => {
    if (!panel && build) {
      panel = build();
      build = null;
    }
    panel?.open();
  };
  if (recall(session, REOPEN_KEY) !== null) {
    remember(session, REOPEN_KEY, null);
    open();
  }
  return { open };
}
