// Motion models: generate realistic animation tracks for a figure's skeleton.
//
// A model works in the sprite's frame (the character walks "on a treadmill"; the page moves the
// sprite). Feet are planted with IK, so a sprite moved at the animation's `speed` (units/second)
// does not slide. The output is ordinary tracks (per-sample keyframe arrays), so authors can
// layer their own tracks on top and every other tool (lint, where, studio) understands it.
//
//   gait   walk / run / trot / sneak: foot paths (stance + swing), hips that rise and fall with the
//          legs, body pitch from front and hind legs, a stabilized head, arm swing, tail
//   idle   breathing, weight shift with planted feet, a head that looks around
//   pose   nothing of its own: the author's tracks move the body, the feet stay planted
//   hop    a ballistic hop: anticipation squash, launch stretch, a gravity arc, landing squash;
//          volume-preserving squash and stretch (sx = 1/√sy), a lean that drives follow-through
//   jump   a legged jump (one-shot): crouch, launch, legs tucked in the air, landing dip. Jumps in
//          place by default (height 0) so a page can move the sprite along its own arc between the
//          `launch` and `land` events
//   climb  scrambling up a wall in front of the character: feet planted on the wall and swept
//          down (the page moves the sprite up at `speedY`), body pitched up, arms reaching
//   fall   legs dangling and kicking, arms up, a wobble: loop it while the page drops the sprite
//   sit    sitting on an edge: hips lowered to the ground line, legs out over the edge, swinging
//
// Models that move the feet report events: `footstep` (with the leg) when a foot touches down in
// gait and climb, `takeoff` and `land` for hops, `launch` and `land` for jumps.
//
// Front-facing figures (rig.view = "front") walk toward the viewer: there is no stride, the hips
// shift over the standing foot, and legs/arms foreshorten (sy) instead of swinging sideways.
//
// Author tracks (m.input, sampled per time) on the root are applied before the legs are solved,
// so feet stay planted under any body motion; tracks on the neck/head replace head stabilization.
import { worldMatrices, apply, angleOf, ccd } from './rig.js';
import { sampleValue } from './animate.js';

export const MOTION_MODELS = ['gait', 'idle', 'pose', 'hop', 'jump', 'climb', 'fall', 'sit'];
/** Models that need rig.legs. */
export const LEGGED_MODELS = ['gait', 'pose', 'jump', 'climb', 'sit'];
/** Plug-in motion models: name → generate(context). */
export const customMotions = new Map();
export const OVERSAMPLE = 4; // samples per frame in generated tracks (smooth input for follow-through)

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const mod1 = (v) => ((v % 1) + 1) % 1;
const smooth = (s) => s * s * (3 - 2 * s);
const minJerk = (s) => s * s * s * (10 - 15 * s + 6 * s * s);
const round = (v) => Math.round(v * 100) / 100;

/**
 * Generate tracks for one motion.
 * @param parts  expanded parts (bones + dressing) with {id, parent, pivot, tip?, limits?, base}
 * @param rig    the figure's rig roles {root, legs:[{chain, phase, group}], neck, head, arms, tail, wings, shadow, view}
 * @param m      motion params (model, frames, fps, ...)
 * @returns {{tracks, speed, speedY, events:{u,name,data?}[], notes:string[]}}  (event u = normalized time 0..1)
 */
