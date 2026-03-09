# Phase 2: SEO Growth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 competitor alternative pages, 5 blog posts, 1 About page, and update nav/sitemap across the site.

**Architecture:** Static HTML pages. Alternative pages use the existing Tailwind-based template (`alternatives/template.html`). Blog posts and About page use `content.css` layout matching existing pages. Cross-cutting changes update nav (add About link) and sitemap on all pages.

**Tech Stack:** HTML, CSS (content.css for blog/about, Tailwind CDN for alternatives), Schema.org JSON-LD

---

## Context for All Tasks

**Site structure:** Static HTML site at `C:\Users\James Waynn\Desktop\MP3TOWAV\`. No build step — edit HTML directly.

**Nav pattern (all non-alternative pages):**
```html
<nav class="site-nav">
    <a href="/" class="nav-logo">mp3towav<span>.online</span></a>
    <div class="nav-links">
        <a href="/">Converter</a>
        <a href="/blog/">Blog</a>
        <a href="/faq/">FAQ</a>
        <a href="/about/">About</a>
        <a href="/api/">API</a>
    </div>
</nav>
```

**Footer pattern (all non-alternative pages):**
```html
<footer>
    <div class="container">
        <div class="footer-links">
            <a href="/">MP3 to WAV Converter</a>
            <a href="/blog/">Blog</a>
            <a href="/faq/">FAQ</a>
            <a href="/api/">API</a>
            <a href="/privacy/">Privacy</a>
            <a href="/terms/">Terms</a>
        </div>
        <p>&copy; 2026 mp3towav.online — Free, private MP3 to WAV conversion.</p>
    </div>
</footer>
```

**Plausible script (add to `<head>` on all new pages):**
```html
<!-- Plausible Analytics -->
<script defer data-domain="mp3towav.online" src="https://plausible.io/js/script.js"></script>
```

**Blog post head pattern (from existing posts):**
```html
<link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
<link rel="stylesheet" href="/content.css">
```

---

### Task 1: Create 5 Alternative Pages

**Files:**
- Source template: `alternatives/template.html` (read-only reference)
- Create: `alternatives/freeconvert/index.html`
- Create: `alternatives/cloudconvert/index.html`
- Create: `alternatives/convertio/index.html`
- Create: `alternatives/online-convert/index.html`
- Create: `alternatives/audacity/index.html`

**Process for each page:**

1. Copy `alternatives/template.html` to the competitor directory
2. Replace all `[Competitor Name]` placeholders with the actual competitor name
3. Replace all `[competitor-name]` placeholders with the URL slug
4. Fill in competitor-specific data in comparison sections
5. Fix the footer: replace backslashes with forward slashes, add Privacy/Terms/About links, update copyright to 2026
6. Add Plausible analytics script to `<head>`
7. Update the nav to include About link (the template uses a Tailwind nav — add About between FAQ and the CTA button)

**Template footer fix (apply to all 5 pages):**

Replace the existing footer nav:
```html
<nav class="flex items-center gap-6 text-sm text-slate-500">
    <a href="\" class="hover:text-slate-300 transition-colors">Home</a>
    <a href="\blog\" class="hover:text-slate-300 transition-colors">Blog</a>
    <a href="\faq\" class="hover:text-slate-300 transition-colors">FAQ</a>
</nav>
<p class="text-xs text-slate-600">&copy; 2025 mp3towav.online. 100% browser-based.</p>
```

With:
```html
<nav class="flex items-center gap-6 text-sm text-slate-500">
    <a href="/" class="hover:text-slate-300 transition-colors">Converter</a>
    <a href="/blog/" class="hover:text-slate-300 transition-colors">Blog</a>
    <a href="/faq/" class="hover:text-slate-300 transition-colors">FAQ</a>
    <a href="/about/" class="hover:text-slate-300 transition-colors">About</a>
    <a href="/api/" class="hover:text-slate-300 transition-colors">API</a>
    <a href="/privacy/" class="hover:text-slate-300 transition-colors">Privacy</a>
    <a href="/terms/" class="hover:text-slate-300 transition-colors">Terms</a>
