// Variants: a spec can extend another spec and describe only what differs.
//
//   { "extends": "goose-root.json",
//     "name": "phreak",
//     "materials": { "mask": { "color": "#2c2b38" }, "beak": { "color": "#4a4852" } },   // add or merge (null removes)
//     "parts": [
//       { "id": "glasses", "remove": true },                    // also removes its children and their tracks
//       { "id": "head", "addShapes": [ ... ] },                  // append shapes
//       { "id": "neck", "shapes": [ ... ], "z": 4 },             // replace fields
//       { "id": "pompom", "parent": "head", "shapes": [ ... ] }  // new part
//     ],
//     "materialMap": { "hoodie": "plumage" },                    // re-point shapes from one material to another
//     "animations": { "hack": null, "idle": { "tracks": { "eye": { "show": [1,1,0,1] } } } },
//     "style": { "light": 30 } }

import { resolveFigure } from './figure.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));

/** Merge a variant (without resolving its `extends`) onto a fully resolved base spec. */
export function mergeVariant(base, variant) {
  const out = clone(base);
  for (const [k, v] of Object.entries(variant)) {
    if (['extends', 'materials', 'parts', 'animations', 'style', 'materialMap', 'points', 'skins', 'views'].includes(k)) continue;
    if (v === null) delete out[k]; else out[k] = clone(v);
  }

  // Materials: merge per material and per field; null removes.
  out.materials = { ...(out.materials || {}) };
  for (const [name, m] of Object.entries(variant.materials || {})) {
    if (m === null) { delete out.materials[name]; continue; }
    const prev = out.materials[name];
    out.materials[name] = isObj(m) && isObj(prev) ? dropNulls({ ...prev, ...m }) : isObj(m) ? dropNulls(m) : m;
  }

  // Parts: patch by id, remove (with descendants), or append.
  let parts = out.parts || [];
  const removed = new Set();
  for (const patch of variant.parts || []) {
    if (!isObj(patch) || typeof patch.id !== 'string') { parts.push(clone(patch)); continue; }
    const i = parts.findIndex((p) => p.id === patch.id);
    if (patch.remove) {
      if (i < 0) throw variantError(`parts: cannot remove "${patch.id}": the base has no such part`);
      removed.add(patch.id);
      continue;
    }
    if (i < 0) {
      const { addShapes, ...rest } = patch;
      parts.push(clone({ ...rest, shapes: [...(rest.shapes || []), ...(addShapes || [])] }));
      continue;
    }
    const { addShapes, id, ...fields } = patch;
    const p = { ...parts[i] };
    for (const [k, v] of Object.entries(fields)) { if (v === null) delete p[k]; else p[k] = clone(v); }
    if (addShapes) p.shapes = [...(p.shapes || []), ...clone(addShapes)];
    parts[i] = p;
  }
  // Removing a part removes its descendants too.
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of parts) if (p.parent && removed.has(p.parent) && !removed.has(p.id)) { removed.add(p.id); grew = true; }
  }
  parts = parts.filter((p) => !removed.has(p.id));

  // Views (other angles): merged view by view like a small variant (null removes one).
  if (variant.views !== undefined) {
    if (variant.views === null) delete out.views;
    else {
      out.views = { ...(out.views || {}) };
      for (const [name, v] of Object.entries(variant.views)) {
        if (v === null) { delete out.views[name]; continue; }
        const prev = out.views[name];
        if (!isObj(prev) || !isObj(v)) { out.views[name] = clone(v); continue; }
        const merged = mergeVariant(prev, v);
        delete merged.materials;
        if (prev.animations === undefined && v.animations === undefined) delete merged.animations;   // all of the figure's motions
        out.views[name] = merged;
      }
    }
  }
  const viewParts = Object.values(out.views || {}).flatMap((v) => (isObj(v) && Array.isArray(v.parts) ? v.parts : []));

  // Material remapping (applied to every shape, including the variant's own, and every view's).
  const map = variant.materialMap || {};
  for (const p of [...parts, ...viewParts]) for (const s of p.shapes || []) if (s.material in map) s.material = map[s.material];
  // Materials the base used that this variant made unused (removed parts, remapped, replaced shapes)
  // are dropped, so variants do not inherit "material is never used" noise.
  const usedIn = (list) => new Set(list.flatMap((p) => (p.shapes || []).map((s) => s.material)));
  const baseViewParts = Object.values(base.views || {}).flatMap((v) => (isObj(v) && Array.isArray(v.parts) ? v.parts : []));
  const usedBefore = usedIn([...(base.parts || []), ...baseViewParts]), usedNow = usedIn([...parts, ...viewParts]);
  for (const name of Object.keys(out.materials))
    if (usedBefore.has(name) && !usedNow.has(name) && !(variant.materials && name in variant.materials)) delete out.materials[name];
  out.parts = parts;

  // Animations: null removes; existing ones merge (tracks per part and property; null removes).
  out.animations = { ...(out.animations || {}) };
  for (const [name, a] of Object.entries(variant.animations || {})) {
    if (a === null) { delete out.animations[name]; continue; }
    const prev = out.animations[name];
    if (!prev || !isObj(a)) { out.animations[name] = clone(a); continue; }
    const { tracks, ...fields } = a;
    const merged = { ...prev, ...clone(fields), tracks: { ...(prev.tracks || {}) } };
    for (const [pid, props] of Object.entries(tracks || {})) {
      if (props === null) { delete merged.tracks[pid]; continue; }
      merged.tracks[pid] = dropNulls({ ...(merged.tracks[pid] || {}), ...clone(props) });
    }
    out.animations[name] = dropNulls(merged);
  }
  // Drop tracks and reach constraints that point at parts that no longer exist.
  const ids = new Set(parts.map((p) => p.id));
  for (const a of Object.values(out.animations)) {
    if (!isObj(a)) continue;
    if (isObj(a.tracks)) for (const pid of Object.keys(a.tracks)) if (!ids.has(pid)) delete a.tracks[pid];
    if (Array.isArray(a.reach)) a.reach = a.reach.filter((r) => !isObj(r) || !Array.isArray(r.chain) || r.chain.every((id) => ids.has(id)));
  }

  // Points and skins merge by name (null removes one).
  for (const k of ['points', 'skins']) {
    if (variant[k] === undefined) continue;
    if (variant[k] === null) { delete out[k]; continue; }
    out[k] = dropNulls({ ...(out[k] || {}), ...clone(variant[k]) });
  }
  if (variant.style !== undefined) out.style = variant.style === null ? undefined : dropNulls({ ...(out.style || {}), ...variant.style });
  if (out.style === undefined) delete out.style;
  return out;
}