export function generateMotion(parts, rig, m) {
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const frames = m.frames ?? 8, fps = m.fps ?? 8;
  const loop = m.loop !== false;
  const M = loop ? frames * OVERSAMPLE : (frames - 1) * OVERSAMPLE + 1;
  const cycleT = frames / fps;
  const notes = [];
  const plugin = customMotions.get(m.model);
  if (plugin) return pluginMotion(plugin, parts, rig, m, { frames, fps, loop, M });

  // Rest pose and helpers.
  const restPose = () => new Map(parts.map((p) => [p.id, { ...p.base, show: p.base.show >= 0.5 }]));
  const rest = restPose();
  const restWorld = worldMatrices(parts, rest).world;
  const restAngle = (id) => angleOf(restWorld.get(id));
  const restPt = (id, pt) => apply(restWorld.get(id), pt);
  const lim = (id) => {
    const p = byId[id];
    return p.limits ? [p.base.rot + p.limits[0], p.base.rot + p.limits[1]] : null;
  };
  const limitsFor = (chain) => Object.fromEntries(chain.map((id) => [id, lim(id)]).filter(([, l]) => l));

  const legs = (rig.legs || []).map((l, i) => {
    const foot = l.chain[l.chain.length - 1];
    const phase = m.phases?.[l.chain[0]] ?? m.phases?.[i] ?? l.phase ?? i / (rig.legs.length || 1);
    const upper = l.chain.slice(0, -1);
    // Length of the leg up to the foot joint (the reach limit for hip → ankle).
    let len = 0;
    for (const id of upper) len += Math.hypot(...sub(restPt(id, byId[id].tip), restPt(id, byId[id].pivot)));
    let bendSign = 1;
    if (upper.length === 2) {
      const H = restPt(upper[0], byId[upper[0]].pivot), K = restPt(upper[1], byId[upper[1]].pivot), A = restPt(foot, byId[foot].pivot);
      const t = sub(K, H), s2 = sub(A, K);
      bendSign = Math.sign(t[0] * s2[1] - t[1] * s2[0]) || 1;
    }
    return {
      ...l, foot, upper, phase, len, bendSign, group: l.group ?? 'hind',
      toe0: restPt(foot, byId[foot].tip), footAngle0: restAngle(foot),
      footVec: sub(restPt(foot, byId[foot].tip), restPt(foot, byId[foot].pivot)),
      limits: limitsFor(l.chain),
    };
  });
  const groups = [...new Set(legs.map((l) => l.group))];
  const root = rig.root;
  const rootPivot = byId[root].pivot;
  // Each leg group (hind / fore) holds the body up at its attachment point; with two groups the
  // difference in their heights becomes body pitch.
  const groupAnchor = Object.fromEntries(groups.map((g) => {
    const ls = legs.filter((l) => l.group === g);
    const pts = ls.map((l) => restPt(l.upper[0], byId[l.upper[0]].pivot));
    return [g, [avg(pts.map((p) => p[0])), avg(pts.map((p) => p[1]))]];
  }));
  const pitchArm = groups.length > 1 ? groupAnchor.fore?.[0] - groupAnchor.hind?.[0] : 0;

  const neck = rig.neck || [];
  const head = rig.head;
  const headChain = head ? [...neck, head] : [];
  const headLimits = limitsFor(headChain);
  const head0 = head ? restPt(head, byId[head].pivot) : null;
  const headAngle0 = head ? restAngle(head) : 0;

  const model0 = m.model ?? 'gait';
  const model = model0 === 'pose' ? 'idle' : model0;
  const input = m.input ?? {};
  const inp = (id, prop, u) => (input[id]?.[prop] == null ? 0 : sampleValue(input[id][prop], u, loop, false));
  const authoredHead = model0 === 'pose' || headChain.some((id) => input[id]?.rot != null);
  const front = rig.view === 'front';
  const duty = m.duty ?? (model === 'hop' ? 0.4 : model === 'climb' ? 0.7 : 0.6);
  let stride = m.speed != null ? m.speed * duty * cycleT : m.stride ?? (model === 'climb' ? 8 : 0); // foot sweep during stance
  if (front && model !== 'climb') stride = 0; // walking toward the viewer: no sideways travel
  // A hop covers `stride` per cycle, all of it in the air.
  const speed = model === 'hop' ? (m.speed ?? stride / cycleT) : model === 'gait' && duty > 0 ? stride / (duty * cycleT) : 0;
  const speedY = model === 'climb' && duty > 0 ? stride / (duty * cycleT) : 0; // climbing: units/s upward
  const hopD = model === 'hop' ? speed * cycleT : 0;
  const rootRest = restPt(root, byId[root].pivot);
  const side0 = legs.length ? Math.sign(legs[0].toe0[0] - rootRest[0]) || 1 : 1; // which side leg 0 is on (front view)
  const wallX = legs.length ? Math.max(...legs.map((l) => l.toe0[0])) + (m.wall ?? 4) : 0; // climb: the wall's x
  const rise = m.rise ?? stride / 2; // climb: how far above the rest toe the stroke is centred

  // Events in normalized time u (0..1); the caller turns them into frame numbers.
  const events = [];
  if (model === 'gait' || model === 'climb') for (const l of legs) events.push({ u: mod1(l.phase), name: 'footstep', data: { leg: l.chain[0] } });
  if (model === 'hop') { const p0 = m.phase ?? 0; events.push({ u: mod1(p0), name: 'land' }, { u: mod1(p0 + duty), name: 'takeoff' }); }
  if (model === 'jump') { const j = jumpTimes(m); events.push({ u: j.c0, name: 'launch' }, { u: j.c1, name: 'land' }); }

  const out = new Map(); // id → {x:[], y:[], rot:[]}
  const rec = (id, prop, i, v) => {
    const o = out.get(id) ?? {};
    (o[prop] ??= new Array(M).fill(prop === 'sx' || prop === 'sy' ? 1 : 0))[i] = v;
    out.set(id, o);
  };

  const pose = restPose();
  // Run the cycle twice: the first pass warm-starts the IK so the recorded pass loops seamlessly.
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < M; i++) {
    const u = loop ? i / M : i / (M - 1);
    for (const p of parts) if (!legs.some((l) => l.chain.includes(p.id)) && !headChain.includes(p.id)) {
      Object.assign(pose.get(p.id), { x: p.base.x, y: p.base.y, rot: p.base.rot, sx: p.base.sx, sy: p.base.sy });
    }
    const R = pose.get(root);

    const hop = model === 'hop' ? hopState(mod1(u - (m.phase ?? 0)), duty, m, hopD) : null;
    const jmp = model === 'jump' ? jumpState(u, m) : null;

    // --- feet: where each toe should be, and the foot's angle ---------------------------------
    const feet = legs.map((l) => {
      if (model === 'idle') return { toe: l.toe0, aim: l.footAngle0, stance: 1 };
      if (hop) return { toe: [l.toe0[0] + hop.x, l.toe0[1] + hop.y], aim: l.footAngle0, stance: hop.y > -0.01 ? 1 : 0 }; // feet leave with the body
      if (jmp) {
        // On the ground the feet stay planted; in the air they travel with the body, tucked up.
        if (!jmp.air) return { toe: l.toe0, aim: l.footAngle0, stance: 1 };
        return { toe: [l.toe0[0] - jmp.tuck * 0.3, l.toe0[1] + jmp.y + jmp.dy - jmp.tuck], aim: l.footAngle0 + (m.toePoint ?? 25) * jmp.airK, stance: 0 };
      }
      if (model === 'fall') {
        // Dangling: legs hang a little lower than standing and kick, each on its own phase.
        const k = (m.kick ?? 2) * Math.sin(TAU * (u - l.phase));
        return { toe: [l.toe0[0] + k, l.toe0[1] + (m.drop ?? 1.5) - Math.abs(k) * 0.4], aim: l.footAngle0 + (m.toePoint ?? 30), stance: 0 };
      }
      if (model === 'sit') {
        // Legs out over the edge, swinging alternately.
        const k = (m.kick ?? 1.5) * Math.sin(TAU * (u - l.phase));
        return { toe: [l.toe0[0] + (m.legsForward ?? 6) + k, l.toe0[1] + (m.lower ?? 8) - (m.legsUp ?? 6) - k * 0.5], aim: l.footAngle0 + (m.toePoint ?? 20), stance: 0 }; // hanging, not planted
      }
      const s = mod1(u - l.phase);
      if (model === 'climb') {
        // Planted on the wall and swept down while the page moves the sprite up; the swing pulls
        // the foot back off the wall and up to the next hold.
        const aimC = l.footAngle0 + (m.footAim ?? -60);
        if (s < duty) { const k = s / duty; return { toe: [wallX, l.toe0[1] - rise + stride * (k - 0.5)], aim: aimC, stance: Math.sin(Math.PI * k) || 1e-3 }; }
        const k = (s - duty) / (1 - duty);
        return { toe: [wallX - (m.lift ?? 3) * Math.sin(Math.PI * k), l.toe0[1] - rise + stride * (0.5 - minJerk(k))], aim: aimC, stance: 0 };
      }
      if (s < duty) {
        const k = s / duty;
        const roll = m.toeOff ? Math.max(0, (k - 0.75) / 0.25) : 0; // heel rises at the end of stance
        return { toe: [l.toe0[0] + stride * (0.5 - k), l.toe0[1]], aim: l.footAngle0 + (m.toeOff ?? 0) * smooth(roll), stance: Math.sin(Math.PI * k) || 1e-3 };
      }
      const k = (s - duty) / (1 - duty);
      const lift = (m.lift ?? 3) * Math.sin(Math.PI * Math.pow(k, 0.75));
      const aim = l.footAngle0 + (m.toeOff ?? 0) * (1 - smooth(Math.min(1, k * 2))) + (m.toeCurl ?? 0) * Math.sin(Math.PI * k);
      return { toe: [l.toe0[0] + stride * (-0.5 + minJerk(k)), l.toe0[1] - lift], aim, stance: 0 };
    });

    // --- body height and pitch ------------------------------------------------------------------
    const bob = m.bob ?? 0;
    const groupDy = {};
    for (const g of groups) {
      const st = legs.map((l, j) => (l.group === g ? feet[j].stance : 0));
      const support = Math.max(0, ...st);
      let dy = m.crouch ?? 0;
      if (model === 'sit') dy += m.lower ?? 8;
      if (jmp) dy += jmp.dy + jmp.y;
      if (model === 'idle' || model === 'sit') dy += (m.breathe ?? 0) * Math.sin(TAU * u);
      else if (model === 'fall') dy += (m.bob ?? 0.6) * Math.sin(TAU * 2 * u);
      else if ((m.bounce ?? 'vault') === 'vault') dy -= bob * (support - 0.5); // highest at mid-stance
      else dy += bob * (support - 0.5); // spring (run/trot): lowest at mid-stance, high in flight
      groupDy[g] = dy;
    }
    // Front view: the weight shifts over the standing foot and the body rolls with it.
    const over = front && model === 'gait' ? side0 * Math.cos(TAU * (u - (legs[0]?.phase ?? 0) - duty / 2)) : 0;
    const rock = front ? (m.rock ?? 0) * over : (m.rock ?? 0) * Math.sin(TAU * 2 * (u - (legs[0]?.phase ?? 0)) - Math.PI / 2);
    let swayX = model === 'idle' ? (m.sway ?? 0) * Math.sin(TAU * u + 0.6) : (m.shift ?? 0) * over;
    let scaleY = 1;
    if (hop) { swayX += hop.x; scaleY = hop.sy; for (const g of groups) groupDy[g] += hop.y; }
    if (model === 'idle' && m.pulse) scaleY = 1 + m.pulse * Math.sin(TAU * u);
    const place = () => {
      const dyH = groupDy.hind ?? groupDy[groups[0]] ?? (hop ? hop.y : 0);
      const pitch = pitchArm ? Math.atan2((groupDy.fore ?? dyH) - dyH, pitchArm) * DEG : 0;
      R.x = byId[root].base.x + swayX;
      R.y = byId[root].base.y + dyH;
      R.x += inp(root, 'x', u); R.y += inp(root, 'y', u);
      const wob = model === 'fall' ? (m.wobble ?? 4) * Math.sin(TAU * u) : 0;
      R.rot = inp(root, 'rot', u) + byId[root].base.rot + pitch + rock + wob + (hop ? hop.rot : jmp ? jmp.rot : m.lean ?? 0) + (model === 'idle' || model === 'sit' ? (m.sway ?? 0) * 0.6 * Math.sin(TAU * u) : 0);
      R.sy = byId[root].base.sy * scaleY;
      R.sx = byId[root].base.sx / Math.sqrt(scaleY); // volume-preserving (a 3D blob: sx = sz = 1/√sy)
    };
    place();
    // Lower the hips when a leg could not otherwise reach its foot (legs spread wide).
    for (let it = 0; it < 3; it++) {
      const { world } = worldMatrices(parts, pose);
      let changed = false;
      for (const g of groups) {
        let need = -Infinity;
        legs.forEach((l, j) => {
          if (l.group !== g) return;
          const hip = apply(world.get(l.upper[0]), byId[l.upper[0]].pivot);
          const ang = (feet[j].aim - l.footAngle0) / DEG;
          const fv = rot2(l.footVec, ang);
          const ankle = [feet[j].toe[0] - fv[0], feet[j].toe[1] - fv[1]];
          const r = l.len * (m.reach ?? 0.97), dx = ankle[0] - hip[0];
          if (Math.abs(dx) >= r) { need = Math.max(need, ankle[1] - hip[1]); return; }
          need = Math.max(need, ankle[1] - Math.sqrt(r * r - dx * dx) - hip[1]);
        });
        if (need > 0.01) { groupDy[g] += need; changed = true; }
      }
      if (!changed) break;
      place();
    }

    // --- head: hold the gaze steady while the body moves -----------------------------------------
    if (head && !authoredHead) {
      const saved = headChain.map((id) => pose.get(id).rot);
      headChain.forEach((id) => { pose.get(id).rot = byId[id].base.rot; });
      const Hu = apply(worldMatrices(parts, pose).world.get(head), byId[head].pivot);
      headChain.forEach((id, k) => { pose.get(id).rot = saved[k]; });
      const hm = m.head ?? {};
      const steady = hm.steady ?? 0.5;
      const target = [head0[0] + (1 - steady) * (Hu[0] - head0[0]), head0[1] + (1 - steady) * (Hu[1] - head0[1])];
      if (hm.offset) { target[0] += hm.offset[0]; target[1] += hm.offset[1]; }
      if (hm.hold && model === 'gait') {
        // Bird head-bob: the head stays still in the world, then thrusts forward (twice per cycle).
        const steps = Math.max(1, legs.filter((l) => l.group === groups[0]).length);
        const v = mod1(u * steps - (legs[0]?.phase ?? 0) * steps), amp = (speed * cycleT) / steps, h = hm.hold;
        target[0] += v < h ? amp * h * (0.5 - v / h) : amp * h * (-0.5 + smooth((v - h) / (1 - h)));
      }
      if ((model === 'idle' || model === 'sit' || model === 'fall') && hm.look) {
        target[0] += hm.look * Math.sin(TAU * u + 1.3);
        target[1] += hm.look * 0.4 * Math.sin(TAU * 2 * u);
      }
      const aim = headAngle0 + (hm.tilt ?? 0) + (hm.nod ?? 0) * Math.sin(TAU * (model === 'idle' ? u : 2 * u));
      if (neck.length) ccd(parts, pose, { chain: headChain, end: head, tip: byId[head].pivot, limits: headLimits }, target, aim);
      else {
        // No neck: counter-rotate the head so it stays level in the world (by `steady`).
        const cur = angleOf(worldMatrices(parts, pose).world.get(head));
        pose.get(head).rot += wrapDeg(aim - cur) * steady;
      }
    }

    // --- legs: IK so each toe lands exactly on its target ------------------------------------------
    legs.forEach((l, j) => {
      if (front) {
        const d = frontLeg(parts, pose, byId, l, feet[j].toe);
        if (pass === 1 && feet[j].stance && d > 0.3) notes.push(`${l.chain[0]}: foot misses its mark by ${d.toFixed(1)} units at frame ${(i / OVERSAMPLE).toFixed(2)}`);
        return;
      }
      if (l.upper.length === 2) {
        const d = twoBone(parts, pose, byId, l, feet[j].toe, feet[j].aim);
        if (pass === 1 && feet[j].stance && d > 0.3) notes.push(`${l.chain[0]}: foot misses its mark by ${d.toFixed(1)} units at frame ${(i / OVERSAMPLE).toFixed(2)}`);
        return;
      }
      const r = { chain: l.chain, end: l.foot, tip: byId[l.foot].tip, limits: l.limits };
      const bend = () => l.upper.slice(1).forEach((id) => { const L = l.limits[id]; if (L) pose.get(id).rot = (L[0] + L[1]) / 2; });
      if (pass === 0 && i === 0) bend(); // start with the joints bent the way they are allowed to bend
      let d = ccd(parts, pose, r, feet[j].toe, feet[j].aim, 64);
      if (d > 0.05) {
        // Stuck against a limit (CCD local minimum): retry from the bent seed, keep the better one.
        const keep = l.chain.map((id) => pose.get(id).rot);
        bend();
        const d2 = ccd(parts, pose, r, feet[j].toe, feet[j].aim, 64);
        if (d2 < d) d = d2; else l.chain.forEach((id, k) => { pose.get(id).rot = keep[k]; });
      }
      if (pass === 1 && feet[j].stance && d > 0.3) notes.push(`${l.chain[0]}: foot misses its mark by ${d.toFixed(1)} units at frame ${(i / OVERSAMPLE).toFixed(2)}`);
    });

    // --- arms and tail ----------------------------------------------------------------------------
    for (const a of rig.arms || []) {
      const ph = a.phase ?? 0;
      const swing = model === 'idle' ? 0 : m.armSwing ?? 0;
      const fwd = -Math.cos(TAU * (u - ph)); // -1 back … +1 forward
      const [upperId, lowerId] = a.chain;
      const idleSway = model === 'idle' ? -(m.sway ?? 0) * 0.8 * Math.sin(TAU * u) : 0;
      // Model arm poses (degrees; negative swings forward in side view, outward/up in front view).
      const pose0 = jmp ? jmp.arm
        : model === 'climb' ? -(m.armReach ?? 150) + 25 * Math.sin(TAU * (u - ph))
          : model === 'fall' ? -(m.armsUp ?? 140) + 12 * Math.sin(TAU * 2 * u + TAU * ph) : 0;
      const aSide = Math.sign(restPt(upperId, byId[upperId].pivot)[0] - rootRest[0]) || 1;
      if (front) {
        // Seen from the front an arm swinging forward comes toward the viewer: it foreshortens and
        // hangs plumb while the body rolls (a pendulum).
        const k = swing / 90;
        pose.get(upperId).rot = byId[upperId].base.rot - rock * 0.8 + idleSway + (hop ? -hop.rot * 0.5 : 0) + aSide * Math.min(0, pose0); // only outward/up: "back" is invisible from the front
        pose.get(upperId).sy = byId[upperId].base.sy * (1 - k * (0.55 * Math.max(0, fwd) + 0.2 * Math.max(0, -fwd)));
      } else {
        pose.get(upperId).rot = byId[upperId].base.rot - swing * fwd + idleSway + pose0;
      }
      if (lowerId) pose.get(lowerId).rot = byId[lowerId].base.rot - (m.elbow ?? 0) - (front ? 0 : (swing * 0.5) * Math.max(0, fwd));
    }
    // Wings (rig.wings): flap while falling or climbing, spread in a jump. Positive rot raises a
    // wing that points backward from the shoulder.
    for (const id of rig.wings || []) {
      const flap = m.flap ?? 40;
      const w = model === 'fall' ? (m.wingsUp ?? 20) + flap * (0.5 + 0.5 * Math.sin(TAU * 2 * u))
        : jmp ? flap * jmp.airK
          : model === 'climb' ? flap * 0.6 * (0.5 + 0.5 * Math.sin(TAU * 2 * u)) : 0;
      if (w && byId[id]) pose.get(id).rot = byId[id].base.rot + w;
    }
    if (rig.shadow && byId[rig.shadow]) {
      // A contact shadow stays on the ground, follows the body sideways and shrinks with height.
      const S = pose.get(rig.shadow), b = byId[rig.shadow].base, h = Math.max(0, -(R.y - byId[root].base.y));
      S.x = b.x + (R.x - byId[root].base.x);
      S.sx = b.sx * Math.max(0.3, 1 - h / (m.shadowFade ?? 40)) / Math.sqrt(scaleY);
    }
    (rig.tail || []).forEach((id, k) => {
      const wag = m.tail ?? 0;
      pose.get(id).rot = byId[id].base.rot + wag * Math.sin(TAU * (model === 'idle' ? u : 2 * u) - k * 0.9);
    });

    if (pass === 1) {
      for (const [id, t] of pose) {
        const b = byId[id].base;
        if (Math.abs(t.rot - b.rot) > 1e-6 || out.get(id)?.rot) rec(id, 'rot', i, t.rot - b.rot);
        if (id === root) { rec(id, 'x', i, t.x - b.x); rec(id, 'y', i, t.y - b.y); }
        if (id === rig.shadow && (Math.abs(t.x - b.x) > 1e-6 || out.get(id)?.x)) rec(id, 'x', i, t.x - b.x);
        for (const k of ['sx', 'sy']) if (Math.abs(t[k] - b[k]) > 1e-6 || out.get(id)?.[k]) rec(id, k, i, t[k] / (b[k] || 1));
      }
    }
  }

  const tracks = {};
  for (const [id, props] of out) {
    tracks[id] = {};
    for (const [k, arr] of Object.entries(props)) {
      const r = arr.map(round);
      tracks[id][k] = r.every((v) => v === r[0]) ? r[0] : r;
    }
  }
  return { tracks, speed: round(speed), speedY: round(speedY), wall: model === 'climb' ? round(wallX) : undefined, events, notes: [...new Set(notes)].slice(0, 6) };
}

