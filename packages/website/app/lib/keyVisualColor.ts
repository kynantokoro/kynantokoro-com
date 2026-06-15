// Work out the hue the home key-visual GIF actually displays, so the shader
// wallpaper can echo it. Callers sample the GIF through a canvas with the SAME
// CSS filter the page uses (ctx.filter = "invert(1) hue-rotate(Xdeg)" in light,
// "hue-rotate(Xdeg)" in dark), then pass the pixels here. We take a
// chroma-weighted circular mean so the prominent colours decide the hue rather
// than a muddy flat average.

export type RGB = [number, number, number]; // components 0..1

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
 * Dominant hue (deg) of RGBA pixel data: a circular mean of each opaque,
 * non-grey pixel's hue, weighted by its chroma (so saturated pixels lead).
 * `fallback` is returned when there is no meaningful colour.
 */
export function dominantHue(data: Uint8ClampedArray | number[], fallback = 210): number {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 0.04) continue;
    const h = (rgbToHue([r, g, b]) * Math.PI) / 180;
    sx += Math.cos(h) * chroma;
    sy += Math.sin(h) * chroma;
  }
  if (sx === 0 && sy === 0) return fallback;
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
}
