// Interactive 3D Globe — Canvas 2D renderer
// Tech Stack skills as markers on a rotating sphere.
// Physics ported faithfully from the original React canvas globe component,
// with momentum inertia added on top.

interface Marker {
  lat: number;
  lng: number;
  label?: string;
}

interface Connection {
  from: [number, number];
  to: [number, number];
}

// ── Tech Stack markers spread evenly across the globe ──

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

// ── Connections between related skills ──

const TECH_CONNECTIONS: Connection[] = [
  // Dev relationships
  { from: [-33, -140], to: [-40, -65] },     // TypeScript ↔ Astro
  { from: [-40, -65], to: [-28, -15] },      // Astro ↔ Tailwind CSS
  { from: [-33, -140], to: [-45, 45] },      // TypeScript ↔ Rust
  { from: [-45, 45], to: [-50, 95] },        // Rust ↔ WebAssembly
  { from: [-55, 135], to: [-40, -65] },      // Vercel ↔ Astro
  { from: [-55, 135], to: [-60, -170] },     // Vercel ↔ Cloudflare
  { from: [-38, 175], to: [-33, -140] },     // Git ↔ TypeScript

  // Music relationships
  { from: [-3, -100], to: [-18, 105] },      // FL Studio ↔ Original Soundtracks
  { from: [-3, -100], to: [2, 165] },        // FL Studio ↔ DistroKid
  { from: [-14, -35], to: [-8, 35] },        // SM7B ↔ Audient iD4

  // Platform relationships
  { from: [28, -145], to: [22, -55] },       // TikTok ↔ Instagram Reels
  { from: [28, -145], to: [15, -5] },        // TikTok ↔ YouTube Shorts
  { from: [32, 75], to: [12, 125] },         // Algorithm Research ↔ Hashtag Strategy
  { from: [35, 170], to: [32, 75] },         // SEO ↔ Algorithm Research

  // Content relationships
  { from: [62, -120], to: [52, -70] },       // CapCut ↔ Captions App
  { from: [62, -120], to: [28, -145] },      // CapCut ↔ TikTok
  { from: [64, 100], to: [50, 150] },        // Scripting ↔ On-Camera Presenting
  { from: [58, 15], to: [45, 55] },          // iPhone Filming ↔ Gimbal Operation
];

// ── Math (matches original exactly) ──

