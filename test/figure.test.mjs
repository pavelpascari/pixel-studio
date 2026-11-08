import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  validate, compile, samplePose, worldMatrices, checkBounds, expandFigure, resolveSpec, followOffsets,
} from '../src/core/index.js';

const fig = (name) => JSON.parse(readFileSync(new URL(`../figures/${name}.json`, import.meta.url), 'utf8'));
const FIGURES = readdirSync(new URL('../figures/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const at = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const toes = (c, anim, f) => {
  const { world } = worldMatrices(c.parts, samplePose(c, c.animations[anim], f));
  return Object.fromEntries(c.parts.filter((p) => p.tip && /foot|paw/i.test(p.id)).map((p) => [p.id, at(world.get(p.id), p.tip)]));
};

test('every figure expands to a valid skeleton with clean motions (no foot misses, nothing clipped)', () => {
  for (const name of FIGURES) {
    const notes = [];
    const spec = expandFigure({}, fig(name), {}, (p, m) => notes.push(`${p}: ${m}`));
    const { errors, warnings } = validate(spec);
    assert.deepEqual(errors, [], name);
    assert.deepEqual(warnings, [], name);
    assert.deepEqual(notes, [], name);
    const c = compile(spec);
    assert.deepEqual(checkBounds(c).map((w) => w.message), [], name);
    assert.deepEqual(Object.keys(c.animations), Object.keys(fig(name).motions), name);
    assert.ok(c.parts.every((p) => p.tip), `${name}: every part is a bone`);
  }
});

test('gait: planted feet move backward at exactly the animation speed (no sliding)', () => {
  for (const [name, anim] of [['goose', 'walk'], ['human', 'walk'], ['dog', 'trot']]) {
    const c = compile(expandFigure({}, fig(name)));
    const a = c.animations[anim];
    assert.ok(a.speed > 0, `${name}.${anim} has a speed`);
    const step = a.speed / a.fps; // units per frame
    let planted = 0;
    for (let f = 0; f < a.frames; f++) {
      const p0 = toes(c, anim, f), p1 = toes(c, anim, (f + 1) % a.frames);
      for (const id of Object.keys(p0)) {
        const ground = Math.max(...Object.values(p0).map((p) => p[1]));
        if (Math.abs(p0[id][1] - ground) < 0.05 && Math.abs(p1[id][1] - ground) < 0.05 && p1[id][0] < p0[id][0]) {
          planted++;
          assert.ok(Math.abs(p0[id][0] - p1[id][0] - step) < 0.1, `${name}.${anim} ${id} frame ${f}: moved ${(p0[id][0] - p1[id][0]).toFixed(2)}, want ${step.toFixed(2)}`);
        }
      }
    }
    assert.ok(planted >= 3, `${name}.${anim}: found planted frames`);
  }
});

test('pose: author tracks on the body move it while the feet stay planted', () => {
  const spec = expandFigure({ animations: { bob: { motion: 'pose', frames: 4, tracks: { body: { y: [0, -1, 2, 0], rot: [0, 5, -4, 0] } } } } }, fig('goose'));
  const c = compile(spec);
  const rest = toes(c, 'bob', 0);
  for (let f = 1; f < 4; f++) {
    const p = toes(c, 'bob', f);
    for (const id of Object.keys(rest)) assert.ok(Math.hypot(p[id][0] - rest[id][0], p[id][1] - rest[id][1]) < 0.05, `${id} frame ${f}`);
  }
  // ... and the body really moved
  const body = (f) => samplePose(c, c.animations.bob, f).get('body');
  assert.ok(Math.abs(body(2).y - body(0).y) > 1);
});

test('dressing: parts with a bone id ride that bone; "bone" attaches layers; tracks layer on top of motion', () => {
  const spec = expandFigure({
    materials: { m: { color: '#888888' } },
    parts: [
      { id: 'head', shapes: [{ type: 'circle', cx: 64, cy: 25, r: 8, material: 'm' }] },
      { id: 'hat', bone: 'head', shapes: [{ type: 'rect', x: 58, y: 12, w: 10, h: 6, material: 'm' }] },
    ],
    animations: { walk: { motion: 'walk', tracks: { tail: { rot: 10 } } }, still: { frames: 1, tracks: {} } },
  }, fig('goose'));
  assert.deepEqual(validate(spec).errors, []);
  const head = spec.parts.find((p) => p.id === 'head'), hat = spec.parts.find((p) => p.id === 'hat');
  assert.equal(head.shapes.length, 1);
  assert.equal(hat.parent, 'head');
  assert.deepEqual(hat.pivot, [62, 30]);
  const plain = expandFigure({ animations: { walk: { motion: 'walk' } } }, fig('goose'));
  const a = spec.animations.walk.tracks.tail.rot, b = plain.animations.walk.tracks.tail.rot;
  a.forEach((v, i) => assert.ok(Math.abs(v - (b[i] + 10)) < 0.02));
});

test('figure errors point at the problem', async () => {
  assert.throws(() => expandFigure({ parts: [{ id: 'x', bone: 'hed', shapes: [] }] }, fig('goose')), /unknown bone "hed"/);
  assert.throws(() => expandFigure({ animations: { a: { motion: 'moonwalk' } } }, fig('goose')), /unknown motion "moonwalk"/);
  await assert.rejects(resolveSpec({ figure: 'unicorn' }, { loadFigure: () => { throw new Error('nope'); } }), /cannot load figure "unicorn"/);
  assert.match(validate({ figure: 'goose', materials: { m: '#fff' }, parts: [] }).errors[0].message, /must be resolved/);
});

test('follow-through: a tail lags behind the gait and is still when nothing moves', () => {
  const c = compile(expandFigure({ animations: { walk: { motion: 'walk' }, rest: { motion: 'pose', frames: 4 } } }, fig('dog')));
  const walk = followOffsets(c, c.animations.walk);
  assert.ok(Math.max(...walk.get('tail2').map(Math.abs)) > 1, 'tail swings while walking');
  const rest = followOffsets(c, c.animations.rest);
  assert.ok(Math.max(...rest.get('tail2').map(Math.abs)) < 0.01, 'tail is still at rest');
});

test('every example is dressed on a figure and validates cleanly', async () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8'));
  const files = readdirSync(new URL('../examples/', import.meta.url)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 9);
  for (const f of files) {
    const spec = read(f);
    assert.ok(spec.figure || spec.extends, `${f} uses a figure`);
    const notes = [];
    const resolved = await resolveSpec(spec, { loadRef: read, loadFigure: fig, warn: (p, m) => notes.push(m) });
    const { errors, warnings } = validate(resolved);
    assert.deepEqual([errors, warnings, notes], [[], [], []], f);
    assert.deepEqual(checkBounds(compile(resolved)), [], f);
  }
});

