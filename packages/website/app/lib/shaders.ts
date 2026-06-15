// Interactive shader wallpapers.
//
// Rendered with WebGL2 in two passes on a fullscreen triangle (no geometry
// buffers, no dependencies). Each wallpaper is a "postfx" shader: a scene pass
// draws into a full-resolution texture (rgb = colour, alpha = bright peaks),
// then a shared post pass adds a camera cross/star flare grown from those
// bright peaks (not the cursor) and a sharp vintage record-jacket paper grain.
//
// Lineup:
//   * Glass  — refractive emerald cut crystal: facet normals bend a moving
//              light environment (cursor bulb + an autonomous hue-shifting
//              light + streaks) with chromatic dispersion and Fresnel edges.
//   * Bokeh  — drifting soft coloured light blobs.
//   * Aura   — one big soft light easing toward the cursor.
//   * Lamp   — two orbiting warm/cool lights.
//   * Haze   — a flowing blurred colour field with a cursor glow.
// The simple four are just "paper + blur + light".
//
// Look parameters are uniforms (PARAM_DEFS) tunable live with the ?tune=1
// slider panel. Contrast: scenes composite through mix(baseBg, accent,
// amount*budget()) to keep functional text at WCAG AA (budget defaults below);
// the flare/paper overlays are tunable and can dip below AA at high values.

export type ShaderId = "off" | "glass" | "bokeh" | "aura" | "lamp" | "haze";

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
  sceneFrag: string;
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
  { key: "bulbRadius", uniform: "uBulbRadius", label: "Bulb size", min: 0.1, max: 1.2, step: 0.01, value: 0.45 },
  { key: "bulbInten", uniform: "uBulbInten", label: "Bulb intensity", min: 0, max: 1.5, step: 0.01, value: 1.2 },
  { key: "autoMove", uniform: "uAutoMove", label: "Auto motion", min: 0, max: 1, step: 0.01, value: 0.3 },
  { key: "gridCount", uniform: "uGridCount", label: "Grid count", min: 1, max: 8, step: 1, value: 3 },
  { key: "cutSteps", uniform: "uCutSteps", label: "Cut steps", min: 2, max: 10, step: 1, value: 4 },
  { key: "refract", uniform: "uRefract", label: "Refraction bend", min: 0, max: 0.2, step: 0.005, value: 0.05 },
  { key: "facetTilt", uniform: "uFacetTilt", label: "Facet tilt", min: 0, max: 2, step: 0.02, value: 1.1 },
  { key: "disperse", uniform: "uDisperse", label: "Dispersion", min: 0, max: 0.05, step: 0.001, value: 0.022 },
  { key: "shininess", uniform: "uShininess", label: "Glint sharpness", min: 2, max: 60, step: 1, value: 11 },
  { key: "glintInten", uniform: "uGlintInten", label: "Glint intensity", min: 0, max: 2, step: 0.02, value: 1.04 },
  { key: "edgeInten", uniform: "uEdgeInten", label: "Cut edges", min: 0, max: 1, step: 0.01, value: 0.85 },
  { key: "reflInten", uniform: "uReflInten", label: "Reflections", min: 0, max: 1, step: 0.01, value: 0.84 },
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
uniform vec2  uMouse;
uniform vec2  uLight;
uniform vec2  uMouseVel;
uniform float uTheme;
uniform float uHue;
uniform float uActive;
uniform float uMotion;

