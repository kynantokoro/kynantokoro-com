import { useRef, useState, useEffect } from 'react';
import { z } from 'zod';

// Schema for app.json validation
const AppMetadataSchema = z.object({
  title: z.string().optional(),
  resolution: z.object({
    width: z.number(),
    height: z.number(),
    aspectRatio: z.string()
  })
});

type AppMetadata = z.infer<typeof AppMetadataSchema>;

interface GameEmbedProps {
  src: string;
  title?: string;
  aspectRatio?: string;
  className?: string;
}

export default function GameEmbed({ src, title = "Game", aspectRatio = "16/9", className = "" }: GameEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [computedAspectRatio, setComputedAspectRatio] = useState(aspectRatio);

  // Detect touch device on mount
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Fetch app.json to get dynamic aspect ratio
  useEffect(() => {
    const fetchAppMetadata = async () => {
      try {
        const appJsonUrl = `${src}/app.json`;
        const response = await fetch(appJsonUrl);
        if (response.ok) {
          const data = await response.json();
          // Validate with Zod schema
          const result = AppMetadataSchema.safeParse(data);
          if (result.success) {
            setComputedAspectRatio(result.data.resolution.aspectRatio);
          } else {
            console.warn('Invalid app.json schema:', result.error);
          }
        }
      } catch (error) {
        // Silently fail and use default aspectRatio
        console.warn('Failed to fetch app.json, using default aspect ratio:', error);
      }
    };

    fetchAppMetadata();
  }, [src]);


  const toggleFullscreen = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!containerRef.current) return;

    // Blur the button immediately to prevent it from keeping focus
    e.currentTarget.blur();

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // Listen for fullscreen changes (e.g., user pressing ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);

      // When entering fullscreen, focus the canvas inside the iframe
      if (isNowFullscreen && iframeRef.current) {
        const focusCanvas = () => {
          try {
            const iframeDoc = iframeRef.current?.contentWindow?.document;
            const canvas = iframeDoc?.getElementById('canvas') as HTMLCanvasElement;
            if (canvas) {
              canvas.focus();
            }
          } catch (err) {
            console.error('Failed to focus canvas:', err);
          }
        };

        // Wait for next animation frame to ensure fullscreen transition is rendered
        requestAnimationFrame(focusCanvas);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ aspectRatio: computedAspectRatio }}
      className={`relative w-full bg-gray-900 dark:bg-gray-950 rounded-lg overflow-hidden group ${className}`}
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="w-full h-full border-0 outline-none"
        allow="gamepad; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-modals"
      />

      {/* Fullscreen Button (always visible on touch devices, hover on desktop) */}
      {!isFullscreen && (
        <button
          onClick={toggleFullscreen}
          tabIndex={-1}
          className={`absolute top-4 right-4 bg-gray-800/80 hover:bg-gray-700/90 text-white p-2 rounded-lg transition-opacity outline-none ${
            isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Enter fullscreen"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}
    </div>
  );
}
