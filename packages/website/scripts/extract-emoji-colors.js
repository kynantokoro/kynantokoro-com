import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get dominant color from image by sampling pixels
async function getDominantColor(imagePath) {
  try {
    const image = sharp(imagePath);
    const { data, info } = await image
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Count color frequencies
    const colorCounts = {};
    let maxCount = 0;
    let dominantColor = null;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip transparent or nearly transparent pixels
      if (a < 128) continue;

      // Round to nearest 16 to group similar colors
      const rRounded = Math.round(r / 16) * 16;
      const gRounded = Math.round(g / 16) * 16;
      const bRounded = Math.round(b / 16) * 16;

      const colorKey = `${rRounded},${gRounded},${bRounded}`;
      colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;

      if (colorCounts[colorKey] > maxCount) {
        maxCount = colorCounts[colorKey];
        dominantColor = { r: rRounded, g: gRounded, b: bRounded };
      }
    }

    if (!dominantColor) {
      // Fallback to gray if no opaque pixels found
      return { r: 200, g: 200, b: 200 };
    }

    return dominantColor;
  } catch (error) {
    console.error(`Error processing ${imagePath}:`, error);
    return { r: 200, g: 200, b: 200 }; // Fallback gray
  }
}

// Convert RGB to hex
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

async function extractColors() {
  const emojiDir = join(__dirname, '../public/emojis');
  const files = await readdir(emojiDir);

  const emojiFiles = files
    .filter(f => f.match(/^Emojis_32x32_(\d+)\.png$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

  console.log(`Processing ${emojiFiles.length} emoji images...`);

  const colorMap = {};

  for (const file of emojiFiles) {
    const match = file.match(/^Emojis_32x32_(\d+)\.png$/);
    if (!match) continue;

    const emojiNum = parseInt(match[1]);
    const imagePath = join(emojiDir, file);

    const color = await getDominantColor(imagePath);
    const hexColor = rgbToHex(color.r, color.g, color.b);

    colorMap[emojiNum] = hexColor;

    if (emojiNum % 50 === 0) {
      console.log(`Processed ${emojiNum}/${emojiFiles.length} emojis...`);
    }
  }

  // Generate TypeScript file
  const tsContent = `// Auto-generated emoji color mappings
// Generated on ${new Date().toISOString()}
// This file maps emoji numbers to their dominant colors

export const emojiColors: Record<number, string> = ${JSON.stringify(colorMap, null, 2)};

// Helper function to get emoji color with fallback
export function getEmojiColor(emojiNum: number): string {
  return emojiColors[emojiNum] || '#c8c8c8';
}
`;

  const outputPath = join(__dirname, '../app/lib/emojiColors.ts');
  await writeFile(outputPath, tsContent, 'utf-8');

  console.log(`\n✅ Color mapping saved to ${outputPath}`);
  console.log(`Processed ${Object.keys(colorMap).length} emojis`);
}

extractColors().catch(console.error);