test('front view: planted feet stay put while the hips shift over them; a lifted leg foreshortens', () => {
  const c = compile(expandFigure({}, fig('chibi')));
  const a = c.animations.walk;
  assert.equal(a.speed ?? 0, 0, 'walking toward the viewer has no sideways speed');
  let planted = 0, lifted = 0;
  const xs = [];
  for (let f = 0; f < a.frames; f++) {
    const t = toes(c, 'walk', f), pose = samplePose(c, a, f);
    xs.push(pose.get('body').x);
    for (const [id, [x, y]] of Object.entries(t)) {
      const leg = id.replace('foot', 'leg');
      if (y > 91.9) { planted++; assert.ok(Math.abs(x - (id === 'footL' ? 44 : 56)) < 0.15, `${id} frame ${f} slid to ${x}`); }
      else { lifted++; assert.ok(pose.get(leg).sy < 0.97, `${leg} foreshortens when lifted`); }
    }
  }
  assert.ok(planted >= 8 && lifted >= 2);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1.5, 'hips shift side to side');
});

test('hop: a gravity arc with volume-preserving squash and stretch; the shadow shrinks in the air', () => {
  const c = compile(expandFigure({}, fig('blob')));
  const a = c.animations.hop;
  const s = Array.from({ length: a.frames }, (_, f) => samplePose(c, a, f));
  const ys = s.map((p) => p.get('body').y), sys = s.map((p) => p.get('body').sy);
  assert.ok(Math.min(...ys) < -15, 'it leaves the ground');
  assert.ok(Math.min(...sys) < 0.85 && Math.max(...sys) > 1.1, 'squash and stretch');
  for (const p of s) assert.ok(Math.abs(p.get('body').sx * Math.sqrt(p.get('body').sy) - 1) < 0.02, 'volume preserved');
  const top = ys.indexOf(Math.min(...ys));
  assert.ok(s[top].get('shadow').sx < 0.7 * s[0].get('shadow').sx, 'shadow shrinks at the apex');
  assert.ok(c.animations.travel.speed > 0, 'a travelling hop has a speed');
});

