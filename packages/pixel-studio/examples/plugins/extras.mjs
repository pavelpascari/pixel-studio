// An example Pixel Studio plug-in: a star shape, a feathers texture and a "float" motion.
//   node bin/pixel.mjs preview examples/plugins/starfish.json --plugin examples/plugins/extras.mjs
export default function setup({ registerShape, registerTexture, registerMotion }) {
  // A star: `points` tips between an outer radius `r` and an inner radius `r2`, rounded by `round`.
  registerShape('star', {
    required: ['cx', 'cy', 'r'],
    keys: ['r2', 'tips', 'round', 'rot'],
    describe: 'star: cx, cy, r (outer radius); r2 (inner radius, default r × 0.45), tips (default 5), round (corner radius), rot (deg)',
    compile(s) {
      const n = s.tips ?? 5, r2 = s.r2 ?? s.r * 0.45, round = s.round ?? 0, rot = ((s.rot ?? 0) - 90) * (Math.PI / 180);
      const pts = Array.from({ length: n * 2 }, (_, i) => {
        const a = rot + (i * Math.PI) / n, rr = i % 2 ? r2 : s.r;
        return [s.cx + Math.cos(a) * rr, s.cy + Math.sin(a) * rr];
      });
      const sdf = (x, y) => {   // polygon distance, minus the rounding
        let d = Infinity, inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [ax, ay] = pts[j], [bx, by] = pts[i];
          const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
          const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
          d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
          if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
        }
        return (inside ? -d : d) - round;
      };
      return { sdf, R: r2 * 0.6, bbox: [s.cx - s.r - round, s.cy - s.r - round, s.cx + s.r + round, s.cy + s.r + round] };
    },
  });

  // Feathers: overlapping rounded scallops in rows, lighter at their tips.
  registerTexture('feathers', (x, y, s) => {
    const w = 4 * s, h = 3 * s;
    const row = Math.floor(y / h), fx = (((x + (row % 2) * (w / 2)) % w) + w) % w, fy = ((y % h) + h) % h;
    const edge = Math.hypot(fx - w / 2, fy) / (w / 2);
    return edge > 1 ? -0.9 : 0.5 - edge * 0.7;
  }, { describe: 'feathers: rows of overlapping scallops' });

  // Float: the root bobs and tilts, like something hovering or swimming in place.
  registerMotion('float', {
    describe: 'float: the root bobs (height, units) and tilts (tilt, deg) on a slow wave; for ghosts, fish, balloons',
    generate({ rig, params, samples, loop }) {
      const H = params.height ?? 4, tilt = params.tilt ?? 6, TAU = Math.PI * 2;
      const u = (i) => (loop ? i / samples : i / (samples - 1));
      return {
        tracks: { [rig.root]: {
          y: Array.from({ length: samples }, (_, i) => -H * (0.5 + 0.5 * Math.sin(TAU * u(i)))),
          rot: Array.from({ length: samples }, (_, i) => tilt * Math.sin(TAU * u(i) + 0.8)),
        } },
        events: [{ u: 0.75, name: 'top' }],
      };
    },
  });
}
