import { useEffect, useRef } from 'react'
import './ProjectVisual.css'

export type ProjectVisualVariant = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6'

type Props = {
  variant: ProjectVisualVariant | string
  /** hex accent from `site.projects[].accent` */
  accent?: string
  /** true while the card is hovered */
  active?: boolean
  className?: string
}

/* --------------------------------------------------------------------------
   GLSL
   -------------------------------------------------------------------------- */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const HEAD = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_accent;
uniform float u_active;

#define PI 3.14159265359

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// subtle grain + vignette shared by every panel
vec3 grade(vec3 col, vec2 uv, float t) {
  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * 0.85;                  // vignette
  col += (hash(uv * u_res + t) - 0.5) * 0.035;     // film grain
  col = mix(col, col * col * 3.2, 0.25);           // gentle contrast
  return col;
}
`

const BODIES: Record<ProjectVisualVariant, string> = {
  /* PRISME — faceted glass refraction with chromatic split bands */
  p1: `
void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.12;

  // diamond silhouette
  vec2 p = (uv - vec2(0.5, 0.52)) * vec2(u_res.x / u_res.y, 1.0);
  float d = abs(p.x) * 1.0 + abs(p.y) * 1.35;
  float inside = smoothstep(0.46, 0.44, d);

  // faceting: three overlapping crystal blades
  float f1 = abs(fract(uv.y * 3.0 + uv.x * 1.6 + t) - 0.5);
  float f2 = abs(fract(uv.y * 2.2 - uv.x * 2.4 - t * 0.7) - 0.5);
  float facet = smoothstep(0.5, 0.0, f1) + smoothstep(0.5, 0.0, f2) * 0.7;

  // refraction bands with chromatic separation
  vec2 warp = vec2(fbm(uv * 3.0 + t), fbm(uv * 3.0 - t + 12.0)) - 0.5;
  float band = fract((uv.x * 2.4 + uv.y * 1.1 + warp.x * 0.6 + t) * 1.0);
  vec3 glass = vec3(0.0);
  glass.r += smoothstep(0.4, 1.0, band + 0.06) * 0.9;
  glass.g += smoothstep(0.4, 1.0, band) * 0.85;
  glass.b += smoothstep(0.4, 1.0, band - 0.06) * 1.0;

  float core = smoothstep(0.42, 0.0, d) * (0.35 + 0.65 * fbm(uv * 5.0 + t * 2.0));
  vec3 col = vec3(0.02, 0.012, 0.05);
  col += inside * (glass * 0.55 + facet * u_accent * 0.35);
  col += core * mix(u_accent, vec3(1.0), 0.55) * (0.5 + u_active * 0.7);

  // crisp facet edges
  float edge = 1.0 - smoothstep(0.0, 0.012, abs(fract(uv.y * 3.0 + uv.x * 1.6 + t) - 0.5));
  col += edge * inside * vec3(0.65, 0.75, 1.0) * 0.20;
  gl_FragColor = vec4(grade(col, uv, u_time), 1.0);
}
`,

  /* ORA — volumetric dome, rising particles */
  p2: `
void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - vec2(0.5, 0.18)) * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time * 0.16;
  float r = length(p);

  vec3 col = vec3(0.02, 0.012, 0.05);
  // concentric rings
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float rr = 0.16 + fi * 0.11 + sin(t + fi * 0.7) * 0.012;
    float ring = 1.0 - smoothstep(0.0, 0.007, abs(r - rr));
    col += ring * mix(u_accent, vec3(0.75, 0.85, 1.0), fi / 7.0) * (0.30 - fi * 0.025);
  }

  // dome body
  float dome = smoothstep(0.95, 0.05, r) * smoothstep(0.02, 0.4, uv.y);
  col += dome * u_accent * 0.16;

  // rising particles
  vec2 g = fract(uv * vec2(14.0, 9.0));
  vec2 id = floor(uv * vec2(14.0, 9.0));
  float h = hash(id);
  float rise = fract(uv.y * 1.0 + t * (0.4 + h) + h * 3.0);
  float dot1 = smoothstep(0.06, 0.0, length((g - 0.5) * vec2(1.0, 1.6)) - 0.015);
  col += dot1 * (0.35 + u_active * 0.6) * mix(u_accent, vec3(1.0), 0.4) * rise;

  gl_FragColor = vec4(grade(col, uv, u_time), 1.0);
}
`,

  /* SILENCE RADIO — stacked waveform bands */
  p3: `
void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.5;
  vec3 col = vec3(0.02, 0.012, 0.05);

  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float y = 0.12 + fi * 0.05;
    float amp = 0.03 + 0.045 * fbm(vec2(fi * 0.7, t * 0.12)) * (1.0 + u_active * 1.4);
    float wave = y
      + sin(uv.x * 7.0 + fi * 0.6 + t * 1.4) * amp
      + sin(uv.x * 19.0 - t * 2.1 + fi) * amp * 0.35;
    float line = 1.0 - smoothstep(0.0, 0.006, abs(uv.y - wave));
    col += line * mix(u_accent, vec3(0.85, 0.9, 1.0), fi / 16.0) * (0.55 - fi * 0.02);
  }

  float glow = smoothstep(0.9, 0.0, abs(uv.y - 0.5) * 1.6);
  col += glow * u_accent * 0.08;
  gl_FragColor = vec4(grade(col, uv, u_time), 1.0);
}
`,

  /* NUIT BLANCHE — point cloud facade */
  p4: `