</nav>
<p class="text-xs text-slate-600">&copy; 2026 mp3towav.online — Free, private MP3 to WAV conversion.</p>
```

**Template nav fix — add About link.** Find the nav links section and add About between FAQ and the CTA:
```html
<a href="/about/" class="text-sm text-slate-400 hover:text-white transition-colors">About</a>
```

**Competitor-specific data:**

**FreeConvert** (`alternatives/freeconvert/index.html`):
- Name: FreeConvert
- Slug: freeconvert
- Privacy: Uploads files to remote servers
- Ads: Heavy advertising (full-page ads, video ads)
- Free limit: 1 GB max file size
- Formats: 50+ formats
- Batch: Yes
- Pricing: Free tier + paid plans ($9.99-$25.99/mo)
- Key weakness: Ad-heavy experience, privacy concerns from server uploads

**CloudConvert** (`alternatives/cloudconvert/index.html`):
- Name: CloudConvert
- Slug: cloudconvert
- Privacy: Uploads files to remote servers (deletes after 24h)
- Ads: Minimal advertising
- Free limit: 25 conversions/day, files limited
- Formats: 200+ formats
- Batch: Yes
- Pricing: Free tier + packages ($8-$25/mo)
- Key weakness: Very small free tier, server-based processing

**Convertio** (`alternatives/convertio/index.html`):
- Name: Convertio
- Slug: convertio
- Privacy: Uploads files to remote servers (deletes after 24h)
- Ads: Moderate advertising
- Free limit: 100 MB max file size, 10 conversions/day
- Formats: 300+ formats
- Batch: Yes
- Pricing: Free tier + paid plans ($9.99-$25.99/mo)
- Key weakness: Strict daily limits, server-based processing

**Online-Convert** (`alternatives/online-convert/index.html`):
- Name: Online-Convert
- Slug: online-convert
- Privacy: Uploads files to remote servers
- Ads: Moderate advertising
- Free limit: 100 MB, 3 conversions/day (free)
- Formats: 100+ formats
- Batch: Yes (paid)
- Pricing: Free tier + paid plans ($6.50-$25.50/mo)
- Key weakness: Very restrictive free tier, complex interface

**Audacity** (`alternatives/audacity/index.html`):
- Name: Audacity
- Slug: audacity
- Privacy: Local processing (desktop app)
- Ads: None
- Free limit: No limits (desktop software)
- Formats: Many formats via plugins
- Batch: Via macros (complex)
- Pricing: Free, open source
- Key weakness: Requires installation, steep learning curve, overkill for simple MP3→WAV conversion

**Commit after creating all 5:**
```bash
git add alternatives/freeconvert/ alternatives/cloudconvert/ alternatives/convertio/ alternatives/online-convert/ alternatives/audacity/
git commit -m "Add 5 competitor alternative pages"
```

---

### Task 2: Create Alternatives Hub Page

**Files:**
- Create: `alternatives/index.html`

**Structure:** Uses `content.css` layout (same as blog index, Privacy, Terms pages). Lists all 5 competitor comparisons with brief descriptions.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Best MP3 to WAV Converter Alternatives Compared | mp3towav.online</title>
    <meta name="description" content="Compare mp3towav.online to FreeConvert, CloudConvert, Convertio, Online-Convert, and Audacity. See why browser-based conversion is faster, more private, and truly free.">
    <meta property="og:title" content="Best MP3 to WAV Converter Alternatives Compared">
    <meta property="og:description" content="Compare mp3towav.online to the top 5 online audio converters. Privacy, speed, and zero ads.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://mp3towav.online/alternatives/">
    <meta property="og:image" content="https://mp3towav.online/og-image.png">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="https://mp3towav.online/og-image.png">
    <link rel="canonical" href="https://mp3towav.online/alternatives/">
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
    <link rel="stylesheet" href="/content.css">

    <!-- Plausible Analytics -->
    <script defer data-domain="mp3towav.online" src="https://plausible.io/js/script.js"></script>
</head>
<body>
    <header>
        <nav class="site-nav">
            <a href="/" class="nav-logo">mp3towav<span>.online</span></a>
            <div class="nav-links">
                <a href="/">Converter</a>
                <a href="/blog/">Blog</a>
                <a href="/faq/">FAQ</a>
                <a href="/about/">About</a>
                <a href="/api/">API</a>
            </div>
        </nav>
    </header>

    <main>
        <section class="article">
            <div class="container">
                <h1>MP3 to WAV Converter Alternatives</h1>
                <p class="blog-intro">How mp3towav.online compares to the most popular online audio converters. Every comparison focuses on what matters: privacy, speed, cost, and ease of use.</p>

                <div class="blog-list">
                    <a href="/alternatives/freeconvert/" class="blog-card">
                        <h2>mp3towav vs FreeConvert</h2>
                        <p>FreeConvert supports 50+ formats but uploads your files to remote servers and shows heavy advertising. mp3towav converts instantly in your browser with zero ads.</p>
                    </a>

                    <a href="/alternatives/cloudconvert/" class="blog-card">
                        <h2>mp3towav vs CloudConvert</h2>
                        <p>CloudConvert offers 200+ formats but has a tiny free tier and processes files on their servers. mp3towav is unlimited, free, and keeps files on your device.</p>
                    </a>

                    <a href="/alternatives/convertio/" class="blog-card">
                        <h2>mp3towav vs Convertio</h2>
                        <p>Convertio limits free users to 100 MB and 10 conversions per day. mp3towav has no limits, no signups, and no server uploads.</p>
                    </a>

                    <a href="/alternatives/online-convert/" class="blog-card">
                        <h2>mp3towav vs Online-Convert</h2>
                        <p>Online-Convert restricts free users to 3 conversions per day with a complex interface. mp3towav is drag-and-drop simple with unlimited use.</p>
                    </a>

                    <a href="/alternatives/audacity/" class="blog-card">
                        <h2>mp3towav vs Audacity</h2>
                        <p>Audacity is a powerful desktop audio editor — but overkill for simple MP3 to WAV conversion. mp3towav does it instantly in your browser, no installation needed.</p>
                    </a>
                </div>

                <div class="cta-box">
                    <h3>Ready to convert?</h3>
                    <p>Free, instant, and completely private — your files never leave your device.</p>
                    <a href="/" class="cta-btn">Convert MP3 to WAV</a>
                </div>
            </div>
        </section>
    </main>

    <!-- Use standard footer pattern from Context section -->
</body>
</html>
```

