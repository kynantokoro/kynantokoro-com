import { useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/language-context';
import { useShader } from '../contexts/shader-context';
import { dominantHue } from '../lib/keyVisualColor';

interface HomeHeaderProps {
  hueRotate: number;
}

export default function HomeHeader({ hueRotate }: HomeHeaderProps) {
  const { language } = useLanguage();
  const { reveal } = useShader();
  const imgRef = useRef<HTMLImageElement>(null);

  // Echo the key visual's ACTUAL displayed colour in the shader wallpaper:
  // sample the GIF, replay its CSS filter (invert in light + hue-rotate) and use
  // the resulting hue. Recomputed when the theme flips (invert changes it).
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    let cancelled = false;
    const sample = () => {
      if (cancelled || !img.complete || img.naturalWidth === 0) return;
      try {
        const cv = document.createElement('canvas');
        cv.width = 32;
        cv.height = 42;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        const isDark = document.documentElement.classList.contains('dark');
        // Sample THROUGH the same CSS filter the page applies, so the pixels
        // are exactly what's shown; the dominant (chroma-weighted) hue then
        // matches the key visual's perceived colour.
        ctx.filter = isDark
          ? `hue-rotate(${hueRotate}deg)`
          : `invert(1) hue-rotate(${hueRotate}deg)`;
        ctx.drawImage(img, 0, 0, 32, 42);
        ctx.filter = 'none';
        const data = ctx.getImageData(0, 0, 32, 42).data;
        reveal(dominantHue(data, hueRotate));
      } catch {
        reveal(hueRotate); // canvas blocked — fall back to the raw hue
      }
    };
    if (img.complete) sample();
    else img.addEventListener('load', sample, { once: true });
    const obs = new MutationObserver(sample);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelled = true;
      img.removeEventListener('load', sample);
      obs.disconnect();
    };
  }, [hueRotate, reveal]);

  const profile = {
    en: {
      name: "Kynan Tokoro",
      description: "Building software, making music, hobby game dev. Works in Japanese and English. Based in Tokyo.",
    },
    ja: {
      name: "野老快南",
      description: "ソフトウェアと音楽をつくっています。たまにゲームもつくります。日本語と英語が使えます。東京在住。",
    }
  };

  const currentProfile = profile[language as keyof typeof profile];

  return (
    <section className="max-w-4xl mx-auto px-8 pb-16">
      <div className="flex flex-col sm:flex-row gap-6 sm:items-start">
        {/* Profile Image */}
        <div className="flex-shrink-0">
          <div className="w-36 h-48 overflow-hidden">
            <img
              ref={imgRef}
              src="/DSANIM1.gif"
              alt={currentProfile.name}
              className="w-full h-full object-cover light-mode-invert"
              style={{
                imageRendering: 'pixelated',
                // @ts-ignore - CSS variable for hue rotation
                '--hue-rotate': `${hueRotate}deg`,
              }}
            />
          </div>
        </div>

        {/* Profile Info */}
        <div className="flex-1 sm:pt-1">
          <h1 className="text-2xl font-serif font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {currentProfile.name}
          </h1>
          <p className="text-base font-serif text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {currentProfile.description}
          </p>

          {/* Social Links */}
          <div className="flex flex-wrap gap-4">
            <a
              href="https://instagram.com/kynantokoro"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-invert inline-flex items-center gap-2 text-sm font-serif text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                <path d="M12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span className="inline-flex items-center gap-1">
                Instagram
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </a>
            <a
              href="https://github.com/kynantokoro"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-invert inline-flex items-center gap-2 text-sm font-serif text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span className="inline-flex items-center gap-1">
                GitHub
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
