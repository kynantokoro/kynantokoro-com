// Interactive shader wallpaper — a single "Aura" light over vintage paper.
//
// Rendered with WebGL2 in two passes on a fullscreen triangle (no geometry
// buffers, no dependencies): a scene pass draws a soft, slowly drifting light
// with aurora-like structure into a texture (rgb = colour, alpha = bright
// peaks); a post pass adds a camera cross/star flare grown from those peaks and
// a sharp vintage record-jacket paper grain.
//
// The wallpaper is NON-interactive (it ignores the pointer) and self-limits its
// GPU cost: the renderer plays a short intro animation on load, then freezes
// the last frame and stops drawing entirely (see ShaderBackground). Each fresh
// landing differs because the home key-visual hue is randomised.
//
// Look parameters are uniforms with fixed defaults (PARAM_DEFS / DEFAULT_PARAMS).
// Contrast: the scene composites through mix(baseBg, accent,
// amount*budget()) to keep functional text at WCAG AA (budget defaults below);
// the flare/paper overlays are tunable and can dip below AA at high values.

export type ShaderId = "off" | "aura";

export interface ShaderMeta {
  id: Exclude<ShaderId, "off">;
  en: string;
  ja: string;
}

export interface PostfxShaderDef extends ShaderMeta {
  kind: "postfx";
  sceneFrag: string;
  postFrag: string;
}

/** Only the two-pass "aura" wallpaper exists, so a shader def is always postfx. */
export type ShaderDef = PostfxShaderDef;

