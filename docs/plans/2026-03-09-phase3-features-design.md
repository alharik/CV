# Phase 3: Features — Design Document

**Date:** 2026-03-09
**Scope:** Bit-depth selector, batch conversion, audio preview, PWA/offline support
**Approach:** Incremental enhancement to existing app.js/index.html (no framework, no build system)

## Context

The Sonic Converter WASM module already exposes `convertMp3ToWavWithDepth(data, 16|24|32)` and `getMp3Info(data)`. Bit-depth support exists in the engine but isn't wired up in the UI. The current converter handles one file at a time with no playback capability and no offline support.

## 1. Bit-Depth Selector

**UI:** Segmented control below the drop zone, above the trust line. Three options: 16-bit (default), 24-bit, 32-bit. Pill buttons with orange active state matching the dark theme.

**Behavior:**
- Default is 16-bit (preserves current behavior)
- Selection persists across conversions in the same session
- Passes selected depth to `wasmModule.convertMp3ToWavWithDepth(mp3Bytes, depth)`
- Web Audio API fallback stays 16-bit only — shows warning if WASM fails and user selected 24/32
- Done screen shows bit depth in output info (e.g. "35.2 MB · 24-bit")

**Files:** `index.html` (HTML), `style.css` (styles), `app.js` (wire up selection + pass to WASM)

## 2. Batch Conversion

**UI:** Same drop zone accepts multiple files. `<input>` gets `multiple` attribute.

**Multi-file flow:**
- Drop zone switches to queue view showing file list with per-file status:
  - Waiting (gray dot)
  - Converting (orange spinner + progress %)
  - Done (green check + file size)
  - Error (red X + message)
- Files processed sequentially (one at a time through WASM)
- After all complete: summary with "Download All as ZIP" + individual download buttons
- ZIP via JSZip from CDN (`https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js`)

**Single-file unchanged:** One file dropped = current flow exactly as today (no queue view).

**Limits:** 100MB per file. No total batch limit.

**Files:** `index.html` (queue HTML panel, JSZip script), `style.css` (queue styles), `app.js` (queue logic, sequential processing, ZIP generation)

## 3. Audio Preview

**UI:** Play/Pause button on done screen, next to Download button. Uses existing blob URL.

**Behavior:**
- Creates `<audio>` element from `lastBlobUrl`
- Toggle play/pause with icon change
- Stops and resets on "Convert another file"
- Batch mode: each completed file gets a small play button
- Styled as secondary button (outline) with triangle/pause icon

**No waveform, scrubbing, or timeline.** Play/pause only.

**Files:** `index.html` (button), `style.css` (styles), `app.js` (~20 lines play/pause + cleanup)

## 4. PWA / Service Worker

**Purpose:** Offline conversion after first visit. Service worker caches WASM, JS, CSS, HTML, fonts.

**New files:**
- `manifest.json` — App name, icons (reuse favicon/apple-touch-icon), theme #09090b, display: standalone
- `sw.js` — Versioned cache, strategy varies by asset type

**Cache strategy:**
- WASM + JS + CSS + fonts: Cache-first (immutable, rarely change)
- HTML pages: Network-first with cache fallback (fresh content, offline capable)
- External scripts (Plausible, JSZip CDN): Network-only (not cached)

**Scope:** Caches converter page and assets only. Blog/FAQ/alternatives not cached.

**No custom install banner.** Browser's native "Add to Home Screen" prompt only.

**Files changed:** `index.html` (manifest link + SW registration)

## Files Summary

| File | Change |
|------|--------|
| `index.html` | Add bit-depth control, queue panel, preview button, manifest link, SW registration, JSZip script |
| `style.css` | Add bit-depth selector styles, queue list styles, preview button styles |
| `app.js` | Add bit-depth logic, batch queue, audio preview, SW registration |
| `manifest.json` | **NEW** — PWA manifest |
| `sw.js` | **NEW** — Service worker |

## Risk Assessment

- Bit-depth selector is trivial — WASM already supports it
- Batch conversion adds complexity to app.js but single-file path is unchanged
- Audio preview uses existing blob URL, minimal new code
- PWA is fully additive (new files only, small HTML changes)
- No changes to the Rust/WASM engine required
- All features are independent and can be shipped incrementally