// ---------- events, ground line, attachment points, holds (bundle metadata) ----------
import { buildBundle, mergeVariant, renderSheet } from '../src/core/index.js';
import { bakePoints } from '../src/core/bundle.js';

test('events: footsteps at each touchdown; hop takeoff/land; jump launch/land; author events added', () => {
  const goose = compile(expandFigure({}, fig('goose')));
  const walk = goose.animations.walk;
  assert.deepEqual(walk.events.map((e) => [e.frame, e.name, e.data.leg]), [[0, 'footstep', 'legNear'], [4, 'footstep', 'legFar']]);
  // The touchdown frame really is when the foot lands: the toe is on the ground there and was lifted just before.
  const ground = goose.ground;
  const toeY = (f) => toes(goose, 'walk', f).footNear[1];
  assert.ok(Math.abs(toeY(0) - ground) < 0.3 && toeY(walk.frames - 1) < ground - 0.5, `footNear lands on frame 0 (${toeY(0)}, before: ${toeY(walk.frames - 1)})`);

  const jump = goose.animations.jump;
  const launch = jump.events.find((e) => e.name === 'launch').frame, land = jump.events.find((e) => e.name === 'land').frame;
  assert.ok(launch > 0 && land > launch && land < jump.frames, `launch ${launch} < land ${land}`);
  for (let f = 0; f < jump.frames; f++) {
    const y = Math.min(...Object.values(toes(goose, 'jump', f)).map((p) => p[1]));
    if (f < launch || f >= land) assert.ok(Math.abs(Math.max(...Object.values(toes(goose, 'jump', f)).map((p) => p[1])) - ground) < 0.4, `feet planted at frame ${f}`);
    else assert.ok(y < ground - 1, `feet tucked in the air at frame ${f} (${y})`);
  }

  const blob = compile(expandFigure({}, fig('blob')));
  assert.deepEqual(blob.animations.hop.events.map((e) => e.name), ['land', 'takeoff']);

  const custom = compile(expandFigure({ animations: { walk: { motion: 'walk', events: [{ frame: 2, name: 'wink', data: { eye: 'left' } }] }, idle: { motion: 'idle', events: false }, w2: { motion: 'walk', events: false } } }, fig('goose')));
  assert.deepEqual(custom.animations.walk.events.map((e) => e.name), ['footstep', 'wink', 'footstep']);
  assert.deepEqual(custom.animations.walk.events[1].data, { eye: 'left' });
  assert.deepEqual(custom.animations.w2.events, []);
});

test('climb: feet planted on the wall and swept down at speedY (no sliding while the page climbs)', () => {
  const c = compile(expandFigure({}, fig('goose')));
  const a = c.animations.climb;
  assert.ok(a.speedY > 0 && !a.speed, `speedY ${a.speedY}`);
  const step = a.speedY / a.fps;
  let planted = 0;
  for (let f = 0; f < a.frames; f++) {
    const p0 = toes(c, 'climb', f), p1 = toes(c, 'climb', (f + 1) % a.frames);
    for (const id of Object.keys(p0)) {
      if (Math.abs(p1[id][0] - p0[id][0]) < 0.05 && Math.abs(p1[id][1] - p0[id][1] - step) < 0.15) planted++;
    }
  }
  assert.ok(planted >= 4, `feet held the wall and moved down by speedY/fps in ${planted} frame steps`);
});

