/**
 * PolyGlot PDF - Service Worker (background.js)
 * High-performance background service handling translation APIs, caching,
 * PDF fetching with CORS bypass, context menus, and viewer routing.
 */

const DEFAULT_SETTINGS = {
  targetLang: 'es',
  sourceLang: 'auto',
  engine: 'google', // 'google' | 'mymemory'
  viewMode: 'split', // 'split' | 'overlay' | 'bilingual'
  theme: 'dark',
  autoRedirectPdf: false,
  showFloatingButton: true,
  wordsTranslated: 0,
  pagesTranslated: 0
};

// In-memory cache for fast repeated translations during session
const memoryCache = new Map();

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const updated = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(updated);

  setupContextMenus();
});

// Setup Context Menus
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'polyglot-open-viewer',
      title: '🌐 Open PolyGlot PDF Translator',
      contexts: ['action']
    });

    chrome.contextMenus.create({
      id: 'polyglot-translate-link',
      title: '🌐 Open and Translate this PDF',
      contexts: ['link']
    });

    chrome.contextMenus.create({
      id: 'polyglot-translate-selection',
      title: '🌐 Translate Selection with PolyGlot',
      contexts: ['selection']
    });
  });
}

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'polyglot-open-viewer') {
    openViewer();
  } else if (info.menuItemId === 'polyglot-translate-link' && info.linkUrl) {
    openViewer(info.linkUrl);
  } else if (info.menuItemId === 'polyglot-translate-selection' && info.selectionText) {
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_SELECTION_TRANSLATION',
        text: info.selectionText
      }).catch(() => {
        // Tab may not have content script ready; open viewer with query
        openViewer(null, info.selectionText);
      });
    }
  }
});

// Helper to open PDF viewer tab
function openViewer(pdfUrl = null, initialText = null) {
  let viewerUrl = chrome.runtime.getURL('viewer/viewer.html');
  const params = new URLSearchParams();
  if (pdfUrl) params.append('file', pdfUrl);
  if (initialText) params.append('text', initialText);
  
  const queryString = params.toString();
  if (queryString) {
    viewerUrl += '?' + queryString;
  }
  chrome.tabs.create({ url: viewerUrl });
}

// Translate single text segment using Google Translate GTX/Chrome Client
async function translateWithGoogle(text, sourceLang = 'auto', targetLang = 'es') {
  const trimmed = text.trim();
  if (!trimmed) return { translation: text, detectedLang: sourceLang };

  const cacheKey = `g_${sourceLang}_${targetLang}_${trimmed}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Translate responded with HTTP ${res.status}`);
  }

  const data = await res.json();
  let translatedText = '';
  let detectedLang = sourceLang;

  if (Array.isArray(data) && Array.isArray(data[0])) {
    translatedText = data[0].map(segment => segment[0] || '').join('');
  } else {
    throw new Error('Unexpected translation response format from Google');
  }

  if (data[2]) {
    detectedLang = data[2];
  }

  const result = { translation: translatedText, detectedLang };
  memoryCache.set(cacheKey, result);
  return result;
}

// Fallback: Free MyMemory API
async function translateWithMyMemory(text, sourceLang = 'auto', targetLang = 'es') {
  const trimmed = text.trim();
  if (!trimmed) return { translation: text, detectedLang: sourceLang };

  const s = sourceLang === 'auto' ? 'en' : sourceLang;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${s}|${targetLang}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MyMemory responded with HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data && data.responseData && data.responseData.translatedText) {
    return {
      translation: data.responseData.translatedText,
      detectedLang: s
    };
  }
  throw new Error('No translation returned from MyMemory');
}

// Unified Translation Dispatcher with Automatic Fallback
async function translateText(text, sourceLang = 'auto', targetLang = 'es', engine = 'google') {
  try {
    if (engine === 'google') {
      return await translateWithGoogle(text, sourceLang, targetLang);
    } else {
      return await translateWithMyMemory(text, sourceLang, targetLang);
    }
  } catch (err) {
    console.warn(`Primary engine (${engine}) failed: ${err.message}. Trying fallback...`);
    // Fallback to alternate free provider
    try {
      if (engine === 'google') {
        return await translateWithMyMemory(text, sourceLang, targetLang);
      } else {
        return await translateWithGoogle(text, sourceLang, targetLang);
      }
    } catch (fallbackErr) {
      console.error(`All translation engines failed:`, fallbackErr);
      return { translation: text, detectedLang: sourceLang, error: fallbackErr.message };
    }
  }
}

