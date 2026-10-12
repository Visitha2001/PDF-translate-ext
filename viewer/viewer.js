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

  // Extract rich document structure (Tables, Bullet points, Headings, Paragraphs)
  async extractPageStructure(pageNum) {
    const page = await this.pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    if (!textContent.items || textContent.items.length === 0) {
      return [];
    }

    // Step 1: Normalize coordinates (y from top of page = viewport.height - ty)
    const rawItems = textContent.items
      .filter(item => item.str && item.str.trim())
      .map(item => {
        const fontH = item.height || 10;
        const normY = viewport.height - item.transform[5];
        const normX = item.transform[4];
        return {
          str: item.str,
          x: normX,
          y: normY,
          width: item.width || (item.str.length * fontH * 0.5),
          height: fontH,
          fontName: item.fontName || ''
        };
      });

    if (rawItems.length === 0) return [];

    // Step 2: Sort items from top to bottom (y ascending), then left to right (x ascending)
    rawItems.sort((a, b) => {
      const diffY = a.y - b.y;
      if (Math.abs(diffY) > 3.5) return diffY;
      return a.x - b.x;
    });

    // Step 3: Cluster items into lines
    const lines = [];
    let currentLine = null;

    for (const item of rawItems) {
      if (!currentLine || Math.abs(item.y - currentLine.y) > Math.max(3.5, item.height * 0.4)) {
        if (currentLine) lines.push(currentLine);
        currentLine = {
          y: item.y,
          height: item.height,
          items: [item]
        };
      } else {
        currentLine.items.push(item);
        currentLine.height = Math.max(currentLine.height, item.height);
      }
    }
    if (currentLine) lines.push(currentLine);

    // Step 4: Within each line, cluster adjacent words into cells/segments
    // Detect column boundaries: if two items have gap > max(20, fontH * 1.5), they belong to different columns!
    const structuredLines = lines.map(line => {
      line.items.sort((a, b) => a.x - b.x);
      const cells = [];
      let currentCell = null;

      for (const item of line.items) {
        const itemStr = item.str;
        if (!currentCell) {
          currentCell = {
            text: itemStr,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            endX: item.x + item.width
          };
        } else {
          const gap = item.x - currentCell.endX;
          // Substantial horizontal gap means a new table cell/column!
          if (gap > Math.max(20, item.height * 1.5)) {
            cells.push({
              text: currentCell.text.trim(),
              x: currentCell.x,
              y: currentCell.y,
              width: currentCell.width,
              height: currentCell.height
            });
            currentCell = {
              text: itemStr,
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
              endX: item.x + item.width
            };
          } else {
            // Same cell/phrase: append space if needed
            const needsSpace = !currentCell.text.endsWith(' ') && !itemStr.startsWith(' ');
            currentCell.text += (needsSpace ? ' ' : '') + itemStr;
            currentCell.width = (item.x + item.width) - currentCell.x;
            currentCell.endX = item.x + item.width;
            currentCell.height = Math.max(currentCell.height, item.height);
          }
        }
      }
      if (currentCell && currentCell.text.trim()) {
        cells.push({
          text: currentCell.text.trim(),
          x: currentCell.x,
          y: currentCell.y,
          width: currentCell.width,
          height: currentCell.height
        });
      }
      return {
        y: line.y,
        height: line.height,
        cells
      };
    });

    // Step 5: Group lines into Structural Blocks (Tables, Bullet points, Headings, Paragraphs)
    const blocks = [];
    let i = 0;

    // Bullet detection regex
    const bulletRegex = /^(\x95|[\u2022\u25cf\u25cb\u25a0\u25aa\u25ba\u2192\-\*–—]|(\d+|[a-zA-Z]|\([0-9a-zA-Z]+\))[\.\)])\s*(.*)$/;

    while (i < structuredLines.length) {
      const line = structuredLines[i];

      // Check for Table: 2 or more cells in this line
      if (line.cells.length >= 2) {
        // Look ahead to see if subsequent lines also have 2+ cells
        const tableLines = [line];
        let j = i + 1;
        while (j < structuredLines.length) {
          const nextLine = structuredLines[j];
          const verticalGap = nextLine.y - tableLines[tableLines.length - 1].y;

          // If too far vertically, table ends
          if (verticalGap > 45 || verticalGap > (line.height * 3.5)) break;

          if (nextLine.cells.length >= 2) {
            tableLines.push(nextLine);
            j++;
          } else {
            break;
          }
        }

        // If we found at least 2 consecutive multi-cell lines, it's a TABLE!
        if (tableLines.length >= 2) {
          const rows = tableLines.map(l => {
            return l.cells.map(c => ({
              text: c.text,
              translation: '',
              box: {
                x: (c.x / viewport.width) * 100,
                y: (c.y / viewport.height) * 100,
                width: (c.width / viewport.width) * 100,
                height: (c.height / viewport.height) * 100
              }
            }));
          });

          const tableX = Math.min(...tableLines.flatMap(l => l.cells.map(c => c.x)));
          const tableY = tableLines[0].y;
          const tableMaxX = Math.max(...tableLines.flatMap(l => l.cells.map(c => c.x + c.width)));
          const tableMaxY = tableLines[tableLines.length - 1].y + tableLines[tableLines.length - 1].height;

          blocks.push({
            type: 'table',
            rows,
            box: {
              x: (tableX / viewport.width) * 100,
              y: (tableY / viewport.height) * 100,
              width: ((tableMaxX - tableX) / viewport.width) * 100,
              height: ((tableMaxY - tableY) / viewport.height) * 100
            }
          });

          i = j;
          continue;
        }
      }

      // Check for List Item (Bullet point or Numbered point)
      const fullLineText = line.cells.map(c => c.text).join(' ');
      const bulletMatch = fullLineText.match(bulletRegex);

      if (bulletMatch) {
        const bulletMarker = bulletMatch[1];
        const contentText = bulletMatch[3].trim();
        const firstCell = line.cells[0];

        blocks.push({
          type: 'list_item',
          bullet: bulletMarker,
          text: contentText || fullLineText,
          originalFullText: fullLineText,
          translation: '',
          box: {
            x: (firstCell.x / viewport.width) * 100,
            y: (firstCell.y / viewport.height) * 100,
            width: (line.cells.reduce((sum, c) => sum + c.width, 0) / viewport.width) * 100,
            height: (line.height / viewport.height) * 100
          }
        });
        i++;
        continue;
      }

      // Check for Heading
      const isHeading = line.height >= 13 || (line.height > 11 && line.cells.length === 1 && fullLineText.length < 75);
      if (isHeading) {
        const firstCell = line.cells[0];
        blocks.push({
          type: 'heading',
          level: line.height > 15 ? 1 : 2,
          text: fullLineText,
          translation: '',
          box: {
            x: (firstCell.x / viewport.width) * 100,
            y: (firstCell.y / viewport.height) * 100,
            width: (line.cells.reduce((sum, c) => sum + c.width, 0) / viewport.width) * 100,
            height: (line.height / viewport.height) * 100
          }
        });
        i++;
        continue;
      }

      // Standard Paragraph: merge adjacent body lines
      let paragraphText = fullLineText;
      let startLine = line;
      let lastLine = line;
      let j = i + 1;

      while (j < structuredLines.length) {
        const nextLine = structuredLines[j];
        const verticalGap = nextLine.y - lastLine.y;
        const nextText = nextLine.cells.map(c => c.text).join(' ');

        // Stop paragraph if next line is table, bullet, heading, or large vertical gap
        if (nextLine.cells.length >= 2 || nextText.match(bulletRegex) || nextLine.height >= 13 || verticalGap > (line.height * 2.2)) {
          break;
        }

        paragraphText += ' ' + nextText;
        lastLine = nextLine;
        j++;
      }

      blocks.push({
        type: 'paragraph',
        text: paragraphText.trim(),
        translation: '',
        box: {
          x: (startLine.cells[0].x / viewport.width) * 100,
          y: (startLine.y / viewport.height) * 100,
          width: 90,
          height: ((lastLine.y + lastLine.height - startLine.y) / viewport.height) * 100
        }
      });

      i = j;
    }

    return blocks;
  }

  // Translate a single page preserving full layout & table structure
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
      const blocks = await this.extractPageStructure(pageNum);
      if (blocks.length === 0) {
        if (translatedContent) {
          translatedContent.innerHTML = `<div class="translated-empty"><span>No text detected on page ${pageNum}.</span></div>`;
        }
        return;
      }

      // Collect all text items to translate, preserving references
      const translationRequests = [];

      blocks.forEach((block) => {
        if (block.type === 'table') {
          block.rows.forEach((row) => {
            row.forEach((cell) => {
              if (cell.text && cell.text.trim()) {
                translationRequests.push({
                  text: cell.text.trim(),
                  apply: (trans) => { cell.translation = trans; }
                });
              } else {
                cell.translation = cell.text;
              }
            });
          });
        } else if (block.type === 'list_item') {
          if (block.text && block.text.trim()) {
            translationRequests.push({
              text: block.text.trim(),
              apply: (trans) => { block.translation = trans; }
            });
          } else {
            block.translation = block.originalFullText;
          }
        } else {
          // heading or paragraph
          if (block.text && block.text.trim()) {
            translationRequests.push({
              text: block.text.trim(),
              apply: (trans) => { block.translation = trans; }
            });
          } else {
            block.translation = block.text;
          }
        }
      });

      const texts = translationRequests.map(r => r.text);
      const res = await chrome.runtime.sendMessage({
        action: 'BATCH_TRANSLATE',
        texts,
        sourceLang: this.sourceLang,
        targetLang: this.targetLang,
        engine: this.engine
      });

      if (res && res.success && Array.isArray(res.translations)) {
        res.translations.forEach((t, i) => {
          if (translationRequests[i]) {
            translationRequests[i].apply(t.translation || translationRequests[i].text);
          }
        });

        this.translations.set(pageNum, {
          blocks,
          fullText: this.buildTextRepresentation(blocks)
        });

        this.renderTranslatedPageUI(pageNum, blocks);
        
        // Mark thumbnail as translated
        const thumbBadge = document.getElementById(`thumb-badge-${pageNum}`);
        if (thumbBadge) thumbBadge.style.display = 'inline';

        chrome.runtime.sendMessage({ action: 'INCREMENT_PAGE_COUNT' });
        this.showToast(`Page ${pageNum} translated with tables & layout preserved!`);
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

  // Render the translated blocks into the UI maintaining original structure
  renderTranslatedPageUI(pageNum, blocks) {
    const translatedContent = document.getElementById(`translated-content-${pageNum}`);
    const overlayLayer = document.getElementById(`overlay-layer-${pageNum}`);

    if (translatedContent) {
      translatedContent.innerHTML = '';
      blocks.forEach((block) => {
        if (block.type === 'table') {
          // Render Table
          const tableWrapper = document.createElement('div');
          tableWrapper.className = 'translated-table-wrapper';
          
          let tableHtml = '<table class="translated-table">';
          if (block.rows.length > 0) {
            // Header Row (Row 0)
            tableHtml += '<thead><tr>';
            block.rows[0].forEach(cell => {
              const content = cell.translation || cell.text;
              if (this.activeMode === 'bilingual') {
                tableHtml += `<th><div class="bilingual-cell"><span class="bilingual-cell-orig">${this.escapeHtml(cell.text)}</span><span class="bilingual-cell-trans">${this.escapeHtml(content)}</span></div></th>`;
              } else {
                tableHtml += `<th>${this.escapeHtml(content)}</th>`;
              }
            });
            tableHtml += '</tr></thead>';

            // Body Rows (Rows 1..N)
            tableHtml += '<tbody>';
            for (let r = 1; r < block.rows.length; r++) {
              tableHtml += '<tr>';
              block.rows[r].forEach(cell => {
                const content = cell.translation || cell.text;
                if (this.activeMode === 'bilingual') {
                  tableHtml += `<td><div class="bilingual-cell"><span class="bilingual-cell-orig">${this.escapeHtml(cell.text)}</span><span class="bilingual-cell-trans">${this.escapeHtml(content)}</span></div></td>`;
                } else {
                  tableHtml += `<td>${this.escapeHtml(content)}</td>`;
                }
              });
              tableHtml += '</tr>';
            }
            tableHtml += '</tbody>';
          }
          tableHtml += '</table>';
          tableWrapper.innerHTML = tableHtml;
          translatedContent.appendChild(tableWrapper);

        } else if (block.type === 'list_item') {
          // Render Bullet or Numbered List Item
          const itemEl = document.createElement('div');
          itemEl.className = 'translated-list-item';
          const content = block.translation || block.text;

          if (this.activeMode === 'bilingual') {
            itemEl.innerHTML = `
              <span class="bullet-marker">${this.escapeHtml(block.bullet)}</span>
              <div class="bilingual-pair" style="flex: 1; padding: 4px 8px;">
                <div class="bilingual-original">${this.escapeHtml(block.text || block.originalFullText)}</div>
                <div class="bilingual-translated">${this.escapeHtml(content)}</div>
              </div>
            `;
          } else {
            itemEl.innerHTML = `
              <span class="bullet-marker">${this.escapeHtml(block.bullet)}</span>
              <span class="list-item-content">${this.escapeHtml(content)}</span>
            `;
          }
          translatedContent.appendChild(itemEl);

        } else if (block.type === 'heading') {
          // Render Heading
          const headEl = document.createElement('h3');
          headEl.className = `translated-heading ${block.level === 1 ? 'is-title' : ''}`;
          const content = block.translation || block.text;

          if (this.activeMode === 'bilingual') {
            headEl.innerHTML = `
              <div class="bilingual-pair" style="width: 100%;">
                <div class="bilingual-original" style="font-size: 13px;">${this.escapeHtml(block.text)}</div>
                <div class="bilingual-translated">${this.escapeHtml(content)}</div>
              </div>
            `;
          } else {
            headEl.textContent = content;
          }
          translatedContent.appendChild(headEl);

        } else {
          // Standard Paragraph
          const content = block.translation || block.text;
          if (this.activeMode === 'bilingual') {
            const pair = document.createElement('div');
            pair.className = 'bilingual-pair';
            pair.innerHTML = `
              <div class="bilingual-original">${this.escapeHtml(block.text)}</div>
              <div class="bilingual-translated">${this.escapeHtml(content)}</div>
            `;
            translatedContent.appendChild(pair);
          } else {
            const p = document.createElement('p');
            p.className = 'translated-paragraph';
            p.textContent = content;
            translatedContent.appendChild(p);
          }
        }
      });
    }

    // Render Overlay Chips in Overlay Mode
    if (overlayLayer) {
      overlayLayer.innerHTML = '';
      blocks.forEach(block => {
        if (block.type === 'table') {
          // Place overlay chips for EACH table cell in the exact cell bounding box
          block.rows.forEach(row => {
            row.forEach(cell => {
              if (!cell.box) return;
              const chip = document.createElement('div');
              chip.className = 'overlay-chip';
              chip.textContent = cell.translation || cell.text;
              chip.title = `Original: ${cell.text}`;
              chip.style.left = `${Math.max(1, cell.box.x)}%`;
              chip.style.top = `${Math.max(1, cell.box.y)}%`;
              chip.style.maxWidth = `${Math.min(95, cell.box.width + 12)}%`;
              overlayLayer.appendChild(chip);
            });
          });
        } else if (block.type === 'list_item') {
          if (!block.box) return;
          const chip = document.createElement('div');
          chip.className = 'overlay-chip';
          chip.textContent = `${block.bullet} ${block.translation || block.text}`;
          chip.title = `Original: ${block.originalFullText || block.text}`;
          chip.style.left = `${Math.max(1, block.box.x)}%`;
          chip.style.top = `${Math.max(1, block.box.y)}%`;
          chip.style.maxWidth = `${Math.min(95, block.box.width + 8)}%`;
          overlayLayer.appendChild(chip);
        } else {
          if (!block.box) return;
          const chip = document.createElement('div');
          chip.className = 'overlay-chip';
          chip.textContent = block.translation || block.text;
          chip.title = `Original: ${block.text}`;
          chip.style.left = `${Math.max(1, block.box.x)}%`;
          chip.style.top = `${Math.max(1, block.box.y)}%`;
          chip.style.maxWidth = `${Math.min(95, block.box.width + 10)}%`;
          overlayLayer.appendChild(chip);
        }
      });
    }
  }

  buildTextRepresentation(blocks) {
    let out = '';
    blocks.forEach(b => {
      if (b.type === 'table') {
        b.rows.forEach(row => {
          out += row.map(c => (c.translation || c.text)).join('\t') + '\n';
        });
        out += '\n';
      } else if (b.type === 'list_item') {
        out += `${b.bullet} ${b.translation || b.text}\n`;
      } else if (b.type === 'heading') {
        out += `${b.translation || b.text}\n\n`;
      } else {
        out += `${b.translation || b.text}\n\n`;
      }
    });
    return out.trim();
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
            if (b.type === 'table') {
              if (b.rows && b.rows.length > 0) {
                fullOutput += '| ' + b.rows[0].map(c => (c.translation || c.text)).join(' | ') + ' |\n';
                fullOutput += '| ' + b.rows[0].map(() => '---').join(' | ') + ' |\n';
                for (let r = 1; r < b.rows.length; r++) {
                  fullOutput += '| ' + b.rows[r].map(c => (c.translation || c.text)).join(' | ') + ' |\n';
                }
                fullOutput += '\n';
              }
            } else if (b.type === 'list_item') {
              fullOutput += `${b.bullet} ${b.translation || b.text}\n`;
            } else if (b.type === 'heading') {
              fullOutput += (b.level === 1 ? '### ' : '#### ') + (b.translation || b.text) + '\n\n';
            } else {
              fullOutput += (b.translation || b.text) + '\n\n';
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
