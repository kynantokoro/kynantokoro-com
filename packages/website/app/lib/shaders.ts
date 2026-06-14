// Interactive shader wallpapers.
//
// Each wallpaper is a WebGL2 fragment shader rendered on a single fullscreen
// triangle (no geometry buffers, no external dependencies). Every shader
// reacts to the pointer and to clicks. Persistence across page navigation is
// handled by the renderer, which lives in the always-mounted root layout.
//
// The lineup is a family of organic, cellular wallpapers built around the
// honeycomb: a clean hex lattice plus four organic variations (a warped
// "molten" honeycomb, irregular Voronoi cells, a vein/crack network and soft
// foam bubbles).
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
// plus helpers: hash21/vnoise/fbm/flowField/hsv2rgb and the theming helpers
// baseBg()/accentCol()/compose()/budget().

export type ShaderId = "off" | "hex" | "warp" | "cells" | "veins" | "froth";

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
// Thin glowing rims; cells near the cursor light up and clicks send a
// brightening ring through the lattice.
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
  vec2 gp = p * scale;

  vec2 r = vec2(1.0, 1.7320508);
  vec2 hh = r * 0.5;
  vec2 a = mod(gp, r) - hh;
  vec2 b = mod(gp - hh, r) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = (gp - gv) / scale;

  float hd = hexDist(gv);
  float aa = fwidth(hd) * 1.2;
  float border = smoothstep(0.5 - 0.015 - aa, 0.5 - 0.015, hd);

  float hi = exp(-length(id - m) * 3.5) * (0.3 + 0.8 * uActive);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.08, 0.0, abs(length(id - rc) - age * 0.45)) * exp(-age * 1.2);
  }

  float pattern = clamp(border + hi * 0.55 + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Warp — a molten honeycomb --------------------------------------------
// The same hex lattice but its coordinates are domain-warped by drifting
// noise so the comb flows and melts; the cursor adds a local swirl.
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
  vec2 gp = wp * scale;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 hh = r * 0.5;
  vec2 a = mod(gp, r) - hh;
  vec2 b = mod(gp - hh, r) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;

  float hd = hexDist(gv);
  float aa = fwidth(hd) * 1.2;
  float border = smoothstep(0.5 - 0.02 - aa, 0.5 - 0.02, hd);

  float burst = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    burst += smoothstep(0.07, 0.0, abs(length(p - rc) - age * 0.5)) * exp(-age * 1.2);
  }

  float pattern = clamp(border + burst, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Cells — irregular Voronoi membranes ----------------------------------
// Drifting cell points form an organic membrane network; the cursor repels
// nearby points and clicks send a pulse outward.
const cellsFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.06;
  float scale = 5.0;
  vec2 g = p * scale;
  vec2 gi = floor(g);
  vec2 gf = fract(g);

  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 fp = vec2(hash21(gi + o), hash21(gi + o + 3.7));
      vec2 pt = o + 0.5 + 0.45 * sin(t + 6.2831 * fp);
      vec2 away = (gi + pt) / scale - m;
      pt += normalize(away + 1e-4) * exp(-dot(away, away) * 5.0) * (0.05 + 0.2 * uActive) * scale;
      vec2 rr = pt - gf;
      float d = dot(rr, rr);
      if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float net = smoothstep(0.03, 0.0, edge);

  float pulse = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    pulse += exp(-length(p - rc) * 2.2) * exp(-age * 1.5) * 0.6;
  }

  float pattern = clamp(net + pulse, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Veins — an organic vein / crack network ------------------------------
// Voronoi edges on a heavily noise-warped field read like leaf veins or
// dried cracks; the cursor bends the field locally and clicks brighten.
const veinsFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.04;

  vec2 wp = p + 0.18 * vec2(fbm(p * 2.2 + t), fbm(p * 2.2 + 7.3 - t));
  wp += 0.12 * normalize(p - m + 1e-4) * exp(-length(p - m) * 2.5) * (0.3 + uActive);

  float scale = 4.5;
  vec2 g = wp * scale;
  vec2 gi = floor(g);
  vec2 gf = fract(g);

  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 fp = vec2(hash21(gi + o), hash21(gi + o + 3.7));
      vec2 pt = o + 0.5 + 0.8 * (fp - 0.5);
      vec2 rr = pt - gf;
      float d = dot(rr, rr);
      if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float veins = smoothstep(0.022, 0.0, edge);

  float glow = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    glow += veins * exp(-length(p - rc) * 2.0) * exp(-age * 1.2);
  }

  float pattern = clamp(veins * 0.9 + glow, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

// --- Froth — soft foam bubbles --------------------------------------------
// Each Voronoi cell hosts a softly breathing bubble with a bright rim;
// bubbles swell toward the cursor and clicks pop a pulse.
const frothFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.08;
  float scale = 6.0;
  vec2 g = p * scale;
  vec2 gi = floor(g);
  vec2 gf = fract(g);

  float d1 = 8.0;
  vec2 nearPt = vec2(0.0);
  vec2 nearCell = vec2(0.0);
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 fp = vec2(hash21(gi + o), hash21(gi + o + 3.7));
      vec2 pt = o + 0.5 + 0.35 * sin(t * 0.8 + 6.2831 * fp);
      vec2 rr = pt - gf;
      float d = dot(rr, rr);
      if (d < d1){ d1 = d; nearPt = (gi + pt) / scale; nearCell = gi + o; }
    }
  }
  float r1 = sqrt(d1);
  float ch = hash21(nearCell);
  float radius = 0.34 + 0.05 * sin(t + ch * 6.2831);
  radius += 0.10 * exp(-length(nearPt - m) * 3.0) * (0.3 + uActive);
  float rim = smoothstep(0.025, 0.0, abs(r1 - radius));
  float fill = smoothstep(radius, radius - 0.05, r1) * 0.16;

  float pulse = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    pulse += smoothstep(0.06, 0.0, abs(length(p - rc) - age * 0.5)) * exp(-age * 1.2);
  }

  float pattern = clamp(rim * 0.95 + fill + pulse, 0.0, 1.0);
  fragColor = vec4(compose(pattern, budget()), 1.0);
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "hex", kind: "simple", en: "Hex", ja: "ハニカム", frag: hexFrag },
  { id: "warp", kind: "simple", en: "Warp", ja: "ゆらぎ", frag: warpFrag },
  { id: "cells", kind: "simple", en: "Cells", ja: "セル", frag: cellsFrag },
  { id: "veins", kind: "simple", en: "Veins", ja: "葉脈", frag: veinsFrag },
  { id: "froth", kind: "simple", en: "Froth", ja: "泡", frag: frothFrag },
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
