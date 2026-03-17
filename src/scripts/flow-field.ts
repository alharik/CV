/**
 * WebGL2 shader background — warm upward-drifting nebula.
 * Replaces the old Canvas 2D particle flow field.
 * Based on shader by Matthias Hurrle (@atzedent), modified for:
 *   - Upward drift (instead of rightward)
 *   - Warm red tones matching #EF4444
 *   - Subtle ambient intensity for site-wide use
 *   - Pointer interactivity
 *   - prefers-reduced-motion support
 */

const VERTEX_SRC = `#version 300 es
precision highp float;
in vec4 position;
void main() { gl_Position = position; }`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
uniform vec2 touch;
uniform int pointerCount;

#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x, R.y)

float rnd(vec2 p) {
  p = fract(p * vec2(12.9898, 78.233));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(in vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  float
    a = rnd(i),
    b = rnd(i + vec2(1, 0)),
    c = rnd(i + vec2(0, 1)),
    d = rnd(i + 1.);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float t = 0., a = 1.;
  mat2 m = mat2(1., -.5, .2, 1.2);
  for (int i = 0; i < 5; i++) {
    t += a * noise(p);
    p *= 2. * m;
    a *= .5;
  }
  return t;
}

float clouds(vec2 p) {
  float d = 1., t = 0.;
  for (float i = 0.; i < 3.; i++) {
    float a = d * fbm(i * 10. + p.x * .2 + .2 * (1. + i) * p.y + d + i * i + p);
    t = mix(t, d, a);
    d = a;
    p *= 2. / (i + 1.);
  }
  return t;
}

void main(void) {
  vec2 uv = (FC - .5 * R) / MN;
  vec2 st = uv * vec2(2, 1);
  vec3 col = vec3(0);

  // Clouds drift UPWARD (st.y + T) instead of rightward
  float bg = clouds(vec2(st.x, -st.y + T * .25));

  uv *= 1. - .3 * (sin(T * .2) * .5 + .5);

  // Upward drift applied to point lights
  vec2 drift = vec2(0., -T * .012);

  for (float i = 1.; i < 12.; i++) {
    uv += .1 * cos(i * vec2(.1 + .01 * i, .8) + i * i + T * .4 + .1 * uv.x);
    vec2 p = uv + drift;
    float d = length(p);

    // Point lights — warm shifted, reduced brightness for ambient use
    col += .0006 / d * (cos(sin(i) * vec3(0.5, 1.8, 3.)) + 1.);

    float b = noise(i + p + bg * 1.731);
    col += .0012 * b / length(max(p, vec2(b * p.x * .02, p.y)));

    // Mix with warm red cloud color — subtle
    col = mix(col, vec3(bg * .22, bg * .06, bg * .025), d);
  }

  // Pointer interaction — subtle glow near cursor
  if (pointerCount > 0) {
    vec2 tp = touch / R;
    tp.y = 1. - tp.y;
    vec2 tuv = FC / R;
    float td = length(tuv - tp);
    col += vec3(.15, .03, .01) * .04 / (td + .05);
  }

  // Overall dim for ambient background use
  col *= .65;

  O = vec4(col, 1);
}`;

export function init(): void {
  const canvas = document.getElementById("flow-field") as HTMLCanvasElement | null;
  if (!canvas) return;

  const gl = canvas.getContext("webgl2");
  if (!gl) return; // WebGL2 not supported, fail silently

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Compile shader ---
  function compileShader(type: number, source: string): WebGLShader | null {
    const shader = gl!.createShader(type);
    if (!shader) return null;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl!.getShaderInfoLog(shader));
      gl!.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  if (!vs || !fs) return;

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    return;
  }

  // --- Geometry: full-screen quad ---
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);

  const posAttr = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(posAttr);
  gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

  // --- Uniforms ---
  const uResolution = gl.getUniformLocation(program, "resolution");
  const uTime = gl.getUniformLocation(program, "time");
  const uTouch = gl.getUniformLocation(program, "touch");
  const uPointerCount = gl.getUniformLocation(program, "pointerCount");

  // --- Mouse tracking (window-level, canvas has pointer-events:none) ---
  let mouseActive = false;
  let mouseX = 0;
  let mouseY = 0;
  let dpr = Math.max(1, 0.5 * window.devicePixelRatio);

  function resize(): void {
    dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    canvas!.width = window.innerWidth * dpr;
    canvas!.height = window.innerHeight * dpr;
    gl!.viewport(0, 0, canvas!.width, canvas!.height);
  }

  resize();
  window.addEventListener("resize", resize);

  if (!reducedMotion) {
    window.addEventListener("mousemove", (e) => {
      mouseActive = true;
      mouseX = e.clientX * dpr;
      mouseY = e.clientY * dpr;
    });
    window.addEventListener("mouseleave", () => {
      mouseActive = false;
    });
  }

  // --- Render ---
  function render(now: number): void {
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.useProgram(program);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);

    gl!.uniform2f(uResolution, canvas!.width, canvas!.height);
    gl!.uniform1f(uTime, now * 1e-3);
    gl!.uniform2f(uTouch, mouseX, mouseY);
    gl!.uniform1i(uPointerCount, mouseActive ? 1 : 0);

    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    if (!reducedMotion) {
      requestAnimationFrame(render);
    }
  }

  if (reducedMotion) {
    // Render a single static frame for the warm texture
    render(0);
  } else {
    requestAnimationFrame(render);
  }
}
