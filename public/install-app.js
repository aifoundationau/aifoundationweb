/* ==========================================================================
   Download App (header button)
   Installs the site as an app from site.webmanifest:
   - Chrome, Edge, Samsung Internet (Android & desktop): the browser's own install prompt.
   - iPhone/iPad, desktop Safari, Firefox, or a browser that has not offered its prompt:
     a short how-to dialog, since those browsers have no install prompt to trigger.
   The button hides itself when the site is already open as an installed app.
   Any element with [data-download-app] acts as a Download App button.
   ========================================================================== */
(function () {
  'use strict';

  var deferredPrompt = null;
  var dialog = null;

  function isInstalledApp() {
    var modes = ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen'];
    for (var i = 0; i < modes.length; i++) {
      if (window.matchMedia && window.matchMedia('(display-mode: ' + modes[i] + ')').matches) return true;
    }
    return window.navigator.standalone === true; // iOS home screen
  }

  function setButtonsHidden(hidden) {
    var btns = document.querySelectorAll('[data-download-app]');
    for (var i = 0; i < btns.length; i++) btns[i].hidden = hidden;
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    var isAndroid = /Android/.test(ua);
    if (/Firefox\//.test(ua)) return isAndroid ? 'firefox-android' : 'firefox-desktop';
    if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'safari-mac';
    return isAndroid ? 'android' : 'desktop';
  }

  var MENU = '<i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>';
  var SHARE = '<i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>';

  var HELP = {
    ios: {
      intro: 'Add AI Foundation to your Home Screen:',
      steps: [
        'Tap the <strong>Share</strong> button ' + SHARE + ' in the browser toolbar.',
        'Scroll down and tap <strong>Add to Home Screen</strong>.',
        'Tap <strong>Add</strong>. The app appears on your Home Screen.'
      ]
    },
    'safari-mac': {
      intro: 'Add AI Foundation to your Dock:',
      steps: [
        'In the Safari menu bar, choose <strong>File</strong> &rarr; <strong>Add to Dock</strong>.',
        'Click <strong>Add</strong>. The app opens from your Dock and Launchpad.'
      ]
    },
    'firefox-android': {
      intro: 'Install AI Foundation on your phone:',
      steps: [
        'Tap the browser menu ' + MENU + '.',
        'Tap <strong>Install</strong> or <strong>Add to Home screen</strong>.'
      ]
    },
    'firefox-desktop': {
      intro: 'Firefox on computers cannot install web apps.',
      steps: [
        'Open <strong>www.aifoundation.net.au</strong> in <strong>Chrome</strong> or <strong>Edge</strong>.',
        'Click <strong>Download App</strong> at the top of the page.'
      ]
    },
    android: {
      intro: 'Install AI Foundation on your phone:',
      steps: [
        'Tap the browser menu ' + MENU + '.',
        'Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.'
      ]
    },
    desktop: {
      intro: 'Install AI Foundation on this computer:',
      steps: [
        'Click the install icon at the right end of the address bar, or open the browser menu ' + MENU + '.',
        'Choose <strong>Install AI Foundation</strong> (Chrome: <em>Cast, save and share</em> &rarr; <em>Install page as app</em>; Edge: <em>Apps</em> &rarr; <em>Install this site as an app</em>).',
        'Already installed? Open it from your Start menu, Dock or app launcher.'
      ]
    }
  };

  function buildDialog() {
    var d = document.createElement('dialog');
    d.className = 'install-help-dialog';
    d.setAttribute('aria-labelledby', 'installHelpTitle');
    d.setAttribute('data-testid', 'install-help-dialog');
    d.innerHTML =
      '<div class="install-help-head">' +
        '<img src="assets/app-icon-192.png" alt="" class="install-help-icon" width="48" height="48">' +
        '<div class="install-help-titles">' +
          '<h2 id="installHelpTitle" class="install-help-title">Download the AI Foundation app</h2>' +
          '<p class="install-help-intro"></p>' +
        '</div>' +
      '</div>' +
      '<ol class="install-help-steps"></ol>' +
      '<div class="install-help-actions">' +
        '<button type="button" class="install-help-close" data-agent-id="install-help-close" data-testid="install-help-close">Got it</button>' +
      '</div>';
    d.querySelector('.install-help-close').addEventListener('click', closeHelp);
    // A click on the dimmed backdrop (outside the panel) closes it
    d.addEventListener('click', function (e) {
      if (e.target === d) closeHelp();
    });
    document.body.appendChild(d);
    return d;
  }

  function openHelp() {
    var help = HELP[detectPlatform()];
    dialog = dialog || buildDialog();
    dialog.querySelector('.install-help-intro').textContent = help.intro;
    dialog.querySelector('.install-help-steps').innerHTML = help.steps.map(function (s) {
      return '<li>' + s + '</li>';
    }).join('');
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    dialog.querySelector('.install-help-close').focus();
  }

  function closeHelp() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  // Chromium browsers fire this when the site can be installed; keep it for the button click
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    closeHelp();
    setButtonsHidden(true);
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-download-app]');
    if (!btn) return;
    e.preventDefault();
    if (deferredPrompt) {
      var prompt = deferredPrompt;
      deferredPrompt = null; // a prompt can only be shown once
      prompt.prompt();
      if (prompt.userChoice) prompt.userChoice.catch(function () {});
      return;
    }
    openHelp();
  });

  function init() {
    if (isInstalledApp()) setButtonsHidden(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
