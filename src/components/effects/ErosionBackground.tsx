import { useEffect, useRef, useState } from 'react'
import { createTimeline, stagger } from 'animejs'

/* ────────────────────────────────────────────────────────────
 * WGSL — COMPUTE SHADER (physics)
 * ──────────────────────────────────────────────────────────── */
const computeWGSL = /* wgsl */ `
struct Particle {
  posVel: vec4<f32>,
  orig:   vec4<f32>,
  extra:  vec4<f32>,
};

struct Shockwave {
  data:  vec4<f32>,
  data2: vec4<f32>,
};

struct Uniforms {
  timeDt:  vec4<f32>,
  mouse:   vec4<f32>,
  wind:    vec4<f32>,
  params1: vec4<f32>,
  params2: vec4<f32>,
  params3: vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> u: Uniforms;
@group(0) @binding(2) var<storage, read> shockwaves: array<Shockwave>;

fn hash2(p: vec2<f32>) -> vec2<f32> {
  let q = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}

fn noise2D(p: vec2<f32>) -> f32 {
  let K1 = 0.366025404;
  let K2 = 0.211324865;
  let i = floor(p + (p.x + p.y) * K1);
  let a = p - i + (i.x + i.y) * K2;
  let o = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), a.x > a.y);
  let b = a - o + K2;
  let c = a - 1.0 + 2.0 * K2;
  let h = max(vec3<f32>(0.5) - vec3<f32>(dot(a, a), dot(b, b), dot(c, c)), vec3<f32>(0.0));
  let n = h * h * h * h * vec3<f32>(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + vec2<f32>(1.0, 1.0))));
  return dot(n, vec3<f32>(70.0));
}

@compute @workgroup_size(256)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }

  var p = particles[i];
  var x = p.posVel.x; var y = p.posVel.y; var vx = p.posVel.z; var vy = p.posVel.w;
  let ox = p.orig.x; let oy = p.orig.y;
  let depth = p.extra.y; var heat = p.extra.z; var eroded = p.extra.w;

  let time = u.timeDt.x; let dt = u.timeDt.y; let w = u.timeDt.z; let h = u.timeDt.w;
  let mx = u.mouse.x; let my = u.mouse.y; let mouseActive = u.mouse.z > 0.5; let dpr = u.mouse.w;
  let windX = u.wind.x; let windY = u.wind.y; let healSuppressed = u.wind.z > 0.5;
  let swCount = u32(u.wind.w);
  let erosionRadius = u.params1.x; let erosionStrength = u.params1.y;
  let healRate = u.params1.z; let gravity = u.params1.w;
  let turbulence = u.params2.x; let vortexStrength = u.params2.y;
  let clearR = u.params2.z; let centerX = u.params2.w;
  let centerY = u.params3.x;

  let erosionRadSq = (erosionRadius * dpr) * (erosionRadius * dpr);

  for (var s: u32 = 0u; s < swCount; s = s + 1u) {
    let sw = shockwaves[s];
    let cx = sw.data.x; let cy = sw.data.y; let radius = sw.data.z;
    let strength = sw.data2.x; let born = sw.data2.y;
    let age = time - born;
    let ringWidth = 100.0 * dpr;
    let fade = max(0.0, 1.0 - age * 0.3);

    let pdx = x - cx; let pdy = y - cy;
    let pdist = sqrt(pdx * pdx + pdy * pdy);
    let ringDist = abs(pdist - radius);

    if (ringDist < ringWidth && pdist > 1.0) {
      let proximity = 1.0 - ringDist / ringWidth;
      let pushStr = strength * proximity * proximity * fade * dt;
      let depthScale = 0.3 + depth * 0.7;
      vx = vx + (pdx / pdist) * pushStr * depthScale;
      vy = vy + (pdy / pdist) * pushStr * depthScale;
      heat = min(1.0, heat + 0.4 * proximity * fade);
      eroded = 1.0;
    }
  }

  let dx = x - mx; let dy = y - my;
  let distSq = dx * dx + dy * dy;
  let depthScale = 0.03 + depth * 0.7;

  if (mouseActive && distSq < erosionRadSq && distSq > 1.0) {
    let dist = sqrt(distSq);
    let force = (erosionStrength * dpr) / max(distSq, 400.0);
    let nx = dx / dist; let ny = dy / dist;
    let tx = -ny; let ty = nx;

    vx = vx + (nx * force + windX * 2.0) * dt * depthScale;
    vy = vy + (ny * force + windY * 2.0) * dt * depthScale;
    vx = vx + tx * force * vortexStrength * dt * depthScale;
    vy = vy + ty * force * vortexStrength * dt * depthScale;

    eroded = 1.0;
  }

  if (clearR > 0.0) {
    let cdx = x - centerX; let cdy = y - centerY;
    let cdist = sqrt(cdx * cdx + cdy * cdy);
    if (cdist < clearR && cdist > 0.1) {
      let push = (clearR - cdist) * 1.5;
      vx = vx + (cdx / cdist) * push;
      vy = vy + (cdy / cdist) * push;
    }
    let ringDist2 = abs(cdist - clearR);
    let band = clearR * 0.35;
    if (ringDist2 < band) {
      let prox = 1.0 - ringDist2 / band;
      heat = max(heat, prox * prox * 0.10);
    }
  }

  if (eroded > 0.5) {
    vy = vy + gravity * dpr * dt * (0.5 + depth * 0.5);

    let ns = 0.003;
    let turbScale = (1.5 - depth * 0.8) * turbulence * dpr;
    let turbX = noise2D(vec2<f32>(x * ns, y * ns + time * 0.8)) * turbScale;
    let turbY = noise2D(vec2<f32>(x * ns + 100.0, y * ns + 100.0 + time * 0.8)) * turbScale;
    vx = vx + turbX * dt;
    vy = vy + turbY * dt;

    if (!healSuppressed && (!mouseActive || distSq > erosionRadSq * 4.0)) {
      let rs = healRate * 2.0;
      vx = vx + (ox - x) * rs;
      vy = vy + (oy - y) * rs;

      let hx = x - ox; let hy = y - oy;
      if (hx * hx + hy * hy < 4.0 && vx * vx + vy * vy < 1.0) {
        x = ox; y = oy; vx = 0.0; vy = 0.0; eroded = 0.0;
      }
    }

    vx = vx * 0.96;
    vy = vy * 0.96;
  } else {
    let ans = 0.002;
    let amp = 2.0 * dpr * (1.2 - depth * 0.6);
    x = ox + noise2D(vec2<f32>(ox * ans + time * 0.12, oy * ans)) * amp;
    y = oy + noise2D(vec2<f32>(ox * ans + 50.0, oy * ans + time * 0.12 + 50.0)) * amp;
  }

  let vel = sqrt(vx * vx + vy * vy);
  heat = min(1.0, heat + vel * 0.0006);
  heat = heat * 0.993;
  if (heat < 0.005) { heat = 0.0; }

  x = x + vx * dt * 60.0;
  y = y + vy * dt * 60.0;

  if (x < 0.0) { x = 0.0; vx = vx * -0.3; }
  if (x > w)   { x = w;   vx = vx * -0.3; }
  if (y < 0.0) { y = 0.0; vy = vy * -0.3; }
  if (y > h)   { y = h;   vy = vy * -0.3; }

  p.posVel = vec4<f32>(x, y, vx, vy);
  p.extra = vec4<f32>(p.extra.x, depth, heat, eroded);
  particles[i] = p;
}
`;

