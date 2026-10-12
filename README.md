# PolyGlot PDF - Smart AI & Google PDF Translator

A modern Chrome Extension (Manifest V3) that translates PDF documents in real-time using **Google Translate** with zero API keys or costs required.

Designed with a sleek glassmorphic UI, high-fidelity PDF layout preservation, multiple viewing modes (Side-by-Side, Overlay, Bilingual), instant text-to-speech audio pronunciation, and document export.

---

## 🌟 Key Features

### 1. 100% Free Translation (Zero API Keys Required)
- **Primary Engine**: Built-in Google Translate Web API (`dict-chrome-ex` client) with batch delimiter optimization.
- **Secondary Fallback**: Free MyMemory Translation API to guarantee high availability without rate limits.
- Supports **45+ major global languages** with auto-detection of source language.

### 2. Versatile Reading Modes
- **◫ Dual Side-by-Side View**: Original PDF page on the left, translated page with matching formatting and layout on the right. Synchronized page tracking.
- **☷ In-Place Overlay Mode**: Seamless semi-translucent glass translated chips rendered directly above original text spans.
- **☰ Interlinear Bilingual Mode**: Original sentences followed directly by translated sentences for language learners and researchers.
- **📄 Original Document View**: High-fidelity PDF rendering with full text selection.

### 3. Interactive Reading & Tools
- **Text Selection Popover**: Highlight any phrase or paragraph in the PDF to summon an instant Google Translate card with:
  - 🔊 **Text-to-Speech (TTS)** audio pronunciation in the target language.
  - 📋 **One-click Copy**.
  - 🌐 **Instant Language Switcher**.
- **Full Document Translation**: Translate page-by-page or batch-translate the entire PDF with an animated progress bar and cancellation option.
- **Theme Modes**: Dark (Obsidian Glass), Light (Clean Paper), and Sepia (Warm Reader).
- **Document Export**: Download translated text as `.txt`, structured `.md` (Markdown), or print/save as translated PDF (`Ctrl+P`).

### 4. Seamless In-Browser Integration
- **Floating Quick Pill**: Injected automatically onto web pages containing PDFs or PDF embeds. Click `[ 🌐 Translate PDF ]` to launch the translator.
- **Context Menus**: Right-click on any PDF link or selected text to open in PolyGlot.
- **Local PDF Support**: Drag and drop any PDF file from your computer or browse to open it instantly.
- **Popup Quick Lookup**: Mini text translator built right into the extension popup.

---

## 🚀 How to Install and Run in Google Chrome

1. Open Google Chrome and navigate to:
   ```
   chrome://extensions
   ```
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. Click the **Load unpacked** button in the top-left.
4. Select the directory:
   ```
   d:\VLC Solutions\pdf-translate-chrome-ext
   ```
5. *(Recommended for local files)* Click **Details** on the PolyGlot PDF extension card and toggle **"Allow access to file URLs"** to **ON** so you can translate local PDF files directly from Chrome.

---

## 📂 Project Architecture

```
pdf-translate-chrome-ext/
├── manifest.json            # Chrome Extension Manifest V3
├── background.js           # Service worker (Google Translate API proxy, CORS bypass, batching)
├── content/
│   ├── content.js          # Injected script detecting PDF pages & embeds, floating pill widget
│   └── content.css         # Styling for floating action pill and selection tooltips
├── popup/
│   ├── popup.html          # Extension popup UI (glassmorphism card, language selector, dropzone)
│   ├── popup.js            # Settings sync, drag-and-drop file passing via IndexedDB, quick lookup
│   └── popup.css           # Modern popup styling (dark & light modes)
├── viewer/
│   ├── viewer.html         # Dedicated full-page PDF Translator Studio
│   ├── viewer.js           # PDF.js rendering, paragraph extraction, batch translation, layout modes
│   └── viewer.css          # Viewer design system (Split, Overlay, Bilingual, Sepia/Dark/Light)
├── lib/
│   ├── pdf.min.js          # Mozilla PDF.js core library (bundled locally for MV3 compliance)
│   ├── pdf.worker.min.js   # Mozilla PDF.js background worker
│   ├── languages.js        # Language metadata (45+ languages, flags, native names)
│   └── chrome-compat.js    # Chrome runtime & standalone web preview polyfill
├── sample/
│   └── sample_document.pdf # Sample research paper for instant testing
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 🌐 Supported Languages

Auto-Detect, English, Spanish, French, German, Italian, Portuguese, Russian, Chinese (Simplified & Traditional), Japanese, Korean, Arabic, Hindi, Bengali, Sinhala (සිංහල), Turkish, Vietnamese, Dutch, Polish, Ukrainian, Indonesian, Thai, Greek, Hebrew, Swedish, Norwegian, Danish, Finnish, Czech, Hungarian, Romanian, Malay, Persian, Urdu, Tagalog, Tamil, Telugu, Marathi, Gujarati, Swahili, Slovak, Bulgarian, Croatian, Serbian, Catalan, and more.
