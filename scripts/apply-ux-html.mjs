// one-shot UX overhaul · HTML hygiene pass
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '20260608-2';
const SKIP_LINK = `<a class="skip-link" href="#main">skip to main</a>\n`;

const FOOTER_TIP = 'built with respect. <a href="upi://pay?pa=7814769892@yescred&pn=Anirudh%20Goel&cu=INR" id="upiLink">tip via upi →</a>';
const FOOTER_CREDS = '© 2026 · made by <a href="https://anirudhgoel.xyz">anirudh goel</a> · cluster member';

const FOOTERS = {
  tier: 'tier board autosaves locally · export PNG when you are ready to post',
  mixtape: 'mixtape autosaves in your browser · copy tracklist or export sleeve PNG',
  cyphers: 'cyphers expand through v2 · nominate missing moments via who\'s missing when ballots API is live',
  timeline: 'missing a milestone? nominate via who\'s missing when the suggestions API is live',
  slang: 'know a word we skipped? nominate via who\'s missing when the API is live',
};

function stripTape(html) {
  return html.replace(/\n<div class="tape"[\s\S]*?<\/div>\n/g, '\n');
}

function stripGsap(html, keep) {
  if (keep) return html;
  return html
    .replace(/\s*<script src="\/assets\/vendor\/gsap\.min\.js" defer><\/script>\n/g, '')
    .replace(/\s*<script src="\/assets\/vendor\/ScrollTrigger\.min\.js" defer><\/script>\n/g, '');
}

function bumpCache(html) {
  return html.replace(/v=20260608-1/g, `v=${V}`);
}

function themeColor(html) {
  return html.replace(/content="#F4EFE6"/g, 'content="#E8E2D4"');
}

function addSkipAndMain(html, mainId = 'main') {
  let out = html;
  if (!out.includes('skip-link')) {
    out = out.replace(/<body([^>]*)>/, `<body$1>\n${SKIP_LINK}`);
  }
  // wrap primary content after topbar in main if not present
  if (!out.includes(`id="${mainId}"`)) {
    out = out.replace(
      /(<header class="topbar" id="topbar"><\/header>\s*\n)/,
      `$1  <main id="${mainId}">\n`
    );
    // close main before footer on inner pages
    if (out.includes('<footer class="foot">') && !out.includes('</main>')) {
      out = out.replace(/(\s*)(<footer class="foot">)/, '\n  </main>\n\n$1$2');
    }
  }
  return out;
}

async function patchIndex(html) {
  let out = html;
  out = out.replace('<body>', '<body data-page="landing">');
  out = out.replace(
    /<div class="shell">\s*\n\s*<!-- marquee/,
    `<nav class="chapter-jump" aria-label="page sections">\n    <a href="#what-you-can-do">01 build</a>\n    <a href="#leaderboard">02 top 5</a>\n    <a href="#cities">03 cities</a>\n    <a href="#beefs">04 beefs</a>\n    <a href="#vault">05 vault</a>\n    <a href="#daily">06 duel</a>\n    <a href="#defend">07 defend</a>\n  </nav>\n\n  <!-- marquee`
  );
  out = out.replace(
    /<p class="section__meta"><span class="live" id="landingRankNote">[^<]*<\/span> · <a href="\/leaderboard\.html">streams toggle<\/a><\/p>/,
    `<p class="section__meta"><span class="live" id="landingRankNote">crossovers buried · seed ranking until ballots land</span> · <a href="/leaderboard.html">full board</a></p>\n      <div id="rankToggle" class="mode-toggle" style="margin-top: 12px;" aria-label="ranking mode"></div>`
  );
  out = out.replace(
    /<h2 class="section__title">nine <span class="burn">doors<\/span><\/h2>\s*<p class="section__meta"><span data-roster-count>90<\/span> artists · 10 cities · neighborhoods produce sounds<\/p>/,
    `<h2 class="section__title">nine <span class="burn">regions</span></h2>\n      <p class="section__meta"><span data-roster-count>90</span> artists · 10 cities represented · 9 bento doors (northeast grouped)</p>`
  );
  out = out.replace(
    /<div class="duel">[\s\S]*?<\/div>\s*<p class="duel__theme">app\.js loads today's matchup from the hardcore pool\.<\/p>/,
    `<div class="duel duel--loading" id="duelRoot" aria-live="polite">\n      <div class="duel__skeleton">loading today's matchup…</div>\n    </div>\n    <p class="duel__theme" id="duelTheme">hardcore pool · one vote per head</p>\n    <p class="duel__meta"><a href="/compare.html">settle it stat-by-stat → compare</a> · <button type="button" class="dice-btn" id="diceBtn">random artist →</button></p>`
  );
  out = out.replace(/<span>example take<\/span>/g, '<span class="quote__badge">seed take</span>');
  out = out.replace(
    /<div class="suggest" id="suggestBox" hidden>/,
    '<div class="suggest" id="suggestBox">'
  );
  if (!out.includes('skip-link')) {
    out = out.replace('<body data-page="landing">', `<body data-page="landing">\n${SKIP_LINK}`);
  }
  out = out.replace(
    /<div class="hero-dark__cta">/,
    `<div class="hero-dark__cta">\n        <a href="#vault" class="btn-dark-ghost">explore the vault ↓</a>`
  );
  // landing shell is special — add id main to shell content
  if (!out.includes('id="main"')) {
    out = out.replace('<div class="shell">\n\n  <nav class="chapter-jump"', '<div class="shell" id="main">\n\n  <nav class="chapter-jump"');
  }
  return out;
}

