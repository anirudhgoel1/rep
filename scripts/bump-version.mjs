// bump CSS + JS version query params across all html files in one pass
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const NEW_VERSION = process.argv[2] || '20260521-3';

const files = (await readdir(ROOT)).filter(f => f.endsWith('.html'));

let touched = 0;
for (const f of files) {
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
console.log(`\ndone · ${touched} files · version=${NEW_VERSION}`);
