// Inject og/twitter meta + apple-touch-icon into every page that lacks them.
// Derives og:title/description/url from each page's existing title/description/canonical.
// Idempotent: skips pages that already have og:title.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = (await readdir(ROOT)).filter(f => f.endsWith('.html'));

for (const f of pages) {
  const path = join(ROOT, f);
  let src = await readFile(path, 'utf8');
  let changed = false;

  if (!src.includes('property="og:title"')) {
    const title = (src.match(/<title>([^<]+)<\/title>/) || [])[1];
    const desc = (src.match(/<meta name="description" content="([^"]+)"/) || [])[1];
    const url = (src.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (title && desc && url) {
      const block = [
        '',
        '  <meta property="og:type" content="website">',
        `  <meta property="og:url" content="${url}">`,
        `  <meta property="og:title" content="${title}">`,
        `  <meta property="og:description" content="${desc}">`,
        '  <meta property="og:image" content="https://rep.anirudhgoel.xyz/og.png">',
        '  <meta name="twitter:card" content="summary_large_image">',
        `  <meta name="twitter:title" content="${title}">`,
        `  <meta name="twitter:image" content="https://rep.anirudhgoel.xyz/og.png">`,
      ].join('\n');
      src = src.replace(/(\n\s*<link rel="canonical")/, block + '$1');
      changed = true;
    } else {
      console.log('  skip (missing title/desc/canonical) ·', f);
    }
  }

  if (!src.includes('apple-touch-icon')) {
    src = src.replace(
      /(<link rel="icon"[^>]*>)/,
      '$1\n  <link rel="apple-touch-icon" href="/icon-192.png">'
    );
    changed = true;
  }

  if (changed) { await writeFile(path, src); console.log('  meta ·', f); }
}
console.log('done');