function variantError(msg) {
  const e = new Error(msg);
  e.errors = [{ path: '$', message: msg }];
  return e;
}

/**
 * Resolve `extends` chains. `load(ref, fromRef)` returns the referenced spec object (sync or async).
 * Returns a plain spec with no `extends` key.
 */
export async function resolveExtends(spec, load, { from = null, depth = 0 } = {}) {
  if (!isObj(spec) || spec.extends == null) return spec;
  if (typeof spec.extends !== 'string') throw variantError('"extends" must be a file name like "goose-root.json"');
  if (depth > 8) throw variantError(`"extends" chain is too deep (cycle?) at "${spec.extends}"`);
  let base;
  try { base = await load(spec.extends, from); }
  catch (e) { throw variantError(`cannot load "${spec.extends}": ${e.message}`); }
  const resolvedBase = await resolveExtends(base, load, { from: spec.extends, depth: depth + 1 });
  return mergeVariant(resolvedBase, spec);
}

/**
 * Everything a raw spec needs before validate/compile: resolve "extends", then expand "figure".
 *   loadRef(ref, from)  → spec JSON for an "extends" reference
 *   loadFigure(name)    → figure JSON (figures/<name>.json)
 *   warn(path, message) ← notes from motion generation
 */
export async function resolveSpec(spec, { loadRef, loadFigure, warn } = {}) {
  const merged = await resolveExtends(spec, loadRef ?? (() => { throw new Error('no loader for "extends"'); }));
  return resolveFigure(merged, loadFigure ?? (() => { throw new Error('no loader for figures'); }), { warn });
}
