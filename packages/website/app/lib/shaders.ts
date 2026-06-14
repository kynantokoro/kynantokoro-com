// Interactive shader wallpaper.
//
// A single, abstract "frosted glass" wallpaper rendered as a WebGL2 fragment
// shader on a fullscreen triangle (no geometry buffers, no dependencies).
// Concept: a soft coloured bulb sits behind vintage ground glass and eases
// toward the cursor; a multi-tap blur scatters it into a frosted glow. On the
// glass surface, occasional streaks slide past — like a closed shop window
// catching the headlights of passing cars at night. Persistence across page
// navigation is handled by the renderer in the always-mounted root layout.
//
// Contrast budget: the wallpaper composes its glow over the page background
// with a *measured* intensity (budget()) — the largest value that keeps the
// lightest functional text at WCAG AA (4.5:1) against the worst-case pixel,
// per theme. See scripts/contrast-budget.mjs (guards: light gray-600, dark
// gray-300; limits 0.288 / 0.495, applied as 0.28 / 0.49).
//
// Shared GLSL preamble (`HEAD`) exposes: uResolution, uTime, uMouse (0..1,
// y-up), uLight (eased cursor follower, 0..1), uMouseVel, uTheme (0 light / 1
// dark), uHue (accent hue degrees), uActive (pointer activity 0..1), uMotion
// (0 when prefers-reduced-motion) plus hash21/vnoise/fbm/hsv2rgb and the
// theming helpers baseBg()/accentAt()/accentCol()/budget()/compose().

export type ShaderId = "off" | "glass";

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
uniform vec2  uLight;
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
// Base page background. Light: near-white (~gray-50). Dark: tailwind gray-900.
vec3 baseBg(){ return mix(vec3(0.961, 0.965, 0.973), vec3(0.067, 0.094, 0.153), uTheme); }
// Accent for a given hue, at the theme's fixed saturation/value (so any hue is
// covered by the worst-hue contrast budget).
vec3 accentAt(float hueDeg){
  float h = fract(hueDeg / 360.0);
  float s = mix(0.50, 0.55, uTheme);
  float v = mix(0.62, 0.66, uTheme);
  return hsv2rgb(vec3(h, s, v));
}
vec3 accentCol(){ return accentAt(uHue); }
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

// --- Glass — frosted vintage glass over a wandering bulb -------------------
const glassFrag = `${HEAD}
out vec4 fragColor;

// Soft bulb glow centred on the (eased) light position.
float bulbAt(vec2 q, vec2 L){
  float d = length(q - L);
  return exp(-d * d * 2.5);
}

// Occasional headlight-style streaks sliding across the glass surface.
float streaksAt(vec2 q, float ar){
  float s = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float y0 = 0.2 + 0.6 * hash21(vec2(fi, 1.0));
    float spd = 0.05 + 0.06 * hash21(vec2(fi, 2.0));
    float dir = hash21(vec2(fi, 3.0)) > 0.5 ? 1.0 : -1.0;
    float xc = fract(hash21(vec2(fi, 4.0)) + dir * uTime * spd) * ar;
    float dy = q.y - y0;
    float dx = q.x - xc;
    float env = clamp(sin(uTime * 0.25 + fi * 2.1), 0.0, 1.0);
    s += exp(-dy * dy * 260.0) * exp(-dx * dx * 7.0) * env;
  }
  return s;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 L = uLight * vec2(ar, 1.0);

  // Frosted blur: average the bulb over a golden-angle disk whose radius is
  // perturbed by glass-roughness noise, plus a low-frequency refractive warp.
  float rough = 0.05 + 0.10 * fbm(p * 3.0 + 5.0);
  vec2 warp = (vec2(fbm(p * 4.0 + 1.0), fbm(p * 4.0 + 9.0)) - 0.5) * 0.06;
  float bulb = 0.0;
  for (int i = 0; i < 12; i++){
    float a = float(i) * 2.39996323;
    float rad = sqrt((float(i) + 0.5) / 12.0) * rough;
    bulb += bulbAt(p + vec2(cos(a), sin(a)) * rad + warp, L);
  }
  bulb /= 12.0;
  bulb *= 0.85 + 0.15 * sin(uTime * 0.5); // gentle breathing

  // Surface reflections sit in front of the glass, so blur them far less.
  float refl = streaksAt(p + warp * 0.4, ar);

  // Uneven glass thickness + fine ground-glass grain modulate the amount only
  // (never the final luminance), so the contrast budget still holds.
  float mottle = 0.65 + 0.35 * fbm(p * 2.0 + 3.0);
  float grain = 0.9 + 0.2 * hash21(floor(gl_FragCoord.xy));

  float bulbI = bulb * mottle * 1.3;
  float reflI = refl * 0.7;
  float total = clamp((bulbI + reflI) * grain, 0.0, 1.0);

  // Bulb keys off the key-visual hue; reflections take a shifted hue.
  vec3 acc = mix(accentAt(uHue), accentAt(uHue + 35.0), clamp(reflI / max(bulbI + reflI, 1e-3), 0.0, 1.0));
  vec3 col = mix(baseBg(), acc, total * budget());
  fragColor = vec4(col, 1.0);
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "glass", kind: "simple", en: "Glass", ja: "磨りガラス", frag: glassFrag },
];

/** Every id including the solid "off" option, in picker order. */
export const SHADER_IDS: ShaderId[] = ["off", ...SHADERS.map((s) => s.id)];

/** Default wallpaper used when nothing is stored yet. */
export const DEFAULT_SHADER: ShaderId = "glass";

/** Localised label for the "off" (solid background) option. */
export const OFF_LABEL = { en: "Off", ja: "オフ" } as const;

export function getShaderDef(id: ShaderId): ShaderDef | undefined {
  return SHADERS.find((s) => s.id === id);
}

export function isShaderId(value: string | null): value is ShaderId {
  return value != null && (SHADER_IDS as string[]).includes(value);
}
