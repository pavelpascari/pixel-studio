// Pixel Studio docs site: live examples next to their code, and spec playgrounds rendered by the engine
// in the browser. No dependencies, no build step.
//
//   <div class="demo" data-title="Hover and click">          live HTML example
//     <template> …markup and <script type="module"> … </template>
//   </div>
//
//   <div class="playground" data-anim="walk" data-res="48">   editable spec, rendered live
//     <script type="application/json"> { …spec… } </script>
//   </div>

import { validate, compile, renderFrame, resolveStyle, resolveSpec } from '../src/core/index.js';

const PAGES = [
  ['index.html', 'Overview'],
  ['sprite.html', 'Putting a sprite on a page'],
  ['events.html', 'Events, points and the foot line'],
  ['states.html', 'State machines and skins'],
  ['moving.html', 'Moving sprites'],
  ['stage.html', 'Characters on the page'],
  ['authoring.html', 'Writing a character'],
  ['motions.html', 'Figures and motions'],
  ['export.html', 'Bundles and game engines'],
];

// Paths in snippets point into the repo; readers see the file names they would use on their site.
const DISPLAY = [[/\.\.\/demo\/assets\//g, ''], [/\.\.\/src\/runtime\//g, '']];

// ---------- layout: sidebar and table of contents ----------

function layout() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = document.createElement('nav');
  nav.className = 'sidebar';
  nav.innerHTML = `<a class="brand" href="index.html">Pixel Studio</a><button class="menu" aria-expanded="false">Menu</button><ul></ul>`;
  const ul = nav.querySelector('ul');
  for (const [href, label] of PAGES) {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { href, textContent: label });
    if (href === here) a.setAttribute('aria-current', 'page');
    li.append(a);
    if (href === here) {
      const toc = document.createElement('ul');
      for (const h of document.querySelectorAll('main h2[id]')) {
        const sub = document.createElement('li');
        sub.append(Object.assign(document.createElement('a'), { href: `#${h.id}`, textContent: h.textContent }));
        toc.append(sub);
      }
      if (toc.children.length) li.append(toc);
    }
    ul.append(li);
  }
  const extra = document.createElement('li');
  extra.className = 'extra';
  extra.innerHTML = `<a href="../studio/">Studio</a> · <a href="../demo/">Demo site</a> · <a href="../docs/README.md">Reference docs</a>`;
  ul.append(extra);
  nav.querySelector('.menu').onclick = (e) => {
    const open = nav.classList.toggle('open');
    e.target.setAttribute('aria-expanded', String(open));
  };
  document.body.prepend(nav);
}

// ---------- syntax highlighting (small and forgiving) ----------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlightJS(src) {
  return esc(src).replace(/(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|await|async|function|return|if|else|for|of|new|import|from|export|true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g,
    (m, c, s, k, n) => (c ? `<span class="t-c">${c}</span>` : s ? `<span class="t-s">${s}</span>` : k ? `<span class="t-k">${k}</span>` : `<span class="t-n">${n}</span>`));
}

function highlightJSON(src) {
  return esc(src).replace(/("(?:[^"\\\n]|\\.)*")(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g,
    (m, s, colon, n, k) => (s ? (colon ? `<span class="t-a">${s}</span>${colon}` : `<span class="t-s">${s}</span>`) : n ? `<span class="t-n">${n}</span>` : `<span class="t-k">${k}</span>`));
}

function highlightHTML(src) {
  // Split out script bodies (highlighted as JS) from markup.
  return src.split(/(<script[^>]*>[\s\S]*?<\/script>)/g).map((part) => {
    const m = part.match(/^(<script[^>]*>)([\s\S]*?)(<\/script>)$/);
    if (m) return markup(m[1]) + (/json/.test(m[1]) ? highlightJSON(m[2]) : highlightJS(m[2])) + markup(m[3]);
    return markup(part);
  }).join('');
  function markup(s) {
    return esc(s).replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([\w-]+)([\s\S]*?)(\/?&gt;)/g, (m, c, open, tag, attrs, close) => {
      if (c) return `<span class="t-c">${c}</span>`;
      const a = attrs.replace(/([\w-]+)(=)("[^"]*")?/g, (x, n, eq, v) => `<span class="t-a">${n}</span>${eq}${v ? `<span class="t-s">${v}</span>` : ''}`);
      return `${open}<span class="t-t">${tag}</span>${a}${close}`;
    });
  }
}

function dedent(s) {
  const lines = s.replace(/^\n+|\s+$/g, '').split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
}

function codeBlock(source, lang) {
  const wrap = document.createElement('div');
  wrap.className = 'code';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.innerHTML = lang === 'json' ? highlightJSON(source) : lang === 'js' ? highlightJS(source) : highlightHTML(source);
  pre.append(code);
  const copy = Object.assign(document.createElement('button'), { className: 'copy', type: 'button', textContent: 'Copy' });
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(source); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select and copy'; }
    setTimeout(() => (copy.textContent = 'Copy'), 1400);
  };
  wrap.append(copy, pre);
  return wrap;
}

// ---------- live examples ----------

