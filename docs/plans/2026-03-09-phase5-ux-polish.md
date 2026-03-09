# Phase 5: UX Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the UX with better file rejection feedback, mobile hamburger nav, done-state cascade animations, WASM loading shimmer, conversion history, and drop zone visual enhancements.

**Architecture:** Incremental CSS-first enhancements to the existing vanilla JS/HTML/CSS codebase. No framework, no build system, no backend. History uses the same localStorage pattern (try/catch, NaN guard) established in Phase 4. Mobile nav is CSS toggle with minimal JS. Animations are CSS-only.

**Tech Stack:** Vanilla JS, HTML5, CSS, localStorage

---

## Context for Implementer

**Key files:**
- `index.html` — Homepage with converter UI. Nav at lines 146-155, converter section at lines 162-238, newsletter at lines 242-251, SEO content at lines 253-381, footer at lines 383-397, scripts at lines 399-409.
- `app.js` — All converter logic (649 lines). State at lines 10-19, DOM refs at lines 21-46, drag-and-drop at lines 80-106, fileInput.change at lines 120-129, convertFile at lines 317-412, handleBatch at lines 415-523, showError at lines 561-566, reset at lines 569-593, trackEvent at lines 608-612, updateConversionCounter at lines 614-626, counter IIFE at lines 639-648.
- `style.css` — All styles (1113 lines). Nav at lines 62-96, drop zone at lines 140-190, waveform at lines 192-225, loading state at lines 262-300, done state at lines 339-365, error state at lines 426-446, footer at lines 701-728, responsive at lines 1045-1112.

**Testing approach:** No test framework. Verify by running `python server.py` (port 3000) and checking the browser. Use preview tools for snapshots and eval.

---

## Task 1: Non-MP3 File Rejection Feedback

**Files:**
- Modify: `app.js:90-106` (drop handler), `app.js:120-129` (fileInput.change handler)

### Step 1: Enhance the drop handler with rejected file extension

In `app.js`, replace the drop handler error message (lines 90-106) with a version that extracts the rejected file's extension:

Replace the current block:

```js
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (isProcessing) return;
    const files = Array.from(e.dataTransfer.files).filter(f =>
        f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
    );
    if (files.length === 0) {
        showError("No MP3 files found. Please drop valid .mp3 files.");
        return;
    }
    if (files.length === 1) {
        handleFile(files[0]);
    } else {
        handleBatch(files);
    }
});
```

With:

```js
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (isProcessing) return;
    const allFiles = Array.from(e.dataTransfer.files);
    const files = allFiles.filter(f =>
        f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
    );
    if (files.length === 0) {
        const rejected = allFiles[0];
        const ext = rejected ? rejected.name.split('.').pop().toLowerCase() : 'unknown';
        showError('Only MP3 files are supported. You dropped a .' + ext + ' file.');
        trackEvent('FileRejected', { extension: ext });
        return;
    }
    if (files.length === 1) {
        handleFile(files[0]);
    } else {
        handleBatch(files);
    }
});
```

### Step 2: Add rejection feedback to fileInput.change handler

In `app.js`, replace the fileInput change handler (lines 120-129):

```js
fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files).filter(f =>
        f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
    );
    if (files.length === 1) {
        handleFile(files[0]);
    } else if (files.length > 1) {
        handleBatch(files);
    }
});
```

With:

```js
fileInput.addEventListener('change', () => {
    const allFiles = Array.from(fileInput.files);
    const files = allFiles.filter(f =>
        f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
    );
    if (files.length === 0 && allFiles.length > 0) {
        const ext = allFiles[0].name.split('.').pop().toLowerCase();
        showError('Only MP3 files are supported. You selected a .' + ext + ' file.');
        trackEvent('FileRejected', { extension: ext });
        fileInput.value = '';
        return;
    }
    if (files.length === 1) {
        handleFile(files[0]);
    } else if (files.length > 1) {
        handleBatch(files);
    }
});
```

### Step 3: Verify

- [ ] Drop a .wav file — see "Only MP3 files are supported. You dropped a .wav file."
- [ ] Drop a .flac file — see "Only MP3 files are supported. You dropped a .flac file."
- [ ] Use file picker to select a .m4a — see "Only MP3 files are supported. You selected a .m4a file."
- [ ] Drop a valid .mp3 — converts normally
- [ ] Drop multiple files, one .mp3 and one .wav — the .mp3 converts (filtered correctly)
- [ ] No console errors