/** Live-tunable look parameters. `uniform` is the GLSL uniform name. */
export interface ParamDef {
  key: string;
  uniform: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

// Look parameters fed to the shader as uniforms. Only `value` (via
// DEFAULT_PARAMS) and `uniform` are read at runtime; min/max/step/label
// document the intended ranges.
export const PARAM_DEFS: ParamDef[] = [
  { key: "bulbRadius", uniform: "uBulbRadius", label: "Light size", min: 0.1, max: 1.2, step: 0.01, value: 0.5 },
  { key: "bulbInten", uniform: "uBulbInten", label: "Light intensity", min: 0, max: 1.5, step: 0.01, value: 1.2 },
  { key: "autoMove", uniform: "uAutoMove", label: "Drift", min: 0, max: 1, step: 0.01, value: 0.35 },
  { key: "flareInten", uniform: "uFlareInten", label: "Cross flare", min: 0, max: 1.5, step: 0.02, value: 0.9 },
  { key: "flareLen", uniform: "uFlareLen", label: "Flare length", min: 0.05, max: 0.8, step: 0.01, value: 0.3 },
  { key: "paperInten", uniform: "uPaperInten", label: "Paper / grain", min: 0, max: 1, step: 0.01, value: 0.55 },
  { key: "paperScale", uniform: "uPaperScale", label: "Paper scale", min: 0.2, max: 2, step: 0.05, value: 0.75 },
  { key: "budgetLight", uniform: "uBudgetLight", label: "Budget (light)", min: 0.1, max: 0.5, step: 0.005, value: 0.24 },
  { key: "budgetDark", uniform: "uBudgetDark", label: "Budget (dark)", min: 0.1, max: 0.7, step: 0.005, value: 0.34 },
];

export const DEFAULT_PARAMS: Record<string, number> = Object.fromEntries(
  PARAM_DEFS.map((d) => [d.key, d.value]),
);

/** Shared GLSL preamble prepended to every fragment shader. */
const HEAD = `#version 300 es
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uLight;
uniform float uTheme;
uniform float uHue;
uniform float uIntro; // 0->1 over the intro, for the entrance bloom
uniform float uRest;  // 0->1 over the brake; settles the wallpaper for reading

uniform float uBulbRadius;
uniform float uBulbInten;
uniform float uAutoMove;
uniform float uFlareInten;
uniform float uFlareLen;
uniform float uPaperInten;
uniform float uPaperScale;
uniform float uBudgetLight;
uniform float uBudgetDark;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
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
vec3 baseBg(){ return mix(vec3(0.961, 0.965, 0.973), vec3(0.067, 0.094, 0.153), uTheme); }
vec3 accentAt(float hueDeg){
  float h = fract(hueDeg / 360.0);
  float s = mix(0.50, 0.80, uTheme);
  float v = mix(0.62, 0.66, uTheme);
  return hsv2rgb(vec3(h, s, v));
}
float budget(){ return mix(uBudgetLight, uBudgetDark, uTheme); }
float lightDisk(vec2 q, vec2 c, float rad){ return smoothstep(rad, rad * 0.55, length(q - c)); }
`;

/** Fullscreen-triangle vertex shader (no attributes; uses gl_VertexID). */
export const VERTEX_SRC = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Shared post pass: cross/star flare grown from the scene's bright peaks, then
// a sharp vintage record-jacket paper overlay.
const POST = `${HEAD}
uniform sampler2D uScene;
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec3 col = texture(uScene, uv).rgb;

  float fl = 0.0;
  for (int i = 1; i <= 10; i++){
    float dist = float(i) / 10.0;
    float fall = exp(-dist * 5.0 / max(uFlareLen, 0.05)) / 10.0;
    float off = dist * uFlareLen;
    fl += (texture(uScene, uv + vec2(off, 0.0)).a + texture(uScene, uv - vec2(off, 0.0)).a
         + texture(uScene, uv + vec2(0.0, off)).a + texture(uScene, uv - vec2(0.0, off)).a) * fall;
  }
  fl *= uFlareInten;
  col = mix(col, accentAt(uHue), clamp(fl, 0.0, 1.0));

  // As the wallpaper brakes to a stop, fade the light element fully out toward
  // the base background, so the resting state is just background + paper grain
  // (maximally legible — darker in dark mode, lighter in light mode).
  col = mix(col, baseBg(), uRest);

  vec2 fc = gl_FragCoord.xy * uPaperScale;
  float grain = mix(hash12(fc), hash12(floor(fc * 0.5)), 0.4) - 0.5;
  float fib = hash12(vec2(floor(fc.x * 0.2), floor(fc.y))) - 0.5;
  float vig = smoothstep(1.15, 0.5, length((uv - 0.5) * vec2(ar, 1.0)));
  // Multiplicative grain reads far stronger on the light (near-white) base than
  // on dark, so ease it down in light mode.
  float pInten = uPaperInten * mix(0.06, 1.0, uTheme);
  col *= 1.0 + (grain * 0.7 + fib * 0.3) * pInten;
  col *= mix(1.0, 0.9, (1.0 - vig) * pInten);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// --- Aura — a soft drifting light with aurora-like structure ---------------
const auraScene = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  float t = uTime * 0.12;

  // Entrance: the light blooms in over the first ~1.2s of the intro.
  float bloom = smoothstep(0.0, 0.24, uIntro);

  // Autonomous drift — larger & faster so the glow visibly travels.
  vec2 drift = vec2(sin(uTime * 0.5), cos(uTime * 0.42)) * uAutoMove * 0.5;
  vec2 L = vec2(0.5 * ar, 0.5) + drift;

  // Flowing aurora curtains (clearly moving, not just a slow hue shift).
  vec2 q = p * 1.4;
  q += vec2(fbm(q + t), fbm(q + 9.0 - t)) * 0.85;
  float bands = smoothstep(0.4, 0.95, 0.5 + 0.5 * sin(q.y * 3.0 + fbm(q * 1.5) * 5.0 + uTime * 1.1));

  float gl = lightDisk(p, L, max(uBulbRadius, 0.05) * 1.4) * uBulbInten * bloom;
  float amt = clamp(gl * (0.35 + 0.65 * bands), 0.0, 1.0);
  // Stay close to the key-visual hue (uHue): small spatial variation, no time
  // spin — so the wallpaper colour actually matches the key visual.
  float hue = uHue + (fbm(q) - 0.5) * 16.0;
  vec3 col = mix(baseBg(), accentAt(hue), amt * budget());
  fragColor = vec4(col, clamp(gl, 0.0, 1.0));
}
`;

/** The wallpaper(s) the renderer can draw. */
export const SHADERS: ShaderDef[] = [
  { id: "aura", kind: "postfx", en: "Aura", ja: "オーラ", sceneFrag: auraScene, postFrag: POST },
];

/** Default (and currently only) wallpaper. */
export const DEFAULT_SHADER: ShaderId = "aura";

export function getShaderDef(id: ShaderId): ShaderDef | undefined {
  return SHADERS.find((s) => s.id === id);
}
