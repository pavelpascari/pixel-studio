# Pixel Studio — website

Built with [astro-project-site](https://github.com/pavelpascari/astro-project-site): a landing page, docs, a blog
and a gallery, from the repository's own files.

```bash
npm install
npm run dev            # http://localhost:4321
npm run build          # the demo assets (../scripts/build-demo.mjs), then astro check + build into dist/ + docs:check
npm run deploy         # Cloudflare Workers (after `npx wrangler login`)
```

| file | what it is |
|---|---|
| `astro.config.mjs` | everything about the site: `projectSite({ ... })` |
| `../packages/pixel-studio/docs/` | mounted under `/docs/reference/` (`externalDocs`) |
| `../{README.md,CHANGELOG.md,CONTRIBUTING.md}` | mounted under `/docs/project/` (`externalDocs`) |
| `../demo/`, `../studio/`, the packages' `src/`, `docs/`, `examples/`, `figures/` | copied byte for byte under `/apps/` (`mirrors`), so the demos and the studio run on the site |
| `src/content/docs/docs/` | docs pages of the site itself, under `/docs/` |
| `src/content/blog/` | blog posts (`draft: true` ones are not published) |
| `src/content/gallery/` | one file per gallery item |
| `wrangler.jsonc`, `public/_headers` | Cloudflare Workers deploy |
| `.github/workflows/site.yml` | CI: checks, a preview per PR, production on `v*` tags (move it to the repo root's `.github/workflows/`) |
