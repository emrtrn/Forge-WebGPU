// The Content Browser's own forms (plan phase 4 steps 6c, 6e): the name box of
// a rename in place and the import dialog, in the kit's tokens. Forge used
// browser prompts for both; the meta's license and source (D16) need a form.

export const CONTENT_FORM_CSS = `
/* Rename in place (step 6c): the name's box on the card or the tree row. */
.editor-shell .content-rename {
  width: 100%;
  min-width: 0;
  height: 18px;
  box-sizing: border-box;
  border: 1px solid var(--forge-accent);
  border-radius: 3px;
  padding: 0 3px;
  color: #ffffff;
  background: #101316;
  font: inherit;
  font-size: 12px;
}

/* The import dialog (step 6e): over the drawer's cards. */
.content-import-dialog {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  display: grid;
  gap: 6px;
  width: 340px;
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--forge-border-mid);
  border-radius: var(--forge-radius-sm);
  background: var(--forge-bg-1);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.content-import-files {
  overflow: hidden;
  color: var(--forge-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-import-row {
  display: grid;
  grid-template-columns: 30% 70%;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.content-import-row input[type="checkbox"] {
  justify-self: start;
  margin: 0;
}

.editor-shell .content-import-input {
  min-width: 0;
  height: 26px;
  box-sizing: border-box;
  border: 1px solid var(--forge-border-strong);
  border-radius: 5px;
  padding: 0 6px;
  color: #ffffff;
  background: #101316;
}

.content-import-optimize {
  display: grid;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--forge-border-soft);
}

.content-import-problem {
  min-height: 14px;
  color: #f2b84b;
  font-size: 11px;
}

.content-import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.editor-shell .content-import-actions .forge-btn-primary {
  border-color: transparent;
  color: var(--forge-accent-text);
  background: var(--forge-accent);
}

`;