/* ────────────────────────────────────────────────────────────
 * WGSL — RENDER SHADER
 * ──────────────────────────────────────────────────────────── */
const renderWGSL = /* wgsl */ `
struct Particle {
  posVel: vec4<f32>,
  orig:   vec4<f32>,
  extra:  vec4<f32>,
};

struct RenderUniforms {
  colors1: vec4<f32>,
  colors2: vec4<f32>,
  colors3: vec4<f32>,
  screen:  vec4<f32>,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> ru: RenderUniforms;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

fn quadCorner(i: u32) -> vec2<f32> {
  var c = array<vec2<f32>, 6>(
    vec2<f32>(-0.5, -0.5), vec2<f32>(0.5, -0.5), vec2<f32>(-0.5, 0.5),
    vec2<f32>(-0.5, 0.5),  vec2<f32>(0.5, -0.5), vec2<f32>(0.5, 0.5)
  );
  return c[i];
}

fn heatColor(heat: f32) -> vec3<f32> {
  let base = ru.colors1.rgb; let ember = ru.colors2.rgb; let peak = ru.colors3.rgb;
  if (heat < 0.5) {
    return base;
  } else if (heat < 0.9) {
    let t = (heat - 0.5) / 0.4;
    let tt = t * t;
    return base + (ember - base) * tt;
  } else {
    let t = (heat - 0.9) / 0.5;
    return ember + (peak - ember) * t;
  }
}

@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32, @builtin(instance_index) iIdx: u32) -> VSOut {
  let p = particles[iIdx];
  let dpr = ru.screen.z;
  let isGlow = ru.screen.w > 0.5;
  let shade = p.extra.x; let heat = p.extra.z;

  var sizePx = p.orig.z * dpr;
  var alpha = p.orig.w;
  var col = heatColor(heat) + vec3<f32>(shade, shade, shade);

  if (isGlow) {
    sizePx = p.orig.z * dpr * (3.0 + heat * 5.0);
    alpha = heat * heat * 0.35;
    if (heat < 0.12) { alpha = 0.0; }
    col = heatColor(heat);
  }

  let corner = quadCorner(vIdx);
  let worldPos = vec2<f32>(p.posVel.x, p.posVel.y) + corner * sizePx;
  let ndcX = (worldPos.x / ru.screen.x) * 2.0 - 1.0;
  let ndcY = 1.0 - (worldPos.y / ru.screen.y) * 2.0;

  var out: VSOut;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.color = vec4<f32>(clamp(col / 255.0, vec3<f32>(0.0), vec3<f32>(1.0)), alpha);
  out.uv = corner * 2.0;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let isGlow = ru.screen.w > 0.5;
  var a = in.color.a;
  if (isGlow) {
    let d = length(in.uv);
    a = a * max(0.0, 1.0 - d);
  }
  if (a <= 0.0) { discard; }
  return vec4<f32>(in.color.rgb * a, a);
}
`;

