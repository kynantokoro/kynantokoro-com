
// Seeded random generator (決定的な乱数生成)
function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface ImageParams {
  frame: number;
  rotation: number;
  width: number;
  height: number;
  posX: number;
  posY: number;
  hue: number;
}

function generateImageParams(seed: number, containerSize: number): ImageParams {
  const frame = seed % 15; // 0-14 (15フレーム)

  // Rotation (回転) - 志向性あり
  const rotRand = seededRandom(seed, 1);
  let rotation: number;
  if (rotRand < 0.5) {
    // 50%: 90度の4パターン (0°, 90°, 180°, 270°)
    const variant = Math.floor(seededRandom(seed, 2) * 4);
    rotation = variant * 90;
  } else if (rotRand < 0.75) {
    // 25%: 45度の4パターン (45°, 135°, 225°, 315°)
    const variant = Math.floor(seededRandom(seed, 3) * 4);
    rotation = variant * 90 + 45;
  } else {
    // 25%: ランダム角度
    rotation = Math.floor(seededRandom(seed, 4) * 360);
  }

  // Size (表示サイズ) - 192x256のアスペクト比を保って倍率で拡大
  const baseWidth = 192;
  const baseHeight = 256;

  const scaleRand = seededRandom(seed, 5);
  let baseScale: number;
  if (scaleRand < 0.5) {
    baseScale = 2; // 50%: 2倍 (384x512px at 80px container)
  } else if (scaleRand < 0.75) {
    baseScale = 1.5; // 25%: 1.5倍 (288x384px at 80px container)
  } else {
    baseScale = 2.5; // 25%: 2.5倍 (480x640px at 80px container)
  }

  // コンテナサイズに応じてズーム（80pxを基準に、大きいコンテナは拡大）
  const baseContainerSize = 80;
  const zoomFactor = containerSize / baseContainerSize;
  const scale = baseScale * zoomFactor;

  const width = baseWidth * scale;
  const height = baseHeight * scale;

  // Position (位置) - 回転を考慮して画像を中心に配置
  // 回転後のバウンディングボックスを計算
  const radians = (rotation * Math.PI) / 180;
  const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));

  // 回転後の画像を中心に配置するための基本オフセット
  const centerOffsetX = (containerSize - rotatedWidth) / 2;
  const centerOffsetY = (containerSize - rotatedHeight) / 2;

  // 90度の倍数の時だけランダムに動かす、それ以外は中心固定
  let randomOffsetX = 0;
  let randomOffsetY = 0;
  if (rotation % 90 === 0) {
    // 90度の倍数は少し動かせる
    const maxVariation = 20; // 最大20pxの変動
    randomOffsetX = (seededRandom(seed, 6) * 2 - 1) * maxVariation;
    randomOffsetY = (seededRandom(seed, 7) * 2 - 1) * maxVariation;
  }

  const posX = centerOffsetX + randomOffsetX;
  const posY = centerOffsetY + randomOffsetY;

  // Hue shift (色相)
  const hue = Math.floor(seededRandom(seed, 8) * 360);

  return { frame, rotation, width, height, posX, posY, hue };
}

interface GeneratedKeyImageProps {
  seed: number;
  className?: string;
  containerSize?: number; // コンテナのサイズ（px）
}

export default function GeneratedKeyImage({ seed, className = "", containerSize = 128 }: GeneratedKeyImageProps) {
  const params = generateImageParams(seed, containerSize);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        src={`/dsanim-frames/frame_${params.frame.toString().padStart(2, '0')}.png`}
        alt=""
        className="light-mode-invert"
        style={{
          width: `${params.width.toFixed(2)}px`,
          height: `${params.height.toFixed(2)}px`,
          maxWidth: 'none',
          transform: `translate(${params.posX.toFixed(2)}px, ${params.posY.toFixed(2)}px) rotate(${params.rotation}deg)`,
          // @ts-ignore - CSS variable for hue rotation
          '--hue-rotate': `${params.hue}deg`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
