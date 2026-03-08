\# PROJECT: mp3towav.online — MP3 to WAV Converter



\## OVERVIEW

Build a production-ready, client-side MP3 to WAV converter.

100% in-browser using FFmpeg.wasm — no file ever leaves the user's device.

Hosted on Vercel. Monetized via Google AdSense.



---



\## TECH STACK

\- HTML5 + CSS3 + Vanilla JavaScript (no frameworks)

\- FFmpeg.wasm v0.12.x (client-side audio processing)

\- Google Fonts of your choice — pick something bold and memorable

\- Vercel (hosting)



---



\## PROJECT STRUCTURE

mp3towav.online/

├── index.html

├── style.css

├── app.js

├── public/

│   └── favicon.svg

├── sitemap.xml

├── robots.txt

└── vercel.json



---



\## VERCEL CONFIG — REQUIRED

vercel.json must include these exact headers or FFmpeg.wasm won't work:

\- Cross-Origin-Opener-Policy: same-origin

\- Cross-Origin-Embedder-Policy: require-corp



---



\## FUNCTIONAL REQUIREMENTS



\### Core Feature

\- User drops or selects an MP3 file

\- File is converted to WAV entirely in the browser

\- User downloads the converted WAV file

\- Nothing is ever sent to any server



\### FFmpeg.wasm Loading

\- Load lazily — only when user interacts

\- Show loading state on first visit

\- Use CDN links for ffmpeg.wasm and ffmpeg-core.wasm



\### Conversion

\- Input: MP3 only

\- Output: WAV (pcm\_s16le codec)

\- Max file size: 100MB

\- Show real-time progress during conversion

\- Auto-download after conversion completes

\- Show before/after file size comparison



\### Error Handling

\- Wrong file type: friendly message

\- File too large: friendly message  

\- Conversion failure: friendly message with retry option

\- "Convert another file" reset button



\### UX Flow

1\. Land on page → see drop zone immediately

2\. Drop/select MP3 → FFmpeg loads (if first time)

3\. Conversion runs → progress shown

4\. Done → download triggered automatically

5\. Option to convert another file



---



\## DESIGN DIRECTION

Be bold. Be creative. Make it unforgettable.



The tool is about speed, power, and privacy.

The user is a music producer, podcaster, or audio engineer.

They care about: fast, clean, trustworthy.



Design completely from your own creative vision:

\- Choose your own color palette (dark theme preferred)

\- Choose your own typography — make it distinctive

\- Design the drop zone to be the hero of the page

\- Add motion and micro-interactions that feel satisfying

\- The conversion progress should feel visceral and fast

\- One thing the user must remember after leaving the site



Do NOT use generic AI aesthetics.

Do NOT use purple gradients on white.

Do NOT use Inter or Roboto.



---



\## SEO REQUIREMENTS



\### Meta Tags

\- Title: "MP3 to WAV Converter — Free, Instant \& Private | mp3towav.online"

\- Description: "Convert MP3 to WAV free online in seconds. 100% in your browser — your files never leave your device. No signup, no limits."

\- og:title, og:description, og:image

\- Canonical URL



\### Schema Markup

\- WebApplication schema on the page



\### FAQ Section (below the fold — for SEO only)

Include these questions as real HTML with FAQ schema:

1\. Is this MP3 to WAV converter free?

2\. Is my file safe? Does it get uploaded to a server?

3\. Why convert MP3 to WAV?

4\. Is there a file size limit?

5\. How long does conversion take?

6\. Does it work on mobile?



---



\## PERFORMANCE REQUIREMENTS

\- Page loads under 1.5s before FFmpeg initializes

\- FFmpeg loads only on user interaction

\- Mobile responsive — works perfectly on phones

\- Core Web Vitals optimized



---



\## FUTURE ADSENSE PLACEMENT (add placeholder divs now)

\- One ad slot below the converter

\- One ad slot above the FAQ section

\- Label them with comments: <!-- AdSense slot -->

\- Do NOT style them yet



---



\## DEPLOY INSTRUCTIONS

Static site — no build step needed.

Push to GitHub → connect to Vercel → add domain mp3towav.online.



---



\## sitemap.xml

Single URL: https://mp3towav.online/

changefreq: monthly, priority: 1.0



\## robots.txt

Allow all, point to sitemap.

