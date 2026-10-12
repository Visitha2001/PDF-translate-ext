/**
 * PolyGlot PDF - Content Script (content.js)
 * Detects PDF documents and embeds, injects a floating quick translate widget,
 * and handles context menu selection lookups.
 */

(function () {
  // Avoid duplicate injection
  if (window.__polyglot_injected) return;
  window.__polyglot_injected = true;

  let floatingWidget = null;
  let activeTooltip = null;

  init();

  async function init() {
    const isPdfPage = checkIsPdfDocument();
    
    // Check user preference
    try {
      const { showFloatingButton } = await chrome.storage.local.get({ showFloatingButton: true });
      if (isPdfPage && showFloatingButton) {
        injectFloatingWidget(location.href);
      } else {
        // Check if page embeds a PDF
        checkForEmbeddedPdf();
      }
    } catch (e) {
      // Storage access may be restricted in some frame contexts
    }

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'SHOW_SELECTION_TRANSLATION') {
        showSelectionTooltip(msg.text);
      }
    });
  }

  function checkIsPdfDocument() {
    const url = location.href.toLowerCase();
    const isPdfExtension = url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('.pdf#');
    const isPdfContentType = document.contentType === 'application/pdf';
    return isPdfExtension || isPdfContentType;
  }

  function checkForEmbeddedPdf() {
    const embed = document.querySelector('embed[type="application/pdf"], iframe[src*=".pdf"], object[type="application/pdf"]');
    if (embed) {
      const pdfUrl = embed.src || embed.data;
      if (pdfUrl) {
        injectFloatingWidget(pdfUrl);
      }
    }
  }

  function injectFloatingWidget(pdfUrl) {
    if (floatingWidget) return;

    floatingWidget = document.createElement('div');
    floatingWidget.className = 'polyglot-float-widget';
    floatingWidget.title = 'Open and Translate in PolyGlot PDF Reader';
    floatingWidget.innerHTML = `
      <div class="polyglot-badge-icon">🌐</div>
      <div class="polyglot-widget-label">
        <span class="polyglot-label-main">Translate PDF</span>
        <span class="polyglot-label-sub">Google Translate</span>
      </div>
      <button class="polyglot-widget-close" title="Dismiss">✕</button>
    `;

    // Click on widget to open viewer
    floatingWidget.addEventListener('click', (e) => {
      if (e.target.closest('.polyglot-widget-close')) {
        e.stopPropagation();
        floatingWidget.remove();
        floatingWidget = null;
        return;
      }
      chrome.runtime.sendMessage({
        action: 'OPEN_VIEWER',
        pdfUrl: pdfUrl
      });
    });

    document.body.appendChild(floatingWidget);
  }

  // Handle in-page text selection translation tooltip
  async function showSelectionTooltip(text) {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    activeTooltip = document.createElement('div');
    activeTooltip.className = 'polyglot-inpage-tooltip';
    activeTooltip.innerHTML = `
      <div class="polyglot-inpage-header">
        <span>PolyGlot Translate</span>
        <button class="polyglot-inpage-close">✕</button>
      </div>
      <div class="polyglot-inpage-text">Translating...</div>
    `;

    const closeBtn = activeTooltip.querySelector('.polyglot-inpage-close');
    closeBtn.addEventListener('click', () => {
      activeTooltip.remove();
      activeTooltip = null;
    });

    // Position
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 8;
    activeTooltip.style.left = `${left}px`;
    activeTooltip.style.top = `${top}px`;

    document.body.appendChild(activeTooltip);

    const textEl = activeTooltip.querySelector('.polyglot-inpage-text');

    try {
      const { targetLang } = await chrome.storage.local.get({ targetLang: 'es' });
      const res = await chrome.runtime.sendMessage({
        action: 'TRANSLATE_TEXT',
        text: text,
        sourceLang: 'auto',
        targetLang: targetLang
      });

      if (res && res.success) {
        textEl.textContent = res.translation;
      } else {
        textEl.textContent = 'Translation failed.';
      }
    } catch (err) {
      textEl.textContent = 'Error: ' + err.message;
    }
  }

  // Remove tooltip when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  });
})();
