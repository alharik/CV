# Project: Personal Portfolio — 7EREK

## Tech Stack
- Astro 6 + TypeScript
- Tailwind CSS v4
- GSAP + ScrollTrigger (animations)

## Design Constraints (STRICT)
- Dark theme ONLY. Base bg: #08080D
- ONE accent color: #C9A96E (champagne gold) — used sparingly
- iOS-style frosted glass on all interactive surfaces (3 tiers: subtle, base, dense)
- Whitespace: generous. Sections padded 160px+ vertically
- Typography: Space Grotesk (headings) + Inter (body) + JetBrains Mono (code)
- NO gradients (except subtle gold glow blobs)
- NO box shadows (except inset glass reflections)
- NO border-radius above 12px
- NO progress bars for skills
- NO generic AI aesthetic (no purple-pink gradients, 
  no floating 3D objects)

## Glass Effect Tiers (iOS-style)

### Tier 1: Subtle (navbar, badges)
background: rgba(16, 16, 22, 0.45)
backdrop-filter: blur(60px) saturate(180%) brightness(1.03)
border: 0.5px solid rgba(255, 255, 255, 0.05)
box-shadow: inset 0 0.5px 0 0 rgba(255, 255, 255, 0.05)

### Tier 2: Base (cards, containers)
background: rgba(16, 16, 22, 0.55)
backdrop-filter: blur(60px) saturate(180%) brightness(1.03)
border: 0.5px solid rgba(255, 255, 255, 0.06)
box-shadow: inset 0 0.5px 0 0 rgba(255, 255, 255, 0.06)
noise: SVG fractalNoise overlay at 2.5% opacity, mix-blend-mode: overlay

### Tier 3: Dense (lightbox, overlays)
background: rgba(16, 16, 22, 0.65)
backdrop-filter: blur(60px) saturate(180%) brightness(1.03)
border: 0.5px solid rgba(255, 255, 255, 0.08)
box-shadow: inset 0 0.5px 0 0 rgba(255, 255, 255, 0.07)
noise: SVG fractalNoise overlay at 2.5% opacity, mix-blend-mode: overlay

## Color Tokens
- --bg-base: #08080D
- --bg-surface: #111118
- --accent: #C9A96E
- --accent-light: #D4B97A
- --accent-glow: rgba(201, 169, 110, 0.10)
- --accent-muted: rgba(201, 169, 110, 0.35)
- --text-primary: #EBEBED
- --text-secondary: #787D86 (mapped as --color-text-muted in Tailwind @theme)

## Typography
- Headings: Space Grotesk, weights 500-600
- Body: Inter, weight 400, line-height 1.8
- Code/Accent: JetBrains Mono, weight 400-500
- Hero size: clamp(3rem, 8vw, 5.5rem)
- Section heading: 2.25rem, weight 500, tracking -0.02em
- Body: 1.0625rem (17px)
- Uppercase labels: 11px, weight 500, tracking 0.15em

## Animation Rules
- GSAP + ScrollTrigger only
- Default reveal: y: 40, opacity: 0, duration: 1.0
- Stagger: 0.12s between siblings
- Ease: power3.out (GSAP), cubic-bezier(0.22, 0.61, 0.36, 1) (CSS)
- Transition baseline: 400-500ms (luxury pace)
- Respect prefers-reduced-motion: disable all

## Performance Targets
- Lighthouse: 95+ all categories
- First Contentful Paint: < 1s
- Zero layout shift
- Total page weight: < 500KB excluding fonts

## Code Style
- Components: one per file, descriptive names
- Data: separate .ts files (skills.ts, work.ts)
- No inline styles (except transition-timing-function for --ease-luxury)
- Semantic HTML (nav, main, section, article, footer)

## Fonts
- Self-hosted ONLY — no Google Fonts CDN, no external requests
- Download woff2 variable files to public/fonts/
- Preload in <head> with font-display: swap
- Font files: space-grotesk-variable.woff2, inter-variable.woff2, jetbrains-mono-variable.woff2