### Step 4: Commit

```bash
git add app.js
git commit -m "feat: show clear error message with file extension when non-MP3 files are dropped"
```

---

## Task 2: Mobile Hamburger Nav

**Files:**
- Modify: `index.html:146-155` (add hamburger button to nav)
- Modify: `style.css:62-96` (add nav toggle styles), `style.css:1046-1051` (update mobile responsive)

### Step 1: Add hamburger button HTML in index.html

In `index.html`, change the nav (lines 146-155) from:

```html
        <nav class="site-nav">
            <a href="/" class="nav-logo">mp3towav<span>.online</span></a>
            <div class="nav-links">
                <a href="/" class="active">Converter</a>
                <a href="/blog/">Blog</a>
                <a href="/faq/">FAQ</a>
                <a href="/about/">About</a>
                <a href="/api/">API</a>
            </div>
        </nav>
```

To:

```html
        <nav class="site-nav">
            <a href="/" class="nav-logo">mp3towav<span>.online</span></a>
            <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-label="Toggle navigation">&#9776;</button>
            <div class="nav-links" id="navLinks">
                <a href="/" class="active">Converter</a>
                <a href="/blog/">Blog</a>
                <a href="/faq/">FAQ</a>
                <a href="/about/">About</a>
                <a href="/api/">API</a>
            </div>
        </nav>
```

### Step 2: Add nav toggle CSS in style.css

In `style.css`, after `.nav-links a:hover, .nav-links a.active { color: var(--primary); }` (line 96), add:

```css

/* ---- Mobile Nav Toggle ---- */
.nav-toggle {
    display: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 1.25rem;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    line-height: 1;
    transition: border-color 0.2s, color 0.2s;
}

.nav-toggle:hover {
    border-color: var(--primary);
    color: var(--primary);
}
```

### Step 3: Update mobile responsive styles in style.css

In the `@media (max-width: 640px)` block (line 1046), replace the existing `.site-nav` rule:

```css
    .site-nav {
        flex-direction: column;
        gap: 0.75rem;
        text-align: center;
    }
```

With:

```css
    .nav-toggle {
        display: block;
    }

    .site-nav {
        flex-wrap: wrap;
    }

    .nav-links {
        display: none;
        width: 100%;
        flex-direction: column;
        gap: 0.5rem;
        padding-top: 0.75rem;
        text-align: center;
    }

    .site-nav.nav-open .nav-links {
        display: flex;
    }
```

### Step 4: Add inline JS for toggle behavior in index.html

In `index.html`, after the existing inline `<script>` for the service worker (lines 401-406), add a new script before `</body>`:

```html
    <script>
    (function() {
        const toggle = document.getElementById('navToggle');
        const nav = document.querySelector('.site-nav');
        if (!toggle || !nav) return;
        toggle.addEventListener('click', function() {
            const open = nav.classList.toggle('nav-open');
            toggle.setAttribute('aria-expanded', String(open));
            toggle.innerHTML = open ? '&#10005;' : '&#9776;';
        });
        nav.querySelectorAll('.nav-links a').forEach(function(link) {
            link.addEventListener('click', function() {
                nav.classList.remove('nav-open');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.innerHTML = '&#9776;';
            });
        });
    })();
    </script>
```

### Step 5: Verify

- [ ] Desktop (> 640px) — nav links always visible, hamburger hidden
- [ ] Mobile (< 640px) — only logo + hamburger visible, links hidden
- [ ] Click hamburger — links appear, icon changes to ✕
- [ ] Click a nav link — menu closes
- [ ] Click hamburger again — menu closes, icon back to ☰
- [ ] `aria-expanded` toggles correctly
- [ ] No console errors

### Step 6: Commit

```bash
git add index.html style.css
git commit -m "feat: add mobile hamburger nav with toggle animation"
```

---

## Task 3: Done-State Cascade Animation

**Files:**
- Modify: `style.css:339-365` (enhance done state animations)

NOTE: The `.done-icon` and `.error-icon` already have a `pop` animation. This task adds staggered fade-in for the remaining elements (text, file comparison, buttons).

### Step 1: Add cascade animation keyframe and apply to done state elements

In `style.css`, after the existing `@keyframes pop` block (lines 355-359), add:

