// /changelog/rss.xml: one item per npm release and per site update in CHANGELOG.md, newest first, each linking to its
// anchor on /changelog/ and carrying the whole entry as HTML. Not Unreleased: a feed item is an announcement, and
// those notes are still changing until the release.
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseChangelog, releaseHtml, releaseSummary } from '../../lib/changelog.mjs';

const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const GET: APIRoute = (context) => {
  const site = (context.site?.href ?? 'https://pixel-studio.sh/').replace(/\/+$/, '');
  const markdown = readFileSync(resolve(process.cwd(), '..', 'CHANGELOG.md'), 'utf8');
  const entries = parseChangelog(markdown, { absolute: true }).filter((e) => e.kind !== 'unreleased' && e.date);
  return rss({
    title: 'Pixel Studio: changelog',
    description: 'What changed in Pixel Studio: npm releases of the packages and the pixel CLI, and updates to the studio and website.',
    site: `${site}/changelog/`,
    xmlns: { atom: 'http://www.w3.org/2005/Atom', content: 'http://purl.org/rss/1.0/modules/content/' },
    customData: `<language>en</language><atom:link href="${site}/changelog/rss.xml" rel="self" type="application/rss+xml"/>`,
    trailingSlash: true,
    items: entries.map((e, i) => {
      // The changelog has dates only: noon UTC (midnight would show as the day before in the Americas), and a minute
      // later for each newer entry of the same day, so readers that sort by date keep the file's order.
      const sameDayAfter = entries.slice(i + 1).filter((o) => o.date === e.date).length;
      return {
        title: e.kind === 'site' ? `pixel-studio.sh update, ${longDate(e.date!)}` : `Pixel Studio ${e.version}`,
        link: `${site}/changelog/#${e.id}`,
        pubDate: new Date(Date.parse(`${e.date}T12:00:00Z`) + sameDayAfter * 60_000),
        description: releaseSummary(e),
        content: releaseHtml(e),
      };
    }),
  });
};
