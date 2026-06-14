// Interactive shader wallpaper.
//
// A single, abstract refractive cut-glass wallpaper rendered with WebGL2 in two
// passes on a fullscreen triangle (no geometry buffers, no dependencies):
//
//   Scene pass -> offscreen texture:
//     * a coloured bulb sits BEHIND the glass and eases toward the cursor;
//     * the glass is an inorganic emerald step-cut (a grid of cells, each a
//       concentric chamfered-rectangle step cut) whose per-facet normal BENDS
//       (refracts) the bulb light, so its outline kinks along the cut edges
//       like real cut crystal, and whose facets throw specular glints;
//     * scattered headlight streaks drift across the surface.
//     RGB = composited colour, A = "bright" peak channel (glints) for the flare.
//
//   Post pass -> screen:
//     * a camera cross/star flare grown from the bright peaks of the scene
//       (NOT the cursor) by streak-sampling the A channel along x/y;
//     * a sharp, grainy vintage record-jacket paper overlay computed at screen
//       pixels (crisp per-pixel grain + fibres + scratches + edge wear).
//
// Look parameters are uniforms (PARAM_DEFS) so they can be tuned live with the
// ?tune=1 slider panel and then hardcoded.
//
// Contrast: the glass composites through mix(baseBg, accent, amount*budget()),
// keeping functional text at WCAG AA (budget defaults: light 0.28 / dark 0.49,
// see scripts/contrast-budget.mjs). The flare and paper sit on top and are
// tunable; high values can dip below AA, so defaults stay modest.

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

export interface PostfxShaderDef extends ShaderMeta {
  kind: "postfx";
  /** Renders the scene into a full-resolution texture (rgb + bright alpha). */
  sceneFrag: string;
  /** Reads that texture, adds the flare + paper, draws to screen. */
  postFrag: string;
}

export type ShaderDef = SimpleShaderDef | FeedbackShaderDef | PostfxShaderDef;

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
  { key: "bulbInten", uniform: "uBulbInten", label: "Bulb intensity", min: 0, max: 1.5, step: 0.01, value: 0.85 },
  { key: "gridCount", uniform: "uGridCount", label: "Grid count", min: 1, max: 8, step: 1, value: 3 },
  { key: "cutSteps", uniform: "uCutSteps", label: "Cut steps", min: 2, max: 10, step: 1, value: 5 },
  { key: "refract", uniform: "uRefract", label: "Refraction bend", min: 0, max: 0.2, step: 0.005, value: 0.07 },
  { key: "facetTilt", uniform: "uFacetTilt", label: "Facet tilt", min: 0, max: 2, step: 0.02, value: 0.9 },
  { key: "shininess", uniform: "uShininess", label: "Glint sharpness", min: 2, max: 60, step: 1, value: 18 },
  { key: "glintInten", uniform: "uGlintInten", label: "Glint intensity", min: 0, max: 2, step: 0.02, value: 1.0 },
  { key: "edgeInten", uniform: "uEdgeInten", label: "Cut edges", min: 0, max: 1, step: 0.01, value: 0.5 },
  { key: "reflInten", uniform: "uReflInten", label: "Reflections", min: 0, max: 1, step: 0.01, value: 0.3 },
  { key: "flareInten", uniform: "uFlareInten", label: "Cross flare", min: 0, max: 1.5, step: 0.02, value: 0.5 },
  { key: "flareLen", uniform: "uFlareLen", label: "Flare length", min: 0.05, max: 0.8, step: 0.01, value: 0.25 },
  { key: "paperInten", uniform: "uPaperInten", label: "Paper / grain", min: 0, max: 1, step: 0.01, value: 0.5 },
  { key: "paperScale", uniform: "uPaperScale", label: "Paper scale", min: 0.2, max: 2, step: 0.05, value: 1.0 },
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
uniform float uRefract;
uniform float uFacetTilt;
uniform float uShininess;
uniform float uGlintInten;
uniform float uEdgeInten;
uniform float uReflInten;
uniform float uFlareInten;
uniform float uFlareLen;
uniform float uPaperInten;
uniform float uPaperScale;
uniform float uBudgetLight;
uniform float uBudgetDark;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
// Higher-quality hash (Dave Hoskins) for crisp, banding-free grain.
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

