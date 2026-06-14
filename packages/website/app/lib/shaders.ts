// Interactive shader wallpaper.
//
// A single, abstract wallpaper rendered as a WebGL2 fragment shader on a
// fullscreen triangle (no geometry buffers, no dependencies). Layered scene:
//   1. a coloured bulb behind the glass that eases toward the cursor,
//   2. an inorganic emerald-cut glass grid whose step facets glint toward the
//      light (a grid of ~square cells, each a concentric chamfered-rectangle
//      step cut),
//   3. scattered headlight streaks drifting across the surface,
//   4. a camera cross/star flare in front of the glass, from the bright light,
//   5. a worn vintage record-jacket paper overlay (fibre grain, scratches,
//      foxing, edge wear).
//
// Many look parameters are driven by uniforms so they can be tuned live with
// the ?tune=1 slider panel (see ShaderTunePanel) and then hardcoded into
// PARAM_DEFS below.
//
// Contrast: the glass layers (1-3 + frost) fold into one amount and a single
// mix(baseBg, accent, amount*budget()), so functional text stays at WCAG AA
// (budget defaults: light 0.28 / dark 0.49 — see scripts/contrast-budget.mjs).
// The flare and paper overlays sit on top and are tunable; large values can
// dip below AA, so keep them modest.
//
// Shared GLSL preamble (`HEAD`) exposes: uResolution, uTime, uMouse (0..1,
// y-up), uLight (eased cursor follower), uTheme, uHue, uActive, uMotion, the
// tunable uP_* uniforms, plus hash21/vnoise/fbm/hsv2rgb and baseBg()/
// accentAt()/accentCol()/budget()/compose().

export type ShaderId = "off" | "glass";

export interface ShaderMeta {
  id: Exclude<ShaderId, "off">;
  en: string;
  ja: string;
}

export interface SimpleShaderDef extends ShaderMeta {
  kind: "simple";
  frag: string;
}

export interface FeedbackShaderDef extends ShaderMeta {
  kind: "feedback";
  simFrag: string;
  showFrag: string;
}

export type ShaderDef = SimpleShaderDef | FeedbackShaderDef;

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

export const PARAM_DEFS: ParamDef[] = [
  { key: "bulbRadius", uniform: "uBulbRadius", label: "Bulb size", min: 0.1, max: 1.2, step: 0.01, value: 0.5 },
  { key: "bulbInten", uniform: "uBulbInten", label: "Bulb intensity", min: 0, max: 1.5, step: 0.01, value: 0.6 },
  { key: "gridCount", uniform: "uGridCount", label: "Grid count", min: 1, max: 8, step: 1, value: 3 },
  { key: "cutSteps", uniform: "uCutSteps", label: "Cut steps", min: 2, max: 12, step: 1, value: 5 },
  { key: "cutInten", uniform: "uCutInten", label: "Cut intensity", min: 0, max: 1, step: 0.01, value: 0.5 },
  { key: "glintInten", uniform: "uGlintInten", label: "Glint", min: 0, max: 1.5, step: 0.01, value: 0.8 },
  { key: "frost", uniform: "uFrost", label: "Frost", min: 0, max: 1, step: 0.01, value: 0.5 },
  { key: "reflInten", uniform: "uReflInten", label: "Reflections", min: 0, max: 1, step: 0.01, value: 0.4 },
  { key: "flareInten", uniform: "uFlareInten", label: "Cross flare", min: 0, max: 1, step: 0.01, value: 0.25 },
  { key: "flareLen", uniform: "uFlareLen", label: "Flare length", min: 0.1, max: 3, step: 0.01, value: 1.0 },
  { key: "paperInten", uniform: "uPaperInten", label: "Paper / grain", min: 0, max: 1, step: 0.01, value: 0.4 },
  { key: "paperScale", uniform: "uPaperScale", label: "Paper scale", min: 2, max: 40, step: 0.5, value: 10 },
  { key: "budgetLight", uniform: "uBudgetLight", label: "Budget (light)", min: 0.1, max: 0.5, step: 0.005, value: 0.28 },
  { key: "budgetDark", uniform: "uBudgetDark", label: "Budget (dark)", min: 0.1, max: 0.7, step: 0.005, value: 0.49 },
];

export const DEFAULT_PARAMS: Record<string, number> = Object.fromEntries(
  PARAM_DEFS.map((d) => [d.key, d.value]),
);

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

uniform float uBulbRadius;
uniform float uBulbInten;
uniform float uGridCount;
uniform float uCutSteps;
uniform float uCutInten;
uniform float uGlintInten;
uniform float uFrost;
uniform float uReflInten;
uniform float uFlareInten;
uniform float uFlareLen;
uniform float uPaperInten;
uniform float uPaperScale;
uniform float uBudgetLight;
uniform float uBudgetDark;

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
vec3 baseBg(){ return mix(vec3(0.961, 0.965, 0.973), vec3(0.067, 0.094, 0.153), uTheme); }
vec3 accentAt(float hueDeg){
  float h = fract(hueDeg / 360.0);
  float s = mix(0.50, 0.55, uTheme);
  float v = mix(0.62, 0.66, uTheme);
  return hsv2rgb(vec3(h, s, v));
}
vec3 accentCol(){ return accentAt(uHue); }
float budget(){ return mix(uBudgetLight, uBudgetDark, uTheme); }
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