**Commit:**
```bash
git add alternatives/index.html
git commit -m "Add alternatives hub page"
```

---

### Task 3: Create Blog Post — MP3 to WAV for Vinyl Cutting

**Files:**
- Create: `blog/mp3-to-wav-for-vinyl-cutting/index.html`

**Follow the exact structure of existing blog posts** (see `blog/wav-vs-mp3-music-production/index.html` for the pattern). Include:

- `<head>`: meta tags, OG tags, canonical URL, favicon, Google Fonts, content.css, Plausible, Article schema, BreadcrumbList schema
- `<header>`: standard nav with About link
- `<main><article class="article"><div class="container">`: h1, meta line, content, CTA box, related links
- `<footer>`: standard footer

**Content outline (~800-1200 words):**
- **Title:** MP3 to WAV for Vinyl Cutting & Lathe
- **Meta description:** Why vinyl cutting requires uncompressed WAV files, how MP3 compression affects vinyl quality, and how to convert MP3 to WAV for lathe cutting.
- **Slug:** mp3-to-wav-for-vinyl-cutting
- **Read time:** 5 min read
- **Date:** 2026-03-09

**Sections:**
1. **Why vinyl cutting demands WAV** — Vinyl lathes cut physical grooves; lossy MP3 artifacts become permanently etched. WAV provides the clean source needed.
2. **How MP3 compression affects vinyl** — Psychoacoustic model removes frequencies that become audible in analog playback. High-frequency artifacts, stereo imaging issues.
3. **Recommended specs for vinyl** — 16-bit/44.1kHz minimum, 24-bit/96kHz preferred. WAV or AIFF. Avoid clipping — leave 1-2dB headroom.
4. **Preparing your files** — Level check, mono compatibility for inner grooves, de-essing, bass management. Convert MP3 to WAV as a starting point if WAV source isn't available.
5. **The bottom line** — Always start with the highest quality source. If MP3 is all you have, convert to WAV for compatibility but understand the limitations.

