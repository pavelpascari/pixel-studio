// Every CLI command once, on a tiny fixture: exit codes, the files written and the lines an agent reads back.
// (`bundle` and `import` have their own tests; this covers the rest and the shared flag handling.)
import { suite, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/pixel.mjs', import.meta.url));
const TINY = fileURLToPath(new URL('./fixtures/tiny-views.json', import.meta.url));
const PLUGIN = fileURLToPath(new URL('../examples/plugins/extras.mjs', import.meta.url));
const SPEC_MD = fileURLToPath(new URL('../docs/SPEC.md', import.meta.url));
const FIGURES = fileURLToPath(new URL('../figures', import.meta.url));

let dir;
const at = (f) => join(dir, f);

/** Run the CLI; resolves with { status, stdout, stderr } whatever the exit code. */
function pixel(args, { cwd = dir, env } = {}) {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, PIXEL_DEBUG: '', ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', failed);
    child.on('close', (status) => done({ status, stdout, stderr }));
  });
}
const ok = async (args, opts) => {
  const r = await pixel(args, opts);
  assert.equal(r.status, 0, `pixel ${args.join(' ')} failed:\n${r.stderr}`);
  return r;
};
/** Exits with 1 and stderr is exactly the expected error line(s). */
const fails = async (args, line) => {
  const r = await pixel(args);
  assert.equal(r.status, 1, `pixel ${args.join(' ')} should fail`);
  assert.match(r.stderr, line);
  return r;
};
/** Width and height from a PNG's IHDR chunk (and a check that it is a PNG at all). */
function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const TINY_ANIMS = 'idle, hop, travel, fall, peek, idle@front, hop@front, turn@front, unturn@front, travel>idle';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'pixel-cli-'));
  // A variant of the fixture with a skin whose name is not file-name safe, and specs that must fail.
  writeFileSync(at('skinned.json'), JSON.stringify({
    extends: TINY, name: 'skinned', skins: { 'red team': { materials: { goo: { color: '#d03030' } } } },
  }));
  writeFileSync(at('invalid.json'), JSON.stringify({ name: 'bad', parts: [{ id: 'a', shapes: [{ type: 'blob' }] }], animations: {} }));
  writeFileSync(at('broken.json'), '{nope');
  writeFileSync(at('not-a-plugin.mjs'), 'export default 5;\n');
});
after(() => rmSync(dir, { recursive: true, force: true }));

