// The landing page's controls for the web demo. The backend is a service worker (sw.js) that runs
// the real server code in this browser; this file starts it and sets the two phones up.
//
// Each phone is the app in an iframe (app/?phone=rose, app/?phone=anna) and keeps its own storage
// under "amaranthine:<phone>:…" in localStorage. Setting a phone up = writing that storage.
(function () {
  'use strict';

  var API = 'api';
  var STARTED = 'amaranthine:demo:started';
  var VERSION = 0; // zustand persist version used by the app

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok) throw new Error(json && json.message ? json.message : 'HTTP ' + r.status);
        return json;
      });
    });
  }

  function clearPhones() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('amaranthine:rose:') === 0 || k.indexOf('amaranthine:anna:') === 0)) keys.push(k);
    }
    keys.forEach(function (k) {
      localStorage.removeItem(k);
    });
  }

  var hasRecognizer = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function writeDevice(phone, state) {
    var full = {
      role: null,
      familyId: null,
      userId: null,
      deviceId: 'web-' + phone,
      setupStep: 'sign-in',
      // Browsers without speech recognition get the scripted mic, so the voice paths still show.
      demo: { sttMode: hasRecognizer ? 'device' : 'mock-understood', speakAloud: true },
    };
    for (var k in state) full[k] = state[k];
    localStorage.setItem('amaranthine:' + phone + ':amaranthine-device', JSON.stringify({ state: full, version: VERSION }));
  }

  var readyPromise = null;

  window.AmaranthineDemo = {
    /** Resolves once the service worker controls this page and answers. */
    ready: function () {
      if (readyPromise) return readyPromise;
      readyPromise = new Promise(function (resolve, reject) {
        if (!('serviceWorker' in navigator)) return reject(new Error('Service workers are not supported in this browser.'));
        navigator.serviceWorker
          .register('sw.js', { scope: './' })
          .then(function () {
            return navigator.serviceWorker.ready;
          })
          .then(function () {
            if (navigator.serviceWorker.controller) return;
            // First visit: the worker activates and claims this page.
            return new Promise(function (ok) {
              navigator.serviceWorker.addEventListener('controllerchange', function () {
                ok();
              });
              setTimeout(ok, 4000);
            });
          })
          .then(function () {
            if (!navigator.serviceWorker.controller) {
              // Rare: the page wasn't claimed. One reload fixes it.
              location.reload();
              return new Promise(function () {});
            }
            return fetch(API + '/health').then(function (r) {
              if (!r.ok) throw new Error('The demo backend didn’t start.');
            });
          })
          .then(resolve, reject);
      });
      return readyPromise;
    },

    isFirstVisit: function () {
      return !localStorage.getItem(STARTED);
    },

    /** Rose Whitman's family, ready to use: Rose's phone linked, Anna's phone signed in. */
    loadDemoFamily: function () {
      return post('/dev/reset', { start: 'ready' })
        .then(function (res) {
          clearPhones();
          return post('/auth/sign-in', { provider: 'apple' }).then(function (signed) {
            writeDevice('anna', { role: 'family', familyId: signed.familyId, userId: signed.userId, setupStep: 'done' });
            return post('/families/' + encodeURIComponent(res.familyId) + '/link-codes');
          });
        })
        .then(function (link) {
          return post('/link', { code: link.code, deviceId: 'web-rose' });
        })
        .then(function (redeemed) {
          writeDevice('rose', { role: 'grandparent', familyId: redeemed.familyId, setupStep: 'done' });
          localStorage.setItem(STARTED, '1');
        });
    },

    /** Nothing at all: both phones open on Welcome, to try setup and linking. */
    startFresh: function () {
      return post('/dev/reset', { start: 'fresh' }).then(function () {
        clearPhones();
        writeDevice('rose', {});
        writeDevice('anna', {});
        localStorage.setItem(STARTED, '1');
      });
    },
  };
})();
