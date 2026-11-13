// The editor's entry (plan phase 4 step 2): `?editor` on the dev server.
// Reached only through a dev-only dynamic import in src/main.ts, so a game
// build never contains it (`editor-only-dynamic`).
//
//   project -> registry (engine + game features) -> actor classes -> level
//   session (every cell, decision 11) -> viewport (render host, editor
//   camera, drawing layer; src/render/editor) -> the editor's world
//   (`mode: "editor"`: render, environment, fog; never physics or gameplay)
//   -> shell -> frame loop

import {
  createSchemaRegistry,
  installFeatures,
  normalizeActorClass,
  openLevelFromServer,
  type ActorClassDoc,
  type AssetId,
  type ClassResolver,
  type FeatureDef,
  type JsonAssetTypeDef,
  type SaveClient,
} from "../core/index.ts";
import type { AssetUrls } from "../render/resources/assetUrls.ts";
import type { RenderBindingDef } from "../render/sync/renderBinding.ts";
import { CAMERA_VIEWS, type CameraView } from "../render/editor/editorCamera.ts";
import { createEditorViewport } from "../render/editor/editorViewport.ts";
import { assembleLevel } from "../runtime/assembler.ts";
import { createWorld } from "../runtime/world.ts";
import { createEditorSession } from "./session/editorSession.ts";
import { createShell } from "./shell/shell.ts";
import { installShellStyle } from "./shell/shellStyle.ts";
import { installKitStyle } from "./ui/kitStyle.ts";

/** Forge's Camera menu labels. */
const VIEW_LABELS: Readonly<Record<CameraView, string>> = { perspective: "Perspective", top: "Top", left: "Left", front: "Front" };

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
    });
    await viewport.init();
    viewport.onLost((message) => shell.status(`The GPU device was lost: ${message}. Reload the page.`, "error"));
    shell.attachViewport({
      views: CAMERA_VIEWS.map((view) => [view, VIEW_LABELS[view]] as const),
      view: () => viewport.view,
      setView: (view) => viewport.setView(view as CameraView),
      onViewChange: (listener) => viewport.onViewChange(listener),
    });

    const world = createWorld({ strict: true, registry, resolveClass, features: [...options.features, viewport.feature(options.features)], mode: "editor" });
    world.init();
    assembleLevel(world, opened.session.level, { strict: true, resolveClass });
    world.beginPlay();
    const editor = createEditorSession({ level: opened.session, world, client: options.client });
    shell.attach(editor);
    const warnings = opened.issues.filter((issue) => issue.severity === "warning");
    if (warnings.length > 0) shell.status(`Level read with ${warnings.length} warning(s): ${warnings[0]!.message}`, "warning");

    const view = doc.defaultView!;
    let last: number | null = null;
    const frame = (now: number): void => {
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      try {
        world.tick(dt);
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