function latLngToXYZ(lat: number, lng: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

function rotateY(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateX(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function project(x: number, y: number, z: number, cx: number, cy: number, fov: number): [number, number] {
  const scale = fov / (fov + z);
  return [x * scale + cx, y * scale + cy];
}

// ── Fibonacci sphere ──

function generateDots(count: number): [number, number, number][] {
  const dots: [number, number, number][] = [];
  const gr = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / gr;
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    dots.push([
      Math.cos(theta) * Math.sin(phi),
      Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
    ]);
  }
  return dots;
}

// ── Init ──

export function initGlobe(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Physics state
  let rotYVal = 0.4;
  let rotXVal = 0.3;
  let velY = 0;
  let velX = 0;
  let time = 0;
  let animId = 0;

  // Drag
  let dragging = false;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let dragRotY0 = 0;
  let dragRotX0 = 0;
  let prevPtrX = 0;
  let prevPtrY = 0;
  let prevPtrT = 0;

  // Tuning
  const AUTO_SPEED = 0.002;
  const DRAG_SENS = 0.005;
  const FRICTION = 0.95;
  const VEL_FLOOR = 0.0001;
  const VEL_CAP_Y = 0.06;
  const VEL_CAP_X = 0.03;
  const EWMA = 0.3; // smoothing factor for velocity (0 = no update, 1 = instant)

  // Dots
  const dots = generateDots(1200);

  function draw() {
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Resize backing store (matches original pattern)
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;

    // FOV scales with radius to keep perspective ratio constant.
    // Original: fov=600, radius≈228 → ratio 2.63
    const fov = radius * 2.63;

    // ── Physics tick ──
    if (!dragging) {
      if (Math.abs(velY) > VEL_FLOOR || Math.abs(velX) > VEL_FLOOR) {
        rotYVal += velY;
        rotXVal += velX;
        rotXVal = Math.max(-1, Math.min(1, rotXVal));
        velY *= FRICTION;
        velX *= FRICTION;
        if (Math.abs(velY) < VEL_FLOOR) velY = 0;
        if (Math.abs(velX) < VEL_FLOOR) velX = 0;
      } else {
        rotYVal += AUTO_SPEED;
      }
    }

    time += 0.015;
    ctx.clearRect(0, 0, w, h);

    // ── Outer glow ──
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.5);
    glow.addColorStop(0, "rgba(239, 68, 68, 0.03)");
    glow.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // ── Globe ring ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const ry = rotYVal;
    const rx = rotXVal;

    // ── Fibonacci dots ──
    for (let i = 0; i < dots.length; i++) {
      let [x, y, z] = dots[i];
      x *= radius; y *= radius; z *= radius;
      [x, y, z] = rotateX(x, y, z, rx);
      [x, y, z] = rotateY(x, y, z, ry);

      if (z > 0) continue; // back-face cull (exact original threshold)

      const [sx, sy] = project(x, y, z, cx, cy, fov);
      const alpha = Math.max(0.1, 1 - (z + radius) / (2 * radius));
      const size = 1 + alpha * 0.8;

      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
      ctx.fill();
    }

    // ── Arc connections ──
    for (const conn of TECH_CONNECTIONS) {
      const [lat1, lng1] = conn.from;
      const [lat2, lng2] = conn.to;

      let [x1, y1, z1] = latLngToXYZ(lat1, lng1, radius);
      let [x2, y2, z2] = latLngToXYZ(lat2, lng2, radius);
      [x1, y1, z1] = rotateX(x1, y1, z1, rx);
      [x1, y1, z1] = rotateY(x1, y1, z1, ry);
      [x2, y2, z2] = rotateX(x2, y2, z2, rx);
      [x2, y2, z2] = rotateY(x2, y2, z2, ry);

      // Original threshold: skip if BOTH behind
      if (z1 > radius * 0.3 && z2 > radius * 0.3) continue;

      const [sx1, sy1] = project(x1, y1, z1, cx, cy, fov);
      const [sx2, sy2] = project(x2, y2, z2, cx, cy, fov);

      // Elevated midpoint (original: radius * 1.25)
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const mz = (z1 + z2) / 2;
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      const ah = radius * 1.25;
      const [cpx, cpy] = project(mx / ml * ah, my / ml * ah, mz / ml * ah, cx, cy, fov);

      // Depth-based alpha so arcs near the edge fade gracefully
      const avgZ = (z1 + z2) / 2;
      const arcA = Math.max(0.06, Math.min(0.5, 0.5 * (1 - avgZ / radius)));

      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.quadraticCurveTo(cpx, cpy, sx2, sy2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${arcA.toFixed(2)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Traveling dot along the bezier
      const t = (Math.sin(time * 1.2 + lat1 * 0.1) + 1) / 2;
      const tx = (1 - t) * (1 - t) * sx1 + 2 * (1 - t) * t * cpx + t * t * sx2;
      const ty = (1 - t) * (1 - t) * sy1 + 2 * (1 - t) * t * cpy + t * t * sy2;

      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 140, 120, ${Math.min(1, arcA + 0.3).toFixed(2)})`;
      ctx.fill();
    }

    // ── Skill markers (depth-sorted: back first, front last) ──
    const visible: { m: Marker; sx: number; sy: number; z: number }[] = [];

    for (const m of TECH_MARKERS) {
      let [x, y, z] = latLngToXYZ(m.lat, m.lng, radius);
      [x, y, z] = rotateX(x, y, z, rx);
      [x, y, z] = rotateY(x, y, z, ry);

      if (z > radius * 0.1) continue; // original cull threshold

      const [sx, sy] = project(x, y, z, cx, cy, fov);
      visible.push({ m, sx, sy, z });
    }

    visible.sort((a, b) => b.z - a.z); // back-to-front

    for (const { m, sx, sy, z } of visible) {
      const depth = Math.max(0.1, 1 - (z + radius) / (2 * radius)); // 0.1 at edge → 1.0 at front

      // Pulse ring (original: 4 + pulse*4)
      const pulse = Math.sin(time * 2 + m.lat) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${(0.2 + pulse * 0.15).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Core dot (original: constant 2.5)
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 140, 120, ${depth.toFixed(2)})`;
      ctx.fill();

      // Skill label — white, semibold, depth-faded
      if (m.label) {
        const fs = Math.round(11 + depth * 2); // 11px at edge, 13px at front
        ctx.font = `600 ${fs}px "Satoshi", system-ui, sans-serif`;
        ctx.fillStyle = `rgba(241, 241, 243, ${Math.max(0.25, depth * 0.9).toFixed(2)})`;
        ctx.fillText(m.label, sx + 8, sy + 3);
      }
    }

    if (!prefersReduced) {
      animId = requestAnimationFrame(draw);
    }
  }

  // ── Pointer handlers ──

  function onDown(e: PointerEvent) {
    dragging = true;
    velY = 0;
    velX = 0;
    dragOriginX = e.clientX;
    dragOriginY = e.clientY;
    dragRotY0 = rotYVal;
    dragRotX0 = rotXVal;
    prevPtrX = e.clientX;
    prevPtrY = e.clientY;
    prevPtrT = performance.now();
    canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return;

    // Rotation from total drag delta
    // Y-axis negated: drag right = surface moves right
    // X-axis positive: drag down = surface moves down
    const dx = e.clientX - dragOriginX;
    const dy = e.clientY - dragOriginY;
    rotYVal = dragRotY0 - dx * DRAG_SENS;
    rotXVal = Math.max(-1, Math.min(1, dragRotX0 + dy * DRAG_SENS));

    // Smooth velocity tracking (EWMA) for momentum on release
    const instantVY = -(e.clientX - prevPtrX) * DRAG_SENS;
    const instantVX = (e.clientY - prevPtrY) * DRAG_SENS;
    velY = velY * (1 - EWMA) + instantVY * EWMA;
    velX = velX * (1 - EWMA) + instantVX * EWMA;

    prevPtrX = e.clientX;
    prevPtrY = e.clientY;
    prevPtrT = performance.now();
  }

  function onUp() {
    dragging = false;
    // Clamp so it can't fly off
    velY = Math.max(-VEL_CAP_Y, Math.min(VEL_CAP_Y, velY));
    velX = Math.max(-VEL_CAP_X, Math.min(VEL_CAP_X, velX));
    // Kill tiny residual velocity from slow releases
    if (Math.abs(velY) < 0.001 && Math.abs(velX) < 0.001) {
      velY = 0;
      velX = 0;
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);

  animId = requestAnimationFrame(draw);
  if (prefersReduced) draw();

  return () => {
    cancelAnimationFrame(animId);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
  };
}
