// Interactive shader wallpapers.
//
// Each wallpaper is a WebGL2 fragment shader rendered on a single fullscreen
// triangle (no geometry buffers, no external dependencies). Every shader
// reacts to the pointer, and most respond to clicks. Persistence across page
// navigation is handled by the renderer, which lives in the always-mounted
// root layout.
//
// Contrast budget: all shaders compose their pattern over the page background
// with a shared, *measured* intensity (budget()). The budget is the largest
// value that keeps the lightest functional text colour at WCAG AA (4.5:1)
// against the worst-case background pixel, per theme. See
// scripts/contrast-budget.mjs. Guards: light -> gray-600, dark -> gray-300
// (dark secondary UI text is lifted to gray-300 so the wallpaper can be
// brighter while staying AA). Measured limits 0.288 / 0.495, applied with a
// hair of margin as 0.28 / 0.49.
//
// All shaders share a common GLSL preamble (`HEAD`) that exposes:
//   uResolution, uTime, uMouse (0..1, y-up), uMouseVel, uTheme (0 light / 1
//   dark), uHue (accent hue in degrees), uActive (recent pointer activity
//   0..1), uMotion (0 when prefers-reduced-motion, else 1)
// plus helpers: hash21/vnoise/fbm/flowField/hsv2rgb and the theming helpers
// baseBg()/accentCol()/compose()/budget().

export type ShaderId = "off" | "ink" | "contour" | "moire" | "hex" | "waves" | "spiral";

export interface ShaderMeta {
  id: Exclude<ShaderId, "off">;
  /** English label shown in the picker. */
  en: string;
  /** Japanese label shown in the picker. */
  ja: string;
}

export interface SimpleShaderDef extends ShaderMeta {
  kind: "simple";
  frag: string;
}

export interface FeedbackShaderDef extends ShaderMeta {
  kind: "feedback";
  /** Simulation pass: reads previous state texture, writes next state. */
  simFrag: string;
  /** Display pass: turns the state texture into a themed, subtle colour. */
  showFrag: string;
}

export type ShaderDef = SimpleShaderDef | FeedbackShaderDef;

/** Shared GLSL preamble prepended to every fragment shader. */
const HEAD = `#version 300 es
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uMouse;
uniform vec2  uMouseVel;
uniform float uTheme;
uniform float uHue;
uniform float uActive;
uniform float uMotion;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
vec2 flowField(vec2 p){
  float e = 0.01;
  float a = fbm(p + vec2(0.0, e));
  float b = fbm(p - vec2(0.0, e));
  float c = fbm(p + vec2(e, 0.0));
  float d = fbm(p - vec2(e, 0.0));
  return vec2(a - b, -(c - d)) / (2.0 * e);
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
// Base page background. Light: near-white (~gray-50). Dark: tailwind gray-900.
vec3 baseBg(){ return mix(vec3(0.961, 0.965, 0.973), vec3(0.067, 0.094, 0.153), uTheme); }
// Accent derived from the key-visual hue.
vec3 accentCol(){
  float h = uHue / 360.0;
  float s = mix(0.50, 0.55, uTheme);
  float v = mix(0.62, 0.66, uTheme);
  return hsv2rgb(vec3(h, s, v));
}
// Measured contrast budget: the most a pattern may pull the background toward
// the accent while keeping functional text at WCAG AA. See contrast-budget.mjs.
const float BUDGET_LIGHT = 0.28;
const float BUDGET_DARK = 0.49;
float budget(){ return mix(BUDGET_LIGHT, BUDGET_DARK, uTheme); }
// Blend a 0..1 pattern over the base background.
vec3 compose(float pattern, float intensity){
  return mix(baseBg(), accentCol(), clamp(pattern, 0.0, 1.0) * intensity);
}
`;

