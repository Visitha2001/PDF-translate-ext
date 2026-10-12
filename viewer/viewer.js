/**
 * PolyGlot PDF - PDF Translator Viewer Script
 * Handles PDF rendering via PDF.js, intelligent text block extraction,
 * Google Translate batch processing, multi-mode layout views, text-to-speech,
 * and document export.
 */

// Configure PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

class PolyGlotViewer {
  constructor() {
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.currentScale = 1.0;
    this.scaleMode = 'auto'; // 'auto' | 'page-fit' | 'page-width' | number
    this.activeMode = 'split'; // 'split' | 'overlay' | 'bilingual' | 'original'
    this.sourceLang = 'auto';
    this.targetLang = 'es';
    this.engine = 'google';
    this.theme = 'dark';
    
    // Page translation store: pageNum => { blocks: [{ text, trans, isHeading, box }], fullTrans: string }
    this.translations = new Map();
    this.pageRenderTasks = new Map();
    this.isTranslatingDoc = false;
    this.cancelDocTranslation = false;

    this.initElements();
    this.initEventListeners();
    this.loadInitialSettings().then(() => {
      this.handleUrlParams();
    });
  }

  initElements() {
    this.docTitle = document.getElementById('doc-title');
    this.pageNumInput = document.getElementById('page-num-input');
    this.pageCountEl = document.getElementById('page-count');
    this.btnPrevPage = document.getElementById('btn-prev-page');
    this.btnNextPage = document.getElementById('btn-next-page');
    this.zoomSelect = document.getElementById('zoom-select');
    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');
    this.sourceLangSelect = document.getElementById('source-lang-select');
    this.targetLangSelect = document.getElementById('target-lang-select');
    this.btnSwapLang = document.getElementById('btn-swap-lang');
    this.btnTranslatePage = document.getElementById('btn-translate-page');
    this.btnTranslateDoc = document.getElementById('btn-translate-doc');
    this.btnOpenFile = document.getElementById('btn-open-file');
    this.btnLoadSample = document.getElementById('btn-load-sample');
    this.pdfFileInput = document.getElementById('pdf-file-input');
    this.btnThemeCycle = document.getElementById('btn-theme-cycle');
    this.themeIcon = document.getElementById('theme-icon');
    this.toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    this.sidebar = document.getElementById('thumbnails-sidebar');
    this.thumbnailsList = document.getElementById('thumbnails-list');
    this.sidebarTotalPages = document.getElementById('sidebar-total-pages');
    this.mainViewport = document.getElementById('main-viewport');
    this.pagesContainer = document.getElementById('pages-container');
    this.emptyState = document.getElementById('empty-state');
    this.btnEmptyOpen = document.getElementById('btn-empty-open');
    this.btnEmptySample = document.getElementById('btn-empty-sample');

    // Progress Bar
    this.progressContainer = document.getElementById('translation-progress-bar-container');
    this.progressStatusText = document.getElementById('progress-status-text');
    this.progressPercentageText = document.getElementById('progress-percentage-text');
    this.progressBarFill = document.getElementById('progress-bar-fill');
    this.btnCancelBatch = document.getElementById('btn-cancel-batch');

    // Export Dropdown
    this.btnExportToggle = document.getElementById('btn-export-toggle');
    this.exportMenu = document.getElementById('export-menu');
    this.exportTxt = document.getElementById('export-txt');
    this.exportMd = document.getElementById('export-md');
    this.exportPrint = document.getElementById('export-print');

    // Popover
    this.popover = document.getElementById('selection-popover');
    this.popoverOriginal = document.getElementById('popover-original-text');
    this.popoverTranslated = document.getElementById('popover-translated-text');
    this.popoverClose = document.getElementById('btn-popover-close');
    this.popoverSpeak = document.getElementById('btn-popover-speak');
    this.popoverCopy = document.getElementById('btn-popover-copy');
    this.popoverLangSelect = document.getElementById('popover-lang-select');

    // Toast
    this.toastEl = document.getElementById('toast-message');
  }

