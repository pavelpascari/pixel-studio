import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkAll, checkSources, checkLog, checkMeasurement, credits } from '../scripts/references.mjs';

test('references: every source is cited and every logged value matches', () => {
  assert.deepEqual(checkAll(), []);
});

test('references: CREDITS.md is up to date with sources.json', () => {
  assert.equal(readFileSync(new URL('../references/CREDITS.md', import.meta.url), 'utf8'), credits());
});

const pd = { kind: 'photo-sequence', title: 't', creator: 'c', year: 1887, url: 'u', licence: 'public-domain', rights: 'r', attribution: null, plate: 1, frames: '1-12' };
const paper = { kind: 'paper', title: 't', creator: 'c', year: 2008, url: 'u', licence: 'facts-only', rights: 'r', attribution: null };

test('references: the registry check catches bad licences and attribution', () => {
  assert.deepEqual(checkSources({ ok: pd }), []);
  assert.match(checkSources({ x: { ...pd, licence: 'CC-BY-NC-4.0' } })[0], /fails the no-strings rule/);
  assert.match(checkSources({ x: { ...pd, licence: 'CC-BY-4.0' } })[0], /attribution/);
  assert.match(checkSources({ x: { ...pd, plate: undefined } })[0], /photo sequence needs/);
  assert.match(checkSources({ x: { ...pd, rights: '' } })[0], /missing "rights"/);
});

test('references: a log catches drifted values, unknown sources and frames from facts-only sources', () => {
  const sources = { plate: pd, paper };
  const real = JSON.parse(readFileSync(new URL('../figures/dog.json', import.meta.url), 'utf8')).motions.trot.duty;
  const entry = { param: 'motions.trot.duty', value: real, source: 'paper', location: 'Table 1', method: 'read', by: 'test', date: '2026-11-09' };
  assert.deepEqual(checkLog({ figure: 'dog', params: [entry] }, 'dog.json', sources), []);
  assert.match(checkLog({ figure: 'dog', params: [{ ...entry, value: real + 1 }] }, 'dog.json', sources)[0], /now/);
  assert.match(checkLog({ figure: 'dog', params: [{ ...entry, source: 'nope' }] }, 'dog.json', sources)[0], /not in sources/);
  assert.match(checkLog({ figure: 'dog', params: [{ ...entry, param: 'motions.trot.nope' }] }, 'dog.json', sources)[0], /no such value/);
  const frame = { frame: 0, source: 'plate', sourceFrame: 1, method: 'points', by: 'test', date: '2026-11-09' };
  assert.deepEqual(checkLog({ figure: 'dog', frames: { trot: [frame] } }, 'dog.json', sources), []);
  assert.match(checkLog({ figure: 'dog', frames: { trot: [{ ...frame, source: 'paper' }] } }, 'dog.json', sources)[0], /facts-only/);
  assert.match(checkLog({ figure: 'dog', frames: { trot: [{ ...frame, frame: 99 }] } }, 'dog.json', sources)[0], /outside/);
  assert.match(checkLog({ figure: 'dog', frames: { canter: [frame] } }, 'dog.json', sources)[0], /no such animation/);
});

test('references: a measurement file must cite a registered, usable source and say who, when and how', () => {
  const sources = { plate: pd, paper };
  const m = { source: 'plate', by: 'test', date: '2026-11-09', method: 'points on the scan', frames: [{ sourceFrame: 1 }] };
  assert.deepEqual(checkMeasurement(m, 'm.json', sources), []);
  assert.match(checkMeasurement({ ...m, source: 'nope' }, 'm.json', sources)[0], /not in sources/);
  assert.match(checkMeasurement({ ...m, source: 'paper' }, 'm.json', sources)[0], /facts-only/);
  assert.match(checkMeasurement({ ...m, by: '' }, 'm.json', sources)[0], /missing "by"/);
  assert.match(checkMeasurement({ ...m, frames: [{}] }, 'm.json', sources)[0], /sourceFrame/);
});
