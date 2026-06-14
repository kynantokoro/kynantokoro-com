// Interactive shader wallpapers.
//
// Each wallpaper is a WebGL2 fragment shader rendered on a single fullscreen
// triangle (no geometry buffers, no external dependencies). They are designed
// to be SUBTLE: colours stay close to the page's base background luminance so
// text contrast is preserved in both light and dark mode. Every shader reacts
// to the pointer (and most to clicks). Persistence across page navigation is
// handled by the renderer, which lives in the always-mounted root layout.
//
// All shaders share a common GLSL preamble (`HEAD`) that exposes:
//   uResolution, uTime, uMouse (0..1, y-up), uMouseVel, uTheme (0 light / 1
//   dark), uHue (accent hue in degrees), uActive (recent pointer activity
//   0..1), uMotion (0 when prefers-reduced-motion, else 1)
// plus helpers: hash21/vnoise/fbm/flowField/hsv2rgb and the theming helpers
// baseBg()/accentCol()/compose().

export type ShaderId = "off" | "aurora" | "lava" | "ink" | "plasma" | "ripple";

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
// Low-saturation accent derived from the key-visual hue, kept dim enough to
// preserve text contrast in both themes.
vec3 accentCol(){
  float h = uHue / 360.0;
  float s = mix(0.28, 0.42, uTheme);
  float v = mix(0.80, 0.52, uTheme);
  return hsv2rgb(vec3(h, s, v));
}
// Blend a 0..1 pattern over the base background by a small intensity so the
// wallpaper never overpowers foreground text.
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

// 1. Aurora — slow domain-warped fBm ribbons that drift forever; the cursor
//    gently pushes the flow outward.
const auroraFrag = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.05;

  vec2 q = p;
  q += 0.22 * vec2(fbm(p * 1.4 + t), fbm(p * 1.4 + 5.2 - t));

  vec2 dir = p - m;
  float dm = length(dir);
  q += 0.18 * normalize(dir + 1e-4) * exp(-dm * 2.2) * (0.4 + 0.9 * uActive);

  float n = fbm(q * 2.1 + vec2(0.0, t * 1.5));
  float ribbon = 0.5 + 0.5 * sin(6.2831 * n + t * 2.0);
  float pattern = pow(ribbon, 1.6);

  float inten = mix(0.16, 0.42, uTheme);
  fragColor = vec4(compose(pattern, inten), 1.0);
}
`;

// 2. Lava — soft floating metaballs; one blob tracks the cursor.
const lavaFrag = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  float t = uTime * 0.16;

  float field = 0.0;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    vec2 c = vec2(0.5 * ar + 0.34 * ar * sin(t * 0.7 + fi * 1.7),
                  0.5 + 0.33 * cos(t * 0.9 + fi * 2.3));
    float r = 0.11 + 0.03 * sin(t + fi * 1.3);
    vec2 dd = p - c;
    field += r * r / (dot(dd, dd) + 1e-3);
  }

  vec2 mm = uMouse * vec2(ar, 1.0);
  vec2 md = p - mm;
  field += (0.016 + 0.02 * uActive) / (dot(md, md) + 1e-3);

  float pattern = smoothstep(0.7, 1.5, field);
  float inten = mix(0.14, 0.38, uTheme);
  fragColor = vec4(compose(pattern, inten), 1.0);
}
`;

// 3. Plasma — gentle interfering sine waves; one wave centre follows the
//    cursor and brightens while moving.
const plasmaFrag = `${HEAD}
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);
  float t = uTime * 0.22;

  float v = 0.0;
  v += sin(p.x * 3.0 + t);
  v += sin(p.y * 3.6 + t * 0.8);
  v += sin((p.x + p.y) * 2.4 + t * 1.1);
  v += sin(length(p - m) * 6.0 - t * 2.0) * (0.5 + 0.9 * uActive);

  float pattern = 0.5 + 0.5 * sin(v * 1.5708);
  float inten = mix(0.12, 0.34, uTheme);
  fragColor = vec4(compose(pattern, inten), 1.0);
}
`;

// 5. Ripple — a futuristic dot grid with parallax toward the cursor and
//    expanding ripples that emanate from clicks (state lives in JS uniforms).
const rippleFrag = `${HEAD}
uniform vec2  uRipplePos[8];
uniform float uRippleAge[8];
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(ar, 1.0);
  vec2 m = uMouse * vec2(ar, 1.0);

  vec2 shift = (m - vec2(0.5 * ar, 0.5)) * 0.025;
  vec2 gp = (p + shift) * 16.0;
  vec2 gi = fract(gp) - 0.5;
  float dots = smoothstep(0.16, 0.05, length(gi));

  float rip = 0.0;
  for (int i = 0; i < 8; i++){
    float age = uRippleAge[i];
    if (age < 0.0) continue;
    vec2 rc = uRipplePos[i] * vec2(ar, 1.0);
    float d = length(p - rc);
    rip += sin(d * 20.0 - age * 7.0) * exp(-d * 3.0) * exp(-age * 1.3);
  }
  float ripN = clamp(0.5 + 0.5 * rip, 0.0, 1.0);

  float pattern = dots * (0.35 + 0.65 * ripN) + 0.45 * clamp(rip, 0.0, 1.0);
  float inten = mix(0.15, 0.40, uTheme);
  fragColor = vec4(compose(clamp(pattern, 0.0, 1.0), inten), 1.0);
}
`;

// 4. Ink — a true feedback fluid. The simulation pass advects, diffuses and
//    decays a dye field stored in a texture; the pointer injects dye and
//    clicks splash it. Because the renderer keeps the state textures alive
//    across navigation, the ink is never reset between pages.
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
  float inten = mix(0.20, 0.44, uTheme);
  fragColor = vec4(compose(pattern, inten), 1.0);
}
`;

/** Selectable wallpapers (excludes the "off" / solid option). */
export const SHADERS: ShaderDef[] = [
  { id: "aurora", kind: "simple", en: "Aurora", ja: "オーロラ", frag: auroraFrag },
  { id: "ink", kind: "feedback", en: "Ink", ja: "インク", simFrag: inkSimFrag, showFrag: inkShowFrag },
  { id: "lava", kind: "simple", en: "Lava", ja: "ラヴァ", frag: lavaFrag },
  { id: "plasma", kind: "simple", en: "Plasma", ja: "プラズマ", frag: plasmaFrag },
  { id: "ripple", kind: "simple", en: "Ripple", ja: "リップル", frag: rippleFrag },
];

/** Every id including the solid "off" option, in picker order. */
export const SHADER_IDS: ShaderId[] = ["off", ...SHADERS.map((s) => s.id)];

/** Default wallpaper used when nothing is stored yet. */
export const DEFAULT_SHADER: ShaderId = "aurora";

/** Localised label for the "off" (solid background) option. */
export const OFF_LABEL = { en: "Off", ja: "オフ" } as const;

export function getShaderDef(id: ShaderId): ShaderDef | undefined {
  return SHADERS.find((s) => s.id === id);
}

export function isShaderId(value: string | null): value is ShaderId {
  return value != null && (SHADER_IDS as string[]).includes(value);
}
