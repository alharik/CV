# Phase 4: Monetization & Growth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Plausible custom events, replace Gumroad with Stripe payment links, create an API key request page, add newsletter signup, and add a conversion counter for social proof.

**Architecture:** Incremental enhancement to the existing vanilla JS/HTML/CSS codebase. No framework, no build system, no backend. Each feature layers onto the existing `app.js` (608 lines), `index.html` (397 lines), and `style.css` (1014 lines). External services (Stripe, Buttondown, Formspree) use configurable placeholder URLs.

**Tech Stack:** Vanilla JS, HTML5, CSS, Plausible Analytics API, localStorage

---

## Context for Implementer

**Key files:**
- `index.html` — Homepage with converter UI. Converter section at lines 162-237, SEO content at lines 241-369, footer at lines 371-384, scripts at lines 386-394.
- `app.js` — All converter logic (608 lines). State at lines 10-19, DOM refs at lines 21-45, conversion complete at line 380, batch complete at lines 501-512, download handler at lines 139-144, downloadAll handler at lines 166-204.
- `style.css` — All styles (1014 lines). Footer at lines 691-718, SEO content starts at line 725, responsive at lines 954-1013.
- `api/index.html` — API docs page (335 lines). Gumroad buttons at lines 101, 116, 131. CTA box at lines 297-301. Gumroad JS at line 332.
- `api/api.css` — API page styles (282 lines). Gumroad overrides at lines 227-256.
- `sitemap.xml` — SEO sitemap (142 lines).
- `content.css` — Shared styles for content pages (blog, FAQ, privacy, etc.)
- `privacy/index.html` — Example content page template (use for new pages).

**Testing approach:** No test framework. Verify by running `python server.py` (port 3000) and checking the browser. Use preview tools for snapshots and eval.

---

## Task 1: Plausible Custom Events

**Files:**
- Modify: `app.js:380` (after single conversion success), `app.js:501-512` (after batch success), `app.js:139-144` (download click), `app.js:166-204` (download all click)

### Step 1: Add Plausible helper function in app.js

After the `escapeHtml` function (line 596), add a helper that safely calls Plausible:

```js
function trackEvent(name, props) {
    if (typeof plausible !== 'undefined') {
        plausible(name, { props });
    }
}
```

### Step 2: Track single file conversion

In `convertFile()`, after `showPanel(dzDone);` (line 380), add:

```js
        trackEvent('Conversion', { type: 'single', bitDepth: String(actualBitDepth), fileCount: '1' });
```

### Step 3: Track batch conversion

In `handleBatch()`, after `isProcessing = false;` (line 512), add:

```js
    trackEvent('Conversion', { type: 'batch', bitDepth: String(selectedBitDepth), fileCount: String(successCount) });
```

### Step 4: Track single file download

In the `downloadBtn` click handler (lines 139-144), inside the `if` block after `triggerDownload(...)` (line 142), add:

```js
        trackEvent('Download', { type: 'wav' });
```

### Step 5: Track ZIP download

In the `downloadAllBtn` click handler, after `URL.revokeObjectURL(zipUrl);` (line 193), add:

```js
        trackEvent('Download', { type: 'zip' });
```

Also track single-file download from batch. After `triggerDownload(successResults[0].blobUrl, ...)` (line 172), add:

```js
        trackEvent('Download', { type: 'wav' });
```

### Step 6: Verify

Start server: `python server.py`
- [ ] Convert a single file — check browser console/network for `plausible` call with `Conversion` event
- [ ] Convert multiple files (batch) — check for `Conversion` event with type=batch
- [ ] Download a WAV — check for `Download` event with type=wav
- [ ] Download ZIP (batch) — check for `Download` event with type=zip
- [ ] All existing functionality unchanged

### Step 7: Commit

```bash
git add app.js
git commit -m "feat: add Plausible custom events for conversion and download tracking"
```

---

## Task 2: Stripe Payment Links (Replace Gumroad)

**Files:**
- Modify: `api/index.html:101,116,131` (button links), `api/index.html:332` (Gumroad script)
- Modify: `api/api.css:227-256` (Gumroad CSS overrides)

### Step 1: Replace Gumroad buttons with Stripe links in api/index.html

Change the Pro button (line 101) from:
```html
                        <a class="gumroad-button pricing-btn pricing-btn-primary" href="https://mp3towav.gumroad.com/l/SONIC_PRO">Subscribe</a>
```
to:
```html
                        <a class="pricing-btn pricing-btn-primary" href="https://buy.stripe.com/STRIPE_PRO_LINK" target="_blank" rel="noopener">Subscribe</a>
```