**CTA box:** "Need to convert MP3 to WAV?" with link to converter.
**Related links:** WAV vs MP3 post, Why uncompressed audio matters post, FAQ.

**Commit:**
```bash
git add blog/mp3-to-wav-for-vinyl-cutting/
git commit -m "Add blog post: MP3 to WAV for vinyl cutting"
```

---

### Task 4: Create Blog Post — Audio Formats for Game Development

**Files:**
- Create: `blog/audio-formats-for-game-development/index.html`

**Same structure as Task 3.**

**Content outline (~800-1200 words):**
- **Title:** Best Audio Formats for Game Development
- **Meta description:** Which audio formats to use in Unity, Unreal Engine, and Godot. WAV for SFX, OGG for music, and when MP3 fits your game audio pipeline.
- **Slug:** audio-formats-for-game-development
- **Read time:** 6 min read
- **Date:** 2026-03-09

**Sections:**
1. **Audio in game engines** — Games use different formats for different purposes: short SFX, long music tracks, voice lines, ambient loops.
2. **WAV for sound effects** — Uncompressed, instant playback, no decode overhead. Essential for latency-sensitive triggers (footsteps, gunshots, UI sounds).
3. **OGG Vorbis for music** — Compressed but good quality. Supported natively by Unity and Godot. Streams well for long tracks.
4. **MP3 considerations** — Licensing was historically an issue (patents expired 2017). Supported but OGG often preferred in game dev.
5. **Engine-specific recommendations** — Unity: WAV imports → compressed at build. Unreal: WAV source, engine handles compression. Godot: OGG for music, WAV for SFX.
6. **When to convert MP3 to WAV** — If your source audio is MP3 and your engine expects WAV input, convert before importing.

**CTA box:** "Need to convert MP3 to WAV?" with link to converter.
**Related links:** Audio formats for podcasters, WAV vs MP3, FAQ.

**Commit:**
```bash
git add blog/audio-formats-for-game-development/
git commit -m "Add blog post: audio formats for game development"
```

---

### Task 5: Create Blog Post — How to Batch Convert MP3 to WAV

**Files:**
- Create: `blog/batch-convert-mp3-to-wav/index.html`

**Same structure as Task 3.**

**Content outline (~800-1200 words):**
- **Title:** How to Batch Convert MP3 Files to WAV
- **Meta description:** Three ways to batch convert MP3 files to WAV: browser-based (one at a time), command line with ffmpeg, and Python scripting. Step-by-step guide for each method.
- **Slug:** batch-convert-mp3-to-wav
- **Read time:** 5 min read
- **Date:** 2026-03-09

**Sections:**
1. **Why batch convert?** — Large sample libraries, podcast archives, music collections that need format standardization for DAWs or archival.
2. **Method 1: Browser-based** — Use mp3towav.online one file at a time. Best for small batches (5-10 files). Zero setup, maximum privacy.
3. **Method 2: ffmpeg command line** — `for f in *.mp3; do ffmpeg -i "$f" "${f%.mp3}.wav"; done`. Powerful but requires installation. Explain the command step by step.
4. **Method 3: Python script** — Using pydub library. Show a simple script that converts a folder of MP3s. Good for custom workflows.
5. **Method 4: Sonic Converter API** — For developers who need programmatic batch conversion. Link to /api/ page.
6. **Choosing the right method** — Quick comparison table: browser (easy, private, small batches), ffmpeg (fast, any size), Python (customizable), API (automated).

**CTA box:** "Convert a file right now?" with link to converter.
**Related links:** MP3 to WAV for DAWs, API docs, Privacy in audio conversion.

