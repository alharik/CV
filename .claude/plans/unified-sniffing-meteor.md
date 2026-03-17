# Plan: Build LetsWorkTogether Component

## Context
The LetsWorkTogether component was built in a previous session but never committed. It needs to be rebuilt from scratch as a replacement for the existing Contact section, implementing all 9 interactive requirements specified by the user.

This is an interactive CTA section with a 3-state machine (default → hover → click → success) that reveals a WhatsApp contact button with choreographed CSS transitions.

## Files to Create/Modify

### 1. Create `src/components/LetsWorkTogether.astro`
A self-contained Astro component with inline `<script>` and `<style>` blocks.

**Structure (two layers in the DOM simultaneously):**
```
<section id="contact">
  <div class="cta-container" (relative, overflow hidden)>
    <!-- DEFAULT STATE (visible by default) -->
    <div class="cta-default">
      <div class="line-left" />
      <div class="cta-content">
        <span>"Let's Work"</span>
        <span class="together">"together"</span>  ← var(--text-secondary)
        <ArrowUpRight icon (SVG)>
        <div class="circle-border" />
      </div>
      <div class="line-right" />
    </div>

    <!-- SUCCESS STATE (position: absolute, on top, opacity 0 by default) -->
    <div class="cta-success" (position: absolute, inset: 0)>
      <span class="success-label">Perfect</span>         ← 100ms delay
      <h3 class="success-heading">Let's talk</h3>        ← 200ms delay
      <a class="whatsapp-btn" href="https://wa.me/971544117716">
        <WhatsApp SVG icon>
        <span>WhatsApp</span>
        <ArrowRight SVG>
      </a>                                                 ← 150ms delay (NOTE: between heading and subtext)
      <p class="success-subtext">tap to open chat</p>    ← 450ms delay
    </div>
  </div>
</section>
```

**State machine (3 booleans, managed via `<script>`):**
- `isHovered` — toggled on mouseenter/mouseleave
- `isClicked` — set true on click
- `showSuccess` — set true via `setTimeout(500)` after isClicked

Classes applied to `.cta-container`: `.is-hovered`, `.is-clicked`, `.show-success`

**Transition specs (all CSS, no GSAP needed for this component):**

| Element | Default | Hover | Click |
|---------|---------|-------|-------|
| Lines | scaleX(1), opacity 0.5 | scaleX(1.5), opacity 1 | scaleX(0) + translateX(±20px), opacity 0 |
| Arrow icon | normal position | (no change) | translate(100px, -100px) scale(0.5) — flies off dramatically |
| Circle border | scale(1), opacity 1 | (no change) | scale(3), opacity 0 — 700ms duration (longer) |
| Success overlay | opacity 0, translateY(20px) | — | opacity 1, translateY(0) with staggered delays |

**Success state staggered delays:**
- "Perfect" label: `transition-delay: 100ms`
- "Let's talk" heading: `transition-delay: 200ms`
- WhatsApp button: `transition-delay: 150ms`
- Subtext: `transition-delay: 450ms`

**WhatsApp button hover:** All 3 child elements (icon, text, arrow) simultaneously switch from `var(--text-primary)` to `var(--bg-base)` via a single parent hover rule.

**@keyframes ping:** Manually defined in the `<style>` block for the pulsing green dot on the WhatsApp button:
```css
@keyframes ping {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}
```

**"together" text color:** Uses `var(--text-secondary)` (not `--text-primary`).

### 2. Modify `src/pages/index.astro`
- Replace `Contact` import with `LetsWorkTogether`
- Replace `<Contact />` with `<LetsWorkTogether />`

### 3. Modify `src/scripts/animations.ts`
- Change `#contact` section reveal reference to work with the new component structure (uses `data-reveal` attributes on the container, which GSAP animates on scroll — the internal state machine transitions are pure CSS)

### 4. Modify `src/styles/global.css`
- No changes needed — `@keyframes ping` goes in the component's scoped `<style>` block

## Design Decisions
- **Pure CSS transitions** for the state machine (not GSAP) — the hover/click/success states are interactive and need instant response. GSAP is only for the scroll-triggered entrance reveal.
- **Both default and success states exist in DOM simultaneously** — they transition via opacity/transform, never via DOM insertion/removal.
- **WhatsApp link:** `https://wa.me/971544117716` (derived from the existing phone number in Contact.astro)
- **SVG icons inline** — ArrowUpRight, WhatsApp logo, ArrowRight are inline SVGs to avoid external dependencies.

## Verification
1. `npm install` (node_modules missing in worktree)
2. `npm run dev` — start Astro dev server
3. Check: section renders with "Let's Work together" text, lines on sides
4. Hover: lines extend to scaleX(1.5), opacity goes to 1
5. Click: arrow flies off (100px, -100px), circle scales to 3x and fades (700ms), lines collapse with translateX
6. After 500ms: success overlay fades in with staggered delays
7. WhatsApp button hover: all 3 elements invert colors simultaneously
8. Green dot pulses via @keyframes ping
9. Check prefers-reduced-motion: all transitions should be disabled