  async loadInitialSettings() {
    const settings = await chrome.storage.local.get({
      targetLang: 'es',
      sourceLang: 'auto',
      engine: 'google',
      viewMode: 'split',
      theme: 'dark'
    });

    this.targetLang = settings.targetLang || 'es';
    this.sourceLang = settings.sourceLang || 'auto';
    this.engine = settings.engine || 'google';
    this.activeMode = settings.viewMode || 'split';
    this.theme = settings.theme || 'dark';

    // Populate dropdowns
    if (typeof populateLanguageDropdown === 'function') {
      populateLanguageDropdown(this.sourceLangSelect, this.sourceLang, true);
      populateLanguageDropdown(this.targetLangSelect, this.targetLang, false);
      populateLanguageDropdown(this.popoverLangSelect, this.targetLang, false);
    }

    this.applyTheme(this.theme);
    this.setViewMode(this.activeMode);
  }

  initEventListeners() {
    // Mode switcher buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = btn.getAttribute('data-mode');
        this.setViewMode(mode);
      });
    });

    // Language change
    this.targetLangSelect.addEventListener('change', (e) => {
      this.targetLang = e.target.value;
      this.popoverLangSelect.value = this.targetLang;
      chrome.storage.local.set({ targetLang: this.targetLang });
      // Invalidate cache for new target language
      this.translations.clear();
      this.updateAllRenderedTranslatedPanes();
    });

    this.sourceLangSelect.addEventListener('change', (e) => {
      this.sourceLang = e.target.value;
      chrome.storage.local.set({ sourceLang: this.sourceLang });
    });

    this.btnSwapLang.addEventListener('click', () => {
      if (this.sourceLang === 'auto') {
        this.showToast('Auto-Detect cannot be swapped.');
        return;
      }
      const temp = this.sourceLang;
      this.sourceLang = this.targetLang;
      this.targetLang = temp;
      this.sourceLangSelect.value = this.sourceLang;
      this.targetLangSelect.value = this.targetLang;
      this.popoverLangSelect.value = this.targetLang;
      this.translations.clear();
      this.updateAllRenderedTranslatedPanes();
    });

    // Translation Buttons
    this.btnTranslatePage.addEventListener('click', () => {
      this.translateCurrentPage();
    });

    this.btnTranslateDoc.addEventListener('click', () => {
      this.translateEntireDocument();
    });

    this.btnCancelBatch.addEventListener('click', () => {
      this.cancelDocTranslation = true;
      this.progressStatusText.textContent = 'Cancelling translation...';
    });

    // Page navigation
    this.btnPrevPage.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.btnNextPage.addEventListener('click', () => this.goToPage(this.currentPage + 1));
    this.pageNumInput.addEventListener('change', (e) => {
      const p = parseInt(e.target.value, 10);
      if (!isNaN(p)) this.goToPage(p);
    });

    // Zoom Controls
    this.zoomSelect.addEventListener('change', (e) => {
      this.setScaleMode(e.target.value);
    });
    this.btnZoomIn.addEventListener('click', () => this.adjustZoom(0.15));
    this.btnZoomOut.addEventListener('click', () => this.adjustZoom(-0.15));

    // Theme Toggle
    this.btnThemeCycle.addEventListener('click', () => {
      const themes = ['dark', 'light', 'sepia'];
      const nextIndex = (themes.indexOf(this.theme) + 1) % themes.length;
      this.applyTheme(themes[nextIndex]);
      chrome.storage.local.set({ theme: this.theme });
    });

    // Sidebar Toggle
    this.toggleSidebarBtn.addEventListener('click', () => {
      this.sidebar.classList.toggle('collapsed');
    });

    // File selection
    this.btnOpenFile.addEventListener('click', () => this.pdfFileInput.click());
    this.btnEmptyOpen.addEventListener('click', () => this.pdfFileInput.click());
    this.pdfFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.loadPdfFromFile(e.target.files[0]);
      }
    });

    // Sample PDF
    this.btnLoadSample.addEventListener('click', () => this.loadSampleDocument());
    this.btnEmptySample.addEventListener('click', () => this.loadSampleDocument());

    // Export Dropdown
    this.btnExportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      this.exportMenu.classList.remove('show');
    });

    this.exportTxt.addEventListener('click', () => this.exportTranslatedText('txt'));
    this.exportMd.addEventListener('click', () => this.exportTranslatedText('md'));
    this.exportPrint.addEventListener('click', () => window.print());

    // Selection Popover
    document.addEventListener('mouseup', (e) => this.handleTextSelection(e));
    this.popoverClose.addEventListener('click', () => this.hidePopover());
    this.popoverSpeak.addEventListener('click', () => this.speakSelectedTranslation());
    this.popoverCopy.addEventListener('click', () => this.copySelectedTranslation());
    this.popoverLangSelect.addEventListener('change', (e) => {
      const text = this.popoverOriginal.textContent;
      if (text) this.translateSelectionText(text, e.target.value);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      if (e.key === 'ArrowLeft' || e.key === 'k') {
        this.goToPage(this.currentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'j') {
        this.goToPage(this.currentPage + 1);
      } else if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        this.translateCurrentPage();
      } else if (e.key === 'Escape') {
        this.hidePopover();
      }
    });

    // Viewport Scroll Listener for dynamic active page tracking
    this.mainViewport.addEventListener('scroll', () => {
      this.updateActivePageOnScroll();
    });

    // Drag and drop onto viewer
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          this.loadPdfFromFile(file);
        }
      }
    });
  }

  applyTheme(theme) {
    this.theme = theme;
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-sepia');
    document.body.classList.add(`theme-${theme}`);
    
    if (theme === 'dark') {
      this.themeIcon.textContent = '🌙';
    } else if (theme === 'light') {
      this.themeIcon.textContent = '☀️';
    } else {
      this.themeIcon.textContent = '📜';
    }
  }

  setViewMode(mode) {
    this.activeMode = mode;
    document.body.classList.remove('mode-split', 'mode-overlay', 'mode-bilingual', 'mode-original');
    document.body.classList.add(`mode-${mode}`);

    document.querySelectorAll('.mode-btn').forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    chrome.storage.local.set({ viewMode: mode });
  }

  async handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const fileUrl = params.get('file');
    const source = params.get('source');
    const docName = params.get('name');

    if (source === 'local') {
      // Load from IndexedDB
      await this.loadPdfFromIndexedDB(docName);
    } else if (fileUrl) {
      await this.loadPdfFromUrl(fileUrl);
    } else {
      // Check if sample exists and offer it or show empty state
      this.emptyState.style.display = 'flex';
      this.pagesContainer.style.display = 'none';
    }
  }

  // Load from IndexedDB
  async loadPdfFromIndexedDB(fileName) {
    try {
      this.showToast('Loading document...');
      const arrayBuffer = await this.readPdfFromIndexedDB();
      if (arrayBuffer) {
        this.loadPdfData(arrayBuffer, fileName || 'Local Document.pdf');
      } else {
        this.showToast('No pending document found.');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Failed to load local file: ' + err.message);
    }
  }

  readPdfFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PolyGlotPDFDB', 1);
      request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files')) return resolve(null);
        const tx = db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const getReq = store.get('pending_pdf');
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => reject(getReq.error);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Load from URL (with CORS proxy fallback)
  async loadPdfFromUrl(url) {
    const displayName = url.split('/').pop().split('?')[0] || 'Document.pdf';
    this.showToast('Fetching PDF document...');

    try {
      // First try standard fetch (works for same-origin, extensions, or CORS-enabled URLs)
      const res = await fetch(url);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        this.loadPdfData(buffer, displayName);
        return;
      }
    } catch (err) {
      console.warn('Direct fetch failed, requesting background proxy for CORS bypass:', err);
    }

    // Fallback: ask background service worker to fetch via elevated host_permissions
    try {
      const response = await chrome.runtime.sendMessage({ action: 'FETCH_PDF_DATA', url });
      if (response && response.success && response.base64) {
        const binary = atob(response.base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        this.loadPdfData(bytes.buffer, displayName);
      } else {
        throw new Error(response ? response.error : 'Failed to proxy PDF');
      }
    } catch (fallbackErr) {
      console.error('CORS fallback also failed:', fallbackErr);
      this.showToast('Could not load PDF: ' + fallbackErr.message);
    }
  }

  loadSampleDocument() {
    const sampleUrl = chrome.runtime.getURL('sample/sample_document.pdf');
    this.loadPdfFromUrl(sampleUrl);
  }

  loadPdfFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      this.loadPdfData(reader.result, file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  async loadPdfData(arrayBuffer, title = 'Document.pdf') {
    try {
      this.showToast('Rendering document...');
      this.docTitle.textContent = title;
      this.translations.clear();

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      this.pageCountEl.textContent = this.totalPages;
      this.pageNumInput.max = this.totalPages;
      this.sidebarTotalPages.textContent = this.totalPages;

      this.emptyState.style.display = 'none';
      this.pagesContainer.style.display = 'flex';

      // Render thumbnails and pages
      await this.renderThumbnails();
      await this.renderAllPages();

      this.goToPage(1);
      this.showToast(`Loaded ${title} (${this.totalPages} pages)`);
    } catch (err) {
      console.error('PDF Load Error:', err);
      this.showToast('Error loading PDF: ' + err.message);
    }
  }

  // Thumbnails
  async renderThumbnails() {
    this.thumbnailsList.innerHTML = '';
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const thumbItem = document.createElement('div');
      thumbItem.className = `thumb-item ${pageNum === 1 ? 'active' : ''}`;
      thumbItem.id = `thumb-${pageNum}`;
      thumbItem.innerHTML = `
        <div class="thumb-canvas-box">
          <canvas class="thumb-canvas" id="thumb-canvas-${pageNum}"></canvas>
        </div>
        <div class="thumb-label">
          <span>Page ${pageNum}</span>
          <span class="thumb-badge-translated" id="thumb-badge-${pageNum}" style="display: none;">✓</span>
        </div>
      `;

      thumbItem.addEventListener('click', () => {
        this.goToPage(pageNum);
      });
      this.thumbnailsList.appendChild(thumbItem);

      // Render thumbnail canvas asynchronously
      this.renderSingleThumbnail(pageNum);
    }
  }

  async renderSingleThumbnail(pageNum) {
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const canvas = document.getElementById(`thumb-canvas-${pageNum}`);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: 0.25 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {
      console.warn(`Error rendering thumb ${pageNum}:`, e);
    }
  }

  // Render all pages in the main viewport
  async renderAllPages() {
    this.pagesContainer.innerHTML = '';
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const pageRow = document.createElement('div');
      pageRow.className = 'page-row';
      pageRow.id = `page-row-${pageNum}`;
      pageRow.setAttribute('data-page-num', pageNum);

      pageRow.innerHTML = `
        <div class="pane-original" id="pane-original-${pageNum}">
          <div class="canvas-wrapper" id="canvas-wrapper-${pageNum}">
            <canvas class="pdf-canvas" id="pdf-canvas-${pageNum}"></canvas>
            <div class="text-layer" id="text-layer-${pageNum}"></div>
            <div class="overlay-layer" id="overlay-layer-${pageNum}"></div>
          </div>
        </div>
        <div class="pane-translated" id="pane-translated-${pageNum}">
          <div class="translated-content" id="translated-content-${pageNum}">
            <div class="translated-empty">
              <span>Page ${pageNum} not translated yet</span>
              <button class="translated-empty-btn" onclick="window.polyglotViewer.translatePage(${pageNum})">
                🌐 Translate Page ${pageNum}
              </button>
            </div>
          </div>
        </div>
      `;

      this.pagesContainer.appendChild(pageRow);
      await this.renderSinglePage(pageNum);
    }
  }

  // Render single page canvas and text layer
  async renderSinglePage(pageNum) {
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
      const textLayerDiv = document.getElementById(`text-layer-${pageNum}`);
      const wrapper = document.getElementById(`canvas-wrapper-${pageNum}`);
      if (!canvas || !wrapper) return;

      const ctx = canvas.getContext('2d');
      
      // Calculate scale
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      let effectiveScale = this.currentScale;

      if (this.scaleMode === 'page-width') {
        const availableWidth = (this.mainViewport.clientWidth - (this.activeMode === 'split' ? 120 : 60)) / (this.activeMode === 'split' ? 2 : 1);
        effectiveScale = Math.max(0.6, availableWidth / unscaledViewport.width);
      } else if (this.scaleMode === 'page-fit') {
        const availableHeight = this.mainViewport.clientHeight - 80;
        effectiveScale = Math.max(0.6, availableHeight / unscaledViewport.height);
      } else if (this.scaleMode === 'auto') {
        // Balanced width fit
        const targetWidth = Math.min(780, (this.mainViewport.clientWidth - 100) / (this.activeMode === 'split' ? 2 : 1));
        effectiveScale = Math.max(0.75, targetWidth / unscaledViewport.width);
      }

      const viewport = page.getViewport({ scale: effectiveScale });
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = viewport.width * pixelRatio;
      canvas.height = viewport.height * pixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      ctx.scale(pixelRatio, pixelRatio);

      // Match pane dimensions
      const originalPane = document.getElementById(`pane-original-${pageNum}`);
      const translatedPane = document.getElementById(`pane-translated-${pageNum}`);
      if (originalPane) {
        originalPane.style.width = `${viewport.width}px`;
        originalPane.style.minHeight = `${viewport.height}px`;
      }
      if (translatedPane) {
        translatedPane.style.width = `${viewport.width}px`;
        translatedPane.style.minHeight = `${viewport.height}px`;
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Extract and render text content
      const textContent = await page.getTextContent();
      this.renderTextLayer(textLayerDiv, textContent, viewport);
    } catch (err) {
      console.warn(`Error rendering page ${pageNum}:`, err);
    }
  }

  // Render text spans for selection
  renderTextLayer(textLayerDiv, textContent, viewport) {
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;

    textContent.items.forEach(item => {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - item.height}px`;
      span.style.fontSize = `${item.height}px`;
      span.style.fontFamily = item.fontName || 'sans-serif';
      textLayerDiv.appendChild(span);
    });
  }

  // Extract smart paragraphs from page text items
  async extractPageParagraphs(pageNum) {
    const page = await this.pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    if (!textContent.items || textContent.items.length === 0) {
      return [];
    }

    // Sort items by vertical position (Y descending in PDF, top to bottom), then X ascending
    const sorted = [...textContent.items].sort((a, b) => {
      const diffY = b.transform[5] - a.transform[5];
      if (Math.abs(diffY) > 4) return diffY;
      return a.transform[4] - b.transform[4];
    });

    const blocks = [];
    let currentBlock = {
      text: '',
      isHeading: false,
      lastY: null,
      lastX: null,
      height: 12,
      x: 0,
      y: 0,
      width: 0
    };

    for (const item of sorted) {
      const str = item.str.trim();
      if (!str) continue;

      const y = item.transform[5];
      const x = item.transform[4];
      const fontHeight = item.height || 12;

      // Detect if this starts a new paragraph or heading
      const isNewParagraph = currentBlock.lastY !== null && Math.abs(currentBlock.lastY - y) > (fontHeight * 1.6);
      const isLargeFont = fontHeight > 14;

      if (isNewParagraph || (currentBlock.isHeading && !isLargeFont)) {
        if (currentBlock.text.trim()) {
          blocks.push({
            text: currentBlock.text.trim(),
            isHeading: currentBlock.isHeading,
            box: {
              x: (currentBlock.x / viewport.width) * 100,
              y: ((viewport.height - currentBlock.y) / viewport.height) * 100,
              width: (currentBlock.width / viewport.width) * 100,
              height: (currentBlock.height / viewport.height) * 100
            }
          });
        }
        currentBlock = {
          text: str,
          isHeading: isLargeFont,
          lastY: y,
          lastX: x + (item.width || 0),
          height: fontHeight,
          x: x,
          y: y,
          width: item.width || 50
        };
      } else {
        currentBlock.text += (currentBlock.text ? ' ' : '') + str;
        currentBlock.lastY = y;
        currentBlock.lastX = x + (item.width || 0);
        currentBlock.width = Math.max(currentBlock.width, (x + (item.width || 0)) - currentBlock.x);
        currentBlock.isHeading = currentBlock.isHeading || isLargeFont;
      }
    }

    if (currentBlock.text.trim()) {
      blocks.push({
        text: currentBlock.text.trim(),
        isHeading: currentBlock.isHeading,
        box: {
          x: (currentBlock.x / viewport.width) * 100,
          y: ((viewport.height - currentBlock.y) / viewport.height) * 100,
          width: (currentBlock.width / viewport.width) * 100,
          height: (currentBlock.height / viewport.height) * 100
        }
      });
    }

    return blocks;
  }

  // Translate a single page
  async translatePage(pageNum) {
    if (!this.pdfDoc) return;
    const translatedContent = document.getElementById(`translated-content-${pageNum}`);
    if (translatedContent) {
      translatedContent.innerHTML = `
        <div class="translated-empty">
          <div class="empty-icon-pulse" style="width: 44px; height: 44px; font-size: 20px;">🌐</div>
          <span>Translating page ${pageNum} with Google Translate...</span>
        </div>
      `;
    }

    try {
      const blocks = await this.extractPageParagraphs(pageNum);
      if (blocks.length === 0) {
        if (translatedContent) {
          translatedContent.innerHTML = `<div class="translated-empty"><span>No text detected on page ${pageNum}.</span></div>`;
        }
        return;
      }

      const texts = blocks.map(b => b.text);
      const res = await chrome.runtime.sendMessage({
        action: 'BATCH_TRANSLATE',
        texts,
        sourceLang: this.sourceLang,
        targetLang: this.targetLang,
        engine: this.engine
      });

      if (res && res.success && Array.isArray(res.translations)) {
        res.translations.forEach((t, i) => {
          blocks[i].translation = t.translation || blocks[i].text;
        });

        this.translations.set(pageNum, {
          blocks,
          fullText: blocks.map(b => b.translation).join('\n\n')
        });

        this.renderTranslatedPageUI(pageNum, blocks);
        
        // Mark thumbnail as translated
        const thumbBadge = document.getElementById(`thumb-badge-${pageNum}`);
        if (thumbBadge) thumbBadge.style.display = 'inline';

        chrome.runtime.sendMessage({ action: 'INCREMENT_PAGE_COUNT' });
        this.showToast(`Page ${pageNum} translated successfully!`);
      } else {
        throw new Error(res ? res.error : 'Translation failed');
      }
    } catch (err) {
      console.error(`Translation error on page ${pageNum}:`, err);
      if (translatedContent) {
        translatedContent.innerHTML = `
          <div class="translated-empty">
            <span style="color: #ef4444;">Translation Error: ${err.message}</span>
            <button class="translated-empty-btn" onclick="window.polyglotViewer.translatePage(${pageNum})">Try Again</button>
          </div>
        `;
      }
      this.showToast(`Error on page ${pageNum}: ${err.message}`);
    }
  }

  // Render the translated blocks into the UI
  renderTranslatedPageUI(pageNum, blocks) {
    const translatedContent = document.getElementById(`translated-content-${pageNum}`);
    const overlayLayer = document.getElementById(`overlay-layer-${pageNum}`);

    if (translatedContent) {
      translatedContent.innerHTML = '';
      blocks.forEach((block) => {
        if (this.activeMode === 'bilingual') {
          const pair = document.createElement('div');
          pair.className = 'bilingual-pair';
          pair.innerHTML = `
            <div class="bilingual-original">${this.escapeHtml(block.text)}</div>
            <div class="bilingual-translated">${this.escapeHtml(block.translation)}</div>
          `;
          translatedContent.appendChild(pair);
        } else {
          const div = document.createElement('div');
          div.className = `translated-block ${block.isHeading ? 'is-heading' : ''}`;
          div.textContent = block.translation;
          translatedContent.appendChild(div);
        }
      });
    }

    // Render Overlay Chips
    if (overlayLayer) {
      overlayLayer.innerHTML = '';
      blocks.forEach(block => {
        if (!block.box) return;
        const chip = document.createElement('div');
        chip.className = 'overlay-chip';
        chip.textContent = block.translation;
        chip.title = `Original: ${block.text}`;
        chip.style.left = `${Math.max(2, block.box.x)}%`;
        chip.style.top = `${Math.max(2, block.box.y)}%`;
        chip.style.maxWidth = `${Math.min(94, block.box.width + 10)}%`;
        overlayLayer.appendChild(chip);
      });
    }
  }

  updateAllRenderedTranslatedPanes() {
    for (const [pageNum, data] of this.translations.entries()) {
      this.renderTranslatedPageUI(pageNum, data.blocks);
    }
  }

  translateCurrentPage() {
    this.translatePage(this.currentPage);
  }

  async translateEntireDocument() {
    if (!this.pdfDoc || this.isTranslatingDoc) return;
    this.isTranslatingDoc = true;
    this.cancelDocTranslation = false;

    this.progressContainer.style.display = 'flex';
    this.progressStatusText.textContent = `Translating document to ${this.targetLang}...`;

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      if (this.cancelDocTranslation) {
        this.showToast('Batch translation cancelled.');
        break;
      }

      const percent = Math.round(((pageNum - 1) / this.totalPages) * 100);
      this.progressBarFill.style.width = `${percent}%`;
      this.progressPercentageText.textContent = `${percent}% (Page ${pageNum}/${this.totalPages})`;
      this.progressStatusText.textContent = `Translating Page ${pageNum} of ${this.totalPages}...`;

      await this.translatePage(pageNum);
    }

    this.progressBarFill.style.width = '100%';
    this.progressPercentageText.textContent = '100%';
    this.progressStatusText.textContent = 'Translation Complete!';
    setTimeout(() => {
      this.progressContainer.style.display = 'none';
      this.isTranslatingDoc = false;
    }, 1200);

    this.showToast('Entire document translated!');
  }

  // Page Navigation
  goToPage(pageNum) {
    if (!this.pdfDoc) return;
    const target = Math.max(1, Math.min(this.totalPages, pageNum));
    this.currentPage = target;
    this.pageNumInput.value = target;

    // Scroll page into view
    const pageRow = document.getElementById(`page-row-${target}`);
    if (pageRow) {
      pageRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Highlight thumbnail
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    const activeThumb = document.getElementById(`thumb-${target}`);
    if (activeThumb) {
      activeThumb.classList.add('active');
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  updateActivePageOnScroll() {
    if (!this.pdfDoc) return;
    const rows = document.querySelectorAll('.page-row');
    const viewportTop = this.mainViewport.scrollTop;
    const viewportCenter = viewportTop + (this.mainViewport.clientHeight / 3);

    for (const row of rows) {
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top <= viewportCenter && bottom >= viewportCenter) {
        const pageNum = parseInt(row.getAttribute('data-page-num'), 10);
        if (pageNum && pageNum !== this.currentPage) {
          this.currentPage = pageNum;
          this.pageNumInput.value = pageNum;
          document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
          const thumb = document.getElementById(`thumb-${pageNum}`);
          if (thumb) thumb.classList.add('active');
        }
        break;
      }
    }
  }

  // Zoom management
  setScaleMode(mode) {
    this.scaleMode = mode;
    if (mode === '0.75' || mode === '1.0' || mode === '1.25' || mode === '1.5' || mode === '2.0') {
      this.currentScale = parseFloat(mode);
    }
    this.reRenderPages();
  }

  adjustZoom(delta) {
    this.scaleMode = 'manual';
    this.currentScale = Math.max(0.5, Math.min(3.0, this.currentScale + delta));
    this.zoomSelect.value = this.currentScale.toFixed(2);
    this.reRenderPages();
  }

  async reRenderPages() {
    if (!this.pdfDoc) return;
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      await this.renderSinglePage(pageNum);
    }
  }

  // Text Selection Popover
  handleTextSelection(e) {
    // If click inside popover, ignore
    if (this.popover.contains(e.target)) return;

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (!text || text.length < 2) {
      this.hidePopover();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.showPopover(text, rect);
  }

  showPopover(text, rect) {
    this.popoverOriginal.textContent = text;
    this.popoverTranslated.innerHTML = '<span class="loading-dots">Translating with Google...</span>';
    
    // Position
    const popoverWidth = 320;
    let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
    left = Math.max(10, Math.min(window.innerWidth - popoverWidth - 20, left));
    let top = rect.bottom + 8;
    if (top + 200 > window.innerHeight) {
      top = Math.max(10, rect.top - 180);
    }

    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;
    this.popover.style.display = 'flex';

    this.translateSelectionText(text, this.targetLang);
  }

  async translateSelectionText(text, targetLang) {
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'TRANSLATE_TEXT',
        text,
        sourceLang: 'auto',
        targetLang: targetLang,
        engine: this.engine
      });

      if (res && res.success) {
        this.popoverTranslated.textContent = res.translation;
      } else {
        this.popoverTranslated.textContent = 'Translation failed: ' + (res ? res.error : 'Unknown');
      }
    } catch (err) {
      this.popoverTranslated.textContent = 'Error: ' + err.message;
    }
  }

  hidePopover() {
    this.popover.style.display = 'none';
  }

  speakSelectedTranslation() {
    const text = this.popoverTranslated.textContent;
    if (!text || text.includes('Translating')) return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.targetLang;
      window.speechSynthesis.speak(utterance);
    } else {
      this.showToast('Text-to-speech not supported in this browser.');
    }
  }

  copySelectedTranslation() {
    const text = this.popoverTranslated.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('✓ Translation copied to clipboard');
    });
  }

  // Export functions
  exportTranslatedText(format) {
    if (this.translations.size === 0) {
      this.showToast('Please translate at least one page before exporting.');
      return;
    }

    let fullOutput = '';
    const title = this.docTitle.textContent || 'Translated Document';

    if (format === 'md') {
      fullOutput += `# ${title}\n*Translated via PolyGlot PDF Translator*\n\n---\n\n`;
      for (let p = 1; p <= this.totalPages; p++) {
        const data = this.translations.get(p);
        if (data) {
          fullOutput += `## Page ${p}\n\n`;
          data.blocks.forEach(b => {
            if (b.isHeading) {
              fullOutput += `### ${b.translation}\n\n`;
            } else {
              fullOutput += `${b.translation}\n\n`;
            }
          });
        }
      }
    } else {
      fullOutput += `--- ${title} ---\n\n`;
      for (let p = 1; p <= this.totalPages; p++) {
        const data = this.translations.get(p);
        if (data) {
          fullOutput += `[PAGE ${p}]\n`;
          fullOutput += data.fullText + '\n\n';
        }
      }
    }

    const blob = new Blob([fullOutput], { type: format === 'md' ? 'text/markdown' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\.[^/.]+$/, "")}_translated.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Exported ${format.toUpperCase()} successfully!`);
  }

  showToast(message) {
    this.toastEl.textContent = message;
    this.toastEl.style.display = 'block';
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, 3000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.polyglotViewer = new PolyGlotViewer();
});
