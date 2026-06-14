// Interactive shader wallpapers.
//
// Each wallpaper is a WebGL2 fragment shader rendered on a single fullscreen
// triangle (no geometry buffers, no external dependencies). Every shader
// reacts to the pointer and to clicks. Persistence across page navigation is
// handled by the renderer, which lives in the always-mounted root layout.
//
// The lineup is a honeycomb family. Two render the lattice itself (a clean
// hex grid and a molten, noise-warped one); the rest fill the cells with
// colour that *propagates* across the comb — radiating pulses, a directional
// flow, a drifting bloom and a twinkling ember field. All cell fills are
// sampled at the cell centre so colour spreads cell-by-cell, like the
// honeycomb's click ripple.
//
// Contrast budget: all shaders compose their pattern over the page background
// with a shared, *measured* intensity (budget()). The budget is the largest
// value that keeps the lightest functional text colour at WCAG AA (4.5:1)
// against the worst-case background pixel, per theme. See
// scripts/contrast-budget.mjs (guards: light gray-600, dark gray-300;
// measured limits 0.288 / 0.495, applied as 0.28 / 0.49).
//
// All shaders share a common GLSL preamble (`HEAD`) that exposes:
//   uResolution, uTime, uMouse (0..1, y-up), uMouseVel, uTheme (0 light / 1
//   dark), uHue (accent hue in degrees), uActive (recent pointer activity
//   0..1), uMotion (0 when prefers-reduced-motion, else 1)
// plus helpers: hash21/vnoise/fbm/hsv2rgb, hexDist/hexCell and the theming
// helpers baseBg()/accentCol()/compose()/budget().

