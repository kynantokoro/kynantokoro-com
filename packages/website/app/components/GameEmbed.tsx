interface GameEmbedProps {
  src: string;
  title?: string;
  className?: string;
}

export default function GameEmbed({ src, title = "Game", className = "" }: GameEmbedProps) {
  return (
    <div className={`w-full aspect-video bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      <iframe
        src={src}
        title={title}
        className="w-full h-full border-0"
        allow="gamepad; fullscreen"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
