// Generates examples/clawd.json (node scripts/gen-clawd.mjs > examples/clawd.json). One grid cell = C units on the 100-unit canvas (16 cells).
const C = 6.25, r = (v) => Math.round(v * 10000) / 10000, g = (n) => r(n * C);
const rect = (x, y, w, h, material) => ({ type: 'rect', x: g(x), y: g(y), w: g(w), h: g(h), material, profile: 'none' });
const LEGX = [4, 6, 9, 11];                     // leg columns (cells); body is columns 4..11, rows 6..11
const legBones = LEGX.flatMap((x, i) => {
  const cx = g(x + 0.5);
  return [
    { id: `leg${i + 1}`, parent: 'body', from: [cx, g(12)], to: [r(cx + 1), g(13)], z: 1 },
    { id: `foot${i + 1}`, parent: `leg${i + 1}`, from: [r(cx + 1), g(13)], to: [cx, g(14)], z: 1 },
  ];
});
const legParts = LEGX.flatMap((x, i) => [
  { id: `leg${i + 1}`, shapes: [{ ...rect(x, 11.8, 1, 1.3, 'clay') }] },
  { id: `foot${i + 1}`, shapes: [{ ...rect(x, 12.9, 1, 1.1, 'clay') }] },
]);
const rep = (v, n) => Array(n).fill(v);
const shift = (a, k) => a.map((_, i) => a[(i - k + a.length) % a.length]);
const legs = (x, y) => ({ leg1: { x, y }, leg2: { x: shift(x, x.length / 2), y: shift(y, y.length / 2) },
  leg3: { x, y }, leg4: { x: shift(x, x.length / 2), y: shift(y, y.length / 2) } });

// Scuttle: a planted leg slides back half a cell per frame while the body travels; the other pair lifts a cell and swings.
const h = C / 2;
const walkX = [h, h / 2, 0, -h / 2, -h, -h / 2, 0, h / 2].map(r);
const walkY = [0, 0, 0, 0, 0, -C, -C, 0];
const runX = [h, h / 3, -h / 3, -h, -h / 3, h / 3].map(r);
const runY = [0, 0, 0, 0, -C, -C];
const T = (o) => o;