/**
 * Exact two-bone leg IK (law of cosines): the knee stays on the side it bends to in the rest
 * pose, the foot takes world angle `aim`, the toe lands on `toe`. Returns the miss distance.
 */
function twoBone(parts, pose, byId, l, toe, aim) {
  const [a, b] = l.upper, foot = l.foot;
  const W = () => worldMatrices(parts, pose).world;
  const setDir = (id, from, to) => {
    // rotate bone `id` so its pivot→tip vector points from `from` toward `to`
    const w = W().get(id), p = apply(w, byId[id].pivot), t = apply(w, byId[id].tip);
    const cur = Math.atan2(t[1] - p[1], t[0] - p[0]), want = Math.atan2(to[1] - from[1], to[0] - from[0]);
    pose.get(id).rot += wrapDeg((want - cur) * DEG);
  };
  let w = W();
  // Orient the foot first so we know where the ankle must be.
  pose.get(foot).rot += wrapDeg(aim - angleOf(w.get(foot)));
  w = W();
  const fp = apply(w.get(foot), byId[foot].pivot), ft = apply(w.get(foot), byId[foot].tip);
  const ankle = [toe[0] - (ft[0] - fp[0]), toe[1] - (ft[1] - fp[1])];
  const H = apply(w.get(a), byId[a].pivot);
  const L1 = Math.hypot(...sub(apply(w.get(a), byId[a].tip), H));
  const L2 = Math.hypot(...sub(apply(w.get(b), byId[b].tip), apply(w.get(b), byId[b].pivot)));
  const v = sub(ankle, H), dist = Math.hypot(...v);
  const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, dist));
  const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  const ux = v[0] / (dist || 1), uy = v[1] / (dist || 1);
  const knees = [[H[0] + ux * along - uy * h, H[1] + uy * along + ux * h], [H[0] + ux * along + uy * h, H[1] + uy * along - ux * h]];
  const bendSign = l.bendSign ?? 1;
  const cross = (k) => { const t = sub(k, H), s2 = sub(ankle, k); return t[0] * s2[1] - t[1] * s2[0]; };
  const K = Math.sign(cross(knees[0])) === bendSign ? knees[0] : knees[1];
  setDir(a, H, K);
  w = W();
  setDir(b, apply(w.get(b), byId[b].pivot), ankle);
  w = W();
  pose.get(foot).rot += wrapDeg(aim - angleOf(w.get(foot)));
  w = W();
  const end = apply(w.get(foot), byId[foot].tip);
  return Math.hypot(end[0] - toe[0], end[1] - toe[1]);
}
/**
 * Front-view leg: the knee bends toward the viewer, so the leg turns (to follow the hips sideways)
 * and foreshortens (sy) to put its ankle where the foot must be; the foot keeps its size and angle.
 */