test('ground line: from the figure (toes, shadow), fitted with the figure, overridable', () => {
  assert.equal(compile(expandFigure({}, fig('goose'))).ground, 90.5);
  assert.equal(compile(expandFigure({}, fig('blob'))).ground, 92);
  assert.equal(compile(expandFigure({ figure: { scale: 0.5 } }, fig('goose'), { scale: 0.5 })).ground, 95.25);
  assert.equal(compile(expandFigure({ ground: 80 }, fig('goose'))).ground, 80);
  const { errors } = validate({ ...expandFigure({}, fig('goose')), ground: 140 });
  assert.match(errors.map((e) => e.path + ' ' + e.message).join(), /\$\.ground/);
});

test('points: baked per frame in units, carried by their part; validation explains mistakes', () => {
  const c = compile(expandFigure({}, fig('goose')));
  const pts = bakePoints(c);
  assert.deepEqual(Object.keys(pts), ['beak', 'head', 'tail']);
  const beak = pts.beak.walk;
  assert.equal(beak.length, c.animations.walk.frames);
  const { world } = worldMatrices(c.parts, samplePose(c, c.animations.walk, 3));
  const want = at(world.get('head'), c.parts.find((p) => p.id === 'head').tip);
  assert.ok(Math.hypot(beak[3][0] - want[0], beak[3][1] - want[1]) < 0.01, 'beak = head tip in frame 3');
  assert.ok(new Set(beak.map((p) => p[1])).size > 1, 'the beak moves during the walk');

  const base = expandFigure({}, fig('goose'));
  const bad = (points) => validate({ ...base, points }).errors.map((e) => `${e.path} ${e.message}`).join('\n');
  assert.match(bad({ x: { part: 'hed', at: [1, 2] } }), /\$\.points\.x\.part unknown part "hed" — did you mean "head"\?/);
  assert.match(bad({ x: { part: 'head', at: 'middle' } }), /\$\.points\.x\.at/);
  assert.equal(bad({ x: { part: 'head', at: [80, 26] } }), '');
});

test('holds become per-frame durations; bundles carry ground, size, events, points, speedY', async () => {
  const spec = expandFigure({ animations: { honk: { motion: 'pose', frames: 4, fps: 10, loop: false, holds: { 2: 3 }, events: [{ frame: 2, name: 'honk' }] }, climb: { motion: 'climb' } } }, fig('goose'));
  assert.deepEqual(validate(spec).errors, []);
  const c = compile(spec);
  const meta = renderSheet(c, 16).meta.animations;
  assert.deepEqual(meta.honk.durations, [100, 100, 300, 100]);
  assert.equal(meta.climb.durations, undefined);
  const b = await buildBundle(c, { resolutions: [16], encode: () => 'data:,' });
  assert.equal(b.ground, 90.5);
  assert.deepEqual(b.size, [100, 100]);
  assert.deepEqual(b.animations.honk.events, [{ frame: 2, name: 'honk' }]);
  assert.ok(b.animations.climb.speedY > 0);
  assert.deepEqual(Object.keys(b.points), ['beak', 'head', 'tail']);
  assert.equal(b.points.beak.climb.length, c.animations.climb.frames);

  const bad = (a) => validate({ ...spec, animations: { x: { frames: 4, ...a } } }).errors.map((e) => `${e.path} ${e.message}`).join('\n');
  assert.match(bad({ holds: { 9: 2 } }), /holds\.9 "9" is not a frame index 0\.\.3/);
  assert.match(bad({ holds: { 1: 0 } }), /a hold is a multiple/);
  assert.match(bad({ events: [{ frame: 4, name: 'x' }] }), /events\[0\]\.frame frame must be a whole number 0\.\.3/);
  assert.match(bad({ events: [{ frame: 1 }] }), /events\[0\]\.name/);
});

