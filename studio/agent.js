// Agent tab: Claude authors the spec, the studio renders it, Claude looks at the render and revises.
//
// Loop:  describe → [Claude writes JSON] → validate ──errors──▶ [Claude fixes] ─┐
//                                              │ ok                              │
//                                              ▼                                 │
//                                   render contact sheet (16/32/64 × anims)      │
//                                              ▼                                 │
//                              [Claude critiques the image, revises JSON] ◀──────┘
//
// The SDK is loaded lazily from a CDN so the rest of the studio works offline.

// Pinned: the key is handed to this code, so never load a moving target.
const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@1.6.0';
const KEY_STORAGE = 'pixel-studio:anthropic-key';
const MAX_FIX_ATTEMPTS = 2;

let client = null;
let clientKey = null;
let history = []; // append-only conversation for the current character

async function getClient(apiKey) {
  if (client && clientKey === apiKey) return client;
  const { default: Anthropic } = await import(SDK_URL);
  // The key is the user's own and stays in their browser; requests go straight to the API.
  client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  clientKey = apiKey;
  return client;
}

/** Pull the JSON spec out of a reply: prefer a ```json fence, else the outermost {...}. */
export function extractSpec(text) {
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  let m, last = null;
  while ((m = fence.exec(text))) last = m[1];
  const candidate = last ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

const SYSTEM_SUFFIX = `

---
You are working inside Pixel Studio. When you produce or revise a character, reply with
(1) at most 5 short bullet points of reasoning/critique, then (2) the complete spec in a single
\`\`\`json fenced block. Always return the full spec, never a diff. Make characters original.`;

export function initAgent({ brief, getSpecText, setSpecText, validate, renderPreviewPNG, hasRender }) {
  const $ = (s) => document.querySelector(s);
  const keyInput = $('#api-key');
  keyInput.value = localStorage.getItem(KEY_STORAGE) || '';
  keyInput.addEventListener('change', () => localStorage.setItem(KEY_STORAGE, keyInput.value.trim()));

  const log = (text, cls = '', img = null) => {
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = text;
    if (img) { const im = new Image(); im.src = img; li.append(im); }
    $('#agent-log').prepend(li);
    return li;
  };
  const busy = (on) => { for (const id of ['#btn-generate', '#btn-refine']) $(id).disabled = on; };

  async function ask(content) {
    const apiKey = keyInput.value.trim();
    if (!apiKey) throw new Error('Add an Anthropic API key first.');
    const anthropic = await getClient(apiKey);
    history.push({ role: 'user', content });
    const stream = anthropic.beta.messages.stream({
      model: $('#model').value,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // If a safety classifier declines, let the API route to a fallback model automatically.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: brief + SYSTEM_SUFFIX,
      messages: history,
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') {
      history.pop();
      throw new Error(`Claude declined (${msg.stop_details?.category ?? 'refusal'}). Try rephrasing the character.`);
    }
    history.push({ role: 'assistant', content: msg.content }); // keep full content (thinking blocks included)
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (msg.stop_reason === 'max_tokens') throw new Error('Reply was cut off (max_tokens). Ask for a simpler character.');
    return text;
  }

  /** Ask, extract, validate; feed validation errors back until the spec is valid. */
  async function askForSpec(content) {
    let text = await ask(content);
    for (let attempt = 0; ; attempt++) {
      const notes = text.split('```')[0].trim();
      if (notes) log(notes);
      let spec, problems;
      try {
        spec = extractSpec(text);
        const { errors } = validate(spec);
        problems = errors.map((e) => `${e.path}: ${e.message}`);
      } catch (e) {
        problems = [`Could not parse JSON: ${e.message}`];
      }
      if (!problems.length) {
        setSpecText(JSON.stringify(spec, null, 2));
        log('✓ spec is valid and rendered', 'ok');
        return spec;
      }
      if (attempt >= MAX_FIX_ATTEMPTS) throw new Error('Still invalid after fixes:\n' + problems.join('\n'));
      log(`validation failed, asking Claude to fix:\n${problems.join('\n')}`, 'err');
      text = await ask([{ type: 'text', text: `The spec failed validation:\n${problems.join('\n')}\nReturn the corrected full spec.` }]);
    }
  }

  async function lookAndRefine() {
    const png = renderPreviewPNG();
    log('render sent to Claude for review (rows: animations, blocks: 16/32/64 px)', '', png);
    await askForSpec([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.split(',')[1] } },
      { type: 'text', text:
        `This is the current render of your spec: three blocks top→bottom at 16px (icon), 32px (sprite) and 64px (portrait); ` +
        `in each block one row per animation (in spec order), one column per frame.\n` +
        // Always send the editor's spec: the human may have edited it since Claude's last version.
        `Current spec:\n\`\`\`json\n${getSpecText()}\n\`\`\`\n` +
        `Critique it like a pixel artist: silhouette readability at 16px, proportions, colour contrast between neighbouring parts, ` +
        `anything clipped or floating, and whether each animation reads. Then return an improved full spec.` },
    ]);
  }

  $('#btn-generate').onclick = async () => {
    busy(true);
    history = [];
    const prompt = $('#prompt').value.trim();
    const pending = log(`→ ${prompt}`);
    try {
      await askForSpec([{ type: 'text', text: `Design this character: ${prompt}` }]);
      const rounds = Number($('#rounds').value) || 0;
      for (let i = 0; i < rounds; i++) await lookAndRefine();
    } catch (e) {
      log(String(e.message || e), 'err');
    } finally {
      pending.classList.add('ok');
      busy(false);
    }
  };

  $('#btn-refine').onclick = async () => {
    if (!hasRender()) return log('Nothing rendered yet.', 'err');
    busy(true);
    try {
      const rounds = Number($('#rounds').value) || 1;
      for (let i = 0; i < rounds; i++) await lookAndRefine();
    } catch (e) {
      log(String(e.message || e), 'err');
    } finally {
      busy(false);
    }
  };
}
