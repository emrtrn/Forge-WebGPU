// Deterministic clip of a scripted pass: one fixed 1/60 s step per frame, so capture speed does not matter.
//
// Usage: node scripts/capture/clip.mjs <out.mp4> <query> [seconds=40] [width=1920] [height=1080]
//   node scripts/capture/clip.mjs out/clips/level2.mp4 "level=2&demo=1" 40
//   node scripts/capture/clip.mjs out/clips/level2-portrait.mp4 "level=2&demo=1" 40 1080 1920
//
// Each frame is a page screenshot (canvas and HUD) piped to ffmpeg (x264, CRF 19). One frame per
// second is also written to <out>.frames/ for the contact sheet (scripts/sheet.sh). When the page
// offers __g.audio(t0, t1) (the sound event log rendered offline, base64 WAV), it is muxed in.
// An existing output is never overwritten. Run scripts/flashscan.py on the result before anyone
// looks at the sheet. Needs ffmpeg. Environment: see lib.mjs.
import { serve, launch, open, real } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const [out, query, SEC = 40, W = 1920, H = 1080] = process.argv.slice(2);
if (!out || !query) {
  console.error(
    'usage: node clip.mjs <out.mp4> <query> [seconds] [width] [height]'
  );
  process.exit(2);
}
const outAbs = path.resolve(out);
if (fs.existsSync(outAbs)) {
  console.error('exists, move it to versions/ first: ' + outAbs);
  process.exit(2);
}
fs.mkdirSync(path.dirname(outAbs), { recursive: true });
const fdir = outAbs.replace(/\.mp4$/, '') + '.frames';
fs.mkdirSync(fdir, { recursive: true });
const tmpV = outAbs.replace(/\.mp4$/, '.video-only.mp4');
const wav = outAbs.replace(/\.mp4$/, '.wav');
const { srv, url } = await serve();
const { ctx, page, errors } = await launch(+W, +H, 'clip' + W);
await open(page, url, query + '&capture=1');
const ff = spawn(
  'ffmpeg',
  [
    '-y',
    '-v',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    '60',
    '-c:v',
    'mjpeg',
    '-i',
    '-',
    '-vf',
    'scale=in_range=full:out_range=limited',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '19',
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    '-movflags',
    '+faststart',
    tmpV,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] }
);
const N = Math.round(SEC * 60);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  await page.evaluate(() => __g.advance(1));
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 60 === 30)
    fs.writeFileSync(
      path.join(fdir, `f${String(Math.floor(i / 60)).padStart(2, '0')}.jpg`),
      buf
    );
  if (i % 600 === 0)
    console.log(
      'frame',
      i,
      '/',
      N,
      ((Date.now() - t0) / 1000).toFixed(0) + ' s'
    );
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
const b64 = await page.evaluate(
  s => (window.__g.audio ? __g.audio(0, s) : null),
  +SEC
);
if (await page.evaluate(() => !!window.__g.info))
  console.log(JSON.stringify(await page.evaluate(() => __g.info())));
const er = real(errors).filter(e => !/404/.test(e));
if (er.length) console.log(er.slice(0, 8).join('\n'));
await ctx.close();
srv.close();
if (b64) {
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-i',
      tmpV,
      '-i',
      wav,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      outAbs,
    ],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) process.exit(1);
  const keep = path.join(path.dirname(outAbs), 'intermediate');
  fs.mkdirSync(keep, { recursive: true });
  fs.renameSync(tmpV, path.join(keep, path.basename(tmpV)));
  fs.renameSync(wav, path.join(keep, path.basename(wav)));
} else fs.renameSync(tmpV, outAbs);
console.log(
  'wrote',
  outAbs,
  'in',
  ((Date.now() - t0) / 1000).toFixed(0) + ' s, frames in',
  fdir
);