const sceneFrag = `${HEAD}
out vec4 fragColor;

// Emerald step-cut facet normal at p. Fills the cut-edge mask and cell id.
vec3 facetNormal(vec2 p, float ar, out float edge, out vec2 cellId){
  float cells = max(1.0, floor(uGridCount + 0.5));
  float csize = ar / cells;
  cellId = floor(p / csize);
  vec2 lc = fract(p / csize) - 0.5;
  vec2 al = abs(lc);
  float chamf = (al.x + al.y) * 0.72;
  float ed = max(max(al.x, al.y), chamf);
  float steps = max(2.0, floor(uCutSteps + 0.5));
  float si = floor(ed * steps * 2.0);
  vec2 outDir;
  if (chamf >= max(al.x, al.y)) outDir = normalize(sign(lc) + 1e-4);
  else if (al.x > al.y) outDir = vec2(sign(lc.x), 0.0);
  else outDir = vec2(0.0, sign(lc.y));
  float tilt = (ed < 0.12) ? 0.0 : uFacetTilt * (0.6 + 0.4 * mod(si, 2.0));
  vec3 N = normalize(vec3(outDir * tilt, 1.0));
  float ring = abs(fract(ed * steps * 2.0) - 0.5);
  edge = smoothstep(fwidth(ed * steps * 2.0) * 1.5 + 0.02, 0.0, ring);
  return N;
}

float bulbField(vec2 q, float ar){
  vec2 L = uLight * vec2(ar, 1.0);
  float d = length(q - L);
  float rad = max(uBulbRadius, 0.05);
  return exp(-d * d / (rad * rad));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 L = uLight * vec2(ar, 1.0);

  float edge;
  vec2 cellId;
  vec3 N = facetNormal(p, ar, edge, cellId);

  // Refract the bulb behind the glass through the facet (its outline bends).
  float lit = bulbField(p + N.xy * uRefract, ar) * uBulbInten;
  lit *= 0.9 + 0.1 * sin(uTime * 0.5);

  // Specular glint: facet reflecting a 3D light placed at the bulb.
  vec3 ld = normalize(vec3(L - p, 0.7));
  float spec = pow(max(dot(N, ld), 0.0), uShininess) * (0.25 + lit) * uGlintInten;

  // Scattered headlight streaks drifting across the surface.
  float refl = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 sc = vec2(hash21(vec2(fi, 1.0)) * ar, hash21(vec2(fi, 2.0)));
    float sa = hash21(vec2(fi, 3.0)) * 6.2831;
    vec2 dir = vec2(cos(sa), sin(sa));
    float spd = 0.05 + 0.08 * hash21(vec2(fi, 4.0));
    float al2 = fract(hash21(vec2(fi, 5.0)) + uTime * spd) * 2.4 - 1.2;
    vec2 rr = p - (sc + dir * al2);
    float uu = dot(rr, dir);
    float vv = dot(rr, vec2(-dir.y, dir.x));
    float env = clamp(sin(uTime * 0.3 + fi * 1.7), 0.0, 1.0);
    refl += exp(-vv * vv * 220.0) * exp(-uu * uu * 6.0) * env;
  }
  refl *= uReflInten;

  float hueCell = uHue + (hash21(cellId) - 0.5) * 140.0;
  vec2 hueVec = vec2(cos(radians(hueCell)), sin(radians(hueCell))) * (lit * 0.6 + spec)
              + vec2(cos(radians(uHue)), sin(radians(uHue))) * (edge * uEdgeInten + refl);
  float amt = clamp(lit * 0.6 + spec + edge * uEdgeInten + refl, 0.0, 1.0);
  float hue = degrees(atan(hueVec.y, hueVec.x));
  vec3 col = mix(baseBg(), accentAt(hue), amt * budget());

  float bright = clamp(spec * 1.3 + lit * 0.3, 0.0, 1.0);
  fragColor = vec4(col, bright);
}
`;

const postFrag = `${HEAD}
uniform sampler2D uScene;
out vec4 fragColor;

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec3 col = texture(uScene, uv).rgb;

  // Camera cross/star flare grown from the scene's bright peaks (alpha), not
  // the cursor: streak-sample the bright channel along x and y.
  float fl = 0.0;
  for (int i = 1; i <= 16; i++){
    float dist = float(i) / 16.0;
    float fall = exp(-dist * 5.0 / max(uFlareLen, 0.05)) / 16.0;
    float off = dist * uFlareLen;
    fl += (texture(uScene, uv + vec2(off, 0.0)).a + texture(uScene, uv - vec2(off, 0.0)).a
         + texture(uScene, uv + vec2(0.0, off)).a + texture(uScene, uv - vec2(0.0, off)).a) * fall;
  }
  fl *= uFlareInten;
  col = mix(col, mix(vec3(1.0), accentAt(uHue), 0.35), clamp(fl, 0.0, 1.0));

  // Sharp vintage record-jacket paper overlay (crisp, computed at screen px).
  vec2 fc = gl_FragCoord.xy * uPaperScale;
  float grain = mix(hash12(fc), hash12(floor(fc * 0.5)), 0.4) - 0.5;
  float fib = hash12(vec2(floor(fc.x * 0.2), floor(fc.y))) - 0.5;
  float scr = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float ang = hash12(vec2(fi, 7.0)) * 3.1416;
    vec2 dir = vec2(cos(ang), sin(ang));
    float off = (hash12(vec2(fi, 8.0)) - 0.5) * 1.6;
    float dd = abs(dot(uv * vec2(ar, 1.0) - vec2(0.5 * ar, 0.5), vec2(-dir.y, dir.x)) - off);
    scr -= step(dd, 0.0015) * (0.4 + 0.4 * hash12(vec2(fi, 9.0)));
  }
  float vig = smoothstep(1.15, 0.5, length((uv - 0.5) * vec2(ar, 1.0)));
  col *= 1.0 + (grain * 0.7 + fib * 0.3 + scr) * uPaperInten;
  col *= mix(1.0, 0.9, (1.0 - vig) * uPaperInten);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "glass", kind: "postfx", en: "Glass", ja: "磨りガラス", sceneFrag, postFrag },
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
