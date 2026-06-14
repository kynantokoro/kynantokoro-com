// Contrast budget calculator for the shader wallpaper.
//
// The wallpaper renders behind the page text. Its colour at any pixel is
//   compose(pattern, intensity) = mix(baseBg, accentCol(hue), pattern*intensity)
// We pick, per theme, the LARGEST compose intensity such that the worst-case
// background pixel (pattern = 1, over the worst accent hue) still meets WCAG
// AA (4.5:1) against the lightest *functional* text colour:
//   light mode -> gray-600 (#4b5563)   dark mode -> gray-300 (#d1d5db)
// In dark mode the site's secondary UI text is lifted to gray-300, which lets
// the wallpaper run brighter while keeping that text at AA. Decorative meta
// (dates & tags) is already below AA on the solid background, so it is
// reported but not used as the constraint.
//
// Run: node packages/website/scripts/contrast-budget.mjs

const TARGET = 4.5; // WCAG AA, normal text

// --- accent appearance (must match HEAD in app/lib/shaders.ts) -------------
const ACCENT = {
  light: { s: 0.5, v: 0.62 },
  dark: { s: 0.55, v: 0.66 },
};
const BASE = {
  light: [0.961, 0.965, 0.973],
  dark: [0.067, 0.094, 0.153],
};

// --- colour math -----------------------------------------------------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const relLum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

function hsv2rgb(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const accent = (theme, hueDeg) =>
  hsv2rgb(hueDeg / 360, ACCENT[theme].s, ACCENT[theme].v);
const compose = (theme, hueDeg, pattern, intensity) =>
  mix(BASE[theme], accent(theme, hueDeg), Math.min(1, pattern) * intensity);

const GRAYS = {
  "gray-900": "#111827",
  "gray-800": "#1f2937",
  "gray-700": "#374151",
  "gray-600": "#4b5563",
  "gray-500": "#6b7280",
  "gray-400": "#9ca3af",
  "gray-300": "#d1d5db",
  "gray-200": "#e5e7eb",
  "gray-100": "#f3f4f6",
};
const hexLum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return relLum([(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255));
};
const grayLum = Object.fromEntries(
  Object.entries(GRAYS).map(([k, v]) => [k, hexLum(v)]),
);

// Worst-case background luminance over all hues at pattern = 1.
function worstBgLum(theme, intensity) {
  let worst = theme === "light" ? Infinity : -Infinity;
  let worstHue = 0;
  for (let h = 0; h < 360; h++) {
    const L = relLum(compose(theme, h, 1, intensity));
    if (theme === "light" ? L < worst : L > worst) {
      worst = L;
      worstHue = h;
    }
  }
  return { lum: worst, hue: worstHue };
}

// Largest intensity keeping `textLum` at >= TARGET against the worst pixel.
function solveBudget(theme, textLum) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const { lum } = worstBgLum(theme, mid);
    if (contrast(textLum, lum) >= TARGET) lo = mid;
    else hi = mid;
  }
  return lo;
}

for (const theme of ["light", "dark"]) {
  const guardName = theme === "light" ? "gray-600" : "gray-300";
  const budget = solveBudget(theme, grayLum[guardName]);
  const { lum, hue } = worstBgLum(theme, budget);
  console.log(`\n=== ${theme.toUpperCase()} (guard: ${guardName}, target ${TARGET}:1) ===`);
  console.log(`  budget intensity = ${budget.toFixed(3)}  (worst hue ${hue}°, worst bg luminance ${lum.toFixed(4)})`);
  console.log(`  text contrast at the worst pixel:`);
  for (const [name, tl] of Object.entries(grayLum)) {
    const c = contrast(tl, lum);
    const flag = c >= TARGET ? "AA " : c >= 3 ? "AA-large" : "FAIL";
    console.log(`    ${name.padEnd(9)} ${c.toFixed(2)}:1  ${flag}`);
  }
}