test('variants merge points by name (null removes one)', () => {
  const base = { points: { beak: { part: 'head', at: 'tip' }, tail: { part: 'tail', at: 'tip' } } };
  const out = mergeVariant(base, { points: { tail: null, hat: { part: 'head', at: [70, 20] } } });
  assert.deepEqual(Object.keys(out.points), ['beak', 'hat']);
});

test('states: validated against the animations and inputs; skins compile as patched characters', async () => {
  const base = expandFigure({ animations: { idle: { motion: 'idle' }, walk: { motion: 'walk' } } }, fig('goose'));
  const errs = (states) => validate({ ...base, states }).errors.map((e) => `${e.path} ${e.message}`).join('\n');
  const ok = { initial: 'idle', inputs: { speed: 0 }, nodes: { idle: { anim: 'idle' }, walk: { anim: 'walk' } }, transitions: [{ from: 'idle', to: 'walk', when: 'speed > 0' }] };
  assert.equal(errs(ok), '');
  assert.match(errs({ ...ok, nodes: { idle: { anim: 'idel' } } }), /nodes\.idle\.anim unknown animation "idel" — did you mean "idle"\?/);
  assert.match(errs({ ...ok, transitions: [{ from: 'idle', to: 'walk', when: 'sped > 0' }] }), /transitions\[0\]\.when "sped" is not an input — did you mean "speed"\?/);
  assert.match(errs({ ...ok, transitions: [{ from: 'idle', to: 'wlk' }] }), /transitions\[0\]\.to unknown node "wlk"/);
  assert.match(errs({ ...ok, interactions: [{ on: 'tap', fire: 'speed' }] }), /interactions\[0\]\.on/);

  const skinned = { ...base, materials: { ...base.materials, hat: { color: '#ff5fa2' } }, skins: {
    party: { parts: [{ id: 'hat', parent: 'head', shapes: [{ type: 'circle', cx: 70, cy: 18, r: 3, material: 'hat' }] }] },
  } };
  // the base never uses "hat": define it only in the skin instead
  delete skinned.materials.hat;
  skinned.skins.party.materials = { hat: { color: '#ff5fa2' } };
  assert.deepEqual(validate(skinned).errors, []);
  const c = compile(skinned);
  assert.ok(c.skins.party.parts.some((p) => p.id === 'hat') && !c.parts.some((p) => p.id === 'hat'));
  assert.deepEqual(Object.keys(c.skins.party.animations), Object.keys(c.animations));
  const bad = validate({ ...skinned, skins: { party: { parts: [{ id: 'hat', parent: 'head', shapes: [{ type: 'circle', cx: 70, cy: 18, r: 3, material: 'felt' }] }] }, x: { animations: {} } } }).errors.map((e) => `${e.path} ${e.message}`).join('\n');
  assert.match(bad, /\$\.skins\.party\.parts\[\d+\]\.shapes\[0\]\.material unknown material "felt"/);
  assert.match(bad, /\$\.skins\.x\.animations skins can change/);
  const b = await buildBundle(c, { resolutions: [16], encode: () => 'data:,' });
  assert.deepEqual(b.skins, ['party']);
  assert.deepEqual(b.variants.map((v) => v.skin ?? null), [null, 'party']);
});

test('export: Aseprite sheet JSON (Phaser) with a PixiJS animations map, slices for points, extras', async () => {
  const { exportSheet } = await import('../src/core/index.js');
  const spec = expandFigure({ animations: { walk: { motion: 'walk' }, honk: { motion: 'pose', frames: 4, fps: 10, loop: false, holds: { 2: 2 } } } }, fig('goose'));
  const c = compile(spec);
  const ex = exportSheet(c, 16, { image: 'g.png' });
  const names = Object.keys(ex.json.frames);
  assert.deepEqual(names, Array.from({ length: 12 }, (_, i) => String(i)), 'frames named by index (Phaser createFromAseprite)');
  assert.deepEqual(ex.json.meta.frameTags.map((t) => [t.name, t.from, t.to, t.repeat]), [['walk', 0, 7, undefined], ['honk', 8, 11, '1']]);
  assert.deepEqual(ex.json.animations.honk, ['8', '9', '10', '11']);
  assert.deepEqual(ex.json.animations.honk.map((k) => ex.json.frames[k].duration), [100, 100, 200, 100]);
  assert.deepEqual(ex.json.frames['9'].frame, { x: 16, y: 16, w: 16, h: 16 });
  assert.deepEqual(ex.json.meta.size, { w: ex.width, h: ex.height });
  assert.deepEqual(ex.json.meta.slices.map((s) => [s.name, s.keys.length]), [['beak', 12], ['head', 12], ['tail', 12]]);
  assert.equal(ex.json.meta.pixelStudio.animations.walk.events[0].name, 'footstep');
  assert.equal(ex.json.meta.pixelStudio.ground, 90.5);
});

