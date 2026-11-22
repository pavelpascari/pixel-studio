// /changelog/rss.xml: one item per released version of CHANGELOG.md (not Unreleased: a feed item is an
// announcement, and those notes are still changing), newest first, each linking to its anchor on /changelog/ and
// carrying the whole release as HTML.
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseChangelog, releaseHtml, releaseSummary } from '../../lib/changelog.mjs';

export const GET: APIRoute = (context) => {
  const site = (context.site?.href ?? 'https://pixel-studio.sh/').replace(/\/+$/, '');
  const markdown = readFileSync(resolve(process.cwd(), '..', 'CHANGELOG.md'), 'utf8');
  const releases = parseChangelog(markdown, { absolute: true }).filter((r) => !r.unreleased && r.date);
  return rss({
    title: 'Pixel Studio: changelog',
    description: 'What changed in each release of Pixel Studio: the packages, the pixel CLI, the studio and the website.',
    site: `${site}/changelog/`,
    xmlns: { atom: 'http://www.w3.org/2005/Atom', content: 'http://purl.org/rss/1.0/modules/content/' },
    customData: `<language>en</language><atom:link href="${site}/changelog/rss.xml" rel="self" type="application/rss+xml"/>`,
    trailingSlash: true,
    items: releases.map((r) => ({
      title: `Pixel Studio ${r.version}`,
      link: `${site}/changelog/#${r.id}`,
      // Noon UTC: the changelog has dates only, and midnight would show as the day before in the Americas.
      pubDate: new Date(`${r.date}T12:00:00Z`),
      description: releaseSummary(r),
      content: releaseHtml(r),
    })),
  });
};
