// Locate the object behind a single white frame: read a render target back, count non-finite
// pixels, then hide scene objects one at a time until the count is zero.
//
// Usage: node scripts/capture/nanprobe.mjs <query> <frame> [target=reflRT]
//   node scripts/capture/nanprobe.mjs "level=3&demo=1" 742
//
// <frame> is the frame number flashscan.py reported (60 per second of the pass, counted from 0).
// Every frame up to it is drawn: stepping without drawing did not reproduce the defect. With no
// bad pixel at <frame>, the two next frames are tried: the printed frame is the one that was read. The probe reads the
// half-float target __g.eng[target] after calling its render function (__g.eng._renderReflection
// for the mirror target), and descends the scene tree four levels to name one object whose hiding
// removes the bad pixel. Read back and bisect first, guess second: four guesses cost ten minutes
// in the build before this probe named the object in one run. The fix belongs in the shader of
// that object (pow(max(x, 0.0), e), no normalize of a zero vector) plus a guard where the scene
// buffer is first read.
import { serve, launch, open } from './lib.mjs';
const [query, F, target = 'reflRT'] = process.argv.slice(2);
if (!query || !F) {
  console.error('usage: node nanprobe.mjs <query> <frame> [target]');
  process.exit(2);
}
const { srv, url } = await serve();
const { ctx, page } = await launch(1920, 1080, 'shot');
await open(page, url, query + '&capture=1');
for (let i = 0; i < +F; i += 30)
  await page.evaluate(
    n => {
      for (let k = 0; k < n; k++) __g.advance(1);
    },
    Math.min(30, +F - i)
  );
const probe = () =>
  page.evaluate(target => {
    const e = __g.eng,
      R = e.renderer,
      rt = e[target];
    if (!rt) return { error: 'no render target __g.eng.' + target };
    const w = rt.width,
      h = rt.height,
      buf = new Uint16Array(w * h * 4);
    // half float: all exponent bits set means infinity or not a number
    const bad = () => {
      e._renderReflection();
      R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      let n = 0,
        at = null;
      for (let i = 0; i < w * h * 4; i++)
        if ((buf[i] & 0x7c00) === 0x7c00) {
          n++;
          at = [(i >> 2) % w, ((i >> 2) / w) | 0];
        }
      return [n, at];
    };
    const out = { nonFinite: bad() };
    if (!out.nonFinite[0]) return out;
    const desc = o =>
      (o.name || o.type) +
      (o.isMesh
        ? ':' +
          (o.material.name || o.material.type) +
          (o.material.transparent ? ':transparent' : '') +
          (o.material.blending === 2 ? ':additive' : '')
        : '') +
      ' @' +
      o.position.toArray().map(x => x.toFixed(1));
    let set = e.scene.children.filter(o => o.visible);
    out.roots = set.length;
    out.path = [];
    for (let depth = 0; depth < 4; depth++) {
      let found = null;
      for (const o of set) {
        o.visible = false;
        const b = bad()[0];
        o.visible = true;
        if (!b) {
          found = o;
          break;
        }
      }
      if (!found) break;
      out.path.push(desc(found));
      set = found.children.filter(o => o.visible);
      if (!set.length) break;
    }
    return out;
  }, target);
// flashscan.py counts frames from 0 and the pass may be one frame apart: try the two next frames too
let out = await probe(),
  frame = +F;
for (let k = 0; k < 2 && out.nonFinite && !out.nonFinite[0]; k++) {
  await page.evaluate(() => __g.advance(1));
  frame++;
  out = await probe();
}
console.log(JSON.stringify({ frame, ...out }).slice(0, 1500));

await ctx.close();
srv.close();
