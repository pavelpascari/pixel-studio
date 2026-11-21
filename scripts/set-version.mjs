#!/usr/bin/env node
// Sets the version of both packages, which are always released together:
//
//   npm run version:set -- 0.2.0-alpha.1 [--date 2026-11-21]
//
// 1. `version` in packages/pixel-studio/package.json and packages/runtime/package.json
// 2. pixel-studio's dependency on @pixel-studio/runtime, pinned to exactly that version
// 3. CHANGELOG.md: the `## [Unreleased]` notes move under `## [<version>] - <date>` (an empty Unreleased stays on
//    top); fails if there is nothing to release
// 4. package-lock.json, with the npm that runs this script
//
// It commits nothing. Then: review `git diff`, commit (signed), tag `v<version>` (signed), push both.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export const PACKAGES = ['packages/pixel-studio/package.json', 'packages/runtime/package.json'];

/** The CHANGELOG with the Unreleased notes moved under the version's heading. */
export function moveUnreleased(text, version, date) {
  const m = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## )/m.exec(text);
  if (!m) throw new Error('CHANGELOG.md has no "## [Unreleased]" section followed by a release.');
  if (!m[1].trim()) throw new Error('CHANGELOG.md: nothing under "## [Unreleased]" to release.');
  return text.replace(m[0], `## [Unreleased]\n\n## [${version}] - ${date}\n${m[1].replace(/^\n*/, '\n')}`);
}

function main(argv) {
  const version = argv.find((a) => !a.startsWith('--'));
  if (!version || !SEMVER.test(version)) throw new Error('usage: npm run version:set -- <semver> [--date YYYY-MM-DD]');
  const i = argv.indexOf('--date');
  const date = i === -1 ? new Date().toISOString().slice(0, 10) : argv[i + 1];
  for (const rel of PACKAGES) {
    const file = path.join(root, rel);
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    pkg.version = version;
    if (pkg.dependencies?.['@pixel-studio/runtime']) pkg.dependencies['@pixel-studio/runtime'] = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`  ${rel}: ${version}`);
  }
  const log = path.join(root, 'CHANGELOG.md');
  fs.writeFileSync(log, moveUnreleased(fs.readFileSync(log, 'utf8'), version, date));
  console.log(`  CHANGELOG.md: Unreleased → [${version}] - ${date}`);
  // The npm that runs this script, not whichever is first on PATH.
  const npm = process.env.npm_execpath ? [process.execPath, process.env.npm_execpath] : ['npm'];
  execFileSync(npm[0], [...npm.slice(1), 'install', '--package-lock-only', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  console.log(`\nNext: git diff; git commit -S -am "Release ${version}"; git tag -s v${version} -m "Pixel Studio ${version}"; git push origin main v${version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`version:set: ${e.message}`); process.exit(1); }
}