function frontLeg(parts, pose, byId, l, toe) {
  const leg = l.chain[0], foot = l.chain.length > 1 ? l.chain[l.chain.length - 1] : null;
  const W = () => worldMatrices(parts, pose).world;
  const ankle = foot ? [toe[0] - l.footVec[0], toe[1] - l.footVec[1]] : toe;
  const tipOf = (w) => apply(w.get(leg), byId[leg].tip);
  for (let it = 0; it < 4; it++) {
    let w = W();
    const P = apply(w.get(leg), byId[leg].pivot), T = tipOf(w);
    const cur = Math.hypot(T[0] - P[0], T[1] - P[1]), want = Math.hypot(ankle[0] - P[0], ankle[1] - P[1]);
    pose.get(leg).sy = Math.min(byId[leg].base.sy, pose.get(leg).sy * want / (cur || 1)); // a leg can't get longer than straight
    w = W();
    const T2 = tipOf(w);
    pose.get(leg).rot += wrapDeg((Math.atan2(ankle[1] - P[1], ankle[0] - P[0]) - Math.atan2(T2[1] - P[1], T2[0] - P[0])) * DEG);
  }
  if (foot) {
    // Undo the leg's foreshortening and turn on the foot, so it stays its rest size and angle.
    const ps = pose.get(leg).sy / byId[leg].base.sy;
    pose.get(foot).sy = byId[foot].base.sy / ps;
    pose.get(foot).rot += wrapDeg(l.footAngle0 - angleOf(W().get(foot)));
  }
  const w = W();
  const end = foot ? apply(w.get(foot), byId[foot].tip) : apply(w.get(leg), byId[leg].tip);
  return Math.hypot(end[0] - toe[0], end[1] - toe[1]);
}

