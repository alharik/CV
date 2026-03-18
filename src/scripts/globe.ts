// Interactive 3D Globe — Canvas 2D renderer
// Tech Stack skills as markers on a rotating sphere.
// Mobile-optimized: scroll passthrough, adaptive dot count, label scaling.

interface Marker {
  lat: number;
  lng: number;
  label?: string;
}

interface Connection {
  from: [number, number];
  to: [number, number];
}

// ── Tech Stack markers ──

const TECH_MARKERS: Marker[] = [
  // Content Production (northern latitudes)
  { lat: 62, lng: -120, label: "CapCut" },
  { lat: 52, lng: -70, label: "Captions App" },
  { lat: 58, lng: 15, label: "iPhone Filming" },
  { lat: 45, lng: 55, label: "Gimbal Operation" },
  { lat: 64, lng: 100, label: "Scripting" },
  { lat: 50, lng: 150, label: "On-Camera Presenting" },

  // Platforms & Strategy (tropical band)
  { lat: 28, lng: -145, label: "TikTok" },
  { lat: 22, lng: -55, label: "Instagram Reels" },
  { lat: 15, lng: -5, label: "YouTube Shorts" },
  { lat: 32, lng: 75, label: "Algorithm Research" },
  { lat: 12, lng: 125, label: "Hashtag Strategy" },
  { lat: 35, lng: 170, label: "SEO" },

  // Music & Audio (equatorial band)
  { lat: -3, lng: -100, label: "FL Studio" },
  { lat: -14, lng: -35, label: "SM7B" },
  { lat: -8, lng: 35, label: "Audient iD4" },
  { lat: -18, lng: 105, label: "Original Soundtracks" },
  { lat: 2, lng: 165, label: "DistroKid" },

  // Development & Tools (southern latitudes)
  { lat: -33, lng: -140, label: "TypeScript" },
  { lat: -40, lng: -65, label: "Astro" },
  { lat: -28, lng: -15, label: "Tailwind CSS" },
  { lat: -45, lng: 45, label: "Rust" },
  { lat: -50, lng: 95, label: "WebAssembly" },
  { lat: -55, lng: 135, label: "Vercel" },
  { lat: -60, lng: -170, label: "Cloudflare" },
  { lat: -38, lng: 175, label: "Git" },
];

// ── Connections ──

const TECH_CONNECTIONS: Connection[] = [
  { from: [-33, -140], to: [-40, -65] },
  { from: [-40, -65], to: [-28, -15] },
  { from: [-33, -140], to: [-45, 45] },
  { from: [-45, 45], to: [-50, 95] },
  { from: [-55, 135], to: [-40, -65] },
  { from: [-55, 135], to: [-60, -170] },
  { from: [-38, 175], to: [-33, -140] },
  { from: [-3, -100], to: [-18, 105] },
  { from: [-3, -100], to: [2, 165] },
  { from: [-14, -35], to: [-8, 35] },
  { from: [28, -145], to: [22, -55] },
  { from: [28, -145], to: [15, -5] },
  { from: [32, 75], to: [12, 125] },
  { from: [35, 170], to: [32, 75] },
  { from: [62, -120], to: [52, -70] },
  { from: [62, -120], to: [28, -145] },
  { from: [64, 100], to: [50, 150] },
  { from: [58, 15], to: [45, 55] },
];

// ── Math ──