Change the Business button (line 116) from:
```html
                        <a class="gumroad-button pricing-btn pricing-btn-primary" href="https://mp3towav.gumroad.com/l/SONIC_BUSINESS">Subscribe</a>
```
to:
```html
                        <a class="pricing-btn pricing-btn-primary" href="https://buy.stripe.com/STRIPE_BUSINESS_LINK" target="_blank" rel="noopener">Subscribe</a>
```

Change the Unlimited button (line 131) from:
```html
                        <a class="gumroad-button pricing-btn pricing-btn-primary" href="https://mp3towav.gumroad.com/l/SONIC_UNLIMITED">Subscribe</a>
```
to:
```html
                        <a class="pricing-btn pricing-btn-primary" href="https://buy.stripe.com/STRIPE_UNLIMITED_LINK" target="_blank" rel="noopener">Subscribe</a>
```

### Step 2: Remove Gumroad script

Remove line 332:
```html
    <script src="https://gumroad.com/js/gumroad.js"></script>
```

### Step 3: Replace the Gumroad integration comment

Replace the comment block (lines 303-311) with:
```html
                <!--
                    STRIPE INTEGRATION:
                    1. Create subscription products in Stripe Dashboard:
                       - "Sonic Converter API - Pro" ($9/mo recurring)
                       - "Sonic Converter API - Business" ($19/mo recurring)
                       - "Sonic Converter API - Unlimited" ($49/mo recurring)
                    2. Create Payment Links for each product in Stripe Dashboard
                    3. Replace the placeholder URLs above:
                       - STRIPE_PRO_LINK → your Pro payment link ID
                       - STRIPE_BUSINESS_LINK → your Business payment link ID
                       - STRIPE_UNLIMITED_LINK → your Unlimited payment link ID
                    4. Payment links open Stripe's hosted checkout page
                -->
```

### Step 4: Remove Gumroad CSS overrides from api/api.css

Remove the entire Gumroad section (lines 227-256):
```css
/* ---- Gumroad Button Override ---- */
.gumroad-button.pricing-btn { ... }
.gumroad-button.pricing-btn:hover { ... }
.gumroad-button .logo-full, ... { ... }
```

### Step 5: Verify

- [ ] All 3 paid tier Subscribe buttons render correctly (orange, full-width)
- [ ] Clicking Subscribe opens a new tab (to the placeholder Stripe URL)
- [ ] Free tier "Get Started" button still links to `#get-started`
- [ ] No Gumroad overlay appears
- [ ] No console errors (no gumroad.js loading)
- [ ] Button hover effects work (translateY, box-shadow)

### Step 6: Commit

```bash
git add api/index.html api/api.css
git commit -m "feat: replace Gumroad with Stripe payment links on API page"
```

---

## Task 3: API Key Request Page

**Files:**
- Create: `api/get-key/index.html`
- Create: `api/get-key/get-key.css`
- Modify: `api/index.html:297-301` (update CTA link)

### Step 1: Create the API key request page

