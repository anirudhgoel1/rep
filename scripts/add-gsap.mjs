// add GSAP + ScrollTrigger script tags to every HTML page if missing
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const files = (await readdir(ROOT)).filter(f => f.endsWith('.html'));

let touched = 0;
for (const f of files) {
  const path = join(ROOT, f);
  let src = await readFile(path, 'utf8');
  if (src.includes('/assets/vendor/gsap.min.js')) {
    console.log('  already has gsap ·', f);
    continue;
  }
  // inject before the closing </head>
  src = src.replace(
    /(<link rel="stylesheet" href="\/styles\.css\?v=[^"]+">)/,
    `$1\n  <script src="/assets/vendor/gsap.min.js" defer></script>\n  <script src="/assets/vendor/ScrollTrigger.min.js" defer></script>`
  );
  await writeFile(path, src);
  touched++;
  console.log('  added gsap to ·', f);
}
console.log(`\ndone · ${touched} files updated`);
