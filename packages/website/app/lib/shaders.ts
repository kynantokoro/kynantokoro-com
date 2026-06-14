// Interactive shader wallpaper.
//
// A single, abstract "cut glass" wallpaper rendered as a WebGL2 fragment
// shader on a fullscreen triangle (no geometry buffers, no dependencies).
// Concept: a soft coloured bulb sits behind vintage glass and eases toward the
// cursor; the glass itself is faceted like Edo Kiriko cut crystal, so its
// facets glint and refract the light in many directions, with a partial
// kaleidoscopic fold near the light. Across the surface, scattered streaks
// drift past in varied hues — a closed shop window catching the headlights of
// passing cars at night. Coordinates are domain-warped so nothing looks like a
// repeated lattice. Persistence across navigation is handled by the renderer
// in the always-mounted root layout.
//
// Contrast budget: the wallpaper composes its glow over the page background
// with a *measured* intensity (budget()) — the largest value that keeps the
// lightest functional text at WCAG AA (4.5:1) against the worst-case pixel,
// per theme. See scripts/contrast-budget.mjs (guards: light gray-600, dark
// gray-300; limits 0.288 / 0.495, applied as 0.28 / 0.49). All contributions
// fold into a single 0..1 amount and one mix(baseBg, accent, amount*budget),
// so any per-facet hue stays AA-safe.
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

// --- Glass — Edo-Kiriko cut glass over a wandering bulb --------------------
const glassFrag = `${HEAD}
out vec4 fragColor;

// Animated Voronoi facet field. Returns: x = edge distance (F2-F1),
// y = nearest-cell random, zw = nearest facet point (in the input space).
vec4 facetField(vec2 x){
  vec2 g = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 bestCell = g;
  vec2 bestPt = g + 0.5;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 cell = g + o;
      vec2 jit = vec2(hash21(cell), hash21(cell + 3.7));
      vec2 pt = o + jit; // static facet point — the glass cut pattern is fixed
      vec2 rr = pt - f;
      float d = dot(rr, rr);
      if (d < d1){ d2 = d1; d1 = d; bestCell = cell; bestPt = g + pt; }
      else if (d < d2){ d2 = d; }
    }
  }
  return vec4(sqrt(d2) - sqrt(d1), hash21(bestCell), bestPt);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 L = uLight * vec2(ar, 1.0);

  // The glass itself is a FIXED texture: a static organic warp so the facets
  // never read as a repeated lattice, and a kaleidoscope folded around the
  // screen centre (not the cursor) so the cut pattern never moves.
  vec2 wp = p + 0.28 * vec2(fbm(p * 1.1 + 2.0), fbm(p * 1.1 + 9.0));
  vec2 kc = vec2(0.5 * ar, 0.5);
  vec2 rel = wp - kc;
  float rlen = length(rel);
  float ang = atan(rel.y, rel.x);
  float seg = 6.2831 / 10.0;
  float fold = abs(mod(ang, seg) - 0.5 * seg);
  vec2 kq = kc + vec2(cos(fold), sin(fold)) * rlen;
  vec2 gp = mix(wp, kq, smoothstep(1.1, 0.15, rlen));

  // Weighted circular hue accumulator + total amount.
  vec2 hueVec = vec2(0.0);
  float total = 0.0;

  // Soft frosted bulb behind the glass (small golden-angle blur).
  float rough = 0.05 + 0.08 * fbm(p * 3.0 + 5.0);
  float bulb = 0.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) * 2.39996323;
    float radius = sqrt((float(i) + 0.5) / 8.0) * rough;
    float d = length(p + vec2(cos(a), sin(a)) * radius - L);
    bulb += exp(-d * d * 2.3);
  }
  bulb = bulb / 8.0 * (0.85 + 0.15 * sin(uTime * 0.5));
  float wb = bulb * 0.55;
  total += wb;
  hueVec += vec2(cos(radians(uHue)), sin(radians(uHue))) * wb;

  // Cut-glass facets at two scales: rims + specular glints toward the light,
  // each facet taking its own hue for prismatic colour.
  for (int s = 0; s < 2; s++){
    float scale = (s == 0) ? 3.0 : 6.5;
    vec4 F = facetField(gp * scale + float(s) * 11.0);
    vec2 fc = F.zw / scale;
    float rnd = F.y;
    float rim = smoothstep(0.05, 0.0, F.x);
    vec2 n = vec2(cos(rnd * 6.2831), sin(rnd * 6.2831));
    vec2 toL = normalize(L - fc + 1e-4);
    float spec = pow(max(dot(n, toL), 0.0), 6.0) * exp(-length(L - fc) * 0.9);
    float w = spec * (s == 0 ? 0.9 : 0.6) + rim * (s == 0 ? 0.20 : 0.14);
    float hue = uHue + (rnd - 0.5) * 150.0;
    total += w;
    hueVec += vec2(cos(radians(hue)), sin(radians(hue))) * w;
  }

  // Scattered surface streaks (passing headlights): random pos/angle/hue.
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 c = vec2(hash21(vec2(fi, 1.0)) * ar, hash21(vec2(fi, 2.0)));
    float sa = hash21(vec2(fi, 3.0)) * 6.2831;
    vec2 dir = vec2(cos(sa), sin(sa));
    float spd = 0.05 + 0.08 * hash21(vec2(fi, 4.0));
    float along = fract(hash21(vec2(fi, 5.0)) + uTime * spd) * 2.4 - 1.2;
    vec2 center = c + dir * along;
    vec2 rr = p - center;
    float u = dot(rr, dir);
    float vv = dot(rr, vec2(-dir.y, dir.x));
    float env = clamp(sin(uTime * 0.3 + fi * 1.7), 0.0, 1.0);
    float g = exp(-vv * vv * 220.0) * exp(-u * u * 6.0) * env;
    float hue = hash21(vec2(fi, 6.0)) * 360.0;
    total += g;
    hueVec += vec2(cos(radians(hue)), sin(radians(hue))) * g;
  }

  // Frosted ground-glass grain: a FIXED texture (organic clumps + fine
  // speckle) plus an ambient frost layer, so the whole pane reads as frosted
  // even away from the light. Modulates the amount only (keeps the budget).
  float gClump = fbm(p * 14.0);
  float gFine = hash21(floor(gl_FragCoord.xy));
  float grainN = clamp(gClump * 0.55 + gFine * 0.45, 0.0, 1.0);
  float frost = 0.16 * grainN;
  total += frost;
  hueVec += vec2(cos(radians(uHue)), sin(radians(uHue))) * frost;
  total = clamp(total * (0.5 + 1.0 * grainN), 0.0, 1.0);

  float hue = degrees(atan(hueVec.y, hueVec.x));
  vec3 acc = accentAt(hue);
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
