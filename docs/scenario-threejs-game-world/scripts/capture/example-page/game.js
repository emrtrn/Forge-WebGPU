// The capture hook on the smallest page that satisfies it: a floor, forty boxes, one moving target.
// Written from the "Page contract" table of references/testing.md and nothing else, to check that
// the table is enough for shot.mjs, clip.mjs, impact.mjs, perf.mjs and nanprobe.mjs. It is not part
// of the game the skill comes from. Copy the shape of window.__g into your own game with the grey-box.
//
// Two planted defects prove that a test can fail before you trust its pass:
//   ?bug=1  shots are tested against inflated boxes (the bug of the build's first version)
//   ?nan=1  one mesh writes a non-finite pixel (a pow of a negative number)
//
// Setup and commands: references/testing.md, "Prove the tools on the example page".
import * as THREE from 'three';

const q = new URLSearchParams(location.search);
const capture = q.get('capture') === '1';
const demo = q.get('demo') === '1';
const EYE = 1.65; // poses and checkpoints give the ground under the feet: the page adds the eye height

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x223344);
const camera = new THREE.PerspectiveCamera(
  70,
  innerWidth / innerHeight,
  0.1,
  300
);
camera.rotation.order = 'YXZ'; // yaw then pitch; yaw 0 looks down -Z

scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x202020, 1.2));
const sun = new THREE.DirectionalLight(0xffe0b0, 2);
sun.position.set(5, 10, 3);
scene.add(sun);

// every mesh that stops a bullet
const solids = [];
function box(w, h, d, x, y, z, color, name) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  mesh.name = name;
  scene.add(mesh);
  solids.push(mesh);
  return mesh;
}
box(60, 0.2, 60, 0, -0.1, 0, 0x556055, 'floor');
// a seeded generator: the same level and the same pass on every run
let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 40; i++)
  box(
    1 + rnd() * 2,
    1 + rnd() * 4,
    1 + rnd() * 2,
    (rnd() - 0.5) * 50,
    1,
    (rnd() - 0.5) * 50,
    0x8a6a40 + i * 513,
    'crate' + i
  );

// planted defect 1: the boxes a naive shot test would use, larger than what is drawn
const bug = q.get('bug') === '1';
const fat = solids.map(mesh => ({
  mesh,
  bounds: new THREE.Box3().setFromObject(mesh).expandByScalar(0.8),
}));
// planted defect 2: a pow of a negative number. On the GPU this was written on, z / z and
// log(z) - log(z) gave no non-finite pixel (the shader compiler folds them); pow did.
if (q.get('nan') === '1') {
  const bad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.ShaderMaterial({
      uniforms: { z: { value: 0 } },
      vertexShader:
        'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform float z; void main(){ gl_FragColor = vec4(vec3(pow(z - 1.0, 2.2)), 1.0); }',
    })
  );
  bad.name = 'bad_plane';
  bad.position.set(0, EYE, 4);
  scene.add(bad);
}

const actor = {
  active: true,
  mesh: box(0.8, 1.6, 0.8, 0, 0.8, -6, 0xcc3322, 'actor'),
};

// the shot: a ray against the meshes that are drawn
const raycaster = new THREE.Raycaster();
const world = {
  rayShot(origin, dir, maxT) {
    if (bug) {
      const ray = new THREE.Ray(origin, dir);
      const point = new THREE.Vector3();
      let best = null;
      for (const { mesh, bounds } of fat) {
        if (!ray.intersectBox(bounds, point)) continue;
        const t = point.distanceTo(origin);
        if (t <= maxT && (!best || t < best.t))
          best = { t, object: mesh, mat: 'steel' };
      }
      return best;
    }
    raycaster.set(origin, dir);
    raycaster.far = maxT;
    const hit = raycaster.intersectObjects(solids, false)[0];
    return hit ? { t: hit.distance, object: hit.object, mat: 'steel' } : null;
  },
};

const mod = {
  // the grading poses of the level: [x, ground y, z, yaw, pitch]
  poses: [
    [0, 0, 10, 0, 0],
    [12, 0, 12, 0.8, -0.05],
    [-14, 0, 0, -1.57, 0],
  ],
  checkpoints: [[0, 0, 10, 0]],
};
const player = { pos: new THREE.Vector3(0, 0, 10), yaw: 0, pitch: 0 };
const game = {
  mod,
  world,
  actors: { list: [actor] },
  state: 'play',
  player,
  weapon: { ammo: 30 },
};

const pose = q.get('pose');
if (pose) {
  const [x, y, z, yaw, pitch] = pose.split(',').map(Number);
  player.pos.set(x, y, z);
  player.yaw = yaw;
  player.pitch = pitch || 0;
}

// one fixed step of 1/60 s. The demo pass uses fixed inputs, so a capture repeats.
let time = 0;
function step() {
  time += 1 / 60;
  if (demo) {
    player.yaw = Math.sin(time * 0.5) * 0.6;
    player.pos.z = 10 - time * 0.4;
  }
  if (actor.active) actor.mesh.position.x = Math.sin(time) * 3;
}
function draw() {
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

// a half-float target with its render call, standing in for the mirror target that nanprobe.mjs reads
const reflRT = new THREE.WebGLRenderTarget(512, 512, {
  type: THREE.HalfFloatType,
});
const eng = {
  renderer,
  scene,
  camera,
  reflRT,
  _renderReflection() {
    renderer.setRenderTarget(reflRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  },
};

window.__g = {
  ready: false,
  THREE,
  eng,
  game,
  solid: mesh => solids.includes(mesh),
  play() {
    game.state = 'play';
  },
  advance(n, drawLast = true) {
    for (let i = 0; i < n; i++) step();
    if (drawLast) draw();
  },
  info: () => ({
    time: +time.toFixed(3),
    level: Number(q.get('level') || 1),
    state: game.state,
    pos: player.pos.toArray(),
    actors: game.actors.list.filter(a => a.active).length,
  }),
};
draw();
window.__g.ready = true;

// with ?capture=1 nothing moves until a script calls advance
if (!capture) {
  const loop = () => {
    step();
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