uniform float uBulbRadius;
uniform float uBulbInten;
uniform float uAutoMove;
uniform float uGridCount;
uniform float uCutSteps;
uniform float uRefract;
uniform float uFacetTilt;
uniform float uDisperse;
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
vec2 dirHue(float deg){ return vec2(cos(radians(deg)), sin(radians(deg))); }
float blob(vec2 q, vec2 c, float rad){ float d = length(q - c); return exp(-d * d / max(rad * rad, 1e-4)); }
// A light disk with a defined (soft) edge — reads as a shaped light, and its
// outline bends visibly when refracted through the glass.
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
  // Flare uses the accent colour (not white) so it is visible on the near-white
  // light background too.
  col = mix(col, accentAt(uHue), clamp(fl, 0.0, 1.0));

  vec2 fc = gl_FragCoord.xy * uPaperScale;
  float grain = mix(hash12(fc), hash12(floor(fc * 0.5)), 0.4) - 0.5;
  float fib = hash12(vec2(floor(fc.x * 0.2), floor(fc.y))) - 0.5;
  // Sparse, short, faint scratches (not full-screen lines).
  float scr = 0.0;
  for (int i = 0; i < 2; i++){
    float fi = float(i);
    float ang = hash12(vec2(fi, 7.0)) * 3.1416;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 ctr = vec2(hash12(vec2(fi, 8.0)) * ar, hash12(vec2(fi, 10.0)));
    vec2 rel = uv * vec2(ar, 1.0) - ctr;
    float across = abs(dot(rel, vec2(-dir.y, dir.x)));
    float along = dot(rel, dir);
    scr -= step(across, 0.001) * smoothstep(0.35, 0.0, abs(along)) * 0.25;
  }
  float vig = smoothstep(1.15, 0.5, length((uv - 0.5) * vec2(ar, 1.0)));
  col *= 1.0 + (grain * 0.7 + fib * 0.3 + scr) * uPaperInten;
  col *= mix(1.0, 0.9, (1.0 - vig) * uPaperInten);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// --- Glass — refractive emerald cut crystal -------------------------------