/**
 * One hop cycle at s ∈ [0,1): contact (landing → squash → anticipation → push-off), then flight on a
 * gravity parabola. x is the sprite-frame offset that keeps the body still on the ground while the
 * page moves it at constant speed (the same treadmill trick as planted feet).
 */
function hopState(s, duty, m, D) {
  const H = m.height ?? 16, sq = m.squash ?? 0.22, st = m.stretch ?? 0.15, lean = m.lean ?? 0;
  const a = (D * duty) / 2;
  const key = (k, pts) => {
    for (let i = 1; i < pts.length; i++) if (k <= pts[i][0]) {
      const [k0, v0] = pts[i - 1], [k1, v1] = pts[i];
      return v0 + (v1 - v0) * smooth((k - k0) / (k1 - k0 || 1));
    }
    return pts[pts.length - 1][1];
  };
  if (s < duty) {
    const k = s / duty;
    return {
      x: a - 2 * a * k, y: 0,
      sy: key(k, [[0, 1 + st], [0.22, 1 - sq], [0.5, 1 - sq * 0.3], [0.78, 1 - sq * 0.8], [1, 1 + st]]),
      rot: key(k, [[0, -lean], [0.35, 0], [0.6, 0], [1, lean]]),
    };
  }
  const k = (s - duty) / (1 - duty);
  return { x: -a + 2 * a * k, y: -H * 4 * k * (1 - k), sy: 1 + st * Math.abs(1 - 2 * k), rot: lean * Math.cos(Math.PI * k) };
}