/* ────────────────────────────────────────────────────────────
 * THEMES
 * ──────────────────────────────────────────────────────────── */
const THEMES = {
  ember: {
    grainRgb: [16, 16, 16], emberRgb: [210, 100, 26], peakRgb: [255, 176, 90],
    shockwaveRgb: [255, 150, 60], vignetteColor: "0,0,0", vignetteOpacity: 0.6,
    filmGrainAlpha: 18, filmGrainValue: 25,
  },
  glacier: {
    grainRgb: [10, 15, 20], emberRgb: [40, 130, 190], peakRgb: [110, 210, 255],
    shockwaveRgb: [70, 170, 255], vignetteColor: "0,4,10", vignetteOpacity: 0.6,
    filmGrainAlpha: 18, filmGrainValue: 25,
  },
  amethyst: {
    grainRgb: [16, 11, 20], emberRgb: [140, 55, 190], peakRgb: [205, 130, 255],
    shockwaveRgb: [180, 100, 255], vignetteColor: "6,0,10", vignetteOpacity: 0.6,
    filmGrainAlpha: 18, filmGrainValue: 25,
  },
  verdant: {
    grainRgb: [10, 16, 12], emberRgb: [35, 155, 80], peakRgb: [120, 240, 160],
    shockwaveRgb: [70, 210, 110], vignetteColor: "0,8,3", vignetteOpacity: 0.6,
    filmGrainAlpha: 18, filmGrainValue: 25,
  },
};