async function run() {
  const files = (await readdir(ROOT)).filter(f => f.endsWith('.html'));
  for (const f of files) {
    let html = await readFile(join(ROOT, f), 'utf8');
    const isIndex = f === 'index.html';
    html = bumpCache(html);
    html = themeColor(html);
    html = stripTape(html);
    html = stripGsap(html, isIndex);
    if (isIndex) {
      html = await patchIndex(html);
    } else {
      html = addSkipAndMain(html);
      if (f === 'tier.html') {
        html = html.replace(
          /tier list state lives in your browser\. nothing leaves your machine until the share-card pipeline ships\./,
          FOOTERS.tier
        );
        html = html.replace(/drag artists in/, 'drag or tap artists in');
        html = html.replace(/<div class="tier-pool__head">/, '<p id="tierProgress" class="tier-progress"></p>\n    <div class="tier-pool__head">');
      }
      if (f === 'mixtape.html') {
        html = html.replace(
          /mixtape lives in your browser\. nothing leaves until the share-card pipeline ships\./,
          FOOTERS.mixtape
        );
        html = html.replace('copy tracklist →', 'copy tracklist →');
        html = html.replace(
          /<button class="btn-stamp" id="mixtapeExport">copy tracklist →<\/button>/,
          `<button class="btn-stamp" id="mixtapeExport">copy tracklist →</button>\n        <button class="dice-btn" id="mixtapePng">export sleeve PNG →</button>`
        );
      }
      if (f === 'cyphers.html') html = html.replace(/cyphers expand through v2\. send receipts via who's missing when the API is live\./, FOOTERS.cyphers);
      if (f === 'timeline.html') {
        html = html.replace(/missing a milestone\? nominate via who's missing when the suggestions API is live\./, FOOTERS.timeline);
        html = html.replace('<section class="hero"', '<div class="tl-filters" id="tlFilters"></div>\n  <section class="hero"');
      }
      if (f === 'slang.html') {
        html = html.replace(/if you know a word we're missing, nominate via who's missing on the homepage when the API is live\./, FOOTERS.slang);
        html = html.replace('<section class="hero"', '<div class="slang-search-wrap" id="slangSearchWrap"></div>\n  <section class="hero"');
      }
      if (f === 'compare.html') {
        html = html.replace('<div id="compareWrap"></div>', '<div id="compareWrap"></div>\n  <p class="compare-actions" id="compareActions"></p>');
      }
      if (f === 'build.html') {
        html = html.replace('<main class="builder">', '<div id="builderRestore" class="restore-banner" hidden></div>\n  <main class="builder" id="main">');
      }
      if (f === 'leaderboard.html') {
        html = html.replace('<nav class="subnav"', '<div class="lb-search-wrap"><input type="search" id="lbSearch" placeholder="filter this board…" autocomplete="off" aria-label="filter leaderboard"></div>\n  <nav class="subnav"');
      }
      // unify footer creds
      html = html.replace(/© 2026 · made by <a href="https:\/\/anirudhgoel\.xyz">anirudh goel<\/a>(?!<\/span> · cluster member)/g,
        FOOTER_CREDS.replace('</a> · cluster member', '</a>'));
      if (!html.includes('cluster member')) {
        html = html.replace(
          /<span class="foot__creds">© 2026 · made by <a href="https:\/\/anirudhgoel\.xyz">anirudh goel<\/a><\/span>/,
          `<span class="foot__creds">${FOOTER_CREDS}</span>`
        );
      }
    }
    await writeFile(join(ROOT, f), html);
    console.log('patched', f);
  }
  console.log('done · cache', V);
}

run();
