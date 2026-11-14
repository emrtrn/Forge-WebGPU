export function installAssetEditorStyle(doc: Document): void {
  if (doc.getElementById("forge-asset-editor-style")) return;
  const style = doc.createElement("style"); style.id = "forge-asset-editor-style";
  style.textContent = `
.asset-editor-overlay{position:fixed;inset:0;z-index:1000;background:#0009;display:flex;align-items:center;justify-content:center;color:var(--forge-text);font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
.asset-editor-window{width:94vw;height:90vh;display:flex;flex-direction:column;background:var(--forge-bg-1);border:1px solid var(--forge-border-strong);box-shadow:0 16px 70px #000b;min-width:700px}
.asset-editor-header,.asset-editor-toolbar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:var(--forge-bg-3);border-bottom:1px solid var(--forge-border)}
.asset-editor-title{flex:1}.asset-editor-body{display:flex;flex:1;min-height:0;overflow:hidden}.asset-editor-preview{flex:1;min-width:0;position:relative;overflow:hidden;background:#191b1f;touch-action:none}
.asset-editor-preview:empty:before{content:'Asset data';position:absolute;inset:45% 10%;text-align:center;color:#777}
.asset-editor-fields{width:440px;max-width:48%;overflow:auto;padding:10px;background:var(--forge-bg-2);position:relative}.asset-editor-window.is-data .asset-editor-fields{width:100%;max-width:none;flex:1}.asset-editor-window.is-data .asset-editor-preview{display:none}
.asset-editor-status{min-height:22px;padding:6px 12px;border-top:1px solid #41444a;white-space:pre-wrap;overflow:auto;max-height:90px}
.asset-editor-confirm{position:absolute;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:20}.asset-editor-confirm>div{background:#292c32;padding:24px;border:1px solid #555;display:flex;gap:10px;align-items:center}
.asset-editor-fields button{margin:3px}.asset-component-node{display:block;width:100%;text-align:left;border:0;background:#30333a;color:inherit;padding:6px}.asset-class-tools{position:relative}
.asset-table-choices{display:flex;gap:6px;flex-wrap:wrap}.asset-table-head{padding:10px;background:#30333a}.asset-table-viewport{height:360px;overflow:auto;position:relative}.asset-table-canvas{position:relative}.asset-table-row{position:absolute;left:0;right:0;height:72px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #41444a}.asset-table-row>.details-body{flex:1;min-width:140px}.asset-table-row .detail-row{padding:3px}.asset-table-row .detail-label{font-size:10px}.asset-table-details{border-top:1px solid #555;margin-top:12px}
`;
  doc.head.append(style);
}
