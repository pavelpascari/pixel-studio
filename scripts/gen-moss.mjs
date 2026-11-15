// Generates examples/moss.json (node scripts/gen-moss.mjs > examples/moss.json). One grid cell = C units on the 100-unit canvas (16 cells).
const C = 6.25, r = (v) => Math.round(v * 10000) / 10000, g = (n) => r(n * C);
const rect = (x, y, w, h, material) => ({ type: 'rect', x: g(x), y: g(y), w: g(w), h: g(h), material, profile: 'none' });
const LEGX = [4, 6, 9, 11];                     // leg columns (cells); body is columns 4..11, rows 6..11
const legBones = LEGX.flatMap((x, i) => {
  const cx = g(x + 0.5);
  return [
    { id: `leg${i + 1}`, parent: 'body', from: [cx, g(12)], to: [r(cx + 2), g(13)], z: 1 },
    { id: `foot${i + 1}`, parent: `leg${i + 1}`, from: [r(cx + 2), g(13)], to: [cx, g(14)], z: 1 },
  ];
});
const legParts = LEGX.flatMap((x, i) => [
  { id: `leg${i + 1}`, shapes: [{ ...rect(x, 11.8, 1, 1.3, 'leg') }] },
  { id: `foot${i + 1}`, shapes: [{ ...rect(x, 12.9, 1, 1.1, 'leg') }] },
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
  name: 'Moss',
  description: 'A moss-green shield beetle: a domed shell with a dark band, a sand-coloured belly, two antennae with amber tips, round eyes, stubby front feet and four short legs. Drawn on a 16-cell grid (one cell = 6.25 units) so it stays crisp at 16, 32 and 64 px; every hand-keyed move is whole or half cells. It scuttles sideways.',
  size: [100, 100],
  figure: {
    bones: [{ id: 'body', from: [50, g(12)], to: [50, g(6)], z: 2 }, ...legBones],
    rig: { root: 'body', legs: LEGX.map((_, i) => ({ chain: [`leg${i + 1}`, `foot${i + 1}`], phase: i % 2 ? 0.5 : 0 })) },
    points: { head: { part: 'body', at: 'tip' }, beak: { part: 'body', at: [50, g(6)] } },
    motions: {},
  },
  materials: {
    shell: { color: '#5b8a4f', flat: true },
    band: { color: '#3d6338', flat: true, outline: false },
    belly: { color: '#cdbf8a', flat: true, outline: false },
    side: { color: '#40683a', flat: true, outline: false },
    leg: { color: '#2a352d', flat: true },
    eye: { color: '#f4efe4', flat: true, outline: false },
    pupil: { color: '#171714', flat: true, outline: false },
    tip: { color: '#e3a33b', flat: true },
  },
  parts: [
    // a domed shell: narrower rows on top, a dark band across it, the belly showing along the bottom
    { id: 'body', shapes: [rect(6, 4, 4, 1, 'shell'), rect(5, 5, 6, 1, 'shell'), rect(4, 6, 8, 6, 'shell'),
      rect(4, 9, 8, 1, 'band'), rect(5, 11, 6, 1, 'belly')] },
    { id: 'antL', bone: 'body', pivot: [g(6.5), g(4)], z: 1.9, shapes: [rect(6, 2.5, 0.5, 1.5, 'leg'), rect(5.5, 2, 1, 0.75, 'tip')] },
    { id: 'antR', bone: 'body', pivot: [g(9.5), g(4)], z: 1.9, shapes: [rect(9.5, 2.5, 0.5, 1.5, 'leg'), rect(9.5, 2, 1, 0.75, 'tip')] },
    { id: 'armL', bone: 'body', pivot: [g(4), g(10)], z: 2.1, shapes: [rect(2.5, 10, 1.5, 1, 'leg')] },
    { id: 'armR', bone: 'body', pivot: [g(12), g(10)], z: 2.1, shapes: [rect(12, 10, 1.5, 1, 'leg')] },
    { id: 'sideL', bone: 'body', pivot: [g(4.5), g(9)], z: 2.2, show: 0, shapes: [rect(4, 6, 1, 6, 'side')] },
    { id: 'sideR', bone: 'body', pivot: [g(11.5), g(9)], z: 2.2, show: 0, shapes: [rect(11, 6, 1, 6, 'side')] },
    { id: 'eyes', bone: 'body', pivot: [50, g(7.5)], z: 3, shapes: [rect(5, 7, 1, 1, 'eye'), rect(10, 7, 1, 1, 'eye'),
      { ...rect(5.5, 7.5, 0.5, 0.5, 'pupil'), minDetail: 2 }, { ...rect(10, 7.5, 0.5, 0.5, 'pupil'), minDetail: 2 }] },
    ...legParts,
  ],
  animations: {
    idle: { frames: 16, fps: 8, tracks: {
      eyes: { sy: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1], x: [0, 0, 0, 0, C, C, C, C, 0, 0, 0, 0, 0, 0, 0, 0].map(r) },
      armL: { y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -h, -h, 0, 0].map(r) },
      armR: { y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -h, -h, 0, 0].map(r) },
      antL: { y: [0, 0, -h, -h, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map(r) },
      antR: { y: [0, 0, 0, 0, 0, 0, -h, -h, 0, 0, 0, 0, 0, 0, 0, 0].map(r) },
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
    hop: { motion: 'jump', frames: 10, fps: 12, loop: false, dip: 0, tuck: 3, height: 13, lean: 0, tracks: { eyes: { sy: [1, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1] } } },
    wave: { frames: 8, fps: 10, loop: false, tracks: {
      armR: { y: [0, -C, -2 * C, -C, -2 * C, -C, -2 * C, 0].map(r) },
      eyes: { sy: [1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1] },
    } },
    jump: { motion: 'jump', frames: 10, fps: 10, loop: false, dip: 0, tuck: 3, lean: 0, tracks: { eyes: { sy: [1, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1] } } },
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
  style: { outline: 'dark', contactShadow: false },
};
process.stdout.write(JSON.stringify(spec, null, 1) + '\n');