**Commit:**
```bash
git add blog/batch-convert-mp3-to-wav/
git commit -m "Add blog post: how to batch convert MP3 to WAV"
```

---

### Task 6: Create Blog Post — MP3 vs FLAC vs WAV

**Files:**
- Create: `blog/mp3-vs-flac-vs-wav/index.html`

**Same structure as Task 3.**

**Content outline (~800-1200 words):**
- **Title:** MP3 vs FLAC vs WAV: Which Should You Choose?
- **Meta description:** A practical comparison of MP3, FLAC, and WAV audio formats. File sizes, quality, compatibility, and the best use case for each format.
- **Slug:** mp3-vs-flac-vs-wav
- **Read time:** 6 min read
- **Date:** 2026-03-09

**Sections:**
1. **Three formats, three philosophies** — Lossy (MP3), lossless compressed (FLAC), uncompressed (WAV). Each makes a different trade-off between size and quality.
2. **MP3: small files, permanent quality loss** — Psychoacoustic compression. ~1 MB/min at 128kbps, ~2.4 MB/min at 320kbps. Universal compatibility. Irreversible.
3. **FLAC: perfect quality, smaller than WAV** — Lossless compression (~60% of WAV size). Bit-for-bit identical to source when decoded. Growing support but not universal in DAWs.
4. **WAV: maximum compatibility, large files** — Uncompressed PCM. ~10 MB/min at CD quality. Universally supported. The professional standard.
5. **Comparison table** — Format, compression type, typical size (per min), quality, DAW support, streaming support, archival suitability.
6. **Which should you choose?** — Production/mixing: WAV. Archival: FLAC. Distribution/sharing: MP3. General rule: work in WAV, archive in FLAC, share in MP3.
7. **Converting between formats** — MP3→WAV doesn't restore lost data but ensures compatibility. FLAC→WAV is truly lossless. WAV→MP3 is one-way.

**CTA box:** "Need MP3 to WAV?" with link to converter.
**Related links:** WAV vs MP3 for music production, Why uncompressed audio matters, FAQ.

**Commit:**
```bash
git add blog/mp3-vs-flac-vs-wav/
git commit -m "Add blog post: MP3 vs FLAC vs WAV comparison"
```

---

### Task 7: Create Blog Post — WebAssembly Audio Tools

**Files:**
- Create: `blog/webassembly-audio-tools/index.html`

**Same structure as Task 3.**

**Content outline (~800-1200 words):**
- **Title:** Browser-Based Audio Tools: The WebAssembly Revolution
- **Meta description:** How WebAssembly is enabling professional audio processing in the browser. From MP3 decoding to real-time effects, WASM is changing what's possible without server uploads.
- **Slug:** webassembly-audio-tools
- **Read time:** 5 min read
- **Date:** 2026-03-09

**Sections:**
1. **The old way: upload and wait** — Traditional online audio tools upload files to servers, process remotely, and send results back. Slow, privacy-invasive, and bandwidth-dependent.
2. **What is WebAssembly?** — Compiled binary format that runs in the browser at near-native speed. Languages like Rust, C++, and Go can compile to WASM. Supported by all major browsers.
3. **WASM for audio processing** — Audio codecs (MP3 decoding, WAV encoding), real-time effects, signal analysis. Libraries like Symphonia (Rust) bring professional audio tools to the browser.
4. **How Sonic Converter works** — mp3towav.online uses a Rust-based audio engine compiled to WASM. Symphonia decodes MP3, raw PCM data is encoded to WAV, all in the browser. No server needed.
5. **Privacy as a technical guarantee** — When processing happens client-side, privacy isn't a policy — it's architecture. Files literally cannot be intercepted because they never leave the device.
6. **The future of browser-based audio** — Real-time effects, multi-track editing, AI-powered audio processing — all running locally via WASM. The browser is becoming a viable audio workstation.

**CTA box:** "Try Sonic Converter" with link to converter.
**Related links:** Privacy in audio conversion, Why uncompressed audio matters, API docs.