void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.18;
  vec3 col = vec3(0.02, 0.012, 0.05);

  // perspective facade plane
  vec2 q = vec2((uv.x - 0.5) / (0.35 + uv.y * 0.9), uv.y);
  vec2 grid = q * vec2(16.0, 12.0);
  vec2 id = floor(grid);
  vec2 g = fract(grid) - 0.5;

  float h = fbm(id * 0.35 + t);
  vec2 offset = vec2(sin(t + h * 6.28), cos(t * 0.7 + h * 6.28)) * 0.14 * h;
  float dot1 = smoothstep(0.16, 0.0, length(g - offset));
  float depth = smoothstep(1.0, 0.0, uv.y) * (0.35 + h * 0.9);
  col += dot1 * depth * mix(u_accent, vec3(0.9, 0.95, 1.0), h * 0.7) * (0.8 + u_active * 0.8);

  // building silhouettes
  float blocks = step(0.35, fbm(vec2(floor(q.x * 9.0), 0.5)));
  col += blocks * u_accent * 0.05 * (1.0 - uv.y);
  gl_FragColor = vec4(grade(col, uv, u_time), 1.0);
}
`,

  /* MINERAL — fbm mineral surface with rim light */
  p5: `
void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.06;
  vec3 col = vec3(0.02, 0.012, 0.05);

  vec2 p = uv * 3.2;
  float h = fbm(p + t);
  float h2 = fbm(p * 2.7 - t * 1.3 + 4.0);
  float shade = smoothstep(0.25, 0.85, h * 0.75 + h2 * 0.45);

  // fake normal from the height field
  float e = 0.02;
  float hx = fbm(p + vec2(e, 0.0) + t) - h;
  float hy = fbm(p + vec2(0.0, e) + t) - h;
  vec3 n = normalize(vec3(-hx, -hy, 0.22));
  vec3 l = normalize(vec3(-0.5, 0.7, 0.6));
  float diff = max(dot(n, l), 0.0);

  col += shade * (0.18 + diff * 0.55) * mix(u_accent, vec3(0.6, 0.6, 0.72), 0.55);

  // violet rim
  float rim = pow(1.0 - abs(n.x), 3.0) * shade;
  col += rim * mix(u_accent, vec3(1.0), 0.25) * (0.9 + u_active * 0.8);
  gl_FragColor = vec4(grade(col, uv, u_time), 1.0);
}
`,

  /* ÉCHO — breathing circles with an echo trail */
  p6: `
void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.22;
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec3 col = vec3(0.02, 0.012, 0.05);

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float phase = t - fi * 0.45;
    float r = 0.07 + fract(phase * 0.35) * 0.42;
    float fade = (1.0 - fract(phase * 0.35)) * (1.0 - fi / 6.0);
    float ring = 1.0 - smoothstep(0.0, 0.012, abs(length(p) - r));
    col += ring * fade * mix(u_accent, vec3(1.0), fi / 6.0) * (0.55 + u_active * 0.5);
  }

  float core = smoothstep(0.1, 0.0, length(p)) * (0.7 + 0.3 * sin(t * 2.0));
  col += core * mix(u_accent, vec3(1.0), 0.5) * 0.8;
  gl_FragColor = vec4(grade(col, uv, u_time), 1.0);
}
`,
}

/* --------------------------------------------------------------------------
   WebGL plumbing
   -------------------------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const int = Number.parseInt(full.slice(0, 6) || 'a855f7', 16)
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export default function ProjectVisual({ variant, accent = '#a855f7', active = false, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return

    const gl = (canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return

    const body = BODIES[(variant as ProjectVisualVariant) in BODIES ? (variant as ProjectVisualVariant) : 'p1']
    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, `${HEAD}\n${body}`)
    if (!vert || !frag) {
      if (vert) gl.deleteShader(vert)
      if (frag) gl.deleteShader(frag)
      return
    }

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uRes = gl.getUniformLocation(program, 'u_res')
    const uAccent = gl.getUniformLocation(program, 'u_accent')
    const uActive = gl.getUniformLocation(program, 'u_active')
    gl.uniform3fv(uAccent, hexToRgb(accent))

    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    let width = 1
    let height = 1

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (w === width && h === height) return
      width = w
      height = h
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
      draw(performance.now())
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let visible = false
    let disposed = false
    const start = performance.now()

    const draw = (now: number) => {
      if (disposed) return
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform1f(uActive, activeRef.current ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = (now: number) => {
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    const play = () => {
      if (reduced || raf) return
      raf = requestAnimationFrame(loop)
    }
    const pause = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting
        if (visible && document.visibilityState === 'visible') play()
        else pause()
      },
      { rootMargin: '120px' },
    )
    io.observe(host)

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && visible) play()
      else pause()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()
    draw(performance.now())

    return () => {
      disposed = true
      pause()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
  }, [variant, accent])

  return (
    <div className={className ? `project-visual ${className}` : 'project-visual'} ref={hostRef} aria-hidden="true">
      <canvas className="project-visual__canvas" ref={canvasRef} />
    </div>
  )
}