```css

@keyframes fadeSlideIn {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.drop-zone-done .done-text {
    animation: fadeSlideIn 0.35s ease-out 0.15s both;
}

.drop-zone-done .file-comparison {
    animation: fadeSlideIn 0.35s ease-out 0.25s both;
}

.drop-zone-done .done-buttons {
    animation: fadeSlideIn 0.35s ease-out 0.35s both;
}

.drop-zone-done .btn-secondary {
    animation: fadeSlideIn 0.35s ease-out 0.45s both;
}
```

### Step 2: Add same cascade for error state

In `style.css`, after the `.error-icon` animation (line 440), before `.error-text` (line 442), add:

```css

.drop-zone-error .error-text {
    animation: fadeSlideIn 0.35s ease-out 0.15s both;
}

.drop-zone-error .btn-secondary {
    animation: fadeSlideIn 0.35s ease-out 0.3s both;
}
```

### Step 3: Verify

- [ ] Convert a file — checkmark pops, then text, file comparison, and buttons cascade in with slight delay
- [ ] Drop an invalid file — error icon pops, then error text and retry button cascade in
- [ ] Animations feel smooth, not janky
- [ ] No console errors

### Step 4: Commit

```bash
git add style.css
git commit -m "feat: add cascading entrance animations for done and error states"
```

---

## Task 4: WASM Loading Shimmer

**Files:**
- Modify: `style.css:262-300` (enhance loading state styles)

### Step 1: Add shimmer animation and indeterminate progress bar

In `style.css`, after `.loading-subtext` styles (around line 300), add:

```css

/* ---- Loading shimmer + indeterminate bar ---- */
.drop-zone-loading .loading-text {
    background: linear-gradient(90deg, var(--text) 0%, var(--primary) 50%, var(--text) 100%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 2s ease-in-out infinite;
}

@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.loading-bar {
    width: 100%;
    max-width: 200px;
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    margin: 1rem auto 0;
    overflow: hidden;
    position: relative;
}

.loading-bar::after {
    content: '';
    position: absolute;
    top: 0;
    left: -40%;
    width: 40%;
    height: 100%;
    background: var(--primary);
    border-radius: 2px;
    animation: indeterminate 1.4s ease-in-out infinite;
}

@keyframes indeterminate {
    0% { left: -40%; }
    100% { left: 100%; }
}
```

### Step 2: Add loading bar HTML in index.html

In `index.html`, in the loading state div (line 182-186), add a loading bar div after the loading-subtext:

Change:

```html
                    <!-- Loading State -->
                    <div class="drop-zone-loading hidden" id="dzLoading">
                        <div class="spinner"></div>
                        <p class="loading-text">Initializing converter<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></p>
                        <p class="loading-subtext">Loading audio engine (first time only)</p>
                    </div>
```

To:

```html
                    <!-- Loading State -->
                    <div class="drop-zone-loading hidden" id="dzLoading">
                        <div class="spinner"></div>
                        <p class="loading-text">Initializing converter<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></p>
                        <p class="loading-subtext">Loading audio engine (first time only)</p>
                        <div class="loading-bar"></div>
                    </div>
```

### Step 3: Verify

- [ ] First visit (or hard refresh) — loading state shows shimmer on text and indeterminate bar
- [ ] Shimmer cycles left-to-right smoothly
- [ ] Indeterminate bar slides left-to-right
- [ ] After WASM loads, transitions to idle state normally
- [ ] No console errors

### Step 4: Commit

```bash
git add style.css index.html
git commit -m "feat: add shimmer text and indeterminate loading bar for WASM init"
```

---

## Task 5: Conversion History

**Files:**
- Modify: `index.html:236-238` (add history section between conversion counter and trust line... actually between `</main>` and newsletter)
- Modify: `style.css` (add history styles before newsletter section)
- Modify: `app.js` (add history functions and calls)

### Step 1: Add history section HTML in index.html

In `index.html`, after `</main>` (line 239) and before the newsletter section (line 242), add:

```html
    <!-- Conversion History -->
    <section class="history-section hidden" id="historySection">
        <div class="container">
            <button class="history-toggle" id="historyToggle" aria-expanded="false">
                <span class="history-toggle-text">Recent conversions</span>
                <span class="history-toggle-arrow" aria-hidden="true">&#9662;</span>
            </button>
            <div class="history-list hidden" id="historyList"></div>
        </div>
    </section>
```

### Step 2: Add history CSS in style.css

In `style.css`, before the `/* ---- Newsletter Signup ---- */` comment (line 735), add:

```css
/* ---- Conversion History ---- */
.history-section {
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
}

.history-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-main);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0.5rem 0;
    transition: color 0.2s;
}

.history-toggle:hover {
    color: var(--text-secondary);
}

.history-toggle-arrow {
    font-size: 0.65rem;
    transition: transform 0.2s;
}

.history-toggle[aria-expanded="true"] .history-toggle-arrow {
    transform: rotate(180deg);
}

.history-list {
    padding-top: 0.5rem;
}

.history-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.8rem;
}

.history-item:last-child {
    border-bottom: none;
}

.history-item-name {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
}

.history-item-meta {
    color: var(--text-muted);
    font-size: 0.7rem;
    white-space: nowrap;
}

.history-clear {
    display: block;
    margin: 0.5rem auto 0;
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-main);
    font-size: 0.7rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.2s;
}

.history-clear:hover {
    color: var(--error);
}
```

### Step 3: Add history JS in app.js

**3a.** Add DOM refs after `conversionCounter` ref (line 46):

```js
const historySection = document.getElementById('historySection');
const historyToggle = document.getElementById('historyToggle');
const historyList = document.getElementById('historyList');
```

**3b.** Add history functions after `updateConversionCounter` (line 626):

```js
// --- Conversion History ---
function addToHistory(entry) {
    try {
        let history = JSON.parse(localStorage.getItem('mp3towav_history') || '[]');
        if (!Array.isArray(history)) history = [];
        history.unshift(entry);
        if (history.length > 10) history = history.slice(0, 10);
        localStorage.setItem('mp3towav_history', JSON.stringify(history));
    } catch (e) {
        // localStorage unavailable
    }
    renderHistory();
}

function renderHistory() {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('mp3towav_history') || '[]');
        if (!Array.isArray(history)) history = [];
    } catch (e) {
        return;
    }
    if (history.length === 0) {
        historySection.classList.add('hidden');
        return;
    }
    historySection.classList.remove('hidden');
    historyList.innerHTML = history.map(function(h) {
        return '<div class="history-item">' +
            '<span class="history-item-name">' + escapeHtml(h.input) + '</span>' +
            '<span class="history-item-meta">' + formatSize(h.size) + ' · ' + h.bitDepth + '-bit · ' + timeAgo(h.date) + '</span>' +
            '</div>';
    }).join('') + '<button class="history-clear" id="historyClear">Clear history</button>';

    var clearBtn = document.getElementById('historyClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            try { localStorage.removeItem('mp3towav_history'); } catch (e) {}
            historyList.innerHTML = '';
            historyList.classList.add('hidden');
            historySection.classList.add('hidden');
            historyToggle.setAttribute('aria-expanded', 'false');
        });
    }
}

function timeAgo(dateStr) {
    try {
        var now = Date.now();
        var then = new Date(dateStr).getTime();
        var diff = Math.floor((now - then) / 1000);
        if (isNaN(diff) || diff < 0) return '';
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 172800) return 'yesterday';
        return new Date(dateStr).toLocaleDateString();
    } catch (e) {
        return '';
    }
}
```

**3c.** Add history toggle click handler. After the history functions above, add:

```js
historyToggle.addEventListener('click', function() {
    var expanded = historyToggle.getAttribute('aria-expanded') === 'true';
    historyToggle.setAttribute('aria-expanded', String(!expanded));
    historyList.classList.toggle('hidden');
});
```

**3d.** Call `addToHistory` after single conversion. In `convertFile()`, after `updateConversionCounter(1);` (line 386), add:

```js
        addToHistory({ input: file.name, output: outputName, size: blob.size, bitDepth: actualBitDepth, date: new Date().toISOString() });
```

**3e.** Call `addToHistory` for each file in batch conversion. In `handleBatch()`, inside the loop where batch results are built (around line 475-490), after a successful conversion, add the history entry. Find the line where `batchResults.push` is called with a successful result, and after that push, add:

Look for the section in handleBatch where results are pushed. Read `app.js` lines 460-500 to find the exact location.

Actually, to keep it simple and consistent: add a single history entry for batch at the end, after `updateConversionCounter(successCount);` (line ~521). Inside the `if (successCount > 0)` block:

```js
        batchResults.filter(function(r) { return !r.error; }).forEach(function(r) {
            addToHistory({ input: r.file, output: r.outputName, size: r.size, bitDepth: wasmReady ? selectedBitDepth : 16, date: new Date().toISOString() });
        });
```