const glassScene = `${HEAD}
out vec4 fragColor;

vec3 facetNormal(vec2 p, float ar, out float edge, out vec2 cellId){
  float cells = max(1.0, floor(uGridCount + 0.5));
  float csize = ar / cells;
  cellId = floor(p / csize);
  vec2 lc = fract(p / csize) - 0.5;
  vec2 al = abs(lc);
  float chamf = (al.x + al.y) * 0.72;
  float ed = max(max(al.x, al.y), chamf);
  float steps = max(2.0, floor(uCutSteps + 0.5));
  vec2 outDir;
  if (chamf >= max(al.x, al.y)) outDir = normalize(sign(lc) + 1e-4);
  else if (al.x > al.y) outDir = vec2(sign(lc.x), 0.0);
  else outDir = vec2(0.0, sign(lc.y));
  // Smooth concentric lensing tapered to ZERO at the cell edge, so the glass
  // refracts smoothly with no hard seam/grid lines.
  float ripple = sin(ed * steps * 6.2831);
  float taper = smoothstep(0.5, 0.18, ed);
  vec2 dirN = outDir * 0.6 + lc * 0.9;
  vec3 N = normalize(vec3(dirN * uFacetTilt * ripple * taper, 1.0));
  edge = 0.0;
  return N;
}

// Light environment behind the glass: bulb + autonomous light2.
float envLight(vec2 q, float ar, vec2 Lm, vec2 L2){
  float rad = max(uBulbRadius, 0.05);
  return lightDisk(q, Lm, rad) * uBulbInten + lightDisk(q, L2, rad * 0.8) * uBulbInten * 0.85;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);

  vec2 Lm = uLight * vec2(ar, 1.0) + vec2(sin(uTime * 0.21), cos(uTime * 0.17)) * uAutoMove * 0.25;
  vec2 L2 = vec2(0.5 + 0.33 * sin(uTime * 0.13), 0.5 + 0.27 * cos(uTime * 0.19)) * vec2(ar, 1.0);
  float hue2 = uHue + 110.0 + uTime * 18.0;

  float edge;
  vec2 cellId;
  vec3 N = facetNormal(p, ar, edge, cellId);
  vec2 rd = N.xy * uRefract;

  float rad = max(uBulbRadius, 0.05);
  float bm = lightDisk(p + rd, Lm, rad) * uBulbInten;
  float b2 = lightDisk(p + rd, L2, rad * 0.8) * uBulbInten * 0.85;

  // Streaks (moving headlights), accumulating colour.
  float st = 0.0;
  vec2 stHue = vec2(0.0);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 sc = vec2(hash21(vec2(fi, 1.0)) * ar, hash21(vec2(fi, 2.0)));
    float sa = hash21(vec2(fi, 3.0)) * 6.2831;
    vec2 dir = vec2(cos(sa), sin(sa));
    float spd = 0.05 + 0.08 * hash21(vec2(fi, 4.0));
    float al2 = fract(hash21(vec2(fi, 5.0)) + uTime * spd) * 2.4 - 1.2;
    vec2 rr = (p + rd) - (sc + dir * al2);
    float uu = dot(rr, dir);
    float vv = dot(rr, vec2(-dir.y, dir.x));
    float env = clamp(sin(uTime * 0.3 + fi * 1.7), 0.0, 1.0);
    float g = exp(-vv * vv * 220.0) * exp(-uu * uu * 6.0) * env * uReflInten;
    st += g;
    stHue += dirHue(hash21(vec2(fi, 6.0)) * 360.0) * g;
  }

  // Chromatic dispersion: total light amount at three channel offsets.
  float t0 = envLight(p + rd * (1.0 + uDisperse), ar, Lm, L2);
  float t1 = bm + b2 + st;
  float t2 = envLight(p + rd * (1.0 - uDisperse), ar, Lm, L2);

  // Specular glints toward the (moving) lights + Fresnel rim on grazing facets.
  float spec = pow(max(dot(N, normalize(vec3(Lm - p, 0.7))), 0.0), uShininess) * bm
             + pow(max(dot(N, normalize(vec3(L2 - p, 0.7))), 0.0), uShininess) * b2;
  spec *= uGlintInten;
  float fres = pow(1.0 - clamp(N.z, 0.0, 1.0), 2.0);

  // Show the cut structure mainly where light passes through (clean elsewhere).
  float litLocal = clamp(bm + b2, 0.0, 1.0);
  float edgeLit = edge * uEdgeInten * (0.2 + 0.8 * litLocal);
  float total = clamp(t1 * 0.9 + spec + edgeLit + fres * 0.3 * litLocal, 0.0, 1.0);
  vec2 hv = dirHue(uHue) * bm + dirHue(hue2) * b2 + stHue + dirHue(uHue) * (edgeLit + fres * 0.3 * litLocal);
  float hue = degrees(atan(hv.y, hv.x));
  vec3 col = mix(baseBg(), accentAt(hue), total * budget());
  col += vec3(t0 - t1, 0.0, t2 - t1) * (uDisperse * 8.0) * budget();

  // Bright PEAKS feed the cross flare — sharp glints + a concentrated light
  // core (not the whole broad disk, which would smear the flare).
  float bright = clamp(spec * 1.5 + fres * 0.4 + lightDisk(p, Lm, rad * 0.22) * 1.2, 0.0, 1.0);
  fragColor = vec4(clamp(col, 0.0, 1.0), bright);
}
`;

