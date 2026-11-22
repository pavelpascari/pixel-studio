// CHANGELOG.md (the repository's, read at build time) as data for /changelog/ and its RSS feed.
//
// It reads the subset of Markdown the changelog is written in (see CONTRIBUTING.md, "Changelog entries"):
//   ## [version] - YYYY-MM-DD      a release (`## [Unreleased]` for what is coming)
//   ### Upgrading | Added | …      a Keep a Changelog section
//   - **Runtime:** text            an entry, starting with the part it concerns; continuation lines are indented,
//     - nested item                and a nested list is indented by two spaces
//   a paragraph                    (under a release heading: its summary)
// Inline: `code`, **bold**, *emphasis*, [text](url). Anything else is shown as text, never as HTML.
// Links to https://pixel-studio.sh/ become site paths (so previews stay on their origin); relative links point
// at the file in the repository, as on GitHub.

/** The parts an entry can concern, in the order the page's legend shows them. */
export const PARTS = ['Runtime', 'Engine', 'CLI', 'Examples', 'Packages', 'Studio', 'Docs', 'Website'];

const SITE = 'https://pixel-studio.sh';
const REPO_FILES = 'https://github.com/pavelpascari/pixel-studio/blob/main/';

/** @param {string} s */
export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} url @param {{absolute?: boolean}} [o] */
function href(url, o = {}) {
  if (url.startsWith(SITE + '/') || url === SITE) return o.absolute ? url : url.slice(SITE.length) || '/';
  if (/^(https?:|mailto:|#)/.test(url)) return url;
  if (url.startsWith('/')) return o.absolute ? SITE + url : url;
  return REPO_FILES + url.replace(/^\.\//, '');
}

/**
 * Inline Markdown to HTML. Code spans are cut out first so `**` or `[` inside them stay literal.
 * @param {string} text @param {{absolute?: boolean}} [o] absolute: site links keep https://pixel-studio.sh (feeds)
 */
export function inline(text, o = {}) {
  const codes = /** @type {string[]} */ ([]);
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = escapeHtml(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${escapeHtml(href(u.replace(/&amp;/g, '&'), o))}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

/**
 * @typedef {{ part?: string, html: string, children: Item[] }} Item
 * @typedef {{ title: string, items: Item[] }} Section
 * @typedef {{ version: string, date?: string, id: string, unreleased: boolean, prerelease: boolean,
 *   summary: string[], sections: Section[] }} Release
 */

/** `**Runtime:** text` → the part and the rest; parts not in PARTS stay in the text. @param {string} text */
function splitPart(text) {
  const m = /^\*\*([A-Z][A-Za-z]*):\*\*\s+/.exec(text);
  return m && PARTS.includes(m[1]) ? { part: m[1], rest: text.slice(m[0].length) } : { rest: text };
}

/**
 * The releases in CHANGELOG.md, newest first (the file's order). Text before the first release is skipped: the
 * page has its own introduction.
 * @param {string} markdown @param {{absolute?: boolean}} [o]
 * @returns {Release[]}
 */
export function parseChangelog(markdown, o = {}) {
  /** @type {Release[]} */
  const releases = [];
  /** @type {Release | undefined} */
  let release;
  /** @type {Section | undefined} */
  let section;
  // The entry being read: its raw lines, and the top-level item it belongs to when it is a nested one.
  /** @type {{ lines: string[], nested: boolean } | undefined} */
  let entry;
  /** @type {Item | undefined} */
  let parent;
  /** @type {string[]} */
  let para = [];

  const flushPara = () => {
    if (para.length && release) {
      if (section) section.items.push({ html: inline(para.join(' '), o), children: [] });
      else release.summary.push(inline(para.join(' '), o));
    }
    para = [];
  };
  const flushEntry = () => {
    if (!entry || !section) return (entry = undefined);
    const { part, rest } = splitPart(entry.lines.join(' '));
    // Every entry says which part it concerns (CONTRIBUTING.md, "Changelog entries"): the build fails otherwise, so
    // an entry written the old way is caught in the pull request rather than shown unlabelled.
    if (!entry.nested && !part)
      throw new Error(`CHANGELOG.md, ${release?.version} › ${section.title}: an entry must start with one of ${PARTS.map((p) => `**${p}:**`).join(', ')}: "${entry.lines[0]}"`);
    /** @type {Item} */
    const item = { part, html: inline(rest, o), children: [] };
    if (entry.nested && parent) parent.children.push(item);
    else {
      section.items.push(item);
      parent = item;
    }
    entry = undefined;
  };

  for (const line of markdown.split(/\r?\n/)) {
    const h2 = /^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/.exec(line);
    if (h2) {
      flushEntry();
      flushPara();
      const unreleased = h2[1].toLowerCase() === 'unreleased';
      release = {
        version: h2[1],
        date: h2[2],
        id: unreleased ? 'unreleased' : h2[1],
        unreleased,
        prerelease: h2[1].includes('-'),
        summary: [],
        sections: [],
      };
      releases.push(release);
      section = undefined;
      continue;
    }
    if (/^## /.test(line)) throw new Error(`CHANGELOG.md: a release heading must be "## [version] - YYYY-MM-DD": ${line}`);
    if (!release) continue;
    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      flushEntry();
      flushPara();
      section = { title: h3[1].trim(), items: [] };
      release.sections.push(section);
      continue;
    }
    const item = /^( {0,2})- (.*)$/.exec(line);
    if (item && section) {
      flushEntry();
      flushPara();
      entry = { lines: [item[2]], nested: item[1].length === 2 };
      continue;
    }
    if (!line.trim()) {
      flushEntry();
      flushPara();
      continue;
    }
    if (entry && /^\s+\S/.test(line)) entry.lines.push(line.trim());
    else {
      flushEntry();
      para.push(line.trim());
    }
  }
  flushEntry();
  flushPara();
  return releases;
}

/**
 * A release as one HTML fragment, for a feed reader: its summary and sections, with each entry's part in bold.
 * @param {Release} r
 */
export function releaseHtml(r) {
  /** @param {Item[]} items @returns {string} */
  const list = (items) =>
    `<ul>${items
      .map((i) => `<li>${i.part ? `<strong>${i.part}:</strong> ` : ''}${i.html}${i.children.length ? list(i.children) : ''}</li>`)
      .join('')}</ul>`;
  return [
    ...r.summary.map((p) => `<p>${p}</p>`),
    ...r.sections.map((s) => `<h3>${escapeHtml(s.title)}</h3>${list(s.items)}`),
  ].join('');
}

/** @param {string} html */
const plain = (html) =>
  html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * A line or two about a release, for a feed item's description (readers that do not show the full content): its
 * summary paragraph, else its first entry, cut at a word near 240 characters.
 * @param {Release} r
 */
export function releaseSummary(r) {
  const first = r.sections[0]?.items[0];
  const text = r.summary[0] ? plain(r.summary[0]) : first ? `${first.part ? `${first.part}: ` : ''}${plain(first.html)}` : '';
  if (text.length <= 240) return text;
  return text.slice(0, text.lastIndexOf(' ', 240)).replace(/[,;:.]$/, '') + ' …';
}
