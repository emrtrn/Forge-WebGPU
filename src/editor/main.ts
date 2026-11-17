// The editor's entry (plan phase 4 step 2): `?editor` on the dev server.
// Reached only through a dev-only dynamic import in src/main.ts, so a game
// build never contains it (`editor-only-dynamic`).
//
//   project -> registry (engine + game features) -> actor classes -> level
//   session (every cell, decision 11) -> viewport (render host, editor
//   camera, drawing layer; src/render/editor) -> the editor's world
//   (`mode: "editor"`: render, environment, fog; never physics or gameplay)
//   -> shell -> transform tools (gizmo, snap, pivot; step 4) -> frame loop
//
// The features' editor helpers (`features/*/editorRender.ts`) are collected
// here, never by the game (`editor-render-is-editor-only`), and run in the
// editor's world through the viewport's `forge.editorHelpers`. So are their
// editor sides (`features/*/editor.ts`, `defineFeatureEditor`; step 5): the
// editor catalog (Outliner icons and type groups). A game project's editor
// sides (its `editor.ts` files, step 10, INV-A32) come from the dev server
// (`virtual:forge/game-editors`) and join them.
//
// The actors hidden in the editor's view (session visibility, step 5a) are
// the page's, per level (localStorage), never the level's.
//
// Play (step 8, play/play.ts) opens the game in a new tab with the level as
// the editor holds it, through a play session: nothing is saved. Leaving the
// page with unsaved level edits asks first.

import {
  createSchemaRegistry,
  FORGE_REQUEST_HEADER,
  installFeatures,
  normalizeActorClass,
  normalizeActorDoc,
  effectiveComponents,
  FILE_EVENT,
  openLevelFromServer,
  normalizeHlodIndex,
  HLOD_SCHEMA,
  assignCells,
  type HlodIndex,
  type ActorClassDoc,
  type ActorId,
  type AssetId,
  type ClassResolver,
  type FeatureDef,
  type JsonAssetTypeDef,
  type SaveClient,
} from "../core/index.ts";
import type { AssetUrls } from "../render/resources/assetUrls.ts";
import type { RenderBindingDef } from "../render/sync/renderBinding.ts";
import type { EditorRenderBindingDef } from "../render/editor/editorBinding.ts";
import { createEditorViewport } from "../render/editor/editorViewport.ts";
import { createThumbnailRenderer } from "../render/editor/thumbnails.ts";
import { createAssetPreview, type AssetPreviewRegistration } from "../render/editor/assetPreview.ts";
import { createAssetEditor } from "./assets/assetEditor.ts";
import { assetDocumentAdapter, type EditableAsset } from "./assets/assetDocument.ts";
import type { AssetFile } from "../render/resources/assetUrls.ts";
import { assembleLevel } from "../runtime/assembler.ts";
import { createWorld, type World } from "../runtime/world.ts";
import { createAssetDrop, type AssetDrop } from "./content/assetDrop.ts";
import { createContentPanel } from "./content/contentPanel.ts";
import { installContentStyle } from "./content/contentStyle.ts";
import { createContentStore } from "./content/contentStore.ts";
import { createContentThumbnails, type ContentThumbnails } from "./content/contentThumbnails.ts";
import { newAssetItems, newLevelActors } from "./content/newAssets.ts";
import { installDetailsStyle } from "./details/detailsStyle.ts";
import { createEditCommands, pageClipboard, type EditCommands } from "./edit/editCommands.ts";
import { createEditorCatalog } from "./host/editorCatalog.ts";
import { collectGameEditors } from "./host/gameEditors.ts";
import gameEditors from "virtual:forge/game-editors";
import type { FeatureEditorDef } from "./host/featureEditor.ts";
import { installOutlinerStyle } from "./outliner/outlinerStyle.ts";
import { createActorPlacer, EMPTY_ACTOR } from "./place/actorPlacer.ts";
import { installAddActorStyle } from "./place/addActorStyle.ts";
import { installContextMenuStyle } from "./ui/contextMenu.ts";
import { installWorldSettingsStyle } from "./world/worldSettingsPanel.ts";
import { createEditorPlay } from "./play/play.ts";
import { createEditorSession, type EditorSession } from "./session/editorSession.ts";
import { createEditorCellStreaming } from "./session/cellStreaming.ts";
import { HlodSourceKey, hlodPlacementsOf, hlodCellSourceHash } from "../engine/world/hlod.ts";
import { createWorldPartitionPanel } from "./world/worldPartitionPanel.ts";
import { KeptRegionsKey } from "../engine/world/keptRegions.ts";
import { RenderReadinessKey } from "../engine/world/renderReadiness.ts";
import { createHlodClient } from "./world/hlodClient.ts";
import { createHlodController } from "./world/hlodController.ts";
import { createHlodControls } from "./world/hlodControls.ts";
import { createShell } from "./shell/shell.ts";
import type { ChangedFile } from "./session/liveRefresh.ts";
import { createTransformTools, type TransformTools } from "./transformTools.ts";
import { installShellStyle } from "./shell/shellStyle.ts";
import { installKitStyle } from "./ui/kitStyle.ts";
import { createViewportControls } from "./viewportControls.ts";