Create `api/get-key/index.html`. Use the privacy page (`privacy/index.html`) as the structural template — same head, nav, footer, content.css import. The page has two states: a form state and a success state.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Get Your API Key — Sonic Converter API | mp3towav.online</title>
    <meta name="description" content="Request a free API key for the Sonic Converter API. Convert MP3 to WAV programmatically with 500 free conversions per month.">
    <meta property="og:title" content="Get Your API Key — Sonic Converter API">
    <meta property="og:description" content="Request a free API key. 500 free conversions per month. No credit card required.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://mp3towav.online/api/get-key/">
    <meta property="og:image" content="https://mp3towav.online/og-image.png">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="https://mp3towav.online/og-image.png">
    <link rel="canonical" href="https://mp3towav.online/api/get-key/">
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
    <link rel="stylesheet" href="/content.css">
    <link rel="stylesheet" href="/api/get-key/get-key.css">
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
                <a href="/api/" class="active">API</a>
            </div>
        </nav>
    </header>

    <main>
        <section class="article">
            <div class="container">
                <h1>Get Your API Key</h1>
                <p class="meta">Start converting MP3 to WAV programmatically. Free tier includes 500 conversions/month.</p>

                <!-- Form State -->
                <div id="formState">
                    <form id="keyRequestForm" action="https://formspree.io/f/FORM_ID" method="POST">
                        <div class="form-group">
                            <label for="email">Email address</label>
                            <input type="email" id="email" name="email" required placeholder="you@example.com" autocomplete="email">
                        </div>

                        <div class="form-group">
                            <label>Plan</label>
                            <div class="plan-options">
                                <label class="plan-option">
                                    <input type="radio" name="plan" value="free" checked>
                                    <span class="plan-card">
                                        <strong>Free</strong>
                                        <span>500 conversions/mo · 16-bit</span>
                                    </span>
                                </label>
                                <label class="plan-option">
                                    <input type="radio" name="plan" value="pro">
                                    <span class="plan-card">
                                        <strong>Pro — $9/mo</strong>
                                        <span>5,000 conversions/mo · 16/24-bit</span>
                                    </span>
                                </label>
                                <label class="plan-option">
                                    <input type="radio" name="plan" value="business">
                                    <span class="plan-card">
                                        <strong>Business — $19/mo</strong>
                                        <span>25,000 conversions/mo · 16/24/32-bit</span>
                                    </span>
                                </label>
                                <label class="plan-option">
                                    <input type="radio" name="plan" value="unlimited">
                                    <span class="plan-card">
                                        <strong>Unlimited — $49/mo</strong>
                                        <span>Unlimited conversions · 16/24/32-bit</span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="usecase">What will you use the API for? <span class="optional">(optional)</span></label>
                            <textarea id="usecase" name="usecase" rows="3" placeholder="e.g., batch processing audio files for my podcast platform"></textarea>
                        </div>

                        <input type="hidden" name="_subject" value="New API Key Request">
                        <button type="submit" class="form-submit" id="submitBtn">Request API Key</button>
                    </form>
                    <p class="form-note">We'll send your API key within 24 hours. Paid plans require a separate subscription — <a href="/api/#docs">see pricing</a>.</p>
                </div>

                <!-- Success State -->
                <div id="successState" class="hidden">
                    <div class="success-card">
                        <div class="success-icon">&#10003;</div>
                        <h2>Request Received!</h2>
                        <p>We'll send your API key to the email address you provided within 24 hours.</p>
                        <p>While you wait, check out the <a href="/api/#docs">API documentation</a> to get familiar with the endpoints.</p>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <div class="container">
            <div class="footer-links">
                <a href="/">MP3 to WAV Converter</a>
                <a href="/blog/">Blog</a>
                <a href="/faq/">FAQ</a>
                <a href="/about/">About</a>
                <a href="/api/">API</a>
                <a href="/privacy/">Privacy</a>
                <a href="/terms/">Terms</a>
            </div>
            <p>&copy; 2026 mp3towav.online — Free, private MP3 to WAV conversion.</p>
        </div>
    </footer>

    <script>
    const form = document.getElementById('keyRequestForm');
    const submitBtn = document.getElementById('submitBtn');
    const formState = document.getElementById('formState');
    const successState = document.getElementById('successState');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                formState.classList.add('hidden');
                successState.classList.remove('hidden');
                if (typeof plausible !== 'undefined') {
                    plausible('APIKeyRequest', { props: { plan: form.plan.value } });
                }
            } else {
                throw new Error('Form submission failed');
            }
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Request API Key';
            submitBtn.style.background = '#ef4444';
            submitBtn.textContent = 'Failed — try again';
            setTimeout(() => {
                submitBtn.style.background = '';
                submitBtn.textContent = 'Request API Key';
            }, 3000);
        }
    });
    </script>
</body>
</html>
```

### Step 2: Create get-key.css

Create `api/get-key/get-key.css`:

```css
/* ============================================
   API Key Request Page Styles
   Extends content.css
   ============================================ */

/* ---- Form ---- */
.form-group {
    margin-bottom: 1.5rem;
}

.form-group label {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    color: var(--text);
}

.form-group .optional {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.85rem;
}

.form-group input[type="email"],
.form-group textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    font-family: var(--font-main);
    font-size: 0.95rem;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input[type="email"]:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
}

.form-group input[type="email"]::placeholder,
.form-group textarea::placeholder {
    color: var(--text-muted);
}

.form-group textarea {
    resize: vertical;
    min-height: 80px;
}

/* ---- Plan Selection ---- */
.plan-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.plan-option {
    cursor: pointer;
    display: block;
}

.plan-option input[type="radio"] {
    display: none;
}

.plan-card {
    display: block;
    padding: 0.85rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.plan-option input[type="radio"]:checked + .plan-card {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary), 0 0 12px rgba(249, 115, 22, 0.1);
}

.plan-card:hover {
    border-color: var(--border-hover);
}

.plan-option input[type="radio"]:checked + .plan-card:hover {
    border-color: var(--primary);
}