// Smart Batch Translation
// Groups text elements together with a delimiter to minimize network roundtrips
async function batchTranslate(texts, sourceLang = 'auto', targetLang = 'es', engine = 'google') {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const results = new Array(texts.length);
  const indicesToFetch = [];
  const textPayloads = [];

  // Check cache first
  for (let i = 0; i < texts.length; i++) {
    const raw = texts[i];
    if (!raw || !raw.trim()) {
      results[i] = { translation: raw, detectedLang: sourceLang };
      continue;
    }
    const cacheKey = `${engine}_${sourceLang}_${targetLang}_${raw.trim()}`;
    if (memoryCache.has(cacheKey)) {
      results[i] = memoryCache.get(cacheKey);
    } else {
      indicesToFetch.push(i);
      textPayloads.push(raw);
    }
  }

  if (indicesToFetch.length === 0) {
    return results;
  }

  // Group into batches of ~2500 characters with robust [[#]] delimiters
  const BATCH_LIMIT = 2500;
  const batches = [];
  let currentBatch = [];
  let currentLen = 0;

  for (let idx = 0; idx < textPayloads.length; idx++) {
    const text = textPayloads[idx];
    const originalIndex = indicesToFetch[idx];
    if (currentLen + text.length > BATCH_LIMIT && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLen = 0;
    }
    currentBatch.push({ text, index: originalIndex });
    currentLen += text.length + 20;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // Execute batch requests concurrently
  const batchPromises = batches.map(async (batch) => {
    // Join with index markers: Item0 + '\n\n[[1]]\n\n' + Item1...
    let combinedText = '';
    batch.forEach((item, idx) => {
      if (idx === 0) {
        combinedText += item.text;
      } else {
        combinedText += `\n\n[[${idx}]]\n\n` + item.text;
      }
    });

    try {
      const translatedCombined = await translateText(combinedText, sourceLang, targetLang, engine);
      const splitTranslations = (translatedCombined.translation || '').split(/\[\[\d+\]\]/);

      if (splitTranslations.length === batch.length) {
        batch.forEach((item, i) => {
          const trans = splitTranslations[i].trim();
          const itemResult = {
            translation: trans || item.text,
            detectedLang: translatedCombined.detectedLang || sourceLang
          };
          results[item.index] = itemResult;
          memoryCache.set(`${engine}_${sourceLang}_${targetLang}_${item.text.trim()}`, itemResult);
        });
        return;
      }
    } catch (e) {
      console.warn('Batch delimiter matching failed, falling back to item-by-item:', e);
    }

    // Fallback: individual translations for this batch
    await Promise.all(batch.map(async (item) => {
      const itemResult = await translateText(item.text, sourceLang, targetLang, engine);
      results[item.index] = itemResult;
      memoryCache.set(`${engine}_${sourceLang}_${targetLang}_${item.text.trim()}`, itemResult);
    }));
  });

  await Promise.all(batchPromises);

  // Update stats
  try {
    const wordCount = texts.reduce((acc, t) => acc + (t ? t.split(/\s+/).length : 0), 0);
    const store = await chrome.storage.local.get(['wordsTranslated', 'pagesTranslated']);
    await chrome.storage.local.set({
      wordsTranslated: (store.wordsTranslated || 0) + wordCount
    });
  } catch (err) {
    // Non-fatal
  }

  return results;
}

// Fetch Remote PDF to bypass CORS for viewer
async function fetchPdfData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load PDF: HTTP ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    // Convert to base64 for message passing
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { success: true, base64 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Global Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'TRANSLATE_TEXT') {
    translateText(message.text, message.sourceLang, message.targetLang, message.engine)
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.action === 'BATCH_TRANSLATE') {
    batchTranslate(message.texts, message.sourceLang, message.targetLang, message.engine)
      .then(translations => sendResponse({ success: true, translations }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'FETCH_PDF_DATA') {
    fetchPdfData(message.url)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'OPEN_VIEWER') {
    openViewer(message.pdfUrl, message.text);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'GET_SETTINGS') {
    chrome.storage.local.get(null).then(settings => {
      sendResponse({ success: true, settings: { ...DEFAULT_SETTINGS, ...settings } });
    });
    return true;
  }

  if (message.action === 'SAVE_SETTINGS') {
    chrome.storage.local.set(message.settings).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'INCREMENT_PAGE_COUNT') {
    chrome.storage.local.get(['pagesTranslated']).then(store => {
      chrome.storage.local.set({ pagesTranslated: (store.pagesTranslated || 0) + 1 });
    });
    sendResponse({ success: true });
    return false;
  }
});

// Auto-redirect web PDF tabs to PolyGlot viewer if user enabled setting
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url) {
    const isPdfUrl = tab.url.toLowerCase().endsWith('.pdf') || tab.url.includes('.pdf?') || tab.url.includes('/pdf/');
    if (isPdfUrl && !tab.url.startsWith('chrome-extension://')) {
      const { autoRedirectPdf } = await chrome.storage.local.get('autoRedirectPdf');
      if (autoRedirectPdf) {
        const viewerUrl = chrome.runtime.getURL('viewer/viewer.html') + '?file=' + encodeURIComponent(tab.url);
        chrome.tabs.update(tabId, { url: viewerUrl });
      }
    }
  }
});