export type ShaderId = "off" | "hex" | "warp" | "pulse" | "flow" | "bloom" | "ember";

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
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
// Hexagonal tiling. Input is grid-space (p * scale). Returns the cell centre
// (xy, still in grid space) and the distance to the cell edge (z, ~0.5 at the
// border). Divide the centre by the same scale to get back to p-space.
vec3 hexCell(vec2 gp){
  vec2 r = vec2(1.0, 1.7320508);
  vec2 hh = r * 0.5;
  vec2 a = mod(gp, r) - hh;
  vec2 b = mod(gp - hh, r) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec3(gp - gv, hexDist(gv));
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

// --- Hex — a clean honeycomb lattice --------------------------------------
// Hairline rims; cells near the cursor light up and clicks send a brightening
// ring propagating through the lattice.
const hexFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float scale = 8.0;

  vec3 hc = hexCell(p * scale);
  vec2 id = hc.xy / scale;
  float aa = fwidth(hc.z) * 1.2;
  float rim = smoothstep(0.5 - 0.005 - aa, 0.5 - 0.005, hc.z);

  float hi = exp(-length(id - m) * 3.5) * (0.3 + 0.8 * uActive);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.08, 0.0, abs(length(id - rc) - age * 0.45)) * exp(-age * 1.2);
  }

  float pattern = clamp(rim + hi * 0.55 + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Warp — a molten honeycomb --------------------------------------------
// The hex lattice with coordinates domain-warped by drifting noise so the comb
// flows and melts; the cursor adds a local swirl.
const warpFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.05;

  vec2 wp = p + 0.12 * vec2(fbm(p * 1.8 + t), fbm(p * 1.8 + 9.0 - t));
  wp += 0.12 * normalize(p - m + 1e-4) * exp(-length(p - m) * 2.2) * (0.4 + uActive);

  float scale = 8.0;
  vec3 hc = hexCell(wp * scale);
  float aa = fwidth(hc.z) * 1.2;
  float rim = smoothstep(0.5 - 0.006 - aa, 0.5 - 0.006, hc.z);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.07, 0.0, abs(length(p - rc) - age * 0.5)) * exp(-age * 1.2);
  }

  float pattern = clamp(rim + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Pulse — sonar rings through the comb ---------------------------------
// Concentric colour fronts radiate from the cursor, lighting whole cells as
// they pass; clicks emit their own propagating rings.
const pulseFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float scale = 8.0;

  vec3 hc = hexCell(p * scale);
  vec2 id = hc.xy / scale;
  float aa = fwidth(hc.z) * 1.2;
  float rim = smoothstep(0.5 - 0.006 - aa, 0.5 - 0.006, hc.z);

  float dcur = length(id - m);
  float wave = 0.5 + 0.5 * sin(dcur * 9.0 - uTime * 1.6);
  float fill = smoothstep(0.55, 1.0, wave) * exp(-dcur * 0.5);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    float dd = length(id - rc);
    burst += smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(dd * 9.0 - age * 7.0)) * exp(-dd * 1.4) * exp(-age);
  }

  float pattern = clamp(rim * 0.7 + fill * 0.85 + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Flow — a directional colour sweep ------------------------------------
// Bands of colour sweep diagonally across the comb, lit per cell; the cursor's
// x position steers the direction.
const flowFrag = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  float scale = 8.0;

  vec3 hc = hexCell(p * scale);
  vec2 id = hc.xy / scale;
  float aa = fwidth(hc.z) * 1.2;
  float rim = smoothstep(0.5 - 0.006 - aa, 0.5 - 0.006, hc.z);

  float ang = (uMouse.x - 0.5) * 3.1416 + uTime * 0.04;
  vec2 dir = vec2(cos(ang), sin(ang));
  float band = 0.5 + 0.5 * sin(dot(id, dir) * 4.0 - uTime * 1.0);
  float fill = smoothstep(0.5, 1.0, band) * (0.7 + 0.6 * uActive);

  float pattern = clamp(rim * 0.7 + fill * 0.8, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Bloom — a drifting colour bloom --------------------------------------
// Slow fBm decides which cells are coloured, so soft patches of colour migrate
// across the comb; the cursor blooms nearby cells and clicks ripple outward.
const bloomFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float scale = 8.0;

  vec3 hc = hexCell(p * scale);
  vec2 id = hc.xy / scale;
  float aa = fwidth(hc.z) * 1.2;
  float rim = smoothstep(0.5 - 0.006 - aa, 0.5 - 0.006, hc.z);

  float t = uTime * 0.06;
  float v = fbm(id * 1.6 + vec2(t, -t));
  float fill = smoothstep(0.5, 0.85, v);
  fill = max(fill, exp(-length(id - m) * 2.5) * (0.3 + uActive));

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    float dd = length(id - rc);
    burst += smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(dd * 8.0 - age * 6.0)) * exp(-dd * 1.5) * exp(-age);
  }

  float pattern = clamp(rim * 0.7 + fill * 0.8 + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Ember — a twinkling cell field ---------------------------------------
// Each cell has its own slow twinkle phase, so sparse cells glow and fade like
// embers; the cursor ignites the cells around it and clicks spark a ring.
const emberFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float scale = 8.0;

  vec3 hc = hexCell(p * scale);
  vec2 id = hc.xy / scale;
  float aa = fwidth(hc.z) * 1.2;
  float rim = smoothstep(0.5 - 0.006 - aa, 0.5 - 0.006, hc.z);

  float seed = hash21(hc.xy + 0.5);
  float tw = 0.5 + 0.5 * sin(uTime * 0.8 + seed * 6.2831);
  float fill = smoothstep(0.78, 1.0, tw);
  fill = max(fill, smoothstep(0.35, 0.0, length(id - m)) * (0.3 + uActive));

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.08, 0.0, abs(length(id - rc) - age * 0.45)) * exp(-age * 1.2);
  }

  float pattern = clamp(rim * 0.6 + fill + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "hex", kind: "simple", en: "Hex", ja: "ハニカム", frag: hexFrag },
  { id: "warp", kind: "simple", en: "Warp", ja: "ゆらぎ", frag: warpFrag },
  { id: "pulse", kind: "simple", en: "Pulse", ja: "脈動", frag: pulseFrag },
  { id: "flow", kind: "simple", en: "Flow", ja: "流れ", frag: flowFrag },
  { id: "bloom", kind: "simple", en: "Bloom", ja: "開花", frag: bloomFrag },
  { id: "ember", kind: "simple", en: "Ember", ja: "ともしび", frag: emberFrag },
];

/** Every id including the solid "off" option, in picker order. */
export const SHADER_IDS: ShaderId[] = ["off", ...SHADERS.map((s) => s.id)];

/** Default wallpaper used when nothing is stored yet. */
export const DEFAULT_SHADER: ShaderId = "hex";

/** Localised label for the "off" (solid background) option. */
export const OFF_LABEL = { en: "Off", ja: "オフ" } as const;

export function getShaderDef(id: ShaderId): ShaderDef | undefined {
  return SHADERS.find((s) => s.id === id);
}

export function isShaderId(value: string | null): value is ShaderId {
  return value != null && (SHADER_IDS as string[]).includes(value);
}
