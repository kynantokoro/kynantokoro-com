import { useRef, useState, useEffect } from 'react';

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
  const [hasStarted, setHasStarted] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  // Detect if mobile (screen width < 768px)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Map aspect ratio string to Tailwind class or custom style
  const getAspectClass = () => {
    switch (aspectRatio) {
      case "1/1":
      case "1:1":
        return "aspect-square";
      case "4/3":
      case "4:3":
        return "aspect-[4/3]";
      case "16/9":
      case "16:9":
      default:
        return "aspect-video";
    }
  };

  const handlePlay = async () => {
    setHasStarted(true);

    // Start loading iframe
    setIframeSrc(src);

    // On mobile: enter fullscreen first
    if (isMobile && containerRef.current && !document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error('Fullscreen error:', err);
      }
    }
  };

  const handleIframeLoad = () => {
    // Send message to iframe to start the game
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'START_GAME' }, '*');
    }
  };

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
      className={`relative w-full ${getAspectClass()} bg-gray-900 dark:bg-gray-950 rounded-lg overflow-hidden group ${className}`}
    >
      {iframeSrc && (
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={title}
          className="w-full h-full border-0 outline-none"
          allow="gamepad; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-modals"
          onLoad={handleIframeLoad}
        />
      )}

      {/* Fullscreen Button (hidden when in fullscreen, ESC key is enough) */}
      {!isFullscreen && (
        <button
          onClick={toggleFullscreen}
          tabIndex={-1}
          className="absolute top-4 right-4 bg-gray-800/80 hover:bg-gray-700/90 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity outline-none"
          aria-label="Enter fullscreen"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}

      {/* Play Overlay (click to start) */}
      {!hasStarted && (
        <div className="absolute inset-0 bg-gray-950 dark:bg-black/90 flex items-center justify-center z-50">
          <button
            onClick={handlePlay}
            className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold text-lg px-8 py-4 rounded-lg shadow-lg transform transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            {isMobile ? 'Play Fullscreen' : 'Play Game'}
          </button>
        </div>
      )}
    </div>
  );
}
