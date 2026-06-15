// Work out the hue the home key-visual GIF actually displays, so the shader
// wallpaper can echo it. The GIF is shown with the CSS filter
//   light mode: invert(1) hue-rotate(Xdeg)
//   dark mode:  hue-rotate(Xdeg)
// so the same X produces very different colours per theme — sampling the GIF
// and replaying the filter in JS gives the real displayed hue.

export type RGB = [number, number, number]; // components 0..1

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** CSS/SVG feColorMatrix `hue-rotate(deg)`. */
export function cssHueRotate([r, g, b]: RGB, deg: number): RGB {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  return [
    clamp01(r * m[0] + g * m[1] + b * m[2]),
    clamp01(r * m[3] + g * m[4] + b * m[5]),
    clamp01(r * m[6] + g * m[7] + b * m[8]),
  ];
}

/** Hue (degrees, 0..360) of an RGB colour. */
export function rgbToHue([r, g, b]: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-4) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/**
 * Given the GIF's average raw colour, the per-load hue-rotate and the theme,
 * return the hue (deg) the key visual actually shows on screen.
 */
export function keyVisualHue(avg: RGB, hueRotateDeg: number, isDark: boolean): number {
  const base: RGB = isDark ? avg : [1 - avg[0], 1 - avg[1], 1 - avg[2]];
  return rgbToHue(cssHueRotate(base, hueRotateDeg));
}
