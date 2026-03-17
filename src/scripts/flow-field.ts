interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

export function init(): void {
  const canvas = document.getElementById("flow-field") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PARTICLE_COUNT = reducedMotion ? 60 : 150;
  const MAX_ALPHA = 0.2;
  const FRICTION = 0.95;
  const SPEED = 0.05;
  const REPULSION_RADIUS = 120;
  const REPULSION_FORCE = 0.03;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let mouseX = -1000;
  let mouseY = -1000;

  const particles: Particle[] = [];

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas!.width = width * dpr;
    canvas!.height = height * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createParticle(): Particle {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      age: 0,
      life: 200 + Math.random() * 100,
    };
  }

  function resetParticle(p: Particle): void {
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    p.life = 200 + Math.random() * 100;
  }

  resize();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = createParticle();
    p.age = Math.random() * p.life; // stagger initial ages
    particles.push(p);
  }

  window.addEventListener("resize", resize);

  if (!reducedMotion) {
    window.addEventListener("mousemove", (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });
    window.addEventListener("mouseleave", () => {
      mouseX = -1000;
      mouseY = -1000;
    });
  }

  function animate(): void {
    // Trail effect — don't fully clear each frame
    ctx!.fillStyle = "rgba(10, 10, 15, 0.15)";
    ctx!.fillRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Flow field
      const angle = (Math.cos(p.x * 0.003) + Math.sin(p.y * 0.003)) * Math.PI;
      p.vx += Math.cos(angle) * SPEED;
      p.vy += Math.sin(angle) * SPEED;

      // Mouse repulsion
      if (!reducedMotion) {
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPULSION_RADIUS && dist > 0) {
          const force = (REPULSION_RADIUS - dist) / REPULSION_RADIUS;
          p.vx += (dx / dist) * force * REPULSION_FORCE;
          p.vy += (dy / dist) * force * REPULSION_FORCE;
        }
      }

      // Friction
      p.vx *= FRICTION;
      p.vy *= FRICTION;

      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Wrap edges
      if (p.x < 0) p.x += width;
      if (p.x > width) p.x -= width;
      if (p.y < 0) p.y += height;
      if (p.y > height) p.y -= height;

      // Age
      p.age++;
      if (p.age >= p.life) {
        resetParticle(p);
        continue;
      }

      // Opacity: fade in and out
      const alpha = Math.min((1 - Math.abs((p.age / p.life) - 0.5) * 2) * MAX_ALPHA, MAX_ALPHA);
      if (alpha <= 0) continue;

      ctx!.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx!.fillRect(p.x, p.y, 1, 1);
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