const glassFrag = `${HEAD}
out vec4 fragColor;

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 L = uLight * vec2(ar, 1.0);

  vec2 hueVec = vec2(0.0);
  float total = 0.0;

  // 1) Bulb behind frosted glass — soft, follows the cursor.
  float rough = max(uBulbRadius * (0.8 + 0.2 * fbm(p * 3.0 + 5.0)), 0.02);
  float bulb = 0.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) * 2.39996323;
    float r = sqrt((float(i) + 0.5) / 8.0) * (0.03 + 0.06 * uFrost);
    float d = length(p + vec2(cos(a), sin(a)) * r - L);
    bulb += exp(-d * d / (rough * rough));
  }
  bulb = bulb / 8.0 * (0.85 + 0.15 * sin(uTime * 0.5)) * uBulbInten;
  total += bulb;
  hueVec += vec2(cos(radians(uHue)), sin(radians(uHue))) * bulb;

  // 2) Emerald-cut glass grid (fixed, inorganic). A grid of square cells; each
  //    is a concentric chamfered-rectangle step cut whose facets glint toward
  //    the light, so highlights travel across the cuts as the bulb moves.
  float cells = max(1.0, floor(uGridCount + 0.5));
  float csize = ar / cells;
  vec2 cid = floor(p / csize);
  vec2 lc = fract(p / csize) - 0.5;
  vec2 al = abs(lc);
  float ed = max(max(al.x, al.y), (al.x + al.y) * 0.72);
  float phase = ed * max(1.0, uCutSteps) * 2.0;
  float ring = abs(fract(phase) - 0.5);
  float aaR = fwidth(phase) * 1.2 + 0.03;
  float cut = smoothstep(aaR, 0.0, ring) * uCutInten;
  vec2 cc = (cid + 0.5) * csize;
  vec2 toL = normalize(L - cc + 1e-4);
  vec2 fn = (al.x > al.y) ? vec2(sign(lc.x), 0.0) : vec2(0.0, sign(lc.y));
  float onStep = smoothstep(0.18, 0.0, ring);
  float glint = pow(max(dot(fn, toL), 0.0), 3.0) * onStep * exp(-length(L - cc) * 0.7) * uGlintInten;
  float hueCut = uHue + (hash21(cid) - 0.5) * 120.0;
  float wcut = cut + glint;
  total += wcut;
  hueVec += vec2(cos(radians(hueCut)), sin(radians(hueCut))) * wcut;

  // 3) Scattered headlight streaks (random pos/angle/hue), drifting.
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 sc = vec2(hash21(vec2(fi, 1.0)) * ar, hash21(vec2(fi, 2.0)));
    float sa = hash21(vec2(fi, 3.0)) * 6.2831;
    vec2 dir = vec2(cos(sa), sin(sa));
    float spd = 0.05 + 0.08 * hash21(vec2(fi, 4.0));
    float along = fract(hash21(vec2(fi, 5.0)) + uTime * spd) * 2.4 - 1.2;
    vec2 ctr = sc + dir * along;
    vec2 rr = p - ctr;
    float u = dot(rr, dir);
    float vv = dot(rr, vec2(-dir.y, dir.x));
    float env = clamp(sin(uTime * 0.3 + fi * 1.7), 0.0, 1.0);
    float g = exp(-vv * vv * 220.0) * exp(-u * u * 6.0) * env * uReflInten;
    float hue = hash21(vec2(fi, 6.0)) * 360.0;
    total += g;
    hueVec += vec2(cos(radians(hue)), sin(radians(hue))) * g;
  }

  // Subtle frosted ambient (folded into the budget).
  vec2 wq = p + 0.4 * vec2(fbm(p * 1.3 + 4.0), fbm(p * 1.3 + 8.0));
  float frost = uFrost * 0.15 * smoothstep(0.3, 0.75, fbm(wq * 6.0));
  total += frost;
  hueVec += vec2(cos(radians(uHue)), sin(radians(uHue))) * frost;

  total = clamp(total, 0.0, 1.0);
  float hue = degrees(atan(hueVec.y, hueVec.x));
  vec3 col = mix(baseBg(), accentAt(hue), total * budget());

  // 4) Camera cross/star flare in FRONT of the glass, from the bright light.
  vec2 fd = p - L;
  float fall = 1.0 / max(uFlareLen, 0.05);
  float cross = exp(-fd.y * fd.y * 700.0) * exp(-abs(fd.x) * fall)
              + exp(-fd.x * fd.x * 700.0) * exp(-abs(fd.y) * fall);
  float flare = (cross + exp(-dot(fd, fd) * 70.0)) * uFlareInten;
  col = mix(col, mix(vec3(1.0), accentAt(uHue), 0.4), clamp(flare, 0.0, 1.0));

  // 5) Vintage record-jacket paper overlay: fibre grain + scratches + foxing +
  //    edge wear. Modulates the final colour (tunable; keep modest for text).
  float fib = fbm(p * uPaperScale * vec2(1.0, 0.25) + 12.0)
            + fbm(p * uPaperScale * vec2(0.25, 1.0) + 30.0);
  float grain = fib - 1.0; // ~ -0.5..0.5
  float scr = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float ang = hash21(vec2(fi, 7.0)) * 3.1416;
    vec2 dir = vec2(cos(ang), sin(ang));
    float off = (hash21(vec2(fi, 8.0)) - 0.5) * 1.6;
    float dist = abs(dot(p - vec2(0.5 * ar, 0.5), vec2(-dir.y, dir.x)) - off);
    scr -= smoothstep(0.004, 0.0, dist) * (0.5 + 0.4 * hash21(vec2(fi, 9.0)));
  }
  float fox = smoothstep(0.62, 0.95, fbm(p * 3.0 + 50.0));
  float vig = smoothstep(1.15, 0.45, length((uv - 0.5) * vec2(ar, 1.0)));
  col *= 1.0 + (grain * 0.5 + scr) * uPaperInten;
  col = mix(col, baseBg() * mix(1.0, 0.85, uTheme), fox * uPaperInten * 0.25);
  col *= mix(1.0, 0.9, (1.0 - vig) * uPaperInten);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