**Commit:**
```bash
git add blog/webassembly-audio-tools/
git commit -m "Add blog post: WebAssembly audio tools"
```

---

### Task 8: Create About Page

**Files:**
- Create: `about/index.html`

**Uses `content.css` layout**, same structure as Privacy and Terms pages.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About mp3towav.online — Free, Private MP3 to WAV Converter</title>
    <meta name="description" content="mp3towav.online was built by a developer who was tired of ad-heavy, privacy-invasive audio converters. Learn why we built a browser-based converter powered by Rust and WebAssembly.">
    <meta property="og:title" content="About mp3towav.online">
    <meta property="og:description" content="Built by a developer who was tired of ad-heavy, privacy-invasive audio converters.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://mp3towav.online/about/">
    <meta property="og:image" content="https://mp3towav.online/og-image.png">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="https://mp3towav.online/og-image.png">
    <link rel="canonical" href="https://mp3towav.online/about/">
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
    <link rel="stylesheet" href="/content.css">

    <!-- Plausible Analytics -->
    <script defer data-domain="mp3towav.online" src="https://plausible.io/js/script.js"></script>
</head>
<body>
    <header>
        <nav class="site-nav">
            <a href="/" class="nav-logo">mp3towav<span>.online</span></a>
            <div class="nav-links">
                <a href="/">Converter</a>
                <a href="/blog/">Blog</a>
                <a href="/faq/">FAQ</a>
                <a href="/about/" class="active">About</a>
                <a href="/api/">API</a>
            </div>
        </nav>
    </header>

    <main>
        <section class="article">
            <div class="container">
                <h1>About mp3towav.online</h1>
                <!-- Content sections below -->
            </div>
        </section>
    </main>

    <!-- Standard footer -->
</body>
</html>
```

**Content sections:**

1. **The Problem** — "Every online audio converter I tried was the same story: upload your files to some unknown server, sit through ads, create an account, hit a daily limit. For something as simple as converting MP3 to WAV, this felt absurd."

2. **The Solution** — "I built mp3towav.online to do one thing well: convert MP3 files to WAV instantly, entirely in your browser. No uploads. No ads. No signups. No limits. Your files never leave your device — that's not a marketing promise, it's how the technology works."

3. **How It Works** — "Under the hood, mp3towav.online runs Sonic Converter — a custom audio engine written in Rust and compiled to WebAssembly. It uses the Symphonia library to decode MP3 audio and produces standard PCM WAV output. The entire process happens in your browser's memory."

4. **Why Privacy Matters** — "When you upload a file to a traditional online converter, you're trusting a stranger with your audio. Unreleased music, confidential podcasts, private recordings — they all pass through someone else's server. With browser-based conversion, that risk doesn't exist."

5. **For Developers** — "Need programmatic conversion? The Sonic Converter API offers the same engine as a REST service with tiered plans from free to unlimited." Link to /api/.

6. **Get in Touch** — "Questions, feedback, or feature requests? Reach out at hello@mp3towav.online."

**Commit:**
```bash
git add about/
git commit -m "Add About page"
```

---

### Task 9: Update Blog Index with 5 New Post Cards

**Files:**
- Modify: `blog/index.html`

**Add 5 new blog cards** to the `.blog-list` div, after the existing 5 cards. Follow the exact pattern of existing cards:

```html
<a href="/blog/mp3-to-wav-for-vinyl-cutting/" class="blog-card">
    <h2>MP3 to WAV for Vinyl Cutting &amp; Lathe</h2>
    <p>Why vinyl cutting requires uncompressed WAV files and how MP3 compression artifacts affect physical groove quality.</p>
    <span class="card-meta">2026-03-09 · 5 min read</span>
</a>

<a href="/blog/audio-formats-for-game-development/" class="blog-card">
    <h2>Best Audio Formats for Game Development</h2>
    <p>Which audio formats to use in Unity, Unreal Engine, and Godot — WAV for SFX, OGG for music, and where MP3 fits.</p>
    <span class="card-meta">2026-03-09 · 6 min read</span>
</a>

