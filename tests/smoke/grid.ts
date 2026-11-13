// `npm run smoke:grid` (plan phase 3, step 9): one local page with every render
// smoke pose side by side, the Phase 0 WebGL shot (`baseline/poses/`, Forge
// WebGL, 1920 x 1080, DPR 1, no `?debug`) next to the smoke's latest WebGPU
// shot of the same pose (`render-refs/runs/`). The user looks at it before
// accepting the references; it makes no judgement and changes nothing.
//
// Mismatches are listed at the top, never papered over: a pose with no Phase 0
// shot, a size that differs, a pose the smoke has not shot yet.
//
// Writes `render-refs/grid.html` (out of the repo, next to the shots it shows).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { BASELINE, RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";

interface RunRecord {
  readonly date: string;
  readonly commit: string;
  readonly dirty: boolean;
  readonly browser: string;
  readonly gpu: Record<string, string | undefined> | null;
  readonly backend: { isWebGPUBackend: boolean } | null;
  readonly resolution: { width: number; height: number };
  readonly devicePixelRatio: number;
  readonly profile: string | null;
  readonly perf: { pipeline?: string; gpuMs?: number; drawCalls?: number; triangles?: number } | null;
  readonly resourceErrors: number;
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
}

interface Phase0Run {
  readonly scene: string;
  readonly pose: string;
  readonly gl: { size: [number, number] | null; renderer: string | null };
}

const runsDir = join(RENDER_REFS, "runs");
const runFiles = existsSync(runsDir) ? readdirSync(runsDir).filter((name) => name.endsWith(".json")).sort() : [];
const phase0RunsPath = join(BASELINE, "poses", "poses-run.json");
const phase0Runs = existsSync(phase0RunsPath) ? (JSON.parse(readFileSync(phase0RunsPath, "utf8")) as Phase0Run[]) : [];

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const head = readFileSync(path).subarray(0, 24);
  return [head.readUInt32BE(16), head.readUInt32BE(20)];
}

const escape = (text: string): string => text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const href = (path: string): string => relative(RENDER_REFS, path).split("\\").join("/");

const notes: string[] = [];
const rows: string[] = [];