test('skins that move parts get their own attachment points', async () => {
  const base = expandFigure({ animations: { idle: { motion: 'idle' } }, skins: {
    same: { materials: {} },
    tall: { parts: [{ id: 'head', y: -6 }] },
  } }, fig('goose'));
  const b = await buildBundle(compile(base), { resolutions: [16], encode: () => 'data:,' });
  assert.deepEqual(Object.keys(b.skinPoints), ['tall']);
  assert.ok(Math.abs(b.skinPoints.tall.beak.idle[0][1] - (b.points.beak.idle[0][1] - 6)) < 0.5, 'beak 6 units higher');
});

test('mixes: baked transition clips blend the end of one animation into the start of another', () => {
  const spec = expandFigure({ animations: { idle: { motion: 'idle' }, walk: { motion: 'walk' } }, mixes: { 'walk>idle': { frames: 3 } } }, fig('goose'));
  assert.deepEqual(validate(spec).errors, []);
  const c = compile(spec);
  const m = c.animations['walk>idle'];
  assert.deepEqual([m.frames, m.loop, m.mix], [3, false, { from: 'walk', to: 'idle' }]);
  const toe = (anim, f) => toes(c, anim, f).footNear[0];
  const a = toe('walk', 0), b = toe('idle', 0), xs = [0, 1, 2].map((f) => toe('walk>idle', f));
  assert.ok(xs.every((x) => x >= Math.min(a, b) - 0.6 && x <= Math.max(a, b) + 0.6), `in-betweens lie between the end poses (${a.toFixed(1)} → ${xs.map((x) => x.toFixed(1))} → ${b.toFixed(1)})`);
  const bad = (mixes) => validate({ ...spec, mixes }).errors.map((e) => `${e.path} ${e.message}`).join('\n');
  assert.match(bad({ 'walk>idel': {} }), /unknown animation "idel" — did you mean "idle"\?/);
  assert.match(bad({ walk: {} }), /named "from>to"/);
  assert.match(bad({ 'walk>idle': { frames: 20 } }), /frames must be a whole number 1\.\.8/);
});

test('library motions carry their own tracks, events and holds; spec tracks override them', async () => {
  const { readFileSync } = await import('node:fs');
  const loadFigure = (n) => JSON.parse(readFileSync(new URL(`../figures/${n}.json`, import.meta.url), 'utf8'));
  const lib = await resolveSpec({ figure: 'goose', animations: { honk: { motion: 'honk' }, rush: { motion: 'rush' } } }, { loadFigure });
  assert.deepEqual(lib.animations.honk.events, [{ frame: 3, name: 'honk' }]);
  assert.deepEqual(lib.animations.honk.holds, { 3: 2 });
  const own = await resolveSpec({ figure: 'goose', animations: { rush: { motion: 'rush', tracks: { wing: { rot: 0 } } } } }, { loadFigure });
  const wing = (s) => JSON.stringify(s.animations.rush.tracks.wing);
  assert.notEqual(wing(lib), wing(own));   // the spec's wing replaces the library's flapping
  assert.equal(JSON.stringify(lib.animations.rush.tracks.jaw), JSON.stringify(own.animations.rush.tracks.jaw));   // the rest is kept
});
