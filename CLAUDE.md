# Project: Personal Portfolio — 7EREK

## Tech Stack
- Astro 6 + TypeScript
- Tailwind CSS v4
- GSAP + ScrollTrigger (animations)

## Design Constraints (STRICT)
- Dark theme ONLY. Base bg: #0A0A0F
- ONE accent color: #3B82F6 (blue) — used sparingly
- Blur/glass effect on navbar + select elements only
- Whitespace: generous. Sections padded 128px+ vertically
- Typography: Satoshi + JetBrains Mono only
- NO gradients (except subtle blue glow blobs)
- NO box shadows
- NO border-radius above 12px
- NO cards with visible borders (use bg opacity instead)
- NO progress bars for skills
- NO generic AI aesthetic (no purple-pink gradients, 
  no floating 3D objects, no glassmorphism on everything)

## Glass Effect Values
background: rgba(18, 18, 26, 0.6)
backdrop-filter: blur(20px)
border: 1px solid rgba(255, 255, 255, 0.05)

## Color Tokens
- --bg-base: #0A0A0F
- --bg-surface: #12121A
- --accent: #3B82F6
- --accent-glow: rgba(59, 130, 246, 0.15)
- --text-primary: #F1F1F3
- --text-secondary: #9CA3AF (mapped as --color-text-muted in Tailwind @theme)

## Typography
- Headings: Satoshi, weights 600-700
- Body: Satoshi, weight 400, line-height 1.7
- Code/Accent: JetBrains Mono, weight 400
- Hero size: clamp(3rem, 8vw, 6rem)
- Section heading: 2rem
- Body: 1.125rem

## Animation Rules
- GSAP + ScrollTrigger only
- Default reveal: y: 30, opacity: 0, duration: 0.8
- Stagger: 0.1s between siblings
- Respect prefers-reduced-motion: disable all

## Performance Targets
- Lighthouse: 95+ all categories
- First Contentful Paint: < 1s
- Zero layout shift
- Total page weight: < 500KB excluding fonts

## Code Style
- Components: one per file, descriptive names
- Data: separate .ts files (skills.ts, work.ts)
- No inline styles
- Semantic HTML (nav, main, section, article, footer)

## Fonts
- Self-hosted ONLY — no Google Fonts CDN, no external requests
- Download woff2 variable files to public/fonts/
- Preload in <head> with font-display: swap