suite('pixel CLI', { concurrency: 8 }, () => {
  // ---------- validate ----------

  test('validate: one "ok" line naming the parts, materials and every animation with frames and fps', async () => {
    const r = await ok(['validate', TINY]);
    assert.equal(r.stdout, `ok: "tiny" 6 parts, 2 materials, animations: idle(12f@8fps) hop(12f@12fps) travel(12f@12fps) fall(6f@10fps) peek(12f@8fps) idle@front(12f@8fps) hop@front(12f@12fps) turn@front(4f@12fps) unturn@front(4f@12fps) travel>idle(2f@8fps)\n`);
  });

  test('validate: every error with its JSON path on stdout, exit 1', async () => {
    const r = await pixel(['validate', at('invalid.json')]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^error {3}\$\.materials: materials must be a non-empty object/m);
    assert.match(r.stdout, /^error {3}\$\.parts\[0\]\.shapes\[0\]\.type: unknown shape type "blob" \(one of rect, ellipse, circle, capsule, polygon\)$/m);
    assert.doesNotMatch(r.stdout, /^ok:/m);
  });

  test('validate: a bare figure name checks that figure\'s skeleton', async () => {
    assert.match((await ok(['validate', 'blob'])).stdout, /^ok: ".*" \d+ parts, .*animations: idle\(/);
  });

  test('a missing, unreadable or broken file is one error line', async () => {
    await fails(['validate'], /^error: missing <spec\.json>\n$/);
    await fails(['validate', at('nope.json')], /^error: cannot read .*nope\.json: ENOENT/);
    await fails(['validate', at('broken.json')], /^error: .*broken\.json is not valid JSON: /);
  });

  // ---------- preview ----------

  test('preview: a contact sheet PNG of the size it reports, one block per resolution', async () => {
    const out = at('preview/tiny.png');
    const r = await ok(['preview', TINY, '--res', '16,24', '--anim', 'idle, hop', '--out', out]);
    const [w, h] = pngSize(out);
    assert.equal(r.stdout, `wrote ${out} (${w}x${h})\nblocks top→bottom: 16px [icon], 24px [sprite]\nrows per block: idle, hop\n`);
    // Every row is a cell tall (128 px by default) and all of them stack: two blocks of two rows, more for --cell 256.
    const big = at('preview/big.png');
    await ok(['preview', TINY, '--res', '16,24', '--anim', 'idle,hop', '--cell', '256', '--out', big]);
    assert.ok(pngSize(big)[1] > h * 1.8, 'a bigger --cell makes bigger cells');
  });

  test('preview: without --out it writes <spec name>.preview.png in the working directory, every animation', async () => {
    const cwd = mkdtempSync(join(dir, 'cwd-'));
    const r = await ok(['preview', TINY, '--res', '8'], { cwd });
    assert.match(r.stdout, /^wrote tiny-views\.preview\.png \(\d+x\d+\)\n/);
    assert.match(r.stdout, new RegExp(`rows per block: ${TINY_ANIMS.replace(/[>@]/g, '\\$&')}\n$`));
    assert.deepEqual(readdirSync(cwd), ['tiny-views.preview.png']);
  });

  // ---------- ascii ----------

  test('ascii: a frame as res×res characters with a legend', async () => {
    const r = await ok(['ascii', TINY, '--res', '12', '--anim', 'hop', '--frame', '3']);
    const [head, ...grid] = r.stdout.trimEnd().split('\n');
    assert.equal(head, 'hop frame 3 @12px  legend: g=goo e=eye #=outline .=empty');
    assert.equal(grid.length, 12);
    for (const row of grid) assert.match(row, /^[ge#.]{12}$/);
    assert.ok(grid.join('').includes('g') && grid.join('').includes('#'), 'the body and its outline are drawn');
  });

  test('ascii: --frame counts from the end when negative, wraps past the end, and "all" prints every frame', async () => {
    assert.match((await ok(['ascii', TINY, '--res', '8', '--anim', 'hop', '--frame', '-1'])).stdout, /^hop frame 11 @8px/);
    assert.match((await ok(['ascii', TINY, '--res', '8', '--anim', 'fall', '--frame', '7'])).stdout, /^fall frame 1 @8px/);
    const all = (await ok(['ascii', TINY, '--res', '8', '--anim', 'fall', '--frame', 'all'])).stdout;
    assert.deepEqual(all.match(/^fall frame \d+/gm), [0, 1, 2, 3, 4, 5].map((f) => `fall frame ${f}`));
  });

  test('ascii: the first animation and 24 px by default; a bare figure name works', async () => {
    const r = await ok(['ascii', TINY]);
    assert.match(r.stdout, /^idle frame 0 @24px /);
    assert.equal(r.stdout.trimEnd().split('\n').length, 25);
    assert.match((await ok(['ascii', 'blob', '--res', '8'])).stdout, /^idle frame 0 @8px /);
  });

  test('ascii: style flags change the drawing', async () => {
    const plain = (await ok(['ascii', TINY, '--res', '16'])).stdout;
    const bare = (await ok(['ascii', TINY, '--res', '16', '--outline', 'none'])).stdout;
    assert.ok(plain.split('\n').slice(1).join('').includes('#'));
    assert.ok(!bare.split('\n').slice(1).join('').includes('#'), '--outline none draws no outline');
    const flipped = (await ok(['ascii', TINY, '--res', '16', '--anim', 'hop', '--frame', '2', '--flip'])).stdout;
    const unflipped = (await ok(['ascii', TINY, '--res', '16', '--anim', 'hop', '--frame', '2'])).stdout;
    const rows = (s) => s.trimEnd().split('\n').slice(1);
    assert.deepEqual(rows(flipped), rows(unflipped).map((l) => [...l].reverse().join('')), '--flip mirrors the frame');
  });

  // What a user sees, not the EPIPE branch in crash(): console.log already ignores a closed pipe.
  test('a closed pipe is not an error (pixel ascii … | head)', async () => {
    const r = await new Promise((done) => {
      const child = spawn(process.execPath, [BIN, 'ascii', TINY, '--res', '128', '--frame', 'all']);
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      child.stdout.once('data', () => child.stdout.destroy());
      child.on('close', (status) => done({ status, stderr }));
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  });

  // ---------- render ----------

  test('render: a sheet PNG and its JSON, named <spec name>.<res>', async () => {
    const out = at('render');
    const r = await ok(['render', TINY, '--res', '16', '--out', out]);
    const [w, h] = pngSize(join(out, 'tiny-views.16.png'));
    assert.equal(r.stdout, `wrote ${join(out, 'tiny-views.16')}.png (${w}x${h}) + .json\n`);
    const meta = JSON.parse(readFileSync(join(out, 'tiny-views.16.json'), 'utf8'));
    assert.equal(meta.name, 'tiny');
    assert.equal(meta.image, 'tiny-views.16.png');
    assert.equal(w, meta.frameW * Math.max(...Object.values(meta.animations).map((a) => a.frames)));
    assert.equal(h, meta.frameH * Object.keys(meta.animations).length);
  });

  test('render: --res is one whole number in range', async () => {
    await fails(['render', TINY, '--res', '16,32', '--out', at('x')], /^error: --res takes one resolution here \(got "16,32"\); use bundle or preview for several\n$/);
    await fails(['render', TINY, '--res', '0'], /^error: --res must be whole numbers 1\.\.512, e\.g\. 16,32,64 \(got "0"\)\n$/);
    await fails(['render', TINY, '--res', '9999'], /--res must be whole numbers 1\.\.512/);
    await fails(['render', TINY, '--res', '1.5'], /--res must be whole numbers/);
  });

  test('style flags: a number where one is needed, and --outline with a value', async () => {
    await fails(['render', TINY, '--tones', 'abc'], /^error: --tones must be a number \(got "abc"\)\n$/);
    await fails(['render', TINY, '--light'], /^error: --light must be a number \(got ""\)\n$/);
    await fails(['render', TINY, '--outline'], /^error: --outline needs a value: dark, selective or none\n$/);
  });

  // ---------- export ----------

  test('export: an Aseprite sheet whose JSON names its PNG, with the frame, tag and slice counts it reports', async () => {
    const out = at('export');
    const r = await ok(['export', TINY, '--res', '16', '--out', out]);
    const json = JSON.parse(readFileSync(join(out, 'tiny-views.16.json'), 'utf8'));
    const [w, h] = pngSize(join(out, 'tiny-views.16.png'));
    assert.equal(r.stdout, `wrote ${join(out, 'tiny-views.16')}.png (${w}x${h}) + .json (${Object.keys(json.frames).length} frames, ${json.meta.frameTags.length} tags, ${json.meta.slices.length} slices)\n`);
    assert.equal(json.meta.image, 'tiny-views.16.png');
    assert.deepEqual(json.meta.size, { w, h });
    assert.equal(json.meta.frameTags.length, 10, 'one tag per animation');
  });

  test('export --skin: the skin goes into the file names as a safe slug', async () => {
    const out = at('export-skin');
    await ok(['export', at('skinned.json'), '--res', '10', '--skin', 'red team', '--out', out]);
    assert.deepEqual(readdirSync(out).sort(), ['skinned.red_team.10.json', 'skinned.red_team.10.png']);
    assert.equal(JSON.parse(readFileSync(join(out, 'skinned.red_team.10.json'), 'utf8')).meta.image, 'skinned.red_team.10.png');
  });

  test('export --skin: a skin name with ../ in it stays inside --out', async () => {
    const box = mkdtempSync(join(dir, 'box-'));
    writeFileSync(join(box, 'e.json'), JSON.stringify({ extends: TINY, name: 'e', skins: { '/../../escaped': { materials: { goo: { color: '#000000' } } } } }));
    await ok(['export', join(box, 'e.json'), '--res', '8', '--skin', '/../../escaped', '--out', join(box, 'out')]);
    assert.deepEqual(readdirSync(box).sort(), ['e.json', 'out'], 'nothing written beside --out');
    assert.deepEqual(readdirSync(join(box, 'out')).sort(), ['e._escaped.8.json', 'e._escaped.8.png']);
  });

  test('export: aseprite is the only format', async () => {
    await fails(['export', TINY, '--format', 'gif', '--out', at('gif')], /^error {3}--format: only "aseprite" \(also read by Phaser and PixiJS\)\n$/);
    assert.ok(!existsSync(at('gif')), 'nothing written');
  });

  // ---------- --skin ----------

  test('--skin draws that skin; an unknown one lists the skins there are', async () => {
    const plain = (await ok(['render', at('skinned.json'), '--res', '10', '--out', at('skin-a')])).stdout;
    await ok(['render', at('skinned.json'), '--res', '10', '--skin', 'red team', '--out', at('skin-b')]);
    assert.match(plain, /skinned\.10\.png/);
    assert.notDeepEqual(readFileSync(join(at('skin-a'), 'skinned.10.png')), readFileSync(join(at('skin-b'), 'skinned.10.png')), 'the skin recolours the sheet');
    await fails(['ascii', at('skinned.json'), '--skin', 'blue'], /^error {3}unknown skin "blue" \(skins: red team\)\n$/);
    await fails(['ascii', TINY, '--skin', 'blue'], /^error {3}unknown skin "blue" \(skins: none\)\n$/);
  });

  // ---------- resolve ----------

  test('resolve: prints a variant merged with its base; --out writes it', async () => {
    const merged = JSON.parse((await ok(['resolve', at('skinned.json')])).stdout);
    assert.equal(merged.name, 'skinned');
    assert.equal(merged.extends, undefined, 'the extends chain is resolved away');
    assert.deepEqual(Object.keys(merged.materials), ['goo', 'eye'], 'from the base');
    assert.ok(merged.skins['red team']);
    const r = await ok(['resolve', at('skinned.json'), '--out', at('resolved.json')]);
    assert.equal(r.stdout, `wrote ${at('resolved.json')}\n`);
    assert.deepEqual(JSON.parse(readFileSync(at('resolved.json'), 'utf8')), merged);
  });

  test('resolve: a missing base is an error naming the variant', async () => {
    writeFileSync(at('orphan.json'), JSON.stringify({ extends: 'gone.json', name: 'orphan' }));
    await fails(['resolve', at('orphan.json')], /^error: .*orphan\.json: .*gone\.json/);
  });

  // ---------- where ----------

  test('where: every part\'s pivot in the pose, with hidden parts marked', async () => {
    const r = await ok(['where', TINY, '--anim', 'hop', '--frame', '1']);
    const [head, ...lines] = r.stdout.trimEnd().split('\n');
    assert.equal(head, 'hop frame 1 (canvas 100x100 units)');
    assert.deepEqual(lines.map((l) => l.split(' ')[0]), ['shadow', 'body', 'top', 'front.shadow', 'front.body', 'front.top']);
    for (const l of lines) assert.match(l, /pivot \[[\d.-]+,[\d.-]+\] → \[[\d.-]+,[\d.-]+\] {2}rot -?\d+\.\d°/);
    assert.ok(lines.filter((l) => l.endsWith('(hidden)')).length === 3, 'the front view\'s parts are hidden in a side animation');
    assert.ok(lines.find((l) => l.startsWith('top ')).includes('→ [49.6,61.2]'), 'the top moves during the hop');
  });

  test('where --part --point: one point on one part; an unknown part is an error', async () => {
    const r = await ok(['where', TINY, '--part', 'top', '--point', '50,42']);
    assert.match(r.stdout, /^idle frame 0 \(canvas 100x100 units\)\ntop \[50,42\] \(rest\) → \[[\d.-]+,[\d.-]+\] {2}rot -?\d+\.\d°\n$/);
    assert.match((await ok(['where', TINY, '--part', 'body'])).stdout, /^body \[50,92\] \(rest\)/m, 'the pivot when no --point');
    await fails(['where', TINY, '--part', 'tail'], /error: no part "tail"/);
  });

  test('an unknown --anim lists the animations there are', async () => {
    const line = new RegExp(`^error: no animation "quack" \\(have: ${TINY_ANIMS.replace(/[>@]/g, '\\$&')}\\)\n$`);
    await fails(['ascii', TINY, '--anim', 'quack'], line);
    await fails(['where', TINY, '--anim', 'quack'], line);
    await fails(['preview', TINY, '--anim', 'idle,quack', '--out', at('q.png')], line);
  });

  // ---------- figures, brief, help ----------

  test('figures: every figure in the library with its bones and motions', async () => {
    const r = await ok(['figures']);
    const names = readdirSync(FIGURES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    assert.deepEqual(r.stdout.match(/^\S+/gm), names);
    for (const n of names) {
      const f = JSON.parse(readFileSync(join(FIGURES, `${n}.json`), 'utf8'));
      assert.match(r.stdout, new RegExp(`^${n} +${f.bones.length} bones {3}motions: `, 'm'));
      assert.ok(r.stdout.includes(`bones: ${f.bones.map((b) => b.id).join(' ')}\n`), `${n}'s bones`);
    }
  });

  test('brief: the spec docs, plus the plug-ins when --plugin loads some', async () => {
    const spec = readFileSync(SPEC_MD, 'utf8');
    assert.equal((await ok(['brief'])).stdout, spec);
    const r = await ok(['brief', '--plugin', PLUGIN]);
    assert.ok(r.stdout.startsWith(spec));
    const extra = r.stdout.slice(spec.length);
    assert.match(extra, /^\n## Plug-ins loaded for this project\n\n/);
    assert.deepEqual(extra.match(/^- \w+ `\w+`/gm), ['- shape `star`', '- texture `feathers`', '- motion `float`']);
  });

  test('--plugin: a module that is missing or exports no setup function is one error line', async () => {
    await fails(['brief', '--plugin', at('not-a-plugin.mjs')], /^error: --plugin .*not-a-plugin\.mjs: a plug-in module must default-export a function setup\(/);
    await fails(['brief', '--plugin', at('missing.mjs')], /^error: --plugin .*missing\.mjs: Cannot find module/);
  });

  test('help: the usage text on stdout, exit 0; an unknown command prints it and exits 1', async () => {
    const help = await ok(['help']);
    assert.match(help.stdout, /^Pixel Studio CLI — the agent's hands and eyes\.\n/);
    for (const c of ['validate', 'preview', 'ascii', 'render', 'export', 'bundle', 'resolve', 'where', 'figures', 'brief', 'help']) {
      assert.match(help.stdout, new RegExp(`^ {2}pixel ${c}\\b`, 'm'), `help lists ${c}`);
    }
    assert.doesNotMatch(help.stdout, /^\/\//m, 'comment markers stripped');
    assert.equal((await ok([])).stdout, help.stdout);
    assert.equal((await ok(['--help'])).stdout, help.stdout);
    const bad = await pixel(['frobnicate']);
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, help.stdout);
  });

  test('a thrown error is one line; PIXEL_DEBUG=1 adds the stack', async () => {
    // A bundle path inside a file (not a directory) makes mkdir throw.
    writeFileSync(at('file'), '');
    const plain = await pixel(['preview', TINY, '--res', '8', '--out', at('file/x.png')]);
    assert.equal(plain.status, 1);
    assert.match(plain.stderr, /^error: .*\n$/);
    const debug = await pixel(['preview', TINY, '--res', '8', '--out', at('file/x.png')], { env: { PIXEL_DEBUG: '1' } });
    assert.equal(debug.status, 1);
    assert.match(debug.stderr, /^error: .*\n.*\n\s+at /);
  });
});
