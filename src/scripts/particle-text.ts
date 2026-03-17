class Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;

  constructor(x: number, y: number, size: number, color: string) {
    this.originX = x;
    this.originY = y;
    this.x = x + (Math.random() - 0.5) * 10;
    this.y = y + (Math.random() - 0.5) * 10;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.size = size;
    this.color = color;
  }

  update(mouseX: number, mouseY: number) {
    const dx = this.x - mouseX;
    const dy = this.y - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Repulsion from mouse
    if (dist < 120) {
      const force = (120 - dist) / 120;
      const angle = Math.atan2(dy, dx);
      this.vx += Math.cos(angle) * force * 15;
      this.vy += Math.sin(angle) * force * 15;
    }

    // Return force toward origin
    this.vx += (this.originX - this.x) * 0.08;
    this.vy += (this.originY - this.y) * 0.08;

    // Damping
    this.vx *= 0.85;
    this.vy *= 0.85;

    // Organic jitter when settled near origin
    const distToOrigin = Math.abs(this.x - this.originX) + Math.abs(this.y - this.originY);
    if (distToOrigin < 1 && Math.abs(this.vx) < 0.1 && Math.abs(this.vy) < 0.1) {
      if (Math.random() < 0.05) {
        this.vx += (Math.random() - 0.5) * 0.2;
        this.vy += (Math.random() - 0.5) * 0.2;
      }
    }

    this.x += this.vx;
    this.y += this.vy;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function initParticleText(canvas: HTMLCanvasElement): () => void {
  // Reduced motion: skip particle animation entirely
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    canvas.style.display = "none";
    const fallback = document.getElementById("particle-fallback");
    if (fallback) fallback.style.display = "";
    return () => {};
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const dpr = window.devicePixelRatio || 1;

  let particles: Particle[] = [];
  let mouseX = -1000;
  let mouseY = -1000;
  let animId = 0;

  // Resolve color from CSS custom property
  const color =
    getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() ||
    "#F1F1F3";

  function setup() {
    const container = canvas.parentElement!;
    const w = container.clientWidth;
    const h = container.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Draw text offscreen to sample pixels
    // Calculate font size that fits within canvas width (with padding)
    const text = "ALI YASER AL HARIK";
    const maxWidth = w * 0.92;
    let fontSize = Math.min(120, w * 0.12);
    ctx.font = `bold ${fontSize}px Satoshi, system-ui, sans-serif`;
    while (fontSize > 12 && ctx.measureText(text).width > maxWidth) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px Satoshi, system-ui, sans-serif`;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);

    // Scan pixels
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    particles = [];
    const step = w < 500 ? 4 : 6;

    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] > 128) {
          particles.push(new Particle(x / dpr, y / dpr, w < 500 ? 1 : 1.5, color));
        }
      }
    }

    ctx.clearRect(0, 0, w, h);
  }

  function animate() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.update(mouseX, mouseY);
      p.draw(ctx);
    }

    animId = requestAnimationFrame(animate);
  }

  // Mouse handlers
  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }

  function onMouseLeave() {
    mouseX = -1000;
    mouseY = -1000;
  }

  // Touch handlers
  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = touch.clientX - rect.left;
    mouseY = touch.clientY - rect.top;
  }

  function onTouchMove(e: TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = touch.clientX - rect.left;
    mouseY = touch.clientY - rect.top;
  }

  function onTouchEnd() {
    mouseX = -1000;
    mouseY = -1000;
  }

  // Resize via ResizeObserver
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(animId);
    setup();
    animId = requestAnimationFrame(animate);
  });

  // Init
  setup();
  animId = requestAnimationFrame(animate);

  canvas.addEventListener("mousemove", onMouseMove, { passive: true });
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd);
  observer.observe(canvas.parentElement!);

  // Cleanup
  return () => {
    cancelAnimationFrame(animId);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseleave", onMouseLeave);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    observer.disconnect();
  };
}
