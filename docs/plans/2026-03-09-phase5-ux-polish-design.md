# Phase 5: UX Polish — Design Document

**Date:** 2026-03-09
**Scope:** Non-MP3 file feedback, mobile hamburger nav, done-state animation, WASM loading indicator, conversion history, drop zone visual enhancements
**Approach:** CSS-first polish with minimal JS additions. No changes to WASM loading, conversion logic, or external services.

## Problem

mp3towav.online has solid core functionality (single + batch conversion, bit-depth selection, audio preview, PWA) but the UX lacks polish in several areas: non-MP3 files are silently rejected, mobile nav takes up too much space, state transitions feel abrupt, there's no conversion history for returning users, and the drop zone could better communicate accepted formats. These gaps make the tool feel less professional than it is.

## Design

### 1. Non-MP3 File Rejection Feedback (`app.js`)

When users drop non-MP3 files, provide clear feedback with the rejected file's extension:

- In `fileInput.change` handler: when `files.length === 0` and `fileInput.files.length > 0`, show error with the rejected file's extension
- In drag-and-drop handler: enhance the existing error to include the rejected file's extension: "Only MP3 files are supported. You dropped a .[ext] file."
- Track rejected file extensions with Plausible: `trackEvent('FileRejected', { extension: ext })`
- Helps understand if users want other format support

~15 lines JS. No new HTML/CSS (reuses existing error state).

### 2. Mobile Hamburger Nav (`index.html`, `style.css`, inline JS)

Replace the stacked mobile nav with a collapsible hamburger menu:

- Add `<button class="nav-toggle" aria-expanded="false" aria-label="Toggle navigation">` inside `<nav>`
- HTML entity `&#9776;` (☰) for hamburger icon, `&#10005;` (✕) for close
- CSS: hide `.nav-links` on mobile by default, show when `.nav-open` class present on `<nav>`
- Smooth `max-height` transition for open/close
- JS: click handler toggles `.nav-open` and `aria-expanded`
- Close menu when nav link is clicked
- Desktop: hamburger hidden, nav links always visible (no change)

~1 line HTML, ~30 lines CSS, ~15 lines inline JS.

### 3. Done-State Entrance Animation (`style.css`)

Add CSS-only entrance animations when conversion completes:

- `@keyframes popIn`: scale 0.8→1, opacity 0→1, 0.4s ease-out
- `.done-icon`: apply `popIn` animation
- `.file-comparison`: apply `popIn` with 0.15s delay
- `.done-buttons`, `.btn-secondary` in done state: apply `popIn` with 0.3s delay
- `animation-fill-mode: both` so elements start hidden and end visible
- Same animation for `.error-icon` for consistency
- Uses CSS animation triggered by the `hidden` class removal (no JS needed)

~25 lines CSS. No JS changes.

### 4. WASM Loading Indicator (`style.css`)

Enhance the loading state visual feedback without changing WASM loading code:

- Add pulsing shimmer animation to `.loading-text`
- Add thin indeterminate progress bar below the spinner (CSS-only, uses `translateX` animation)
- Indeterminate bar slides left-to-right in a loop, using primary color
- Gives visual feedback that loading is in progress
- No changes to the `import()` WASM loading mechanism

~15 lines CSS. No JS changes.

### 5. Conversion History (`index.html`, `style.css`, `app.js`)

Store and display last 10 conversion metadata records:

- localStorage key: `mp3towav_history`
- Record format: `{ input, output, size, bitDepth, date }` (no blob data)
- New collapsible section below the converter, above the newsletter: "Recent conversions"
- Toggle arrow to expand/collapse (collapsed by default)
- Each entry: filename, output size, bit-depth, relative time ("2 min ago", "yesterday")
- Hidden when history is empty
- "Clear history" text link at bottom of expanded list
- On new conversion: prepend to array, trim to 10, save to localStorage
- Same try/catch hardening as conversion counter
- Relative time formatter: simple function (< 1min, Xmin, Xhr, yesterday, date)

~15 lines HTML, ~40 lines CSS, ~50 lines JS.

### 6. Drop Zone Visual Enhancements (`index.html`, `style.css`, `app.js`)

Polish the drop zone interaction:

- **Format badge:** Small "MP3" pill next to "MP3 files up to 100 MB" text. Non-interactive, styled like a smaller bit-depth button. Reinforces accepted format at a glance.
- **Full-viewport drag overlay:** When dragging files anywhere on the page, show a subtle semi-transparent overlay with "Drop anywhere to convert" text. Uses `document.addEventListener('dragenter/dragleave')` with an enter counter to handle nested element events. Overlay has `pointer-events: none` except for the drop zone.
- **Drag micro-animation:** When files are over the drop zone, scale waveform bars to 1.1x for a "ready to receive" feel.

~5 lines HTML (overlay div, format badge span), ~30 lines CSS, ~25 lines JS.

## Files Modified

| File | Change |
|------|--------|
| `index.html` | Hamburger button, history section, drag overlay div, format badge span |
| `style.css` | Mobile nav toggle, done/error animation, WASM loading shimmer, history section styles, drag overlay, format badge |
| `app.js` | File rejection feedback + event, history read/write/display, viewport drag handlers |

## Risk Assessment

- **Zero risk** to converter functionality — no changes to WASM, conversion logic, batch processing, audio preview, or PWA
- All changes are additive CSS animations and small JS enhancements
- History uses same localStorage hardening pattern (try/catch, validation) as conversion counter
- Mobile nav is CSS toggle — desktop layout unchanged
- Drag overlay is cosmetic — doesn't change actual file handling logic
- Easily reversible via git

## Verification

- Drop a WAV/FLAC/M4A file — see clear rejection message with extension
- Mobile viewport — hamburger toggles nav, links close menu
- Convert a file — checkmark and results animate in with cascade
- First visit — loading state shows shimmer and indeterminate bar
- Convert 3 files — history section appears below converter with 3 entries
- Clear history — section hides again
- Drag file from desktop over page — full-viewport overlay appears
- Drop on overlay — file converts normally
- All existing functionality unchanged across all pages
