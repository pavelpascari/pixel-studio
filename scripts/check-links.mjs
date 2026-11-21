#!/usr/bin/env node
// Every relative link in the repository's Markdown points at a file that exists (outside code blocks).
// Links to the website (/...) and anchors are not checked.   node scripts/check-links.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.startsWith('website/'));
let broken = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, url] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#|\/)/.test(url)) continue;
    const target = path.join(root, path.dirname(f), decodeURI(url.split('#')[0]));
    if (!fs.existsSync(target)) {
      console.error(`${f}: ${url}`);
      broken++;
    }
  }
}
console.log(`check-links: ${files.length} files, ${broken} broken link(s).`);
if (broken) process.exit(1);