/** Fullscreen-triangle vertex shader (no attributes; uses gl_VertexID). */
export const VERTEX_SRC = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// --- Ink — a true feedback fluid ------------------------------------------
// The simulation pass advects, diffuses and decays a dye field stored in a
// texture; the pointer injects dye and clicks splash it. The renderer keeps
// the state textures alive across navigation, so the ink is never reset.
const inkSimFrag = `${HEAD}
uniform sampler2D uPrev;
uniform vec3 uClick; // xy = last click (0..1, y-up), z = seconds since click
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 texel = 1.0 / uResolution.xy;
  float ar = uResolution.x / uResolution.y;

  float dye = texture(uPrev, uv).r;

  // Diffuse (4-neighbour blur).
  float nb = texture(uPrev, uv + vec2(0.0, texel.y)).r
           + texture(uPrev, uv - vec2(0.0, texel.y)).r
           + texture(uPrev, uv + vec2(texel.x, 0.0)).r
           + texture(uPrev, uv - vec2(texel.x, 0.0)).r;
  dye = mix(dye, nb * 0.25, 0.20);

  // Advect along a divergence-free curl-noise flow.
  vec2 fl = flowField(uv * 2.5 + uTime * 0.04) * 0.0016;
  dye = mix(dye, texture(uPrev, uv - fl).r, 0.55);

  // Decay so old dye fades.
  dye *= 0.9925;

  // Faint ambient emitters keep the field alive while idle.
  float amb = smoothstep(0.88, 1.0, fbm(uv * 3.0 + vec2(0.0, uTime * 0.05)));
  dye += amb * 0.010 * uMotion;

  // Pointer injects dye (stronger while moving fast). Gated by recent activity
  // so an idle cursor parked at the centre never accumulates a stuck blob.
  vec2 dm = (uv - uMouse); dm.x *= ar;
  dye += exp(-dot(dm, dm) * 220.0) * clamp(0.05 + 2.5 * length(uMouseVel), 0.0, 0.6) * uActive;

  // Click splash.
  vec2 dc = (uv - uClick.xy); dc.x *= ar;
  dye += exp(-dot(dc, dc) * 110.0) * exp(-uClick.z * 3.5) * 0.45;

  dye = clamp(dye, 0.0, 1.0);
  fragColor = vec4(dye, dye, dye, 1.0);
}
`;

const inkShowFrag = `${HEAD}
uniform sampler2D uPrev;
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float dye = texture(uPrev, uv).r;
  float pattern = pow(clamp(dye, 0.0, 1.0), 0.85);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Contour — animated topographic lines ---------------------------------
// Iso-lines of a slowly drifting noise field. The cursor warps the terrain
// and clicks raise a gentle, broad swell (kept soft so the click point does
// not turn into a tight spiky bullseye).
const contourFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.03;

  vec2 q = p * 2.2 + vec2(t, -t);
  q += 0.3 * normalize(p - m + 1e-4) * exp(-length(p - m) * 2.0) * (0.5 + uActive);
  float height = fbm(q);

  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    float dd = length(p - rc);
    height += 0.16 * exp(-dd * dd * 4.0) * exp(-age * 0.7);
  }

  float hi = height * 12.0;
  float f = abs(fract(hi) - 0.5);
  float aa = fwidth(hi) * 1.5;
  float pattern = smoothstep(aa, 0.0, f);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Moiré — interfering ring fields --------------------------------------
// Two concentric ring patterns (one drifting, one centred on the cursor) beat
// against each other into sweeping moiré fringes. Clicks add a transient ring.
const moireFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.2;
  float freq = 34.0;

  vec2 c1 = vec2(0.5 * ar, 0.5) + 0.12 * vec2(sin(t), cos(t * 0.8));
  float a = 0.5 + 0.5 * sin(length(p - c1) * freq);
  float b = 0.5 + 0.5 * sin(length(p - m) * freq);
  float inter = a * b;

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    float rr = length(p - rc);
    burst += (0.5 + 0.5 * sin(rr * freq - age * 8.0)) * exp(-rr * 2.2) * exp(-age * 1.0);
  }

  float pattern = smoothstep(0.5, 0.92, inter) + 0.5 * burst;
  fragColor = vec4(compose(clamp(pattern, 0.0, 1.0), budget()), 1.0);
}
`;

