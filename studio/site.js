// Links back to the website (the logo, "Docs"): <a href="https://pixel-studio.sh/…" data-site="/…">.
// The website serves these pages under /apps/studio/, so there (pixel-studio.sh, a preview deploy, the website's
// own build) the site is the same origin and the links become its relative paths. Anywhere else, e.g. the repo
// served by scripts/serve.mjs at localhost:5173/studio/, the site is not there: the links keep the live site's URL.
if (location.pathname.startsWith('/apps/')) {
  for (const a of document.querySelectorAll('a[data-site]')) a.setAttribute('href', a.dataset.site);
}
