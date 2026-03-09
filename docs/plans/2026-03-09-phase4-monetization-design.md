# Phase 4: Monetization & Growth — Design Document

**Date:** 2026-03-09
**Scope:** Plausible custom events, Stripe payment links, API key request page, newsletter signup, conversion counter

## Problem

mp3towav.online has zero conversion tracking (no idea how many files users convert), a broken API key request flow (mailto: link), Gumroad embeds that inject third-party scripts and logos, no email list for communicating with users, and no social proof. These gaps block monetization and growth.

## Design

### Approach

Practical monetization within the existing static site architecture. All 5 tasks are pure frontend code — no backend infrastructure, no databases, no user accounts. External services (Stripe, Buttondown, Formspree) are configured via placeholder URLs that can be swapped in after creating accounts. Same incremental vanilla JS/HTML/CSS approach used in Phases 1-3.

### 1. Plausible Custom Events (`app.js`)

Add conversion tracking so Plausible captures real usage data:

- `Conversion` event on successful conversion with properties:
  - `type`: `"single"` or `"batch"`
  - `bitDepth`: `"16"`, `"24"`, or `"32"`
  - `fileCount`: number of files (1 for single, N for batch)
- `Download` event on file download with properties:
  - `type`: `"wav"` or `"zip"`

Implementation: Call `window.plausible('Conversion', {props: {...}})` after successful conversion in `convertFile()` and at end of `handleBatch()`. Call `window.plausible('Download', {props: {...}})` in download button click handler and downloadAllBtn handler. Guard with `typeof plausible !== 'undefined'` check.

~15 lines of JS changes. No new files.

### 2. Stripe Payment Links (`api/index.html`, `api/api.css`)

Replace Gumroad with Stripe Payment Links:

- Remove `<script src="https://gumroad.com/js/gumroad.js"></script>` from `api/index.html`
- Remove `gumroad-button` class from the 3 paid tier buttons
- Replace Gumroad URLs with Stripe Payment Link placeholders:
  - Pro: `https://buy.stripe.com/STRIPE_PRO_LINK`
  - Business: `https://buy.stripe.com/STRIPE_BUSINESS_LINK`
  - Unlimited: `https://buy.stripe.com/STRIPE_UNLIMITED_LINK`
- Remove `.gumroad-button` CSS overrides from `api/api.css` (~25 lines)
- Add HTML comment with Stripe setup instructions
- Buttons become simple `<a>` tags with existing `pricing-btn pricing-btn-primary` classes (already styled)

### 3. API Key Request Page (`/api/get-key/index.html`)

Replace the mailto: link with a proper form page:

- New page at `/api/get-key/index.html`
- Reuse `content.css` for base styles, new `get-key.css` for form-specific styles
- Same nav/footer as all other pages
- Form fields:
  - Email address (required, type=email)
  - Plan selection (radio buttons: Free, Pro, Business, Unlimited)
  - Use case (textarea, optional — "What will you use the API for?")
  - Submit button
- Form `action` posts to configurable endpoint (default: Formspree placeholder)
- Two states:
  - Form state (default)
  - Success state ("Request received! We'll send your API key within 24 hours.")
- JavaScript: simple form validation + state toggle (inline `<script>`, no external JS)
- Schema.org: WebPage type
- Update CTA on `/api/index.html`: change `mailto:` link to `/api/get-key/` link
- Add to sitemap.xml

### 4. Newsletter Signup (`index.html`, `style.css`)

Add email capture to the homepage:

- New section between converter and footer:
  - Headline: "Stay Updated"
  - Subtext: "Get notified about new features and audio conversion tips. No spam, unsubscribe anytime."
  - Email input + Subscribe button (inline form)
  - Form `action` posts to configurable endpoint (default: Buttondown placeholder)
- Minimal footer link on all other pages: "Subscribe to updates" → links to `/#newsletter` anchor
- New CSS in `style.css`: `.newsletter-section`, `.newsletter-form`, `.newsletter-input`, `.newsletter-btn`
- Privacy-aligned: no cookies, no tracking, just email collection

### 5. Conversion Counter (`app.js`, `index.html`, `style.css`)

Add a per-device conversion counter for social proof:

- Track in `localStorage` key `mp3towav_conversions` (integer)
- Increment by 1 on single conversion, by N on batch conversion
- Display badge below the converter drop zone: "✓ X files converted on this device"
- Only show after first conversion (hidden when count is 0)
- Subtle styling: small text, muted color, builds confidence
- New HTML element in `index.html` (below drop zone, above bit-depth selector)
- New CSS in `style.css` for `.conversion-counter`
- JS: read/write localStorage in `convertFile()` and `handleBatch()`, update display

## Files Modified

| File | Change |
|------|--------|
| `app.js` | Plausible events (~15 lines), localStorage counter (~20 lines) |
| `index.html` | Newsletter section HTML, counter badge HTML |
| `style.css` | Newsletter section styles, counter badge styles |
| `api/index.html` | Remove Gumroad script, Stripe payment links, update CTA link |
| `api/api.css` | Remove Gumroad overrides (~25 lines removed) |
| `api/get-key/index.html` | **NEW** — API key request form page |
| `api/get-key/get-key.css` | **NEW** — Form page styles |
| `sitemap.xml` | Add `/api/get-key/` entry, update lastmod dates |
| `sw.js` | No changes needed (new page is network-first HTML) |

## Risk Assessment

- **Zero risk** to converter functionality — no changes to WASM, conversion logic, batch processing, audio preview, or PWA
- All changes are additive (new page, new events, new UI sections) or removal (Gumroad script)
- External service endpoints are placeholders until configured — site works fine without them (forms just won't submit)
- Gumroad → Stripe is URL-only — pricing card structure unchanged
- Easily reversible via git

## Verification

- Visit all new and modified pages in browser
- Verify Plausible events fire in browser console (check for `plausible` calls in Network tab)
- Test API key request form submission and success state
- Test newsletter form submission
- Verify conversion counter increments and persists across page reloads
- Confirm no console errors on any page
- Validate sitemap XML
- Check all nav/footer links work