.plan-card strong {
    display: block;
    font-size: 0.95rem;
    color: var(--text);
    margin-bottom: 0.15rem;
}

.plan-card span {
    font-size: 0.8rem;
    color: var(--text-muted);
}

/* ---- Submit Button ---- */
.form-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.85rem 2.5rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-family: var(--font-main);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
    width: 100%;
    max-width: 320px;
}

.form-submit:hover {
    background: #ea6a0e;
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(249, 115, 22, 0.25);
}

.form-submit:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
}

.form-note {
    margin-top: 1rem;
    font-size: 0.8rem;
    color: var(--text-muted);
}

.form-note a {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 3px;
}

/* ---- Success State ---- */
.success-card {
    text-align: center;
    padding: 2rem 1rem;
}

.success-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #22c55e;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 700;
    margin: 0 auto 1.5rem;
}

.success-card h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
}

.success-card p {
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
}

.success-card a {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 3px;
}

/* ---- Utility ---- */
.hidden {
    display: none !important;
}
```

### Step 3: Update the CTA on the API page

In `api/index.html`, change the CTA box (lines 297-301) from:

```html
                <div class="cta-box" id="get-started">
                    <h3>Get your API key</h3>
                    <p>Start with 500 free conversions per month. No credit card required.</p>
                    <a href="mailto:api@mp3towav.online?subject=API%20Key%20Request" class="cta-btn">Request API Key</a>
                </div>
```

to:

```html
                <div class="cta-box" id="get-started">
                    <h3>Get your API key</h3>
                    <p>Start with 500 free conversions per month. No credit card required.</p>
                    <a href="/api/get-key/" class="cta-btn">Request API Key</a>
                </div>
```

### Step 4: Verify

- [ ] Visit `/api/get-key/` — form loads with email, plan selector, use case fields
- [ ] Plan cards highlight orange when selected (Free selected by default)
- [ ] Email field validates (type=email)
- [ ] Submit button shows "Sending..." state when clicked
- [ ] After submit, success state shows (green checkmark + message)
- [ ] API page CTA now links to `/api/get-key/` instead of mailto:
- [ ] Nav/footer links work on the new page
- [ ] No console errors

### Step 5: Commit

```bash
git add api/get-key/index.html api/get-key/get-key.css api/index.html
git commit -m "feat: add API key request page, replace mailto CTA"
```

---

## Task 4: Newsletter Signup

**Files:**
- Modify: `index.html:239` (add newsletter section after `</main>`, before SEO content)
- Modify: `style.css:725` (add newsletter styles before SEO content section)

### Step 1: Add newsletter section HTML in index.html

After the closing `</main>` tag (line 239) and before the SEO Content section (line 241), add:

```html
    <!-- Newsletter Signup -->
    <section class="newsletter-section" id="newsletter">
        <div class="container">
            <h2 class="newsletter-title">Stay Updated</h2>
            <p class="newsletter-text">Get notified about new features and audio conversion tips. No spam, unsubscribe anytime.</p>
            <form class="newsletter-form" action="https://buttondown.com/api/emails/newsletter-subscribe" method="post" target="_blank">
                <input type="email" name="email" class="newsletter-input" placeholder="your@email.com" required aria-label="Email address">
                <button type="submit" class="newsletter-btn">Subscribe</button>
            </form>
        </div>
    </section>

```

### Step 2: Add newsletter CSS in style.css

In `style.css`, before the SEO Content section comment (line 725), add:

```css
/* ---- Newsletter Signup ---- */
.newsletter-section {
    padding: 3rem 0;
    text-align: center;
    border-top: 1px solid var(--border);
}

.newsletter-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
}

.newsletter-text {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 1.25rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
}

.newsletter-form {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    max-width: 420px;
    margin: 0 auto;
}

.newsletter-input {
    flex: 1;
    padding: 0.7rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-main);
    font-size: 0.9rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    min-width: 0;
}

.newsletter-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-glow);
}

.newsletter-input::placeholder {
    color: var(--text-muted);
}

.newsletter-btn {
    padding: 0.7rem 1.5rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    font-family: var(--font-main);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
    white-space: nowrap;
}

.newsletter-btn:hover {
    background: var(--primary-hover);
    transform: translateY(-1px);
}

@media (max-width: 640px) {
    .newsletter-form {
        flex-direction: column;
    }

    .newsletter-btn {
        width: 100%;
    }
}

```

### Step 3: Add newsletter link to footer

In `index.html`, in the footer links (after line 380, the Terms link), add:

```html
                <a href="#newsletter">Subscribe</a>
