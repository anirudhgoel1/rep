// one-shot: replace per-page topbar HTML with a single empty container.
// app.js will render the nav dynamically on every page.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';

const files = (await readdir(ROOT)).filter(f => f.endsWith('.html'));

let touched = 0;
for (const f of files) {
  const path = join(ROOT, f);
  const src = await readFile(path, 'utf8');
  // match: <header class="topbar">...</header> across multiline
  const out = src.replace(
    /<header class="topbar">[\s\S]*?<\/header>/m,
    '<header class="topbar" id="topbar"></header>'
  );
  if (out !== src) {
    await writeFile(path, out);
    touched++;
    console.log('  unified ·', f);
  } else {
    console.log('  no-change ·', f);
  }
}
console.log(`\ndone · ${touched} files updated.`);
