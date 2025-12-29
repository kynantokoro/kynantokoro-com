import GameEmbed from '../GameEmbed';

type GameEmbedBlockProps = {
  value: {
    _key: string;
    gameSlug: string;
    title?: string;
    aspectRatio?: string;
  };
};

export default function GameEmbedBlock({ value }: GameEmbedBlockProps) {
  if (!value.gameSlug) return null;

  // Construct the full URL from the game slug
  const gameUrl = `/projects/${value.gameSlug}/`;

  return (
    <div className="my-8">
      <GameEmbed
        src={gameUrl}
        title={value.title || 'Game'}
        aspectRatio={value.aspectRatio}
      />
    </div>
  );
}
