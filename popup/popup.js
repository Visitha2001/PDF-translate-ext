/**
 * PolyGlot PDF - Popup Script
 * Handles settings persistence, PDF file drops, instant sample loading,
 * and quick text translation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const targetLangSelect = document.getElementById('target-lang-select');
  const btnOpenViewer = document.getElementById('btn-open-viewer');
  const btnTranslateTab = document.getElementById('btn-translate-tab');
  const btnSamplePdf = document.getElementById('btn-sample-pdf');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const themeToggle = document.getElementById('theme-toggle');
  const iconTheme = themeToggle.querySelector('.icon-theme');
  const toggleAutoRedirect = document.getElementById('toggle-autoredirect');
  const toggleFloatingBtn = document.getElementById('toggle-floating-btn');
  const selectViewMode = document.getElementById('select-viewmode');
  const selectEngine = document.getElementById('select-engine');
  const statWords = document.getElementById('stat-words');
  const statPages = document.getElementById('stat-pages');

  // Quick Translate Elements
  const quickToggle = document.getElementById('quick-toggle');
  const quickChevron = quickToggle.querySelector('.accordion-chevron');
  const quickBody = document.getElementById('quick-body');
  const quickInput = document.getElementById('quick-input');
  const btnQuickTranslate = document.getElementById('btn-quick-translate');
  const btnQuickCopy = document.getElementById('btn-quick-copy');
  const quickOutput = document.getElementById('quick-output');

  // Load Settings
  const settings = await chrome.storage.local.get({
    targetLang: 'es',
    sourceLang: 'auto',
    engine: 'google',
    viewMode: 'split',
    theme: 'dark',
    autoRedirectPdf: false,
    showFloatingButton: true,
    wordsTranslated: 0,
    pagesTranslated: 0
  });

  // Populate Languages
  if (typeof populateLanguageDropdown === 'function') {
    populateLanguageDropdown(targetLangSelect, settings.targetLang, false);
  }

  // Apply Settings to UI
  targetLangSelect.value = settings.targetLang || 'es';
  toggleAutoRedirect.checked = !!settings.autoRedirectPdf;
  toggleFloatingBtn.checked = settings.showFloatingButton !== false;
  selectViewMode.value = settings.viewMode || 'split';
  selectEngine.value = settings.engine || 'google';
  statWords.textContent = (settings.wordsTranslated || 0).toLocaleString();
  statPages.textContent = (settings.pagesTranslated || 0).toLocaleString();

  applyTheme(settings.theme || 'dark');

  // Theme Toggle
  themeToggle.addEventListener('click', async () => {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    await chrome.storage.local.set({ theme: newTheme });
  });

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      iconTheme.textContent = '☀️';
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      iconTheme.textContent = '🌙';
    }
  }

  // Settings Change Listeners
  targetLangSelect.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetLang: e.target.value });
  });

  toggleAutoRedirect.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoRedirectPdf: e.target.checked });
  });

  toggleFloatingBtn.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ showFloatingButton: e.target.checked });
  });

  selectViewMode.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ viewMode: e.target.value });
  });

  selectEngine.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ engine: e.target.value });
  });

  // Launch Full PDF Viewer
  btnOpenViewer.addEventListener('click', () => {
    const viewerUrl = chrome.runtime.getURL('viewer/viewer.html');
    chrome.tabs.create({ url: viewerUrl });
  });

  // Try Sample PDF Document
  btnSamplePdf.addEventListener('click', () => {
    const sampleUrl = chrome.runtime.getURL('sample/sample_document.pdf');
    const viewerUrl = chrome.runtime.getURL('viewer/viewer.html') + '?file=' + encodeURIComponent(sampleUrl);
    chrome.tabs.create({ url: viewerUrl });
  });

  // Translate Active Tab
  btnTranslateTab.addEventListener('click', async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;

    const url = activeTab.url;
    const isPdf = url.toLowerCase().endsWith('.pdf') || url.includes('.pdf?') || url.includes('/pdf/');
    
    if (isPdf) {
      const viewerUrl = chrome.runtime.getURL('viewer/viewer.html') + '?file=' + encodeURIComponent(url);
      chrome.tabs.create({ url: viewerUrl });
    } else {
      // If not a PDF, offer to open viewer or tell user
      btnTranslateTab.textContent = '⚠️ Not a PDF - Opening Viewer';
      setTimeout(() => {
        btnTranslateTab.textContent = '📑 Translate Active Tab';
        const viewerUrl = chrome.runtime.getURL('viewer/viewer.html');
        chrome.tabs.create({ url: viewerUrl });
      }, 900);
    }
  });

  // Drag & Drop PDF Handling via IndexedDB
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  async function handleFileSelected(file) {
    if (!file || file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF file.');
      return;
    }

    try {
      // Store in IndexedDB for viewer to retrieve without memory/URL limits
      await savePdfToIndexedDB(file);
      const viewerUrl = chrome.runtime.getURL('viewer/viewer.html') + '?source=local&name=' + encodeURIComponent(file.name);
      chrome.tabs.create({ url: viewerUrl });
    } catch (err) {
      console.error('Error handling local file:', err);
      alert('Could not open file: ' + err.message);
    }
  }

  // Quick Text Translation
  quickToggle.addEventListener('click', () => {
    const isOpen = quickBody.style.display !== 'none';
    quickBody.style.display = isOpen ? 'none' : 'flex';
    if (isOpen) {
      quickChevron.classList.remove('expanded');
    } else {
      quickChevron.classList.add('expanded');
      quickInput.focus();
    }
  });

  btnQuickTranslate.addEventListener('click', async () => {
    const text = quickInput.value.trim();
    if (!text) return;

    btnQuickTranslate.textContent = 'Translating...';
    btnQuickTranslate.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'TRANSLATE_TEXT',
        text,
        sourceLang: 'auto',
        targetLang: targetLangSelect.value,
        engine: selectEngine.value
      });

      if (response && response.success) {
        quickOutput.textContent = response.translation;
        quickOutput.style.display = 'block';
        btnQuickCopy.style.display = 'inline-flex';
      } else {
        quickOutput.textContent = 'Translation failed: ' + (response.error || 'Unknown error');
        quickOutput.style.display = 'block';
      }
    } catch (err) {
      quickOutput.textContent = 'Error: ' + err.message;
      quickOutput.style.display = 'block';
    } finally {
      btnQuickTranslate.textContent = 'Translate';
      btnQuickTranslate.disabled = false;
    }
  });

  btnQuickCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(quickOutput.textContent).then(() => {
      const old = btnQuickCopy.textContent;
      btnQuickCopy.textContent = '✓ Copied';
      setTimeout(() => { btnQuickCopy.textContent = old; }, 1500);
    });
  });
});

// Helper: IndexedDB for passing large local PDF files between popup & viewer
function savePdfToIndexedDB(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PolyGlotPDFDB', 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      
      const reader = new FileReader();
      reader.onload = () => {
        store.put(reader.result, 'pending_pdf');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}