function latLngToXYZ(lat: number, lng: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

function rotY(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotX(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function proj(x: number, y: number, z: number, cx: number, cy: number, fov: number): [number, number] {
  const s = fov / (fov + z);
  return [x * s + cx, y * s + cy];
}

// ── Fibonacci sphere ──

function makeDots(n: number): [number, number, number][] {
  const d: [number, number, number][] = [];
  const gr = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / gr;
    const p = Math.acos(1 - (2 * (i + 0.5)) / n);
    d.push([Math.cos(t) * Math.sin(p), Math.cos(p), Math.sin(t) * Math.sin(p)]);
  }
  return d;
}

// ── Init ──

export function initGlobe(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Physics
  let rY = 0.4;
  let rX = 0.3;
  let vY = 0;
  let vX = 0;
  let time = 0;
  let animId = 0;

  // Drag
  let dragging = false;
  let gestureDecided = false;   // have we decided scroll vs rotate?
  let gestureIsRotate = false;  // true = rotating globe, false = scrolling page
  let dOriginX = 0;
  let dOriginY = 0;
  let dRotY0 = 0;
  let dRotX0 = 0;
  let prevX = 0;
  let prevY = 0;

  // Tuning
  const SENS = 0.005;
  const FRICTION = 0.95;
  const EWMA = 0.3;
  const GESTURE_THRESHOLD = 8; // px before deciding scroll vs rotate

  // Adaptive dot count: fewer on small screens for perf
  let lastW = 0;
  let dots = makeDots(1200);

  // Track canvas size to avoid re-allocating every frame
  let bufW = 0;
  let bufH = 0;

  function draw() {
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Resize backing store only when dimensions change
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (bufW !== targetW || bufH !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      bufW = targetW;
      bufH = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rebuild dots if screen size category changed
    if (w !== lastW) {
      const count = w < 400 ? 600 : w < 600 ? 900 : 1200;
      if (dots.length !== count) dots = makeDots(count);
      lastW = w;
    }

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;
    const fov = radius * 2.63;
    const isSmall = w < 400;

    // Physics tick
    if (!dragging) {
      if (Math.abs(vY) > 0.0001 || Math.abs(vX) > 0.0001) {
        rY += vY;
        rX += vX;
        rX = Math.max(-1, Math.min(1, rX));
        vY *= FRICTION;
        vX *= FRICTION;
        if (Math.abs(vY) < 0.0001) vY = 0;
        if (Math.abs(vX) < 0.0001) vX = 0;
      } else {
        rY += 0.002;
      }
    }

    time += 0.015;
    ctx.clearRect(0, 0, w, h);

    // Globe ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const ry = rY;
    const rx = rX;

    // ── Fibonacci dots ──
    for (let i = 0; i < dots.length; i++) {
      let [x, y, z] = dots[i];
      x *= radius; y *= radius; z *= radius;
      [x, y, z] = rotX(x, y, z, rx);
      [x, y, z] = rotY(x, y, z, ry);
      if (z > 0) continue;

      const [sx, sy] = proj(x, y, z, cx, cy, fov);
      const a = Math.max(0.1, 1 - (z + radius) / (2 * radius));
      const sz = 1 + a * 0.8;

      ctx.beginPath();
      ctx.arc(sx, sy, sz, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239,68,68,${a.toFixed(2)})`;
      ctx.fill();
    }

    // ── Arcs ──
    for (const conn of TECH_CONNECTIONS) {
      const [la1, ln1] = conn.from;
      const [la2, ln2] = conn.to;

      let [x1, y1, z1] = latLngToXYZ(la1, ln1, radius);
      let [x2, y2, z2] = latLngToXYZ(la2, ln2, radius);
      [x1, y1, z1] = rotX(x1, y1, z1, rx);
      [x1, y1, z1] = rotY(x1, y1, z1, ry);
      [x2, y2, z2] = rotX(x2, y2, z2, rx);
      [x2, y2, z2] = rotY(x2, y2, z2, ry);

      if (z1 > radius * 0.3 && z2 > radius * 0.3) continue;

      const [sx1, sy1] = proj(x1, y1, z1, cx, cy, fov);
      const [sx2, sy2] = proj(x2, y2, z2, cx, cy, fov);

      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mz = (z1 + z2) / 2;
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      const ah = radius * 1.25;
      const [cpx, cpy] = proj(mx / ml * ah, my / ml * ah, mz / ml * ah, cx, cy, fov);

      const avgZ = (z1 + z2) / 2;
      const arcA = Math.max(0.06, Math.min(0.5, 0.5 * (1 - avgZ / radius)));

      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.quadraticCurveTo(cpx, cpy, sx2, sy2);
      ctx.strokeStyle = `rgba(239,68,68,${arcA.toFixed(2)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Traveling dot
      const t = (Math.sin(time * 1.2 + la1 * 0.1) + 1) / 2;
      const tx = (1 - t) * (1 - t) * sx1 + 2 * (1 - t) * t * cpx + t * t * sx2;
      const ty = (1 - t) * (1 - t) * sy1 + 2 * (1 - t) * t * cpy + t * t * sy2;

      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,140,120,${Math.min(1, arcA + 0.3).toFixed(2)})`;
      ctx.fill();
    }

    // ── Markers (depth-sorted) ──
    const vis: { m: Marker; sx: number; sy: number; z: number }[] = [];

    for (const m of TECH_MARKERS) {
      let [x, y, z] = latLngToXYZ(m.lat, m.lng, radius);
      [x, y, z] = rotX(x, y, z, rx);
      [x, y, z] = rotY(x, y, z, ry);
      if (z > radius * 0.1) continue;

      const [sx, sy] = proj(x, y, z, cx, cy, fov);
      vis.push({ m, sx, sy, z });
    }

    vis.sort((a, b) => b.z - a.z);

    // Label font size scales with globe radius
    const baseFontSize = Math.max(8, Math.min(13, radius * 0.043));

    for (const { m, sx, sy, z } of vis) {
      const depth = Math.max(0.1, 1 - (z + radius) / (2 * radius));

      // Pulse ring
      const pulse = Math.sin(time * 2 + m.lat) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239,68,68,${(0.2 + pulse * 0.15).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Core dot
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,140,120,${depth.toFixed(2)})`;
      ctx.fill();

      // Label
      if (m.label) {
        const fs = Math.round(baseFontSize + depth * 1.5);
        ctx.font = `600 ${fs}px "Satoshi",system-ui,sans-serif`;
        ctx.fillStyle = `rgba(241,241,243,${Math.max(0.25, depth * 0.9).toFixed(2)})`;

        // Truncate long labels on small screens
        let label = m.label;
        if (isSmall && label.length > 12) label = label.slice(0, 11) + "…";

        ctx.fillText(label, sx + 7, sy + 3);
      }
    }

    if (!prefersReduced) {
      animId = requestAnimationFrame(draw);
    }
  }

  // ── Pointer handlers with scroll passthrough ──

  function onDown(e: PointerEvent) {
    dragging = true;
    gestureDecided = false;
    gestureIsRotate = false;
    vY = 0;
    vX = 0;
    dOriginX = e.clientX;
    dOriginY = e.clientY;
    dRotY0 = rY;
    dRotX0 = rX;
    prevX = e.clientX;
    prevY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return;

    const dx = e.clientX - dOriginX;
    const dy = e.clientY - dOriginY;

    // Gesture detection: wait until the user moves beyond threshold
    if (!gestureDecided) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < GESTURE_THRESHOLD) return; // too small to decide

      // If primarily vertical → let the browser scroll the page
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
        gestureDecided = true;
        gestureIsRotate = false;
        dragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }

      // Horizontal or diagonal → rotate the globe
      gestureDecided = true;
      gestureIsRotate = true;
    }

    if (!gestureIsRotate) return;

    // Rotate
    rY = dRotY0 - dx * SENS;
    rX = Math.max(-1, Math.min(1, dRotX0 + dy * SENS));

    // EWMA velocity
    const ivY = -(e.clientX - prevX) * SENS;
    const ivX = (e.clientY - prevY) * SENS;
    vY = vY * (1 - EWMA) + ivY * EWMA;
    vX = vX * (1 - EWMA) + ivX * EWMA;

    prevX = e.clientX;
    prevY = e.clientY;
  }

  function onUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    // Clamp momentum
    vY = Math.max(-0.06, Math.min(0.06, vY));
    vX = Math.max(-0.03, Math.min(0.03, vX));
    if (Math.abs(vY) < 0.001 && Math.abs(vX) < 0.001) {
      vY = 0;
      vX = 0;
    }
  }

  function onCancel(e: PointerEvent) {
    // Pointer stolen by browser (scroll takeover, OS gesture, etc.)
    dragging = false;
    gestureDecided = false;
    vY = 0;
    vX = 0;
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);

  animId = requestAnimationFrame(draw);
  if (prefersReduced) draw();

  return () => {
    cancelAnimationFrame(animId);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onCancel);
  };
}
