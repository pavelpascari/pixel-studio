// Text rendering of a frame, for agents without image input.
// Each material gets a letter (first free letter of its name); outline = '#', empty = '.'.

export function frameToAscii(frame) {
  const used = new Set(['#', '.']);
  const legend = frame.materials.map((name) => {
    let ch = [...name.toLowerCase(), ...'abcdefghijklmnopqrstuvwxyz0123456789'].find((c) => /[a-z0-9]/.test(c) && !used.has(c));
    used.add(ch);
    return [name, ch];
  });
  const sym = legend.map(([, c]) => c);
  const lines = [];
  for (let y = 0; y < frame.h; y++) {
    let s = '';
    for (let x = 0; x < frame.w; x++) {
      const id = frame.ids[y * frame.w + x];
      s += id === -1 ? '.' : id === -2 ? '#' : sym[id];
    }
    lines.push(s);
  }
  return { text: lines.join('\n'), legend: Object.fromEntries(legend) };
}
