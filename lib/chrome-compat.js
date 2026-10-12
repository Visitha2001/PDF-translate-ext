/**
 * PolyGlot PDF - Extension API Compatibility & Polyfill Layer
 * Ensures seamless operation both inside Chrome Extension runtime (MV3)
 * and standalone web / browser preview modes.
 */

(function () {
  const isExtensionRuntime = typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;

  if (isExtensionRuntime) {
    // Running in real Chrome Extension context, no shims needed
    return;
  }

  console.info('[PolyGlot] Initializing Standalone Web API Polyfill...');

  window.chrome = window.chrome || {};

  // Mock chrome.storage.local with localStorage
  chrome.storage = chrome.storage || {};
  chrome.storage.local = {
    async get(keys) {
      const result = {};
      const defaultValues = typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(defaultValues));

      for (const k of (keyList.length ? keyList : Object.keys(localStorage))) {
        try {
          const val = localStorage.getItem(`polyglot_${k}`);
          result[k] = val !== null ? JSON.parse(val) : (defaultValues[k] !== undefined ? defaultValues[k] : undefined);
        } catch (e) {
          result[k] = defaultValues[k];
        }
      }
      return result;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        try {
          localStorage.setItem(`polyglot_${k}`, JSON.stringify(v));
        } catch (e) {
          console.warn('Storage set failed:', e);
        }
      }
    }
  };

  // Mock chrome.runtime
  chrome.runtime = chrome.runtime || {};
  chrome.runtime.getURL = (path) => {
    // If inside viewer/ or popup/, adjust relative path
    const isInSubdir = location.pathname.includes('/viewer/') || location.pathname.includes('/popup/');
    if (path.startsWith('sample/')) {
      return isInSubdir ? `../${path}` : `./${path}`;
    }
    if (path.startsWith('viewer/')) {
      return isInSubdir ? `../${path}` : `./${path}`;
    }
    return `./${path}`;
  };

  chrome.runtime.sendMessage = async (message) => {
    if (message.action === 'TRANSLATE_TEXT') {
      const { text, sourceLang = 'auto', targetLang = 'es' } = message;
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        const translation = Array.isArray(data[0]) ? data[0].map(s => s[0]).join('') : text;
        return { success: true, translation, detectedLang: data[2] || sourceLang };
      } catch (err) {
        // Fallback to MyMemory
        try {
          const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang === 'auto' ? 'en' : sourceLang}|${targetLang}`;
          const mRes = await fetch(mUrl);
          const mData = await mRes.json();
          return { success: true, translation: mData.responseData?.translatedText || text, detectedLang: sourceLang };
        } catch (mErr) {
          return { success: false, error: mErr.message };
        }
      }
    }

    if (message.action === 'BATCH_TRANSLATE') {
      const { texts, sourceLang = 'auto', targetLang = 'es' } = message;
      const translations = [];
      for (const t of texts) {
        if (!t || !t.trim()) {
          translations.push({ translation: t, detectedLang: sourceLang });
          continue;
        }
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(t)}`;
          const res = await fetch(url);
          const data = await res.json();
          const tr = Array.isArray(data[0]) ? data[0].map(s => s[0]).join('') : t;
          translations.push({ translation: tr, detectedLang: data[2] || sourceLang });
        } catch (e) {
          translations.push({ translation: t, detectedLang: sourceLang });
        }
      }
      return { success: true, translations };
    }

    if (message.action === 'FETCH_PDF_DATA') {
      try {
        const res = await fetch(message.url);
        const buffer = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return { success: true, base64: btoa(binary) };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    if (message.action === 'INCREMENT_PAGE_COUNT') {
      return { success: true };
    }

    return { success: true };
  };

  // Mock chrome.tabs
  chrome.tabs = chrome.tabs || {
    async query() {
      return [{ id: 1, url: location.href, title: document.title }];
    },
    create({ url }) {
      window.open(url, '_blank');
    }
  };
})();