**3f.** Initialize history display on page load. After the conversion counter IIFE (line ~648), add:

```js
// --- Initialize conversion history display ---
renderHistory();
```

### Step 4: Verify

- [ ] Fresh visit (clear localStorage) — history section hidden
- [ ] Convert one file — history section appears with toggle "Recent conversions"
- [ ] Click toggle — list expands showing the converted file with metadata
- [ ] Convert another file — new entry appears at top
- [ ] Batch convert 3 files — 3 new entries appear
- [ ] "Clear history" removes all entries and hides section
- [ ] Reload page — history persists from localStorage
- [ ] Time display works: "just now", then later "Xm ago", etc.
- [ ] No console errors

### Step 5: Commit

```bash
git add app.js index.html style.css
git commit -m "feat: add conversion history with localStorage persistence"
```

---

## Task 6: Drop Zone Visual Enhancements

**Files:**
- Modify: `index.html:176-178` (add format badge), `index.html` (add drag overlay div before `</body>`)
- Modify: `style.css:192-225` (add drag micro-animation), `style.css` (add overlay + badge styles)
- Modify: `app.js:246-248` (replace page-level drag prevention with overlay logic)

### Step 1: Add format badge to idle state HTML in index.html

In `index.html`, change the drop limit line (line 178):

```html
                        <p class="drop-limit">MP3 files up to 100 MB</p>
```

To:

```html
                        <p class="drop-limit"><span class="format-badge">MP3</span> files up to 100 MB</p>
```

### Step 2: Add drag overlay HTML in index.html

Before the `</body>` tag (line 409), add:

```html
    <div class="drag-overlay hidden" id="dragOverlay">
        <div class="drag-overlay-content">
            <span class="drag-overlay-icon" aria-hidden="true">&#8615;</span>
            <p>Drop anywhere to convert</p>
        </div>
    </div>
```

### Step 3: Add format badge and overlay CSS in style.css

In `style.css`, after `.drop-limit` styles (line 260), add:

```css

.format-badge {
    display: inline-block;
    background: var(--primary);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    letter-spacing: 0.05em;
    vertical-align: middle;
    margin-right: 0.15rem;
}
```

After the waveform animation styles (after line 225), add the drag micro-animation:

```css

.drop-zone.dragover .waveform {
    transform: scale(1.1);
    transition: transform 0.2s ease;
}
```

Before the footer styles (before line 701 `/* ---- Footer ---- */`), add the overlay styles:

```css
/* ---- Drag Overlay ---- */
.drag-overlay {
    position: fixed;
    inset: 0;
    background: rgba(9, 9, 11, 0.85);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    backdrop-filter: blur(4px);
}

.drag-overlay-content {
    text-align: center;
    color: var(--text);
}

.drag-overlay-icon {
    font-size: 3rem;
    color: var(--primary);
    display: block;
    margin-bottom: 1rem;
    animation: float 1.5s ease-in-out infinite;
}

@keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
}

.drag-overlay-content p {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-secondary);
}
```

### Step 4: Replace page-level drag handlers with overlay logic in app.js

In `app.js`, replace the page-level drag prevention (lines 246-248):

```js
// --- Prevent default drag on page ---
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());
```

With:

```js
// --- Full-viewport drag overlay ---
const dragOverlay = document.getElementById('dragOverlay');
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1 && !isProcessing) {
        dragOverlay.classList.remove('hidden');
    }
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        dragOverlay.classList.add('hidden');
    }
});

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.add('hidden');
});
```

### Step 5: Verify

- [ ] Idle state shows "MP3" pill badge next to "files up to 100 MB"
- [ ] Badge is orange with white text, small and subtle
- [ ] Drag a file from desktop over the page — full-viewport overlay appears with "Drop anywhere to convert"
- [ ] Overlay has blur backdrop and floating arrow animation
- [ ] Drop the file — overlay disappears, conversion starts
- [ ] Drag a file over the drop zone — waveform scales to 1.1x
- [ ] While converting (isProcessing), drag overlay does NOT appear
- [ ] Desktop drag & drop still works normally
- [ ] No console errors

### Step 6: Commit

```bash
git add app.js index.html style.css
git commit -m "feat: add format badge, full-viewport drag overlay, and waveform micro-animation"
```

---

## Task 7: Sitemap Update & Push

**Files:**
- No new pages added in Phase 5 — no sitemap changes needed

### Step 1: Push to remote

```bash
git push origin master
```
