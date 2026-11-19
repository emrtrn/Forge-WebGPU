// Capture helpers: a static server for the built game and an own Chromium (playwright-core) on the GPU.
// Not run directly. Used by shot.mjs, clip.mjs, impact.mjs, perf.mjs, nanprobe.mjs and headed.mjs.
//
// Environment:
//   GAME_DIST     folder of the built game (default ./dist). Point it at a frozen copy for a long
//                 capture or for a reference build, so a rebuild does not empty it under the page.
//   CAPTURE_HOME  where browser profiles are kept (default: the system temp folder).
//   CHROME_PATH   a browser binary to use in place of the newest full Chromium found in the
//                 playwright browser folder (npx playwright-core install chromium).
// playwright-core is resolved from the folder the script is started in (npm i -D playwright-core,
// then npx playwright-core install chromium). The browser is this script's own: never the one a
// person or another agent is using. One script per profile at a time ("Failed to create a
// ProcessSingleton" otherwise).
//
// Hook contract of the page (see references/testing.md): window.__g with ready, THREE, eng
// { renderer, scene, camera }, game, advance(n, draw = true) for n fixed 1/60 s steps, info().
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
export const { chromium } = require('playwright-core');
export const DIST = path.resolve(process.env.GAME_DIST || 'dist');
const HOME =
  process.env.CAPTURE_HOME || path.join(os.tmpdir(), 'threejs-game-capture');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

// Static server on a free local port. Paths outside the folder are refused.
export function serve(dir = DIST) {
  if (!fs.existsSync(path.join(dir, 'index.html')))
    throw new Error('no index.html in ' + dir + ' (set GAME_DIST)');
  return new Promise(res => {
    const srv = http
      .createServer((req, rsp) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p.endsWith('/')) p += 'index.html';
        const root = path.resolve(dir);
        const f = path.resolve(root, '.' + path.posix.normalize('/' + p));
        if (
          (f !== root && !f.startsWith(root + path.sep)) ||
          !fs.existsSync(f) ||
          fs.statSync(f).isDirectory()
        ) {
          rsp.writeHead(404);
          rsp.end('not found');
          return;
        }
        rsp.writeHead(200, {
          'content-type': TYPES[path.extname(f)] || 'application/octet-stream',
        });
        fs.createReadStream(f).pipe(rsp);
      })
      .listen(0, '127.0.0.1', () =>
        res({ srv, url: `http://127.0.0.1:${srv.address().port}/` })
      );
  });
}

export const GPU_ARGS = [
  ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
];
// The full Chromium in its new headless mode, which keeps the GPU. The default headless shell renders in software.
function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library/Caches/ms-playwright')
      : process.platform === 'win32'
        ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
        : path.join(os.homedir(), '.cache/ms-playwright'));
  const apps = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux64/chrome',
    'chrome-linux/chrome',
    'chrome-win64/chrome.exe',
    'chrome-win/chrome.exe',
  ];
  const dirs = fs.existsSync(base)
    ? fs
        .readdirSync(base)
        .filter(d => /^chromium-\d+$/.test(d))
        .sort((a, b) => b.slice(9) - a.slice(9))
    : [];
  for (const d of dirs)
    for (const a of apps) {
      const f = path.join(base, d, a);
      if (fs.existsSync(f)) return f;
    }
  return null;
}
const found = findChromium();
export const BROWSER = found
  ? { executablePath: found }
  : { channel: 'chromium' };
export const profile = name => {
  const d = path.join(HOME, 'profile-' + name);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

// Headless Chromium with the GPU, vsync off (frame rate measures need it), audio muted (the audio graph still runs).
export async function launch(w, h, name = 'main') {
  const ctx = await chromium.launchPersistentContext(profile(name), {
    headless: true,
    ...BROWSER,
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    args: [
      ...GPU_ARGS,
      '--hide-scrollbars',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
    ],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning')
      errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  return { ctx, page, errors };
}

// Open the page with a query string and wait for the game's ready flag.
export async function open(page, url, query) {
  await page.goto(url + '?' + query.replace(/^[?&]/, ''));
  await page.waitForFunction(() => window.__g && window.__g.ready, null, {
    timeout: 120000,
  });
}

// Driver noise that is not a page error.
export const real = errors =>
  errors.filter(e => !/GPU stall|GL Driver Message|PCFSoft/.test(e));
