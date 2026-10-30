/* Amaranthine landing page: sizes the two phones, starts the in-browser demo, runs the controls.
   window.AmaranthineDemo comes from assets/demo-api.js. */
(function () {
  'use strict';

  var FRAME_W = 414; // 390 screen + 12px bezel each side
  var FRAME_H = 868; // 844 screen + 12px bezel each side
  var MIN_SCALE = 0.5;
  var BOTTOM_ROOM = 20;

  var stage = document.getElementById('demo');
  var phones = stage.querySelector('.phones');
  var problem = document.getElementById('stage-problem');
  var status = document.getElementById('status');
  var statusText = status.querySelector('.status-text');
  var btnLoad = document.getElementById('load-family');
  var btnFresh = document.getElementById('start-fresh');
  var switchBtns = stage.querySelectorAll('.switch-btn');

  var NAMES = { rose: 'Rose’s', anna: 'Anna’s' };
  var frames = {
    rose: document.getElementById('frame-rose'),
    anna: document.getElementById('frame-anna')
  };

  var narrow = window.matchMedia('(max-width: 819.98px)');
  var wide = window.matchMedia('(min-width: 1080px)');

  /* ---------- Sizing ----------
     Each phone is drawn at its real size (414 x 868) and shrunk with transform: scale(--s).
     Its .slot is sized to the scaled box, so the page lays out around what you actually see. */

  function setScale(s) {
    phones.style.setProperty('--s', s.toFixed(4));
  }

  function captionRoom() {
    var room = 0;
    phones.querySelectorAll('.device').forEach(function (device) {
      var slot = device.querySelector('.slot');
      room = Math.max(room, device.offsetHeight - slot.offsetHeight);
    });
    return room;
  }

  function layout() {
    var width = stage.clientWidth;
    if (!width) return;

    if (narrow.matches) {
      // One phone at a time, filling the width.
      setScale(Math.min(1, width / FRAME_W));
      return;
    }

    var gap = parseFloat(getComputedStyle(phones).columnGap) || 28;
    var byWidth = Math.min(1, (width - gap) / (2 * FRAME_W));
    var s = byWidth;

    // Fit the whole phone and its caption in the window. Two passes, because the
    // captions wrap differently once the phones change width.
    for (var pass = 0; pass < 2; pass++) {
      setScale(s);
      var top = wide.matches ? stickyTop() : 24;
      var above = phones.getBoundingClientRect().top - stage.getBoundingClientRect().top;
      var avail = window.innerHeight - top - above - captionRoom() - BOTTOM_ROOM;
      s = Math.max(MIN_SCALE, Math.min(byWidth, avail / FRAME_H));
    }
    setScale(s);
  }

  function stickyTop() {
    return parseFloat(getComputedStyle(stage).top) || 24;
  }

  var queued = false;
  function queueLayout() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      layout();
    });
  }

  window.addEventListener('resize', queueLayout);
  [narrow, wide].forEach(function (mq) {
    if (mq.addEventListener) mq.addEventListener('change', queueLayout);
    else if (mq.addListener) mq.addListener(queueLayout);
  });
  if ('ResizeObserver' in window) new ResizeObserver(queueLayout).observe(stage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLayout);
  layout();

  /* ---------- Narrow-screen switch: show or hide, no reload ---------- */

  switchBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.getAttribute('data-show');
      phones.setAttribute('data-active', name);
      switchBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });

  /* ---------- Status and busy state ---------- */

  var busy = true;

  function setStatus(text, state) {
    statusText.textContent = text;
    status.classList.toggle('is-busy', state === 'busy');
    status.classList.toggle('is-done', state === 'done');
  }

  function setBusy(on) {
    busy = on;
    stage.setAttribute('aria-busy', String(on));
    [btnLoad, btnFresh].forEach(function (b) {
      b.disabled = false;
      // aria-disabled rather than disabled, so the pressed button keeps keyboard focus.
      if (on) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    });
  }

  function setScreen(name, state, text) {
    var screen = frames[name].closest('.screen');
    screen.classList.toggle('is-waiting', state === 'waiting');
    screen.classList.toggle('is-live', state === 'live');
    screen.classList.toggle('is-failed', state === 'failed');
    if (text) screen.querySelector('.placeholder-text').textContent = text;
  }

  /* ---------- Phones ---------- */

  // Point both iframes at the app again (a fresh load) and resolve once both have loaded.
  function loadFrames() {
    return Promise.all(Object.keys(frames).map(function (name) {
      var frame = frames[name];
      setScreen(name, 'waiting', 'Opening ' + NAMES[name] + ' phone…');
      return new Promise(function (resolve) {
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          frame.removeEventListener('load', finish);
          setScreen(name, 'live');
          resolve();
        }
        frame.addEventListener('load', finish);
        // Never leave the page stuck if a load event goes missing.
        window.setTimeout(finish, 20000);
        frame.setAttribute('src', frame.getAttribute('data-src'));
      });
    }));
  }

  function fail(message) {
    busy = true;
    stage.setAttribute('aria-busy', 'false');
    problem.textContent = message;
    problem.hidden = false;
    setStatus('', '');
    status.hidden = true;
    Object.keys(frames).forEach(function (name) {
      setScreen(name, 'failed', NAMES[name] + ' phone can’t open in this browser.');
    });
    queueLayout();
  }

  var UNSUPPORTED =
    'This browser can’t run the demo. It needs service workers, which some browsers switch off, ' +
    'often in private windows. Try a current Chrome, Safari or Firefox in a normal window.';
  var MISSING =
    'The demo didn’t load. Check your connection and reload the page.';

  /* ---------- Start ---------- */

  async function boot() {
    if (!('serviceWorker' in navigator)) return fail(UNSUPPORTED);

    var api = window.AmaranthineDemo;
    if (!api || typeof api.ready !== 'function') return fail(MISSING);

    setStatus('Getting the phones ready…', 'busy');
    var slow = window.setTimeout(function () {
      setStatus('Still getting the phones ready. The first time can take a few seconds.', 'busy');
    }, 8000);

    try {
      await api.ready();
    } catch (err) {
      window.clearTimeout(slow);
      if (window.console) console.error('Amaranthine demo: ready() failed', err);
      return fail(UNSUPPORTED);
    }
    window.clearTimeout(slow);

    try {
      if (api.isFirstVisit()) {
        setStatus('Loading Rose’s family…', 'busy');
        await api.loadDemoFamily();
      }
      await loadFrames();
      setBusy(false);
      setStatus('Both phones are live.', 'done');
    } catch (err) {
      if (window.console) console.error('Amaranthine demo: first load failed', err);
      setBusy(false);
      setStatus('Rose’s family didn’t load. Press “Load Rose’s family” to try again.', '');
    }
  }

  async function run(kind) {
    if (busy) return;
    var api = window.AmaranthineDemo;
    setBusy(true);
    setStatus(kind === 'family' ? 'Loading Rose’s family…' : 'Emptying both phones…', 'busy');
    try {
      if (kind === 'family') await api.loadDemoFamily();
      else await api.startFresh();
      await loadFrames();
      setStatus(
        kind === 'family'
          ? 'Rose’s family is loaded on both phones.'
          : 'Both phones are back at the Welcome screen. Start on Anna’s phone.',
        'done'
      );
    } catch (err) {
      if (window.console) console.error('Amaranthine demo: ' + kind + ' failed', err);
      setStatus('That didn’t work. Reload the page and try again.', '');
    } finally {
      setBusy(false);
    }
  }

  /* ---------- "Show me" steps: open the right screen on the right phone ---------- */

  var pointTimer = null;
  document.querySelectorAll('[data-go]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (busy) return;
      var name = btn.getAttribute('data-go');
      var frame = frames[name];
      // A fresh load straight onto that screen; the phone's own storage keeps Rose's family.
      frame.setAttribute('src', 'app' + btn.getAttribute('data-path') + '?phone=' + name);
      // On a phone-sized screen, switch to that phone.
      if (narrow.matches) {
        phones.setAttribute('data-active', name);
        switchBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-show') === name)); });
      }
      var device = frame.closest('.device');
      document.querySelectorAll('.device').forEach(function (d) { d.classList.remove('is-pointed'); });
      device.classList.add('is-pointed');
      window.clearTimeout(pointTimer);
      pointTimer = window.setTimeout(function () { device.classList.remove('is-pointed'); }, 2200);
      device.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });

  /* ---------- The demo video ---------- */

  var dialog = document.getElementById('video-dialog');
  var video = document.getElementById('demo-video');
  document.getElementById('watch-video').addEventListener('click', function () {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    video.play().catch(function () {});
  });
  dialog.addEventListener('close', function () { video.pause(); });

  btnLoad.addEventListener('click', function () { run('family'); });
  btnFresh.addEventListener('click', function () { run('fresh'); });

  boot();
})();
