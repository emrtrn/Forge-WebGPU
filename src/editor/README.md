# Editor

The editor (plan phase 4, architecture §4.7). Only reached through a dev-only
dynamic import (`editor-only-dynamic`); a game build never contains it. DOM and
services, no three: the editor's 3D code lives in `src/render/editor/`, a
feature's helper drawing in `features/*/editorRender.ts` (phase 4 decision 1).

- `ui/`: the UI kit (K7). `createFormView` draws a schema form (core
  `formOf` / `formFields`) as Details rows: English names, Turkish hints,
  bounded numbers as slider + box with the range under the name, clamping
  with a Turkish warning (`paramFields.ts`), X / Y / Z axis fields, rotation
  in degrees stored as a quaternion. Every panel draws its fields with it.
  Styles in `kitStyle.ts` (Forge's tokens and classes), icons in `icons.ts`.
- `?editor-kit` (dev server only) shows every engine component's generated
  form; `npm run smoke:editor` checks the kit there (in the gate and CI).
- `main.ts`: `startEditor`, the `?editor` page (dev server only): the
  project's level opened into the editor's world, the shell, the frame loop.
- `shell/`: Forge's layout (top bar, Outliner, Details, viewport panel,
  status toast) and the view controls' hover menus (Camera; keys 1-4).
- `content/`: the Content Browser (Forge's Content Drawer): the dev server's
  listing (`GET /__forge/content`) as a folder tree and folder contents
  (`contentModel.ts`, DOM-free; a level folder is a Level card), the
  virtualised card grid, the drawer (`contentPanel.ts`); Details' asset
  catalog reads the same listing (`assets/assetCatalog.ts`).
- `session/`: the editor session (level session, the editor's world kept in
  step, selection, save).
- `assets/`: the shared asset editor (phase 4 / 7): document adapters and
  revisioned sessions with independent undo/redo, a virtual schema table,
  model tools and the actor-class tree. Content Browser double click/Open
  or Ctrl+E on a placed source opens one window. Save/Discard/Cancel guards
  switching; a 409 keeps the draft, Reload reads disk after confirmation.
  Features register asset presentation/tools through `assetEditors` and
  renderer factories through `editorRender.ts`'s `assetPreviews`. Rendering
  remains in `render/editor`: the level's canvas/device is leased to the
  preview and restored on close. Drafts have private geometry/materials;
  successful saves refresh users without saving or dirtying the level.
  The generic form/table is automatic for game-defined JSON asset schemas.
- The viewport (`src/render/editor`, three): the editor camera (Forge's
  controls and presets, the pose remembered per level), the drawing layer
  after the frame (scene-depth tested, no tone mapping) and its grid.