```

### Step 4: Verify

- [ ] Newsletter section appears between converter and SEO content
- [ ] Email input + Subscribe button render inline on desktop
- [ ] On mobile (< 640px), form stacks vertically
- [ ] Input focus shows orange glow
- [ ] Subscribe button hover effect works
- [ ] Footer "Subscribe" link scrolls to newsletter section
- [ ] No console errors

### Step 5: Commit

```bash
git add index.html style.css
git commit -m "feat: add newsletter signup section to homepage"
```

---

## Task 5: Conversion Counter

**Files:**
- Modify: `index.html:234` (add counter badge between bit-depth selector and trust line)
- Modify: `style.css` (add counter styles after bit-depth selector styles, around line 546)
- Modify: `app.js:380` (increment after single conversion), `app.js:512` (increment after batch)

### Step 1: Add counter HTML in index.html

Between the bit-depth selector closing `</div>` (line 234) and the trust line `<p class="trust-line">` (line 235), add:

```html
                <p class="conversion-counter hidden" id="conversionCounter"></p>
```

### Step 2: Add counter CSS in style.css

After the bit-depth selector styles (after line 545, before the Audio Preview Button section), add:

```css
/* ---- Conversion Counter ---- */
.conversion-counter {
    text-align: center;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.75rem;
    font-family: var(--font-mono);
    letter-spacing: 0.01em;
}
```

### Step 3: Add counter logic in app.js

Add DOM ref after the `previewBtn` ref (line 45):

```js
const conversionCounter = document.getElementById('conversionCounter');
```

Add a counter update function after the `trackEvent` helper (which we added in Task 1):

```js
function updateConversionCounter(count) {
    const total = parseInt(localStorage.getItem('mp3towav_conversions') || '0', 10) + count;
    localStorage.setItem('mp3towav_conversions', String(total));
    conversionCounter.textContent = '\u2713 ' + total.toLocaleString() + ' file' + (total === 1 ? '' : 's') + ' converted on this device';
    conversionCounter.classList.remove('hidden');
}
```

Initialize on page load — add to the end of the file (after the `beforeunload` handler, line 607):

```js
// --- Initialize conversion counter display ---
(function() {
    const count = parseInt(localStorage.getItem('mp3towav_conversions') || '0', 10);
    if (count > 0) {
        conversionCounter.textContent = '\u2713 ' + count.toLocaleString() + ' file' + (count === 1 ? '' : 's') + ' converted on this device';
        conversionCounter.classList.remove('hidden');
    }
})();
```

### Step 4: Increment counter on conversion

In `convertFile()`, after the `trackEvent('Conversion', ...)` line we added in Task 1 (which is after `showPanel(dzDone);` at line 380), add:

```js
        updateConversionCounter(1);
```

In `handleBatch()`, after the `trackEvent('Conversion', ...)` line we added in Task 1 (which is after `isProcessing = false;` at line 512), add:

```js
    updateConversionCounter(successCount);
```

### Step 5: Verify

- [ ] Fresh visit (clear localStorage) — counter is hidden
- [ ] Convert one file — counter appears: "✓ 1 file converted on this device"
- [ ] Convert another — counter shows "✓ 2 files converted on this device"
- [ ] Batch convert 3 files — counter shows "✓ 5 files converted on this device"
- [ ] Reload page — counter persists with same count
- [ ] Counter uses monospace font, subtle muted color
- [ ] All existing functionality unchanged

### Step 6: Commit

```bash
git add app.js index.html style.css
git commit -m "feat: add conversion counter with localStorage persistence"
```

---

## Task 6: Sitemap Update & Final Verification

**Files:**
- Modify: `sitemap.xml`

### Step 1: Add new pages to sitemap

Add before the `</urlset>` closing tag (line 141):

```xml
  <url>
    <loc>https://mp3towav.online/api/get-key/</loc>
    <lastmod>2026-03-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
```

### Step 2: Verify all pages

- [ ] Homepage: converter works (single + batch), counter increments, newsletter section visible
- [ ] `/api/` — Stripe buttons render, no Gumroad, CTA links to `/api/get-key/`
- [ ] `/api/get-key/` — Form works, plan selection works, success state shows
- [ ] All other pages (blog, FAQ, about, alternatives) still load correctly
- [ ] No console errors on any page
- [ ] Sitemap is valid XML

### Step 3: Commit

```bash
git add sitemap.xml
git commit -m "chore: add API key request page to sitemap"
```

### Step 4: Push

```bash
git push origin master
```
