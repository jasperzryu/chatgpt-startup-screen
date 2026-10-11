/* Desktop bridge around the upstream runtime and its original settings panel. */
(async function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const settingsOnly = params.has('settings');
  const previewOnly = params.has('preview') || settingsOnly;
  const $ = id => document.getElementById(id);
  let settingsOpen = false;
  let previewing = previewOnly;
  let handoffSent = false;
  let loaded = false;
  window.__CHATGPT_AUDIO_EVENTS__ = [];
  window.__CHATGPT_STAGE_EVENTS__ = [];
  window.addEventListener('chatgpt-startup:audio', event => {
    window.__CHATGPT_AUDIO_EVENTS__.push(Object.assign({}, event.detail, {
      meter: !!document.querySelector('.dsu-voice.dsu-on'),
      welcomeVisible: !!document.querySelector('.dsu-welcome.dsu-in')
    }));
  });
  window.addEventListener('chatgpt-startup:stage', event => window.__CHATGPT_STAGE_EVENTS__.push(event.detail));

  function send(type, extra) {
    const value = Object.assign({ type }, extra || {});
    if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(value);
    else if (type === 'launch') $('landingStatus').textContent = 'The desktop launcher will open ChatGPT here.';
  }

  function skin(config) { document.body.classList.toggle('dark', config.theme === 'dark'); }
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (resource, options) {
    const response = await realFetch(resource, options);
    if (String(resource).split('?')[0].endsWith('/dsh-startup/config') && response.ok) {
      const data = await response.clone().json();
      if (data.ok && data.config) { window.__DSH_STARTUP__ = data.config; skin(data.config); }
    }
    return response;
  };

  async function script(url) {
    await new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = url; node.onload = resolve; node.onerror = () => reject(new Error('Could not load ' + url));
      document.head.appendChild(node);
    });
  }

  function wrapReplay() {
    const api = window.__DSH_STARTUP_API__;
    if (!api || api.__desktopWrapped) return;
    const original = api.replay;
    api.replay = function () {
      previewing = previewOnly || settingsOpen;
      settingsOpen = false; $('settingsDialog').hidden = true;
      original();
      const watcher = setInterval(() => {
        if (window.__DSH_STARTUP_API__ !== api) { clearInterval(watcher); wrapReplay(); }
      }, 20);
      setTimeout(() => clearInterval(watcher), 3000);
    };
    api.__desktopWrapped = true;
  }

  function openSettings() {
    settingsOpen = true; previewing = true;
    if (window.__DSH_STARTUP_API__) window.__DSH_STARTUP_API__.skip();
    $('settingsDialog').hidden = false;
    $('closeSettings').focus();
  }
  function closeSettings() {
    settingsOpen = false; $('settingsDialog').hidden = true;
    if (!previewOnly && window.__DSH_STARTUP_API__) {
      previewing = false; window.__DSH_STARTUP_API__.replay();
    }
  }
  function launch() {
    if (handoffSent) return;
    handoffSent = true; $('landingStatus').textContent = 'Opening ChatGPT…';
    send('launch');
  }
  $('launchApp').addEventListener('click', launch);
  $('settingsButton').addEventListener('click', openSettings);
  $('landingSettings').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('closeButton').addEventListener('click', () => send('close'));
  $('replay').addEventListener('click', () => {
    previewing = previewOnly;
    if (window.__DSH_STARTUP_API__) window.__DSH_STARTUP_API__.replay();
  });
  $('settingsDialog').addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') closeSettings();
    if (event.key === 'Tab') {
      const items = [...$('settingsDialog').querySelectorAll('button,input,select')].filter(e => !e.disabled && e.offsetParent);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.key === ',') { event.preventDefault(); openSettings(); }
  });
  window.addEventListener('dsh-startup:done', () => {
    send('animationDone');
    if (!settingsOpen && !previewing) launch();
  });

  window.__CHATGPT_STARTUP_REPLAY__ = async function (patch) {
    if (window.__DSH_STARTUP_API__) window.__DSH_STARTUP_API__.finish();
    await new Promise(resolve => setTimeout(resolve, 950));
    window.__DSH_STARTUP__ = Object.assign({}, window.__DSH_STARTUP__, patch || {});
    previewing = true; settingsOpen = false; $('settingsDialog').hidden = true;
    if (window.__DSH_STARTUP_API__) window.__DSH_STARTUP_API__.replay();
  };
  window.__CHATGPT_OPEN_SETTINGS__ = openSettings;

  try {
    const response = await fetch('/dsh-startup/config');
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Could not load settings');
    const config = data.config;
    window.__DSH_STARTUP_VERSION__ = data.version;
    window.__DSH_STARTUP_BOOT__ = 'index';
    window.__DSH_STARTUP_SCRIPT_URL__ = '/dsh-startup/splash.js';
    const today = new Date().toISOString().slice(0, 10);
    const skip = settingsOnly || !config.enabled ||
      (!previewOnly && config.mode === 'daily' && localStorage.getItem('dsh-startup-screen:day') === today) ||
      (!previewOnly && config.mode === 'session' && sessionStorage.getItem('dsh-startup-screen:shown') === '1');
    window.__DSH_STARTUP_SKIP__ = skip;
    if (skip) $('dsh-startup-root').remove();
    await script('/dsh-startup/splash.js');
    wrapReplay();

    // Mount the original DSH React settings component in this desktop shell.
    window.__ModuleLoader__ = { load(bundle) {
      const plugin = bundle.factory(name => {
        if (name === 'react') return window.React;
        throw new Error('Unknown dependency: ' + name);
      });
      plugin.apply({ slots: {
        inject(_slot, create) { create(); },
        register(_meta, render) {
          window.ReactDOM.createRoot($('settingsPanel')).render(render());
          return () => {};
        }
      } });
    } };
    await script('/dsh-startup/client.js');
    loaded = true; window.__CHATGPT_STARTUP_READY__ = true;
    send('ready');
    if (settingsOnly) { document.body.classList.add('settings-only'); openSettings(); }
    else if (skip && !previewOnly) launch();
  } catch (error) {
    const root = $('dsh-startup-root');
    if (root) root.remove();
    $('landingStatus').textContent = error.message;
    send('error', { message: error.message });
    if (!previewOnly) launch();
  }
  setTimeout(() => {
    if (!loaded && !previewOnly) launch();
    else if (window.__DSH_STARTUP_FAILED__ && !previewOnly && !settingsOpen) launch();
  }, 12000);
})();
