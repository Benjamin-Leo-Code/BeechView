/* BeechView front end – no build step, no dependencies. */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var player = document.getElementById('player');
  var video = document.getElementById('video');
  var playerBar = document.getElementById('playerBar');
  var upNext = document.getElementById('upNext');

  var REFRESH_MS = 60 * 1000;       // re-check for new shows/episodes every minute
  var NEW_MS = 3 * 24 * 3600 * 1000; // "NEW" badge for shows updated in the last 3 days
  var WATCHED = 0.92;                // fraction played that counts as watched

  var state = { shows: [], show: null, playing: null, sortOldest: false, loaded: false, failures: 0 };

  // ---------------------------------------------------------------- storage
  // Progress lives in this device's localStorage. Wrapped in try/catch so the
  // app still works in private mode or when storage is unavailable.
  function load(key, fallback) {
    try {
      var v = localStorage.getItem('bv:' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('bv:' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  var progress = load('progress', {});
  state.sortOldest = load('sortOldest', false);

  function getProgress(id) { return progress[id] || null; }
  function setProgress(id, t, d, extra) {
    if (!d || !isFinite(d)) return;
    var p = progress[id] || {};
    p.t = t; p.d = d; p.at = Date.now();
    if (extra) { for (var k in extra) p[k] = extra[k]; }
    progress[id] = p;
    save('progress', progress);
  }
  function fraction(id) {
    var p = getProgress(id);
    return p && p.d ? Math.min(1, p.t / p.d) : 0;
  }
  function isWatched(id) {
    var p = getProgress(id);
    return !!(p && (p.done || (p.d && p.t / p.d >= WATCHED)));
  }

  // ---------------------------------------------------------------- helpers
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'style') el.setAttribute('style', attrs[k]);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  var ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
    sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    tick: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  // Stable colour per show name, used when there is no artwork.
  function hue(name) {
    var x = 0;
    for (var i = 0; i < name.length; i++) x = (x * 31 + name.charCodeAt(i)) >>> 0;
    return x % 360;
  }
  function artStyle(name, img) {
    if (img) return 'background-image:url("' + img.replace(/"/g, '%22') + '")';
    var hh = hue(name);
    return 'background-image:linear-gradient(135deg,hsl(' + hh + ',45%,32%),hsl(' + ((hh + 40) % 360) + ',55%,18%))';
  }
  function initials(name) {
    var words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
    return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase();
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function formatDuration(s) {
    s = Math.round(s);
    var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return hh ? hh + ' h ' + m + ' min' : Math.max(1, m) + ' min';
  }

  function api(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function thumbEl(ep) {
    var f = fraction(ep.id);
    return h('div', { class: 'thumb', style: ep.thumb ? 'background-image:url("' + ep.thumb + '")' : '' }, [
      isWatched(ep.id) ? h('div', { class: 'tick', html: ICON.tick }) : null,
      f > 0.01 && !isWatched(ep.id)
        ? h('div', { class: 'progress' }, [h('i', { style: 'width:' + (f * 100).toFixed(1) + '%' })])
        : null
    ]);
  }

  // Title bar, fixed to the bottom of the screen.
  function bar(title, opts) {
    opts = opts || {};
    return h('nav', { class: 'bar' }, [
      opts.back ? h('button', { class: 'icon-btn', 'aria-label': 'Back', html: ICON.back, onclick: opts.back }) : null,
      h('h1', null, [title]),
      h('button', {
        class: 'icon-btn', 'aria-label': 'Refresh', html: ICON.refresh,
        onclick: function (e) {
          var b = e.currentTarget;
          b.classList.add('spinning');
          refresh(true).then(function () { b.classList.remove('spinning'); });
        }
      })
    ]);
  }

  function loadingView(title, opts) {
    mount([bar(title || 'BeechView', opts), h('div', { class: 'empty loading' }, [
      h('div', { class: 'spinner' }), 'Loading\u2026'
    ])]);
  }

  // ---------------------------------------------------------------- views
  function renderHome() {
    document.title = 'BeechView';
    if (!state.loaded) return loadingView();
    var shows = state.shows;
    var nodes = [bar('BeechView')];

    if (!shows.length) {
      nodes.push(h('div', { class: 'empty' }, [
        h('strong', null, ['No shows yet']),
        'Add a folder to the shows directory and it will appear here automatically.'
      ]));
      return mount(nodes);
    }

    // Continue watching: partly watched episodes, most recent first.
    var inProgress = Object.keys(progress)
      .filter(function (id) {
        var p = progress[id];
        return p.d && p.t > 15 && !isWatched(id) && p.show;
      })
      .sort(function (a, b) { return progress[b].at - progress[a].at; })
      .slice(0, 8);

    if (inProgress.length) {
      nodes.push(h('div', { class: 'section-title' }, ['Continue watching']));
      nodes.push(h('div', { class: 'rail' }, inProgress.map(function (id) {
        var p = progress[id];
        var ep = { id: id, thumb: p.thumb, title: p.title };
        return h('button', {
          class: 'resume',
          onclick: function () { go('#/play/' + encodeURIComponent(p.show) + '/' + encodeURIComponent(id)); }
        }, [
          thumbEl(ep),
          h('div', { class: 'name' }, [p.title || 'Episode']),
          h('div', { class: 'sub' }, [(p.showName || '') + ' · ' + formatDuration(p.d - p.t) + ' left'])
        ]);
      })));
    }

    nodes.push(h('div', { class: 'section-title' }, ['Shows']));
    nodes.push(h('div', { class: 'grid' }, shows.map(function (s) {
      var fresh = s.latest && Date.now() - s.latest < NEW_MS;
      return h('button', { class: 'card', onclick: function () { go('#/show/' + s.id); } }, [
        h('div', { class: 'art', style: artStyle(s.name, s.poster) }, [s.poster ? null : initials(s.name)]),
        fresh ? h('span', { class: 'badge' }, ['NEW']) : null,
        h('div', { class: 'meta' }, [
          h('div', { class: 'name' }, [s.name]),
          h('div', { class: 'count' }, [s.episodeCount + (s.episodeCount === 1 ? ' episode' : ' episodes')])
        ])
      ]);
    })));

    mount(nodes);
  }

  function sortedEpisodes(show) {
    var eps = show.episodes.slice();
    if (state.sortOldest) eps.reverse();
    return eps;
  }

  // The episode to offer on "Play": resume the most recent one in progress,
  // otherwise the oldest unwatched one, otherwise the newest.
  function suggested(show) {
    var eps = show.episodes; // newest first
    var best = null;
    eps.forEach(function (e) {
      var p = getProgress(e.id);
      if (p && p.t > 15 && !isWatched(e.id) && (!best || p.at > getProgress(best.id).at)) best = e;
    });
    if (best) return { ep: best, label: 'Resume' };
    for (var i = eps.length - 1; i >= 0; i--) {
      if (!isWatched(eps[i].id)) return { ep: eps[i], label: i === eps.length - 1 ? 'Play first' : 'Play next' };
    }
    return eps[0] ? { ep: eps[0], label: 'Play latest' } : null;
  }

  function renderShow() {
    var show = state.show;
    document.title = show.name + ' – BeechView';
    var pick = suggested(show);
    var nodes = [
      bar(show.name, { back: function () { go('#/'); } }),
      h('div', { class: 'show-head' }, [
        h('div', { class: 'art', style: artStyle(show.name, show.poster) }, [show.poster ? null : initials(show.name)]),
        h('div', { class: 'info' }, [
          h('div', { class: 'count' }, [
            show.episodes.length + (show.episodes.length === 1 ? ' episode' : ' episodes')
          ]),
          h('div', { class: 'actions' }, [
            pick ? h('button', {
              class: 'pill', onclick: function () { play(pick.ep); }, html: ICON.play + '<span></span>'
            }) : null,
            h('button', {
              class: 'pill ghost',
              html: ICON.sort + '<span>' + (state.sortOldest ? 'Oldest first' : 'Newest first') + '</span>',
              onclick: function () {
                state.sortOldest = !state.sortOldest;
                save('sortOldest', state.sortOldest);
                renderShow();
              }
            })
          ])
        ])
      ])
    ];
    if (pick) nodes[1].querySelector('.pill span').textContent = pick.label;

    if (!show.episodes.length) {
      nodes.push(h('div', { class: 'empty' }, [
        h('strong', null, ['Nothing here yet']),
        'New episodes will appear when they are added to this folder.'
      ]));
    } else {
      nodes.push(h('div', { class: 'episodes' }, sortedEpisodes(show).map(function (ep) {
        var p = getProgress(ep.id);
        var bits = [];
        if (ep.date) bits.push(formatDate(ep.date));
        if (p && p.d) bits.push(formatDuration(p.d));
        return h('button', {
          class: 'ep' + (isWatched(ep.id) ? ' watched' : ''),
          onclick: function () { play(ep); }
        }, [
          thumbEl(ep),
          h('div', { class: 'info' }, [
            h('div', { class: 'title' }, [ep.title]),
            h('div', { class: 'sub' }, [
              bits.join(' · '),
              ep.playable ? null : h('span', { class: 'warn' }, [(bits.length ? ' · ' : '') + 'may not play in Safari'])
            ])
          ])
        ]);
      })));
    }
    mount(nodes);
  }

  function mount(nodes) {
    var y = state.keepScroll ? window.scrollY : 0;
    app.innerHTML = '';
    nodes.forEach(function (n) { app.appendChild(n); });
    window.scrollTo(0, y);
    state.keepScroll = false;
  }

  // ---------------------------------------------------------------- player
  var saveTimer = null, fadeTimer = null, nextTimer = null;

  function play(ep) {
    go('#/play/' + state.show.id + '/' + encodeURIComponent(ep.id));
  }

  function openPlayer(show, ep) {
    state.playing = { show: show, ep: ep };
    document.getElementById('playerShow').textContent = show.name;
    document.getElementById('playerEp').textContent = ep.title;
    document.title = ep.title + ' – BeechView';
    cancelUpNext();

    while (video.firstChild) video.removeChild(video.firstChild);
    video.removeAttribute('poster');
    if (ep.thumb) video.poster = ep.thumb;
    video.src = ep.src;
    if (ep.subtitles) {
      video.appendChild(h('track', { kind: 'subtitles', src: ep.subtitles, srclang: 'en', label: 'English' }));
    }

    var p = getProgress(ep.id);
    var resumeAt = p && !isWatched(ep.id) && p.t > 5 ? p.t - 3 : 0;
    video.addEventListener('loadedmetadata', function onMeta() {
      video.removeEventListener('loadedmetadata', onMeta);
      if (resumeAt && resumeAt < video.duration - 5) video.currentTime = resumeAt;
    });

    player.hidden = false;
    document.body.style.overflow = 'hidden';
    var attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(function () { /* autoplay blocked: user taps play */ });
    showBar();
  }

  function closePlayer() {
    if (!state.playing) return;
    persist();
    video.pause();
    video.removeAttribute('src');
    video.load();
    player.hidden = true;
    document.body.style.overflow = '';
    state.playing = null;
    cancelUpNext();
  }

  function persist(extra) {
    var pl = state.playing;
    if (!pl || !video.duration) return;
    setProgress(pl.ep.id, video.currentTime, video.duration, Object.assign({
      show: pl.show.id, showName: pl.show.name, title: pl.ep.title, thumb: pl.ep.thumb
    }, extra || {}));
  }

  video.addEventListener('timeupdate', function () {
    if (saveTimer) return;
    saveTimer = setTimeout(function () { saveTimer = null; persist(); }, 5000);
  });
  video.addEventListener('pause', function () { persist(); showBar(true); });
  video.addEventListener('play', function () { showBar(); });

  // The episode after this one, in broadcast order (i.e. the next newer one).
  function nextEpisode() {
    var pl = state.playing;
    if (!pl) return null;
    var eps = pl.show.episodes;
    var i = eps.findIndex(function (e) { return e.id === pl.ep.id; });
    return i > 0 ? eps[i - 1] : null;
  }

  video.addEventListener('ended', function () {
    persist({ done: true });
    var next = nextEpisode();
    if (!next) { history.back(); return; }
    var n = 8;
    document.getElementById('upNextTitle').textContent = next.title;
    document.getElementById('upNextCount').textContent = n;
    upNext.hidden = false;
    nextTimer = setInterval(function () {
      n -= 1;
      document.getElementById('upNextCount').textContent = n;
      if (n <= 0) { cancelUpNext(); goNext(next); }
    }, 1000);
    document.getElementById('upNextPlay').onclick = function () { cancelUpNext(); goNext(next); };
  });
  document.getElementById('upNextCancel').onclick = cancelUpNext;

  function goNext(next) {
    location.replace('#/play/' + state.playing.show.id + '/' + encodeURIComponent(next.id));
  }
  function cancelUpNext() {
    clearInterval(nextTimer);
    nextTimer = null;
    upNext.hidden = true;
  }

  video.addEventListener('error', function () {
    var pl = state.playing;
    if (!pl) return;
    document.getElementById('playerEp').textContent =
      pl.ep.title + (pl.ep.playable ? ' (could not be played)' : ' (format not supported by Safari)');
    showBar(true);
  });

  // Back/title bar fades away during playback; tap the screen to bring it back.
  function showBar(stay) {
    playerBar.classList.remove('faded');
    clearTimeout(fadeTimer);
    if (!stay) {
      fadeTimer = setTimeout(function () {
        if (!video.paused) playerBar.classList.add('faded');
      }, 3500);
    }
  }
  player.addEventListener('touchstart', function () { showBar(); }, { passive: true });
  player.addEventListener('mousemove', function () { showBar(); });
  document.getElementById('playerBack').addEventListener('click', function () { history.back(); });

  // ---------------------------------------------------------------- routing
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function findShow(id) {
    return api('api/shows/' + id).then(function (show) {
      state.show = show;
      return show;
    });
  }

  function route() {
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    if (parts[0] === 'play' && parts[1] && parts[2]) {
      var epId = decodeURIComponent(parts.slice(2).join('/'));
      var ready = state.show && state.show.id === parts[1] ? Promise.resolve(state.show) : findShow(parts[1]);
      ready.then(function (show) {
        var ep = show.episodes.find(function (e) { return e.id === epId; });
        if (!ep) { location.replace('#/show/' + show.id); return; }
        if (!app.firstChild) renderShow(); // deep link: draw the show underneath
        openPlayer(show, ep);
      }).catch(function () { location.replace('#/'); });
      return;
    }

    closePlayer();
    if (parts[0] === 'show' && parts[1]) {
      var cached = state.show && state.show.id === parts[1];
      if (cached) { state.keepScroll = true; renderShow(); }
      else loadingView('BeechView', { back: function () { go('#/'); } });
      findShow(parts[1]).then(function () { state.keepScroll = cached; renderShow(); })
        .catch(function () { location.replace('#/'); });
      return;
    }

    state.show = null;
    renderHome();
    refresh();
  }

  // On launch (and when Safari restores the page), start from the home
  // screen with a fresh look at the library rather than an old page.
  function launch() {
    state.loaded = false;
    state.failures = 0;
    state.show = null;
    closePlayer();
    if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search + '#/');
    route();     // shows "Loading…" and fetches the server's latest scan
    refresh(true); // then asks the server to rescan the folders now
  }

  // Re-scan the library. New folders become new shows without a reload.
  var retryTimer = null;
  function refresh(force) {
    return api('api/shows' + (force ? '?refresh=1' : '')).then(function (data) {
      state.shows = data.shows;
      state.loaded = true;
      state.failures = 0;
      if (state.playing) return;
      state.keepScroll = true;
      if (state.show) {
        return findShow(state.show.id).then(function () { state.keepScroll = true; renderShow(); });
      }
      renderHome();
    }).catch(function () {
      if (state.loaded) return;
      // Not loaded yet: keep showing "Loading…" and try again shortly. After a
      // few failures, explain what's wrong (but keep retrying).
      state.failures += 1;
      if (state.failures >= 5 && !state.show && !state.playing) {
        mount([bar('BeechView'), h('div', { class: 'empty' }, [
          h('strong', null, ['Can\u2019t reach the library']),
          'Still trying\u2026 Check that the BeechView server is running.'
        ])]);
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(function () { if (!state.loaded) refresh(); }, 3000);
    });
  }

  setInterval(function () { if (!document.hidden && !state.playing) refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) persist();
    else if (!state.playing) refresh();
  });
  window.addEventListener('pagehide', function () { persist(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) launch(); });
  window.addEventListener('hashchange', route);
  launch();
})();