// --- Bokeh — drifting soft coloured light blobs ---------------------------
const bokehScene = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);

  float amt = 0.0;
  vec2 hv = vec2(0.0);
  float bright = 0.0;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float hh = hash21(vec2(fi, 1.0));
    float hh2 = hash21(vec2(fi, 5.0));
    vec2 c = vec2(0.5 + 0.46 * sin(uTime * (0.06 + 0.05 * hh) + fi * 1.7),
                  0.5 + 0.42 * cos(uTime * (0.05 + 0.04 * hh2) + fi * 2.3)) * vec2(ar, 1.0);
    float rad = max(uBulbRadius, 0.05) * (0.22 + 0.4 * hh);
    float d = length(p - c);
    float disc = smoothstep(rad, rad * 0.7, d);
    float rim = smoothstep(0.025, 0.0, abs(d - rad));
    float b = (disc * 0.55 + rim * 0.9) * uBulbInten * (0.5 + 0.5 * hh2);
    float hue = uHue + (hh - 0.5) * 220.0 + uTime * 8.0 * hh;
    amt += b;
    hv += dirHue(hue) * b;
    bright = max(bright, rim * uBulbInten);
  }
  amt = clamp(amt, 0.0, 1.0);
  vec3 col = mix(baseBg(), accentAt(degrees(atan(hv.y, hv.x))), amt * budget());
  fragColor = vec4(col, clamp(bright, 0.0, 1.0));
}
`;

// --- Aura — one big soft light easing toward the cursor -------------------
const auraScene = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);

  float t = uTime * 0.05;
  vec2 L = uLight * vec2(ar, 1.0) + vec2(sin(uTime * 0.13), cos(uTime * 0.11)) * uAutoMove * 0.3;
  vec2 q = p * 1.4;
  q += vec2(fbm(q + t), fbm(q + 9.0 - t)) * 0.6;
  // Aurora-like curtains living inside the glow give spatial variation.
  float bands = smoothstep(0.45, 0.95, 0.5 + 0.5 * sin(q.y * 3.0 + fbm(q * 1.5) * 4.0 + t * 2.0));
  float gl = lightDisk(p, L, max(uBulbRadius, 0.05) * 1.4);
  float amt = clamp(gl * (0.4 + 0.6 * bands), 0.0, 1.0);
  float hue = uHue + fbm(q) * 120.0 + uTime * 12.0;
  vec3 col = mix(baseBg(), accentAt(hue), amt * budget());
  fragColor = vec4(col, clamp(gl, 0.0, 1.0));
}
`;

// --- Lamp — two orbiting warm/cool lights ---------------------------------
const lampScene = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);

  vec2 c1 = vec2(0.3 * ar + 0.12 * sin(uTime * 0.16), 0.35 + 0.1 * cos(uTime * 0.16));
  c1 = mix(c1, uLight * vec2(ar, 1.0), 0.45);
  vec2 c2 = vec2(0.72 * ar + 0.12 * sin(uTime * 0.12 + 2.0), 0.7 + 0.1 * cos(uTime * 0.13 + 1.0));
  float rad = max(uBulbRadius, 0.05) * 1.1;
  float b1 = lightDisk(p, c1, rad);
  float b2 = lightDisk(p, c2, rad * 0.9);
  float hue2 = uHue + 150.0 + uTime * 8.0;

  float amt = clamp(b1 + b2, 0.0, 1.0);
  vec2 hv = dirHue(uHue) * b1 + dirHue(hue2) * b2;
  vec3 col = mix(baseBg(), accentAt(degrees(atan(hv.y, hv.x))), amt * budget());
  fragColor = vec4(col, clamp(max(b1, b2), 0.0, 1.0));
}
`;

// --- Haze — a flowing blurred colour field with a cursor glow -------------
const hazeScene = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);

  float t = uTime * 0.05;
  vec2 q = p * 1.6;
  q += vec2(fbm(q + t), fbm(q + 5.0 - t)) * 0.8;
  float n = fbm(q + vec2(0.0, t * 2.0));
  float band = smoothstep(0.4, 0.72, 0.5 + 0.5 * sin(n * 6.2831 + t * 3.0));

  vec2 L = uLight * vec2(ar, 1.0);
  float gl = lightDisk(p, L, max(uBulbRadius, 0.05) * 1.2);

  float amt = clamp(band * 0.6 + gl * 0.7, 0.0, 1.0);
  float hue = uHue + n * 140.0 + uTime * 10.0;
  vec3 col = mix(baseBg(), accentAt(hue), amt * budget());
  fragColor = vec4(col, clamp(gl + band * 0.4, 0.0, 1.0));
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "glass", kind: "postfx", en: "Glass", ja: "磨りガラス", sceneFrag: glassScene, postFrag: POST },
  { id: "bokeh", kind: "postfx", en: "Bokeh", ja: "ボケ", sceneFrag: bokehScene, postFrag: POST },
  { id: "aura", kind: "postfx", en: "Aura", ja: "オーラ", sceneFrag: auraScene, postFrag: POST },
  { id: "lamp", kind: "postfx", en: "Lamp", ja: "ランプ", sceneFrag: lampScene, postFrag: POST },
  { id: "haze", kind: "postfx", en: "Haze", ja: "もや", sceneFrag: hazeScene, postFrag: POST },
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