const helperModules = import.meta.glob<{ default?: EditorRenderBindingDef; assetPreviews?: readonly AssetPreviewRegistration[] }>("../features/*/editorRender.ts", { eager: true });
/** The engine features' editor helper bindings. */
export const EDITOR_HELPER_BINDINGS: readonly EditorRenderBindingDef[] = Object.values(helperModules).flatMap((module) => module.default ? [module.default] : []);
const ASSET_PREVIEWS = Object.values(helperModules).flatMap((module) => module.assetPreviews ?? []);

const editorModules = import.meta.glob<{ default: FeatureEditorDef }>("../features/*/editor.ts", { eager: true });
/** The engine features' editor sides. */
export const FEATURE_EDITORS: readonly FeatureEditorDef[] = Object.values(editorModules).map((module) => module.default);

const HIDDEN_STORAGE_PREFIX = "forge.editor.hidden:";

/** The actors this page hid in a level; empty when nothing is stored or the storage refuses. */
function readHidden(storage: Storage | null, levelKey: string): ActorId[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(HIDDEN_STORAGE_PREFIX + levelKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is ActorId => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeHidden(storage: Storage | null, levelKey: string, ids: readonly ActorId[]): void {
  try {
    if (ids.length === 0) storage?.removeItem(HIDDEN_STORAGE_PREFIX + levelKey);
    else storage?.setItem(HIDDEN_STORAGE_PREFIX + levelKey, JSON.stringify(ids));
  } catch {
    // The page keeps them until it is closed.
  }
}

/** The tab's session storage (the Play session's id); null where the browser refuses it. */
function tabStorage(doc: Document): Storage | null {
  try {
    return doc.defaultView?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** The page's local storage (the viewport's remembered pose); null where the browser refuses it. */
function pageStorage(doc: Document): Storage | null {
  try {
    return doc.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface EditorStartOptions {
  readonly document: Document;
  /** Engine features, then the game module's. */
  readonly features: readonly FeatureDef[];
  readonly bindings: readonly RenderBindingDef[];
  readonly client: SaveClient;
  readonly assetUrls: AssetUrls;
  readonly materialType: JsonAssetTypeDef | null;
  readonly forceWebGL: boolean;
  readonly projectName: string;
  /** Project-relative level folder. */
  readonly level: string;
  readonly readOnly: boolean;
}

export async function startEditor(options: EditorStartOptions): Promise<void> {
  const doc = options.document;
  installKitStyle(doc);
  installShellStyle(doc);
  installOutlinerStyle(doc);
  installDetailsStyle(doc);
  installAddActorStyle(doc);
  installContextMenuStyle(doc);
  installWorldSettingsStyle(doc);
  installContentStyle(doc);
  doc.title = `${options.projectName} · Editor`;
  const content = await createContentStore((input, init) => fetch(input, init));
  const levelFolder = content.index().folder(options.level);
  const shell = createShell({ document: doc, projectName: options.projectName, levelFolder: options.level, readOnly: levelFolder ? !levelFolder.writable : options.readOnly });
  doc.body.replaceChildren(shell.root);

  try {
    const registry = createSchemaRegistry();
    installFeatures(options.features, registry);
    // The engine's feature editors, then the game's (INV-A32): a wrong one stops here, named.
    const editors: readonly FeatureEditorDef[] = [...FEATURE_EDITORS, ...collectGameEditors(gameEditors, options.features)];
    const classes = new Map<AssetId, ActorClassDoc>();
    let classGeneration = 0;
    const refreshClasses = async () => {
      const ticket = ++classGeneration;
      const next = new Map<AssetId, ActorClassDoc>();
      for (const raw of await options.client.classes()) {
      const result = normalizeActorClass(raw, { strict: true, registry });
      if (result.value) next.set(result.value.id, result.value);
      else shell.status(`An actor class cannot be read: ${result.issues.map((issue) => issue.message).join("; ")}`, "warning");
      }
      if (ticket !== classGeneration) return;
      classes.clear(); for (const [id, cls] of next) classes.set(id, cls);
    };
    await refreshClasses();
    const resolveClass: ClassResolver = (id) => classes.get(id);
    const opened = await openLevelFromServer(options.client, options.level, { strict: true, registry, resolveClass }, () => []);
    const errors = opened.issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      shell.status(`The level has errors: ${errors.map((issue) => `${issue.file} ${issue.path}: ${issue.message}`).join("; ")}`, "error");
      return;
    }

    // Set once the world and the session exist; the viewport reads them through these.
    let world: World | null = null;
    let editor: EditorSession | null = null;
    let tools: TransformTools | null = null;
    let commands: EditCommands | null = null;
    let thumbnails: ContentThumbnails | null = null;
    /** Who hears each frame (a Details preview that plays). */
    const frameListeners = new Set<(dt: number) => void>();
    const viewport = createEditorViewport({
      document: doc,
      container: shell.viewport,
      dev: true,
      forceWebGL: options.forceWebGL,
      bindings: options.bindings,
      assetUrls: options.assetUrls,
      materialType: options.materialType,
      storage: pageStorage(doc),
      levelKey: `${options.projectName}/${options.level}`,
      onStatus: (message) => shell.status(message),
      selected: () => editor?.selection.ids() ?? [],
      actor: (id) => world?.context.actor(id),
      // Forge: a plain click selects what is under it (nothing: clears); Ctrl / Shift adds or takes out.
      onClick: (clientX, clientY, additive) => {
        if (!editor) return;
        const hit = viewport.pick(clientX, clientY);
        // Inside a group the outermost group is what a click selects (Forge selected a group's members together).
        const actor = hit && commands ? commands.clickTarget(hit) : hit;
        if (additive) {
          if (actor) editor.selection.toggle(actor);
        } else editor.selection.set(actor ? [actor] : []);
      },
      gizmo: () => tools?.gizmo() ?? null,
      onPointerDown: (event) => tools?.pointerDown(event) ?? false,
      onPointerMove: (event) => tools?.pointerMove(event) ?? null,
      onPointerUp: (event) => tools?.pointerUp(event),
      onPointerCancel: () => void tools?.cancel(),
    });
    await viewport.init();
    viewport.onLost((message) => shell.status(`The GPU device was lost: ${message}. Reload the page.`, "error"));
    shell.attachViewport(
      createViewportControls({ document: doc, viewport, storage: pageStorage(doc), status: (message, tone) => shell.status(message, tone), statsContainer: shell.viewport }),
    );

    world = createWorld({ strict: true, registry, resolveClass, features: [...options.features, viewport.feature(options.features), viewport.helperFeature(options.features, EDITOR_HELPER_BINDINGS)], mode: "editor" });
    world.init();
    assembleLevel(world, opened.session.level, { strict: true, resolveClass });
    world.beginPlay();
    const levelKey = `${options.projectName}/${options.level}`;
    const storage = pageStorage(doc);
    let afterSaved = (): void => {};
    const session = createEditorSession({ level: opened.session, world, client: options.client, read: { strict: true, registry, resolveClass }, hidden: readHidden(storage, levelKey), onSaved: () => afterSaved() });
    editor = session;
    const streaming = createEditorCellStreaming({
      level: session.level, client: options.client, read: { strict: true, registry, resolveClass },
      busy: () => viewport.host!.cache.busy(), status: (message, tone) => shell.status(message, tone),
    });
    session.streaming = streaming;
    world.services.provide(KeptRegionsKey, streaming);
    const publishCells = (): void => { shell.root.dataset.forgeCells = JSON.stringify(streaming.cells()); };
    streaming.onChange(publishCells); publishCells();
    let hlodIndex: HlodIndex | null = null;
    let hlodRevision = 0;
    // A revision bump drops every drawn proxy, so it happens only for a different index or a forced
    // publication reload (same index bytes can still carry new proxy GLBs, e.g. a recoloured model).
    let hlodText: string | null | undefined, hlodReadAt = 0;
    const refreshHlod = async (force = false): Promise<void> => {
      const readAt = Date.now();
      const file = await options.client.read(`${options.level}/hlod.json`);
      const text = file?.text ?? null;
      if (!force && text === hlodText) return;
      const checked = text !== null ? normalizeHlodIndex(JSON.parse(text)) : null;
      hlodIndex = checked?.ok && checked.value?.level === session.level.level.id ? checked.value : null;
      hlodText = text; hlodReadAt = readAt; hlodRevision += 1;
    };
    await refreshHlod();
    if (options.client.readBinary) world.services.provide(HlodSourceKey, {
        get index() { return hlodIndex ?? { schema: HLOD_SCHEMA, level: session.level.level.id, cellSize: session.level.level.settings.cellSize, cells: [], clusters: [] }; },
        get revision() { return hlodRevision; },
        isCellActive: (key) => session.level.isLoaded(key) && (renderCells.get(key) ?? []).every((id) => world!.services.get(RenderReadinessKey)?.isActorReady(id) ?? true),
        load: (file) => options.client.readBinary!(`${options.level}/${file}`),
      });
    let hiddenKey = JSON.stringify(session.visibility.ids());
    session.onChange(() => {
      const ids = session.visibility.ids();
      const key = JSON.stringify(ids);
      if (key === hiddenKey) return;
      hiddenKey = key;
      writeHidden(storage, levelKey, ids);
    });
    const assets = content.catalog;
    // The renderer's GUID -> file table follows the listing (a file added since the page loaded, step 6).
    const refreshAssetUrls = async (): Promise<void> => {
      try {
        const response = await fetch("/__forge/asset-files", { headers: { [FORGE_REQUEST_HEADER]: "1" } });
        if (response.ok) options.assetUrls.update(((await response.json()) as { assets?: Record<string, AssetFile> }).assets ?? {});
      } catch {
        // The table read at boot stays.
      }
    };
    await refreshAssetUrls();
    // A thumbnail of a file the listing just brought waits for the renderer's table to have it.
    let assetUrlsReady: Promise<void> = Promise.resolve();
    content.onChange(() => {
      assetUrlsReady = refreshAssetUrls();
      // Classes created/copied/deleted in engine content mode are usable by
      // Add Actor without restarting the server or reopening the page.
      void refreshClasses().catch(() => shell.status("Actor classes could not be refreshed; refresh the content browser to retry.", "warning"));
    });
    const host = viewport.host;
    const thumbnailRenderer = host ? createThumbnailRenderer({ renderer: host.renderer, resources: host.resources("thumbnails"), document: doc }) : null;
    thumbnails = createContentThumbnails({
      document: doc,
      fetch: (input, init) => fetch(input, init),
      draw: thumbnailRenderer ? (kind, guid) => assetUrlsReady.then(() => thumbnailRenderer.render(kind, guid)) : null,
    });
    commands = createEditCommands({
      editor: session,
      registry,
      resolveClass,
      clipboard: pageClipboard(doc.defaultView?.navigator.clipboard),
      status: (message, tone) => shell.status(message, tone),
    });
    const catalog = createEditorCatalog(editors, registry);
    // Files changed on disk by anything but this editor (step 9f): bound once the panels exist.
    let followDisk: (files: readonly ChangedFile[]) => Promise<void> = async () => undefined;
    shell.attach(session, {
      catalog,
      registry,
      resolveClass,
      assets,
      commands,
      followDisk: (files) => followDisk(files),
      onFrame: (listener) => {
        frameListeners.add(listener);
        return () => frameListeners.delete(listener);
      },
    });
    const renderCells = new Map<string, ActorId[]>();
    let hlodStatus = { present: hlodIndex !== null, stale: [] as string[], unchecked: 0 };
    const updateHlodStatus = (): void => {
      const assignment = assignCells(session.level.level.actors, session.level.level.settings, { strict: false, registry, resolveClass }).value;
      renderCells.clear();
      for (const [id, cell] of assignment) if (cell !== null) { const ids = renderCells.get(cell) ?? []; ids.push(id); renderCells.set(cell, ids); }
      const stale: string[] = [];
      const indexed = new Set(hlodIndex?.cells.map((entry) => entry.key) ?? []);
      let unchecked = session.level.cellKeys().filter((key) => !indexed.has(key)).length;
      for (const entry of hlodIndex?.cells ?? []) {
        if (!session.level.isLoaded(entry.key)) { unchecked += 1; continue; }
        const actors = session.level.level.actors.filter((actor) => assignment.get(actor.id) === entry.key);
        if (hlodIndex?.cellSize !== session.level.level.settings.cellSize || hlodCellSourceHash(hlodPlacementsOf(actors, (id) => session.level.actor(id), resolveClass)) !== entry.sourceHash) stale.push(entry.key);
      }
      hlodStatus = { present: hlodIndex !== null, stale, unchecked };
    };
    updateHlodStatus(); session.level.onApplied(updateHlodStatus);
    let editorDisposed = false;
    const hlodClient = createHlodClient(options.level);
    const hlodWritable = (levelFolder?.writable ?? !options.readOnly) && !options.level.startsWith("engine:");
    const hlodBuild = createHlodController({
      level: options.level, writable: hlodWritable,
      preferenceKey: `forge.editor.hlod.auto:${levelKey}`, storage,
      dirty: () => session.dirty() > 0, save: () => session.save(),
      request: hlodWritable ? hlodClient.request : async () => ({ level: options.level, state: "missing", queued: false, publication: null, message: "Read-only level" }), poll: hlodClient.poll,
      // Skip publications the editor already read: the one it opened with, or one the disk event delivered.
      reload: async (status) => {
        if (editorDisposed || (status.completedAt !== undefined && hlodReadAt >= Date.parse(status.completedAt))) return;
        await refreshHlod(true); if (!editorDisposed) updateHlodStatus();
      },
      status: (message, tone) => shell.status(message, tone),
    });
    afterSaved = () => hlodBuild.saved();
    const stopHlodEdits = session.onChange(() => hlodBuild.edited());
    const hlodControls = createHlodControls(doc, hlodBuild);
    const partition = createWorldPartitionPanel({
      document: doc, streaming, settings: () => ({ ...session.level.level.settings, loadRange: session.level.level.settings.loadRange * (viewport.host?.quality.extensions?.viewDistanceMultiplier ?? 1) }),
      camera: () => viewport.playPose().position, focus: (x, z) => viewport.focusWorld(x, z),
      status: (message, tone) => shell.status(message, tone), hlod: () => hlodStatus,
      onFrame: (listener) => { frameListeners.add(listener); return () => frameListeners.delete(listener); },
      terrain: () => viewport.terrainGrids().flatMap((grid, index) => grid.cells.flatMap((state, at) => {
        if (state === "undeclared") return [];
        const x = at % grid.tilesX, z = Math.floor(at / grid.tilesX);
        const minX = grid.origin[0] + x * grid.tileSize, minZ = grid.origin[1] + z * grid.tileSize;
        return [{ key: `${index}:${x}_${z}`, state, bounds: { minX, minZ, maxX: minX + grid.tileSize, maxZ: minZ + grid.tileSize } }];
      })),
    });
    partition.element.prepend(hlodControls.element);
    shell.attachWorldPartition(partition.element);
    doc.defaultView?.addEventListener("pagehide", () => {
      editorDisposed = true; afterSaved = () => {}; stopHlodEdits(); hlodBuild.dispose(); hlodControls.dispose(); partition.dispose(); streaming.dispose();
    }, { once: true });
    const editCommands = commands;
    tools = createTransformTools({ editor: session, viewport, storage: pageStorage(doc), status: (message, tone) => shell.status(message, tone), duplicate: (coalesce) => editCommands.duplicateForDrag(coalesce) });
    shell.attachTools(tools, () => viewport.camera.navigating);
    const play = createEditorPlay({
      level: session.level,
      client: options.client,
      camera: () => viewport.playPose(),
      storage: tabStorage(doc),
      // The editor's WebGL2 test mode (the editor smoke, CI) plays in it too.
      extraQuery: options.forceWebGL ? "&forceWebGL" : "",
      // noopener: the game gets its own browsing context group (its own process and GPU device), as Forge's Play did.
      open: (url) => void doc.defaultView?.open(url, "_blank", "noopener"),
    });
    shell.attachPlay(() => play.play());
    // Unsaved level edits are not lost to a closed tab or a reload without a question (Open Level asks on its own).
    let leaveConfirmed = false;
    doc.defaultView?.addEventListener("beforeunload", (event) => {
      if (leaveConfirmed || session.dirty() === 0) return;
      event.preventDefault();
      event.returnValue = "";
    });
    const snapOf = tools;
    // A Content Browser asset dragged into the viewport (step 6f) is placed under its own key.
    let assetDrop: AssetDrop | null = null;
    const placer = createActorPlacer({
        editor: session,
        registry,
        resolveClass,
        classes: () => [...classes.values()],
        catalog,
        viewport: {
          pointerRay: (x, y) => viewport.pointerRay(x, y),
          raycast: (origin, direction, far, exclude) => viewport.raycast(origin, direction, far, exclude),
          localBox: (actor) => viewport.localBox(actor),
          centre: () => {
            const rect = shell.viewport.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          },
          nextFrame: () => new Promise<void>((done) => doc.defaultView!.requestAnimationFrame(() => doc.defaultView!.requestAnimationFrame(() => done()))),
        },
        snap: () => snapOf.snap,
        status: (message, tone) => shell.status(message, tone),
        assetEntry: (key) => {
          if (!key.startsWith("asset:")) return undefined;
          const asset = content.index().byId(key.slice("asset:".length));
          const rule = asset?.type ? assetDrop?.placeRule(asset.type) : undefined;
          if (!asset || !rule?.place || asset.id === null) return undefined;
          const placement = rule.place({ guid: asset.id, name: asset.name });
          return {
            key,
            label: asset.name,
            category: "Content",
            icon: placement.icon ?? "generic",
            components: placement.components,
            singleton: false,
            ...(placement.rotation ? { rotation: placement.rotation } : {}),
            ...(placement.lift !== undefined ? { lift: placement.lift } : {}),
            ...(placement.restOnSurface !== undefined ? { restOnSurface: placement.restOnSurface } : {}),
          };
        },
      });
    shell.attachPlacer(placer);
    assetDrop = createAssetDrop({
      host: shell.viewport,
      editors,
      placer,
      editor: session,
      registry,
      resolveClass,
      pickSlot: (x, y) => viewport.pickSlot(x, y),
      status: (message, tone) => shell.status(message, tone),
    });
    const editableAsset = (item: { file: string; id: string | null; type: string | null; name: string; writable: boolean } | undefined): EditableAsset | null =>
      item?.id && item.type ? { ...item, id: item.id, type: item.type } : null;
    const assetEditor = createAssetEditor({
      document: doc, registry, client: options.client, catalog: assets, editors,
      status: (message) => shell.status(message),
      lookup: (id) => editableAsset(content.index().byId(id)),
      source: () => {
        const actor = session.selection.primary();
        const current = actor ? session.level.actor(actor) : null;
        const guid = current?.class ?? Object.values(current?.components ?? {}).find((component) => component.type.startsWith("forge.staticMesh@"))?.mesh;
        return typeof guid === "string" ? editableAsset(content.index().byId(guid)) : null;
      },
      preview: (key, asset, container, edit, status) => {
        const host = viewport.host;
        if (!host) return null;
        const context = { host, container, guid: asset.id, urls: options.assetUrls, materialType: options.materialType, readOnly: !asset.writable,
          edit: (path: readonly (string | number)[], value: unknown, phase: "input" | "commit") => edit("UVW drag", path, value, phase), status,
          classWorld: (document: Readonly<Record<string, unknown>>) => {
            const result = normalizeActorClass(document, { strict: true, registry });
            if (!result.ok || !result.value) throw new Error("Invalid actor class draft.");
            const cls = result.value;
            const resolver: ClassResolver = (id) => id === cls.id ? cls : resolveClass(id);
            const previewWorld = createWorld({ strict: true, registry, resolveClass: resolver, features: [...options.features, host.feature(options.features, "asset-class-preview", { prepare: false })], mode: "editor" });
            try {
              previewWorld.init();
              const actor = normalizeActorDoc({ id: `act_${"f".repeat(32)}`, class: cls.id, name: cls.name, spatiallyLoaded: false }, { strict: true, registry, resolveClass: resolver });
              if (!actor.ok || !actor.value) throw new Error("Cannot preview this class.");
              previewWorld.addActors([actor.value], "level"); previewWorld.beginPlay();
              return { scene: host.world!.scene, frame: (dt: number) => previewWorld.tick(dt), dispose: () => previewWorld.dispose() };
            } catch (error) { previewWorld.dispose(); throw error; }
          },
        };
        if (key === "forge.actorClass") return createAssetPreview(context, "class");
        return ASSET_PREVIEWS.find((entry) => entry.key === key)?.create(context) ?? null;
      },
      beforeSave: (opened) => {
        if (opened.adapter.kind !== "class") return null;
        const result = normalizeActorClass(opened.value(), { strict: true, registry });
        if (!result.ok || !result.value) return "The actor class is invalid.";
        const candidate = result.value;
        for (const actor of session.level.level.actors.filter((actor) => actor.class === candidate.id)) {
          const checked = normalizeActorDoc(actor, { strict: true, registry, resolveClass: (id) => id === candidate.id ? candidate : resolveClass(id) });
          if (!checked.ok) return `${actor.name}: ${checked.issues.map((issue) => issue.message).join("; ")} Your level edits are kept.`;
        }
        return null;
      },
      saved: async (opened) => {
        await content.refresh(true); await refreshAssetUrls(); await refreshClasses();
        assetChanged(opened.asset.id, opened.asset.type);
      },
    });
    /** After an asset's file changed (saved here or on disk): caches forget it, the actors that use it read it again, its thumbnail redraws. */
    const assetChanged = (guid: string, type: string): void => {
      if (type === "forge.model") viewport.host?.cache.evict(`model:${guid}`);
      else if (type === "forge.material") viewport.host?.cache.evictPrefix(`material:${guid}:`);
      const references = new Set([guid]);
      for (const item of content.index().assets) if (item.id && item.type === "forge.model" && JSON.stringify(options.assetUrls.importSettings(item.id)).includes(guid)) references.add(item.id);
      const users = session.level.level.actors.filter((actor) => {
        const value = JSON.stringify({ class: actor.class, components: effectiveComponents(actor, actor.class ? classes.get(actor.class) : undefined) });
        return [...references].some((id) => value.includes(id));
      });
      session.reload(users.map((actor) => actor.id));
      const item = content.index().byId(guid); if (item) thumbnails?.refresh(item);
    };
    // The open level follows the disk in the shell (liveRefresh.ts); the rest of the project here: the listing, the
    // renderer's file table, the classes, the assets the scene uses, the asset window.
    followDisk = async (files) => {
      hlodBuild.diskChanged(files.map((file) => file.path));
      // The index is the publication marker; intermediate proxy writes are not a new scene.
      if (files.some((file) => file.path === `${options.level}/hlod.json`)) {
        await refreshHlod(); updateHlodStatus();
      }
      const others = files.filter((file) => !file.path.startsWith(`${options.level}/`));
      if (others.length === 0) return;
      await content.refresh(true); await refreshAssetUrls(); await refreshClasses();
      updateHlodStatus();
      const changed = new Map<string, string>();
      for (const file of others) {
        const item = content.index().byFile(file.path) ?? content.index().byFile(file.path.replace(/\.meta\.json$/, ""));
        if (item?.id && item.type) changed.set(item.id, item.type);
      }
      for (const [guid, type] of changed) assetChanged(guid, type);
      assetEditor.diskChanged(others);
    };
    // The dev server's file events (tools/server/fileEvents.ts) come on Vite's HMR channel; the editor is dev-only.
    import.meta.hot?.on(FILE_EVENT, (body: { readonly files: readonly ChangedFile[] }) => void shell.diskChanged(body.files));
    shell.attachContent(
      createContentPanel({
        document: doc,
        shell: shell.root,
        store: content,
        storage,
        projectKey: options.projectName,
        activeLevel: options.level,
        status: (message, tone) => shell.status(message, tone),
        save: () => shell.save(),
        thumbnails,
        drag: assetDrop,
        canOpenAsset: (item) => { const asset = editableAsset(item); return !!asset && assetDocumentAdapter(asset, registry) !== null; },
        openAsset: (item) => { const asset = editableAsset(item); if (asset) void assetEditor.open(asset); },
        // Forge's openLevel: unsaved edits are lost after a confirm; the page opens the level (`?level=`).
        openLevel: (folder, name) => {
          const view = doc.defaultView!;
          if (session.dirty() > 0 && !view.confirm(`Open "${name}"?\nUnsaved changes to the current level will be lost.`)) return;
          leaveConfirmed = true;
          const url = new URL(view.location.href);
          url.searchParams.set("level", folder);
          view.location.assign(url.toString());
        },
        newItems: newAssetItems(registry, editors),
        importExtensions: registry.assetTypes().flatMap((def) => (def.storage === "binary" ? def.extensions : [])),
        // A reimported model: the cache forgets it and the actors that use it read it again (step 6e). Another binary
        // (a texture inside materials, a sound) shows after a reload, as in Forge.
        reimported: (item) => {
          if (item.id === null) return;
          if (item.type === "forge.model") {
            viewport.host?.cache.evict(`model:${item.id}`);
            const users = session.level.level.actors.filter((actor) => JSON.stringify(actor).includes(item.id!)).map((actor) => actor.id);
            void assetUrlsReady.then(() => session.reload(users));
          } else {
            shell.status(`${item.name} reimported; reload the page to see it everywhere.`, "warning");
          }
        },
        levelActors: () => newLevelActors([EMPTY_ACTOR, ...editors.flatMap((editor) => editor.addActor)]),
        // The open level's actors that use an asset, saved or not (a delete is refused then; step 6c).
        inUse: (ids) => {
          if (ids.length === 0) return [];
          const names: string[] = [];
          for (const actor of session.level.level.actors) {
            const text = JSON.stringify(actor);
            if (ids.some((id) => text.includes(id))) names.push(actor.name);
          }
          return names;
        },
      }),
    );
    const warnings = opened.issues.filter((issue) => issue.severity === "warning");
    if (warnings.length > 0) shell.status(`Level read with ${warnings.length} warning(s): ${warnings[0]!.message}`, "warning");
    hlodBuild.start();

    const view = doc.defaultView!;
    let last: number | null = null;
    const frame = (now: number): void => {
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      try {
        if (assetEditor.isOpen()) { viewport.host?.frame(now); view.requestAnimationFrame(frame); return; }
        for (const listener of [...frameListeners]) listener(dt);
        const pose = viewport.playPose();
        streaming.update([pose.position[0], pose.position[2]], viewport.host?.quality.extensions?.viewDistanceMultiplier ?? 1);
        world!.tick(dt);
        viewport.frame(now);
        // A thumbnail draws between the viewport's frames, one at a time (step 6b).
        thumbnails?.pump();
      } catch (error) {
        shell.status(`The viewport stopped: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }
      view.requestAnimationFrame(frame);
    };
    view.requestAnimationFrame(frame);
  } catch (error) {
    shell.status(`The editor could not open ${options.level}: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}