/** Run a plug-in motion model and normalize what it returns. */
function pluginMotion(generate, parts, rig, m, { frames, fps, loop, M }) {
  const out = generate({ parts, rig, params: m, samples: M, loop, frames, fps }) ?? {};
  const ids = new Set(parts.map((p) => p.id));
  const tracks = {};
  for (const [id, props] of Object.entries(out.tracks ?? {})) {
    if (!ids.has(id)) throw new Error(`motion "${m.model}" returned a track for unknown part "${id}"`);
    tracks[id] = {};
    for (const [k, v] of Object.entries(props)) {
      if (!['x', 'y', 'rot', 'sx', 'sy'].includes(k)) throw new Error(`motion "${m.model}": track property "${k}" (use x, y, rot, sx, sy)`);
      if (Array.isArray(v) && v.length !== M) throw new Error(`motion "${m.model}": ${id}.${k} has ${v.length} values, needs ${M} (one per sample)`);
      tracks[id][k] = Array.isArray(v) ? v.map(round) : round(v);
    }
  }
  return { tracks, speed: round(out.speed ?? 0), speedY: round(out.speedY ?? 0), wall: out.wall, events: out.events ?? [], notes: out.notes ?? [] };
}

/** Phase boundaries of a jump: crouch until c0 (launch), airborne until c1 (land), then recover. */
function jumpTimes(m) {
  const c0 = m.anticipate ?? 0.3;
  return { c0, c1: Math.min(0.92, c0 + (m.air ?? 0.42)) };
}

