/* rep · app.js
   one shared script across all pages. defer-loaded. no esm. no framework.
   ---------------------------------------------------------------- */

(() => {
  'use strict';

  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

  /* installability + push · sw.js is a strict passthrough, no caching */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  /* ============================================================
     shared · upi swap, data load, helpers
     ============================================================ */
  const upiLink = $('#upiLink');
  if (upiLink) {
    upiLink.addEventListener('click', (e) => {
      const isMobile = /Android|iPhone|iPad|Mobile/.test(navigator.userAgent);
      if (isMobile) return;
      e.preventDefault();
      const id = '7814769892@yescred';
      navigator.clipboard.writeText(id).then(() => {
        const o = upiLink.textContent;
        upiLink.textContent = 'upi id copied ✓';
        setTimeout(() => { upiLink.textContent = o; }, 2800);
      }).catch(() => prompt('your upi id', id));
    });
  }

  /* one-time data load · resolves once, all pages share ---- */
  let ARTISTS = null;
  let BY_SLUG = null;
  let ROSTER_META = {};
  let LIVE_BALLOTS;
  async function loadArtists() {
    if (ARTISTS) return ARTISTS;
    const r = await fetch('/data/artists.json?v=20260610-1');
    const j = await r.json();
    ROSTER_META = j._meta || {};
    ARTISTS = (j.artists || []).filter(a => a.is_votable !== 0);
    BY_SLUG = Object.fromEntries(ARTISTS.map(a => [a.slug, a]));
    syncRosterCountUI();
    return ARTISTS;
  }
  async function liveBallotCount() {
    if (LIVE_BALLOTS !== undefined) return LIVE_BALLOTS;
    if (API_LIVE === false) { LIVE_BALLOTS = 0; return 0; }
    try {
      const live = await API.get('/leaderboard?type=top5&scope=all');
      LIVE_BALLOTS = Number(live?.ballots) || 0;
    } catch { LIVE_BALLOTS = 0; }
    return LIVE_BALLOTS;
  }
  function rankFootnote(ballots) {
    const mode = rankMode();
    if (ballots > 0 && mode === 'respect') {
      return `${ballots.toLocaleString('en-IN')} community ballot${ballots === 1 ? '' : 's'} counted`;
    }
    if (mode === 'streams') return 'editorial stream estimate · not community-voted';
    if (API_LIVE === false) return 'seed ranking · ballots API offline · from respect tier until deploy';
    return 'seed ranking · no ballots yet · from respect tier until you vote';
  }
  function rankShareLabel(ballots) {
    const mode = rankMode();
    if (ballots > 0 && mode === 'respect') return 'share of top-5s';
    return mode === 'respect' ? 'pen-game seed share' : 'streams seed share';
  }
  function rosterCount() {
    return ROSTER_META.total_artists || (ARTISTS ? ARTISTS.length : 90);
  }
  function syncRosterCountUI() {
    const n = rosterCount();
    $$('[data-roster-count]').forEach(el => { el.textContent = String(n); });
    const ph = document.querySelector('#gsearch input[type=search]');
    if (ph) ph.placeholder = `search ${n} artists…`;
  }

  /* ranking · respect_tier (hardcore DHH cred) is the DEFAULT.
     popularity_tier (commercial reach) is the alt mode users can opt into via the toggle.
     deterministic seeded votes either way so renders are stable. */
  function tierWeight(t) { return { S: 50000, A: 18000, B: 5000, C: 1200, D: 250 }[t] || 100; }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function rankMode() { return localStorage.getItem('rep:rankMode') || 'respect'; }
  function setRankMode(m) { localStorage.setItem('rep:rankMode', m); }
  function mockVotes(a) {
    const mode = rankMode();
    const tier = mode === 'streams' ? a.popularity_tier : (a.respect_tier || a.popularity_tier);
    const base = tierWeight(tier);
    const wobble = (hashStr(a.slug + mode) % 1000) / 1000;
    let v = Math.round(base * (0.55 + wobble * 0.9));
    // in respect mode, crossovers get DEEPLY buried · multiplier 0.05
    if (mode === 'respect' && a.is_crossover) v = Math.round(v * 0.05);
    return v;
  }
  function totalVotes(artists) {
    return artists.reduce((s, a) => s + mockVotes(a), 0);
  }
  function pctOf(a, total) { return (mockVotes(a) / total) * 100; }
  // default pool excludes crossovers in respect mode
  function defaultPool(artists) {
    return rankMode() === 'respect'
      ? artists.filter(a => !a.is_crossover)
      : artists;
  }
  // HARDCORE-ONLY · used for the landing page front door. NEVER shows crossovers
  // regardless of rank mode. Crossovers live in /leaderboard "crossover wing" + search.
  function hardcorePool(artists) {
    return artists.filter(a => !a.is_crossover);
  }

  function initials(name) {
    return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function lower(s) { return (s || '').toString().toLowerCase(); }
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function displayTier(a) {
    return rankMode() === 'respect' ? (a.respect_tier || a.popularity_tier) : a.popularity_tier;
  }
  function tierLabelName() {
    return rankMode() === 'respect' ? 'pen tier' : 'stream tier';
  }
  function toast(msg, ms = 3200) {
    let el = $('#repToast');
    if (!el) {
      el = document.createElement('p');
      el.id = 'repToast';
      el.className = 'rep-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-show'), ms);
  }
  function updatePageMeta({ title, description }) {
    if (title) document.title = title;
    if (description) {
      const m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', description);
    }
  }
  const NE_STATES = ['Meghalaya', 'Assam', 'Manipur', 'Mizoram', 'Nagaland', 'Tripura', 'Arunachal Pradesh', 'Sikkim'];
  function cityBentoGroups() {
    if (!ARTISTS) return {};
    return {
      Mumbai: { artists: ARTISTS.filter(a => a.city_represented === 'Mumbai' && !a.is_crossover), tag: 'gully wave', sub: 'dharavi · kurla · andheri · mira road', size: 'big' },
      Delhi: { artists: ARTISTS.filter(a => a.state === 'Delhi NCR' && !a.is_crossover), tag: 'lyrical wave', sub: 'the conscious heartbeat', size: 'med' },
      Punjab: { artists: ARTISTS.filter(a => a.state === 'Punjab' && !a.is_crossover), tag: 'parallel kingdom', sub: 'wazir · sikander · big boi · jelo', size: 'med' },
      Bengaluru: { artists: ARTISTS.filter(a => a.city_represented === 'Bengaluru' && !a.is_crossover), tag: 'global lane', sub: 'hanumankind broke through', size: 'sm' },
      Pune: { artists: ARTISTS.filter(a => a.city_represented === 'Pune' && !a.is_crossover), tag: 'drill capital', sub: 'mc stan · stan wave', size: 'sm' },
      Northeast: { artists: ARTISTS.filter(a => NE_STATES.includes(a.state) && !a.is_crossover), tag: 'northeast nucleus', sub: 'eight states · one sound', size: 'sm', href: '/city.html?city=Northeast' },
      Chennai: { artists: ARTISTS.filter(a => a.city_represented === 'Chennai' && !a.is_crossover), tag: 'tamil wave', sub: 'paal dabba global', size: 'xs' },
      Ahmedabad: { artists: ARTISTS.filter(a => a.city_represented === 'Ahmedabad' && !a.is_crossover), tag: 'gujarati pen', sub: 'dhanji solo', size: 'xs' },
      Srinagar: { artists: ARTISTS.filter(a => a.city_represented === 'Srinagar' && !a.is_crossover), tag: 'kashmir conscience', sub: 'ahmer alone, loud', size: 'xs' }
    };
  }
  function isOgMainstream(a) {
    if (!a) return false;
    const tags = a.tags || [];
    return (a.era === 'OG' && a.subgenre === 'Pop-Rap') ||
           (tags.includes('mainstream') && tags.includes('OG'));
  }

  /* ============================================================
     API client · the real backend (Cloudflare Worker + D1).
     Every call degrades gracefully: if the worker isn't there
     (e.g. pure static preview) features fall back to local/seed
     behaviour instead of breaking.
     ============================================================ */
  const API = {
    async call(path, opts = {}) {
      const init = { credentials: 'same-origin', ...opts };
      if (opts.body != null && typeof opts.body !== 'string') {
        init.body = JSON.stringify(opts.body);
        init.headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
      }
      const r = await fetch('/api' + path, init);
      if (!r.ok) throw new Error('api ' + r.status);
      return r.json();
    },
    get(path) { return this.call(path); },
    post(path, body) { return this.call(path, { method: 'POST', body: body || {} }); },
  };
  let _apiUp = null;
  let _apiDb = null;
  let API_LIVE = null;
  function renderApiStatusBanner() {
    if ($('#apiStatusBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'apiStatusBanner';
    bar.className = 'api-status';
    bar.hidden = true;
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="api-status__text"></span><button type="button" class="api-status__dismiss" aria-label="dismiss status">×</button>';
    const topbar = $('#topbar');
    if (topbar?.parentElement) topbar.parentElement.insertAdjacentElement('beforebegin', bar);
    else document.body.prepend(bar);
    $('.api-status__dismiss', bar)?.addEventListener('click', () => {
      bar.hidden = true;
      sessionStorage.setItem('rep:apiBannerDismissed', '1');
    });
  }
  function syncApiStatusUI() {
    const el = $('#apiStatusBanner');
    if (!el || API_LIVE === null) return;
    if (sessionStorage.getItem('rep:apiBannerDismissed') === '1') { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'api-status ' + (API_LIVE ? 'api-status--live' : 'api-status--seed');
    const txt = $('.api-status__text', el);
    if (txt) {
      txt.textContent = API_LIVE
        ? 'ballots API live · votes count on the board'
        : 'seed mode · rankings are editorial until ballots API is deployed';
    }
  }
  async function apiUp() {
    if (_apiUp !== null) return _apiUp;
    try {
      const h = await API.get('/health');
      _apiUp = !!(h && h.ok);
      _apiDb = !!(h && h.db);
      API_LIVE = _apiUp && _apiDb;
    } catch {
      _apiUp = false;
      _apiDb = false;
      API_LIVE = false;
    }
    syncApiStatusUI();
    return _apiUp;
  }
  async function syncRankingFootnotes() {
    await loadArtists();
    const ballots = await liveBallotCount();
    const foot = rankFootnote(ballots);
    $$('[data-rank-footnote]').forEach(el => { el.textContent = foot; });
  }

  /* photo rendering · graceful fallback to initials --------- */
  function photoHtml(a, opts = {}) {
    const alt = opts.decorative ? '' : esc(a.stage_name);
    if (a.image_url) {
      return `<img src="${esc(a.image_url)}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${esc(initials(a.stage_name))}'}))">`;
    }
    return `<span class="fallback" aria-hidden="${opts.decorative ? 'true' : 'false'}">${esc(initials(a.stage_name))}</span>`;
  }

  function stampFor(a) {
    if (a.active_status === 'RIP') return { cls: 'stamp--rip', text: 'R.I.P.' };
    if (a.is_crossover) return { cls: 'stamp--mainstream', text: 'mainstream' };
    if (a.respect_tier === 'S') return { cls: 'stamp--pen', text: 'pen game' };
    if (a.subgenre === 'Gully Rap') return { cls: 'stamp--gully', text: 'gully' };
    if (a.era === 'OG') return { cls: 'stamp--og', text: 'OG' };
    return null;
  }

  function cardHtml(a, opts = {}) {
    const picked = opts.pickedSet && opts.pickedSet.has(a.slug);
    const link = opts.link ? `<a href="/artist.html?slug=${esc(a.slug)}" style="display:block">` : '';
    const linkEnd = opts.link ? `</a>` : '';
    const stamp = stampFor(a);
    const stampHtml = stamp ? `<span class="stamp is-tr ${stamp.cls}">${esc(stamp.text)}</span>` : '';
    // tier shown is respect tier when in respect mode, else popularity tier
    const tier = displayTier(a);
    return `
      <article class="card ${picked ? 'is-picked' : ''}"
               draggable="${opts.draggable !== false}" data-slug="${esc(a.slug)}">
        ${link}
        ${stampHtml}
        <div class="card__photo">${photoHtml(a)}</div>
        <div class="card__name">${esc(a.stage_name)}</div>
        <div class="card__meta">
          <span>${esc(lower(a.city_represented))}</span>
          <span class="card__tier">${esc(tier)}</span>
        </div>
        ${linkEnd}
      </article>`;
  }

  /* ============================================================
     global topbar render · single source of truth
     ============================================================ */
  function renderTopbar() {
    const el = $('#topbar');
    if (!el) return;
    const path = location.pathname;
    const isActive = (href) => path === href || path.startsWith(href.replace('.html', ''));
    const moreActive = ['/city.html', '/beefs.html', '/timeline.html', '/slang.html', '/labels.html', '/producers.html', '/cyphers.html']
      .some(h => isActive(h));
    el.innerHTML = `
      <a href="/" class="topbar__mark" aria-label="Rep home">REP<span class="dot"></span></a>
      <nav class="topbar__nav" aria-label="primary">
        <a href="/build.html" class="${isActive('/build.html') ? 'is-active' : ''}">drop 5</a>
        <a href="/tier.html" class="${isActive('/tier.html') ? 'is-active' : ''}">tier</a>
        <a href="/leaderboard.html" class="${isActive('/leaderboard.html') ? 'is-active' : ''}">top ${rosterCount()}</a>
        <a href="/mixtape.html" class="${isActive('/mixtape.html') ? 'is-active' : ''}">mixtape</a>
        <a href="/compare.html" class="${isActive('/compare.html') ? 'is-active' : ''}">compare</a>
      </nav>
      <div class="topbar__tools">
        <div class="topbar__more" id="topbarMore">
          <button type="button" class="topbar__more-btn ${moreActive ? 'is-active' : ''}" aria-expanded="false" aria-controls="topbarMorePanel" id="topbarMoreBtn">more ▾</button>
          <div class="topbar__more-panel" id="topbarMorePanel" hidden>
            <a href="/city.html" class="${isActive('/city.html') ? 'is-active' : ''}">cities</a>
            <a href="/beefs.html" class="${isActive('/beefs.html') ? 'is-active' : ''}">beefs</a>
            <a href="/timeline.html" class="${isActive('/timeline.html') ? 'is-active' : ''}">timeline</a>
            <a href="/slang.html" class="${isActive('/slang.html') ? 'is-active' : ''}">slang</a>
            <a href="/labels.html" class="${isActive('/labels.html') ? 'is-active' : ''}">labels</a>
            <a href="/producers.html" class="${isActive('/producers.html') ? 'is-active' : ''}">producers</a>
            <a href="/cyphers.html" class="${isActive('/cyphers.html') ? 'is-active' : ''}">cyphers</a>
          </div>
        </div>
        <div class="gsearch" id="gsearch">
          <input type="search" placeholder="search artists…" aria-label="search artists" autocomplete="off">
          <div class="gsearch__results" id="gsearchResults"></div>
        </div>
      </div>`;
    initSearch();
    initTopbarMore();
  }
  function initTopbarMore() {
    const btn = $('#topbarMoreBtn');
    const panel = $('#topbarMorePanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      panel.hidden = open;
    });
    document.addEventListener('click', (e) => {
      if (!$('#topbarMore')?.contains(e.target)) {
        btn.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
      }
    });
  }
  renderApiStatusBanner();
  renderTopbar();
  apiUp().then(() => syncRankingFootnotes());

  /* ============================================================
     global search · autocomplete
     ============================================================ */
  function initSearch() {
    const wrap = $('#gsearch');
    if (!wrap) return;
    const input = wrap.querySelector('input');
    const results = wrap.querySelector('#gsearchResults');
    let cursor = -1;
    let matches = [];

    const render = () => {
      if (!matches.length) {
        results.innerHTML = `<div class="gsearch__empty">no one matches that. try a city or tag.</div>`;
        wrap.classList.add('is-open');
        return;
      }
      results.innerHTML = matches.slice(0, 8).map((a, i) => `
        <a class="gsearch__item ${i === cursor ? 'is-cursor' : ''}" href="/artist.html?slug=${esc(a.slug)}">
          <span class="ph">${photoHtml(a)}</span>
          <span class="name">${esc(a.stage_name)}</span>
          <span class="city">${esc(lower(a.city_represented || ''))}</span>
        </a>`).join('');
      wrap.classList.add('is-open');
    };

    input.addEventListener('focus', async () => {
      await loadArtists();
      if (!matches.length && !input.value) {
        // show a quick top-5 by default
        matches = [...ARTISTS].sort((a, b) => mockVotes(b) - mockVotes(a)).slice(0, 6);
        render();
      } else if (matches.length) {
        wrap.classList.add('is-open');
      }
    });
    input.addEventListener('input', async (e) => {
      await loadArtists();
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        matches = [...ARTISTS].sort((a, b) => mockVotes(b) - mockVotes(a)).slice(0, 6);
      } else {
        matches = ARTISTS.filter(a => {
          const hay = (a.stage_name + ' ' + (a.city_represented || '') + ' ' + (a.real_name || '') + ' ' + (a.tags || []).join(' ')).toLowerCase();
          return hay.includes(q);
        });
      }
      cursor = -1;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { cursor = Math.min(matches.length - 1, cursor + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cursor = Math.max(-1, cursor - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && cursor >= 0) { location.href = `/artist.html?slug=${matches[cursor].slug}`; }
      else if (e.key === 'Escape') { wrap.classList.remove('is-open'); input.blur(); }
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) wrap.classList.remove('is-open');
    });
  }

  /* ============================================================
     page router
     ============================================================ */
  const page = document.body.dataset.page ||
    (location.pathname.includes('build') ? 'build' :
     location.pathname.includes('artist') ? 'artist' :
     location.pathname.includes('city') ? 'city' :
     location.pathname.includes('tier') ? 'tier' :
     location.pathname.includes('leaderboard') ? 'leaderboard' :
     location.pathname.includes('beefs') ? 'beefs' :
     location.pathname.includes('slang') ? 'slang' :
     location.pathname.includes('timeline') ? 'timeline' :
     location.pathname.includes('compare') ? 'compare' :
     location.pathname.includes('mixtape') ? 'mixtape' :
     location.pathname.includes('labels') ? 'labels' :
     location.pathname.includes('producers') ? 'producers' :
     location.pathname.includes('cyphers') ? 'cyphers' :
     'landing');

  /* GSAP scroll reveals · registered once per page load */
  function initScrollReveals() {
    const reveal = () => $$('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
    if (prefersReducedMotion()) { reveal(); return; }
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-revealed'); io.unobserve(e.target); } });
      }, { threshold: 0.12 });
      $$('[data-reveal]').forEach(el => io.observe(el));
      setTimeout(reveal, 1800);
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 82%',
      onEnter: batch => gsap.to(batch, {
        opacity: 1, y: 0, duration: 0.85, stagger: 0.12,
        ease: 'power3.out', overwrite: true,
        onStart: () => batch.forEach(el => el.classList.add('is-revealed'))
      }),
      onLeaveBack: batch => {
        if (prefersReducedMotion()) return;
        gsap.set(batch, { opacity: 0, y: 60, overwrite: true });
      }
    });
    setTimeout(reveal, 2200);
  }

  if (page === 'landing') initLanding();
  if (page === 'build') initBuilder();
  if (page === 'artist') initArtist();
  if (page === 'city') initCity();
  if (page === 'tier') initTier();
  if (page === 'leaderboard') initLeaderboard();
  if (page === 'beefs') initBeefs();
  if (page === 'slang') initSlang();
  if (page === 'timeline') initTimeline();
  if (page === 'compare') initCompare();
  if (page === 'mixtape') initMixtape();
  if (page === 'labels') initLabels();
  if (page === 'producers') initProducers();
  if (page === 'cyphers') initCyphers();

  /* ============================================================
     landing · real photos in ticker, bar of day, saved hint
     ============================================================ */
  async function initLanding() {
    await loadArtists();
    const ballots = await liveBallotCount();
    const rankNote = $('#landingRankNote');
    if (rankNote) rankNote.textContent = rankFootnote(ballots);
    const heroTag = $('#heroRankNote');
    if (heroTag) {
      heroTag.textContent = ballots > 0
        ? `${ballots.toLocaleString('en-IN')} ballots in · pen game live`
        : (API_LIVE === false
            ? 'pen-game seed · ballots API offline'
            : 'pen-game seed until you drop a top 5');
    }

    // top 5 · HARDCORE ONLY · landing front door never shows crossovers
    const pool = hardcorePool(ARTISTS);
    const total = totalVotes(pool);
    const top5 = [...pool].sort((a, b) => mockVotes(b) - mockVotes(a)).slice(0, 5);
    const tickets = $('#tickets');
    if (tickets) {
      tickets.innerHTML = top5.map((a, i) => {
        const pct = pctOf(a, total).toFixed(1);
        return `
          <li class="ticket ticket-with-photo">
            <span class="ticket__rank">${String(i+1).padStart(2,'0')}</span>
            <span class="ticket__photo">${photoHtml(a)}</span>
            <span class="ticket__body">
              <a href="/artist.html?slug=${esc(a.slug)}" style="color:inherit">
                <span class="ticket__name">${esc(a.stage_name)}</span>
              </a>
              <span class="ticket__city">${esc(lower(a.city_represented))}${a.active_status === 'RIP' ? ' · r.i.p.' : ''}</span>
            </span>
            <span class="ticket__stat"><span class="pct">${pct}%</span>${rankShareLabel(ballots)}</span>
          </li>`;
      }).join('');
    }
    // rank-mode toggle on landing
    const modeToggle = $('#rankToggle');
    if (modeToggle) {
      modeToggle.innerHTML = `
        <button class="mode-tab ${rankMode() === 'respect' ? 'is-active' : ''}" data-mode="respect">by pen game</button>
        <button class="mode-tab ${rankMode() === 'streams' ? 'is-active' : ''}" data-mode="streams">by streams</button>`;
      $$('.mode-tab', modeToggle).forEach(btn => {
        btn.addEventListener('click', () => {
          setRankMode(btn.dataset.mode);
          location.reload();
        });
      });
    }

    // artist of the day · biased toward hardcore S/A/B respect tier, excludes crossovers
    const aotdSeed = Math.floor(Date.now() / 86400000);
    const spotlightPool = ARTISTS.filter(a => !a.is_crossover && ['S','A','B'].includes(a.respect_tier || ''));
    const aotd = spotlightPool[aotdSeed % spotlightPool.length];
    const aotdEl = $('#artistOfDay');
    if (aotdEl && aotd) {
      aotdEl.classList.remove('bar-of-day');
      aotdEl.classList.add('cassette');
      const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const subBits = [aotd.city_represented, aotd.era, aotd.subgenre].filter(Boolean).join(' · ').toLowerCase();
      aotdEl.innerHTML = `
        <div class="cassette__hubs" aria-hidden="true">
          <div class="cassette__hub"></div>
          <div class="cassette__hub"></div>
        </div>
        <div class="cassette__head">
          <span class="stripe">artist of the day</span>
          <span>SIDE A · ${esc(date)} · ${esc(aotd.popularity_tier)}-TIER</span>
        </div>
        <div class="cassette__body">
          <div class="aotd-grid">
            <div class="aotd-photo">${photoHtml(aotd)}</div>
            <div class="aotd-body">
              <a href="/artist.html?slug=${esc(aotd.slug)}" style="color:inherit; display:block">
                <div class="aotd-name">${esc(aotd.stage_name)}</div>
              </a>
              <div class="aotd-sub">${esc(subBits)}</div>
              ${aotd.notable_tracks && aotd.notable_tracks.length ? `
                <div class="aotd-tracks">three to play · ${aotd.notable_tracks.slice(0,3).map(t => `<em>${esc(t)}</em>`).join(' · ')}</div>
              ` : ''}
              <a href="/artist.html?slug=${esc(aotd.slug)}" class="aotd-cta">open profile · play in spotify →</a>
            </div>
          </div>
        </div>`;
    }

    // hero marquee · HARDCORE ONLY · cinematic photo strip · no crossovers, ever
    const marqueeWrap = $('#marquee');
    if (marqueeWrap) {
      const stripPool = hardcorePool(ARTISTS).filter(a => ['S','A','B'].includes(a.respect_tier || ''));
      const ranked = [...stripPool].sort((a, b) => mockVotes(b) - mockVotes(a)).slice(0, 32);
      const doubled = ranked.concat(ranked);
      marqueeWrap.innerHTML = `
        <div class="marquee__inner">
          ${doubled.map(a => `
            <a class="marquee__item" href="/artist.html?slug=${esc(a.slug)}">
              <span class="ph">${photoHtml(a)}</span>
              <span class="marquee__caption">
                <span class="nm">${esc(a.stage_name)}</span>
                <span class="ct">${esc(lower(a.city_represented || ''))}</span>
              </span>
            </a>`).join('')}
        </div>`;
    }

    // saved-state hint (you locked in a top 5)
    try {
      const last = JSON.parse(localStorage.getItem('rep:last_top5') || 'null');
      if (last && last.picks && last.picks.length === 5) {
        const hint = $('#savedHint');
        if (hint) {
          const names = last.picks.map(s => BY_SLUG[s]?.stage_name).filter(Boolean).slice(0, 3).join(', ');
          hint.style.display = 'flex';
          hint.querySelector('.text').textContent = `you locked in a top 5 · ${names}, +2 more`;
        }
      }
    } catch {}

    // beef preview · pull from beefs.json
    try {
      const beefData = await (await fetch('/data/beefs.json?v=20260610-1')).json();
      const beefs = $('#beefPreview');
      if (beefs && beefData.beefs) {
        beefs.innerHTML = beefData.beefs.slice(0, 3).map(b => {
          const a = BY_SLUG[b.actor_a], c = BY_SLUG[b.actor_b];
          return `
            <a class="beef-card" href="/beefs.html#${esc(b.slug)}">
              <span class="beef-card__year">${b.year}</span>
              <span class="beef-card__name">${esc(a?.stage_name || b.actor_a).toUpperCase()}</span>
              <span class="beef-card__vs">vs</span>
              <span class="beef-card__name">${esc(c?.stage_name || b.actor_b).toUpperCase()}</span>
            </a>`;
        }).join('');
      }
    } catch {}

    // daily 1v1 · hardcore matchups, no crossovers in the rotation
    // daily 1v1 · real, votable matchup from the backend. falls back to a
    // deterministic seed pair when the worker isn't running (static preview).
    const seedPairs = [
      ['krsna', 'seedhe-maut', 'delhi pen game · solo vs duo'],
      ['hanumankind', 'mc-altaf', 'global trap vs dharavi street'],
      ['yashraj', 'the-siege', 'mumbai new wave · two pens'],
      ['divine', 'naezy', 'the gully wave · founder vs cult OG']
    ];
    const seedPair = seedPairs[Math.floor(Date.now() / 86400000) % seedPairs.length];
    const duel = $('#duelRoot') || $('.duel');
    const duelTheme = $('#duelTheme') || $('.duel__theme');
    if (duel) {
      let daily = null;
      try { daily = await API.get('/daily'); } catch { /* offline → seed pair */ }
      const live = !!daily;
      const aSlug = live ? daily.artist_a : seedPair[0];
      const bSlug = live ? daily.artist_b : seedPair[1];
      const theme = live ? daily.theme : seedPair[2];
      const aa = BY_SLUG[aSlug], bb = BY_SLUG[bSlug];
      const st = {
        voted: live ? daily.voted : false,
        pick: live ? daily.pick : null,
        va: live ? daily.votes_a : 0,
        vb: live ? daily.votes_b : 0,
      };
      if (aa && bb) {
        const sideStyle = 'text-align:left; width:100%;';
        const paint = () => {
          const tot = st.va + st.vb;
          const showRes = st.voted;
          const pa = tot ? Math.round(st.va / tot * 100) : 0;
          const pb = tot ? Math.round(st.vb / tot * 100) : 0;
          const tag = (slug, pct, n) =>
            (showRes ? ` · ${pct}%` : '') + (st.pick === slug ? ' · your pick' : '');
          duel.innerHTML = `
            <button class="duel__side" data-slug="${esc(aSlug)}" ${st.voted ? 'disabled' : ''} style="${sideStyle}">
              <div class="duel__photo">${photoHtml(aa)}</div>
              <div class="duel__name">${esc(aa.stage_name)}</div>
              <div class="duel__city">${esc(lower(aa.city_represented))}${tag(aSlug, pa, st.va)}</div>
            </button>
            <div class="duel__vs">vs</div>
            <button class="duel__side" data-slug="${esc(bSlug)}" ${st.voted ? 'disabled' : ''} style="${sideStyle}">
              <div class="duel__photo">${photoHtml(bb)}</div>
              <div class="duel__name">${esc(bb.stage_name)}</div>
              <div class="duel__city">${esc(lower(bb.city_represented))}${tag(bSlug, pb, st.vb)}</div>
            </button>`;
          $$('.duel__photo', duel).forEach(el => { el.style.padding = '0'; el.style.overflow = 'hidden'; });
          if (!st.voted) {
            $$('.duel__side', duel).forEach(side => side.addEventListener('click', async () => {
              if (st.voted) return;
              st.voted = true;
              $$('.duel__side', duel).forEach(b => { b.disabled = true; });
              const pick = side.dataset.slug;
              try {
                const res = await API.post('/daily/vote', { pick });
                st.va = res.votes_a; st.vb = res.votes_b; st.pick = res.pick;
              } catch {
                if (pick === aSlug) st.va++; else st.vb++; st.pick = pick;
              }
              paint();
              if (duelTheme) duelTheme.innerHTML = `${esc(theme)} · you voted · one vote per head`;
            }));
          }
        };
        paint();
        if (duelTheme) duelTheme.innerHTML = live
          ? `${esc(theme)} · tap a side · one vote per head${st.voted ? ' · you voted' : ''}`
          : `${esc(theme)} · preview pair · votes stay local until API ships`;
      }
    }

    // community write-back · real defend wall + "who's missing" suggestions
    wireDefendWall();
    wireSuggestions();

    // feature showcase mockups · dense, photo-driven, no empty paper
    renderFeatureMockups();
    setTimeout(initScrollReveals, 50);

    function renderFeatureMockups() {
      const hcRanked = [...hardcorePool(ARTISTS)].sort((a, b) => mockVotes(b) - mockVotes(a));
      const top5 = hcRanked.slice(0, 5);

      // Top 5 mockup · 5 rows fully populated, taller cards, with mock pct
      const m1 = $('#mockupTop5');
      if (m1) {
        const total = totalVotes(hardcorePool(ARTISTS));
        m1.innerHTML = `
          <div class="mockup-top5__hdr">
            <span>top 5 · ${API_LIVE ? 'live' : 'seed'}</span>
            <span class="mockup-top5__hdr-side">pen game</span>
          </div>
          ${top5.map((a, i) => {
            const pct = pctOf(a, total).toFixed(1);
            return `
              <div class="mockup-top5__row">
                <span class="n">${String(i+1).padStart(2,'0')}</span>
                <span class="ph">${photoHtml(a)}</span>
                <span class="mockup-top5__body">
                  <span class="nm">${esc(a.stage_name)}</span>
                  <span class="ct">${esc(lower(a.city_represented || ''))}</span>
                </span>
                <span class="mockup-top5__pct">${pct}%</span>
              </div>`;
          }).join('')}
          <div class="mockup-top5__foot">drag · tap · reorder · defend · lock</div>`;
      }

      // Tier mockup · 5 rows FULLY populated with 6 photos each, plus rank context
      const m2 = $('#mockupTier');
      if (m2) {
        const byTier = (t) => ARTISTS.filter(a => a.respect_tier === t && !a.is_crossover);
        m2.innerHTML = ['S','A','B','C','D'].map(t => {
          const arts = byTier(t).slice(0, 6);
          return `
            <div class="mockup-tier__row" data-tier="${t}">
              <div class="lt">${t}</div>
              <div class="rs">
                ${arts.map(a => `<div class="dot">${photoHtml(a)}</div>`).join('')}
              </div>
            </div>`;
        }).join('') + `<div class="mockup-tier__foot">EXPORT AS PNG · 1080×1350</div>`;
      }

      // Share mockup · build a mini share card preview that fills the space
      const m3 = $('#mockupShareBody');
      if (m3) {
        m3.innerHTML = top5.map((a, i) => `
          <div class="row">
            <span class="num">${String(i+1).padStart(2,'0')}</span>
            <span class="ph-sm">${photoHtml(a)}</span>
            <span class="nm">${esc(a.stage_name)}</span>
          </div>`).join('');
      }
    }

    // city bento · render dynamically with photo thumbs · no rotation, no stripes
    renderCityBento();
    function renderCityBento() {
      const bento = $('#cityBento');
      if (!bento) return;
      const groups = cityBentoGroups();
      Object.entries(groups).forEach(([city, g]) => {
        if (city === 'Northeast') g.sub = `eight states · ${g.artists.length} artists`;
      });
      bento.innerHTML = Object.entries(groups).map(([city, g]) => {
        const photoStack = g.artists.slice(0, 4).map(a => `<span class="bento-city__photo">${photoHtml(a)}</span>`).join('');
        const href = g.href || `/city.html?city=${esc(city)}`;
        return `
          <a class="bento-city bento-city--${g.size}" data-city="${esc(lower(city))}" href="${href}">
            <div class="bento-city__top">
              <span class="bento-city__count">${g.artists.length} artists</span>
              <span class="bento-city__tag">${esc(g.tag)}</span>
            </div>
            <h3 class="bento-city__name">${esc(city)}</h3>
            <p class="bento-city__sub">${esc(g.sub)}</p>
            <div class="bento-city__photos">${photoStack}</div>
            <div class="bento-city__cta">view the roster →</div>
          </a>`;
      }).join('');
    }

    // vault · dark compact grid · no rotation
    renderVault();
    async function renderVault() {
      const wrap = $('#vaultGrid');
      if (!wrap) return;
      let slangN = 19, tlN = 22, cypherN = 4, labelN = 10, beefN = 3;
      try {
        const [sl, tl, cy, lb, bf] = await Promise.all([
          fetch('/data/slang.json?v=20260610-1').then(r => r.json()),
          fetch('/data/timeline.json?v=20260610-1').then(r => r.json()),
          fetch('/data/cyphers.json?v=20260610-1').then(r => r.json()),
          fetch('/data/labels.json?v=20260610-1').then(r => r.json()),
          fetch('/data/beefs.json?v=20260610-1').then(r => r.json()),
        ]);
        slangN = sl.terms?.length || slangN;
        tlN = tl.milestones?.length || tlN;
        cypherN = cy.cyphers?.length || cypherN;
        labelN = lb.labels?.length || labelN;
        beefN = bf.beefs?.length || beefN;
      } catch { /* keep fallbacks */ }
      const items = [
        { href: '/labels.html', n: '01', t: 'LABELS', sub: 'the institutions', stat: `${labelN} labels` },
        { href: '/producers.html', n: '02', t: 'PRODUCERS', sub: 'the unsung hands', stat: '6 boards' },
        { href: '/cyphers.html', n: '03', t: 'CYPHERS', sub: 'scene snapshots', stat: `${cypherN} tracks` },
        { href: '/slang.html', n: '04', t: 'SLANG', sub: 'the dictionary', stat: `${slangN} terms` },
        { href: '/timeline.html', n: '05', t: 'TIMELINE', sub: '1992 to 2026', stat: `${tlN} milestones` },
        { href: '/compare.html', n: '06', t: 'COMPARE', sub: 'stat-by-stat', stat: 'two artists' },
        { href: '/mixtape.html', n: '07', t: 'MIXTAPE', sub: 'side A · your taste', stat: '10 slots' },
        { href: '/leaderboard.html', n: '08', t: 'TOP ' + rosterCount(), sub: 'full india board', stat: 'pen + streams' },
        { href: '/beefs.html', n: '09', t: 'BEEFS', sub: 'receipts attached', stat: `${beefN} verified` }
      ];
      wrap.innerHTML = items.map(i => `
        <a class="vault-item" href="${i.href}">
          <span class="vault-item__n">${i.n}</span>
          <h3 class="vault-item__t">${i.t}</h3>
          <p class="vault-item__sub">${i.sub}</p>
          <span class="vault-item__stat">${i.stat}</span>
          <span class="vault-item__cta">open →</span>
        </a>`).join('');
    }

    // dynamic city counts on landing tiles
    const cityCount = (key) => {
      if (key === 'Punjab') return ARTISTS.filter(a => a.state === 'Punjab').length;
      if (key === 'Shillong' || key === 'Northeast') return ARTISTS.filter(a => NE_STATES.includes(a.state)).length;
      if (key === 'Delhi') return ARTISTS.filter(a => a.state === 'Delhi NCR').length;
      return ARTISTS.filter(a => a.city_represented === key || (a.city_represented || '').includes(key)).length;
    };
    $$('.tag[data-city]').forEach(tile => {
      const key = tile.querySelector('.tag__city').textContent.trim();
      const count = cityCount(key);
      const blurb = tile.querySelector('.tag__count');
      if (blurb && count > 0) {
        const original = blurb.textContent;
        blurb.textContent = `${count} artists · ${original}`;
      }
    });

    const dice = $('#diceBtn');
    if (dice) {
      dice.addEventListener('click', () => {
        const a = ARTISTS[Math.floor(Math.random() * ARTISTS.length)];
        location.href = `/artist.html?slug=${a.slug}`;
      });
    }

    if (duel) duel.classList.remove('duel--loading');
  }

  /* ============================================================
     builder · top 5 drag-drop (kept from v1, photos added)
     ============================================================ */
  async function initBuilder() {
    await loadArtists();
    const state = {
      filtered: ARTISTS.slice(),
      slots: [null, null, null, null, null],
      filters: { city: '', era: '', subgenre: '', language: '', search: '' },
      defense: '',
      handle: '',
      activeSlot: null
    };
    try {
      const last = JSON.parse(localStorage.getItem('rep:last_top5') || 'null');
      if (last?.picks?.length === 5) {
        last.picks.forEach((slug, i) => { state.slots[i] = BY_SLUG[slug] || null; });
        state.defense = last.defense || '';
        state.handle = last.handle || '';
        const restore = $('#builderRestore');
        if (restore) {
          restore.hidden = false;
          restore.innerHTML = `<span>editing your saved top 5</span><button type="button" class="dice-btn" id="clearRestore">start fresh</button>`;
          $('#clearRestore', restore)?.addEventListener('click', () => {
            state.slots = [null, null, null, null, null];
            state.defense = '';
            restore.hidden = true;
            $('#defense').value = '';
            $('#handle').value = '';
            renderSlots(); renderGrid(); updateLock();
          });
        }
        const defEl = $('#defense');
        if (defEl) { defEl.value = state.defense; $('#defenseChar').textContent = `${state.defense.length}/140`; }
        const hEl = $('#handle');
        if (hEl) hEl.value = state.handle;
      }
    } catch { /* ignore corrupt save */ }
    populateFilters();
    renderGrid();
    renderSlots();

    function populateFilters() {
      const cities = unique(ARTISTS.map(a => a.city_represented)).sort();
      const eras = unique(ARTISTS.map(a => a.era));
      const subs = unique(ARTISTS.map(a => a.subgenre));
      const langs = unique(ARTISTS.flatMap(a => a.language || [])).sort();
      fill('#fCity', cities, 'all cities');
      fill('#fEra', eras, 'all eras');
      fill('#fSubgenre', subs, 'all subgenres');
      fill('#fLanguage', langs, 'all languages');
      ['fCity','fEra','fSubgenre','fLanguage'].forEach(id => {
        $('#' + id).addEventListener('change', (e) => {
          state.filters[id.slice(1).toLowerCase()] = e.target.value;
          applyFilters();
        });
      });
      $('#fSearch').addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase().trim();
        applyFilters();
      });
    }
    function fill(sel, items, allLabel) {
      $(sel).innerHTML = `<option value="">${allLabel}</option>` +
        items.map(v => `<option value="${esc(v)}">${esc(lower(v))}</option>`).join('');
    }
    function applyFilters() {
      const f = state.filters;
      state.filtered = ARTISTS.filter(a => {
        if (f.city && a.city_represented !== f.city) return false;
        if (f.era && a.era !== f.era) return false;
        if (f.subgenre && a.subgenre !== f.subgenre) return false;
        if (f.language && !(a.language || []).includes(f.language)) return false;
        if (f.search) {
          const hay = (a.stage_name + ' ' + (a.city_represented||'') + ' ' + (a.tags||[]).join(' ')).toLowerCase();
          if (!hay.includes(f.search)) return false;
        }
        return true;
      });
      renderGrid();
    }

    function renderGrid() {
      const grid = $('#grid');
      $('#poolCount').textContent = `${state.filtered.length} / ${ARTISTS.length} artists`;
      if (!state.filtered.length) {
        grid.innerHTML = '<p class="empty-grid">nobody in this pocket of the scene yet. try another filter.</p>';
        return;
      }
      const pickedSet = new Set(state.slots.filter(Boolean).map(a => a.slug));
      grid.innerHTML = state.filtered.map(a => cardHtml(a, { pickedSet })).join('');

      $$('.card', grid).forEach(card => {
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/slug', card.dataset.slug);
          card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', () => { card.style.opacity = ''; });
        card.addEventListener('click', () => {
          if (card.classList.contains('is-picked')) return;
          let idx = state.activeSlot;
          if (idx == null || state.slots[idx]) idx = state.slots.findIndex(s => !s);
          if (idx === -1) { toast('all five slots full · remove someone first'); return; }
          pickArtist(card.dataset.slug, idx);
          state.activeSlot = null;
          $$('.slot').forEach(s => s.classList.remove('is-target'));
        });
      });
    }

    function renderSlots() {
      $$('.slot').forEach((el, i) => {
        const a = state.slots[i];
        el.classList.toggle('is-filled', !!a);
        const body = $('.slot__body', el);
        if (a) {
          body.innerHTML = `
            <span class="slot__photo">${photoHtml(a)}</span>
            <span class="slot__text">
              <span class="slot__name">${esc(a.stage_name)}</span>
              <span class="slot__city">${esc(lower(a.city_represented))}</span>
            </span>`;
        } else {
          body.innerHTML = '<span class="slot__empty">drop someone here</span>';
        }
        el.ondragover = (e) => { e.preventDefault(); el.classList.add('is-drop-target'); };
        el.ondragleave = () => el.classList.remove('is-drop-target');
        el.ondrop = (e) => {
          e.preventDefault();
          el.classList.remove('is-drop-target');
          const slug = e.dataTransfer.getData('text/slug');
          if (slug) pickArtist(slug, i);
        };
        const rm = $('.slot__remove', el);
        if (rm) {
          const who = a ? a.stage_name : `slot ${i + 1}`;
          rm.setAttribute('aria-label', `remove ${who} from slot ${i + 1}`);
          rm.onclick = () => { state.slots[i] = null; renderSlots(); renderGrid(); updateLock(); };
        }
        el.onclick = (e) => {
          if (e.target.closest('.slot__remove')) return;
          state.activeSlot = i;
          $$('.slot').forEach(s => s.classList.remove('is-target'));
          el.classList.add('is-target');
        };
      });
      updateLock();
    }

    function pickArtist(slug, slotIdx) {
      const artist = BY_SLUG[slug];
      if (!artist) return;
      state.slots = state.slots.map(s => s && s.slug === slug ? null : s);
      state.slots[slotIdx] = artist;
      renderSlots();
      renderGrid();
    }

    function updateLock() {
      const btn = $('#lockBtn');
      const filled = state.slots.filter(Boolean).length;
      btn.disabled = filled < 5;
      const hasSaved = !!localStorage.getItem('rep:last_top5');
      btn.textContent = filled < 5 ? `pick ${5 - filled} more` : (hasSaved ? 'lock & share again' : 'lock it in');
    }

    const defenseEl = $('#defense');
    if (defenseEl) defenseEl.addEventListener('input', (e) => {
      state.defense = e.target.value.slice(0, 140);
      if (state.defense !== e.target.value) e.target.value = state.defense;
      $('#defenseChar').textContent = state.defense.length + '/140';
    });
    const handleEl = $('#handle');
    if (handleEl) handleEl.addEventListener('input', (e) => {
      let v = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
      e.target.value = v ? '@' + v : '';
      state.handle = v;
    });

    $('#lockBtn').addEventListener('click', async () => {
      if (state.slots.filter(Boolean).length < 5) return;
      const payload = {
        picks: state.slots.map(a => a.slug),
        defense: state.defense,
        handle: state.handle,
        created_at: Date.now()
      };
      localStorage.setItem('rep:last_top5', JSON.stringify(payload));

      // submit the ballot to the live board (counts toward the live top-N).
      // non-blocking + best-effort: a render failure must never lose the card.
      try {
        const res = await API.post('/lists', {
          type: 'top5',
          picks: payload.picks,
          defense: state.defense || null,
          username: state.handle || null,
        });
        if (res && res.id) localStorage.setItem('rep:last_ballot_id', res.id);
      } catch (e) { /* offline / static preview — card still renders below */ }

      // build the share card PNG
      const btn = $('#lockBtn');
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'rendering your card…';
      try {
        const picks = state.slots;
        const canvas = await buildShareCard({ picks, defense: state.defense, handle: state.handle });
        const filename = `rep-top5-${(state.handle || 'anon')}.png`;
        showShareModal('your DHH top 5', canvas, filename);
      } catch (e) {
        console.error(e);
        toast('PNG render hit an error · try refreshing');
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });
  }

  /* ============================================================
     artist profile · query string ?slug=
     ============================================================ */
  async function initArtist() {
    await loadArtists();
    const ballots = await liveBallotCount();
    const slug = new URLSearchParams(location.search).get('slug');
    const a = BY_SLUG[slug];
    if (!a) { $('#artistRoot').innerHTML = '<p class="empty-grid">artist not found. check the link.</p>'; return; }

    // load bios in parallel; ok if missing
    let bio = null;
    try {
      const biosData = await (await fetch('/data/bios.json?v=20260610-1')).json();
      bio = biosData.bios?.[slug] || null;
    } catch {}

    const total = totalVotes(ARTISTS);
    const sortedByPct = [...ARTISTS].sort((x, y) => mockVotes(y) - mockVotes(x));
    const rank = sortedByPct.findIndex(x => x.slug === a.slug) + 1;
    const pct = pctOf(a, total).toFixed(2);

    const cityRank = [...ARTISTS]
      .filter(x => x.city_represented === a.city_represented)
      .sort((x, y) => mockVotes(y) - mockVotes(x))
      .findIndex(x => x.slug === a.slug) + 1;
    const eraRank = [...ARTISTS]
      .filter(x => x.era === a.era)
      .sort((x, y) => mockVotes(y) - mockVotes(x))
      .findIndex(x => x.slug === a.slug) + 1;

    const similar = ARTISTS
      .filter(x => x.slug !== a.slug && (
        x.city_represented === a.city_represented ||
        x.subgenre === a.subgenre ||
        x.era === a.era
      ))
      .sort((x, y) => mockVotes(y) - mockVotes(x))
      .slice(0, 6);

    updatePageMeta({
      title: `${a.stage_name} · Rep`,
      description: `${a.stage_name} — ${a.city_represented || 'DHH'} · ${a.era || ''} · India rank #${rank}. Spotify, tracks, similar artists.`
    });
    const subBits = [];
    if (a.real_name) subBits.push(a.real_name);
    subBits.push(a.city_represented);
    if (a.era) subBits.push(a.era.toLowerCase());
    if (a.subgenre) subBits.push(a.subgenre.toLowerCase());
    if (a.label) subBits.push(a.label.toLowerCase());

    const pills = (a.tags || []).map(t => {
      const cls = t === 'RIP' ? 'is-rip' : t === 'mainstream' ? 'is-mainstream' : '';
      return `<span class="tag-pill ${cls}">${esc(t)}</span>`;
    }).join('');

    const tracks = (a.notable_tracks || []).slice(0, 6).map((t, i) => `
      <div class="track-row">
        <span class="num">${String(i+1).padStart(2,'0')}</span>
        <span class="name">${esc(t)}</span>
        <a class="spot" target="_blank" rel="noopener" href="${esc(a.spotify_url || '#')}">spotify</a>
      </div>`).join('');

    $('#artistRoot').innerHTML = `
      <div class="artist-hero">
        <div class="artist-photo">
          ${photoHtml(a)}
        </div>
        <div class="artist-meta">
          <div class="artist-meta__kicker">${a.active_status === 'RIP' ? '· r.i.p. ·' : esc(rankFootnote(ballots))}</div>
          <h1 class="artist-meta__name">${esc(a.stage_name)}</h1>
          <p class="artist-meta__sub">${esc(subBits.join(' · '))}</p>
          ${a.note ? `<p style="font-family: var(--font-serif); font-size: 16px; color: var(--ink-soft); line-height: 1.5;">${esc(a.note)}</p>` : ''}
          <div class="tag-pills">${pills}</div>
          <div class="artist-actions">
            <a class="feature__cta" href="/build.html">add to top 5 →</a>
            <a class="feature__cta" href="/compare.html?a=${esc(a.slug)}&b=${esc(similar[0]?.slug || 'krsna')}">compare →</a>
            ${a.city_represented ? `<a class="feature__cta" href="/city.html?city=${encodeURIComponent(a.city_represented)}">← ${esc(lower(a.city_represented))}</a>` : ''}
          </div>
          ${bio ? `
            <div class="artist-bio">
              <div class="artist-bio__head">${esc(bio.headline)}</div>
              ${bio.paragraphs.map(p => `<p class="artist-bio__p">${esc(p)}</p>`).join('')}
            </div>` : ''}
          <div class="artist-stats">
            <div class="row"><span>india rank</span><strong>#${rank}</strong></div>
            <div class="row"><span>in ${esc(lower(a.city_represented))}</span><strong>#${cityRank}</strong></div>
            <div class="row"><span>in ${esc(lower(a.era))}</span><strong>#${eraRank}</strong></div>
            <div class="row"><span>${esc(rankShareLabel(ballots))}</span><strong>${pct}%</strong></div>
          </div>
          ${ROSTER_META.data_audit_at ? `<p class="artist-meta__verified">roster facts last verified ${esc(ROSTER_META.data_audit_at)}</p>` : ''}
        </div>
      </div>

      <div class="artist-section">
        <h3>listen <span class="burn">·</span> spotify</h3>
        <div class="artist-embed">
          <iframe src="https://open.spotify.com/embed/artist/${esc(a.spotify_id || '')}?utm_source=rep"
                  width="100%" height="352" loading="lazy" allowfullscreen
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>
        </div>
      </div>

      ${tracks ? `
      <div class="artist-section">
        <h3>notable <span class="burn">tracks</span></h3>
        <div class="tracks-list">${tracks}</div>
      </div>` : ''}

      <div class="artist-section">
        <h3>fans also <span class="burn">pick</span></h3>
        <div class="similar-grid">
          ${similar.map(s => cardHtml(s, { link: true, draggable: false })).join('')}
        </div>
      </div>

      <div class="artist-section" id="artistDefend">
        <h3>defend <span class="burn">${esc(a.stage_name.toLowerCase())}</span></h3>
        <p class="artist-defend-note" id="artistDefendNote">top takes from the wall · drop yours from the builder</p>
        <div class="defend-list defend-list--artist" id="artistDefendList"></div>
      </div>
    `;
    wireArtistDefends(slug);
  }

  async function wireArtistDefends(slug) {
    const list = $('#artistDefendList');
    if (!list) return;
    let takes = [];
    try { takes = await API.get('/defend?sort=top&limit=20'); } catch { /* seed mode */ }
    const filtered = (Array.isArray(takes) ? takes : []).filter(t => t.defending === slug);
    if (filtered.length) {
      list.innerHTML = filtered.map(t => `
        <figure class="quote">
          <p class="quote__text">${esc(t.text || t.defense || '')}</p>
          <figcaption class="quote__meta">
            <span class="defending">community take</span>
            ${t.upvotes ? `<span>▲ ${t.upvotes}</span>` : ''}
          </figcaption>
        </figure>`).join('');
    } else {
      list.innerHTML = `
        <figure class="quote">
          <p class="quote__text">drop a one-liner from the builder · 140 chars · defend your #1</p>
          <figcaption class="quote__meta"><span class="quote__badge">seed mode</span></figcaption>
        </figure>`;
    }
  }

  /* ============================================================
     city page · query string ?city=Mumbai
     ============================================================ */
  function renderCityPicker() {
    const groups = cityBentoGroups();
    const tiles = Object.entries(groups).map(([city, g]) => {
      const href = g.href || `/city.html?city=${encodeURIComponent(city)}`;
      const photoStack = g.artists.slice(0, 3).map(a => `<span class="bento-city__photo">${photoHtml(a)}</span>`).join('');
      return `
        <a class="bento-city bento-city--${g.size}" href="${href}">
          <div class="bento-city__top">
            <span class="bento-city__count">${g.artists.length} artists</span>
            <span class="bento-city__tag">${esc(g.tag)}</span>
          </div>
          <h3 class="bento-city__name">${esc(city)}</h3>
          <p class="bento-city__sub">${esc(g.sub)}</p>
          <div class="bento-city__photos">${photoStack}</div>
          <div class="bento-city__cta">open city profile →</div>
        </a>`;
    }).join('');
    updatePageMeta({ title: 'Cities · Rep', description: 'Pick a DHH city or region — Mumbai, Delhi, Punjab, Northeast, and more.' });
    $('#cityRoot').innerHTML = `
      <section class="hero" style="padding: 40px 0 24px;">
        <p class="hero__kicker">nine regions · ten cities represented</p>
        <h1 class="hero__rep" style="font-size: clamp(64px, 12vw, 120px);">REP YOUR <span class="tilt">CITY</span></h1>
        <p class="hero__sub">the gully is hyperlocal · pick a door</p>
      </section>
      <div class="bento-cities city-picker-grid">${tiles}</div>`;
  }

  async function initCity() {
    await loadArtists();
    const city = new URLSearchParams(location.search).get('city');
    if (!city) { renderCityPicker(); return; }

    // Region grouping · "Punjab" + "Northeast" are scopes that span multiple cities
    let inCity;
    if (city === 'Punjab') {
      inCity = ARTISTS.filter(a => a.state === 'Punjab');
    } else if (city === 'Northeast' || city === 'Shillong') {
      inCity = ARTISTS.filter(a => NE_STATES.includes(a.state));
    } else {
      inCity = ARTISTS.filter(a =>
        a.city_represented === city ||
        (a.city_represented && a.city_represented.includes(city))
      );
    }
    if (!inCity.length) { $('#cityRoot').innerHTML = `<p class="empty-grid">no one repping ${esc(city)} yet.</p>`; return; }

    const sorted = [...inCity].sort((x, y) => mockVotes(y) - mockVotes(x));
    const top10 = sorted.slice(0, 10);
    document.title = `${city} · Rep`;
    document.body.dataset.accent = lower(city);

    // city blurbs
    const blurbs = {
      'mumbai': { sub: 'the gully wave epicenter. dharavi · kurla · andheri · mira road.', deva: 'मुंबई', tagline: 'where the wave broke first.' },
      'delhi': { sub: 'the conscious wave. lyrical maximalists. azadi alumni. dl91 era.', deva: 'दिल्ली', tagline: 'where the pen got sharp.' },
      'punjab': { sub: 'the parallel kingdom. mansa to surrey. brampton to ludhiana.', deva: 'ਪੰਜਾਬ', tagline: 'where the genre never needed permission.' },
      'bengaluru': { sub: 'global lane. brodha v turned hanumankind. small but loud.', deva: 'ಬೆಂಗಳೂರು', tagline: 'where it got exported.' },
      'pune': { sub: 'drill capital. mc stan, vijay dk, the next wave.', deva: 'पुणे', tagline: 'where the autotune got sharp teeth.' },
      'shillong': { sub: 'the northeast nucleus. khasi blood, anthem builders, vogue covers.', deva: 'शिलांग', tagline: 'where the country forgot to look.' },
      'srinagar': { sub: 'kashmiri conscience. ahmer alone, but loud.', deva: 'श्रीनगर', tagline: 'where the politics writes itself.' },
      'chennai': { sub: 'tamil wave. hiphop tamizha, paal dabba, oorum blood.', deva: 'சென்னை', tagline: 'where the language is the beat.' },
      'ahmedabad': { sub: 'gujju shawn carter. dhanji solo. early days, big upside.', deva: 'અમદાવાદ', tagline: 'where the gujarati flag goes up.' },
      'northeast': { sub: 'the northeast nucleus. khasi blood, anthem builders, eight states one sound.', deva: 'पूर्वोत्तर', tagline: 'where the country forgot to look.' }
    };
    const meta = blurbs[lower(city)] || { sub: `${inCity.length} artists on the roster.`, deva: city, tagline: '' };
    updatePageMeta({
      title: `${city} · Rep`,
      description: `${inCity.length} DHH artists repping ${city}. Top 10, full roster, languages, era breakdown.`
    });

    $('#cityRoot').innerHTML = `
      <div class="city-hero">
        <div>
          <div class="city-hero__kicker">city profile · ${inCity.length} artists</div>
          <h1 class="city-hero__name">${esc(city)}</h1>
          <p class="city-hero__blurb">${esc(meta.sub)}</p>
        </div>
        <div class="city-hero__deva" aria-hidden="true">${esc(meta.deva)}</div>
      </div>

      <div class="city-stats">
        <div class="stat"><strong>${inCity.length}</strong>artists on the roster</div>
        <div class="stat"><strong>#${[...ARTISTS].sort((a,b)=>mockVotes(b)-mockVotes(a)).findIndex(a=>a.slug===top10[0].slug)+1}</strong>top artist in india</div>
        <div class="stat"><strong>${inCity.filter(a => a.popularity_tier === 'S' || a.popularity_tier === 'A').length}</strong>S+A tier</div>
        <div class="stat"><strong>${unique(inCity.flatMap(a => a.language || [])).length}</strong>languages spoken</div>
      </div>

      <div class="artist-section">
        <h3>${esc(lower(city))}'s <span class="burn">top 10</span></h3>
        <div class="lb-list">
          ${top10.map((a, i) => {
            const p = pctOf(a, totalVotes(ARTISTS)).toFixed(1);
            return `
              <a class="lb-row" href="/artist.html?slug=${esc(a.slug)}">
                <span class="lb-row__rank">${String(i+1).padStart(2,'0')}</span>
                <span class="lb-row__photo">${photoHtml(a)}</span>
                <span><span class="lb-row__name">${esc(a.stage_name)}</span><br><span class="lb-row__city">${esc(lower(a.city_of_origin || a.city_represented))}</span></span>
                <span class="lb-row__pct">${p}%</span>
                <span class="lb-row__tier">${esc(displayTier(a))}</span>
                <span class="lb-row__bar"><span style="width:${Math.min(100, parseFloat(p) * 6)}%"></span></span>
              </a>`;
          }).join('')}
        </div>
      </div>

      ${top10.length >= 2 ? `
      <div class="artist-section city-compare-cta">
        <a class="feature__cta" href="/compare.html?a=${esc(top10[0].slug)}&b=${esc(top10[1].slug)}">#1 vs #2 in ${esc(lower(city))} → compare</a>
      </div>` : ''}

      ${inCity.length > 10 ? `
      <div class="artist-section">
        <h3>full <span class="burn">roster</span></h3>
        <div class="similar-grid">
          ${sorted.slice(10).map(a => cardHtml(a, { link: true, draggable: false })).join('')}
        </div>
      </div>` : ''}

      <p class="city-back"><a href="/city.html">← all cities</a> · <a href="/">home</a></p>
    `;
  }

  /* ============================================================
     tier list maker
     ============================================================ */
  async function initTier() {
    await loadArtists();
    const state = {
      tiers: { S: [], A: [], B: [], C: [], D: [] },
      pool: ARTISTS.slice()
    };
    try {
      const saved = JSON.parse(localStorage.getItem('rep:tier_board') || 'null');
      if (saved?.tiers) {
        state.tiers = { S: [], A: [], B: [], C: [], D: [], ...saved.tiers };
        const placed = new Set(['S', 'A', 'B', 'C', 'D'].flatMap(t => state.tiers[t] || []));
        state.pool = ARTISTS.filter(a => !placed.has(a.slug));
      }
    } catch { /* ignore */ }

    function saveTierBoard() {
      localStorage.setItem('rep:tier_board', JSON.stringify({ tiers: state.tiers, updated: Date.now() }));
    }

    function placeInTier(slug, letter) {
      ['S', 'A', 'B', 'C', 'D'].forEach(t => { state.tiers[t] = (state.tiers[t] || []).filter(s => s !== slug); });
      state.pool = state.pool.filter(a => a.slug !== slug);
      state.tiers[letter].push(slug);
      render();
      $('#tierPicker')?.classList.remove('is-open');
    }

    function showTierPicker(slug) {
      const a = BY_SLUG[slug];
      if (!a) return;
      let picker = $('#tierPicker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = 'tierPicker';
        picker.className = 'tier-picker';
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-modal', 'true');
        document.body.appendChild(picker);
        picker.addEventListener('click', (e) => { if (e.target === picker) picker.classList.remove('is-open'); });
      }
      picker.innerHTML = `
        <div class="tier-picker__inner">
          <p class="tier-picker__title">place <strong>${esc(a.stage_name)}</strong></p>
          <div class="tier-picker__btns">
            ${['S', 'A', 'B', 'C', 'D'].map(L => `<button type="button" class="tier-picker__btn" data-tier="${L}">${L} tier</button>`).join('')}
          </div>
          <button type="button" class="dice-btn tier-picker__cancel">cancel</button>
        </div>`;
      $$('.tier-picker__btn', picker).forEach(btn => btn.addEventListener('click', () => placeInTier(slug, btn.dataset.tier)));
      $('.tier-picker__cancel', picker)?.addEventListener('click', () => picker.classList.remove('is-open'));
      picker.classList.add('is-open');
    }

    render();

    function render() {
      ['S','A','B','C','D'].forEach(letter => {
        const row = $(`.tier-row__drop[data-tier="${letter}"]`);
        row.innerHTML = state.tiers[letter].map(slug => miniHtml(BY_SLUG[slug])).join('');
        row.ondragover = (e) => { e.preventDefault(); row.classList.add('is-drop-target'); };
        row.ondragleave = () => row.classList.remove('is-drop-target');
        row.ondrop = (e) => {
          e.preventDefault();
          row.classList.remove('is-drop-target');
          const slug = e.dataTransfer.getData('text/slug');
          if (!slug) return;
          // remove from any tier first
          ['S','A','B','C','D'].forEach(t => { state.tiers[t] = state.tiers[t].filter(s => s !== slug); });
          // remove from pool
          state.pool = state.pool.filter(a => a.slug !== slug);
          // add to this tier
          state.tiers[letter].push(slug);
          render();
        };
        // tap-to-remove from tier
        $$('.tier-mini', row).forEach(m => {
          m.addEventListener('click', () => {
            const slug = m.dataset.slug;
            state.tiers[letter] = state.tiers[letter].filter(s => s !== slug);
            state.pool.push(BY_SLUG[slug]);
            render();
          });
          m.setAttribute('draggable', 'true');
          m.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/slug', m.dataset.slug));
        });
      });

      const poolEl = $('#tierPool');
      const ranked = ['S', 'A', 'B', 'C', 'D'].reduce((n, t) => n + (state.tiers[t]?.length || 0), 0);
      $('#tierPoolCount').textContent = `${state.pool.length} unranked · drag or tap`;
      const prog = $('#tierProgress');
      if (prog) prog.textContent = `${ranked} / ${ARTISTS.length} artists ranked · autosaved locally`;
      poolEl.innerHTML = state.pool.map(a => miniHtml(a)).join('');
      $$('.tier-mini', poolEl).forEach(m => {
        let dragged = false;
        m.setAttribute('draggable', 'true');
        m.addEventListener('dragstart', (e) => {
          dragged = true;
          e.dataTransfer.setData('text/slug', m.dataset.slug);
          m.style.opacity = '0.5';
        });
        m.addEventListener('dragend', () => { m.style.opacity = ''; setTimeout(() => { dragged = false; }, 50); });
        m.addEventListener('click', () => {
          if (dragged) return;
          showTierPicker(m.dataset.slug);
        });
      });
      saveTierBoard();
    }

    function miniHtml(a) {
      if (!a) return '';
      return `
        <div class="tier-mini" data-slug="${esc(a.slug)}" title="${esc(a.stage_name)}"
             tabindex="0" role="button" aria-label="${esc(a.stage_name)}">
          ${photoHtml(a)}
          <div class="tier-mini__label">${esc(a.stage_name)}</div>
        </div>`;
    }

    // keyboard parity for the tap targets · Enter/Space acts as click
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('tier-mini')) {
        e.preventDefault();
        e.target.click();
      }
    });

    $('#tierExport').addEventListener('click', async () => {
      const payload = { tiers: state.tiers, created_at: Date.now() };
      localStorage.setItem('rep:last_tier', JSON.stringify(payload));
      const btn = $('#tierExport');
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'rendering tier card…';
      try {
        // pull saved handle from last top-5 if present, else anon
        let handle = '';
        try { handle = JSON.parse(localStorage.getItem('rep:last_top5') || '{}').handle || ''; } catch {}
        // best-effort ballot · tier rows count on the live board when the API is up
        const filled = Object.fromEntries(Object.entries(state.tiers).filter(([, v]) => v.length));
        if (Object.keys(filled).length) {
          try { await API.post('/lists', { type: 'tier', picks: filled, username: handle || null }); } catch { /* offline */ }
        }
        const canvas = await buildTierCard({ tiers: state.tiers, handle });
        const filename = `rep-tier-${(handle || 'anon')}.png`;
        showShareModal('your DHH tier list', canvas, filename);
      } catch (e) {
        console.error(e);
        toast('PNG render hit an error · try refreshing');
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });

    $('#tierReset').addEventListener('click', () => {
      if (!confirm('reset the board? you will lose your current tiering.')) return;
      state.tiers = { S: [], A: [], B: [], C: [], D: [] };
      state.pool = ARTISTS.slice();
      localStorage.removeItem('rep:tier_board');
      render();
    });
  }

  /* ============================================================
     leaderboard · full roster with mock votes
     ============================================================ */
  /* defend wall · replace the seed examples with real submitted defenses.
     keeps the example takes when the backend is offline or empty. */
  async function wireDefendWall() {
    const list = $('.defend-list');
    if (!list) return;
    let takes = [];
    try { takes = await API.get('/defend?sort=top&limit=12'); } catch { return; }
    if (!Array.isArray(takes) || !takes.length) return;

    const note = $('#defendNote');
    if (note) note.textContent = 'top takes from the wall · drop yours from the builder · upvote what reads true.';

    list.innerHTML = takes.map(t => {
      const a = BY_SLUG[t.defending];
      const who = a ? a.stage_name : (t.defending || 'their #1');
      const badge = API_LIVE ? 'community' : 'seed take';
      const handle = t.username ? '@' + t.username : 'a head';
      return `
        <figure class="quote" data-id="${esc(t.id)}">
          <p class="quote__text">${esc(t.defense)}</p>
          <figcaption class="quote__meta">
            <span class="defending">defending ${esc(lower(who))} · ${esc(handle)}</span>
            <span class="quote__badge">${badge}</span>
            <button class="quote__up ${t.voted ? 'is-up' : ''}" data-id="${esc(t.id)}">▲ ${t.upvotes}</button>
          </figcaption>
        </figure>`;
    }).join('');

    $$('.quote__up', list).forEach(btn => btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const r = await API.post('/lists/' + btn.dataset.id + '/upvote');
        btn.textContent = '▲ ' + r.upvotes;
        btn.classList.toggle('is-up', r.voted);
      } catch { /* offline */ }
      btn.disabled = false;
    }));
  }

  /* "who's missing" · fans nominate artists the roster skipped, and upvote others.
     only shows when the backend is live (it's a pure write-back feature). */
  async function wireSuggestions() {
    const box = $('#suggestBox');
    if (!box) return;
    const live = (await apiUp()) && _apiDb;
    const listEl = $('#suggestList');
    const form = $('#suggestForm');

    if (!live) {
      box.classList.add('is-disabled');
      if (form) {
        form.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
      }
      if (listEl) {
        listEl.innerHTML = `<li class="suggest__item suggest__item--muted">nominations open when ballots API deploys · seed mode for now</li>`;
      }
      return;
    }
    box.classList.remove('is-disabled');

    async function refresh() {
      let rows = [];
      try { rows = await API.get('/suggestions?limit=20'); } catch { return; }
      listEl.innerHTML = (rows || []).map(s => `
        <li class="suggest__item">
          <span class="suggest__main">
            <span class="suggest__name">${esc(s.stage_name)}</span>
            ${s.justification ? `<span class="suggest__why">${esc(s.justification)}</span>` : ''}
          </span>
          <button class="suggest__up" data-id="${esc(s.id)}">▲ ${s.upvotes}</button>
        </li>`).join('');
      $$('.suggest__up', listEl).forEach(btn => btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const r = await API.post('/suggestions/' + btn.dataset.id + '/upvote');
          btn.textContent = '▲ ' + r.upvotes;
          btn.classList.toggle('is-up', r.voted);
        } catch {}
        btn.disabled = false;
      }));
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#suggestName').value.trim();
      if (!name) return;
      const why = $('#suggestWhy').value.trim();
      const btn = $('#suggestSubmit');
      btn.disabled = true; const orig = btn.textContent; btn.textContent = 'sent ✓';
      try {
        await API.post('/suggestions', { stage_name: name, justification: why || null });
        $('#suggestName').value = ''; $('#suggestWhy').value = '';
        await refresh();
      } catch { btn.textContent = 'retry'; }
      finally { setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 1200); }
    });

    refresh();
  }

  async function initLeaderboard() {
    await loadArtists();
    const mode = rankMode();
    // basePool · respects rank mode (default = no crossovers)
    const basePool = mode === 'streams' ? ARTISTS : ARTISTS.filter(a => !a.is_crossover);
    const seedTotal = totalVotes(basePool);

    // pen-game board = real community ballots. streams board stays an editorial
    // estimate (we don't have stream APIs). pull the live tally for pen game.
    let pointsBySlug = {};
    let ballots = 0;
    if (mode === 'respect') {
      try {
        const live = await API.get('/leaderboard?type=top5&scope=all');
        if (live && Array.isArray(live.rows)) {
          live.rows.forEach(r => { pointsBySlug[r.slug] = r.points; });
          ballots = live.ballots || 0;
        }
      } catch { /* worker offline → seed ranking */ }
    }
    const usingLive = mode === 'respect' && ballots > 0;
    const totalPoints = Object.values(pointsBySlug).reduce((s, p) => s + p, 0) || 1;

    // honest header: live ballot count, or seed ranking, or stream estimate
    $('#lbTotal').textContent = usingLive
      ? `live · ${ballots.toLocaleString('en-IN')} ballot${ballots === 1 ? '' : 's'} counted · ranked by the heads`
      : (mode === 'respect'
          ? (API_LIVE === false
              ? 'seed ranking · ballots API offline — order is editorial until deploy'
              : 'seed ranking · no ballots yet — be the first to drop a top 5')
          : 'editorial stream estimate · not community-voted');

    const liveScore = (a) => pointsBySlug[a.slug] || 0;
    const sortPool = (pool) => usingLive
      ? [...pool].sort((x, y) => (liveScore(y) - liveScore(x)) || (mockVotes(y) - mockVotes(x)))
      : [...pool].sort((x, y) => mockVotes(y) - mockVotes(x));

    // top-level mode toggle
    const modeToggle = $('#lbModeToggle');
    if (modeToggle) {
      modeToggle.innerHTML = `
        <button class="mode-tab ${mode === 'respect' ? 'is-active' : ''}" data-mode="respect">by pen game</button>
        <button class="mode-tab ${mode === 'streams' ? 'is-active' : ''}" data-mode="streams">by streams</button>`;
      $$('.mode-tab', modeToggle).forEach(btn => btn.addEventListener('click', () => {
        setRankMode(btn.dataset.mode);
        location.reload();
      }));
    }

    const state = { scope: 'all', list: sortPool(basePool) };
    render();

    $$('.scope-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.scope-tab').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.scope = btn.dataset.scope;
        applyScope();
      });
    });

    function applyScope() {
      let pool = basePool;
      if (state.scope.startsWith('era:')) pool = pool.filter(a => a.era === state.scope.slice(4));
      else if (state.scope.startsWith('sub:')) pool = pool.filter(a => a.subgenre === state.scope.slice(4));
      else if (state.scope === 'underrated') pool = ARTISTS.filter(a => (a.respect_tier === 'C' || a.respect_tier === 'D') && !a.is_crossover);
      else if (state.scope === 'crossovers') pool = ARTISTS.filter(a => a.is_crossover);
      state.list = sortPool(pool);
      render();
    }

    function render() {
      const max = usingLive ? (liveScore(state.list[0]) || 1) : (mockVotes(state.list[0]) || 1);
      $('#lbList').innerHTML = state.list.map((a, i) => {
        let pct, w;
        if (usingLive) {
          const p = liveScore(a);
          pct = p > 0 ? (p / totalPoints * 100).toFixed(2) + '%' : '—';
          w = (p / max) * 100;
        } else {
          pct = pctOf(a, seedTotal).toFixed(2) + '%';
          w = (mockVotes(a) / max) * 100;
        }
        return `
          <a class="lb-row" href="/artist.html?slug=${esc(a.slug)}">
            <span class="lb-row__rank">${String(i+1).padStart(2,'0')}</span>
            <span class="lb-row__photo">${photoHtml(a)}</span>
            <span><span class="lb-row__name">${esc(a.stage_name)}</span><br><span class="lb-row__city">${esc(lower(a.city_represented))}</span></span>
            <span class="lb-row__pct">${pct}</span>
            <span class="lb-row__tier" title="${esc(tierLabelName())}">${esc(displayTier(a))}</span>
            <span class="lb-row__bar"><span style="width:${w}%"></span></span>
          </a>`;
      }).join('');
    }

    const lbSearch = $('#lbSearch');
    if (lbSearch) {
      lbSearch.addEventListener('input', () => {
        const q = lbSearch.value.toLowerCase().trim();
        $$('.lb-row', $('#lbList')).forEach(row => {
          const name = $('.lb-row__name', row)?.textContent?.toLowerCase() || '';
          const city = $('.lb-row__city', row)?.textContent?.toLowerCase() || '';
          row.style.display = !q || name.includes(q) || city.includes(q) ? '' : 'none';
        });
      });
    }
  }

  /* ============================================================
     beefs · render the verified list from beefs.json
     ============================================================ */
  async function initBeefs() {
    await loadArtists();
    const data = await (await fetch('/data/beefs.json?v=20260610-1')).json();
    const root = $('#beefRoot');
    root.innerHTML = data.beefs.map(b => {
      const a = BY_SLUG[b.actor_a], c = BY_SLUG[b.actor_b];
      const tracks = (b.tracks || []).map(t => {
        const who = BY_SLUG[t.by];
        return `<li><span class="role">${esc(t.role)}</span><span class="who">${esc(who?.stage_name || t.by)}</span><span class="title">"${esc(t.title)}"</span><span style="margin-left: auto; color: var(--mute);">${t.year}</span></li>`;
      }).join('');
      return `
        <article class="beef-detail" id="${esc(b.slug)}">
          <div class="beef-detail__head">
            <h2 class="beef-detail__title">${esc(a?.stage_name || b.actor_a).toUpperCase()} vs ${esc(c?.stage_name || b.actor_b).toUpperCase()}</h2>
            <span class="beef-detail__year">${b.year}</span>
          </div>
          <p class="beef-detail__summary">${esc(b.summary)}</p>
          ${tracks ? `<ul class="beef-tracks">${tracks}</ul>` : ''}
          <div class="beef-detail__verdict">${esc(b.verdict)}</div>
          ${a && c ? `<a class="feature__cta" href="/compare.html?a=${esc(a.slug)}&b=${esc(c.slug)}" style="margin-top: 16px;">compare the two →</a>` : ''}
        </article>`;
    }).join('') + (data.pending ? `
      <article class="beef-detail" style="background: var(--paper-deep); border-style: dashed;">
        <div class="beef-detail__head">
          <h2 class="beef-detail__title" style="font-size: 28px;">more <span style="color: var(--burn);">pending</span></h2>
          <span class="beef-detail__year">in research</span>
        </div>
        <p class="beef-detail__summary" style="font-size: 15px;">${esc(data.pending)}</p>
      </article>` : '');
  }

  /* ============================================================
     slang · render glossary
     ============================================================ */
  async function initSlang() {
    const data = await (await fetch('/data/slang.json?v=20260610-1')).json();
    const terms = data.terms || [];
    const wrap = $('#slangSearchWrap');
    if (wrap) {
      wrap.innerHTML = `<input type="search" id="slangSearch" placeholder="search slang…" autocomplete="off" aria-label="search slang dictionary">`;
    }
    const root = $('#slangRoot');
    function render(list) {
      root.innerHTML = list.map(t => `
        <article class="gloss" data-lang="${esc(lower(t.lang))}">
          <div class="gloss__term">${esc(t.term)}</div>
          <div class="gloss__lang">${esc(t.lang)}</div>
          <div class="gloss__meaning">${esc(t.meaning)}</div>
          ${t.track ? `<div class="gloss__track">heard on · ${esc(t.track)}</div>` : ''}
        </article>`).join('');
    }
    render(terms);
    $('#slangSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = terms.filter(t =>
        !q || (t.term + t.meaning + t.lang + (t.track || '')).toLowerCase().includes(q)
      );
      render(filtered);
    });
  }

  /* ============================================================
     timeline · milestones
     ============================================================ */
  async function initTimeline() {
    const data = await (await fetch('/data/timeline.json?v=20260610-1')).json();
    const milestones = data.milestones || [];
    const decadeOf = (y) => `${Math.floor(Number(y) / 10) * 10}s`;
    const decades = unique(milestones.map(m => decadeOf(m.year))).sort();
    const filters = $('#tlFilters');
    if (filters) {
      filters.innerHTML = `
        <div class="tl-filter-bar">
          <button type="button" class="scope-tab is-active" data-decade="">all decades</button>
          ${decades.map(d => `<button type="button" class="scope-tab" data-decade="${esc(d)}">${esc(d)}</button>`).join('')}
        </div>`;
    }
    const root = $('#tlRoot');
    function render(list) {
      root.innerHTML = list.map(m => `
        <article class="tl-milestone" data-decade="${esc(decadeOf(m.year))}">
          <div class="tl-milestone__year">${m.year}</div>
          <div class="tl-milestone__title">${esc(m.title)}</div>
          <p class="tl-milestone__blurb">${esc(m.blurb)}</p>
        </article>`).join('');
    }
    render(milestones);
    $$('.tl-filter-bar .scope-tab', filters).forEach(btn => btn.addEventListener('click', () => {
      $$('.scope-tab', filters).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const decade = btn.dataset.decade;
      render(decade ? milestones.filter(m => decadeOf(m.year) === decade) : milestones);
    }));
  }

  /* ============================================================
     compare · two artists side by side
     ============================================================ */
  async function initCompare() {
    await loadArtists();
    const ballots = await liveBallotCount();
    const params = new URLSearchParams(location.search);
    let slugA = params.get('a') || 'hanumankind';
    let slugB = params.get('b') || 'krsna';

    function artistPickerHtml(id, label, val) {
      return `
        <div class="compare-picker">
          <div class="compare-picker__head">${label}</div>
          <input type="search" id="${id}" class="compare-picker__input" value="${esc(BY_SLUG[val]?.stage_name || '')}" data-slug="${esc(val)}" placeholder="search artist…" autocomplete="off" aria-label="${label}">
          <div class="compare-picker__drop" id="${id}Drop" hidden></div>
        </div>`;
    }

    $('#compareWrap').innerHTML = `
      <div class="compare-pickers">
        ${artistPickerHtml('cmpA', 'left contender', slugA)}
        <button type="button" class="compare-swap" id="cmpSwap" aria-label="swap contenders">⇄</button>
        ${artistPickerHtml('cmpB', 'right contender', slugB)}
      </div>
      <div id="cmpGrid"></div>`;

    const actions = $('#compareActions');
    if (actions) {
      actions.innerHTML = `<button type="button" class="dice-btn" id="cmpRandom">random matchup</button>`;
      $('#cmpRandom')?.addEventListener('click', () => {
        const shuffled = [...ARTISTS].sort(() => Math.random() - 0.5);
        slugA = shuffled[0].slug;
        slugB = shuffled.find(a => a.slug !== slugA)?.slug || shuffled[1].slug;
        syncPickers(); render();
      });
    }

    function wirePicker(inputId, dropId, side) {
      const input = $(inputId);
      const drop = $(dropId);
      const show = (q) => {
        const matches = ARTISTS.filter(a => {
          const hay = (a.stage_name + ' ' + (a.real_name || '')).toLowerCase();
          return !q || hay.includes(q);
        }).slice(0, 8);
        drop.innerHTML = matches.map(a => `
          <button type="button" class="compare-picker__opt" data-slug="${esc(a.slug)}">${esc(a.stage_name)} <span>${esc(lower(a.city_represented))}</span></button>`).join('');
        drop.hidden = !matches.length;
        $$('.compare-picker__opt', drop).forEach(btn => btn.addEventListener('click', () => {
          if (side === 'a') slugA = btn.dataset.slug; else slugB = btn.dataset.slug;
          input.value = BY_SLUG[btn.dataset.slug]?.stage_name || '';
          input.dataset.slug = btn.dataset.slug;
          drop.hidden = true;
          render();
        }));
      };
      input.addEventListener('focus', () => show(input.value.toLowerCase().trim()));
      input.addEventListener('input', () => show(input.value.toLowerCase().trim()));
      document.addEventListener('click', (e) => { if (!input.parentElement.contains(e.target)) drop.hidden = true; });
    }
    wirePicker('#cmpA', '#cmpADrop', 'a');
    wirePicker('#cmpB', '#cmpBDrop', 'b');

    function syncPickers() {
      $('#cmpA').value = BY_SLUG[slugA]?.stage_name || '';
      $('#cmpA').dataset.slug = slugA;
      $('#cmpB').value = BY_SLUG[slugB]?.stage_name || '';
      $('#cmpB').dataset.slug = slugB;
    }

    $('#cmpSwap')?.addEventListener('click', () => {
      const t = slugA; slugA = slugB; slugB = t;
      syncPickers(); render();
    });

    const shareLbl = rankShareLabel(ballots);
    const tierLbl = tierLabelName();

    const render = () => {
      const a = BY_SLUG[slugA], b = BY_SLUG[slugB];
      if (!a || !b) return;
      if (slugA === slugB) { toast('pick two different artists'); return; }
      const total = totalVotes(ARTISTS);
      const sorted = [...ARTISTS].sort((x, y) => mockVotes(y) - mockVotes(x));
      const rk = (x) => sorted.findIndex(s => s.slug === x.slug) + 1;
      const win = (va, vb, lowerBetter = false) => {
        if (va === vb) return '';
        const aWins = lowerBetter ? va < vb : va > vb;
        return aWins ? 'is-winner' : 'is-loser';
      };
      const stats = [
        { k: 'india rank', va: rk(a), vb: rk(b), fmt: v => `#${v}`, lowerBetter: true },
        { k: shareLbl, va: pctOf(a, total), vb: pctOf(b, total), fmt: v => `${v.toFixed(2)}%` },
        { k: tierLbl, va: displayTier(a), vb: displayTier(b), fmt: v => v, text: true },
      ];
      const mid = stats.map(s => {
        if (s.text) return `<div class="compare-mid__row">${s.va === s.vb ? 'tie' : (s.lowerBetter ? (s.va < s.vb ? '←' : '→') : (s.va > s.vb ? '←' : '→'))}</div>`;
        const diff = s.lowerBetter ? s.vb - s.va : s.va - s.vb;
        return `<div class="compare-mid__row compare-mid__diff">${diff > 0 ? '+' : ''}${s.lowerBetter ? diff : diff.toFixed(2)}${s.fmt === (v => `#${v}`) ? '' : '%'}</div>`;
      }).join('');

      $('#cmpGrid').innerHTML = `
        <div class="compare-grid compare-grid--stats">
          <div class="compare-col">
            <div class="compare-col__photo">${photoHtml(a)}</div>
            <div class="compare-col__name">${esc(a.stage_name)}</div>
            <div class="compare-col__sub">${esc([a.city_represented, a.era].filter(Boolean).join(' · ').toLowerCase())}</div>
            <dl>
              <dt>india rank</dt><dd class="numeric ${win(rk(a), rk(b), true)}">#${rk(a)}</dd>
              <dt>${esc(shareLbl)}</dt><dd class="numeric ${win(pctOf(a, total), pctOf(b, total))}">${pctOf(a, total).toFixed(2)}%</dd>
              <dt>${esc(tierLbl)}</dt><dd class="numeric">${esc(displayTier(a))}</dd>
              <dt>label</dt><dd>${esc(a.label || 'independent')}</dd>
              <dt>language</dt><dd>${esc((a.language || []).join(', ').toLowerCase() || '—')}</dd>
              <dt>subgenre</dt><dd>${esc(a.subgenre.toLowerCase())}</dd>
              <dt>tags</dt><dd>${esc((a.tags || []).join(' · '))}</dd>
              <dt>three tracks</dt><dd>${esc((a.notable_tracks || []).slice(0, 3).join(' · ') || '—')}</dd>
            </dl>
            <a class="feature__cta" href="/artist.html?slug=${esc(a.slug)}">open profile →</a>
          </div>
          <div class="compare-mid">${mid}</div>
          <div class="compare-col">
            <div class="compare-col__photo">${photoHtml(b)}</div>
            <div class="compare-col__name">${esc(b.stage_name)}</div>
            <div class="compare-col__sub">${esc([b.city_represented, b.era].filter(Boolean).join(' · ').toLowerCase())}</div>
            <dl>
              <dt>india rank</dt><dd class="numeric ${win(rk(b), rk(a), true)}">#${rk(b)}</dd>
              <dt>${esc(shareLbl)}</dt><dd class="numeric ${win(pctOf(b, total), pctOf(a, total))}">${pctOf(b, total).toFixed(2)}%</dd>
              <dt>${esc(tierLbl)}</dt><dd class="numeric">${esc(displayTier(b))}</dd>
              <dt>label</dt><dd>${esc(b.label || 'independent')}</dd>
              <dt>language</dt><dd>${esc((b.language || []).join(', ').toLowerCase() || '—')}</dd>
              <dt>subgenre</dt><dd>${esc(b.subgenre.toLowerCase())}</dd>
              <dt>tags</dt><dd>${esc((b.tags || []).join(' · '))}</dd>
              <dt>three tracks</dt><dd>${esc((b.notable_tracks || []).slice(0, 3).join(' · ') || '—')}</dd>
            </dl>
            <a class="feature__cta" href="/artist.html?slug=${esc(b.slug)}">open profile →</a>
          </div>
        </div>`;
      updatePageMeta({
        title: `${a.stage_name} vs ${b.stage_name} · Rep`,
        description: `Compare ${a.stage_name} and ${b.stage_name} — rank, ${shareLbl}, ${tierLbl}, tracks.`
      });
      const url = new URL(location);
      url.searchParams.set('a', a.slug);
      url.searchParams.set('b', b.slug);
      history.replaceState({}, '', url);
    };
    syncPickers();
    render();
  }

  /* ============================================================
     mixtape · pick up to 10 tracks (one per artist) and assemble
     ============================================================ */
  async function initMixtape() {
    await loadArtists();
    const MAX = 10;
    const state = JSON.parse(localStorage.getItem('rep:mixtape') || '{"picks": []}');
    if (!Array.isArray(state.picks)) state.picks = [];

    const rootList = $('#mixtapeList');
    const rootPool = $('#mixtapePool');

    function renderList() {
      const rows = [];
      for (let i = 0; i < MAX; i++) {
        const pick = state.picks[i];
        const a = pick ? BY_SLUG[pick.slug] : null;
        if (a) {
          rows.push(`
            <div class="mt-row">
              <span class="pos">${String(i+1).padStart(2,'0')}</span>
              <span class="ph">${photoHtml(a)}</span>
              <span>
                <div class="nm">${esc(pick.track)}</div>
                <div class="ct">${esc(a.stage_name.toLowerCase())} · ${esc(lower(a.city_represented || ''))}</div>
              </span>
              <span class="rm" data-idx="${i}" title="remove">×</span>
            </div>`);
        } else {
          rows.push(`
            <div class="mt-row is-empty">
              <span class="pos">${String(i+1).padStart(2,'0')}</span>
              <span class="ph"></span>
              <span class="nm">empty slot · pick a track below</span>
              <span></span>
            </div>`);
        }
      }
      rootList.innerHTML = rows.join('');
      $$('.rm', rootList).forEach(b => b.addEventListener('click', () => {
        state.picks.splice(+b.dataset.idx, 1);
        save();
        renderList();
      }));
      $('#mixtapeCount').textContent = `${state.picks.length}/${MAX} tracks`;
      $('#vinylDisc')?.classList.toggle('is-playing', state.picks.length > 0);
    }

    function renderPool() {
      // 12 random S/A/B-tier artists each time, with their first notable track
      const pool = ARTISTS.filter(a => ['S','A','B','C'].includes(a.popularity_tier) && (a.notable_tracks || []).length);
      // shuffle deterministically by seed
      const shuffled = pool.sort((x, y) => (hashStr(x.slug + 'pool') - hashStr(y.slug + 'pool')));
      rootPool.innerHTML = shuffled.slice(0, 18).map(a => `
        <button class="card" data-slug="${esc(a.slug)}" data-track="${esc(a.notable_tracks[0])}" style="text-align: left; cursor: pointer;">
          <div class="card__photo">${photoHtml(a)}</div>
          <div class="card__name">${esc(a.notable_tracks[0])}</div>
          <div class="card__meta">
            <span>${esc(a.stage_name.toLowerCase())}</span>
            <span class="card__tier">${esc(a.popularity_tier)}</span>
          </div>
        </button>`).join('');
      $$('.card', rootPool).forEach(card => {
        card.addEventListener('click', () => {
          if (state.picks.length >= MAX) { toast('mixtape full · remove one to add another'); return; }
          // dedup: one slot per artist
          if (state.picks.some(p => p.slug === card.dataset.slug)) return;
          state.picks.push({ slug: card.dataset.slug, track: card.dataset.track });
          save();
          renderList();
        });
      });
    }

    function save() { localStorage.setItem('rep:mixtape', JSON.stringify(state)); }

    $('#mixtapeShuffle').addEventListener('click', renderPool);
    $('#mixtapeExport').addEventListener('click', () => {
      if (!state.picks.length) { toast('add at least one track first'); return; }
      const lines = state.picks.map((p, i) => {
        const a = BY_SLUG[p.slug];
        return `${String(i+1).padStart(2,'0')}. ${p.track} · ${a?.stage_name || p.slug}`;
      });
      const txt = `MY DHH MIXTAPE · SIDE A\n\n${lines.join('\n')}\n\nrep.anirudhgoel.xyz/mixtape.html`;
      navigator.clipboard.writeText(txt).then(() => toast('tracklist copied to clipboard')).catch(() => toast(txt));
    });
    $('#mixtapePng')?.addEventListener('click', async () => {
      if (!state.picks.length) { toast('add at least one track first'); return; }
      const btn = $('#mixtapePng');
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'rendering sleeve…';
      try {
        const canvas = await buildMixtapeCard(state.picks);
        showShareModal('your DHH mixtape · side A', canvas, 'rep-mixtape.png');
      } catch (e) {
        console.error(e);
        toast('sleeve render failed · try again');
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });
    $('#mixtapeClear').addEventListener('click', () => {
      if (!confirm('clear the mixtape?')) return;
      state.picks = []; save(); renderList();
    });

    renderList();
    renderPool();
  }

  /* ============================================================
     labels page
     ============================================================ */
  async function initLabels() {
    await loadArtists();
    const data = await (await fetch('/data/labels.json?v=20260610-1')).json();
    $('#labelsRoot').innerHTML = data.labels.map(L => {
      const roster = (L.roster_slugs || []).map(s => BY_SLUG[s]).filter(Boolean);
      return `
        <article class="label-card" data-accent="${esc(L.accent || '')}">
          <div class="label-card__head">
            <h2 class="label-card__name">${esc(L.name)}</h2>
            <span class="label-card__year">est ${L.founded}</span>
          </div>
          <div class="label-card__meta">${esc(L.city)} · founder ${esc(L.founder)}</div>
          <p class="label-card__blurb">${esc(L.blurb)}</p>
          <div class="label-card__roster">
            ${roster.map(a => `<a class="chip" href="/artist.html?slug=${esc(a.slug)}">${esc(a.stage_name.toLowerCase())}</a>`).join('')}
          </div>
        </article>`;
    }).join('');
  }

  /* ============================================================
     producers page
     ============================================================ */
  async function initProducers() {
    await loadArtists();
    const data = await (await fetch('/data/producers.json?v=20260610-1')).json();
    $('#producersRoot').innerHTML = data.producers.map(p => {
      const credits = (p.credits_for_slugs || []).map(s => BY_SLUG[s]?.stage_name).filter(Boolean).join(' · ');
      return `
        <article class="prod-card">
          <h2 class="prod-card__name">${esc(p.name)}</h2>
          <div class="prod-card__city">${esc(p.city || '')}${p.real_name && p.real_name !== p.name ? ' · ' + esc(p.real_name) : ''}</div>
          <p class="prod-card__blurb">${esc(p.blurb)}</p>
          <div class="prod-card__credits"><strong>credits</strong> · ${esc(credits || '—')}</div>
          ${p.tracks?.length ? `<div class="prod-card__credits"><strong>tracks</strong> · ${esc(p.tracks.join(' · '))}</div>` : ''}
        </article>`;
    }).join('');
  }

  /* ============================================================
     cyphers page
     ============================================================ */
  async function initCyphers() {
    await loadArtists();
    const data = await (await fetch('/data/cyphers.json?v=20260610-1')).json();
    $('#cyphersRoot').innerHTML = data.cyphers.map(c => {
      const artists = (c.artist_slugs || []).map(s => BY_SLUG[s]).filter(Boolean);
      return `
        <article class="cypher-card">
          <span class="cypher-card__year">${c.year}</span>
          <div>
            <h2 class="cypher-card__title">${esc(c.title)}</h2>
            <p class="cypher-card__blurb">${esc(c.blurb)}</p>
            <div class="cypher-card__artists">
              ${artists.map(a => `<a class="chip" href="/artist.html?slug=${esc(a.slug)}">${esc(a.stage_name.toLowerCase())}</a>`).join('')}
            </div>
            ${c.spotify_track ? `
              <iframe src="https://open.spotify.com/embed/track/${esc(c.spotify_track)}?utm_source=rep"
                      style="margin-top: 16px; max-width: 560px; width: 100%;"
                      width="100%" height="152" loading="lazy"
                      allow="autoplay; encrypted-media; picture-in-picture"></iframe>` : ''}
          </div>
        </article>`;
    }).join('');
  }

  /* ============================================================
     share-card · canvas PNG renderer
     ============================================================ */
  // load image with CORS so canvas isn't tainted
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // paper noise pattern · rendered once + reused
  function paperPatternCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#F4EFE6'; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(27,27,27,${Math.random() * 0.07})`;
      const x = Math.random() * 64, y = Math.random() * 64;
      ctx.fillRect(x, y, 1, 1);
    }
    return c;
  }

  async function buildShareCard({ picks, defense, handle }) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // paper background with subtle noise (used below the dark band)
    const pat = ctx.createPattern(paperPatternCanvas(), 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);

    // ============ DARK HEADER BAND (0 to 360) ============
    const HEADER_H = 360;
    // base ink fill
    ctx.fillStyle = '#0E0E10';
    ctx.fillRect(0, 0, W, HEADER_H);
    // soft burn glow in the bottom-right of the band
    const grad = ctx.createRadialGradient(W * 0.85, HEADER_H * 0.85, 30, W * 0.7, HEADER_H * 0.7, 500);
    grad.addColorStop(0, 'rgba(237, 139, 64, 0.22)');
    grad.addColorStop(1, 'rgba(237, 139, 64, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, HEADER_H);

    // top burn rule
    ctx.fillStyle = '#ED8B40';
    ctx.fillRect(0, 0, W, 6);

    ctx.textBaseline = 'top';

    // handle small mono
    ctx.fillStyle = '#ED8B40';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    const handleStr = (handle ? '@' + handle : '@anonymous') + '  ·  DHH TOP 5';
    ctx.fillText(handleStr.toUpperCase(), 60, 60);

    // dateline right
    ctx.fillStyle = '#9A9A9A';
    const dt = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    ctx.textAlign = 'right';
    ctx.fillText(dt.toUpperCase(), W - 60, 60);
    ctx.textAlign = 'start';

    // massive REP wordmark · paper-color · with burn shadow for depth
    ctx.fillStyle = '#F4EFE6';
    ctx.font = '400 200px Anton, Impact, sans-serif';
    // shadow underneath
    ctx.save();
    ctx.translate(6, 6);
    ctx.fillStyle = '#ED8B40';
    ctx.fillText('REP', 56, 110);
    ctx.restore();
    ctx.fillStyle = '#F4EFE6';
    ctx.fillText('REP', 56, 110);
    // orange dot replacing the period
    ctx.fillStyle = '#ED8B40';
    ctx.beginPath();
    ctx.arc(320, 285, 16, 0, Math.PI * 2);
    ctx.fill();

    // tagline italic serif
    ctx.fillStyle = '#9A9A9A';
    ctx.font = 'italic 400 22px "PT Serif", Georgia, serif';
    ctx.fillText('ranked by the heads. arguments encouraged.', 60, 320);

    // bottom burn rule of the header band
    ctx.fillStyle = '#ED8B40';
    ctx.fillRect(0, HEADER_H - 4, W, 4);

    // ============ 5 ROWS ON PAPER (360 to ~1140) ============
    const rowH = 144;
    const rowsTop = HEADER_H + 20;
    const imgs = await Promise.all(picks.map(a => loadImg(a.image_url)));
    for (let i = 0; i < 5; i++) {
      const a = picks[i];
      const y = rowsTop + i * rowH;

      // rank number — saffron for #1, ink for rest
      ctx.fillStyle = i === 0 ? '#ED8B40' : '#1B1B1B';
      ctx.font = '400 96px Anton, Impact, sans-serif';
      ctx.fillText(String(i + 1).padStart(2, '0'), 60, y + 14);

      // photo box 116x116
      const px = 220, py = y + 12, ps = 116;
      ctx.fillStyle = '#ECE5D7';
      ctx.fillRect(px, py, ps, ps);
      ctx.strokeStyle = '#1B1B1B';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, ps, ps);

      if (imgs[i]) {
        const img = imgs[i];
        const ratio = Math.max(ps / img.width, ps / img.height);
        const dw = img.width * ratio, dh = img.height * ratio;
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, ps, ps);
        ctx.clip();
        ctx.drawImage(img, px + (ps - dw) / 2, py + (ps - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#9A9A9A';
        ctx.font = '400 48px Anton, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(initials(a.stage_name), px + ps / 2, py + 32);
        ctx.textAlign = 'start';
      }

      // name — auto-shrink if too long
      ctx.fillStyle = '#1B1B1B';
      let nameSize = 50;
      const maxNameW = W - 380;
      const nm = a.stage_name.toUpperCase();
      ctx.font = `400 ${nameSize}px Anton, Impact, sans-serif`;
      while (ctx.measureText(nm).width > maxNameW && nameSize > 30) {
        nameSize -= 2;
        ctx.font = `400 ${nameSize}px Anton, Impact, sans-serif`;
      }
      ctx.fillText(nm, 360, y + 18);

      // city + status mono
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '500 16px "JetBrains Mono", monospace';
      const cityLabel = (a.city_represented || '').toLowerCase() + (a.active_status === 'RIP' ? '  ·  r.i.p.' : '') + (a.is_crossover ? '  ·  crossover' : (a.respect_tier === 'S' ? '  ·  pen game' : ''));
      ctx.fillText(cityLabel, 360, y + 84);

      // row divider
      ctx.strokeStyle = 'rgba(27,27,27,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, y + rowH - 4);
      ctx.lineTo(W - 60, y + rowH - 4);
      ctx.stroke();
    }

    // ============ DEFEND QUOTE (~1100 to 1240) ============
    const dY = rowsTop + 5 * rowH + 18;
    if (defense && defense.trim()) {
      ctx.fillStyle = '#ED8B40';
      ctx.font = '400 80px "PT Serif", Georgia, serif';
      ctx.fillText('“', 56, dY - 28);
      ctx.fillStyle = '#1B1B1B';
      ctx.font = 'italic 400 24px "PT Serif", Georgia, serif';
      const maxW = W - 220;
      const words = defense.trim().split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      lines.slice(0, 3).forEach((l, k) => ctx.fillText(l, 110, dY + k * 34));
    } else {
      // no defense · soft prompt line
      ctx.fillStyle = '#9A9A9A';
      ctx.font = 'italic 400 18px "PT Serif", Georgia, serif';
      ctx.fillText('add a defense next time. one line, 140 chars.', 60, dY);
    }

    // ============ FOOTER (1280 to 1350) ============
    ctx.fillStyle = '#1B1B1B';
    ctx.fillRect(40, H - 76, W - 80, 1);
    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#1B1B1B';
    ctx.fillText('REP.ANIRUDHGOEL.XYZ', 60, H - 54);
    ctx.fillStyle = '#ED8B40';
    ctx.textAlign = 'right';
    ctx.fillText('* ASLI DHH', W - 60, H - 54);
    ctx.textAlign = 'start';

    return c;
  }

  async function buildTierCard({ tiers, handle }) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const pat = ctx.createPattern(paperPatternCanvas(), 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);

    // header
    ctx.fillStyle = '#1B1B1B';
    ctx.fillRect(40, 40, W - 80, 4);
    ctx.fillRect(40, 50, W - 80, 1);

    ctx.textBaseline = 'top';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText((handle ? '@' + handle : '@anonymous') + ' · DHH TIER LIST', 64, 76);

    ctx.font = '400 144px Anton, Impact, sans-serif';
    ctx.fillText('TIER', 60, 110);
    ctx.fillStyle = '#ED8B40';
    ctx.fillText('5', 415, 110);
    ctx.fillStyle = '#1B1B1B';

    // 5 tier rows
    const letters = ['S', 'A', 'B', 'C', 'D'];
    const colors = {
      S: '#ED8B40',
      A: '#1B1B1B',
      B: '#C05B3A',
      C: '#3A6AC0',
      D: '#6B6B6B'
    };
    const rowsTop = 320;
    const rowH = 180;
    const letterW = 130;
    const padX = 40;

    // pre-load all referenced photos
    const allSlugs = letters.flatMap(L => tiers[L] || []);
    const imgCache = {};
    await Promise.all(allSlugs.map(async slug => {
      const a = BY_SLUG[slug]; if (!a) return;
      imgCache[slug] = await loadImg(a.image_url);
    }));

    for (let i = 0; i < 5; i++) {
      const L = letters[i];
      const y = rowsTop + i * rowH;
      // outer border
      ctx.strokeStyle = '#1B1B1B';
      ctx.lineWidth = 2;
      ctx.strokeRect(padX, y, W - padX * 2, rowH - 10);
      // letter cell
      ctx.fillStyle = colors[L];
      ctx.fillRect(padX, y, letterW, rowH - 10);
      ctx.fillStyle = L === 'S' ? '#1B1B1B' : '#F4EFE6';
      ctx.font = '400 130px Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(L, padX + letterW / 2, y + 22);
      ctx.textAlign = 'start';

      // artist mini-thumbs
      const slugs = (tiers[L] || []).slice(0, 12); // cap at 12 per row in the export
      const tStart = padX + letterW + 16;
      const ts = (rowH - 10) - 16;
      const gap = 8;
      for (let k = 0; k < slugs.length; k++) {
        const a = BY_SLUG[slugs[k]]; if (!a) continue;
        const tx = tStart + k * (ts + gap);
        if (tx + ts > W - padX) break;
        const ty = y + 8;
        ctx.fillStyle = '#ECE5D7';
        ctx.fillRect(tx, ty, ts, ts);
        ctx.strokeStyle = '#1B1B1B'; ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, ts, ts);
        const img = imgCache[a.slug];
        if (img) {
          const r = Math.max(ts / img.width, ts / img.height);
          const dw = img.width * r, dh = img.height * r;
          ctx.save();
          ctx.beginPath();
          ctx.rect(tx, ty, ts, ts);
          ctx.clip();
          ctx.drawImage(img, tx + (ts - dw) / 2, ty + (ts - dh) / 2, dw, dh);
          ctx.restore();
        } else {
          ctx.fillStyle = '#9A9A9A';
          ctx.font = '400 36px Anton, Impact, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(initials(a.stage_name), tx + ts / 2, ty + 28);
          ctx.textAlign = 'start';
        }
        // tiny label strip
        ctx.fillStyle = 'rgba(27,27,27,0.8)';
        ctx.fillRect(tx, ty + ts - 18, ts, 18);
        ctx.fillStyle = '#F4EFE6';
        ctx.font = '500 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const lbl = a.stage_name.length > 14 ? a.stage_name.slice(0, 13) + '…' : a.stage_name;
        ctx.fillText(lbl, tx + ts / 2, ty + ts - 14);
        ctx.textAlign = 'start';
      }
    }

    // footer
    ctx.fillStyle = '#1B1B1B';
    ctx.fillRect(40, H - 70, W - 80, 1);
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText('rep.anirudhgoel.xyz/tier.html', 64, H - 50);
    ctx.fillStyle = '#ED8B40';
    ctx.textAlign = 'right';
    ctx.fillText('* asli DHH', W - 64, H - 50);
    ctx.textAlign = 'start';

    return c;
  }

  async function buildMixtapeCard(picks) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const pat = ctx.createPattern(paperPatternCanvas(), 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0E0E10';
    ctx.fillRect(0, 0, W, 280);
    ctx.fillStyle = '#ED8B40';
    ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = '#F4EFE6';
    ctx.font = '400 120px Anton, Impact, sans-serif';
    ctx.fillText('MIXTAPE', 56, 90);
    ctx.font = '500 20px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ED8B40';
    ctx.fillText('SIDE A · ' + picks.length + ' TRACKS', 56, 200);
    ctx.textBaseline = 'top';
    let y = 320;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const a = BY_SLUG[p.slug];
      ctx.fillStyle = '#1B1B1B';
      ctx.font = '400 48px Anton, Impact, sans-serif';
      ctx.fillText(String(i + 1).padStart(2, '0'), 56, y);
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText((p.track || '').slice(0, 42), 140, y + 8);
      ctx.fillStyle = '#6B6B6B';
      ctx.fillText((a?.stage_name || p.slug).toLowerCase(), 140, y + 40);
      y += 88;
    }
    ctx.fillStyle = '#1B1B1B';
    ctx.fillRect(40, H - 70, W - 80, 1);
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText('rep.anirudhgoel.xyz/mixtape.html', 64, H - 50);
    return c;
  }

  function closeShareModal() {
    const modal = $('#shareModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function showShareModal(title, canvas, filename) {
    let modal = $('#shareModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'shareModal';
      modal.className = 'share-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <div class="share-modal__inner">
          <div class="share-modal__head">
            <h3 class="share-modal__title" id="shareModalTitle"></h3>
            <button type="button" class="share-modal__close" id="shareModalClose" aria-label="close">×</button>
          </div>
          <div id="shareCanvasWrap"></div>
          <div class="share-modal__actions">
            <button type="button" class="btn-stamp" id="downloadPng">download PNG →</button>
            <button type="button" class="dice-btn" id="shareNative" hidden>share →</button>
            <button type="button" class="dice-btn" id="closeShare">close</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeShareModal(); });
      $('#shareModalClose', modal).addEventListener('click', closeShareModal);
      $('#closeShare', modal).addEventListener('click', closeShareModal);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeShareModal();
      });
    }
    $('#shareModalTitle').textContent = title;
    const wrap = $('#shareCanvasWrap');
    wrap.innerHTML = '';
    canvas.className = 'share-modal__canvas';
    wrap.appendChild(canvas);
    const nativeBtn = $('#shareNative');
    if (nativeBtn && navigator.share && navigator.canShare) {
      nativeBtn.hidden = false;
      nativeBtn.onclick = () => {
        canvas.toBlob(async (blob) => {
          if (!blob) { toast('share unavailable on this device'); return; }
          const file = new File([blob], filename || 'rep.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            try { await navigator.share({ title, files: [file] }); } catch { /* cancelled */ }
          } else toast('native share not supported here');
        }, 'image/png');
      };
    } else if (nativeBtn) nativeBtn.hidden = true;

    $('#downloadPng').onclick = () => {
      canvas.toBlob((blob) => {
        if (!blob) { toast('couldn\'t generate PNG · try on desktop'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'rep.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('PNG downloading');
      }, 'image/png');
    };
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    $('#shareModalClose')?.focus();
  }

})();