function seeded(i: number, salt: number) {
  return (((Math.sin(i * salt + 311.7) * 43758.5453) % 1) + 1) % 1
}

const MAX_SHOCKWAVES = 32
const PARTICLE_STRIDE_FLOATS = 12
const PARTICLE_COUNT = 500000

/* ────────────────────────────────────────────────────────────
 * Erosion — WebGPU-backed particle field
 * ──────────────────────────────────────────────────────────── */
class Erosion {
  root: HTMLElement
  opts: Record<string, unknown>
  canvas: HTMLCanvasElement
  ringsCanvas: HTMLCanvasElement
  grainCanvas: HTMLCanvasElement
  contentEl: HTMLElement
  vignetteEl: HTMLElement
  mouse = { x: -1000, y: -1000, active: false }
  prevMouse = { x: -1000, y: -1000 }
  time = 0
  palette: typeof THEMES['ember']
  revealed = false
  shockwaves: Array<{ cx: number; cy: number; radius: number; maxRadius: number; strength: number; born: number }> = []
  raf = 0
  _grainInterval: number | null = null
  _ready = false
  _destroyed = false
  device: GPUDevice | null = null
  context: GPUCanvasContext | null = null
  format: GPUTextureFormat = 'rgba8unorm'
  computePipeline: GPUComputePipeline | null = null
  renderPipeline: GPURenderPipeline | null = null
  glowPipeline: GPURenderPipeline | null = null
  uniformBuffer: GPUBuffer | null = null
  renderUniformBuffer: GPUBuffer | null = null
  shockwaveBuffer: GPUBuffer | null = null
  particleBuffer: GPUBuffer | null = null
  particleCount = 0
  computeBindGroup: GPUBindGroup | null = null
  renderBindGroup: GPUBindGroup | null = null
  glowBindGroup: GPUBindGroup | null = null
  _uniformData = new Float32Array(24)
  _renderUniformData = new Float32Array(16)
  _shockwaveData = new Float32Array(MAX_SHOCKWAVES * 8)

  constructor(root: HTMLElement, opts: Record<string, unknown>) {
    this.root = root
    this.opts = Object.assign({
      particleCount: PARTICLE_COUNT,
      erosionRadius: 140,
      erosionStrength: 8000,
      healRate: 0.005,
      gravity: 50,
      turbulence: 30,
      vortexStrength: 0.45,
      shockwaveOnClick: true,
      clearRadius: 0.38,
      filmGrain: true,
      vignette: true,
      theme: 'ember',
    }, opts || {})

    this.canvas = root.querySelector('.erosion-canvas') as HTMLCanvasElement
    this.ringsCanvas = root.querySelector('.erosion-rings') as HTMLCanvasElement
    this.grainCanvas = root.querySelector('.erosion-grain') as HTMLCanvasElement
    this.contentEl = root.querySelector('.erosion-content') as HTMLElement
    this.vignetteEl = root.querySelector('.erosion-vignette') as HTMLElement
    this.palette = THEMES[this.opts.theme as keyof typeof THEMES] || THEMES.ember
  }

