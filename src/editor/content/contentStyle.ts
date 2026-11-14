// The Content Browser's styles: Forge WebGL's `content-*`, `folder-*` and
// `asset-*` rules (src/editor/editorUi.css @ forge-webgl-final: the drawer,
// its toolbar, the folder tree, the cards and thumbnails, and the desktop
// block's drawer geometry, which moves the Outliner's and the viewport's
// bottom edge as the drawer opens). Only change: the card grid is laid out by
// contentGrid.ts (virtualised), so `.content-list` scrolls and
// `.content-list-grid` is the grid. No redesign. What Forge had as prompts
// (rename in place, the import dialog) is contentFormStyle.ts.

import { CONTENT_FORM_CSS } from "./contentFormStyle.ts";

export const CONTENT_CSS = `
.editor-shell {
  --content-drawer-height: clamp(232px, 34vh, 420px);
}

.editor-content-drawer {
  position: absolute;
  left: 0;
  right: 410px;
  bottom: 0;
  z-index: 30;
  height: var(--content-drawer-collapsed-h);
  display: grid;
  grid-template-rows: var(--content-drawer-collapsed-h) minmax(0, 1fr);
  overflow: hidden;
  color: var(--forge-text);
  background: rgba(22, 25, 28, 0.97);
  border-top: 1px solid var(--forge-border-mid);
  box-shadow: 0 -12px 28px rgba(0, 0, 0, 0.38);
  pointer-events: none;
  transition: height 140ms ease;
}

/* The header strip is interactive even while collapsed so its title toggles. */
.content-drawer-top {
  pointer-events: auto;
}

.editor-content-drawer.open {
  pointer-events: auto;
  height: var(--content-drawer-height);
}

.editor-shell.content-drawer-tall {
  --content-drawer-height: clamp(360px, 58vh, 680px);
}

.editor-shell.content-drawer-open .editor-outliner {
  bottom: calc(var(--content-drawer-collapsed-h) + var(--content-drawer-height));
}

.content-drawer-top {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, auto) minmax(160px, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Breadcrumb path lives inline in the toolbar (folder icon + clickable crumbs),
   matching the reference; the grid header keeps only the item count. */
.content-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--forge-text-secondary);
}

.content-breadcrumbs-icon {
  display: inline-grid;
  place-items: center;
  color: var(--forge-text-dim);
}

.content-breadcrumbs-icon svg {
  width: 15px;
  height: 15px;
}

.content-primary-actions,
.content-navigation,
.content-drawer-actions,
.content-search-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.content-primary-actions .forge-btn-primary,
.content-primary-actions .forge-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  white-space: nowrap;
}

/* Restore the accent fill on the primary Add button: the broad
   \`.editor-shell button\` reset (element+class) otherwise out-specifies the
   \`.forge-btn-primary\` token class and greys it out. */
.content-primary-actions .forge-btn-primary {
  border-color: transparent;
  background: var(--forge-accent);
  color: var(--forge-accent-text);
}

.content-primary-actions .forge-btn-primary:hover {
  border-color: var(--forge-accent-hover);
  background: var(--forge-accent-hover);
}

.content-primary-actions svg,
.content-navigation svg,
.content-drawer-actions svg,
.content-filter-button svg {
  width: 14px;
  height: 14px;
}

.content-navigation .forge-btn-ghost,
.content-drawer-actions .forge-btn-ghost,
.content-filter-button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
}

.content-search-wrap {
  position: relative;
}

.content-drawer-title {
  display: flex;
  align-items: center;
  min-width: 0;
}

.content-drawer-collapse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: 5px;
  color: var(--forge-text);
  background: transparent;
  cursor: pointer;
}

.content-drawer-collapse:hover {
  background: rgba(255, 255, 255, 0.06);
}

.content-drawer-collapse strong {
  font-size: 12px;
  letter-spacing: 0.02em;
}

.content-drawer-chevron {
  display: inline-grid;
  place-items: center;
  color: var(--forge-text-secondary);
}

.content-drawer-chevron svg {
  width: 12px;
  height: 12px;
  transition: transform 140ms ease;
}

/* Caret points up while collapsed ("expand up"), flips down when open. */
.editor-shell.content-drawer-open .content-drawer-chevron svg {
  transform: rotate(180deg);
}

/* Collapsed strip shows only the title; the toolbar appears once open. */
.editor-shell:not(.content-drawer-open) .content-primary-actions,
.editor-shell:not(.content-drawer-open) .content-navigation,
.editor-shell:not(.content-drawer-open) .content-breadcrumbs,
.editor-shell:not(.content-drawer-open) .content-search-wrap,
.editor-shell:not(.content-drawer-open) .content-drawer-actions {
  display: none;
}

.content-path,
.content-drawer-status {
  color: var(--forge-text-secondary);
  font-size: 11px;
}

.content-search {
  width: 100%;
  height: 28px;
  border: 1px solid var(--forge-border-strong);
  border-radius: 5px;
  padding: 0 34px 0 8px;
  color: #ffffff;
  background: #101316;
}

.content-search-wrap .content-filter-button {
  position: absolute;
  right: 3px;
  top: 50%;
  width: 22px;
  height: 22px;
  transform: translateY(-50%);
  border-color: transparent;
  background: transparent;
}

.editor-shell .content-filter-button[aria-expanded="true"],
.editor-shell .content-filter-button.is-filtered {
  border-color: #3a4b5d;
  color: #c9d9e7;
  background: #1a2734;
}

.content-filter-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 4;
  display: grid;
  min-width: 190px;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--forge-border-mid);
  border-radius: var(--forge-radius-sm);
  background: var(--forge-bg-1);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
}

.content-filter-popover[hidden] {
  display: none;
}

.content-filter-popover label {
  display: grid;
  gap: 4px;
  color: var(--forge-text-secondary);
  font-size: 11px;
}

.content-filter-popover .content-dev-toggle {
  display: flex;
  align-items: center;
}

.content-filters {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.content-filter {
  min-width: 0;
  width: 100%;
  height: 28px;
  border: 1px solid var(--forge-border-strong);
  border-radius: 5px;
  padding: 0 6px;
  color: #ffffff;
  background: #101316;
}

.content-dev-toggle {
  min-width: 0;
  display: inline-grid;
  grid-template-columns: auto minmax(0, max-content);
  align-items: center;
  gap: 5px;
  color: #d4dde1;
  font-size: 11px;
  white-space: nowrap;
}

.content-dev-toggle input {
  margin: 0;
}

.editor-shell .content-size-toggle {
  min-width: 54px;
}

.editor-shell .content-lock-toggle {
  min-width: 32px;
  padding: 0 6px;
  font-size: 14px;
  line-height: 1;
}

/* Active = locked open: a warm highlight so the open-pin state reads clearly. */
.editor-shell .content-lock-toggle.active {
  border-color: rgba(255, 186, 84, 0.7);
  background: rgba(255, 158, 46, 0.22);
}

.content-drawer-body {
  min-height: 0;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
}

.folder-tree {
  min-height: 0;
  overflow: auto;
  padding: 6px 6px 8px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 14, 16, 0.46);
}

.folder-section-heading {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 6px 3px;
  color: var(--forge-text-dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.folder-section-heading svg,
.folder-row-favorite .folder-caret svg {
  width: 12px;
  height: 12px;
}

.folder-node {
  display: grid;
}

.editor-shell .folder-row {
  width: 100%;
  min-height: 24px;
  display: grid;
  grid-template-columns: 16px 16px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  border-color: transparent;
  border-radius: 4px;
  padding: 0 6px 0 calc(6px + var(--depth) * 12px);
  text-align: left;
  background: transparent;
}

.editor-shell .folder-row:hover {
  background: var(--forge-border-soft);
}

.editor-shell .folder-row.active {
  color: #ffffff;
  background: #1f6fce;
}

.folder-caret {
  display: inline-grid;
  place-items: center;
  width: 16px;
  color: #8b969d;
  font-size: 10px;
  line-height: 1;
}

.editor-shell .folder-row.has-children .folder-caret {
  font-weight: 800;
}

.editor-shell .folder-row.active .folder-caret {
  color: #ffffff;
}

.folder-row-icon {
  position: relative;
  display: inline-block;
  width: 14px;
  height: 10px;
  margin-top: 2px;
  border: 1px solid #d89937;
  border-radius: 2px;
  background: linear-gradient(180deg, #f6cd74 0%, #d99a3d 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.folder-row-icon::before {
  position: absolute;
  top: -4px;
  left: 1px;
  width: 7px;
  height: 4px;
  content: "";
  border: 1px solid #d89937;
  border-bottom: 0;
  border-radius: 2px 2px 0 0;
  background: #efbb5b;
}

.editor-shell .folder-row.active .folder-row-icon {
  border-color: #b9dcff;
  background: linear-gradient(180deg, #d8edff 0%, #8fc7fb 100%);
}

.editor-shell .folder-row.active .folder-row-icon::before {
  border-color: #b9dcff;
  background: #c7e5ff;
}

.folder-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-assets {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 25px minmax(0, 1fr);
  padding: 6px 10px 8px;
}

.content-assets-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.content-path {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Plain-text crumbs (not buttons): the broad \`.editor-shell button\` reset would
   otherwise box them with a border + grey fill + 30px min-height. */
.content-breadcrumbs .content-breadcrumb {
  max-width: 150px;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  padding: 0;
  color: var(--forge-text-secondary);
  background: transparent;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-breadcrumbs .content-breadcrumb:hover {
  color: var(--forge-text-primary);
  background: transparent;
}

.content-breadcrumb-separator {
  padding: 0 5px;
  color: var(--forge-text-dim);
  font-size: 10px;
}

.content-item-count {
  flex: 0 0 auto;
  color: var(--forge-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.content-list {
  position: relative;
  min-height: 0;
  overflow: auto;
  padding-right: 0;
}

/* The grid is virtualised (contentGrid.ts): the sizer is the whole grid's
   height, the grid holds the rows in view; columns and row height come from
   Forge's sizes (auto-fill, minmax(90px, 1fr), 118px rows). */
.content-list-sizer {
  position: relative;
}

.content-list-grid {
  position: absolute;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  grid-auto-rows: 118px;
  gap: 8px;
  align-content: start;
}

.editor-content-drawer[data-content-view="small"] .asset-card {
  height: 95px;
  grid-template-rows: 50px 27px;
}

.editor-content-drawer[data-content-view="small"] .asset-thumb {
  height: 50px;
}

.editor-content-drawer[data-content-view="large"] .asset-card {
  height: 150px;
  grid-template-rows: 100px 32px;
}

.editor-content-drawer[data-content-view="large"] .asset-thumb {
  height: 100px;
}

.editor-shell .asset-card {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 118px;
  display: grid;
  grid-template-rows: 70px 30px;
  gap: 8px;
  border-radius: 6px;
  padding: 6px 6px 4px;
  text-align: left;
}

.editor-shell .asset-card.is-unregistered {
  border-style: dashed;
  opacity: 0.82;
}

/* A Cut file remains available until Paste succeeds, but is visibly pending a move. */
.editor-shell .asset-card.is-cut {
  opacity: 0.5;
}

.editor-shell .asset-card.has-issues {
  border-color: rgba(245, 158, 44, 0.52);
}

.editor-shell .asset-card.is-selected,
.editor-shell .asset-card.is-selected:hover {
  border-color: var(--forge-accent);
  background: var(--forge-accent-soft);
  box-shadow: 0 0 0 1px var(--forge-accent);
}

.editor-shell .asset-card.is-selected .asset-thumb {
  border-color: var(--forge-accent);
}

/* Transient flash when an editor's Browse reveals this card. */
.editor-shell .asset-card.is-revealed {
  animation: as-card-reveal 1.6s ease-out;
}

@keyframes as-card-reveal {
  0%,
  40% {
    box-shadow: 0 0 0 2px #62d3ff, 0 0 14px 2px rgba(98, 211, 255, 0.55);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(98, 211, 255, 0);
  }
}

/* The project's active level: locked against rename/delete, marked with a badge. */
.editor-shell .asset-card.is-active-level {
  border-color: #4ad6a0;
  box-shadow: 0 0 0 1px rgba(74, 214, 160, 0.55);
}

.editor-shell .asset-card.is-active-level .asset-thumb {
  border-color: rgba(74, 214, 160, 0.7);
}

/* Folders read as a large glyph with the name hugging its base (no boxed thumb,
   no floating gap): transparent thumb + glyph bottom-aligned + tight meta gap. */
.editor-shell .asset-card.is-folder {
  gap: 2px;
}

.editor-shell .asset-card.is-folder .asset-thumb {
  border-color: transparent;
  background: transparent;
  place-items: end center;
  padding-bottom: 2px;
}

.folder-thumb .folder-glyph {
  position: relative;
  display: block;
  width: min(122px, 90%);
  height: min(80px, 80%);
  margin-top: 0;
  border: 1px solid #d89a3e;
  border-radius: 4px;
  background: linear-gradient(180deg, #f5cc77 0%, #d9973a 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 3px 7px rgba(0, 0, 0, 0.22);
}

.folder-thumb .folder-glyph::before {
  position: absolute;
  top: -9px;
  left: 4px;
  width: 34%;
  height: 9px;
  content: "";
  border: 1px solid #d89a3e;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  background: #efb85a;
}

.editor-shell .asset-card.is-folder:hover .folder-glyph {
  border-color: #ffe0a0;
  filter: brightness(1.1);
}

.asset-active-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #08110d;
  background: #4ad6a0;
  box-shadow: 0 0 0 1px rgba(8, 17, 13, 0.55);
}

.asset-issue-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  z-index: 2;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1px solid rgba(20, 16, 8, 0.85);
  background: #f2b84b;
  box-shadow: 0 0 0 1px rgba(245, 158, 44, 0.34);
}

.asset-thumb {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 70px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--forge-border);
  border-radius: 4px;
  color: #cbd3d7;
  background-color: #17191d;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.055) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.055) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.055) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.055) 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  font-size: 11px;
  font-weight: 800;
}

.asset-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.asset-meta {
  display: grid;
  grid-template-rows: 15px 13px;
  gap: 1px;
  align-content: start;
  min-width: 0;
}

.asset-meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.asset-type-line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--forge-text-secondary);
  font-size: 10px;
  line-height: 13px;
}

.asset-card.is-actor-script .asset-thumb { color: var(--forge-success-text); }

/* Editor panels retain wheel/trackpad scrolling without native scrollbar gutters. */
.editor-content-drawer .folder-tree,
.editor-content-drawer .content-list {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.editor-content-drawer .folder-tree::-webkit-scrollbar,
.editor-content-drawer .content-list::-webkit-scrollbar {
  display: none;
}

/* A read-only root (engine content, a pack): its lock after the name. */
.editor-shell .folder-row.is-read-only {
  grid-template-columns: 16px 16px minmax(0, 1fr) 14px;
}

.folder-lock {
  display: inline-grid;
  place-items: center;
  color: var(--forge-text-dim);
}

.folder-lock svg {
  width: 11px;
  height: 11px;
}

/* The desktop block: the drawer sits between the Outliner and Details; the
   Outliner and the viewport end above it. */
.editor-content-drawer {
  left: var(--editor-gap);
  right: calc(var(--editor-details-width) + (var(--editor-gap) * 2));
  bottom: var(--editor-gap);
  border: 1px solid #2d3740;
  border-radius: 4px;
  background: linear-gradient(180deg, #171e24 0%, #11171c 100%);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
}

.editor-shell .editor-outliner,
.editor-shell .editor-viewport-host {
  bottom: calc(var(--content-drawer-collapsed-h) + (var(--editor-gap) * 2));
}

.editor-shell.content-drawer-open .editor-outliner,
.editor-shell.content-drawer-open .editor-viewport-host {
  bottom: calc(var(--content-drawer-height) + (var(--editor-gap) * 2));
}

.content-drawer-top { background: rgba(10, 15, 19, 0.44); }

.editor-content-drawer .asset-card { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02); }
`;

export function installContentStyle(document: Document): void {
  if (document.getElementById("forge-content-style")) return;
  const style = document.createElement("style");
  style.id = "forge-content-style";
  style.textContent = CONTENT_CSS + CONTENT_FORM_CSS;
  document.head.append(style);
}