<a href="/blog/batch-convert-mp3-to-wav/" class="blog-card">
    <h2>How to Batch Convert MP3 Files to WAV</h2>
    <p>Three methods for converting multiple MP3 files at once: browser-based, ffmpeg command line, and Python scripting.</p>
    <span class="card-meta">2026-03-09 · 5 min read</span>
</a>

<a href="/blog/mp3-vs-flac-vs-wav/" class="blog-card">
    <h2>MP3 vs FLAC vs WAV: Which Should You Choose?</h2>
    <p>A practical comparison of the three most common audio formats — file sizes, quality, compatibility, and best use cases.</p>
    <span class="card-meta">2026-03-09 · 6 min read</span>
</a>

<a href="/blog/webassembly-audio-tools/" class="blog-card">
    <h2>Browser-Based Audio Tools: The WebAssembly Revolution</h2>
    <p>How WebAssembly enables professional audio processing in the browser — no uploads, no installs, no privacy compromise.</p>
    <span class="card-meta">2026-03-09 · 5 min read</span>
</a>
```

Also update the nav to include About link.

**Commit:**
```bash
git add blog/index.html
git commit -m "Add 5 new blog post cards to blog index"
```

---

### Task 10: Add About Nav Link to All Existing Pages + Update Sitemap

**Files to modify (add About to nav):**
- `index.html`
- `faq/index.html`
- `api/index.html`
- `privacy/index.html`
- `terms/index.html`
- `blog/wav-vs-mp3-music-production/index.html`
- `blog/mp3-to-wav-for-daws/index.html`
- `blog/privacy-in-audio-conversion/index.html`
- `blog/audio-formats-for-podcasters/index.html`
- `blog/why-uncompressed-audio-matters/index.html`

**Nav change on each file:** Add `<a href="/about/">About</a>` between the FAQ and API links:

Find:
```html
<a href="/faq/">FAQ</a>
<a href="/api/">API</a>
```

Replace with:
```html
<a href="/faq/">FAQ</a>
<a href="/about/">About</a>
<a href="/api/">API</a>
```

Note: On `faq/index.html`, the FAQ link has `class="active"`. Preserve that:
```html
<a href="/faq/" class="active">FAQ</a>
<a href="/about/">About</a>
<a href="/api/">API</a>
```

Similarly, on `api/index.html`, preserve `class="active"` on the API link.

**Sitemap update** (`sitemap.xml`): Add 12 new URLs. Insert before the closing `</urlset>`:

```xml
  <url>
    <loc>https://mp3towav.online/about/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/alternatives/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/alternatives/freeconvert/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/alternatives/cloudconvert/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/alternatives/convertio/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/alternatives/online-convert/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/alternatives/audacity/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/blog/mp3-to-wav-for-vinyl-cutting/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/blog/audio-formats-for-game-development/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/blog/batch-convert-mp3-to-wav/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/blog/mp3-vs-flac-vs-wav/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://mp3towav.online/blog/webassembly-audio-tools/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
```

**Commit:**
```bash
git add index.html faq/index.html api/index.html privacy/index.html terms/index.html blog/wav-vs-mp3-music-production/index.html blog/mp3-to-wav-for-daws/index.html blog/privacy-in-audio-conversion/index.html blog/audio-formats-for-podcasters/index.html blog/why-uncompressed-audio-matters/index.html sitemap.xml
git commit -m "Add About nav link to all pages and update sitemap with 12 new URLs"
```

---

## Verification

After all tasks complete:
1. `grep -r "plausible.io" --include="*.html" | wc -l` — should match total HTML file count
2. `grep -r 'href="/about/"' --include="*.html" | wc -l` — About link on all pages
3. `grep -r 'href="/privacy/"' --include="*.html" | wc -l` — Privacy link on all pages
4. `grep -r 'href="/terms/"' --include="*.html" | wc -l` — Terms link on all pages
5. Validate `sitemap.xml` — should have 23 URLs total
6. Verify no `[Competitor Name]` or `[competitor-name]` placeholders remain: `grep -r "\[Competitor" alternatives/`
7. Visit each new page in browser to verify rendering