function demos() {
  for (const box of document.querySelectorAll('.demo')) {
    const tpl = box.querySelector('template');
    const preview = document.createElement('div');
    preview.className = 'preview';
    if (box.dataset.height) preview.style.minHeight = `${box.dataset.height}px`;
    preview.append(tpl.content.cloneNode(true));
    // Cloned scripts do not run: recreate them.
    for (const old of preview.querySelectorAll('script')) {
      if (old.type === 'application/json') continue;
      const s = document.createElement('script');
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    }
    let shown = dedent(tpl.innerHTML);
    for (const [re, to] of DISPLAY) shown = shown.replace(re, to);
    const head = document.createElement('div');
    head.className = 'demo-head';
    head.textContent = box.dataset.title || 'Example';
    box.append(head, preview, codeBlock(shown, box.dataset.lang));
  }
  for (const pre of document.querySelectorAll('pre.snippet')) {
    const block = codeBlock(dedent(pre.textContent), pre.dataset.lang);
    pre.replaceWith(block);
  }
}

// ---------- spec playgrounds: edit JSON, see it drawn by the engine ----------

const loadFigure = async (name) => {
  const r = await fetch(`../figures/${name}.json`);
  if (!r.ok) throw new Error(`figures/${name}.json: HTTP ${r.status}`);
  return r.json();
};
const loadRef = async (ref) => {
  const r = await fetch(`../examples/${ref}`);
  if (!r.ok) throw new Error(`examples/${ref}: HTTP ${r.status}`);
  return r.json();
};

function playgrounds() {
  for (const box of document.querySelectorAll('.playground')) {
    const src = dedent(box.querySelector('script[type="application/json"]').textContent);
    box.innerHTML = `
      <div class="demo-head">${esc(box.dataset.title || 'Playground')} <span class="hint">edit the spec, the drawing follows</span></div>
      <div class="pg">
        <div class="pg-view">
          <div class="stagebox"><canvas></canvas></div>
          <div class="pg-controls">
            <label>Animation <select class="anim"></select></label>
            <label>Size <select class="res">${[16, 24, 32, 48, 64].map((r) => `<option ${String(r) === (box.dataset.res || '48') ? 'selected' : ''}>${r}</option>`).join('')}</select> px</label>
          </div>
          <div class="pg-status" role="status"></div>
        </div>
        <div class="pg-edit"><textarea spellcheck="false" aria-label="Character spec (JSON)"></textarea></div>
      </div>`;
    const ta = box.querySelector('textarea'), canvas = box.querySelector('canvas'), status = box.querySelector('.pg-status');
    const animSel = box.querySelector('.anim'), resSel = box.querySelector('.res');
    ta.value = src;
    ta.rows = Math.min(28, src.split('\n').length + 1);
    const state = { compiled: null, frames: [], f: 0, acc: 0, anim: null, seq: 0, fps: 8 };

    async function rebuild() {
      const seq = ++state.seq;
      let spec;
      try { spec = JSON.parse(ta.value); } catch (e) { return show('err', `JSON: ${e.message}`); }
      const notes = [];
      try { spec = await resolveSpec(spec, { loadFigure, loadRef, warn: (p, m) => notes.push(`${p}: ${m}`) }); } catch (e) {
        return show('err', (e.errors ?? [{ path: '$', message: e.message }]).map((x) => `${x.path}: ${x.message}`).join('\n'));
      }
      if (seq !== state.seq) return;
      const { errors, warnings } = validate(spec);
      if (errors.length) return show('err', errors.map((x) => `${x.path}: ${x.message}`).join('\n'));
      state.compiled = compile(spec);
      const names = Object.keys(state.compiled.animations);
      const want = animSel.value || box.dataset.anim;
      animSel.innerHTML = names.map((n) => `<option ${n === want ? 'selected' : ''}>${esc(n)}</option>`).join('');
      show(warnings.length || notes.length ? 'warn' : 'ok', [...notes, ...warnings.map((x) => `${x.path}: ${x.message}`)].join('\n') || `ok: ${names.length} animation${names.length > 1 ? 's' : ''}`);
      frames();
    }
    function frames() {
      const c = state.compiled;
      if (!c) return;
      const res = Number(resSel.value), anim = c.animations[animSel.value] ?? Object.values(c.animations)[0];
      const style = resolveStyle(c, res);
      state.frames = Array.from({ length: anim.frames }, (_, f) => {
        const fr = renderFrame(c, { res, anim, frame: f, style });
        return new ImageData(new Uint8ClampedArray(fr.rgba), fr.w, fr.h);
      });
      state.fps = anim.fps; state.f = 0;
      const k = Math.max(1, Math.floor(160 / state.frames[0].height));
      canvas.width = state.frames[0].width; canvas.height = state.frames[0].height;
      canvas.style.width = `${canvas.width * k}px`; canvas.style.height = `${canvas.height * k}px`;
      draw();
    }
    function draw() { if (state.frames.length) canvas.getContext('2d').putImageData(state.frames[state.f], 0, 0); }
    function show(cls, text) { status.className = `pg-status ${cls}`; status.textContent = text; }

    let timer = 0;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(rebuild, 350); });
    animSel.onchange = frames; resSel.onchange = frames;
    let last = 0;
    const loop = (t) => {
      if (state.frames.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        state.acc += last ? Math.min(100, t - last) : 0;
        const step = 1000 / state.fps;
        while (state.acc >= step) { state.acc -= step; state.f = (state.f + 1) % state.frames.length; draw(); }
      }
      last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    rebuild();
  }
}

layout();
demos();
playgrounds();
