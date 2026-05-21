/* rep · app.js
   one shared script across all pages. defer-loaded. no esm. no framework.
   ---------------------------------------------------------------- */

(() => {
  'use strict';

  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

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
  async function loadArtists() {
    if (ARTISTS) return ARTISTS;
    const r = await fetch('/data/artists.json');
    const j = await r.json();
    ARTISTS = (j.artists || []).filter(a => a.is_votable !== 0);
    BY_SLUG = Object.fromEntries(ARTISTS.map(a => [a.slug, a]));
    return ARTISTS;
  }

  /* deterministic mock vote count · seeded by tier + slug
     gives a stable, plausible % share across renders without a backend.
     replace with real counts once /api/leaderboard is wired. */
  function tierWeight(t) { return { S: 50000, A: 18000, B: 5000, C: 1200, D: 250 }[t] || 100; }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function mockVotes(a) {
    const base = tierWeight(a.popularity_tier);
    const wobble = (hashStr(a.slug) % 1000) / 1000;
    return Math.round(base * (0.55 + wobble * 0.9));
  }
  function totalVotes(artists) {
    return artists.reduce((s, a) => s + mockVotes(a), 0);
  }
  function pctOf(a, total) { return (mockVotes(a) / total) * 100; }

  function initials(name) {
    return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function lower(s) { return (s || '').toString().toLowerCase(); }
  function isOgMainstream(a) {
    if (!a) return false;
    const tags = a.tags || [];
    return (a.era === 'OG' && a.subgenre === 'Pop-Rap') ||
           (tags.includes('mainstream') && tags.includes('OG'));
  }

  /* photo rendering · graceful fallback to initials --------- */
  function photoHtml(a, opts = {}) {
    const cls = opts.cls || '';
    if (a.image_url) {
      return `<img src="${esc(a.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${esc(initials(a.stage_name))}'}))">`;
    }
    return `<span class="fallback">${esc(initials(a.stage_name))}</span>`;
  }

  function cardHtml(a, opts = {}) {
    const picked = opts.pickedSet && opts.pickedSet.has(a.slug);
    const ogm = isOgMainstream(a) ? 'is-og-mainstream' : '';
    const link = opts.link ? `<a href="/artist.html?slug=${esc(a.slug)}" style="display:block">` : '';
    const linkEnd = opts.link ? `</a>` : '';
    return `
      <article class="card ${picked ? 'is-picked' : ''} ${ogm}"
               draggable="${opts.draggable !== false}" data-slug="${esc(a.slug)}">
        ${link}
        <div class="card__photo">${photoHtml(a)}</div>
        <div class="card__name">${esc(a.stage_name)}</div>
        <div class="card__meta">
          <span>${esc(lower(a.city_represented))}</span>
          <span class="card__tier">${esc(a.popularity_tier)}</span>
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
    el.innerHTML = `
      <a href="/" class="topbar__mark" aria-label="Rep">rep<span class="dot"></span></a>
      <nav class="topbar__nav" aria-label="primary">
        <a href="/build.html" class="${isActive('/build.html') ? 'is-active' : ''}">drop 5</a>
        <a href="/tier.html" class="${isActive('/tier.html') ? 'is-active' : ''}">tier</a>
        <a href="/leaderboard.html" class="${isActive('/leaderboard.html') ? 'is-active' : ''}">top 85</a>
        <a href="/mixtape.html" class="${isActive('/mixtape.html') ? 'is-active' : ''}">mixtape</a>
        <a href="/compare.html" class="${isActive('/compare.html') ? 'is-active' : ''}">compare</a>
      </nav>
      <div class="gsearch" id="gsearch">
        <input type="search" placeholder="search 85 artists…" aria-label="search" autocomplete="off">
        <div class="gsearch__results" id="gsearchResults"></div>
      </div>`;
    initSearch();
  }
  renderTopbar();

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

    // top 5 seeded slugs (most credible right now)
    const top5slugs = ['karan-aujla', 'hanumankind', 'divine', 'seedhe-maut', 'sidhu-moose-wala'];
    const total = totalVotes(ARTISTS);
    const tickets = $('#tickets');
    if (tickets) {
      tickets.innerHTML = top5slugs.map((slug, i) => {
        const a = BY_SLUG[slug]; if (!a) return '';
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
            <span class="ticket__stat"><span class="pct">${pct}%</span>of top-5 picks</span>
          </li>`;
      }).join('');
    }

    // artist of the day · cassette tape aesthetic · rotates by date · biased S/A/B tier
    const aotdSeed = Math.floor(Date.now() / 86400000);
    const spotlightPool = ARTISTS.filter(a => ['S','A','B'].includes(a.popularity_tier));
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

    // hero marquee · scrolling photos of all 85 (well, top 40 by tier)
    const marqueeWrap = $('#marquee');
    if (marqueeWrap) {
      const top40 = [...ARTISTS].sort((a, b) => mockVotes(b) - mockVotes(a)).slice(0, 40);
      // double it so the loop is seamless
      const doubled = top40.concat(top40);
      marqueeWrap.innerHTML = `
        <div class="marquee__inner">
          ${doubled.map(a => `
            <a class="marquee__item" href="/artist.html?slug=${esc(a.slug)}">
              <span class="ph">${photoHtml(a)}</span>
              <div>
                <div class="nm">${esc(a.stage_name)}</div>
                <div class="ct">${esc(lower(a.city_represented || ''))}</div>
              </div>
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
      const beefData = await (await fetch('/data/beefs.json')).json();
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

    // daily 1v1 · use real photos · seeded by date
    const duelSeed = Math.floor(Date.now() / 86400000);
    const cityVar = duelSeed % 3;
    const pairs = [
      ['hanumankind', 'mc-stan', 'south meets west · trap kings'],
      ['krsna', 'emiway-bantai', 'delhi pen vs mumbai hustle'],
      ['divine', 'sidhu-moose-wala', 'gully OG vs the punjabi king']
    ];
    const p = pairs[cityVar];
    const aa = BY_SLUG[p[0]], bb = BY_SLUG[p[1]];
    const duel = $('.duel');
    const duelTheme = $('.duel__theme');
    if (duel && aa && bb) {
      duel.innerHTML = `
        <div class="duel__side">
          <div class="duel__photo">${photoHtml(aa)}</div>
          <div class="duel__name">${esc(aa.stage_name)}</div>
          <div class="duel__city">${esc(lower(aa.city_represented))}</div>
        </div>
        <div class="duel__vs">vs</div>
        <div class="duel__side">
          <div class="duel__photo">${photoHtml(bb)}</div>
          <div class="duel__name">${esc(bb.stage_name)}</div>
          <div class="duel__city">${esc(lower(bb.city_represented))}</div>
        </div>`;
      if (duelTheme) duelTheme.innerHTML = `${esc(p[2])} · vote opens when the backend ships.`;
      // adjust duel photo style to show images
      $$('.duel__photo', duel).forEach(el => {
        el.style.padding = '0';
        el.style.overflow = 'hidden';
      });
    }

    // dynamic city counts on landing tiles
    const NE_STATES = ['Meghalaya','Assam','Manipur','Mizoram','Nagaland','Tripura','Arunachal Pradesh','Sikkim'];
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

    // random artist button
    const dice = $('#diceBtn');
    if (dice) {
      dice.addEventListener('click', () => {
        const a = ARTISTS[Math.floor(Math.random() * ARTISTS.length)];
        location.href = `/artist.html?slug=${a.slug}`;
      });
    }
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
      handle: ''
    };
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
        card.addEventListener('click', (e) => {
          if (card.classList.contains('is-picked')) return;
          const idx = state.slots.findIndex(s => !s);
          if (idx === -1) return;
          pickArtist(card.dataset.slug, idx);
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
        if (rm) rm.onclick = () => { state.slots[i] = null; renderSlots(); renderGrid(); updateLock(); };
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
      btn.textContent = filled < 5 ? `pick ${5 - filled} more` : 'lock it in';
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

    $('#lockBtn').addEventListener('click', () => {
      if (state.slots.filter(Boolean).length < 5) return;
      const payload = {
        picks: state.slots.map(a => a.slug),
        defense: state.defense,
        handle: state.handle,
        created_at: Date.now()
      };
      localStorage.setItem('rep:last_top5', JSON.stringify(payload));
      const picks = payload.picks.map(slug => BY_SLUG[slug]);
      const handleStr = payload.handle ? '@' + payload.handle : '@anonymous';
      const lines = picks.map((a, i) => `${String(i+1).padStart(2,'0')}. ${a.stage_name.toUpperCase()}  ·  ${lower(a.city_represented)}`);
      const message = `${handleStr}'s DHH TOP 5\n\n${lines.join('\n')}${payload.defense ? `\n\n— "${payload.defense}"` : ''}\n\nrep.anirudhgoel.xyz`;
      navigator.clipboard.writeText(message).then(() => {
        alert('locked in.\n\ncopied to clipboard. paste anywhere.\n\nshareable PNG card pipeline ships next.\n\n' + message);
      }).catch(() => alert('locked in.\n\n' + message));
    });
  }

  /* ============================================================
     artist profile · query string ?slug=
     ============================================================ */
  async function initArtist() {
    await loadArtists();
    const slug = new URLSearchParams(location.search).get('slug');
    const a = BY_SLUG[slug];
    if (!a) { $('#artistRoot').innerHTML = '<p class="empty-grid">artist not found. check the link.</p>'; return; }

    // load bios in parallel; ok if missing
    let bio = null;
    try {
      const biosData = await (await fetch('/data/bios.json')).json();
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

    document.title = `${a.stage_name} · Rep`;
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
          <div class="artist-meta__kicker">${a.active_status === 'RIP' ? '· r.i.p. ·' : 'currently active · ranked by you'}</div>
          <h1 class="artist-meta__name">${esc(a.stage_name)}</h1>
          <p class="artist-meta__sub">${esc(subBits.join(' · '))}</p>
          ${a.note ? `<p style="font-family: var(--font-serif); font-size: 16px; color: var(--ink-soft); line-height: 1.5;">${esc(a.note)}</p>` : ''}
          <div class="tag-pills">${pills}</div>
          ${bio ? `
            <div class="artist-bio">
              <div class="artist-bio__head">${esc(bio.headline)}</div>
              ${bio.paragraphs.map(p => `<p class="artist-bio__p">${esc(p)}</p>`).join('')}
            </div>` : ''}
          <div class="artist-stats">
            <div class="row"><span>india rank</span><strong>#${rank}</strong></div>
            <div class="row"><span>in ${esc(lower(a.city_represented))}</span><strong>#${cityRank}</strong></div>
            <div class="row"><span>in ${esc(lower(a.era))}</span><strong>#${eraRank}</strong></div>
            <div class="row"><span>share of top-5s</span><strong>${pct}%</strong></div>
          </div>
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

      <div class="artist-section">
        <h3>defend <span class="burn">${esc(a.stage_name.toLowerCase())}</span></h3>
        <p style="font-family: var(--font-mono); font-size: 12px; color: var(--mute); letter-spacing: 0.08em;">
          when the defend wall ships next: top takes for ${esc(lower(a.stage_name))} surface here.
        </p>
      </div>
    `;
  }

  /* ============================================================
     city page · query string ?city=Mumbai
     ============================================================ */
  async function initCity() {
    await loadArtists();
    const city = new URLSearchParams(location.search).get('city');
    if (!city) { $('#cityRoot').innerHTML = '<p class="empty-grid">pick a city from the home page.</p>'; return; }

    // Region grouping · "Punjab" + "Northeast" are scopes that span multiple cities
    const NE_STATES = ['Meghalaya','Assam','Manipur','Mizoram','Nagaland','Tripura','Arunachal Pradesh','Sikkim'];
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
      'ahmedabad': { sub: 'gujju shawn carter. dhanji solo. early days, big upside.', deva: 'અમદાવાદ', tagline: 'where the gujarati flag goes up.' }
    };
    const meta = blurbs[lower(city)] || { sub: `${inCity.length} artists.`, deva: city, tagline: '' };

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
                <span class="lb-row__tier">${esc(a.popularity_tier)}</span>
                <span class="lb-row__bar"><span style="width:${Math.min(100, parseFloat(p) * 6)}%"></span></span>
              </a>`;
          }).join('')}
        </div>
      </div>

      ${inCity.length > 10 ? `
      <div class="artist-section">
        <h3>full <span class="burn">roster</span></h3>
        <div class="similar-grid">
          ${sorted.slice(10).map(a => cardHtml(a, { link: true, draggable: false })).join('')}
        </div>
      </div>` : ''}
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
      $('#tierPoolCount').textContent = `${state.pool.length} unranked · drag in`;
      poolEl.innerHTML = state.pool.map(a => miniHtml(a)).join('');
      $$('.tier-mini', poolEl).forEach(m => {
        m.setAttribute('draggable', 'true');
        m.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/slug', m.dataset.slug);
          m.style.opacity = '0.5';
        });
        m.addEventListener('dragend', () => { m.style.opacity = ''; });
      });
    }

    function miniHtml(a) {
      if (!a) return '';
      return `
        <div class="tier-mini" data-slug="${esc(a.slug)}" title="${esc(a.stage_name)}">
          ${photoHtml(a)}
          <div class="tier-mini__label">${esc(a.stage_name)}</div>
        </div>`;
    }

    $('#tierExport').addEventListener('click', () => {
      const payload = { tiers: state.tiers, created_at: Date.now() };
      localStorage.setItem('rep:last_tier', JSON.stringify(payload));
      const lines = ['S','A','B','C','D'].map(t =>
        `${t}: ${state.tiers[t].map(s => BY_SLUG[s]?.stage_name).filter(Boolean).join(', ') || '—'}`
      );
      const msg = `MY DHH TIER LIST\n\n${lines.join('\n')}\n\nrep.anirudhgoel.xyz/tier.html`;
      navigator.clipboard.writeText(msg).then(() => {
        alert('tier list copied to clipboard.\n\nPNG export ships with the share-card pipeline.\n\n' + msg);
      }).catch(() => alert(msg));
    });

    $('#tierReset').addEventListener('click', () => {
      if (!confirm('reset the board? you will lose your current tiering.')) return;
      state.tiers = { S: [], A: [], B: [], C: [], D: [] };
      state.pool = ARTISTS.slice();
      render();
    });
  }

  /* ============================================================
     leaderboard · full 85 with mock votes
     ============================================================ */
  async function initLeaderboard() {
    await loadArtists();
    const total = totalVotes(ARTISTS);
    const sorted = [...ARTISTS].sort((x, y) => mockVotes(y) - mockVotes(x));
    $('#lbTotal').textContent = total.toLocaleString('en-IN') + ' simulated votes';

    const state = { scope: 'all', list: sorted };
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
      let pool = ARTISTS;
      if (state.scope.startsWith('era:')) pool = pool.filter(a => a.era === state.scope.slice(4));
      else if (state.scope.startsWith('sub:')) pool = pool.filter(a => a.subgenre === state.scope.slice(4));
      else if (state.scope === 'underrated') pool = pool.filter(a => a.popularity_tier === 'C' || a.popularity_tier === 'D');
      state.list = [...pool].sort((x, y) => mockVotes(y) - mockVotes(x));
      render();
    }

    function render() {
      const max = mockVotes(state.list[0]) || 1;
      $('#lbList').innerHTML = state.list.map((a, i) => {
        const p = pctOf(a, total).toFixed(2);
        const w = (mockVotes(a) / max) * 100;
        return `
          <a class="lb-row" href="/artist.html?slug=${esc(a.slug)}">
            <span class="lb-row__rank">${String(i+1).padStart(2,'0')}</span>
            <span class="lb-row__photo">${photoHtml(a)}</span>
            <span><span class="lb-row__name">${esc(a.stage_name)}</span><br><span class="lb-row__city">${esc(lower(a.city_represented))}</span></span>
            <span class="lb-row__pct">${p}%</span>
            <span class="lb-row__tier">${esc(a.popularity_tier)}</span>
            <span class="lb-row__bar"><span style="width:${w}%"></span></span>
          </a>`;
      }).join('');
    }
  }

  /* ============================================================
     beefs · render the verified list from beefs.json
     ============================================================ */
  async function initBeefs() {
    await loadArtists();
    const data = await (await fetch('/data/beefs.json')).json();
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
    const data = await (await fetch('/data/slang.json')).json();
    $('#slangRoot').innerHTML = data.terms.map(t => `
      <article class="gloss">
        <div class="gloss__term">${esc(t.term)}</div>
        <div class="gloss__lang">${esc(t.lang)}</div>
        <div class="gloss__meaning">${esc(t.meaning)}</div>
        ${t.track ? `<div class="gloss__track">heard on · ${esc(t.track)}</div>` : ''}
      </article>`).join('');
  }

  /* ============================================================
     timeline · milestones
     ============================================================ */
  async function initTimeline() {
    const data = await (await fetch('/data/timeline.json')).json();
    $('#tlRoot').innerHTML = data.milestones.map(m => `
      <article class="tl-milestone">
        <div class="tl-milestone__year">${m.year}</div>
        <div class="tl-milestone__title">${esc(m.title)}</div>
        <p class="tl-milestone__blurb">${esc(m.blurb)}</p>
      </article>`).join('');
  }

  /* ============================================================
     compare · two artists side by side
     ============================================================ */
  async function initCompare() {
    await loadArtists();
    const params = new URLSearchParams(location.search);
    const initA = params.get('a') || 'hanumankind';
    const initB = params.get('b') || 'krsna';

    const pickerOpts = [...ARTISTS].sort((x, y) => x.stage_name.localeCompare(y.stage_name))
      .map(a => `<option value="${esc(a.slug)}">${esc(a.stage_name)}</option>`).join('');
    $('#compareWrap').innerHTML = `
      <div class="compare-pickers">
        <div class="compare-picker">
          <div class="compare-picker__head">left contender</div>
          <select id="cmpA">${pickerOpts}</select>
        </div>
        <div class="compare-vs">vs</div>
        <div class="compare-picker">
          <div class="compare-picker__head">right contender</div>
          <select id="cmpB">${pickerOpts}</select>
        </div>
      </div>
      <div id="cmpGrid"></div>`;

    $('#cmpA').value = initA;
    $('#cmpB').value = initB;
    const render = () => {
      const a = BY_SLUG[$('#cmpA').value];
      const b = BY_SLUG[$('#cmpB').value];
      if (!a || !b) return;
      const total = totalVotes(ARTISTS);
      const sorted = [...ARTISTS].sort((x, y) => mockVotes(y) - mockVotes(x));
      const rk = (x) => sorted.findIndex(s => s.slug === x.slug) + 1;
      $('#cmpGrid').innerHTML = `
        <div class="compare-grid">
          ${[a, b].map(x => `
            <div class="compare-col">
              <div class="compare-col__photo">${photoHtml(x)}</div>
              <div class="compare-col__name">${esc(x.stage_name)}</div>
              <div class="compare-col__sub">${esc([x.city_represented, x.era].filter(Boolean).join(' · ').toLowerCase())}</div>
              <dl>
                <dt>india rank</dt><dd class="numeric">#${rk(x)}</dd>
                <dt>share of top-5s</dt><dd class="numeric">${pctOf(x, total).toFixed(2)}%</dd>
                <dt>tier</dt><dd class="numeric">${esc(x.popularity_tier)}</dd>
                <dt>label</dt><dd>${esc(x.label || 'independent')}</dd>
                <dt>language</dt><dd>${esc((x.language || []).join(', ').toLowerCase() || '—')}</dd>
                <dt>subgenre</dt><dd>${esc(x.subgenre.toLowerCase())}</dd>
                <dt>tags</dt><dd>${esc((x.tags || []).join(' · '))}</dd>
                <dt>three tracks</dt><dd>${esc((x.notable_tracks || []).slice(0,3).join(' · ') || '—')}</dd>
              </dl>
            </div>`).join('')}
        </div>`;
      // update URL
      const url = new URL(location);
      url.searchParams.set('a', a.slug); url.searchParams.set('b', b.slug);
      history.replaceState({}, '', url);
    };
    $('#cmpA').addEventListener('change', render);
    $('#cmpB').addEventListener('change', render);
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
          if (state.picks.length >= MAX) { alert('mixtape full · remove one to add another'); return; }
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
      if (!state.picks.length) { alert('add at least one track first'); return; }
      const lines = state.picks.map((p, i) => {
        const a = BY_SLUG[p.slug];
        return `${String(i+1).padStart(2,'0')}. ${p.track} · ${a?.stage_name || p.slug}`;
      });
      const txt = `MY DHH MIXTAPE · SIDE A\n\n${lines.join('\n')}\n\nrep.anirudhgoel.xyz/mixtape.html`;
      navigator.clipboard.writeText(txt).then(() => alert('tracklist copied to clipboard.\n\n' + txt)).catch(() => alert(txt));
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
    const data = await (await fetch('/data/labels.json')).json();
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
    const data = await (await fetch('/data/producers.json')).json();
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
    const data = await (await fetch('/data/cyphers.json')).json();
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

})();