/**
 * A legged jump at u ∈ [0,1]: dip (crouch depth), arc height in the sprite frame (0 = the page moves
 * the sprite), tuck (how far the feet pull up in the air), lean, and an arm swing (back, then up).
 */
function jumpState(u, m) {
  const { c0, c1 } = jumpTimes(m);
  const dip = m.dip ?? 6, H = m.height ?? 0, tuck = m.tuck ?? 4, lean = m.lean ?? 8;
  if (u < c0) {
    const d = smooth(u / c0);
    return { air: false, airK: 0, y: 0, dy: dip * d, tuck: 0, rot: lean * d, arm: 50 * d };
  }
  if (u < c1) {
    const k = (u - c0) / (c1 - c0);
    return {
      air: true, airK: Math.sin(Math.PI * k), y: -H * 4 * k * (1 - k),
      dy: -dip * 0.3 * Math.sin(Math.PI * Math.min(1, k * 2)), tuck: tuck * Math.sin(Math.PI * k),
      rot: lean * (1 - 1.6 * k), arm: 50 - 190 * smooth(Math.min(1, k * 2.5)),
    };
  }
  const k = (u - c1) / (1 - c1);
  const d = k < 0.3 ? smooth(k / 0.3) : 1 - smooth((k - 0.3) / 0.7);
  return { air: false, airK: 0, y: 0, dy: dip * 0.8 * d, tuck: 0, rot: lean * (-0.6 + 0.6 * smooth(k)) + lean * 0.5 * d, arm: -140 * (1 - smooth(k)) };
}

const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const rot2 = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