for (const scene of SMOKE_SCENES) {
  for (const pose of scene.poses) {
    const key = `${scene.id} ${pose.id}`;
    const runName = runFiles.filter((name) => name.endsWith(`-${scene.id}-${pose.id}.json`)).at(-1);
    const record = runName ? (JSON.parse(readFileSync(join(runsDir, runName), "utf8")) as RunRecord) : null;
    const webgpuShot = runName ? join(runsDir, runName.replace(/\.json$/, ".png")) : null;
    const webgl = pose.phase0Shot ? join(BASELINE, pose.phase0Shot) : null;

    let left = `<div class="empty">No Phase 0 shot: Phase 0 posed only the four terrain levels.</div>`;
    if (!webgl) notes.push(`${key}: no Phase 0 WebGL shot (WebGPU only).`);
    else if (!existsSync(webgl)) {
      notes.push(`${key}: Phase 0 shot missing at ${webgl}.`);
      left = `<div class="empty">Phase 0 shot missing.</div>`;
    } else {
      const size = pngSize(webgl);
      const run = phase0Runs.find((entry) => entry.scene === scene.id && entry.pose.toLowerCase() === pose.id);
      const debugShot = join(BASELINE, "measure", "baseline-2026-11-11", "shots", `${scene.id}-${pose.id.toUpperCase()}-high-1080p.png`);
      const meta = [
        `Forge WebGL, Phase 0 (2026-11-11)`,
        `${size[0]} x ${size[1]}`,
        "profile not pinned (Forge's start-up default)",
        run?.gl.renderer ? escape(run.gl.renderer) : null,
        existsSync(debugShot) ? `<a href="${href(debugShot)}">profile high, ?debug shot</a>` : null,
      ].filter(Boolean);
      left = `<a href="${href(webgl)}"><img src="${href(webgl)}" alt="WebGL ${escape(key)}" loading="lazy"></a><p class="meta">${meta.join(" · ")}</p>`;
    }

    let right = `<div class="empty">The render smoke has not shot this pose yet.</div>`;
    if (!record || !webgpuShot || !existsSync(webgpuShot)) notes.push(`${key}: no WebGPU shot yet (run npm run smoke:render).`);
    else {
      const size = pngSize(webgpuShot);
      if (size[0] !== SMOKE_VIEWPORT.width || size[1] !== SMOKE_VIEWPORT.height || record.devicePixelRatio !== 1) {
        notes.push(`${key}: WebGPU shot is ${size[0]} x ${size[1]} at DPR ${record.devicePixelRatio}, Phase 0 is ${SMOKE_VIEWPORT.width} x ${SMOKE_VIEWPORT.height} at DPR 1.`);
      }
      if (!record.backend?.isWebGPUBackend) notes.push(`${key}: the WebGPU shot did not run on the WebGPU backend.`);
      const errors = record.resourceErrors + record.pageErrors.length + record.consoleErrors.length;
      if (errors > 0) notes.push(`${key}: ${record.resourceErrors} resource, ${record.pageErrors.length} page and ${record.consoleErrors.length} console errors in the run.`);
      const meta = [
        `Forge WebGPU ${escape(record.commit.slice(0, 7))}${record.dirty ? " (dirty)" : ""}`,
        `${size[0]} x ${size[1]}`,
        `profile ${escape(record.profile ?? "?")}`,
        record.perf?.pipeline ? escape(record.perf.pipeline) : null,
        record.perf?.gpuMs !== undefined ? `GPU ${record.perf.gpuMs} ms` : null,
        record.perf?.drawCalls !== undefined ? `${record.perf.drawCalls} draws` : null,
        escape(record.browser),
        escape(record.date.slice(0, 16).replace("T", " ")),
      ].filter(Boolean);
      right = `<a href="${href(webgpuShot)}"><img src="${href(webgpuShot)}" alt="WebGPU ${escape(key)}" loading="lazy"></a><p class="meta">${meta.join(" · ")}</p>`;
    }

    const title = `${escape(scene.id)} <span class="pose">${escape(pose.id.toUpperCase())}</span>`;
    const label = pose.label ? escape(pose.label) : pose.position ? "smoke pose (not in Phase 0)" : "the viewer's own framing (no Phase 0 pose)";
    rows.push(`<section class="row" id="${escape(scene.id)}-${escape(pose.id)}">
  <header><h2>${title}</h2><p>${label} · <code>${escape(scene.level)}</code></p></header>
  <div class="pair"><figure><figcaption>WebGL (Phase 0)</figcaption>${left}</figure><figure><figcaption>WebGPU</figcaption>${right}</figure></div>
</section>`);
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Render Smoke Grid</title>
<style>
:root { --bg: #f6f6f4; --fg: #1d1d1b; --muted: #6b6b66; --card: #ffffff; --line: #deddd8; --warn: #8a4b00; --warn-bg: #fff4e0; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #e9e8e4; --muted: #9a9993; --card: #1f1f1d; --line: #33322f; --warn: #ffc56b; --warn-bg: #2b2210; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, sans-serif; }
main { max-width: 1840px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
.lede { color: var(--muted); margin: 0 0 16px; }
.notes { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; margin-bottom: 24px; }
.notes ul { margin: 6px 0 0; padding-left: 18px; }
nav { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 24px; }
nav a { color: var(--muted); }
.row { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-bottom: 20px; }
.row header h2 { font-size: 16px; margin: 0; }
.row header p { margin: 2px 0 10px; color: var(--muted); }
.pose { color: var(--muted); font-weight: 500; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
figure { margin: 0; min-width: 0; }
figcaption { font-weight: 600; margin-bottom: 6px; }
img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: contain; background: #000; border-radius: 4px; }
.meta { color: var(--muted); font-size: 12px; margin: 6px 0 0; overflow-wrap: anywhere; }
.empty { aspect-ratio: 16 / 9; display: grid; place-items: center; text-align: center; padding: 16px; border: 1px dashed var(--line); border-radius: 4px; color: var(--muted); }
a { color: inherit; }
code { font-size: 12px; }
</style>
</head>
<body>
<main>
<h1>Render smoke: Phase 0 WebGL | WebGPU</h1>
<p class="lede">Same pose, same size (${SMOKE_VIEWPORT.width} x ${SMOKE_VIEWPORT.height}, DPR 1). Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} by <code>npm run smoke:grid</code>; click an image for full size.</p>
${notes.length ? `<div class="notes"><strong>Mismatches</strong><ul>${notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul></div>` : ""}
<nav>${SMOKE_SCENES.flatMap((scene) => scene.poses.map((pose) => `<a href="#${escape(scene.id)}-${escape(pose.id)}">${escape(scene.id)} ${escape(pose.id)}</a>`)).join("")}</nav>
${rows.join("\n")}
</main>
</body>
</html>
`;

const out = join(RENDER_REFS, "grid.html");
writeFileSync(out, html);
console.log(`${out}: ${rows.length} poses, ${notes.length} mismatch notes`);
for (const note of notes) console.log(`  ${note}`);