const spec = {
  name: 'Clawd',
  description: 'A blocky orange critter (after the Claude Code mascot): a wide body, two square eyes, stubby arms and four short legs. Drawn on a 16-cell grid (one cell = 6.25 units) so it stays crisp at 16, 32 and 64 px; every hand-keyed move is whole or half cells. It scuttles sideways like a crab.',
  size: [100, 100],
  figure: {
    bones: [{ id: 'body', from: [50, g(12)], to: [50, g(6)], z: 2 }, ...legBones],
    rig: { root: 'body', legs: LEGX.map((_, i) => ({ chain: [`leg${i + 1}`, `foot${i + 1}`], phase: i % 2 ? 0.5 : 0 })) },
    points: { head: { part: 'body', at: 'tip' }, beak: { part: 'body', at: [50, g(6)] } },
    motions: {},
  },
  materials: {
    clay: { color: '#d97757', flat: true, outline: false },
    side: { color: '#b95b44', flat: true, outline: false },
    eye: { color: '#141413', flat: true, outline: false },
  },
  parts: [
    { id: 'body', shapes: [rect(4, 6, 8, 6, 'clay')] },
    { id: 'armL', bone: 'body', pivot: [g(4), g(9)], z: 2.1, shapes: [rect(2, 8, 2, 2, 'clay')] },
    { id: 'armR', bone: 'body', pivot: [g(12), g(9)], z: 2.1, shapes: [rect(12, 8, 2, 2, 'clay')] },
    { id: 'sideL', bone: 'body', pivot: [g(4.5), g(9)], z: 2.2, show: 0, shapes: [rect(4, 6, 1, 6, 'side')] },
    { id: 'sideR', bone: 'body', pivot: [g(11.5), g(9)], z: 2.2, show: 0, shapes: [rect(11, 6, 1, 6, 'side')] },
    { id: 'eyes', bone: 'body', pivot: [50, g(7.5)], z: 3, shapes: [rect(5, 7, 1, 1, 'eye'), rect(10, 7, 1, 1, 'eye')] },
    ...legParts,
  ],
  animations: {
    idle: { frames: 16, fps: 8, tracks: {
      eyes: { sy: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1], x: [0, 0, 0, 0, C, C, C, C, 0, 0, 0, 0, 0, 0, 0, 0].map(r) },
      armL: { y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -h, -h, 0, 0].map(r) },
      armR: { y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -h, -h, 0, 0].map(r) },
    } },
    // The "thinking" shuffle: leans to one side and turns (the darker side face shows), hops a little, then the other way.
    think: { frames: 16, fps: 10, tracks: {
      body: { x: [0, h, C, C, C, h, 0, 0, 0, -h, -C, -C, -C, -h, 0, 0].map(r), y: [0, -h, -C, -h, 0, 0, 0, 0, 0, -h, -C, -h, 0, 0, 0, 0].map(r) },
      sideL: { show: [0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      sideR: { show: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0] },
      eyes: { x: [0, C, C, C, C, C, 0, 0, 0, -C, -C, -C, -C, -C, 0, 0].map(r), sy: [1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 0.5] },
      armR: { y: [0, -h, -C, -C, -h, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map(r) },
      armL: { y: [0, 0, 0, 0, 0, 0, 0, 0, 0, -h, -C, -C, -h, 0, 0, 0].map(r) },
    } },
    walk: { frames: 8, fps: 14, speed: r(h / 2 * 14), events: [{ frame: 0, name: 'footstep', data: { leg: 'a' } }, { frame: 4, name: 'footstep', data: { leg: 'b' } }],
      tracks: { ...legs(walkX, walkY), sideL: { show: rep(1, 8) }, eyes: { x: rep(C, 8) } } },
    run: { frames: 6, fps: 20, speed: r(h * 2 / 3 * 20), events: [{ frame: 0, name: 'footstep', data: { leg: 'a' } }, { frame: 3, name: 'footstep', data: { leg: 'b' } }],
      tracks: { ...legs(runX, runY), sideL: { show: rep(1, 6) }, eyes: { x: rep(C, 6) },
        armL: { y: [0, -h, 0, 0, -h, 0].map(r) }, armR: { y: [0, -h, 0, 0, -h, 0].map(r) } } },
    hop: { motion: 'jump', frames: 10, fps: 12, loop: false, dip: 3, tuck: 3, height: 18, lean: 0, tracks: { eyes: { sy: [1, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1] } } },
    wave: { frames: 8, fps: 10, loop: false, tracks: {
      armR: { y: [0, -C, -2 * C, -C, -2 * C, -C, -2 * C, 0].map(r) },
      eyes: { sy: [1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1] },
    } },
    jump: { motion: 'jump', frames: 10, fps: 10, loop: false, dip: 3, tuck: 3, lean: 0 },
    fall: { frames: 6, fps: 10, tracks: {
      ...Object.fromEntries([1, 2, 3, 4].map((i) => [`leg${i}`, { y: (i % 2 ? [0, -h, 0, -h, 0, -h] : [-h, 0, -h, 0, -h, 0]).map(r) }])),
      armL: { y: [-C, -2 * C, -C, -2 * C, -C, -2 * C].map(r) }, armR: { y: [-2 * C, -C, -2 * C, -C, -2 * C, -C].map(r) },
      eyes: { sy: rep(1.5, 6) },
    } },
    // Pressed against the wall on its right: the near arm grips and slides down while the page moves the sprite up.
    climb: { frames: 8, fps: 10, speedY: r(h * 10 * 0.8), wall: g(14), tracks: {
      armR: { y: [-C, -h * 1.2, -h * 0.4, h * 0.4, h * 1.2, h, 0, -h].map(r) },
      armL: { y: [0, -h, -C, -h, 0, -h, -C, -h].map(r) },
      ...legs([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, -h, -C, -h, 0, 0, 0]),
      sideL: { show: rep(1, 8) }, eyes: { x: rep(C, 8), y: rep(r(-h), 8) },
    } },
    // Sitting on an edge: the body drops two cells to the foot line and the legs hang over it and swing.
    sit: { frames: 12, fps: 6, tracks: {
      body: { y: rep(g(2), 12) },
      ...legs([0, 0, h, h, 0, 0, 0, 0, -h, -h, 0, 0].map(r), rep(0, 12)),
      eyes: { sy: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1] },
    } },
    duck: { frames: 8, fps: 6, tracks: {
      body: { y: rep(g(2), 8) },
      ...Object.fromEntries([1, 2, 3, 4].map((i) => [`leg${i}`, { show: rep(0, 8) }])),
      eyes: { sy: [1, 1, 1, 1, 1, 0.5, 1, 1] },
    } },
    peek: { frames: 12, fps: 6, tracks: {
      body: { y: [0, -h, -h, -h, -h, 0, 0, -h, -h, -h, -h, 0].map(r) },
      eyes: { x: [0, C, C, C, C, 0, 0, -C, -C, -C, -C, 0].map(r) },
    } },
  },
  style: { outline: 'none', contactShadow: false },
};
process.stdout.write(JSON.stringify(spec, null, 1) + '\n');