// --- Hex — a honeycomb grid -----------------------------------------------
// A hexagonal tessellation whose rims glow; cells near the cursor light up and
// clicks send a brightening ring through the lattice.
const hexFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float scale = 9.0;
  vec2 gp = p * scale;

  vec2 r = vec2(1.0, 1.7320508);
  vec2 hh = r * 0.5;
  vec2 a = mod(gp, r) - hh;
  vec2 b = mod(gp - hh, r) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = (gp - gv) / scale;

  float hd = hexDist(gv);
  float aa = fwidth(hd) * 1.5;
  float border = smoothstep(0.5 - 0.04 - aa, 0.5 - 0.04, hd);

  float hi = exp(-length(id - m) * 3.5) * (0.35 + 0.8 * uActive);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.08, 0.0, abs(length(id - rc) - age * 0.45)) * exp(-age * 1.2);
  }

  float pattern = clamp(border + hi * 0.7 + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Waves — layered horizontal wavebands ---------------------------------
// Five scrolling sine ribbons; their amplitude swells around the cursor's x
// position and clicks send a transverse pulse across them.
const wavesFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 m = uMouse;
  float t = uTime * 0.3;

  float dxm = (uv.x - m.x) * 3.0;
  float bump = exp(-dxm * dxm) * (0.5 + uActive);

  float pattern = 0.0;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float baseY = 0.18 + 0.16 * fi;
    float amp = (0.025 + 0.012 * sin(t + fi)) * (1.0 + 1.6 * bump);
    float y = baseY + amp * sin(uv.x * 8.0 + t * (1.0 + 0.2 * fi) + fi);
    float d = abs(uv.y - y);
    float aa = fwidth(uv.y) * 1.5 + 0.002;
    pattern += smoothstep(0.012 + aa, 0.0, d);
  }

  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i];
    float dx = abs(uv.x - rc.x);
    pattern += smoothstep(0.03, 0.0, abs(dx - age * 0.4)) * exp(-age * 1.5) * 0.6;
  }

  fragColor = vec4(compose(clamp(pattern, 0.0, 1.0), budget()), 1.0);
}
`;

// --- Spiral — a rotating vortex -------------------------------------------
// A three-arm spiral that turns near the cursor; clicks emit an expanding
// ring. The integer arm count keeps the arms seamless (no atan branch line).
const spiralFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  vec2 c = mix(vec2(0.5 * ar, 0.5), m, 0.5);
  vec2 d = p - c;
  float r = length(d);
  float a = atan(d.y, d.x);
  float t = uTime * 0.3;

  float ph = a * 3.0 + r * 8.0 - t * 2.0;
  float spiral = smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(ph)) * exp(-r * 0.9);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.05, 0.0, abs(length(p - rc) - age * 0.5)) * exp(-age * 1.2);
  }

  float pattern = clamp(spiral + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "ink", kind: "feedback", en: "Ink", ja: "インク", simFrag: inkSimFrag, showFrag: inkShowFrag },
  { id: "contour", kind: "simple", en: "Contour", ja: "等高線", frag: contourFrag },
  { id: "moire", kind: "simple", en: "Moiré", ja: "モアレ", frag: moireFrag },
  { id: "hex", kind: "simple", en: "Hex", ja: "ハニカム", frag: hexFrag },
  { id: "waves", kind: "simple", en: "Waves", ja: "ウェーブ", frag: wavesFrag },
  { id: "spiral", kind: "simple", en: "Spiral", ja: "スパイラル", frag: spiralFrag },
];

/** Every id including the solid "off" option, in picker order. */
export const SHADER_IDS: ShaderId[] = ["off", ...SHADERS.map((s) => s.id)];

/** Default wallpaper used when nothing is stored yet. */
export const DEFAULT_SHADER: ShaderId = "ink";

/** Localised label for the "off" (solid background) option. */
export const OFF_LABEL = { en: "Off", ja: "オフ" } as const;

export function getShaderDef(id: ShaderId): ShaderDef | undefined {
  return SHADERS.find((s) => s.id === id);
}

export function isShaderId(value: string | null): value is ShaderId {
  return value != null && (SHADER_IDS as string[]).includes(value);
}
