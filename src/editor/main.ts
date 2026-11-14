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
// editor catalog (Outliner icons and type groups).
//
// The actors hidden in the editor's view (session visibility, step 5a) are
// the page's, per level (localStorage), never the level's.

import {
  createSchemaRegistry,
  installFeatures,
  normalizeActorClass,
  openLevelFromServer,
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
import { assembleLevel } from "../runtime/assembler.ts";
import { createWorld, type World } from "../runtime/world.ts";
import { createEditorCatalog } from "./host/editorCatalog.ts";
import type { FeatureEditorDef } from "./host/featureEditor.ts";
import { installOutlinerStyle } from "./outliner/outlinerStyle.ts";
import { createEditorSession, type EditorSession } from "./session/editorSession.ts";
import { createShell } from "./shell/shell.ts";
import { createTransformTools, type TransformTools } from "./transformTools.ts";
import { installShellStyle } from "./shell/shellStyle.ts";
import { installKitStyle } from "./ui/kitStyle.ts";
import { createViewportControls } from "./viewportControls.ts";

const helperModules = import.meta.glob<{ default: EditorRenderBindingDef }>("../features/*/editorRender.ts", { eager: true });
/** The engine features' editor helper bindings. */
export const EDITOR_HELPER_BINDINGS: readonly EditorRenderBindingDef[] = Object.values(helperModules).map((module) => module.default);

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
  doc.title = `${options.projectName} · Editor`;
  const shell = createShell({ document: doc, projectName: options.projectName, levelFolder: options.level, readOnly: options.readOnly });
  doc.body.replaceChildren(shell.root);

  try {
    const registry = createSchemaRegistry();
    installFeatures(options.features, registry);
    const classes = new Map<AssetId, ActorClassDoc>();
    for (const raw of await options.client.classes()) {
      const result = normalizeActorClass(raw, { strict: true, registry });
      if (result.value) classes.set(result.value.id, result.value);
      else shell.status(`An actor class cannot be read: ${result.issues.map((issue) => issue.message).join("; ")}`, "warning");
    }
    const resolveClass: ClassResolver = (id) => classes.get(id);
    const opened = await openLevelFromServer(options.client, options.level, { strict: true, registry, resolveClass });
    const errors = opened.issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      shell.status(`The level has errors: ${errors.map((issue) => `${issue.file} ${issue.path}: ${issue.message}`).join("; ")}`, "error");
      return;
    }

    // Set once the world and the session exist; the viewport reads them through these.
    let world: World | null = null;
    let editor: EditorSession | null = null;
    let tools: TransformTools | null = null;
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
        const actor = viewport.pick(clientX, clientY);
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
    const session = createEditorSession({ level: opened.session, world, client: options.client, hidden: readHidden(storage, levelKey) });
    editor = session;
    let hiddenKey = JSON.stringify(session.visibility.ids());
    session.onChange(() => {
      const ids = session.visibility.ids();
      const key = JSON.stringify(ids);
      if (key === hiddenKey) return;
      hiddenKey = key;
      writeHidden(storage, levelKey, ids);
    });
    shell.attach(session, { catalog: createEditorCatalog(FEATURE_EDITORS, registry), resolveClass });
    tools = createTransformTools({ editor: session, viewport, storage: pageStorage(doc), status: (message, tone) => shell.status(message, tone) });
    shell.attachTools(tools, () => viewport.camera.navigating);
    const warnings = opened.issues.filter((issue) => issue.severity === "warning");
    if (warnings.length > 0) shell.status(`Level read with ${warnings.length} warning(s): ${warnings[0]!.message}`, "warning");

    const view = doc.defaultView!;
    let last: number | null = null;
    const frame = (now: number): void => {
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      try {
        world!.tick(dt);
        viewport.frame(now);
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
