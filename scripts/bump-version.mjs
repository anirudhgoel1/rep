// Bump cache-bust ?v= on all HTML + app.js data fetches.
// Usage: node scripts/bump-version.mjs [version]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const NEW_VERSION = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-1';

const htmlFiles = (await readdir(ROOT)).filter(f => f.endsWith('.html'));
let touched = 0;

for (const f of htmlFiles) {
  const path = join(ROOT, f);
  const src = await readFile(path, 'utf8');
  const out = src
    .replace(/styles\.css\?v=[^"']+/g, `styles.css?v=${NEW_VERSION}`)
    .replace(/app\.js\?v=[^"']+/g, `app.js?v=${NEW_VERSION}`);
  if (out !== src) {
    await writeFile(path, out);
    touched++;
    console.log('  bumped ·', f);
  }
}

const appPath = join(ROOT, 'app.js');
const appSrc = await readFile(appPath, 'utf8');
const appOut = appSrc
  .replace(/\/data\/artists\.json\?v=[^'"]+/g, `/data/artists.json?v=${NEW_VERSION}`)
  .replace(/\/data\/bios\.json\?v=[^'"]+/g, `/data/bios.json?v=${NEW_VERSION}`);
if (appOut !== appSrc) {
  await writeFile(appPath, appOut);
  console.log('  bumped · app.js data fetches');
  touched++;
}

console.log(`\ndone · ${touched} targets · version=${NEW_VERSION}`);