  async init() {
    if (!navigator.gpu) throw new Error('navigator.gpu is undefined.')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter found.')
    this.device = await adapter.requestDevice()
    this.device.lost.then((info) => {
      if (!this._destroyed) console.warn('WebGPU device lost:', info.message)
    })

    this.context = this.canvas.getContext('webgpu')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })

    const computeModule = this.device.createShaderModule({ code: computeWGSL })
    const renderModule = this.device.createShaderModule({ code: renderWGSL })

    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'cs_main' },
    })

    const blendNormal = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    }
    const blendScreen = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    }

    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs_main' },
      fragment: { module: renderModule, entryPoint: 'fs_main', targets: [{ format: this.format, blend: blendNormal }] },
      primitive: { topology: 'triangle-list' },
    })
    this.glowPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs_main' },
      fragment: { module: renderModule, entryPoint: 'fs_main', targets: [{ format: this.format, blend: blendScreen }] },
      primitive: { topology: 'triangle-list' },
    })

    this.uniformBuffer = this.device.createBuffer({ size: 24 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.renderUniformBuffer = this.device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.shockwaveBuffer = this.device.createBuffer({ size: MAX_SHOCKWAVES * 8 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })

    this._ready = true
    this._allocateParticles(this.opts.particleCount as number)
    this._resizeCanvas()

    if (this.opts.filmGrain) this._startFilmGrain()
    if ((this.opts.clearRadius as number) > 0 && !this.revealed) {
      setTimeout(() => this._reveal(), 300)
    }

    this._bindEvents()
    this.raf = requestAnimationFrame((t) => this._tick(t))
  }

  _allocateParticles(count: number) {
    const rect = this.root.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width * dpr, h = rect.height * dpr
    const clearR = (this.opts.clearRadius as number) > 0 ? Math.min(w, h) * (this.opts.clearRadius as number) : 0
    const cx = w / 2, cy = h / 2

    const data = new Float32Array(count * PARTICLE_STRIDE_FLOATS)
    const cols = Math.ceil(Math.sqrt(count * (w / h)))
    const rows = Math.ceil(count / cols)
    const cellW = w / cols, cellH = h / rows

    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols)
      let px = (col + seeded(i, 127.1)) * cellW
      let py = Math.min((row + seeded(i, 269.5)) * cellH, h)

      if (clearR > 0) {
        const dx = px - cx, dy = py - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < clearR + 10) {
          const angle = dist > 0.1 ? Math.atan2(dy, dx) : seeded(i, 999.1) * Math.PI * 2
          const newDist = clearR + 10 + seeded(i, 831.2) * clearR * 0.7
          px = Math.max(0, Math.min(w, cx + Math.cos(angle) * newDist))
          py = Math.max(0, Math.min(h, cy + Math.sin(angle) * newDist))
        }
      }

      const depth = seeded(i, 512.3)
      const baseSize = 0.1 + seeded(i, 43.7) * 2.5
      const size = baseSize * (0.2 + depth * 1.4)
      const alpha = 0.35 + seeded(i, 97.3) * 0.65
      const shade = -8 + seeded(i, 173.9) * 16

      const o = i * PARTICLE_STRIDE_FLOATS
      data[o + 0] = px; data[o + 1] = py; data[o + 2] = 0; data[o + 3] = 0
      data[o + 4] = px; data[o + 5] = py; data[o + 6] = size; data[o + 7] = alpha
      data[o + 8] = shade; data[o + 9] = depth; data[o + 10] = 0; data[o + 11] = 0
    }

    if (this.particleBuffer) this.particleBuffer.destroy()
    this.particleBuffer = this.device!.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true })
    new Float32Array(this.particleBuffer.getMappedRange()).set(data)
    this.particleBuffer.unmap()

    this.particleCount = count

    this.computeBindGroup = this.device!.createBindGroup({
      layout: this.computePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.uniformBuffer! } },
        { binding: 2, resource: { buffer: this.shockwaveBuffer! } },
      ],
    })
    this.renderBindGroup = this.device!.createBindGroup({
      layout: this.renderPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.renderUniformBuffer! } },
      ],
    })
    this.glowBindGroup = this.device!.createBindGroup({
      layout: this.glowPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.renderUniformBuffer! } },
      ],
    })
  }

  setTheme(name: string) {
    if (!THEMES[name]) return
    this.opts.theme = name
    this.palette = THEMES[name]
    this._updateVignette()
  }

  _updateVignette() {
    if (!this.opts.vignette) return
    const pal = this.palette
    this.vignetteEl.style.background =
      `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(${pal.vignetteColor},${pal.vignetteOpacity}) 100%)`
  }

  _bindEvents() {
    const move = (e: MouseEvent | TouchEvent) => {
      const rect = this.root.getBoundingClientRect()
      const cx = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX
      const cy = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY
      this.mouse.x = cx - rect.left
      this.mouse.y = cy - rect.top
      this.mouse.active = true
    }
    const leave = () => { this.mouse.active = false }
    const click = (e: MouseEvent) => {
      if (!this.opts.shockwaveOnClick || !this._ready) return
      const rect = this.root.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const cx = ((e as MouseEvent).clientX - rect.left) * dpr
      const cy = ((e as MouseEvent).clientY - rect.top) * dpr
      const diag = Math.sqrt((rect.width * dpr) ** 2 + (rect.height * dpr) ** 2)
      this.shockwaves.push({ cx, cy, radius: 0, maxRadius: diag, strength: 1900, born: this.time })
    }

    this.root.addEventListener('mousemove', move as EventListener)
    this.root.addEventListener('touchmove', move as EventListener, { passive: true })
    this.root.addEventListener('mouseleave', leave)
    this.root.addEventListener('touchend', leave)
    this.root.addEventListener('click', click)
  }

  _startFilmGrain() {
    const gCtx = this.grainCanvas.getContext('2d')
    if (!gCtx) return
    const draw = () => {
      const pal = this.palette
      const w = this.grainCanvas.width, h = this.grainCanvas.height
      const imgData = gCtx.createImageData(w, h)
      const d = imgData.data
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * pal.filmGrainValue
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = pal.filmGrainAlpha
      }
      gCtx.putImageData(imgData, 0, 0)
    }
    draw()
    if (this._grainInterval) clearInterval(this._grainInterval)
    this._grainInterval = window.setInterval(draw, 80)
  }

  _resizeCanvas() {
    const rect = this.root.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = rect.width * dpr; this.canvas.height = rect.height * dpr
    this.canvas.style.width = `${rect.width}px`; this.canvas.style.height = `${rect.height}px`
    this.ringsCanvas.width = rect.width * dpr; this.ringsCanvas.height = rect.height * dpr
    this.ringsCanvas.style.width = `${rect.width}px`; this.ringsCanvas.style.height = `${rect.height}px`
    this.grainCanvas.width = rect.width * 0.5; this.grainCanvas.height = rect.height * 0.5
    this.grainCanvas.style.width = `${rect.width}px`; this.grainCanvas.style.height = `${rect.height}px`
  }

  _onResize() {
    this._resizeCanvas()
    this._allocateParticles(this.particleCount)
  }

  _reveal() {
    if (this.revealed) return
    this.revealed = true
    const els = this.contentEl.querySelectorAll('[data-erosion-reveal]')
    const tl = createTimeline({ defaults: { duration: 1200, ease: 'outQuint' } })
    const startDelay = (this.opts.clearRadius as number) > 0 ? 100 : 500
    els.forEach((el, i) => {
      const chars = el.querySelectorAll('.erosion-char')
      if (chars.length > 0) {
        tl.add(chars, {
          y: [100, 0], opacity: [0, 1], rotateX: [120, 0], scale: [0.7, 1],
          delay: stagger(35, { from: 'center' }), duration: 1400,
        }, i === 0 ? startDelay : '-=1000')
      } else {
        tl.add(el, { y: [60, 0], opacity: [0, 1], scale: [0.9, 1], duration: 1100 }, i === 0 ? startDelay : '-=800')
      }
    })
  }

  _drawRings(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, time: number) {
    ctx.clearRect(0, 0, w, h)
    const pal = this.palette
    const [pr, pg, pb] = pal.peakRgb
    const [sr, sg, sb] = pal.shockwaveRgb
    for (const sw of this.shockwaves) {
      const age = time - sw.born
      const opacity = Math.max(0, 1 - age * 0.35)
      if (opacity <= 0) continue

      const outerWidth = Math.max(1, (40 - age * 10) * dpr)
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(opacity * 0.2).toFixed(3)})`
      ctx.lineWidth = outerWidth
      ctx.beginPath(); ctx.arc(sw.cx, sw.cy, sw.radius, 0, Math.PI * 2); ctx.stroke()

      const innerWidth = Math.max(0.5, (16 - age * 5) * dpr)
      ctx.strokeStyle = `rgba(${pr},${pg},${pb},${(opacity * 0.35).toFixed(3)})`
      ctx.lineWidth = innerWidth
      ctx.beginPath(); ctx.arc(sw.cx, sw.cy, sw.radius, 0, Math.PI * 2); ctx.stroke()

      if (age < 0.3) {
        const flash = 1 - age / 0.3
        ctx.strokeStyle = `rgba(255,255,255,${(flash * flash * 0.4).toFixed(3)})`
        ctx.lineWidth = innerWidth * 0.4
        ctx.beginPath(); ctx.arc(sw.cx, sw.cy, sw.radius, 0, Math.PI * 2); ctx.stroke()
      }
    }
  }

  _tick = () => {
    if (this._destroyed) return
    const dt = 1 / 60
    const time = (this.time += dt)
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width, h = this.canvas.height
    const mx = this.mouse.x * dpr, my = this.mouse.y * dpr

    const windX = (mx - this.prevMouse.x) * 0.3
    const windY = (my - this.prevMouse.y) * 0.3
    this.prevMouse.x = mx; this.prevMouse.y = my

    for (let s = this.shockwaves.length - 1; s >= 0; s--) {
      const sw = this.shockwaves[s]
      const age = time - sw.born
      sw.radius += (600 + 200 / (1 + age * 2)) * dpr * dt
      if (sw.radius > sw.maxRadius || age > 4) this.shockwaves.splice(s, 1)
    }

    const clearR = (this.opts.clearRadius as number) > 0 ? Math.min(w, h) * (this.opts.clearRadius as number) : 0
    const centerX = w / 2, centerY = h / 2
    const u = this._uniformData
    u[0] = time; u[1] = dt; u[2] = w; u[3] = h
    u[4] = mx; u[5] = my; u[6] = this.mouse.active ? 1 : 0; u[7] = dpr
    u[8] = windX; u[9] = windY; u[10] = 0; u[11] = Math.min(this.shockwaves.length, MAX_SHOCKWAVES)
    u[12] = this.opts.erosionRadius as number; u[13] = this.opts.erosionStrength as number; u[14] = this.opts.healRate as number; u[15] = this.opts.gravity as number
    u[16] = this.opts.turbulence as number; u[17] = this.opts.vortexStrength as number; u[18] = clearR; u[19] = centerX
    u[20] = centerY; u[21] = 0; u[22] = 0; u[23] = 0
    this.device!.queue.writeBuffer(this.uniformBuffer!, 0, u)

    const sd = this._shockwaveData
    sd.fill(0)
    for (let s = 0; s < Math.min(this.shockwaves.length, MAX_SHOCKWAVES); s++) {
      const sw = this.shockwaves[s]
      const o = s * 8
      sd[o + 0] = sw.cx; sd[o + 1] = sw.cy; sd[o + 2] = sw.radius; sd[o + 3] = sw.maxRadius
      sd[o + 4] = sw.strength; sd[o + 5] = sw.born; sd[o + 6] = 0; sd[o + 7] = 0
    }
    this.device!.queue.writeBuffer(this.shockwaveBuffer!, 0, sd)

    const pal = this.palette
    const ru = this._renderUniformData
    ru[0] = pal.grainRgb[0]; ru[1] = pal.grainRgb[1]; ru[2] = pal.grainRgb[2]; ru[3] = 0
    ru[4] = pal.emberRgb[0]; ru[5] = pal.emberRgb[1]; ru[6] = pal.emberRgb[2]; ru[7] = 0
    ru[8] = pal.peakRgb[0]; ru[9] = pal.peakRgb[1]; ru[10] = pal.peakRgb[2]; ru[11] = 0
    ru[12] = w; ru[13] = h; ru[14] = dpr; ru[15] = 0
    this.device!.queue.writeBuffer(this.renderUniformBuffer!, 0, ru)

    const encoder = this.device!.createCommandEncoder()
    const cpass = encoder.beginComputePass()
    cpass.setPipeline(this.computePipeline!)
    cpass.setBindGroup(0, this.computeBindGroup!)
    cpass.dispatchWorkgroups(Math.ceil(this.particleCount / 256))
    cpass.end()

    const view = this.context!.getCurrentTexture().createView()
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }],
    })
    rpass.setPipeline(this.renderPipeline!)
    rpass.setBindGroup(0, this.renderBindGroup!)
    rpass.draw(6, this.particleCount)

    ru[15] = 1
    this.device!.queue.writeBuffer(this.renderUniformBuffer!, 0, ru)
    rpass.setPipeline(this.glowPipeline!)
    rpass.setBindGroup(0, this.glowBindGroup!)
    rpass.draw(6, this.particleCount)
    rpass.end()

    this.device!.queue.submit([encoder.finish()])

    const ringsCtx = this.ringsCanvas.getContext('2d')
    if (ringsCtx) this._drawRings(ringsCtx, w, h, dpr, time)

    this.raf = requestAnimationFrame(this._tick)
  }

  destroy() {
    this._destroyed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this._onResize)
    if (this._grainInterval) clearInterval(this._grainInterval)
    if (this.particleBuffer) this.particleBuffer.destroy()
  }
}

/* ────────────────────────────────────────────────────────────
 * React component
 * ──────────────────────────────────────────────────────────── */

export const ErosionBackground = ({ theme = 'ember' }: { theme?: string }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<Erosion | null>(null)
  const [webGpuAvailable, setWebGpuAvailable] = useState(true)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const instance = new Erosion(root, {
      particleCount: PARTICLE_COUNT,
      erosionRadius: 140,
      erosionStrength: 8000,
      healRate: 0.005,
      gravity: 50,
      turbulence: 30,
      vortexStrength: 0.45,
      shockwaveOnClick: true,
      clearRadius: 0.38,
      filmGrain: true,
      vignette: true,
      theme,
    })

    instanceRef.current = instance

    async function init() {
      try {
        await instance.init()
      } catch (err) {
        console.error(err)
        setWebGpuAvailable(false)
      }
    }

    init()

    const handleResize = () => instance._onResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      instance.destroy()
      instanceRef.current = null
    }
  }, [theme])

  return (
    <div className="erosion-container" ref={rootRef}>
      <div className="erosion-content" id="erosion-content">
        <div style={{ display: 'none' }}>
          <h1 className="erosion-title" data-erosion-reveal id="title-el" />
          <p className="erosion-sub" data-erosion-reveal id="sub-el" />
          <div className="erosion-footer" data-erosion-reveal id="footer-el">
            <div className="erosion-footer-line" />
            <span className="erosion-footer-label">& CLICK YOUR MOUSE</span>
            <div className="erosion-footer-line" />
          </div>
        </div>
      </div>
      <canvas className="erosion-canvas" id="erosion-canvas" />
      <canvas className="erosion-rings" id="erosion-rings" />
      <canvas className="erosion-grain" id="erosion-grain" />
      <div className="erosion-vignette" id="erosion-vignette" />
      {!webGpuAvailable && (
        <div
          id="erosion-fallback"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2rem',
            background: '#0a0a0a',
            color: '#ddd',
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          <div>
            <h2 style={{ fontWeight: 300, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
              WebGPU isn't available here
            </h2>
            <p>
              This needs a WebGPU-capable browser — current Chrome, Edge, or Safari Technology Preview.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
