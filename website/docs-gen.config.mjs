// Generated blocks in markdown docs: `npm run docs:gen` fills them, `npm run docs:check` fails when one is stale.
// Block syntax: `<!-- gen:name key=value -->` … `<!-- /gen -->`. Paths here are relative to this file (the project root).
import fs from 'node:fs';
import path from 'node:path';

export default {
  // Folders (every .md/.mdx inside), single files, or globs like 'docs/**/*.md'.
  files: ['../docs'],

  generators: {
    /**
     * `<!-- gen:exports from=path/to/module.js -->`: a table of the module's exports with the first line of each
     * one's JSDoc comment. Regex-based on purpose: good for plain ESM sources, no parser dependency.
     */
    async exports({ args, root }) {
      if (!args.from) throw new Error('gen:exports needs from=<module path>');
      const source = fs.readFileSync(path.resolve(root, args.from), 'utf8');
      const rows = [];
      for (const m of source.matchAll(/(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?export\s+(?:async\s+)?(function\*?|const|let|class)\s+([\w$]+)/g)) {
        const doc = (m[1] ?? '').replace(/^\s*\*\s?/gm, '').trim().split('\n')[0];
        const kind = m[2].startsWith('function') ? 'function' : m[2];
        rows.push({ name: m[3], line: `| \`${m[3]}\` | ${kind} | ${doc.replace(/\|/g, '\\|')} |` });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return ['| Export | Kind | Description |', '|---|---|---|', ...rows.map((r) => r.line)].join('\n');
    },
  },
};
