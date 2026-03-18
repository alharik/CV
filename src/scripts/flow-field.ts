/**
 * WebGL2 GLSL Hills terrain background.
 * Ported from Three.js GLSLHills component to pure WebGL2 — zero dependencies.
 * - Perlin noise vertex displacement creates scrolling 3D terrain
 * - Warm red tones (#EF4444) with distance-based opacity fade
 * - Camera: perspective looking down at terrain from above
 * - prefers-reduced-motion: single static frame
 */

// --- Vertex shader: Perlin noise terrain displacement ---
const VERT_SRC = `#version 300 es
precision highp float;

in vec3 position;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float time;

out vec3 vPosition;

mat4 rotateMatrixX(float radian) {
  return mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, cos(radian), -sin(radian), 0.0,
    0.0, sin(radian), cos(radian), 0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec3 P) {
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod289(Pi0);
  Pi1 = mod289(Pi1);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}

void main(void) {
  vec3 updatePosition = (rotateMatrixX(radians(90.0)) * vec4(position, 1.0)).xyz;
  float sin1 = sin(radians(updatePosition.x / 128.0 * 90.0));
  vec3 noisePosition = updatePosition + vec3(0.0, 0.0, time * -30.0);
  float noise1 = cnoise(noisePosition * 0.08);
  float noise2 = cnoise(noisePosition * 0.06);
  float noise3 = cnoise(noisePosition * 0.4);
  vec3 lastPosition = updatePosition + vec3(0.0,
    noise1 * sin1 * 8.0
    + noise2 * sin1 * 8.0
    + noise3 * (abs(sin1) * 2.0 + 0.5)
    + pow(sin1, 2.0) * 40.0, 0.0);

  vPosition = lastPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(lastPosition, 1.0);
}`;

// --- Fragment shader: warm red with distance fade ---
const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vPosition;
out vec4 fragColor;

void main(void) {
  float dist = length(vPosition);
  float opacity = (96.0 - dist) / 256.0 * 0.5;
  opacity = clamp(opacity, 0.0, 0.4);
  // Warm red matching #EF4444
  vec3 color = vec3(0.94, 0.27, 0.27);
  fragColor = vec4(color, opacity);
}`;

// --- Manual matrix math (replaces Three.js) ---

function perspectiveMatrix(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAtMatrix(eye: number[], target: number[], up: number[]): Float32Array {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
  const fz = [zx * len, zy * len, zz * len];

  const rx = up[1] * fz[2] - up[2] * fz[1];
  const ry = up[2] * fz[0] - up[0] * fz[2];
  const rz = up[0] * fz[1] - up[1] * fz[0];
  len = 1 / Math.sqrt(rx * rx + ry * ry + rz * rz);
  const fx = [rx * len, ry * len, rz * len];

  const ux = fz[1] * fx[2] - fz[2] * fx[1];
  const uy = fz[2] * fx[0] - fz[0] * fx[2];
  const uz = fz[0] * fx[1] - fz[1] * fx[0];

  return new Float32Array([
    fx[0], ux, fz[0], 0,
    fx[1], uy, fz[1], 0,
    fx[2], uz, fz[2], 0,
    -(fx[0] * eye[0] + fx[1] * eye[1] + fx[2] * eye[2]),
    -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
    -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]),
    1,
  ]);
}

// --- Generate subdivided plane geometry ---

function createPlaneGeometry(size: number, segments: number): { vertices: Float32Array; indices: Uint32Array } {
  const half = size / 2;
  const step = size / segments;
  const vertCount = (segments + 1) * (segments + 1);
  const vertices = new Float32Array(vertCount * 3);

  let vi = 0;
  for (let iy = 0; iy <= segments; iy++) {
    for (let ix = 0; ix <= segments; ix++) {
      vertices[vi++] = -half + ix * step;
      vertices[vi++] = -half + iy * step;
      vertices[vi++] = 0;
    }
  }

  const triCount = segments * segments * 6;
  const indices = new Uint32Array(triCount);
  let ii = 0;
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iy * (segments + 1) + ix;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
      indices[ii++] = b; indices[ii++] = d; indices[ii++] = c;
    }
  }

  return { vertices, indices };
}

// --- Main init ---

export function init(): void {
  const canvas = document.getElementById("flow-field") as HTMLCanvasElement | null;
  if (!canvas) return;

  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
  if (!gl) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Compile shaders ---
  function compile(type: number, src: string): WebGLShader | null {
    const s = gl!.createShader(type);
    if (!s) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      console.error("Shader error:", gl!.getShaderInfoLog(s));
      gl!.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return;

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Link error:", gl.getProgramInfoLog(program));
    return;
  }

  // --- Geometry: subdivided plane (128 segments for detail, balancing perf) ---
  const SEGMENTS = 128;
  const SIZE = 256;
  const { vertices, indices } = createPlaneGeometry(SIZE, SEGMENTS);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const posAttr = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(posAttr);
  gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

  // --- Uniforms ---
  const uProjection = gl.getUniformLocation(program, "projectionMatrix");
  const uModelView = gl.getUniformLocation(program, "modelViewMatrix");
  const uTime = gl.getUniformLocation(program, "time");

  // --- Camera ---
  const EYE = [0, 16, 125];
  const TARGET = [0, 28, 0];
  const UP = [0, 1, 0];
  const FOV = 45 * Math.PI / 180;
  const NEAR = 1;
  const FAR = 10000;

  const modelView = lookAtMatrix(EYE, TARGET, UP);

  // --- Resize ---
  let dpr = Math.max(1, 0.5 * window.devicePixelRatio);

  function resize(): void {
    dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    canvas!.width = window.innerWidth * dpr;
    canvas!.height = window.innerHeight * dpr;
    gl!.viewport(0, 0, canvas!.width, canvas!.height);
  }

  resize();
  window.addEventListener("resize", resize);

  // --- Animation state ---
  const speed = 0.5;
  let timeAccum = 0;
  let lastNow = 0;

  // --- Render ---
  function render(now: number): void {
    const delta = lastNow === 0 ? 0.016 : (now - lastNow) * 0.001;
    lastNow = now;
    timeAccum += delta * speed;

    const aspect = canvas!.width / canvas!.height;
    const projection = perspectiveMatrix(FOV, aspect, NEAR, FAR);

    gl!.clearColor(0.039, 0.039, 0.059, 1); // #0A0A0F
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

    gl!.useProgram(program);

    gl!.bindBuffer(gl!.ARRAY_BUFFER, vbo);
    gl!.vertexAttribPointer(posAttr, 3, gl!.FLOAT, false, 0, 0);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, ibo);

    gl!.uniformMatrix4fv(uProjection, false, projection);
    gl!.uniformMatrix4fv(uModelView, false, modelView);
    gl!.uniform1f(uTime, timeAccum);

    gl!.drawElements(gl!.TRIANGLES, indices.length, gl!.UNSIGNED_INT, 0);

    if (!reducedMotion) {
      requestAnimationFrame(render);
    }
  }

  if (reducedMotion) {
    render(0);
  } else {
    requestAnimationFrame(render);
  }
}
