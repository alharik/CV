// Interactive 3D Globe — Canvas 2D renderer
// Tech Stack skills as markers on a rotating sphere with physics-based interaction.

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
  // Content Production (northern latitudes, spread across longitudes)
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
  { from: [-33, -140], to: [-40, -65] },    // TypeScript ↔ Astro
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

// ── Math helpers ──

function latLngToXYZ(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function rotateY(x: number, y: number, z: number, angle: number): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function rotateX(x: number, y: number, z: number, angle: number): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x, y * cos - z * sin, y * sin + z * cos];
}

function project(x: number, y: number, z: number, cx: number, cy: number, fov: number): [number, number] {
  const scale = fov / (fov + z);
  return [x * scale + cx, y * scale + cy];
}

// ── Fibonacci sphere dot generation ──

function generateDots(count: number): [number, number, number][] {
  const dots: [number, number, number][] = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / goldenRatio;
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    dots.push([
      Math.cos(theta) * Math.sin(phi),
      Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
    ]);
  }
  return dots;
}

// ── Globe initializer ──

export function initGlobe(canvas: HTMLCanvasElement): () => void {
  const markers = TECH_MARKERS;
  const connections = TECH_CONNECTIONS;

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  // Respect prefers-reduced-motion
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // State
  let rotYVal = 0.4;
  let rotXVal = 0.3;
  let time = 0;
  let animId = 0;

  // Drag state
  let dragActive = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartRotY = 0;
  let dragStartRotX = 0;

  // Colors — red accent per design system
  const dotColorBase = "rgba(239, 68, 68, "; // #EF4444
  const arcColor = "rgba(239, 68, 68, 0.45)";
  const markerColor = "rgba(255, 130, 110, 1)";
  const markerColorFaded = (a: number) => `rgba(255, 130, 110, ${a})`;

  // Generate Fibonacci sphere grid
  const dots = generateDots(1200);

  const autoRotateSpeed = 0.002;

  function draw() {
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;
    const fov = 600;

    // Auto rotate when idle
    if (!dragActive) {
      rotYVal += autoRotateSpeed;
    }

    time += 0.015;

    ctx.clearRect(0, 0, w, h);

    // Outer glow — subtle red
    const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.5);
    glowGrad.addColorStop(0, "rgba(239, 68, 68, 0.03)");
    glowGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Globe outline ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const ry = rotYVal;
    const rx = rotXVal;

    // ── Draw Fibonacci dots ──
    for (let i = 0; i < dots.length; i++) {
      let [x, y, z] = dots[i];
      x *= radius;
      y *= radius;
      z *= radius;

      [x, y, z] = rotateX(x, y, z, rx);
      [x, y, z] = rotateY(x, y, z, ry);

      if (z > 0) continue; // back-face cull

      const [sx, sy] = project(x, y, z, cx, cy, fov);
      const depthAlpha = Math.max(0.1, 1 - (z + radius) / (2 * radius));
      const dotSize = 1 + depthAlpha * 0.8;

      ctx.beginPath();
      ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = dotColorBase + depthAlpha.toFixed(2) + ")";
      ctx.fill();
    }

    // ── Draw arc connections between related skills ──
    for (const conn of connections) {
      const [lat1, lng1] = conn.from;
      const [lat2, lng2] = conn.to;

      let [x1, y1, z1] = latLngToXYZ(lat1, lng1, radius);
      let [x2, y2, z2] = latLngToXYZ(lat2, lng2, radius);

      [x1, y1, z1] = rotateX(x1, y1, z1, rx);
      [x1, y1, z1] = rotateY(x1, y1, z1, ry);
      [x2, y2, z2] = rotateX(x2, y2, z2, rx);
      [x2, y2, z2] = rotateY(x2, y2, z2, ry);

      // Only draw if at least one endpoint faces camera
      if (z1 > radius * 0.3 && z2 > radius * 0.3) continue;

      const [sx1, sy1] = project(x1, y1, z1, cx, cy, fov);
      const [sx2, sy2] = project(x2, y2, z2, cx, cy, fov);

      // Elevated midpoint for arc curvature
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const midZ = (z1 + z2) / 2;
      const midLen = Math.sqrt(midX * midX + midY * midY + midZ * midZ);
      const arcHeight = radius * 1.25;
      const elevX = (midX / midLen) * arcHeight;
      const elevY = (midY / midLen) * arcHeight;
      const elevZ = (midZ / midLen) * arcHeight;
      const [scx, scy] = project(elevX, elevY, elevZ, cx, cy, fov);

      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.quadraticCurveTo(scx, scy, sx2, sy2);
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Traveling dot along arc
      const t = (Math.sin(time * 1.2 + lat1 * 0.1) + 1) / 2;
      const tx = (1 - t) * (1 - t) * sx1 + 2 * (1 - t) * t * scx + t * t * sx2;
      const ty = (1 - t) * (1 - t) * sy1 + 2 * (1 - t) * t * scy + t * t * sy2;

      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.fill();
    }

    // ── Draw skill markers with labels ──
    for (const marker of markers) {
      let [x, y, z] = latLngToXYZ(marker.lat, marker.lng, radius);
      [x, y, z] = rotateX(x, y, z, rx);
      [x, y, z] = rotateY(x, y, z, ry);

      if (z > radius * 0.1) continue; // back-face cull

      const [sx, sy] = project(x, y, z, cx, cy, fov);

      // Pulse ring
      const pulse = Math.sin(time * 2 + marker.lat) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 5 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = markerColorFaded(0.2 + pulse * 0.15);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Core dot (slightly larger — these are the content)
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.fill();

      // Skill label
      if (marker.label) {
        ctx.font = '11px "Satoshi", system-ui, sans-serif';
        ctx.fillStyle = markerColorFaded(0.75);
        ctx.fillText(marker.label, sx + 9, sy + 4);
      }
    }

    if (!prefersReduced) {
      animId = requestAnimationFrame(draw);
    }
  }

  // ── Pointer drag handlers ──

  function onPointerDown(e: PointerEvent) {
    dragActive = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartRotY = rotYVal;
    dragStartRotX = rotXVal;
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragActive) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    rotYVal = dragStartRotY + dx * 0.005;
    rotXVal = Math.max(-1, Math.min(1, dragStartRotX + dy * 0.005));
  }

  function onPointerUp() {
    dragActive = false;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);

  // Start
  animId = requestAnimationFrame(draw);

  // Single static frame for reduced motion
  if (prefersReduced) {
    draw();
  }

  // Cleanup
  return () => {
    cancelAnimationFrame(animId);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
  };
}
