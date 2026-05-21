// Apply hardcore-DHH-fan tiering to artists.json.
//
// respect_tier  — what the heads on r/IndianHipHop / DHH discords actually reverence
//                 (pen game, OG cred, underground integrity)
// is_crossover  — Bollywood-pop / radio-rap presence that hardcore fans side-eye.
//                 these still exist in the roster but get BURIED in default rankings.
//
// usage: node scripts/retier.mjs
import { readFile, writeFile } from 'node:fs/promises';

const PATH = new URL('../data/artists.json', import.meta.url);

// Hardcore pantheon · what a DHH head would actually call the top of the pile
const TIER_S = [
  'krsna',          // pen GOAT debate centerpiece
  'seedhe-maut',    // delhi's literary wing
  'prabh-deep',     // conscious wave OG · class-sikh
  'divine',         // gully wave founder · respect intact
  'hanumankind',    // big dawgs global breakout · heads-approved
  'naezy',          // cult OG · the kurla mythology
  'yashraj'         // new wave lyricist · bombay coast
];
const TIER_A = [
  'the-siege', 'dhanji', 'chaar-diwaari', 'mc-altaf', '7-bantaiz',
  'wazir-patar', 'sikander-kahlon', 'tienas', 'ahmer',
  'moko-koza', 'yelhomie', 'minimi', 'reble', 'kim-the-beloved',
  'aavrutti', 'gnie', 'paal-dabba'
];
const TIER_B = [
  'mc-stan', 'emiway-bantai', 'raftaar', 'ikka', 'raga',
  'hiphop-tamizha', 'brodha-v', 'raja-kumari', 'bohemia',
  'shez', 'shah-rule', 'devil', 'dopeadelicz',
  'karma', 'frappe-ash', 'yungsta', 'arpit-bala', 'samad-khan',
  'kayan', 'tsumyoki', 'mc-square', 'vijay-dk',
  'macnivil', 'unb', 'rapper-big-deal', 'borkung-hrangkhawl',
  'meba-ofilia', 'khasi-bloodz', 'moksh-meghalaya', 'jelo',
  'k4-kekho', 'don-kam', 'sikdar', 'kabir-shillong', 'freakyy',
  'sambata', 'fotty-seven', 'dino-james', 'smokey-the-ghost',
  'naam-sujal', 'young-galib', 'muhfaad', 'dakait', 'big-boi-deep',
  'jassa-dhillon', 'talwiinder'
];
const TIER_C = [
  'lil-golu', 'channi-nattan', 'gurinder-gill', 'sunny-malton',
  'raf-saperra', 'tegi-pannu'
];
const TIER_D = [
  'yo-yo-honey-singh', 'badshah', 'king', 'baba-sehgal'
];

// Bollywood-pop crossover · buried from default rankings, still findable via search
const CROSSOVER = new Set([
  'yo-yo-honey-singh',
  'badshah',
  'king',
  'baba-sehgal',
  'karan-aujla',          // user explicit ask
  'sidhu-moose-wala',     // user explicit ask · the genre's biggest voice but mainstream-coded
  'ap-dhillon',
  'shubh',
  'diljit-dosanjh',
  'sunny-malton',
  'channi-nattan',
  'gurinder-gill',
  'jassa-dhillon',
  'talwiinder',           // melodic Punjabi crossover
  'arpit-bala'            // meme-rap pop
]);

// Crossover artists still get a tier for completeness when surfaced via search
const CROSSOVER_TIERS = {
  'karan-aujla': 'B',
  'sidhu-moose-wala': 'B',
  'ap-dhillon': 'C',
  'shubh': 'C',
  'diljit-dosanjh': 'C',
  'sunny-malton': 'C',
  'channi-nattan': 'C',
  'gurinder-gill': 'C',
  'jassa-dhillon': 'C',
  'talwiinder': 'C',
  'arpit-bala': 'C'
};

const respectFor = (slug) => {
  if (TIER_S.includes(slug)) return 'S';
  if (TIER_A.includes(slug)) return 'A';
  if (TIER_B.includes(slug)) return 'B';
  if (TIER_C.includes(slug)) return 'C';
  if (TIER_D.includes(slug)) return 'D';
  if (CROSSOVER_TIERS[slug]) return CROSSOVER_TIERS[slug];
  return 'B'; // safe default
};

const raw = JSON.parse(await readFile(PATH, 'utf8'));
let counts = { S: 0, A: 0, B: 0, C: 0, D: 0, crossover: 0 };
for (const a of raw.artists) {
  a.respect_tier = respectFor(a.slug);
  a.is_crossover = CROSSOVER.has(a.slug) ? 1 : 0;
  counts[a.respect_tier]++;
  if (a.is_crossover) counts.crossover++;
}

// flag the schema version bump
raw._meta.version = 'v1.7';
raw._meta.retiered_at = new Date().toISOString().slice(0, 10);
raw._meta.respect_tier_principle = 'Hardcore-DHH-fan reverence tier. S = pantheon (pen game / OG cred / underground integrity). is_crossover=1 = Bollywood-pop or radio-rap that hardcore heads side-eye; these get buried from default rankings but still surface via search and the "by streams" toggle.';

await writeFile(PATH, JSON.stringify(raw, null, 2) + '\n');

console.log('Respect tiers:');
console.log('  S (pantheon):', counts.S);
console.log('  A (hardcore):', counts.A);
console.log('  B (mainstream-respected):', counts.B);
console.log('  C (pop-leaning):', counts.C);
console.log('  D (bollywood-novelty):', counts.D);
console.log('  is_crossover=1 (buried by default):', counts.crossover);
